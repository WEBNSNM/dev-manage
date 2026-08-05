const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { normalizeCommit, normalizeActivityResult } = require('./types');

const execFileAsync = promisify(execFile);
const FIELD = '\x1f';
const RECORD = '\x1e';

const runGit = async (cwd, args) => {
  const result = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    encoding: 'utf8'
  });
  return result.stdout;
};

const parseRecords = (output) => output
  .split(RECORD)
  .map((record) => record.trim())
  .filter(Boolean)
  .map((record) => record.split(FIELD));

const parseNumstat = (output) => {
  const files = [];
  let insertions = 0;
  let deletions = 0;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) continue;
    insertions += match[1] === '-' ? 0 : Number(match[1]);
    deletions += match[2] === '-' ? 0 : Number(match[2]);
    files.push(match[3]);
  }
  return { files, insertions, deletions };
};

const parseAuthorRecords = (output) => {
  const authors = new Map();
  for (const fields of parseRecords(output)) {
    const name = String(fields[0] || '').trim();
    const email = String(fields[1] || '').trim();
    if (!name) continue;
    const item = authors.get(name) || { name, emails: [] };
    if (email && !item.emails.includes(email)) item.emails.push(email);
    authors.set(name, item);
  }
  return [...authors.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const discoverAuthors = async (repositories, { months = 12 } = {}) => {
  const since = new Date();
  since.setMonth(since.getMonth() - Math.max(1, Number(months) || 12));
  const result = new Map();
  for (const repository of repositories || []) {
    try {
      const configuredName = (await runGit(repository.path, ['config', '--get', 'user.name'])).trim();
      const configuredEmail = (await runGit(repository.path, ['config', '--get', 'user.email'])).trim();
      if (configuredName) {
        const item = result.get(configuredName) || { name: configuredName, emails: [] };
        if (configuredEmail && !item.emails.includes(configuredEmail)) item.emails.push(configuredEmail);
        result.set(configuredName, item);
      }
      const output = await runGit(repository.path, [
        'log', `--since=${since.toISOString()}`, `--format=%an${FIELD}%ae${RECORD}`
      ]);
      for (const author of parseAuthorRecords(output)) {
        const item = result.get(author.name) || { name: author.name, emails: [] };
        item.emails = [...new Set([...item.emails, ...author.emails])];
        result.set(author.name, item);
      }
    } catch {
      // A repository can be unreadable while other repositories still yield candidates.
    }
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const validateDates = (startDate, endDate) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) {
    throw Object.assign(new Error('Dates must use YYYY-MM-DD'), { code: 'INVALID_DATE_RANGE' });
  }
  if (startDate > endDate) throw Object.assign(new Error('Start date must not be after end date'), { code: 'INVALID_DATE_RANGE' });
};

const collectRepositoryActivity = async (repository, { authorNames, startDate, endDate }) => {
  const output = await runGit(repository.path, [
    'log', '--all', `--since=${startDate}T00:00:00`, `--until=${endDate}T23:59:59`,
    `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%s${FIELD}%b${RECORD}`
  ]);
  const selected = new Set((authorNames || []).map((name) => String(name).trim()).filter(Boolean));
  const commits = [];
  for (const fields of parseRecords(output)) {
    const [hash, authorName, authorEmail, authoredAt, subject, body] = fields;
    if (!hash || (selected.size > 0 && !selected.has(authorName))) continue;
    const stats = parseNumstat(await runGit(repository.path, ['show', '--format=', '--numstat', '--no-renames', hash]));
    commits.push(normalizeCommit({
      repositoryId: repository.id, hash, authorName, authorEmail, authoredAt, subject, body,
      files: stats.files, insertions: stats.insertions, deletions: stats.deletions
    }));
  }
  return commits;
};

const collectActivity = async (query = {}) => {
  validateDates(query.startDate, query.endDate);
  const commits = [];
  const errors = [];
  for (const repository of query.repositories || []) {
    if (repository.enabled === false) continue;
    try {
      commits.push(...await collectRepositoryActivity(repository, query));
    } catch (error) {
      errors.push({ repositoryId: repository.id, errorCode: error.code || 'COLLECT_FAILED', message: error.message });
    }
  }
  commits.sort((a, b) => String(b.authoredAt).localeCompare(String(a.authoredAt)));
  return normalizeActivityResult({ commits, errors });
};

module.exports = { runGit, discoverAuthors, collectActivity, parseAuthorRecords, parseNumstat, validateDates };
