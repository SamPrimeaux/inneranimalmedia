# Fuel N Free Time — MCP OAuth (Sam + Connor)

Remote dev on **fuelnfreetime** from Claude, ChatGPT, or phone — same MCP server, dual attribution.

## Connect once per app

1. Open **Claude** or **ChatGPT** → Settings → Integrations / Connectors
2. Add MCP server: `https://mcp.inneranimalmedia.com`
3. Sign in with your IAM account when prompted
4. Approve OAuth consent (tools + workspace)

**Connor:** use `connordmcneely@leadershiplegacydigital.com`  
**Sam:** any superadmin IAM email

Connor has **no active MCP tokens yet** until this OAuth flow completes.

## Every fuel D1 query (required)

OAuth tokens bind to your *default* workspace (`ws_inneranimalmedia` for Sam, `ws_connor_mcneely` for Connor).  
Fuel data lives on **`ws_fuelnfreetime`**. Pass the slug on every D1 tool call:

```json
{
  "workspace_slug": "fuelnfreetime",
  "sql": "SELECT name FROM sqlite_master WHERE type='table' LIMIT 5"
}
```

## Test prompts

**Claude / ChatGPT:**

```
Using agentsam_d1_query with workspace_slug "fuelnfreetime", list the first 5 tables.
```

```
Using agentsam_d1_query with workspace_slug "fuelnfreetime", SELECT id, name FROM products LIMIT 5
```

Success response includes:
- `d1_database_id`: `9fd6ff92-e407-4b51-8b01-3c93f3845bb2`
- `requested_workspace_id`: `ws_fuelnfreetime`

## Accountability (DORA)

Each tool call logs **who** and **which app**:

| Table | Fields |
|---|---|
| `mcp_audit_log` | `user_id`, `workspace_id`, `external_client_key` (`claude` / `chatgpt`) |
| `agentsam_tool_call_log` | `user_id`, `workspace_id`, `source_tool` |
| `agentsam_mcp_tool_execution` | `user_id`, `workspace_id`, `actor_source` |

Sam and Connor are distinguishable by `user_id` even on the same workspace.

## Limits

Both are **owners** on `ws_fuelnfreetime` → **no MCP rate limits** on that workspace context.  
Platform-account D1 (fuel DB on IAM CF account) works without personal BYOK for active workspace members.

## DORA project id

Deploy attribution for fuel: `PROJECT_ID=proj_fuelnfreetime`
