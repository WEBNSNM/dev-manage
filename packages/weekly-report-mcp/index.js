const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { collectActivity } = require('../../server/services/weeklyReport/gitActivity');
const { buildReportContext } = require('../../server/services/weeklyReport/reportContext');

/**
 * MCP 对外公开的只读工具名称。
 *
 * AI 客户端启动本进程后，会先发送 `tools/list` 获取这份工具清单，随后通过
 * `tools/call` 传入其中一个名称。这里的名称同时被 Codex Skill 和 Gemini
 * 指令引用，因此改名时必须同步更新 `skills/weekly-report/` 下的说明文件。
 */
const TOOL_NAMES = [
  'weekly_report_list_repositories',
  'weekly_report_list_identities',
  'weekly_report_collect_activity',
  'weekly_report_build_context',
  'weekly_report_get_commit_details'
];

/**
 * 创建“工具名 -> 实际业务函数”的映射。
 *
 * 这一层不处理 JSON-RPC 或 stdio，只负责业务调用，因而可以独立测试：
 * 1. registry/identities 从配置文件读取允许访问的仓库和本人身份；
 * 2. collect 调用 Git 活动采集核心；
 * 3. contextBuilder 把活动结果脱敏、分组并限制大小；
 * 4. details 是可选的 commit 详情读取器，未注入时明确拒绝读取 patch。
 *
 * `config` 当前保留在参数中，方便以后接入 DevMaster 状态文件；实际授权来源
 * 是 registry.list() 的实时结果，避免启动后配置变化却仍使用旧白名单。
 */
const createMcpToolHandlers = ({ config, registry, identities, collect = collectActivity, contextBuilder = buildReportContext, details }) => {
  // 返回给 AI 的仓库列表故意移除绝对路径，只暴露稳定 ID、显示名称和启用状态。
  const safeRepositories = async () => (await registry.list()).map(({ id, name, enabled }) => ({ id, name, enabled: enabled !== false }));

  // 所有需要访问仓库的工具必须先经过白名单校验，不能让模型提交任意磁盘路径。
  const allowedRepositories = async (ids = []) => {
    const repositories = await registry.list();
    const selected = ids.length ? repositories.filter((repository) => ids.includes(repository.id)) : repositories.filter((repository) => repository.enabled !== false);
    if (ids.length !== selected.length) throw new Error('Repository is outside the configured allowlist');
    return selected;
  };
  return {
    // 第一步：让 AI 知道有哪些已授权仓库可供选择。
    async weekly_report_list_repositories() { return safeRepositories(); },

    // 第二步：返回已配置的 Git 作者名；后续采集只保留这些作者的提交。
    async weekly_report_list_identities() { return identities.list(); },

    // 第三步：按仓库、作者名和日期范围读取 Git 元数据及 numstat，不读取 diff。
    async weekly_report_collect_activity(args = {}) {
      const repositories = await allowedRepositories(args.repositoryIds || []);
      const selected = await identities.list();
      return collect({ repositories, authorNames: selected.map((identity) => identity.name), startDate: args.startDate, endDate: args.endDate });
    },

    // 第四步：把用户确认过的活动整理成可直接发送给模型的安全上下文。
    async weekly_report_build_context(args = {}) { return contextBuilder(args.activity || {}, args.limits); },

    // 可选步骤：只有宿主显式注入 details 实现，并且仓库通过白名单校验时才允许读取详情。
    async weekly_report_get_commit_details(args = {}) {
      if (!details) throw new Error('Commit detail access is not configured');
      await allowedRepositories([args.repositoryId]);
      return details(args);
    }
  };
};

// `tools/list` 的返回内容。当前 inputSchema 保持宽松，参数约束由处理器统一验证。
const toolDefinitions = TOOL_NAMES.map((name) => ({
  name,
  description: `Read-only DevMaster weekly report operation: ${name}`,
  inputSchema: { type: 'object', additionalProperties: true }
}));

// 每次调用都重新读取配置文件，因此修改仓库/身份配置后无需重启 MCP 进程。
const loadConfig = (configPath) => {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return { repositories: [], identities: [] }; }
};

const createFileRegistry = (configPath) => ({
  async list() { return loadConfig(configPath).repositories || []; }
});
const createFileIdentities = (configPath) => ({
  async list() { return loadConfig(configPath).identities || []; }
});

/**
 * 启动 stdio MCP Server。
 *
 * 完整协议流：
 *   AI 客户端启动 `node index.js`
 *   -> initialize
 *   -> notifications/initialized
 *   -> tools/list
 *   -> tools/call(weekly_report_list_repositories)
 *   -> tools/call(weekly_report_list_identities)
 *   -> tools/call(weekly_report_collect_activity)
 *   -> tools/call(weekly_report_build_context)
 *   -> AI 使用 structuredContent 生成最终周报
 *
 * stdio 中每条 JSON-RPC 消息使用：
 *   Content-Length: <JSON UTF-8 字节数>\r\n\r\n<JSON>
 * `pending` 用于拼接可能被 stdin 分成多段的数据，只有收齐 Content-Length
 * 指定的字节数后才解析 JSON，避免处理半包。
 */
const runStdio = ({ configPath }) => {
  const handlers = createMcpToolHandlers({ config: loadConfig(configPath), registry: createFileRegistry(configPath), identities: createFileIdentities(configPath) });
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let pending = '';

  // 将普通 JavaScript 对象编码为 MCP/JSON-RPC 响应帧并写回 stdout。
  const send = (message) => {
    const payload = JSON.stringify(message);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
  };
  input.on('line', async (line) => {
    pending += `${line}\n`;
    const match = pending.match(/Content-Length:\s*(\d+)\r?\n\r?\n([\s\S]*)/i);
    if (!match || Buffer.byteLength(match[2], 'utf8') < Number(match[1])) return;
    const body = match[2].slice(0, Number(match[1]));
    pending = match[2].slice(Number(match[1]));
    const request = JSON.parse(body);

    // MCP 握手：声明协议版本、工具能力和服务端身份。
    if (request.method === 'initialize') return send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'devmaster-weekly-report', version: '0.1.0' } } });
    if (request.method === 'notifications/initialized') return;

    // 客户端发现工具：把 TOOL_NAMES 转换后的 schema 返回给 AI 客户端。
    if (request.method === 'tools/list') return send({ jsonrpc: '2.0', id: request.id, result: { tools: toolDefinitions } });
    if (request.method === 'tools/call') {
      try {
        // request.params.name 决定调用哪个业务处理器，arguments 是该工具的输入参数。
        const result = await handlers[request.params.name](request.params.arguments || {});
        // content 兼容只读取文本的 MCP 客户端；structuredContent 供支持结构化结果的客户端直接使用。
        return send({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } });
      } catch (error) {
        // 工具错误使用 JSON-RPC error 返回，不把异常堆栈或本地敏感信息发送给模型。
        return send({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } });
      }
    }
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } });
  });
};

if (require.main === module) {
  // MCP 客户端通常通过环境变量指定配置；未指定时读取启动目录下的默认文件。
  const configPath = process.env.DEVMASTER_WEEKLY_REPORT_CONFIG || path.join(process.cwd(), 'weekly-report.config.json');
  runStdio({ configPath });
}

module.exports = { TOOL_NAMES, createMcpToolHandlers, runStdio };
