const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', '.idea', '.vscode', 'coverage', '.cache'
]);

const canonicalize = async (inputPath) => {
  const resolved = path.resolve(String(inputPath || '').trim());
  return fsp.realpath(resolved);
};

const repositoryId = (repositoryPath) =>
  crypto.createHash('sha1').update(repositoryPath).digest('hex').slice(0, 16);

const repositoryRecord = (repositoryPath) => ({
  id: repositoryId(repositoryPath),
  name: path.basename(repositoryPath),
  path: repositoryPath,
  enabled: true,
  lastCollectedAt: null,
  lastHead: null
});

const hasGitDirectory = (directory) => {
  try {
    return fs.statSync(path.join(directory, '.git')).isDirectory();
  } catch {
    return false;
  }
};

const discoverRepositories = async (rootPath, { maxDepth = 4 } = {}) => {
  const root = await canonicalize(rootPath);
  const results = [];
  const visit = async (directory, depth) => {
    if (depth > maxDepth || hasGitDirectory(directory)) {
      if (hasGitDirectory(directory)) results.push(repositoryRecord(directory));
      return;
    }
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRECTORIES.has(entry.name)) continue;
      await visit(path.join(directory, entry.name), depth + 1);
    }
  };
  await visit(root, 0);
  return results.sort((a, b) => a.path.localeCompare(b.path));
};

const validateRepository = async (inputPath) => {
  let current = await canonicalize(inputPath);
  let previous = '';
  while (current && current !== previous) {
    if (hasGitDirectory(current)) return repositoryRecord(current);
    previous = current;
    current = path.dirname(current);
  }
  const error = new Error('Path is not inside a Git repository');
  error.code = 'NOT_GIT_REPOSITORY';
  throw error;
};

const normalizePersisted = (value) => ({
  version: 1,
  repositories: Array.isArray(value?.repositories) ? value.repositories : []
});

const createRegistryStore = ({ read, write }) => {
  const load = async () => normalizePersisted(await read());
  const list = async () => (await load()).repositories;
  const save = async (repositories) => write({ version: 1, repositories });

  const add = async (inputPath) => {
    const candidate = await validateRepository(inputPath);
    const state = await load();
    const existing = state.repositories.find((item) => item.id === candidate.id);
    if (existing) return existing;
    state.repositories.push(candidate);
    await save(state.repositories);
    return candidate;
  };

  const importRoot = async (rootPath, options) => {
    const discovered = await discoverRepositories(rootPath, options);
    const added = [];
    for (const candidate of discovered) added.push(await add(candidate.path));
    return added;
  };

  const setEnabled = async (id, enabled) => {
    const state = await load();
    const item = state.repositories.find((repository) => repository.id === id);
    if (!item) throw Object.assign(new Error('Repository not found'), { code: 'REPOSITORY_NOT_FOUND' });
    item.enabled = enabled !== false;
    await save(state.repositories);
    return item;
  };

  const remove = async (id) => {
    const state = await load();
    const next = state.repositories.filter((repository) => repository.id !== id);
    await save(next);
    return next.length !== state.repositories.length;
  };

  return { list, add, importRoot, setEnabled, remove };
};

module.exports = { discoverRepositories, validateRepository, createRegistryStore, repositoryId };
