const createActivityCache = ({ read, write }) => {
  const load = async () => {
    const value = await read();
    return value && typeof value === 'object' && value.version === 1 ? value : { version: 1, repositories: {} };
  };
  const save = async (state) => write({ version: 1, repositories: state.repositories || {} });
  return {
    async get(repositoryId, head) {
      const state = await load();
      const entry = state.repositories[repositoryId];
      return entry && entry.head === head && Array.isArray(entry.commits) ? entry.commits : null;
    },
    async set(repositoryId, head, commits) {
      const state = await load();
      state.repositories[repositoryId] = { head: String(head || ''), commits: Array.isArray(commits) ? commits : [] };
      await save(state);
    },
    async invalidate(repositoryId) {
      const state = await load();
      delete state.repositories[repositoryId];
      await save(state);
    }
  };
};

const collectWithCache = async ({ repositories = [], cache, collectRepository }) => {
  const commits = [];
  const errors = [];
  for (const repository of repositories) {
    if (repository.enabled === false) continue;
    try {
      const cached = await cache.get(repository.id, repository.head);
      const result = cached ? { commits: cached, errors: [] } : await collectRepository(repository);
      if (!cached) await cache.set(repository.id, repository.head, result.commits);
      commits.push(...result.commits);
      errors.push(...(result.errors || []));
    } catch (error) {
      errors.push({ repositoryId: repository.id, errorCode: error.code || 'COLLECT_FAILED', message: error.message });
    }
  }
  return { commits, errors };
};

module.exports = { createActivityCache, collectWithCache };
