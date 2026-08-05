const fs = require('node:fs/promises');
const path = require('node:path');
const { createRegistryStore } = require('./repositoryRegistry');
const { createIdentityStore } = require('./identityStore');
const { createReportStore, emptyState, normalizeState } = require('./reportStore');
const { createActivityCache } = require('./activityCache');

const createFileState = (filePath) => {
  const read = async () => {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      return emptyState();
    }
  };
  const write = async (value) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tempPath, filePath);
  };
  return { read, write };
};

const createWeeklyReportRuntime = ({ statePath, cachePath }) => {
  const state = createFileState(statePath);
  const cache = createFileState(cachePath);
  const registry = createRegistryStore({
    read: async () => normalizeState(await state.read()),
    write: async (next) => {
      const current = normalizeState(await state.read());
      await state.write({ ...current, repositories: next.repositories });
    }
  });
  const identities = createIdentityStore({
    read: async () => normalizeState(await state.read()),
    write: async (next) => {
      const current = normalizeState(await state.read());
      await state.write({ ...current, identities: next.identities });
    }
  });
  const reports = createReportStore({
    read: async () => normalizeState(await state.read()),
    write: async (next) => {
      const current = normalizeState(await state.read());
      await state.write({ ...current, ...next });
    }
  });
  return { registry, identities, reports, cache };
};

module.exports = { createWeeklyReportRuntime };
