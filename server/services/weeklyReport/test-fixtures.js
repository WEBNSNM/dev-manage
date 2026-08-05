const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const createTempDirectory = (prefix = 'devmaster-weekly-report-') =>
  fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const createRepositoryRecord = (overrides = {}) => ({
  id: 'repo-1',
  name: 'demo',
  path: 'C:\\work\\demo',
  enabled: true,
  lastCollectedAt: null,
  lastHead: null,
  ...overrides
});

module.exports = { createTempDirectory, createRepositoryRecord };
