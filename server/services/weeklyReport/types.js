const asText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
};

const asNonNegativeInteger = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

const uniqueTexts = (values) => {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => asText(value)).filter(Boolean))];
};

const normalizeRepository = (input = {}) => ({
  id: asText(input.id),
  name: asText(input.name) || asText(input.path).split(/[\\/]/).filter(Boolean).pop() || 'repository',
  path: asText(input.path).replace(/[\\/]+$/, ''),
  enabled: input.enabled !== false,
  lastCollectedAt: input.lastCollectedAt ? asText(input.lastCollectedAt) : null,
  lastHead: input.lastHead ? asText(input.lastHead) : null
});

const normalizeIdentity = (input = {}) => ({
  name: asText(input.name),
  emails: uniqueTexts(input.emails)
});

const normalizeCommit = (input = {}) => ({
  repositoryId: asText(input.repositoryId),
  hash: asText(input.hash),
  authorName: asText(input.authorName),
  authorEmail: asText(input.authorEmail),
  authoredAt: asText(input.authoredAt),
  subject: asText(input.subject),
  body: asText(input.body),
  branch: asText(input.branch),
  files: uniqueTexts(input.files),
  insertions: asNonNegativeInteger(input.insertions),
  deletions: asNonNegativeInteger(input.deletions),
  patch: asText(input.patch)
});

const normalizeActivityError = (input = {}) => ({
  repositoryId: asText(input.repositoryId),
  errorCode: asText(input.errorCode) || 'COLLECT_FAILED',
  message: asText(input.message) || 'Git activity collection failed'
});

const normalizeActivityResult = (input = {}) => ({
  commits: Array.isArray(input.commits) ? input.commits.map(normalizeCommit) : [],
  errors: Array.isArray(input.errors) ? input.errors.map(normalizeActivityError) : []
});

module.exports = {
  normalizeRepository,
  normalizeIdentity,
  normalizeCommit,
  normalizeActivityError,
  normalizeActivityResult
};
