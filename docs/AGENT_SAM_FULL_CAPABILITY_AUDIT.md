# Agent Sam — Full capability inventory (audit)

**Date:** 2026-03-09  
**Scope:** Read-only audit of live R2 agent dashboard, worker routes, D1, and R2 buckets (agent-sam + **iam-platform**).  
**Purpose:** Know where we are before redesign; credentials are set in `.env.cloudflare` (gitignored).

---

## AUDIT TASK 2 — Sessions, projects, connectors, model schema (read-only)

**Date:** 2026-03-09. No edits. Report only.

### 1. Chat sessions schema (`agent_sessions`)

**PRAGMA table_info(agent_sessions) — exact columns:**

| cid | name             | type    | notnull | dflt_value   | pk |
|-----|------------------|---------|---------|--------------|----|
| 0   | id               | TEXT    | 0       | null         | 1  |
| 1   | tenant_id        | TEXT    | 1       | null         | 0  |
| 2   | agent_config_id  | TEXT    | 0       | null         | 0  |
| 3   | name             | TEXT    | 0       | null         | 0  |
| 4   | session_type     | TEXT    | 0       | 'chat'       | 0  |
| 5   | status           | TEXT    | 0       | 'active'     | 0  |
| 6   | state_json       | TEXT    | 1       | '{}'         | 0  |
| 7   | context_json     | TEXT    | 0       | '{}'         | 0  |
| 8   | participants_json| TEXT    | 0       | '[]'         | 0  |
| 9   | metadata_json    | TEXT    | 0       | '{}'         | 0  |
| 10  | started_at       | INTEGER | 1       | null         | 0  |
| 11  | updated_at       | INTEGER | 1       | null         | 0  |
| 12  | completed_at     | INTEGER | 0       | null         | 0  |
| 13  | role_id          | TEXT    | 0       | null         | 0  |
| 14  | user_id          | TEXT    | 0       | null         | 0  |
| 15  | device_label     | TEXT    | 0       | null         | 0  |
| 16  | created_at       | TEXT    | 0       | datetime('now') | 0  |

**Does agent_sessions have: title, starred, project_id, archived, pinned?**  
**No.** It has: `id`, `tenant_id`, `agent_config_id`, `name`, `session_type`, `status`, `state_json`, `context_json`, `participants_json`, `metadata_json`, `started_at`, `updated_at`, `completed_at`, `role_id`, `user_id`, `device_label`, `created_at`.  
There is **no** `title`, `starred`, `project_id`, `archived`, or `pinned` column. Session title could be stored in `name` or inside `metadata_json`/`state_json`.

**Last 3 rows (ORDER BY updated_at DESC):**

| id | tenant_id | agent_config_id | name | session_type | status | started_at | updated_at | created_at |
|----|-----------|-----------------|------|---------------|--------|------------|------------|------------|
| fed50ef8-1bd3-437e-bcac-c55239427082 | tenant_sam_primeaux | null | null | chat | active | 1773001111 | 1773001111 | 2026-03-08 20:18:31 |
| 47374f51-68d1-404d-845a-5272c427553d | tenant_sam_primeaux | null | null | chat | active | 1772998794 | 1772998794 | 2026-03-08 19:39:54 |
| 851de5d1-c68c-4baa-a2ff-f615c327ee8a | tenant_sam_primeaux | null | null | chat | active | 1772998352 | 1772998352 | 2026-03-08 19:32:32 |

All three have `name` null, `metadata_json` = `{}`, `state_json` = `{}`.

---

### 2. Projects / workspace / folder tables

**Tables matching '%project%' OR '%workspace%' OR '%folder%':**

legacy_projects, project_time_entries, project_time_summary, project_inquiries, cms_video_projects, cms_folders, project_members, ma_projects, client_projects, project_storage, meauxwork_workspaces, workspace_secrets, workspace_notes, project_costs, project_metrics, project_issues, project_links, workspaces, workspace_members_legacy, workspace_projects, elite_projects, project_outcomes, **projects**, workspace_tool_access, workspace_quotas, workspace_usage_metrics, project_goals, project_memory, project_capability_constraints, project_execution_audit, project_permissions, ai_project_context_config, user_workspace_preferences, tenant_workspaces, workspace_members, workspace_domains, workspace_settings, workspace_limits, workspace_audit_log, iam_project_worth, time_projects, cursor_project_context, agent_workspace_state, project_draws, ai_projects.

Canonical project/workspace tables include: **projects**, **workspaces**, **workspace_projects**, **tenant_workspaces**, **ai_projects**, **agent_workspace_state**, **cursor_project_context**.

---

### 3. MCP services / connectors registered

**Note:** `mcp_services` has **no `config` column**. It has `metadata` (TEXT). Queried: `id`, `service_name`, `service_type`, `is_active`, `endpoint_url`.

**What connectors are registered?** All 20 listed are **mcp-server** type; endpoints are IAM domains (mcp.inneranimalmedia.com, ai.inneranimalmedia.com, ide.inneranimalmedia.com, services.inneranimalmedia.com, dashboard.shinshusolutions.com, shinshusolutions.com, meauxxx.com). There are **no** rows named "GitHub", "Google Drive", or "Cloudflare" as connector products — they are client/app-specific MCP servers (e.g. "ACE Medical — MCP", "Anything Floors — MCP", "Meaux Cloud — MCP", "Inner Animal Media — MCP", "Ecosystem AutoRAG", "IAM IDE", "Shinshu Solutions — Dashboard", etc.).

| id | service_name | service_type | is_active | endpoint_url |
|----|--------------|--------------|-----------|--------------|
| mcp_client_les_kittrell | ACE Medical — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_dylan_hollier | Anything Floors — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_autorag | Ecosystem AutoRAG | mcp-server | 1 | https://ai.inneranimalmedia.com/rag |
| mcp_ai_dashboard | IAM AI Dashboard MCP | mcp-server | 1 | https://ai.inneranimalmedia.com/dashboard/mcp |
| mcp_ide | IAM IDE | mcp-server | 1 | https://ide.inneranimalmedia.com/ |
| mcp_ecosystem | IAM SaaS Ecosystem MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_services | IAM Services | mcp-server | 1 | https://services.inneranimalmedia.com/ |
| mcp_client_51838412025944c5 | Inner Animal App — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_6e067eaa16cba67c | Inner Animal Media — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_ca194253b55643f1 | Inner Autodidact — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_inneranimal | InnerAnimal Media MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_e148576390adcf16 | Meaux Cloud — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_meauxbility | Meauxbility (alt) — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_ea26fa10997a4364 | Meauxbility — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_church | New Iberia Church — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_pawlove | Paw Love Rescue — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_pelican | Pelican Peptides — MCP | mcp-server | 1 | https://mcp.inneranimalmedia.com/mcp |
| mcp_platform_inneranimal | Platform Inner Animal (meauxxx.com) | mcp-server | 1 | https://meauxxx.com |
| mcp_shinshu_dashboard | Shinshu Solutions — Dashboard | mcp-server | 1 | https://dashboard.shinshusolutions.com |
| mcp_shinshu_main | Shinshu Solutions — Main Site | mcp-server | 1 | https://shinshusolutions.com |

---

### 4. Models table — full list of active models

**Columns queried:** id, model_key, display_name, provider, context_max_tokens, input_rate_per_mtok, is_active.

**Providers present:** anthropic, google, openai, stability, workers_ai.

**Sample (full list is long):**  
- **anthropic:** Claude Haiku 4.5, Claude Opus 4, Claude Sonnet 4  
- **google:** Gemini 2.5 Flash (multiple ids), Gemini 2.5 Pro, Gemini 3 Flash, Gemini 3 Pro, Gemini 3 Pro Image Preview  
- **openai:** ChatGPT Image Latest, DALL-E 2/3, Davinci 002, GPT Audio, GPT Image 1/1 Mini/1.5, GPT-3.5 Turbo 16K, GPT-4 Turbo (several), GPT-4.1, GPT-4.1 Mini/Nano, GPT-4.5 Preview, GPT-4o (several), GPT-4o Mini, GPT-5, GPT-5 Mini/Nano/Pro, GPT-5.1, GPT-5.2 (several), Sora/Sora 2/Sora 2 Pro, TTS-1 HD, text-embedding-3-small, text-embedding-ada-002, o1, o1-mini, o3, o4-mini  
- **stability:** Stable Diffusion 3  
- **workers_ai:** Llama 3.1 8B, Workers AI — Audio Transcription, Embeddings, Image Generation  

All returned rows have `is_active = 1`. Many have `context_max_tokens` 0 (use provider default) or values like 128000, 200000, 1000000.

---

### 5. Theme count + sample css_vars structure

**COUNT(\*) FROM themes:** **69** themes.

**Actual var names inside theme_data.css_vars** (from json_extract(theme_data, '$.css_vars')):

- `--bg-surface`
- `--bg-elevated`
- `--bg-nav`
- `--color-primary`
- `--color-text`
- `--text-muted`
- `--color-border`

**Sample (name, display_name, vars):**

| name  | display_name | vars |
|-------|--------------|------|
| dark  | Dark         | {"--bg-surface":"#050507","--bg-elevated":"#0a0a0f","--bg-nav":"#0a0a0f","--color-primary":"#ff6b00","--color-text":"#ffffff","--text-muted":"#a0a0a0","--color-border":"rgba(255,107,0,0.2)"} |
| light | Light        | {"--bg-surface":"#ffffff","--bg-elevated":"#f5f5f5","--bg-nav":"#f5f5f5","--color-primary":"#ff6b00","--color-text":"#050507","--text-muted":"#666666","--color-border":"rgba(0,0,0,0.08)"} |
| dev   | Dev          | {"--bg-surface":"#050507","--bg-elevated":"#111a11","--bg-nav":"#0a0a0f","--color-primary":"#00ff41","--color-text":"#00ff41","--text-muted":"#a0a0a0","--color-border":"rgba(0,255,65,0.15)"} |

---

### 6. Agent memory + tool registry — tables (tool / command / queue / task / plan)

**Tables matching '%tool%' OR '%command%' OR '%queue%' OR '%task%' OR '%plan%':**

subtasks, event_queue, **tools**, **commands**, command_executions, command_templates, agent_commands, agent_command_executions, task_comments, task_activity, ai_tool_roles, fundraising_tasks_v1, kanban_tasks, meauxaccess_commands, **tasks**, tool_access, **plans**, ma_brand_tasks, plan_steps, plan_checklist_items, task_attachments, roadmap_plans, financial_plans, agent_command_conversations, agent_command_integrations, billing_plans, tool_capabilities, tool_capability_mapping, workspace_tool_access, command_execution_queue, **agent_tools**, cursor_tasks, task_velocity, decision_queue, tool_invocations, **agent_tasks**, migration_queue, ai_tasks, agent_command_audit_log, agent_command_proposals, custom_commands, **mcp_tool_calls**, **mcp_registered_tools**, mcp_command_suggestions.

**Do we have a tools registry, task queue, or planning table already?**  
**Yes.**  
- **Tools registry:** `tools`, `tool_access`, `tool_capabilities`, `tool_capability_mapping`, `tool_invocations`, `agent_tools`, **mcp_registered_tools** (MCP tool definitions).  
- **Command registry:** `commands`, `custom_commands`, `agent_commands`, `command_templates`, `meauxaccess_commands`, `mcp_command_suggestions`.  
- **Task/queue:** `tasks`, `agent_tasks`, `ai_tasks`, `cursor_tasks`, `command_execution_queue`, `event_queue`, `decision_queue`, `migration_queue`, `agent_command_executions`, `agent_command_proposals`, `mcp_tool_calls`.  
- **Planning:** `plans`, `plan_steps`, `plan_checklist_items`, `roadmap_plans`, `financial_plans`.

---

*Audit Task 2 complete. Use for tool-call loop design (worker passes tools array, tool-call loop, Agent Sam autonomous run).*

---

## 1. Credentials and env

- **Project:** `.env.cloudflare` in repo root (gitignored). Contains `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- **Loader:** `./scripts/with-cloudflare-env.sh` sources `.env.cloudflare` (or `~/.zshrc` if missing) then runs the given command. Use it for all `wrangler` R2/D1/deploy commands.
- **Terminal WebSocket:** Not in D1. The worker uses **Worker secrets**: `TERMINAL_WS_URL` and `TERMINAL_SECRET`. Set via Dashboard or `wrangler secret put`. There is **no `app_config` table** in D1; terminal config is env-only.

---

## 2. Live agent-dashboard (R2 agent-sam)

**Source:** Pulled from R2 at `agent-sam/static/dashboard/agent/agent-dashboard.js` and `agent-dashboard.css`.

### 2.1 Tabs / panels

- **Toolbar modes (main pane):** `chat` | `files` | `search` | `cli` | `terminal` | `ide` | `cicd` | `preview`.
- **Floating right panel tabs:** `preview` | `browser` | `terminal`.
  - **Preview:** HTML source / iframe preview (srcDoc); Edit, Refresh, Copy.
  - **Browser:** URL input + Go/Refresh; calls **POST `/api/playwright/screenshot`** and polls **GET `/api/playwright/jobs/:id`**; shows screenshot image; auto-refresh every 10s when tab active.
  - **Terminal:** WebSocket to **same-origin** `/api/agent/terminal/ws`; simple input line + output area (not xterm in the floating panel).
- **Chat pane** can be resized; preview panel toggle; theme cycle.

### 2.2 Terminal command trigger

- **In chat input:** Prefix **`/run `** (exact: `rawInput.startsWith("/run ")`) → command is `rawInput.slice(5).trim()`. Then:
  - **POST `/api/mcp/invoke`** with `{ tool_name: "terminal_execute", params: { command: cmd } }` (no call to `/api/agent/chat`).
- **Code blocks in chat:** "Run in terminal" uses **POST `/api/agent/terminal/run`** and a **WebSocket** to `/api/agent/terminal/ws` to stream output into the chat message.
- **CLI tab:** Types commands; `list-commands` / `ref` / `ls-commands` → **GET `/api/commands`**; other commands (e.g. `ls-agents`, `ls-models`, `ls-mcp`, `ls-tables`, `telemetry`, `boot`) are **local object lookups** (boot data, models, mcpServices, etc.), not backend calls except `/api/commands`.

### 2.3 Chat API — tools / tool_choice / MCP

- **POST `/api/agent/chat`** body (from repo source): `model_id`, `agent_id`, `session_id`, `messages`, `images`, `attached_files`, `stream: true`, optional `compiled_context`.
- **No `tools` or `tool_choice` or MCP params** are sent. Chat is plain messages → model → streamed text. The **chat flow does not call `/api/mcp/invoke`**; only the **`/run <cmd>`** prefix in the input bar does.
- **Stream handling:** Parses SSE for `type: "text"`, `type: "done"`, `type: "error"`; extracts `OPEN_IN_PREVIEW: <url>`, `[SCREENSHOT: <url>]`, and HTML blocks for preview panel.

### 2.4 WebSocket URL for terminal

- **Main Terminal tab (xterm):** `(location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/api/agent/terminal/ws"` (same origin).
- **Floating panel Terminal tab:** Same URL in `FloatingPreviewPanel.jsx` logic (minified in bundle).
- **Worker:** Proxies to upstream from **env.TERMINAL_WS_URL** (secret); adds `token` query or `x-terminal-secret` header from **env.TERMINAL_SECRET** when set. No D1/config for this URL.

### 2.5 Preview / iframe / globe

- **Preview panel:** Exists; URL bar + iframe for `previewUrl`; separate "Preview" tab in floating panel with HTML edit + iframe (srcDoc).
- **Browser tab:** Screenshot capture via Playwright/Puppeteer API; no live iframe of a URL in that tab (only the screenshot image).
- **Globe icon:** Not found as a distinct control in the live bundle; "Pop out" button in floating panel opens current tab content in a new window.

---

## 3. Live agent-dashboard.css (R2)

- **Single minified line.** Uses **CSS variables** throughout: `var(--bg-canvas)`, `var(--border)`, `var(--text-primary)`, `var(--accent)`, `var(--bg-elevated)`, `var(--font-family)`, `var(--font-mono)`, etc.
- **Hardcoded hex:** `#00000040` (box-shadow), `#ffffff26` (border-color in focus-within).
- **!important:** One: `.agent-input-bar-wrap:focus-within { border-color: #ffffff26 !important; }`.
- **Media query:** `@media (max-width: 768px)` with `display: none !important` / `width: 100% !important` for responsive hiding of chat pane and panel resize.

---

## 4. MCP + CLI wiring

- **Chat flow:** Does **not** call `/api/mcp/invoke` for normal messages. Only **user-typed `/run <cmd>`** triggers **POST `/api/mcp/invoke`** with `terminal_execute`.
- **Chat request:** Does **not** pass `tools` or `tool_choice` to the model.
- **CLI tab:** Calls **GET `/api/commands`** for `list-commands` / `ref` / `ls-commands`; other commands are local (help, ls-agents, ls-models, ls-mcp, ls-tables, telemetry, boot from in-memory boot state). No dedicated `/api/cli` route; CLI is client-side + `/api/commands`.

---

## 5. Worker route audit — agent / playwright / terminal / mcp

**Agent:**

- `GET /api/agent/boot` — D1 batch: agents, mcp_services, models, sessions, prompts; returns JSON (no terminal_ws_url in payload).
- `GET /api/agent/terminal/ws` — WebSocket upgrade; proxies to env.TERMINAL_WS_URL with auth.
- `POST /api/agent/terminal/run` — Runs command via upstream WS; returns execution_id, etc.
- `POST /api/agent/terminal/complete` — Marks execution completed/failed.
- `POST /api/agent/chat` — Main chat; no tool-call loop.
- `GET /api/agent/models`, `GET /api/agent/sessions` — D1 reads.
- `GET /api/agent/mcp`, `GET /api/agent/cicd` — Lists.
- `GET /api/agent/telemetry` — Telemetry.
- `POST /api/agent/rag/query` — RAG query.
- `GET /api/agent/context/bootstrap`, `GET /api/agent/bootstrap` — Bootstrap (includes R2 memory).
- `POST /api/agent/playwright` — Enqueue playwright job (MY_QUEUE).

**Playwright / browser:**

- `POST /api/playwright/screenshot` — Creates job in `playwright_jobs`, runs Puppeteer (MYBROWSER), uploads to R2, updates job with result_url.
- `GET /api/playwright/jobs/:id` — Returns job status and result (result_url or result.screenshot_url depending on schema).
- `GET /api/browser/screenshot` — Direct Puppeteer screenshot (GET with url param).
- `GET /api/browser/health`, `GET /api/browser/metrics` — Browser binding health.

**MCP:**

- `GET /api/mcp/status`, `GET /api/mcp/agents`, `GET /api/mcp/tools`, `GET /api/mcp/commands`, `GET /api/mcp/services`, `POST /api/mcp/dispatch`, `POST /api/mcp/invoke` — MCP dashboard and tool invocation.

**Other:**

- `GET /api/commands` — Returns commands from D1 (`commands`, `custom_commands`).

**D1:** There is **no `worker_routes` table** in the database; routes are defined only in `worker.js`.

---

## 6. D1 — themes

- **Table:** `themes`.
- **Columns:** `id`, `name`, `display_name`, `description`, `is_custom`, `theme_data`, `created_by`, `created_at`, `updated_at`. **No `theme_key` or `css_vars` column**; theme vars are inside **`theme_data`** (JSON).
- **Sample `theme_data` (css_vars):** `--bg-surface`, `--bg-elevated`, `--bg-nav`, `--color-primary`, `--color-text`, `--text-muted`, `--color-border` (hex or rgba). Example ids: `dark`, `light`, `dev`, `simple`, `galaxy`.

---

## 7. D1 — app_config / terminal

- **Table `app_config` does not exist** in D1. Terminal WebSocket URL and secret come from **Worker secrets** (`TERMINAL_WS_URL`, `TERMINAL_SECRET`), not D1.

---

## 8. R2 buckets — agent-sam vs iam-platform

**agent-sam (binding DASHBOARD):**

- Dashboard HTML, JS, CSS: `static/dashboard/*.html`, `static/dashboard/agent/agent-dashboard.{js,css}`, etc.
- Worker source backup: `source/worker-source.js`.
- Scripts: e.g. `scripts/overnight.js`.
- **Do not** use agent-sam for vector docs or daily memory.

**iam-platform (binding R2):**

- **Vector docs / memory:** This bucket is where we store **memory and platform docs** for the agent and bootstrap.
- **Keys:**
  - `memory/schema-and-records.md` — Bootstrap/schema memory for Agent Sam.
  - `memory/daily/YYYY-MM-DD.md` — Daily memory logs (e.g. `./scripts/upload-daily-log-to-r2.sh`).
- **Worker:** Reads these via `env.R2.get(...)` for bootstrap and compiled context. GET `/api/agent/bootstrap` returns daily_log, yesterday_log, schema_and_records_memory from R2 (iam-platform).
- **Rule:** Do not use iam-platform for worker source or dashboard static assets; those live only in **agent-sam**.

---

## 9. Summary checklist

| Item | Status |
|------|--------|
| Live agent-dashboard.js from R2 | Pulled (68 lines = 1 bundle + loader, ~190k chars minified) |
| Live agent-dashboard.css from R2 | Pulled; uses CSS vars; 1 hex + 1 !important |
| Tabs: chat, CLI, terminal, preview, browser, etc. | Present and wired |
| Terminal trigger | `/run ` prefix → `/api/mcp/invoke` (terminal_execute); code block → `/api/agent/terminal/run` + WS |
| Chat API sends tools/tool_choice/MCP? | No |
| Chat flow calls /api/mcp/invoke? | Only when user types `/run <cmd>` |
| CLI tab backend | GET /api/commands for list-commands; rest local |
| WebSocket URL | Same-origin `/api/agent/terminal/ws`; upstream from TERMINAL_WS_URL secret |
| Preview/iframe/globe | Preview panel + Browser (screenshot) tab; no globe icon |
| D1 themes | Table `themes`; theme_data (JSON) with css_vars |
| D1 app_config / worker_routes | No such tables |
| Terminal config | Worker secrets only (TERMINAL_WS_URL, TERMINAL_SECRET) |
| R2 iam-platform | Memory/vector docs: memory/schema-and-records.md, memory/daily/YYYY-MM-DD.md |

---

## AUDIT TASK 3 — Tools registry, planning schema, AutoRAG, worker source, Vectorize (read-only)

**Date:** 2026-03-09. No edits. Report verbatim.

### 1. Tools registered in mcp_registered_tools

**PRAGMA table_info(mcp_registered_tools):** id (TEXT PK), tool_name (TEXT NOT NULL), tool_category (TEXT NOT NULL), mcp_service_url (TEXT NOT NULL), description (TEXT), input_schema (TEXT), requires_approval (INTEGER default 0), **enabled** (INTEGER default 1), cost_per_call_usd (DECIMAL), created_at, updated_at.  
**Note:** Column is `enabled`, not `is_active`.

**SELECT id, tool_name, description, input_schema, enabled FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name** — 19 rows:

| tool_name | description |
|-----------|-------------|
| d1_query | Run a SELECT query against D1 database |
| d1_write | Execute INSERT, UPDATE, or DELETE on D1 |
| get_deploy_command | Get the deploy command for a worker |
| get_worker_services | Get all worker service bindings |
| human_context_add | Add a new human context memory entry |
| human_context_list | List human context memory entries |
| list_clients | List all clients in the system |
| list_workers | List all deployed Cloudflare Workers |
| platform_info | Get platform and environment info |
| r2_bucket_summary | Summarize contents of an R2 bucket |
| r2_list | List objects in an R2 bucket |
| r2_read | Read a file from R2 storage |
| r2_search | Search R2 objects by key pattern |
| r2_write | Write a file to R2 storage |
| telemetry_log | Log a telemetry event |
| telemetry_query | Query telemetry events |
| telemetry_stats | Get telemetry statistics |
| **terminal_execute** | Execute a terminal command via the worker |
| worker_deploy | Deploy a Cloudflare Worker |

There is **no** `browser_screenshot` or `playwright_screenshot` in mcp_registered_tools; screenshot is only via POST /api/playwright/screenshot and the queue.

---

### 2. agent_tools + tools table schema

**agent_tools:** id (TEXT PK), agent_role_id (TEXT NOT NULL), tool_name (TEXT NOT NULL), tool_binding (TEXT), config_json (TEXT), is_active (INTEGER default 1), created_at (TEXT).  
**Sample rows (first 5):** Shinshu/Platform role bindings — cloudflare_workers_list, cloudflare_builds_get, d1_query, r2_object_put, r2_object_list (tool_binding: CF_API, D1, R2; config_json has account_id or bucket).

**tools:** id, tenant_id, name, display_name, category, icon, description, config, is_enabled, is_public, version, created_at, updated_at, domain_id, worker_id, auth_required, auth_type, access_level.  
**Note:** Column is `is_enabled`, not `is_active`; no `tool_type` column (use `category`).  
**Sample (is_enabled = 1, limit 20):** Product/app entries — meauxaccess, iautodidact, admin-portal, fuelintime, api-base, asset-manager, settings, pelican-peptides, southern-pets, pawlove, newiberia-church, anything-floors, shinshu-solutions, mcp-server, financial-mcp-server, inneranimalmedia, meauxcloud, meauxbility, innerautodidact (categories: productivity, admin, app, infrastructure, tools, system, client, mcp, platform).

---

### 3. plans + plan_steps + agent_tasks schema (multi-step / task UI)

**plans:** id (TEXT PK), name, type, price (REAL), currency (default 'USD'), interval, description, features, created_at (DATETIME).  
This is a **pricing/billing plans** table (name, type, price, currency, interval), not an agent multi-step plan table.

**plan_steps:** id (TEXT PK), **project_id** (TEXT NOT NULL), step_index (INTEGER NOT NULL), title (TEXT NOT NULL), description (TEXT), status (TEXT default 'not_started'), notes_md (TEXT default ''), links_json (TEXT default '[]'), created_at, updated_at.  
So plan_steps are steps under a project (project_id), not under the billing `plans` table — likely used with a different parent (e.g. roadmap or project plan).

**agent_tasks:** id (TEXT PK), conversation_id (TEXT NOT NULL), message_id (TEXT), title (TEXT NOT NULL), description (TEXT), status (TEXT default 'pending'), priority (INTEGER default 0), files_affected (TEXT default '[]'), commands_run (TEXT default '[]'), created_at (INTEGER), started_at (INTEGER), completed_at (INTEGER), metadata_json (TEXT default '{}').  
Tied to a conversation/message; supports task tracking (title, description, status, commands_run, timestamps).

---

### 4. Worker source — chat handler and tool-call logic

**Pulled:** agent-sam/source/worker-source.js → /tmp/worker-source.js (**4053 lines**).

**Grep (tool_call, tool_use, tools, tool_choice, /api/agent/chat, terminal_execute, mcp/invoke):**  
- worker.js: `/api/agent/chat` at 1937 (POST handler), `/api/mcp/invoke` at 2685 (POST), mcp_tool_calls INSERT at 2726.  
- **No** `tool_call`, `tool_use`, `tools:`, or `tool_choice` in the chat path.

**Does the worker have any tool-call loop logic?** **No.** The chat handler: (1) loads model, builds messages (user/assistant content only), (2) optionally runs RAG via `env.AI.autorag('inneranimalmedia-aisearch').search()`, (3) builds compiled context (schema memory from R2, memory index, knowledge base, MCP list), (4) calls the AI gateway with **messages + system prompt** — no `tools` or `tool_choice` in the request, (5) streams the model response back (SSE or JSON). There is no “model returns tool_use → worker executes tool → appends result to messages → calls model again” loop.

**What does the chat handler do with the model response?** It streams the reply (text) to the client and can write telemetry/session to D1. It does not parse tool calls or invoke MCP from the chat flow.

---

### 5. AutoRAG — how it's wired

**Grep (autorag, AutoRAG, vectorize, VECTORIZE, rag, RAG) in worker.js:**  
- `env.AI.autorag('inneranimalmedia-aisearch')` — used with `.aiSearch({ query, stream: false })`, `.search({ query })` (around 380–381, 1981, 2479–2480).  
- `/api/agent/rag/query` at 2475 (POST); handler calls `env.AI.autorag('inneranimalmedia-aisearch').search()`.  
- Chat handler (1977–1991): when `env.AI` and lastUserContent has enough words, it calls `env.AI.autorag('inneranimalmedia-aisearch').search({ query: lastUserContent })` and injects `ragContext` into the system/context.  
- **No** direct `env.VECTORIZE` or Vectorize index calls in the worker; RAG is via the **AI** binding’s **autorag** API.

**Is AutoRAG called via the MCP endpoint or direct Vectorize binding?**  
**Direct AI binding.** AutoRAG is invoked as `env.AI.autorag('inneranimalmedia-aisearch').search()` (and `.aiSearch()` elsewhere). The index name `inneranimalmedia-aisearch` matches the Vectorize index in wrangler. So the worker uses the **AI** binding (Cloudflare AI / Workers AI) with **autorag**, which backs onto the Vectorize index; it does **not** call the MCP service `mcp_autorag` (https://ai.inneranimalmedia.com/rag) for chat or /api/agent/rag/query.

**D1 mcp_autorag:** id = mcp_autorag, service_name = "Ecosystem AutoRAG", endpoint_url = "https://ai.inneranimalmedia.com/rag", metadata = null. So the MCP row exists for dashboard/ecosystem listing; the worker’s RAG path does not use this URL.

**Binding name:** **AI** (wrangler `[ai]` binding = "AI"). Vectorize index is **ai-search-inneranimalmedia-aisearch** (binding **VECTORIZE** in wrangler); autorag uses the same index name string `'inneranimalmedia-aisearch'`.

---

### 6. iam-platform memory (schema-and-records.md)

**Pulled:** iam-platform/memory/schema-and-records.md → /tmp/schema-memory.md (**137 lines**).

**First 80 lines (summary):**  
- Doc title: "Agent memory: schema, records, and D1 workflow". Purpose: loaded into AI memory (bootstrap + Cursor) for backfill, correcting data, consolidating tables; AI suggests first, user approves, then execute D1/SQL.  
- Section 1: How the AI should work with D1 — suggest first, wait for approval, then execute; prefer consolidating into canonical tables.  
- Section 2: Canonical tables — **agent_telemetry** (tokens per LLM call, written by worker on /api/agent/chat), **spend_ledger** (dollars, read by /api/finance/ai-spend), **project_time_entries** (time tracking, POST /api/dashboard/time-track/start, /end, heartbeat).  
- Section 3: Other canonical tables — agent_sessions, agent_messages, ai_models, cloudflare_deployments, projects.  
- cloudflare_deployments: purpose, written by post-deploy-record.sh, agent must set TRIGGERED_BY=agent and DEPLOYMENT_NOTES when agent deploys; schema (deployment_id, worker_name, project_name, deployment_type, environment, status, deployment_url, preview_url, triggered_by, deployed_at, created_at; 114: build_time_seconds, deploy_time_seconds; 115: deployment_notes); index and read patterns.

**What does Agent Sam currently know from this file?** D1 workflow (suggest-then-approve), canonical tables (agent_telemetry, spend_ledger, project_time_entries, agent_sessions, agent_messages, cloudflare_deployments, projects), deploy attribution rules, and backfill hints. It does **not** describe the chat API, tool-call loop, or MCP tools — so it’s **not stale for schema/D1** but **does not** reflect that the model cannot run tools mid-chat (no tools array, no tool loop).

---

### 7. wrangler.production.toml — full bindings list

**Bindings (exact names):**  
- **[ai]** binding = **AI**  
- **[browser]** binding = **MYBROWSER**  
- **R2:** ASSETS (inneranimalmedia-assets), CAD_ASSETS (splineicons), **DASHBOARD** (agent-sam), **R2** (iam-platform)  
- **D1:** **DB** (inneranimalmedia-business)  
- **Hyperdrive:** **HYPERDRIVE** (id 9108dd6499bb44c286e4eb298c6ffafb)  
- **Vectorize:** **VECTORIZE** (index_name = ai-search-inneranimalmedia-aisearch)  
- **KV:** KV, SESSION_CACHE  
- **Queues:** **MY_QUEUE** (producers + consumers, queue id 74b3155b36334b69852411c083d50322)  
- **Analytics:** **WAE** (dataset inneranimalmedia)  
- **Durable objects:** IAM_COLLAB (IAMCollaborationSession), CHESS_SESSION (ChessRoom)

No separate BROWSER name; browser binding is **MYBROWSER**. VECTORIZE binding exists; AI binding is **AI**.

---

### 8. Browser content extraction — fetch/scrape route

**Grep (fetch, scrape, extract, browse, navigate, page.goto, page.content, innerText, textContent):**  
- **page.goto:** Used in queue consumer (playwright job) and in POST /api/playwright/screenshot sync path; both use Puppeteer to navigate then either **screenshot** or (in queue only) **page.content()** for job_type `render`.  
- **page.content():** Only in the **queue consumer** (worker.js ~529): when job_type === 'render', HTML is read from the page, uploaded to R2 (DASHBOARD) at `renders/{jobId}.html`, and result URL stored in playwright_jobs.  
- **Public HTTP routes under /api/browser/:** Only **/api/browser/screenshot** (GET — returns image), **/api/browser/health**, **/api/browser/metrics**.  

**Is there any route that navigates a URL with Puppeteer and returns text content (not just a screenshot)?** **No.** There is no GET /api/browser/content or /api/scrape or /api/browser/html that returns page HTML or text to the client. The only place that gets page content is the **queue consumer** for job_type `render`, which writes HTML to R2 and returns a URL; the client would have to poll the job and then fetch that URL. So no direct “navigate and return text in response body” route.

---

*Audit Task 3 complete. Use for tool-call loop design (mcp_registered_tools has terminal_execute + 18 others; no browser_screenshot; worker has no tool loop; AutoRAG via AI.autorag; schema memory in iam-platform; no scrape route).*

---

## AUDIT TASK 4 — Shell, Playwright capabilities, MCP server, worker routes (read-only)

**Date:** 2026-03-09. No edits. Report verbatim.

### 1. Live shell.css (R2 agent-sam/static/dashboard/shell.css)

**Pulled:** 34 lines.

**Content:** Defines `.topbar` (sticky, z-index 1000, height 60px, padding 0 20px, gap 20px), `.main-content`, `.topbar-right`, `.profile-wrap`, `.clock-wrap`, `.search-wrap`, and dropdowns (`#clock-dropdown`, `#notifications-dropdown`, `.search-dropdown`, `.profile-dropdown` with z-index 1100).

**CSS vars used:** `var(--bg-nav)`, `var(--border-nav)`. No hardcoded hex colors in this file.

**Hardcoded pixel values:** `60px` (topbar height), `20px` (padding, gap), `1000` / `1100` (z-index). No breakpoints or safe-area in shell.css itself.

**Does it define topbar, sidenav, mobile nav?** It defines **topbar** only. It does **not** define sidenav or mobile nav; those are in each page’s inline CSS or in styles_themes.css. shell.css is “shared shell: topbar and dropdowns above page content.”

---

### 2. Live shell.js (R2 agent-sam/static/dashboard/shell.js)

**Exists:** Yes. **441 lines.**

**First 100 lines (summary):**  
- `updateHeaderLogo()` — sets logo by `data-theme` (white logo URL for all themes).  
- **Mobile nav:** `hamburger`, `sidenav`, `overlay` — click hamburger toggles `open` on hamburger/sidenav/overlay; overlay click closes.  
- **Sidebar collapse:** `sidenavToggle`, `SIDENAV_COLLAPSED_KEY = 'dashboard_sidenav_collapsed'`, `updateSidenavWidth()` sets `--dashboard-sidenav-width` to `56px` (collapsed) or `260px`. Persists in localStorage.  
- **Clock:** `clock-btn`, `clock-dropdown`, live time/date, timer start (redirects to /dashboard/time-tracking), reminder (prompt minutes, Notification or alert).

So **shell.js** defines: logo by theme, **hamburger/sidenav/overlay** (mobile), **sidenav collapse** (desktop), **clock dropdown** (time, timer, reminder). Topbar/sidenav structure is in HTML; shell.js wires behavior.

---

### 3. All static dashboard files in R2

**Note:** `wrangler r2 object list` does not support `--prefix` in the current wrangler version (only get/put/delete). So listing was not done via CLI.

**From worker routing and repo:**  
- Worker serves `/dashboard/<segment>` from R2 key `static/dashboard/<segment>.html` or `dashboard/<segment>.html`.  
- Worker serves `/dashboard/pages/<name>.html` from `static/dashboard/pages/<name>.html` (fragments for shell #page-content injection).  
- Repo and agent-sam reference: **shell.css**, **shell.js**, **shell-v2.html**; **styles_themes.css** (external R2 pub URL); **overview.html**, **agent.html**, **chats.html**, **cloud.html**, **finance.html**, **time-tracking.html**, **mcp.html**; **Finance.js**, **Billing.jsx**, **Clients.jsx**; **agent/agent-dashboard.js**, **agent-dashboard.css**; **pages/** (billing, calendar, clients, cms, draw, images, kanban, mail, meet, onboarding, pipelines, tools).  
- **No** nav.html, topbar.html, or header.html in routes; no shared partials served as separate URLs. Topbar/sidenav are **in each full HTML file** (or shell-v2.html if used).

---

### 4. What the worker serves for the shell — server-side injection?

**Grep worker-source.js (shell, topbar, sidenav, nav, header, layout, inject, partial, template):**  
- Line 437 (comment): “Dashboard page fragments: /dashboard/pages/<name>.html -> static/dashboard/pages/<name>.html (for shell **#page-content** injection)”.  
- Lines 386–397: theme API returns CSS vars (`--bg-nav`, `--text-nav`, `--border-nav`, etc.).  
- **No** server-side injection of topbar/sidenav into HTML. Worker serves **full HTML** from R2 for `/dashboard/<page>`. So **topbar/sidenav are in each HTML file** (or loaded by that HTML via shell.css/shell.js). The “shell” is the shared CSS/JS plus the same structure repeated in each dashboard page HTML; **no** worker template or partial injection.

---

### 5. Playwright MCP server — tools exposed by mcp.inneranimalmedia.com

**Request:** `POST https://mcp.inneranimalmedia.com/mcp` with `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`.  
**Response:** `{"error":"Unauthorized","message":"Missing or invalid Authorization header"}`.  
**SSE try:** Not run (would need same auth).  
**Report:** The MCP server at mcp.inneranimalmedia.com **requires authorization**. Tools/list was not enumerated; tool names/descriptions are not reported. To list tools, call with valid auth (e.g. token or session).

---

### 6. Playwright capabilities in the worker queue consumer

**Grep worker-source.js (page., playwright, MYBROWSER, browser., job_type, render, screenshot, navigate, click, fill, evaluate, waitFor):**  
- **Queue consumer (lines 490–517):** Reads `jobId`, `job_type`, `url` from message body. If `job_type === 'screenshot'`: `page.screenshot({ type: 'png', fullPage: true })`, upload to R2, set result_url. If `job_type === 'render'`: `page.content()`, upload HTML to R2, set result_url. Only **browser.newPage()**, **page.goto(url)**, **page.screenshot()**, **page.content()**.  
- **Sync POST /api/playwright/screenshot (1792–1817):** Same: newPage, setViewport(1280,800), goto, screenshot, upload, update DB.  
- **GET /api/browser/screenshot:** goto, screenshot (jpeg).  
- **GET /api/browser/metrics:** goto, **page.metrics()**, return metrics.  
- **job_type values in code:** `'screenshot'` and `'render'` only.  

**What job_types exist beyond screenshot and render?** **None.** Only `screenshot` and `render`.  
**Does the queue consumer support click, fill, evaluate, extract?** **No.** No `page.click()`, `page.fill()`, `page.evaluate()`, or text extraction. Only goto + screenshot or goto + page.content() (HTML string).

---

### 7. Current topbar nav items — hardcoded or generated

**Grep worker-source.js for nav-item, sidenav, href dashboard, Overview, Finance, Agent, MCP, Cloud:** No matches (worker does not contain HTML).  
**Grep dashboard/overview.html (repo):** Nav items appear in HTML: e.g. `.item` with `data-url="/dashboard/overview"` (“Overview”), `data-url="/dashboard/finance"` (“Finance”), link to `/dashboard/time-tracking`, etc. So **nav items are hardcoded in each dashboard HTML file**, not generated by the worker.

**D1 — tables matching nav/menu/route/page/sitemap:**  
api_gateway_routes, cms_page_overrides, cms_site_pages, cms_page_sections, cms_navigation_menus, cms_page_drafts, cms_pages.  
**No** dedicated dashboard nav or menu table; CMS has cms_navigation_menus / cms_pages. Dashboard sidebar/topbar links are **not** from D1.

**D1 — tables matching %setting%:**  
workspace_settings, settings, cms_global_settings, user_settings.  
No “nav_config” or “dashboard_menu” table.

---

### 8. Mobile breakpoints and safe-area handling

**Pulled:** agent-sam/static/dashboard/overview.html → /tmp/overview.html.  
**Grep (safe-area, mobile, 768, breakpoint, hamburger, sidenav, topbar):**  
- **Safe-area:** `--safe-area-top: env(safe-area-inset-top, 0);` (and bottom, left, right) in `:root`.  
- **Sidenav width:** `:root { --dashboard-sidenav-width: 260px; }`.  
- **Topbar:** `.topbar`, `.topbar-left`, `.topbar-center`, `.topbar-right`, `.hamburger`, `.hamburger.open span` transforms.  
- **Mobile:** `@media (max-width: 768px)` — search-mobile-btn display, .sidenav positioning/transform, `.sidenav.open { transform: translateX(0); }`.  
- **Sidenav:** `.sidenav`, `.sidenav.collapsed`, `.sidenav-header`, `.sidenav-toggle`, `.nav-item`, etc.  
So **768px** is the mobile breakpoint; **safe-area** env() vars are set; **hamburger** toggles sidenav; **topbar/sidenav** are defined in the page (overview.html). Same pattern expected in other dashboard pages.

---

### 9. Session messages — how they are stored

**PRAGMA table_info(agent_messages):**  
id (TEXT PK), conversation_id (TEXT NOT NULL), role (TEXT NOT NULL), content (TEXT NOT NULL), provider (TEXT), file_url (TEXT), created_at (INTEGER NOT NULL), thinking_time_seconds (INTEGER default 0), thinking_content (TEXT), message_type (TEXT default 'message'), metadata_json (TEXT default '{}'), token_count (INTEGER default 0), is_compaction_marker (INTEGER default 0).

**SELECT COUNT(\*) FROM agent_messages:** **486** rows.

---

*Audit Task 4 complete. Shell: shell.css (topbar only, vars); shell.js (logo, hamburger/sidenav, collapse, clock). Worker: no server-side shell injection; full HTML from R2. MCP tools/list: auth required. Queue: only screenshot + render; no click/fill/evaluate. Nav: hardcoded in HTML; no D1 nav table. Mobile: 768px, safe-area env(). agent_messages: 486 rows, schema above.*

---

*Audit complete. Use this as the baseline before redesign. Credentials are in `.env.cloudflare`; use `./scripts/with-cloudflare-env.sh` for all wrangler commands.*
