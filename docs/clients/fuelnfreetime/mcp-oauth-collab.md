# Fuel N Free Time — MCP OAuth (Sam + Connor)

Remote dev on **fuelnfreetime** from Claude, ChatGPT, or phone — same MCP server, dual attribution.

## Connect once per app

1. Open **Claude** or **ChatGPT** → Settings → Integrations / Connectors
2. **Remove** any existing Inner Animal / MCP connector that failed
3. Add connector — **URL only** (no manual OAuth fields):

```
https://mcp.inneranimalmedia.com/mcp
```

4. Sign in as your IAM account when the browser opens
5. Approve consent

**Do not** paste a Client ID, Client Secret, or `inneranimalmedia.com` as the MCP URL.

### If you see `{"error":"invalid_client"}` with `client_id=Ov23...`

That means a **GitHub OAuth App ID** was sent instead of the MCP client (`iam_mcp_inneranimalmedia`). Usually caused by:

- Wrong connector URL (e.g. `inneranimalmedia.com` instead of `mcp.inneranimalmedia.com/mcp`)
- Manually filling OAuth Client ID in Claude's advanced settings

**Fix:** Delete the connector and re-add using only the MCP URL above. On the login redirect, the URL should contain `client_id=iam_mcp_inneranimalmedia`, not `Ov23...`.

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
