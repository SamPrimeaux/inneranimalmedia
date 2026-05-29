# Open-web search — `agentsam_tools.handler_type` strategy

## Live D1 constraint (2026-05-29)

`agentsam_tools.handler_type` CHECK allows:

`mcp`, `r2`, `github`, `terminal`, `http`, `proxy`, `ai`, `d1`, `hyperdrive`, `supabase`, `kv`, `durable_object`, `filesystem`, `browser_agentic`, `mybrowser`, `telemetry`, `eval`, `task.planner`, `task.organizer`, `task.manager`, `workspace.reader`

**Not allowed:** `builtin`, `websearch`, `open_web_search`

Migration **454** failed when setting `handler_type='builtin'` for this reason.

## Deploy-safe (current production)

| Field | `search_web` | `web_fetch` |
|--------|----------------|-------------|
| `handler_type` | `ai` | `ai` |
| `execution_lane` (in `handler_config`) | `open_web_search` | `web_fetch` |
| `dispatch_target` | `search_web` | `web_fetch` |
| `web_backend` | `tavily` | — |

Executor: `catalog-tool-executor.js` routes `handler_type=ai` + `execution_lane` / `dispatch_target` to `open-web-catalog-dispatch.js` → `web.js` → `tavily-open-web-search.js` (never `ai_complete`).

Migrations: **453**, **455**, **456** (metadata).

## Follow-up (maintenance window)

Migration **457** rebuilds `agentsam_tools` to add `websearch` to CHECK, then sets `search_web.handler_type = 'websearch'`.

**Before 457:** confirm no blocking FKs; backup; re-run view drift checks (`v_mcp_tools`, `v_mcp_tool_execution`, `v_mcp_tool_drift`).

**After 457:** executor `case 'websearch'` is the primary path; `ai` + metadata remains backward-compatible.

## Inspect constraint

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "
SELECT sql FROM sqlite_master WHERE type='table' AND name='agentsam_tools';
"
```
