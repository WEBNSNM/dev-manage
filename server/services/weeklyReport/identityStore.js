const { normalizeIdentity } = require('./types');

const createIdentityStore = ({ read, write }) => ({
  async list() {
    const value = await read();
    return Array.isArray(value?.identities) ? value.identities.map(normalizeIdentity) : [];
  },
  async save(identities) {
    const merged = new Map();
    for (const identity of Array.isArray(identities) ? identities : []) {
      const normalized = normalizeIdentity(identity);
      if (!normalized.name) continue;
      const previous = merged.get(normalized.name) || { name: normalized.name, emails: [] };
      merged.set(normalized.name, {
        name: normalized.name,
        emails: [...new Set([...previous.emails, ...normalized.emails])]
      });
    }
    const result = [...merged.values()];
    await write({ version: 1, identities: result });
    return result;
  }
});

module.exports = { createIdentityStore };
