---
name: weekly-report
description: Use when 用户希望通过 DevMaster MCP Server 根据本地 Git 活动生成事实准确的中文周报。
---

# 周报 Skill

只使用 DevMaster 周报 MCP 工具作为 Git 活动来源。不要扫描本地目录，也不要凭记忆编造项目工作。

如果需要查看工具参数、返回结构、`structuredContent` 的处理方式和完整调用链，请在调用工具前阅读 [references/mcp-call-flow.md](references/mcp-call-flow.md)。

## 调用流程

1. 如果用户没有提供日期，先询问开始日期和结束日期；默认使用本周一到今天。
2. 调用 `weekly_report_list_repositories` 和 `weekly_report_list_identities`，说明本次将使用哪些已启用仓库和 Git 作者名。
3. 按日期调用 `weekly_report_collect_activity`，按仓库分组展示简要预览，包括提交主题和文件统计。
4. 只有用户明确选择某个提交后，才请求 `weekly_report_get_commit_details`。如果详情读取未配置，则继续使用已有元数据。
5. 只把用户确认保留的提交传给 `weekly_report_build_context`，并设置字符数上限。
6. 输出可编辑的中文 Markdown，包含“本周完成”“分项目明细”“风险与待跟进”“下周计划”四个部分。
7. 区分事实和推测。推测出的风险必须标记“推测”，没有 Git 活动依据时不要声称功能已经上线。

## 写作规则

- 将相关提交合并为一个工作成果，并保留项目归属。
- 如果合并提交或重复的依赖升级没有体现实际工作，则从周报中合并或删除。
- 需要时保留文件数量、新增行数和删除行数等具体统计。
- 不要输出本地绝对路径、API Key、被排除的提交或未选择的源代码。
- 如果采集结果包含仓库错误，将其放入“风险与待跟进”，不要隐藏。
