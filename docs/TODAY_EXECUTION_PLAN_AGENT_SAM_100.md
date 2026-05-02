# TODAY'S EXECUTION PLAN — Agent Sam 100% Complete

**Status:** Plan approved. Awaiting **"start"** command to begin execution.  
**Created:** 2026-03-18

---

## Prerequisites / schema notes

- **agent_costs table:** Current `runToolLoop` INSERT uses columns: `model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at`. There is **no `conversation_id`** column in production (orphan check failed on it). Phase 2 will use **existing columns only** unless we add a migration first.
- **Cloudflare Images:** Dashboard `images.html` already calls `GET /api/images`, `POST /api/images`, `DELETE /api/images/:id`, `GET /api/images/:id/meta`. Worker has **no** `/api/images` routes today — that’s why the UI shows "Not found". Phase 1.2 adds these routes.

---

## Phase 1: Quick wins (30–45 min)

### 1.1 Fix Google Drive OAuth button (~15 min)

| Step | Action |
|------|--------|
| 1 | **File:** `agent-dashboard/src/AgentDashboard.jsx` |
| 2 | **Lines 2441–2442:** Replace the Google Drive and GitHub menu item `action` so each opens the OAuth popup, then closes the connector popup. |
| 3 | **Google Drive (2441):** `action: () => { window.open('/api/oauth/google/start?connect=drive&return_to=/dashboard/agent', 'oauth_google', 'width=500,height=600'); setConnectorPopupOpen(false); }` |
| 4 | **GitHub (2442):** `action: () => { window.open('/api/oauth/github/start?return_to=/dashboard/agent', 'oauth_github', 'width=500,height=600'); setConnectorPopupOpen(false); }` |
| 5 | **Add `useEffect`** (after existing boot/integrations effect, ~356): listener for `window.addEventListener('message', ...)`. If `event.data?.type === 'oauth_success'` and origin matches, re-fetch `/api/agent/boot` and call `setConnectedIntegrations(data.integrations)` (and optionally `setIntegrationsStatus(data.integrations_status)`). |
| 6 | **Files NOT changed:** `worker.js` (handleGoogleOAuthCallback, handleGitHubOAuthCallback), `agent.html`, `FloatingPreviewPanel.jsx` per rules. |

**Deliverable:** Clicking "Google Drive" or "GitHub" opens OAuth popup; after callback, integrations state refreshes.

---

### 1.2 Fix Cloudflare Images UI (~15 min)

| Step | Action |
|------|--------|
| 1 | **Worker:** Add routes for Cloudflare Images API. |
| 2 | **GET /api/images** — Query param: `page`, `per_page`. Use `env.CLOUDFLARE_IMAGES_ACCOUNT_HASH` and `env.CLOUDFLARE_IMAGES_TOKEN` (or `CLOUDFLARE_IMAGES_API_TOKEN`). Call `https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1?page={page}&per_page={per_page}` with `Authorization: Bearer {token}`. Return JSON shape expected by dashboard (e.g. `result.images` or equivalent). |
| 3 | **GET /api/images/:id/meta** — Single image metadata. |
| 4 | **DELETE /api/images/:id** — Delete image by id. |
| 5 | **POST /api/images** — Upload (multipart or URL). Cloudflare Images API accepts `file` or `url`. Forward to Images API. |
| 6 | **Placement:** Add these routes in `worker.js` in the same auth block as other dashboard APIs (after existing `/api/integrations/...` or in a dedicated `/api/images` block). Require auth via `getAuthUser(request, env)` so only logged-in users can access. |
| 7 | **Dashboard:** `dashboard/images.html` already uses `base + '/api/images'` etc.; no change if response shape matches. If "Not found" persists, confirm route path (e.g. `pathLower === '/api/images'` with method GET/POST and `pathLower.startsWith('/api/images/')` for GET/DELETE sub-routes). |

**Deliverable:** Images page loads list and can upload/delete when credentials are set.

---

## Phase 2: P0 cost tracking (~45 min)

### 2.1 Add agent_costs to streamDoneDbWrites

| Step | Action |
|------|--------|
| 1 | **File:** `worker.js` |
| 2 | **Location:** Inside `streamDoneDbWrites`, after the spend_ledger block (after line 1324), before the `agent_ai_sam` update (1325–1328). |
| 3 | **INSERT:** Use **existing** `agent_costs` columns only (no `conversation_id`): `model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at`. Match `runToolLoop` signature. |
| 4 | **Code:** `try { await env.DB.prepare(\`INSERT INTO agent_costs (model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at) VALUES (?, ?, ?, ?, ?, 'agent_sam', datetime('now'))\`).bind(safeModelKey, safeInput, safeOutput, safeCost, 'chat_stream').run(); } catch (e) { console.error('[agent/chat] agent_costs INSERT failed:', e?.message ?? e); }` |
| 5 | **Note:** If we later add `conversation_id` to `agent_costs` via migration, add it to this INSERT and bind `conversationId`. |

**Deliverable:** Every streaming completion writes one row to `agent_costs` with task_type `chat_stream`.

---

### 2.2 Verify agent_costs schema

| Step | Action |
|------|--------|
| 1 | Confirm in D1 (or migrations) that `agent_costs` has: `model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at`. |
| 2 | **Optional (later):** Add migration to add `conversation_id` to `agent_costs` and then include it in both runToolLoop and streamDoneDbWrites. Not required for Phase 2 to function. |

---

## Phase 3: MCP tool wiring (~90 min)

### 3.1 Google Drive MCP tools

| Step | Action |
|------|--------|
| 1 | **Migration:** New migration file to INSERT into `mcp_registered_tools`: `gdrive_list`, `gdrive_fetch` (and optionally `gdrive_search`). Columns: id, tool_name, tool_category, mcp_service_url, description, input_schema, requires_approval, enabled, created_at, updated_at. Use `mcp_service_url = 'BUILTIN'` so worker handles them. |
| 2 | **Worker:** In the same place BUILTIN tools are dispatched (e.g. where `playwright_screenshot` / `browser_screenshot` are handled — around 5005, or earlier in runToolLoop tool execution), add branches for `gdrive_list` and `gdrive_fetch`. Implementation: reuse logic from `/api/integrations/gdrive/files` and `gdrive/file`/`gdrive/raw`; get user via conversation/session and `getIntegrationToken(env.DB, authUser.id, 'google_drive')`. If no token, return error. |
| 3 | **Tool contracts:** `gdrive_list` params: e.g. `folder_id` (default `'root'`). `gdrive_fetch` params: `file_id`, optional `mime_type`. Return list object or file content/text. |

**Deliverable:** Agent can call gdrive_list and gdrive_fetch when user has connected Drive.

---

### 3.2 GitHub MCP tools

| Step | Action |
|------|--------|
| 1 | **Migration:** INSERT `github_repos`, `github_file` (and optionally `github_search`) into `mcp_registered_tools` with `mcp_service_url = 'BUILTIN'`. |
| 2 | **Worker:** Add BUILTIN handling for these tools; reuse `/api/integrations/github/repos`, `github/files`, `github/file` logic; use `getIntegrationToken(env.DB, authUser.id, 'github')`. |

**Deliverable:** Agent can list repos and fetch file content via MCP tools.

---

### 3.3 Cloudflare Images MCP tools

| Step | Action |
|------|--------|
| 1 | **Migration:** INSERT `cf_images_list`, `cf_images_upload`, `cf_images_delete` into `mcp_registered_tools` (BUILTIN). |
| 2 | **Worker:** Implement handlers that call Cloudflare Images API using `CLOUDFLARE_IMAGES_ACCOUNT_HASH` and token env. List: GET list endpoint. Upload: POST with file or url. Delete: DELETE by id. |

**Deliverable:** Agent can list, upload, and delete Images via MCP.

---

## Phase 4: Playwright & workflows (~60 min)

### 4.1 Verify Playwright MCP

| Step | Action |
|------|--------|
| 1 | **Check:** In `wrangler.production.toml`, confirm `MYBROWSER` binding is present (e.g. browser rendering service URL). |
| 2 | **Check:** Worker.js 1807 and 5005–5012: tools run only when `env.MYBROWSER` and `env.DASHBOARD` exist. If MYBROWSER is missing, document and optionally add a clear error message in tool response. |
| 3 | No code change required if bindings are set; otherwise add binding or document for operator. |

**Deliverable:** Playwright/browser tools verified or documented as blocked by binding.

---

### 4.2 Wire agentic workflows

| Step | Action |
|------|--------|
| 1 | **New route:** `worker.js` — `POST /api/admin/trigger-workflow` (or GET with id). Auth: require admin or internal secret. |
| 2 | **Logic:** Read from `ai_workflow_pipelines` (e.g. by id or "next due"); execute steps (interpret pipeline definition); insert/update `ai_workflow_executions` with status and results. |
| 3 | **Schema:** Confirm `ai_workflow_pipelines` and `ai_workflow_executions` columns (steps, status, etc.) and implement minimal executor (e.g. call external URLs or run tool names). |

**Deliverable:** One trigger endpoint that runs a pipeline and logs to ai_workflow_executions.

---

## Execution order

1. **Phase 1.1** — OAuth button + postMessage refresh.  
2. **Phase 1.2** — Worker `/api/images` routes.  
3. **Phase 2.1** — streamDoneDbWrites agent_costs INSERT.  
4. **Phase 2.2** — Schema check (no migration required for current columns).  
5. **Phase 3.1** — Drive MCP tools (migration + worker).  
6. **Phase 3.2** — GitHub MCP tools (migration + worker).  
7. **Phase 3.3** — Cloudflare Images MCP tools (migration + worker).  
8. **Phase 4.1** — Playwright binding verification.  
9. **Phase 4.2** — trigger-workflow endpoint + pipeline execution.

---

## After implementation

- Run **build** for agent-dashboard if Phase 1.1 touched JSX.  
- **R2 upload:** `dashboard/agent.html` and `static/dashboard/agent/agent-dashboard.js` if dashboard changed; `dashboard/images.html` if it was edited.  
- **Deploy worker** only after you say **"deploy approved"** (per project rules).  
- Append **session log** to `docs/cursor-session-log.md` with files changed, deploy status, and next steps.

---

**Awaiting your "start" command to begin execution.**
