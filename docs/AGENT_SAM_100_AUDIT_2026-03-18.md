# Agent Sam 100% Completion Audit — 2026-03-18

Exact file paths, function names, and line numbers for finishing Agent Sam today.

---

## 1. Google Drive OAuth Flow — Why "Connect Google Drive" Does Not Trigger OAuth

### Root cause

The **"Google Drive" button never opens the OAuth URL**. It only closes the popup.

### Frontend (button → action)

| Location | What happens |
|----------|--------------|
| **File:** `agent-dashboard/src/AgentDashboard.jsx` | |
| **Lines 2438–2446** | Connector popup menu items: `Upload File`, `Upload Image`, **Google Drive**, **GitHub**, Cloudflare, Take Screenshot, Search knowledge base. |
| **Line 2441** | **Google Drive** item: `{ label: "Google Drive", ..., action: () => setConnectorPopupOpen(false) }` |
| **Line 2442** | **GitHub** item: `{ label: "GitHub", ..., action: () => setConnectorPopupOpen(false) }` |

So the **action** for both is only `setConnectorPopupOpen(false)`. There is no `window.open(...)` to the OAuth start URL and no listener for `oauth_success` postMessage.

### Where integrations status is loaded

- **Lines 336–356:** Bootstrap `useEffect` fetches `/api/agent/boot` and sets `setConnectedIntegrations(data.integrations)`.
- **Line 353:** `if (data.integrations) setConnectedIntegrations(data.integrations);`
- Worker exposes **integrations** on boot at `worker.js` (boot handler returns integrations from `user_oauth_tokens`). So the UI can show connected state, but **nothing in the dashboard initiates OAuth**.

### Worker OAuth routes and handlers

| Location | Purpose |
|----------|---------|
| **worker.js lines 408–415** | Route dispatch: `pathLower === '/api/oauth/google/start'` → `handleGoogleOAuthStart`; `pathLower === '/api/oauth/google/callback'` or `pathLower === '/auth/callback/google'` → `handleGoogleOAuthCallback`. |
| **worker.js lines 7685–7712** | `handleGoogleOAuthStart(request, url, env)`: Reads `return_to`, `connect=drive`; builds `redirect_uri = origin + '/auth/callback/google'`; sets scope to Drive when `connectDrive`; puts state in `SESSION_CACHE`; 302 to `https://accounts.google.com/o/oauth2/v2/auth?...`. |
| **worker.js lines 7715–7790** | `handleGoogleOAuthCallback`: Exchanges code for tokens; if `connectDrive`, looks up session user, writes `user_oauth_tokens` (google_drive), returns HTML that does `window.opener?.postMessage({type:'oauth_success',provider:'google'}, ...); window.close();`. |

So the **worker is ready** for a popup flow: open `/api/oauth/google/start?connect=drive&return_to=/dashboard/agent`, and on callback the popup posts `oauth_success` and closes. The **dashboard never opens that URL**.

### Exact fix (frontend only)

1. **AgentDashboard.jsx**  
   - **Lines 2441–2442:** Change the **Google Drive** and **GitHub** menu item `action` so they:
     - Open the OAuth start URL in a popup (e.g. `window.open('/api/oauth/google/start?connect=drive&return_to=/dashboard/agent', 'oauth_google', 'width=500,height=600')` and `/api/oauth/github/start?return_to=/dashboard/agent` for GitHub).
     - Then call `setConnectorPopupOpen(false)`.
   - Add a **single** `useEffect` that subscribes to `window.addEventListener('message', ...)` and, when `event.data?.type === 'oauth_success'`, calls the same boot/integrations refresh you use elsewhere (e.g. re-fetch `/api/agent/boot` and `setConnectedIntegrations(data.integrations)`), so the UI updates after the popup closes.

2. **No worker.js or agent.html changes** required for this flow; OAuth routes and callback behavior are already correct.

---

## 2. Current MCP Tool Registry vs What Should Be Registered

### What is in `mcp_registered_tools` (D1, 23 tools)

| tool_name | tool_category | Notes |
|-----------|---------------|--------|
| browser_screenshot | browser | BUILTIN; worker handles via MYBROWSER |
| d1_query | database | MCP server |
| d1_write | database | MCP server |
| generate_execution_plan | execute | MCP server |
| get_deploy_command | platform | MCP server |
| get_worker_services | platform | MCP server |
| human_context_add | context | MCP server |
| human_context_list | context | MCP server |
| knowledge_search | query | MCP server (worker also has AutoRAG path) |
| list_clients | platform | MCP server |
| list_workers | platform | MCP server |
| platform_info | platform | MCP server |
| playwright_screenshot | browser | BUILTIN; worker handles via MYBROWSER |
| r2_bucket_summary | storage | MCP server |
| r2_list | storage | MCP server |
| r2_read | storage | MCP server |
| r2_search | storage | MCP server |
| r2_write | storage | MCP server |
| telemetry_log | telemetry | MCP server |
| telemetry_query | telemetry | MCP server |
| telemetry_stats | telemetry | MCP server |
| terminal_execute | terminal | BUILTIN (worker PTY) |
| worker_deploy | platform | MCP server |

**Not in registry:** any **Google Drive** tools (e.g. gdrive_list, gdrive_fetch), any **GitHub** tools (e.g. github_repos, github_file), any **Cloudflare Images API** tools.

### What SHOULD be registered (to complete integrations)

| Tool(s) | Category | Status | Where to implement |
|---------|----------|--------|--------------------|
| **Google Drive** | integrations | NOT REGISTERED | Worker already has `/api/integrations/gdrive/files`, `gdrive/file`, `gdrive/raw`; need wrapper tools that use `getIntegrationToken(env.DB, authUser.id, 'google_drive')` and call same logic; then INSERT into `mcp_registered_tools` (e.g. gdrive_list, gdrive_fetch). |
| **GitHub** | integrations | NOT REGISTERED | Worker has `/api/integrations/github/repos`, `github/files`, `github/file`, `github/raw`; same pattern: MCP tool wrappers + INSERT into `mcp_registered_tools` (e.g. github_repos, github_file). |
| **Playwright / browser** | browser | REGISTERED, PARTIAL | playwright_screenshot, browser_screenshot are in DB (migration `131_playwright_tools.sql`) and in worker BUILTIN set. Worker runs them only when `env.MYBROWSER` and `env.DASHBOARD` exist (worker.js 1807, 5005–5012). If MYBROWSER is unset or unreachable, tool calls fail. |
| **Cloudflare Images API** | storage/images | NOT REGISTERED | No MCP tools. Dashboard uses Images in `dashboard/images.html`; worker has `CLOUDFLARE_IMAGES_ACCOUNT_HASH` in wrangler; no agent-callable tool (e.g. cf_images_list, cf_images_upload) in `mcp_registered_tools` or worker tool dispatch. |

### Where tools are loaded and invoked

- **Worker:** `worker.js` line 3629: `SELECT tool_name, description, input_schema FROM mcp_registered_tools WHERE enabled = 1` (chat tools). Line 4537 / 4541: tool list for API. Line 4933: tool lookup by name. Line 5047: same SELECT for chatWithToolsAnthropic.
- **MCP server (remote):** `mcp-server/src/index.js` lines 106–118: hardcoded `tools/list` (r2_write, r2_read, r2_list, d1_query, d1_write, terminal_execute, knowledge_search, list_clients, get_worker_services, get_deploy_command). No Drive, GitHub, or Images tools there either.

---

## 3. Streaming Cost Tracking — streamDoneDbWrites and agent_costs

### streamDoneDbWrites — full function

**File:** `worker.js`  
**Lines:** 1291–1330

```text
async function streamDoneDbWrites(env, conversationId, modelRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx)
```

It does:

1. **agent_messages** INSERT (lines 1301–1303).
2. **agent_telemetry** INSERT (lines 1307–1309).
3. **spend_ledger** INSERT (lines 1313–1324), optionally via `ctx.waitUntil`.
4. **agent_ai_sam** UPDATE total_runs / last_run_at (lines 1326–1328).

It does **not** INSERT into **agent_costs**.

### Where streamDoneDbWrites is called

| Call site | File:line | Context |
|-----------|-----------|---------|
| 1 | worker.js:2037 | After OpenAI stream completes (streamOpenAI) |
| 2 | worker.js:2116 | After Google stream completes (streamGoogle) |
| 3 | worker.js:2182 | After Workers AI stream (streamWorkersAI), with safeRow/safeText/safeInput/safeOutput/safeCost |
| 4 | worker.js:3899 | After runToolLoop (non-streaming tool round); passes finalText, 0, 0, 0 for tokens/cost |
| 5 | worker.js:5174 | After chatWithToolsAnthropic completes (non-streaming tool loop); then optionally streams |

So **every streaming completion** goes through `streamDoneDbWrites` and **none** of those paths write to `agent_costs`.

### Where agent_costs IS written

**File:** `worker.js`  
**Lines:** 1874–1881

Only inside **runToolLoop** (non-streaming tool loop):

```text
const costUsd = calculateCost(modelRow, totalInputTokens, totalOutputTokens);
await env.DB.prepare(
  `INSERT INTO agent_costs (model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at)
   VALUES (?, ?, ?, ?, ?, 'agent_sam', datetime('now'))`
).bind(modelRow?.model_key ?? modelKey, totalInputTokens, totalOutputTokens, costUsd, taskType).run();
```

So: **streaming path** → no `agent_costs`. **Non-streaming tool loop only** → `agent_costs` populated.

### Change to make streaming write to agent_costs

In **worker.js** inside `streamDoneDbWrites` (after the spend_ledger block, before or after the agent_ai_sam update), add an INSERT into `agent_costs` using the same shape as runToolLoop:

- `model_used` = safeModelKey  
- `tokens_in` = safeInput  
- `tokens_out` = safeOutput  
- `cost_usd` = safeCost  
- `task_type` = e.g. `'chat_stream'` or `'chat'`  
- `user_id` = `'agent_sam'` (or from agent_id if you have a user mapping)

Use a try/catch so a missing table or column does not break the rest of `streamDoneDbWrites`.

---

## 4. Agent Workflow Tables — Current State

### Tables present (D1)

- **ai_workflow_pipelines** — 32 rows (defined, never executed by worker).
- **ai_workflow_executions** — 26 rows.
- **agent_platform_context** — 25 rows.
- **ai_context_store** — 27 rows.
- **ai_context_versions** — 0 rows.

### Orchestration wiring

- **worker.js:** No matches for `trigger-workflow`, `ai_workflow_pipelines`, or `workflow.*cron`. So there is **no HTTP or cron trigger** in the worker that reads `ai_workflow_pipelines` or inserts into `ai_workflow_executions`.
- **agentsam-clean/docs/TOMORROW.md** (246–247): "Wire ai_workflow_pipelines cron triggers", "POST /api/admin/trigger-workflow endpoint. Wire to existing ai_workflow_pipelines rows. Log to ai_workflow_executions." — i.e. planned but not implemented in worker.

So: **32 pipelines** are in the DB; **no code path** in the worker runs them or logs to executions from a trigger. To “knock this out”: add an endpoint (e.g. `POST /api/admin/trigger-workflow` or a cron route) that reads from `ai_workflow_pipelines`, runs the defined steps, and writes to `ai_workflow_executions`.

---

## 5. Current File Structure

### Local repo root (relevant entries)

- **worker.js** — main worker (root).
- **dashboard/agent.html** — Agent dashboard HTML; loads `/static/dashboard/agent/agent-dashboard.js?v=60`.
- **agent-dashboard/** — React app (src/AgentDashboard.jsx, FloatingPreviewPanel.jsx, etc.); build output used for R2/static.
- **static/dashboard/agent/agent-dashboard.js** — built bundle (served at `/static/dashboard/agent/agent-dashboard.js`).
- **static/dashboard/agent.html**, **draw.html**, **glb-viewer.html**, **shell.css**, **pages/draw.html** — other static dashboard assets.
- **mcp-server/** — MCP server (separate Worker): `src/index.js`, `wrangler.jsonc`, package.json, etc.
- **migrations/** — D1 migrations (e.g. 131_playwright_tools.sql, 126_knowledge_search_tool.sql).

### R2 bucket agent-sam (static/dashboard/agent/)

Served under the worker’s static asset route. From deploy rules and dashboard R2 rule:

- **Upload path:** `static/dashboard/agent.html`, `static/dashboard/agent/agent-dashboard.js` (and optionally agent-dashboard.css if present).
- **Command pattern:**  
  `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file=dashboard/agent.html --content-type=text/html --remote -c wrangler.production.toml`  
  and same for `static/dashboard/agent/agent-dashboard.js` with `--file=` pointing at the built JS.

So **current structure** for Agent in R2 is: `static/dashboard/agent.html`, `static/dashboard/agent/agent-dashboard.js`. No separate “agent/” subfolder for HTML; the HTML is at `static/dashboard/agent.html`.

### MCP server code

- **Path:** `/Users/samprimeaux/Downloads/march1st-inneranimalmedia/mcp-server/`
- **Entry:** `mcp-server/src/index.js` — JSON-RPC over HTTP, `/mcp`, Bearer auth, `initialize`, `tools/list`, `tools/call`; tools list is hardcoded (no Drive/GitHub/Images).
- **Deploy:** Separate Cloudflare Worker (e.g. inneranimalmedia-mcp-server); URL used by main worker: `https://mcp.inneranimalmedia.com/mcp`.

---

## 6. Missing Integrations — What Is Not Wired

| Integration | Status | Exact gap |
|-------------|--------|-----------|
| **Playwright MCP** | Partial | Tools **registered** in D1 (131_playwright_tools.sql) and in worker BUILTIN set. Worker runs them only when `env.MYBROWSER` and `env.DASHBOARD` exist (worker.js 1807, 5005–5012). If MYBROWSER is missing or fails, calls return an error. No separate “Playwright MCP server”; execution is in main worker. |
| **Cloudflare Images API** | Not wired for agent | Dashboard uses it (`dashboard/images.html`); wrangler has `CLOUDFLARE_IMAGES_ACCOUNT_HASH`. No MCP tool and no agent-callable route that lists/upload/deletes Images. Add tools (e.g. cf_images_list, cf_images_upload) and implement in worker using Images API + env vars. |
| **Agentic workflows** | Defined, not triggered | 32 rows in `ai_workflow_pipelines`; no worker code that triggers them or logs to `ai_workflow_executions`. Need a trigger endpoint or cron that reads pipelines and runs steps. |
| **Drive as MCP tools** | Not wired | Dashboard OAuth + `/api/integrations/gdrive/*` exist; no tools in `mcp_registered_tools` and no tool handler that uses `getIntegrationToken(..., 'google_drive')` and calls Drive API. |
| **GitHub as MCP tools** | Not wired | Same: OAuth + `/api/integrations/github/*` exist; no tools in `mcp_registered_tools` and no tool handler for repo/file access from the agent. |

---

## 7. Quick reference — Line numbers

| Topic | File | Lines |
|-------|------|--------|
| Google Drive / GitHub button actions | AgentDashboard.jsx | 2441, 2442 |
| OAuth start route | worker.js | 408–409 |
| handleGoogleOAuthStart | worker.js | 7685–7712 |
| handleGoogleOAuthCallback (Drive token + postMessage) | worker.js | 7715–7790 |
| streamDoneDbWrites (no agent_costs) | worker.js | 1291–1330 |
| streamDoneDbWrites call sites | worker.js | 2037, 2116, 2182, 3899, 5174 |
| agent_costs INSERT (runToolLoop only) | worker.js | 1877–1880 |
| mcp_registered_tools SELECT (chat tools) | worker.js | 3629, 5047 |
| Playwright/Browser BUILTIN handling | worker.js | 1807, 5005–5012 |
| MCP server tools/list | mcp-server/src/index.js | 106–118 |
| Integrations status (boot) | worker.js | 518–529 |
| Bootstrap integrations in UI | AgentDashboard.jsx | 336–356, 353 |

No code was changed in this audit; only investigation and this document.
