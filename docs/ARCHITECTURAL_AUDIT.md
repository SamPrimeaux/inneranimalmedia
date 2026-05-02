# Architectural Audit — inneranimalmedia Worker & Dashboard

Exhaustive context document for briefing an AI agent that will execute file edits and deployments autonomously. Literal and complete; uncertainties are called out explicitly.

---

## 1. Project structure

### Root

There is **no `src/` or `public/`** at the repository root.

**Root files and directories:**

- **worker.js** — Cloudflare Worker entry (single file; see §2).
- **worker.js.save** — Backup of worker.
- **wrangler.production.toml** — Production Wrangler config.
- **package.json**, **package-lock.json** — Root package (scripts: `deploy`, `wrangler`, `terminal`).
- **deploy-agent-dashboard.sh** — Builds agent-dashboard and uploads to R2.
- **.env.cloudflare**, **.env.cloudflare.example** — Env/secret loading (not in wrangler; sourced by scripts).
- **.cursorignore**, **.gitignore** — Ignore rules.
- **.cursor/** — Cursor rules (e.g. dashboard-r2-before-deploy.mdc, session-start-d1-context.mdc, d1-schema-and-records.mdc).
- **.vscode/settings.json** — Editor settings.
- **.wrangler/** — Wrangler local state / build cache (build output for local dev).
- **dashboard/** — Dashboard HTML and related assets (source for R2; must be uploaded to R2 before deploy per .cursor rules).
- **static/** — Static assets (e.g. shell.css, draw.html, static/dashboard/pages/).
- **agent-dashboard/** — Vite/React app for Agent UI (builds to agent-dashboard/dist/).
- **overview-dashboard/** — Vite/React app for Overview (builds to overview-dashboard/dist/).
- **time-tracking-dashboard/** — Vite/React app for time tracking (builds to time-tracking-dashboard/dist/).
- **mcp-server/** — Separate MCP server (wrangler.jsonc, src/index.js); not the main worker.
- **server/** — Terminal server (terminal.ts / terminal.js, run scripts, plist examples).
- **migrations/** — D1 SQL migrations (e.g. 106–121_*.sql).
- **scripts/** — deploy-with-record.sh, post-deploy-record.sh, with-cloudflare-env.sh, etc.
- **docs/** — Documentation (memory, API, deployment, etc.).
- **Finance.jsx** — Empty placeholder at root (0 bytes).
- **finance_current.html**, **overview_from_r2.html** — Empty placeholders at root.

### dashboard/

- **agent.html**, **chats.html**, **cloud.html**, **finance.html**, **mcp.html**, **overview.html**, **time-tracking.html** — Full dashboard pages (HTML).
- **Finance.jsx**, **Finance.js**, **finance-entry.jsx** — Finance-related scripts.
- **pages/agent.html** — Agent page fragment.
- **mcp.html** — MCP dashboard page.

### static/

- **dashboard/shell.css** — Shell styles.
- **dashboard/draw.html** — Draw page.
- **dashboard/pages/draw.html** — Draw fragment.

### agent-dashboard/

- **src/AgentDashboard.jsx**, **src/FloatingPreviewPanel.jsx**, **src/main.jsx**, **src/index.css**
- **vite.config.js** — base: `/static/dashboard/agent/`, outDir: `dist`, entry: `src/main.jsx`, output: `agent-dashboard.js` + `agent-dashboard-[name].js` chunks.
- **package.json**, **package-lock.json**
- **dist/** — Build output (agent-dashboard.js, agent-dashboard.css, chunks); deployed to R2 by deploy-agent-dashboard.sh.

### overview-dashboard/

- **src/OverviewDashboard.jsx**, **src/Finance.jsx**, **src/main.jsx**, **src/finance-entry.jsx**
- **index.html**, **vite.config.js**, **package.json**, **package-lock.json**
- **dist/** — Build output (when built).

### time-tracking-dashboard/

- **src/TimeTracking.jsx**, **src/main.jsx**
- **index.html**, **vite.config.js**, **package.json**, **package-lock.json**
- **dist/** — Build output (when built).

### mcp-server/

- **src/index.js** — MCP server entry.
- **wrangler.jsonc**, **package.json**, **AGENTS.md**, **.prettierrc**, **.editorconfig**, **.gitignore**

### server/

- **terminal.ts**, **terminal.js** — Terminal server.
- **package.json**, **package-lock.json**
- **run-terminal-server.sh**, **install-terminal-server-service.sh**, **tunnel.yml.example**

### Build output / cache directories

- **.wrangler/** — Wrangler local dev/build state at root.
- **agent-dashboard/dist/** — Agent dashboard Vite build.
- **overview-dashboard/dist/** — Overview dashboard Vite build (if built).
- **time-tracking-dashboard/dist/** — Time-tracking dashboard Vite build (if built).
- **node_modules/** — At root and in agent-dashboard, overview-dashboard, time-tracking-dashboard, mcp-server, server.

---

## 2. Entry points

- **worker.js** — The **only** Worker entry point. It is the `main` file used by Wrangler.
- **wrangler.production.toml** specifies `main = "worker.js"` (line 2). There is **no** `index.ts` or `worker.ts` in this repo; the Worker is JavaScript only.
- **main field**: Defined in wrangler.production.toml as `main = "worker.js"`. Root package.json has no `main`; it is an app/deploy root, not a library.

**Exports from worker.js:**

- `worker` (object with `fetch`, `queue`) — default export.
- `worker.scheduled` — Assigned after export; cron handler.
- Durable Object classes: `IAMCollaborationSession`, `IAMSession`, `MeauxSession`, `ChessRoom` (exported for wrangler DO bindings).

---

## 3. Full routing map

Path matching is done with `path = url.pathname.replace(/\/$/, '') || '/'` and `pathLower = path.toLowerCase()`. Routes are checked in order; first match wins. Method is `(request.method || 'GET').toUpperCase()` where relevant.

| Path / pattern | Method | What it does | Returns |
|----------------|--------|--------------|---------|
| `/api/health` | GET | Health check; checks ASSETS and DASHBOARD bindings | JSON `{ ok, worker: 'inneranimalmedia', bindings }`; 503 if bindings missing |
| `/api/telemetry/v1/traces` | POST | OTLP trace ingest; parses JSON body, inserts into `otlp_traces` | 204 on success; 503 if no DB; 500 on error |
| `/api/browser/*` | GET/POST | Puppeteer (MYBROWSER): screenshot, health, metrics | See §3.1 |
| `/api/overview/stats` | GET | Overview stats (session required); D1 aggregates | JSON stats |
| `/api/overview/recent-activity` | GET | Recent activity (session required) | JSON |
| `/api/overview/checkpoints` | GET/POST | Workflow checkpoints list or create/update | JSON |
| `/api/overview/activity-strip` | GET | Activity strip (session required) | JSON |
| `/api/overview/deployments` | GET | Cloudflare deployments + cicd_runs (session required) | JSON |
| `/api/dashboard/time-track/manual` | POST | Manual time-track entry (session required) | JSON |
| `/api/dashboard/time-track*` | * | Time-track start/heartbeat/end; action via query or path | JSON |
| `/api/colors/all` | * | Colors for finance UI | JSON |
| `/api/finance/*` | * | Finance: summary, health, breakdown, categories, accounts, mrr, ai-spend, transactions, import-csv | JSON (see §3.2) |
| `/api/clients` | GET, POST | List clients or create/update client (D1 `clients`) | JSON |
| `/api/billing/summary` | GET | Invoices summary (D1 `invoices`, `clients`) | JSON |
| `/api/oauth/google/start` | GET | Redirect to Google OAuth | 302 |
| `/api/oauth/google/callback` | GET | Google OAuth callback; create session; redirect to dashboard | 302 |
| `/auth/callback/google` | GET | Alias for Google OAuth callback | 302 |
| `/api/oauth/github/start` | GET | Redirect to GitHub OAuth | 302 |
| `/api/oauth/github/callback` | GET | GitHub OAuth callback; create session; redirect | 302 |
| `/api/agent/*` | * | Agent dashboard API (boot, terminal, chat, sessions, models, etc.) | JSON / SSE / 404 (see §3.3) |
| `/api/mcp/*` | * | MCP dashboard: status, agents, tools, commands, dispatch, services, invoke | JSON |
| `/api/r2/*` | * | R2 DevOps: stats, sync, buckets, list, upload, delete, url, bulk-action, buckets/:name/object/:key | JSON or binary (see §3.4) |
| `/api/workers` | GET | Worker registry list from D1 | JSON `{ workers }` |
| `/api/commands` | GET | Commands + custom_commands from D1, grouped | JSON |
| `/api/themes` | GET | cms_themes list | JSON |
| `/api/user/preferences` | PATCH | Update theme_preset (user_preferences) | JSON |
| `/` or `/index.html` | GET | Homepage from ASSETS: index-v3.html → index-v2.html → index.html | HTML or 404 |
| `/auth/signin`, `/auth/login`, `/auth/signup` | GET | Auth sign-in page from DASHBOARD `static/auth-signin.html` | HTML or 404 |
| `/dashboard`, `/dashboard/` | GET | Redirect 302 to `/dashboard/overview` | 302 |
| `/dashboard/pages/<name>.html` | GET | Fragment from DASHBOARD `static/dashboard/pages/<name>.html` | HTML or fall-through |
| `/dashboard/<segment>` | GET | Dashboard page: DASHBOARD `static/dashboard/<segment>.html` or `dashboard/<segment>.html` (segment = first path segment after /dashboard/) | HTML or 404 |
| Any other path | GET | Static asset: ASSETS then DASHBOARD by key = path.slice(1); special handling for /static/dashboard/ (Finance/Billing/Clients .jsx fallbacks) | R2 object body or 404 |

### 3.1 Browser API (`/api/browser/*`)

- `GET /api/browser/screenshot?url=...&refresh=true` — Puppeteer screenshot; optional KV cache; returns image or JSON error.
- `GET /api/browser/health` — Browser binding health.
- `GET /api/browser/metrics` — Page metrics for default URL.
- Otherwise — `notFound(url.pathname)`.

### 3.2 Finance API (`/api/finance/*`)

Sub-routes (by path segments after `/api/finance/`):

- `GET /api/finance/transactions` — List transactions.
- `GET /api/finance/transactions/:id` — Get one transaction.
- `PUT/DELETE /api/finance/transactions/:id` — Update or delete transaction.
- `POST /api/finance/transactions` — Create transaction.
- `POST /api/finance/import-csv` — CSV import.
- `summary`, `health`, `breakdown`, `categories`, `accounts`, `mrr`, `ai-spend` — Handlers by first segment; return JSON.

### 3.3 Agent API (`/api/agent/*`)

- `GET /api/agent/boot` — Batch D1 (agents, mcp_services, models, sessions, prompts); returns boot payload (terminal WS URL from env).
- `GET /api/agent/terminal/ws` — WebSocket upgrade for terminal (session required); proxies to TERMINAL_WS_URL.
- `POST /api/agent/terminal/run` — Run terminal command; records in agent_command_executions.
- `POST /api/agent/terminal/complete` — Complete execution (update status, output, deploy notes).
- `POST /api/agent/playwright/screenshot` — Playwright screenshot (sync or queue).
- `GET /api/agent/models` — List ai_models (optional ?provider=).
- `GET/POST /api/agent/sessions` — List or create agent_sessions.
- `GET /api/agent/sessions/:id/messages` — List agent_messages for conversation; optional workspace state from DASHBOARD.
- `POST /api/agent/chat` — Chat completion (streaming or non-streaming); uses AI, gateway, D1 (conversations, messages, telemetry, spend_ledger).
- `POST /api/agent/playwright` — Enqueue playwright job (MY_QUEUE) or run sync.
- `GET /api/agent/mcp` — MCP services list.
- `GET /api/agent/cicd` — CI/CD list with activity count.
- `GET /api/agent/telemetry` — Telemetry by provider (last 7 days).
- `POST /api/agent/rag/query` — AI RAG (autorag).
- `GET /api/agent/context/bootstrap` — Compiled context bootstrap (D1 cache + R2 memory).
- `GET /api/agent/bootstrap` — Bootstrap with R2 daily memory + schema.

### 3.4 R2 API (`/api/r2/*`)

- `GET /api/r2/stats` — r2_bucket_summary stats from D1.
- `POST /api/r2/sync` — Sync bucket stats to D1.
- `GET /api/r2/buckets` — List buckets (r2_bucket_list + r2_bucket_summary).
- `GET /api/r2/list?bucket=&prefix=&recursive=` — List objects (binding or S3 API).
- `POST /api/r2/upload?bucket=&key=` — Upload body to R2; optional D1 r2_objects insert.
- `DELETE /api/r2/delete?bucket=&key=` — Delete object (no binding delete in code; returns command suggestion).
- `GET /api/r2/url?bucket=&key=` — Return proxy URL for object.
- `POST /api/r2/buckets/bulk-action` — Bulk update r2_buckets / r2_bucket_summary (priority, cleanup_status, cleanup_notes).
- `GET /api/r2/buckets/:name/url/:key+` — Return proxy URL for object.
- `GET /api/r2/buckets/:name/object/:key+` — Serve object from binding or S3-style fetch.
- `DELETE /api/r2/buckets/:name/object` — Body `{ key }`; inserts agent_command_proposals + terminal_history; returns “run in terminal” message.
- `POST /api/r2/upload/:name` — Upload to named bucket (body = binary); optional r2_objects insert.

### 3.5 Catch-all / 404

- Unmatched paths that reach the end of the fetch handler: **Static asset** lookup (ASSETS then DASHBOARD, with /static/dashboard/ fallbacks). If no object found: **notFound(path)** → JSON `{ error: 'Not found', path }` with status 404.

### 3.6 Scheduled (cron)

- **Cron**: `0 0 * * *` (midnight UTC).
- **Handler**: `worker.scheduled`; dedupes by day via `email_logs` (subject LIKE '%Daily Digest%'); then `ctx.waitUntil(sendDailyDigest(env))`.
- **sendDailyDigest**: Reads deployments, spend_ledger, roadmap_steps, notification_outbox; calls Anthropic for summary; sends email via Resend; writes R2 memory/daily; writes email_logs; deletes ai_compiled_context_cache.

### 3.7 Queue

- **queue(batch, env, ctx)** — Consumes messages with `jobId`, `job_type`, `url`. If MYBROWSER/DASHBOARD/DB present: Puppeteer screenshot or render, upload to DASHBOARD, update playwright_jobs. Then `msg.ack()`.

---

## 4. R2 serving logic

### Bindings used

- **ASSETS** — bucket `inneranimalmedia-assets`. Homepage and general static assets.
- **DASHBOARD** — bucket `agent-sam`. Auth page, dashboard HTML, static/dashboard/* (including agent-dashboard JS/CSS), session state, screenshots/renders.
- **R2** — bucket `iam-platform`. Memory (e.g. memory/schema-and-records.md, memory/daily/YYYY-MM-DD.md), other app data.
- **CAD_ASSETS** — bucket `splineicons`. Used only in **getR2Binding** for by-name lookup (see below); no direct pathname→key mapping in the main fetch flow.

### Path → R2 key mapping

- **`/` or `/index.html`**  
  ASSETS: `index-v3.html` → `index-v2.html` → `index.html`.

- **`/auth/signin`, `/auth/login`, `/auth/signup`**  
  DASHBOARD: `static/auth-signin.html`.

- **`/dashboard/pages/<name>.html`**  
  DASHBOARD: `static/dashboard/pages/<name>.html`.

- **`/dashboard/<segment>`** (e.g. /dashboard/agent, /dashboard/overview)  
  First segment only. DASHBOARD: `static/dashboard/<segment>.html` then `dashboard/<segment>.html`.

- **Static (any other path)**  
  Key = path without leading slash: `assetKey = path.slice(1) || 'index.html'`.  
  - First try ASSETS.get(assetKey).  
  - Then DASHBOARD.get(assetKey).  
  - If path starts with `/static/dashboard/`: segment = first part after `/static/dashboard/`; try DASHBOARD.get(`dashboard/${staticSegment}`); then fallbacks for finance.jsx, billing.jsx, clients.jsx (lowercase and capitalized) to `static/dashboard/Finance.jsx` etc.  
  - noCache for paths starting with `/static/dashboard/agent/` or `/dashboard/`.

### R2 object response

- **respondWithR2Object(obj, contentType, options)** — Response body = obj.body; Content-Type = contentType; ETag if present; if options.noCache: Cache-Control and Pragma no-cache.

### getR2Binding(env, bucketName)

Used by R2 API (list, object get, upload). Map:

- `inneranimalmedia-assets` → env.ASSETS  
- `splineicons` → env.CAD_ASSETS  
- `agent-sam` → env.DASHBOARD  
- `iam-platform` → env.R2  

If bucket not in map and R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY exist, code can use S3-style signing (signR2Request) to access other buckets; no pathname→key mapping for those in the main document.

---

## 5. D1 database usage

**Binding name:** `DB` (wrangler: `database_name = "inneranimalmedia-business"`, `database_id = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"`).

Every D1 use is via `env.DB.prepare(...).run()`, `.first()`, `.all()`, or `env.DB.batch(...)`.

### Tables and operations (by route / context)

- **ai_compiled_context_cache** — DELETE (invalidate system cache); SELECT compiled_context (+ token_count); UPDATE (compiled_context, token_count, last_used_at); INSERT (context_hash, compiled_context, token_count). Routes: invalidateCompiledContextCache, /api/agent/chat, /api/agent/context/bootstrap, sendDailyDigest.
- **agent_ai_sam** — SELECT (id, name, role_name, mode; model_policy_json); UPDATE total_runs, last_run_at. Routes: /api/agent/boot, /api/agent/chat, /api/agent/mcp (agents list).
- **agent_command_executions** — INSERT; UPDATE status, output_text, exit_code, duration_ms, completed_at. Route: /api/agent/terminal/run, /api/agent/terminal/complete.
- **agent_command_proposals** — INSERT. Route: /api/r2/buckets/:name/object (DELETE body).
- **agent_conversations** — INSERT. Route: /api/agent/chat.
- **agent_messages** — INSERT; SELECT by conversation_id. Routes: /api/agent/chat, /api/agent/terminal/complete, /api/agent/sessions/:id/messages.
- **agent_sessions** — INSERT; SELECT (active, by conversation). Routes: /api/agent/boot, /api/agent/sessions, /api/agent/chat.
- **agent_telemetry** — INSERT; SELECT (by time, by provider). Routes: /api/agent/chat, /api/agent/telemetry, overview/recent-activity.
- **agent_workspace_state** — SELECT, UPDATE, INSERT. Route: /api/agent/sessions/:id/messages (state_json).
- **auth_sessions** — SELECT (id, user_id, expires_at); INSERT (Google/GitHub callback). Routes: getSession, handleGoogleOAuthCallback, handleGitHubOAuthCallback.
- **cicd_runs** — SELECT. Route: /api/overview/deployments.
- **clients** — SELECT; INSERT OR REPLACE. Routes: /api/clients, /api/billing/summary.
- **cloudflare_deployments** — SELECT; UPDATE (status, deployment_notes). Routes: /api/overview/*, /api/agent/terminal/complete, sendDailyDigest.
- **commands** — SELECT (with custom_commands). Route: /api/commands.
- **custom_commands** — SELECT. Route: /api/commands.
- **cicd** — SELECT with cicd_events. Route: /api/agent/cicd.
- **cicd_events** — JOIN in cicd query. Route: /api/agent/cicd.
- **cms_themes** — SELECT. Route: /api/themes.
- **email_logs** — SELECT (dedupe digest); INSERT (after Resend). Route: worker.scheduled (sendDailyDigest).
- **financial_transactions** — SELECT (summary, breakdown, monthly, etc.). Route: /api/finance/*.
- **finance_categories** — SELECT. Route: /api/finance/categories.
- **finance_transactions** — Used in handleFinanceBreakdown (category, direction, amount_cents). Route: /api/finance/breakdown.
- **financial_accounts** — SELECT. Route: /api/finance/accounts.
- **invoices** — SELECT (with clients). Route: /api/billing/summary.
- **iam_agent_sam_prompts** — SELECT. Route: /api/agent/boot.
- **agent_intent_patterns** — SELECT (workflow_agent, triggers_json). Route: /api/mcp/dispatch.
- **agent_memory_index** — SELECT (key, value, importance_score). Route: /api/agent/chat (context).
- **ai_knowledge_base** — SELECT (title, content, category). Route: /api/agent/chat (context).
- **mcp_agent_sessions** — SELECT (latest per agent); INSERT. Routes: /api/mcp/agents, /api/mcp/dispatch.
- **mcp_command_suggestions** — SELECT. Route: /api/mcp/commands.
- **mcp_registered_tools** — SELECT. Route: /api/mcp/tools, /api/mcp/invoke.
- **mcp_services** — SELECT; INSERT (on invoke). Routes: /api/agent/boot, /api/agent/mcp, /api/mcp/*.
- **mcp_tool_calls** — INSERT. Route: /api/mcp/invoke.
- **notification_outbox** — SELECT COUNT. Route: sendDailyDigest.
- **otlp_traces** — INSERT (batch). Route: /api/telemetry/v1/traces.
- **playwright_jobs** — SELECT; INSERT; UPDATE (status, result_url, error). Routes: /api/agent/playwright/screenshot, queue consumer.
- **playwright_jobs_v2** — SELECT (fallback). Route: /api/agent/playwright/screenshot.
- **project_time_entries** — SELECT. Routes: /api/overview/*, /api/dashboard/time-track.
- **projects** — SELECT COUNT (overview stats). Route: handleOverviewStats.
- **roadmap_steps** — SELECT. Routes: sendDailyDigest, overview (via digest).
- **r2_bucket_list** — SELECT. Route: /api/r2/buckets.
- **r2_bucket_summary** — SELECT; UPDATE; INSERT OR REPLACE. Routes: /api/r2/stats, /api/r2/sync, /api/r2/buckets, /api/r2/list, /api/r2/buckets/bulk-action.
- **r2_buckets** — SELECT; UPDATE (display_name, description, priority, is_active, priority). Routes: /api/r2/buckets, /api/r2/buckets/bulk-action.
- **r2_object_inventory** — SELECT; INSERT (with conflict). Routes: /api/r2/list, /api/r2/sync.
- **r2_objects** — INSERT (on upload). Route: /api/r2/upload, /api/r2/upload/:name.
- **spend_ledger** — INSERT; SELECT (sums, by provider, recent). Routes: /api/agent/chat, /api/finance/ai-spend, /api/overview/stats, sendDailyDigest.
- **terminal_history** — INSERT. Route: /api/r2/buckets/:name/object (DELETE body).
- **user_preferences** — INSERT/UPDATE (theme_preset). Route: /api/user/preferences.
- **workflow_checkpoints** — SELECT; INSERT; UPDATE. Route: /api/overview/checkpoints.
- **worker_registry** — SELECT. Route: /api/workers.
- **workspaces** — SELECT COUNT (category = 'client'). Route: handleOverviewStats.
- **ai_models** — SELECT (by provider, for picker). Routes: /api/agent/boot, /api/agent/models, /api/agent/chat (model lookup).

---

## 6. Environment bindings

### Referenced in worker.js

- **R2 buckets:** ASSETS, DASHBOARD, R2, CAD_ASSETS — all present in wrangler.production.toml.
- **D1:** DB — present.
- **KV:** KV (also fallback env['agent-sam'] for screenshot cache) — KV present; agent-sam is not a binding in wrangler (fallback only).
- **SESSION_CACHE** — KV namespace — present.
- **AI** — Workers AI — present.
- **MYBROWSER** — Browser (Puppeteer) — present.
- **HYPERDRIVE** — Not seen in worker.js fetch/queue/scheduled flow (may be used elsewhere or planned).
- **WAE** — Analytics Engine — not referenced in worker.js (may be used via platform or elsewhere).
- **MY_QUEUE** — Queue producer — present; consumer configured.
- **IAM_COLLAB**, **CHESS_SESSION** — Durable Objects — exported and bound; no direct env reference in routing.

### Vars (wrangler [vars])

- CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGES_ACCOUNT_HASH, GITHUB_CLIENT_ID, GOOGLE_CLIENT_ID, TENANT_ID, AI_GATEWAY_BASE_URL, AI_GATEWAY_OPENAI_BASE_URL — used or expected in worker.

### Secrets / env (not in wrangler; from .env.cloudflare or dashboard)

- **AI_GATEWAY_TOKEN** or **CF_AIG_TOKEN** — Gateway auth.
- **ANTHROPIC_API_KEY** — Chat + digest.
- **OPENAI_API_KEY** — Chat.
- **GOOGLE_AI_API_KEY** — Google AI chat.
- **GOOGLE_OAUTH_CLIENT_SECRET** — Google OAuth callback.
- **R2_ACCESS_KEY_ID**, **R2_SECRET_ACCESS_KEY** — S3-style R2 when bucket not bound.
- **TERMINAL_WS_URL**, **TERMINAL_SECRET** — Agent terminal WebSocket.
- **CF_ACCESS_CLIENT_ID**, **CF_ACCESS_CLIENT_SECRET** — Access (terminal).
- **RESEND_API_KEY** — Daily digest email.

### Mismatches / notes

- **env['agent-sam']** — Used as KV fallback for screenshot cache; no such binding in wrangler (KV binding is named KV). So screenshot cache uses KV when present.
- **HYPERDRIVE**, **WAE** — In wrangler but not used in the audited routing; no mismatch, just unused in this flow.

---

## 7. Auth / middleware

- **No global middleware wrapper.** Auth is per-route.
- **Session:** Cookie name `session`; value = session ID. Lookup in **getSession(env, request)**:
  - Parse Cookie, get `session=...`.
  - D1: `SELECT id, user_id, expires_at FROM auth_sessions WHERE id = ? AND datetime(expires_at) > datetime('now')`.
  - If row and user_id in SUPERADMIN_EMAILS → return getSamContext(email); else return row.
- **Routes that require session:**  
  /api/dashboard/time-track/manual, /api/overview/stats, recent-activity, activity-strip, deployments; /api/agent/terminal/ws; /api/overview/checkpoints (POST); and any handler that calls getSession and returns 401 when null.
- **OAuth state:** SESSION_CACHE: `oauth_state_${state}` and `oauth_state_github_${state}`; TTL 600s. No API key validation in code; auth is session-based or unchecked (e.g. /api/agent/boot and many /api/agent/* do not check session; /api/agent/chat can create session from body or getSession).
- **Superadmin:** Resolved from D1 (`auth_users.is_superadmin`), not from hardcoded email lists. Session creation: Google/GitHub callback inserts auth_sessions, sets Set-Cookie (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=2592000, Domain from hostname).

---

## 8. Build system

- **Worker:** Single file **worker.js**; no bundler. Wrangler deploys it as-is (with nodejs_compat).
- **Agent dashboard:** Vite (agent-dashboard/vite.config.js). Entry: src/main.jsx. Output: dist/agent-dashboard.js, agent-dashboard.css, agent-dashboard-[name].js chunks. base: `/static/dashboard/agent/`. Build: `npm run build` in agent-dashboard.
- **Overview / time-tracking:** Vite in overview-dashboard and time-tracking-dashboard; `npm run build` each; output in respective dist/. Not wired into deploy-agent-dashboard.sh (that script is agent-dashboard only).
- **deploy-agent-dashboard.sh** (run from repo root):
  1. cd agent-dashboard, npm run build.
  2. Upload to R2 bucket agent-sam: agent-dashboard.js, agent-dashboard.css, agent-dashboard-*.js chunks to prefix static/dashboard/agent (--remote, wrangler.production.toml).
  3. Backup source: upload src/*.jsx, *.tsx, *.ts, *.js and vite.config.js to agent-sam source/agent-dashboard/.
- **Worker deploy:** `./scripts/deploy-with-record.sh` (root package.json: `npm run deploy`). It:
  1. Sources .env.cloudflare if present.
  2. Runs `./scripts/with-cloudflare-env.sh wrangler deploy --config wrangler.production.toml`.
  3. Runs ./scripts/post-deploy-record.sh to insert a row into cloudflare_deployments (D1) with deploy_time_seconds, triggered_by, deployment_notes.
- **Wrangler deploy command:** `wrangler deploy --config wrangler.production.toml` (with env from with-cloudflare-env.sh). No separate build step for worker.js.

---

## 9. TypeScript interfaces / types

- **worker.js** is JavaScript; no inline type definitions. No .d.ts files in the repo.
- **server/terminal.ts** is TypeScript; types are local to that service (not shared with the Worker). No central shared types for themes, clients, users, messages, or roadmap steps documented in this repo; those concepts appear as plain objects in worker.js and in D1 row shapes.

---

## 10. Known issues or TODOs

- **mcp-server/src/index.js**  
  - Line 20511: `// TODO can its length be used as dataLevel if nil is removed?`  
  - Line 23090: `// TODO change to reference`  
  - Line 23158: `// TODO var`  
  - Lines 32931, 33113, 36083, 36140: `// TODO rename telemetry attributes to inputTokens and outputTokens`
- **time-tracking-dashboard/src/TimeTracking.jsx**  
  - Line 330: `// TODO: replace with agent_telemetry API fetch`

No // FIXME or // HACK found in worker.js or dashboard code in the searched paths. Commented-out code blocks were not enumerated; the codebase is large and many comments are inline.

---

## 11. Dependencies

### Root package.json

- **scripts:** "deploy": "./scripts/deploy-with-record.sh", "wrangler": "wrangler", "terminal": "cd server && npm start".
- **devDependencies:** @cloudflare/puppeteer, react, react-dom, recharts, wrangler.  
- **Note:** react/react-dom/recharts at root are dev-only; they are likely for local or script use rather than the Worker (Worker uses no React). No conflict with worker entry.

### agent-dashboard

- **dependencies:** highlight.js, marked, react, react-dom, xterm, xterm-addon-fit.
- **devDependencies:** @vitejs/plugin-react, vite.
- **scripts:** build, preview.

### overview-dashboard

- **dependencies:** react, react-dom, recharts.
- **devDependencies:** @vitejs/plugin-react, vite.
- **scripts:** build, preview.

### time-tracking-dashboard

- **dependencies:** react, react-dom, recharts.
- **devDependencies:** @vitejs/plugin-react, vite.
- **scripts:** build, preview.

### mcp-server

- Separate package; not part of Worker deploy.

### server (terminal)

- Separate package; terminal server run locally or via tunnel.

---

## 12. Wrangler config summary (wrangler.production.toml)

- **name:** inneranimalmedia  
- **main:** worker.js  
- **compatibility_date:** 2026-01-20  
- **compatibility_flags:** nodejs_compat  
- **workers_dev:** true  
- **logpush:** true  

**Routes:**

- inneranimalmedia.com/*
- www.inneranimalmedia.com/*
- webhooks.inneranimalmedia.com/*  
(zone_name: inneranimalmedia.com)

**Bindings:**

- **AI** — Workers AI
- **MYBROWSER** — Browser (Puppeteer)
- **ASSETS** — R2 inneranimalmedia-assets
- **CAD_ASSETS** — R2 splineicons
- **DASHBOARD** — R2 agent-sam
- **R2** — R2 iam-platform
- **DB** — D1 inneranimalmedia-business (database_id: cf87b717-d4e2-4cf8-bab0-a81268e32d49)
- **HYPERDRIVE** — id 9108dd6499bb44c286e4eb298c6ffafb
- **KV** — id 09438d5e4f664bf78467a15af7743c44
- **SESSION_CACHE** — id dc87920b0a9247979a213c09df9a0234
- **IAM_COLLAB** — DO IAMCollaborationSession
- **CHESS_SESSION** — DO ChessRoom
- **MY_QUEUE** — producer + consumer queue 74b3155b36334b69852411c083d50322
- **WAE** — analytics_engine_dataset inneranimalmedia

**Migrations:** tag v1 (new_classes IAMCollaborationSession), tag v2 (new_classes ChessRoom).

**Crons:** 0 0 * * * (midnight UTC).

**vars:** CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGES_ACCOUNT_HASH, GITHUB_CLIENT_ID, GOOGLE_CLIENT_ID, TENANT_ID, AI_GATEWAY_BASE_URL, AI_GATEWAY_OPENAI_BASE_URL.

**Observability:** enabled false; logs enabled, destination meauxbility-central-analytics; traces enabled, destination inneranimalmedia-selfhosted.

**Account ID** (from vars): ede6590ac0d2fb7daf155b35653457b2 (same as CLOUDFLARE_ACCOUNT_ID in vars). No environment-specific overrides in this file (e.g. [env.staging]); production only.

---

*End of architectural audit. Use this document to brief an agent for autonomous file edits and deployments; keep dashboard R2 upload and D1 approval rules from .cursor/rules in mind.*
