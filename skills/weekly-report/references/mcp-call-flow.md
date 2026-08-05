# DevMaster Weekly Report MCP Call Flow

## Contents

- Repository discovery
- Identity discovery
- Activity collection
- Optional commit details
- Context construction
- Final report generation
- JSON-RPC transport example

Treat each tool result as input to the next step. Do not skip repository and identity discovery: they define the local allowlist and exact Git author names used for filtering.

## 1. Discover allowed repositories

Call:

```json
{
  "name": "weekly_report_list_repositories",
  "arguments": {}
}
```

Expected `structuredContent`:

```json
[
  { "id": "repo-id", "name": "dev-master", "enabled": true }
]
```

Use only enabled repository IDs returned here. Never invent a filesystem path or submit a repository outside this list.

## 2. Discover selected Git identities

Call:

```json
{
  "name": "weekly_report_list_identities",
  "arguments": {}
}
```

Expected result:

```json
[
  { "name": "Alice", "emails": ["alice@example.com"] }
]
```

Commit matching uses the exact `name` values. Emails are supporting information, not the primary filter.

## 3. Collect authored activity

Call after confirming the date range:

```json
{
  "name": "weekly_report_collect_activity",
  "arguments": {
    "repositoryIds": ["repo-id"],
    "startDate": "2026-08-03",
    "endDate": "2026-08-09"
  }
}
```

Expected result:

```json
{
  "commits": [
    {
      "repositoryId": "repo-id",
      "hash": "abc1234",
      "authorName": "Alice",
      "authoredAt": "2026-08-05T10:00:00+08:00",
      "subject": "feat: add weekly report",
      "files": ["server/services/weeklyReport/gitActivity.js"],
      "insertions": 120,
      "deletions": 8
    }
  ],
  "errors": []
}
```

Preview commits grouped by `repositoryId`. Preserve non-empty `errors` for the final risk section; one failed repository does not invalidate successful repositories.

## 4. Optionally request commit details

Only after the user selects a commit, call:

```json
{
  "name": "weekly_report_get_commit_details",
  "arguments": {
    "repositoryId": "repo-id",
    "hash": "abc1234"
  }
}
```

This tool is optional. If it returns `Commit detail access is not configured`, continue with metadata and do not retry with a raw Git command.

## 5. Build the model-safe context

Pass only user-approved commit objects from step 3:

```json
{
  "name": "weekly_report_build_context",
  "arguments": {
    "activity": {
      "commits": [
        {
          "repositoryId": "repo-id",
          "hash": "abc1234",
          "authorName": "Alice",
          "authoredAt": "2026-08-05T10:00:00+08:00",
          "subject": "feat: add weekly report",
          "files": ["server/services/weeklyReport/gitActivity.js"],
          "insertions": 120,
          "deletions": 8
        }
      ],
      "errors": []
    },
    "limits": { "maxCharacters": 24000 }
  }
}
```

Use `structuredContent` when available. It is grouped, path-sanitized, hash-shortened, and size-limited. Do not reintroduce absolute paths or discarded commits.

## 6. Generate the report

The normal chain is:

```text
weekly_report_list_repositories
-> weekly_report_list_identities
-> weekly_report_collect_activity
-> user reviews commits
-> weekly_report_build_context
-> current AI client generates Markdown
```

The Skill does not call DeepSeek, Gemini, or OpenAI itself. The current MCP-capable AI client generates the final text. DevMaster API mode sends the same safe context through its provider layer.

## JSON-RPC transport example

The MCP client wraps a tool call in JSON-RPC:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "weekly_report_collect_activity",
    "arguments": {
      "repositoryIds": ["repo-id"],
      "startDate": "2026-08-03",
      "endDate": "2026-08-09"
    }
  }
}
```

The stdio process receives a `Content-Length` frame and returns both text-compatible `content` and machine-readable `structuredContent`:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      { "type": "text", "text": "{\"commits\":[],\"errors\":[]}" }
    ],
    "structuredContent": {
      "commits": [],
      "errors": []
    }
  }
}
```
