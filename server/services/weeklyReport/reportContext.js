const commitForContext = (commit) => ({
  hash: String(commit.hash || '').slice(0, 7),
  authorName: String(commit.authorName || ''),
  authoredAt: String(commit.authoredAt || ''),
  subject: String(commit.subject || ''),
  body: String(commit.body || '').slice(0, 500),
  files: Array.isArray(commit.files) ? commit.files.slice(0, 30) : [],
  insertions: Number(commit.insertions) || 0,
  deletions: Number(commit.deletions) || 0
});

const buildCandidate = (commits, errors, truncated) => {
  const grouped = new Map();
  for (const commit of commits) {
    const name = String(commit.repositoryName || commit.repositoryId || 'repository');
    const item = grouped.get(name) || { name, commits: [] };
    item.commits.push(commitForContext(commit));
    grouped.set(name, item);
  }
  return { version: 1, repositories: [...grouped.values()], errors: errors || [], truncated: !!truncated };
};

const buildReportContext = (activity = {}, limits = {}) => {
  const maxCharacters = Math.max(300, Number(limits.maxCharacters) || 24000);
  const source = Array.isArray(activity.commits) ? activity.commits : [];
  const errors = Array.isArray(activity.errors) ? activity.errors : [];
  let count = source.length;
  let result = buildCandidate(source.slice(0, count), errors, count < source.length);
  while (count > 0 && JSON.stringify(result).length > maxCharacters) {
    count -= 1;
    result = buildCandidate(source.slice(0, count), errors, true);
  }
  if (JSON.stringify(result).length > maxCharacters) {
    result = buildCandidate([], errors, true);
  }
  return result;
};

module.exports = { buildReportContext };
