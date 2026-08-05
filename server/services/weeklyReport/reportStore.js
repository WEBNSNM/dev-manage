const crypto = require('node:crypto');

const emptyState = () => ({ version: 1, repositories: [], identities: [], reports: [] });

const normalizeState = (value) => ({
  version: 1,
  repositories: Array.isArray(value?.repositories) ? value.repositories : [],
  identities: Array.isArray(value?.identities) ? value.identities : [],
  reports: Array.isArray(value?.reports) ? value.reports : []
});

const createReportStore = ({ read, write, maxReports = 50 }) => {
  const load = async () => normalizeState((await read()) || emptyState());
  const persist = async (state) => write(normalizeState(state));
  return {
    async loadConfig() {
      const state = await load();
      return { repositories: state.repositories, identities: state.identities };
    },
    async saveConfig(config = {}) {
      const state = await load();
      state.repositories = Array.isArray(config.repositories) ? config.repositories : state.repositories;
      state.identities = Array.isArray(config.identities) ? config.identities : state.identities;
      await persist(state);
      return { repositories: state.repositories, identities: state.identities };
    },
    async saveReport(report = {}) {
      const state = await load();
      const saved = {
        id: String(report.id || crypto.randomUUID()),
        createdAt: String(report.createdAt || new Date().toISOString()),
        startDate: String(report.startDate || ''),
        endDate: String(report.endDate || ''),
        markdown: String(report.markdown || '')
      };
      state.reports = [saved, ...state.reports.filter((item) => item.id !== saved.id)]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, maxReports);
      await persist(state);
      return saved;
    },
    async listReports() {
      return (await load()).reports;
    },
    async getReport(id) {
      return (await load()).reports.find((report) => report.id === String(id || '')) || null;
    }
  };
};

module.exports = { createReportStore, emptyState, normalizeState };
