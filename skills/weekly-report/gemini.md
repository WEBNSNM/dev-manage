# Gemini MCP 周报工作流

先配置 DevMaster 周报 MCP Server，然后要求 Gemini 按下面的顺序执行：

1. 调用 `weekly_report_list_repositories` 和 `weekly_report_list_identities`，确认可访问的仓库和本人的 Git 作者名。
2. 使用明确的 `startDate` 和 `endDate` 调用 `weekly_report_collect_activity`。
3. 按仓库展示提交预览，并询问用户是否需要查看某些提交的详细信息。
4. 将用户确认的活动传给 `weekly_report_build_context`，然后生成包含完成事项、项目明细、风险和后续计划的中文 Markdown 周报。

MCP 工具全部是只读操作，并且只允许访问配置白名单中的仓库。模型不要执行原始 Git 命令，也不要自行扫描本地目录。

具体的 JSON 请求参数、返回结构和完整调用顺序，请阅读同目录下的 `references/mcp-call-flow.md`。
