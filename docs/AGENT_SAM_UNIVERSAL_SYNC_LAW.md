# Agent Sam — D1 audit (repo-derived) and Universal Sync Law

**Scope:** This audit is built from **migrations/** and **`worker.js` references** in this monorepo. It does **not** replace `PRAGMA table_info` on production D1. If live D1 has extra columns or tables, treat this doc as **intent + wiring map** and reconcile with Studio.

**Naming note:** There is **`cicd_active_workflows`** (view, referenced in older docs/TOMORROW), not `cicd_active_log`. **`cicd_recent_completions`** is a **VIEW** over `cicd` (filter completed + recent `actual_completion_date`). You cannot INSERT into views.

---

## Part 1 — Audit by namespace

### 1.1 `agentsam_*` (Cursor / dashboard policy plane)

| Table | Migration | Worker / API |
|-------|-----------|--------------|
| `agentsam_user_policy` | `163_agentsam_cursor_parity.sql` | `/api/agentsam/*` — GET/PUT policy |
| `agentsam_command_allowlist` | 163 | CRUD via agentsam API |
| `agentsam_mcp_allowlist` | 163 | CRUD |
| `agentsam_fetch_domain_allowlist` | 163 | CRUD |
| `agentsam_browser_trusted_origin` | 163 | CRUD |
| `agentsam_feature_flag` | 163 | read + user overrides |
| `agentsam_user_feature_override` | 163 | CRUD |
| `agentsam_agent_run` | 163 | listed in agentsam handlers |
| `agentsam_code_index_job` | 163 | index status |
| `agentsam_subagent_profile` | 163 | CRUD |
| `agentsam_ignore_pattern` | 163 | CRUD |
| `agentsam_rules_document` / `agentsam_rules_revision` | 163 | CRUD |
| **`agentsam_ai`** | **Not in 163** (prod table per session logs) | **Boot batch**, chat model policy, MCP agent list, `total_runs` updates — **hot path** |

**Gap:** `agentsam_ai` should have a **canonical migration in repo** (CREATE TABLE IF NOT EXISTS) so new environments match production.

---

### 1.2 `mcp_*` (tool registry, usage, workflows)

| Table / view | Migration(s) | Role |
|--------------|--------------|------|
| `mcp_services` | seeds in 149, 150, 153, 154, 155, … | Endpoint URL, health, orchestration metadata |
| `mcp_registered_tools` | many INSERT migrations | **SSOT for tool name, category, enabled, schema** (worker + dashboard) |
| `mcp_tool_calls` | 137 | Per-invocation log (`recordMcpToolCall`) |
| `mcp_usage_log` | 134 + triggers 157/161 | Daily rollup from `mcp_tool_calls` |
| `mcp_agent_sessions` | 121 + 135 | MCP panel sessions; `conversation_id` link |
| `mcp_command_suggestions` | 121, part2, seeds | Dashboard prompts |
| `mcp_workflows` / `mcp_workflow_runs` | 159, 160 | CICD-style workflow runner in worker |
| `v_mcp_tool_drift` | 158 | View: registered tools vs recent calls |

**Worker:** reads `mcp_registered_tools` for builtins + invoke path; updates `mcp_services.health_status` in places; inserts `mcp_workflow_runs`.

**External MCP Worker** (`inneranimalmedia-mcp-server`): separate deploy; must stay aligned with **`mcp_services`** URL and **`PTY_AUTH_TOKEN`** for terminal tool (see `docs/TERMINAL_KEYS_RESET.md`).

---

### 1.3 `agent_*` (chat, telemetry, governance)

**Hot path in `worker.js` (INSERT/UPDATE/SELECT observed):**

- `agent_sessions`, `agent_conversations`, `agent_messages` — chat lifecycle
- `agent_telemetry`, `agent_costs` — tokens / cost per completion
- `agent_memory_index` — memory keys, today_todo, priorities
- `agent_audit_log` — `writeAuditLog` + internal API reads
- `agent_tasks`, `agent_execution_plans`, `agent_request_queue`
- `agent_command_proposals`, `agent_command_executions`
- `agent_commands` — slash commands listing + execute API
- `agent_intent_execution_log`, `agent_intent_patterns` (patterns from migrations)
- `agent_workspace_state`
- `agent_command_audit_log`, `change_sets` — governance migration 106

**Listed in assessments / older docs, weak or no grep hit in this `worker.js`:**

- `agent_ai_executable_limits` — **no migration in repo; no worker grep** — treat as **legacy or admin-only** until wired
- `agent_capabilities` — documented as prompt injection only in `AGENT_SAM_WORKSTATION_MASTER_PLAN.md`; **verify** `getAgentContextFromD1` still exists if you rely on it
- `agent_command_conversations` — **worker uses `agent_conversations`**, not this name — likely **duplicate or legacy table** in D1; **do not add second write path** without consolidation decision
- `agent_ai_sam` — **renamed to `agentsam_ai`** (see `docs/cursor-session-log.md`); any stray SQL is a bug

---

### 1.4 `ai_*`

| Object | Migration | Worker |
|--------|-----------|--------|
| `ai_compiled_context_cache` | 119 | Chat context cache / TTL |

**`ai_models`:** Referenced in older migration comments (116); catalog for pricing/boot — confirm in D1; **model keys** in chat should trace to boot or this table.

Other `ai_*` tables (e.g. `ai_rag_search_history`, `ai_knowledge_base`) may exist in D1 without full migration coverage — see `docs/PLATFORM_TABLES_AUDIT_AND_WIRING.md`.

---

### 1.5 `cicd*` (workflows + activity)

| Object | Migration in repo | Worker |
|--------|-------------------|--------|
| `cicd` | **None** (table assumed in D1) | **GET `/api/agent/cicd`**, daily plan reads |
| `cicd_events` | **None** | JOIN for activity_count; **INSERT** on CI/CICD follow-ups (`recordGithubCicdFollowups`, webhook `update_cicd` path) |
| `cicd_active_workflows` | **View** (not in repo migrations here) | Mentioned in handoff docs |
| `cicd_recent_completions` | **VIEW** | Derived from `cicd`; no direct INSERT |

**Gap:** Add **CREATE TABLE IF NOT EXISTS** migrations for `cicd` + `cicd_events` + views so schema = repo truth (per `PLATFORM_TABLES_AUDIT_AND_WIRING.md`).

---

## Part 2 — Universal Sync Law (bulletproof rules)

These rules exist so **Agent Sam (dashboard)**, **Cursor**, **Worker-hosted LLMs (Anthropic/OpenAI/Google)**, and **MCP** do not drift silently.

### Law 1 — One physical writer per concern

For each concern below, **exactly one** primary write path is allowed in application code:

| Concern | Canonical table(s) | Primary writer |
|---------|---------------------|----------------|
| Chat transcript | `agent_conversations`, `agent_messages`, `agent_sessions` | Worker `/api/agent/chat` (and related session APIs) |
| Token usage | `agent_telemetry` | Worker after each LLM completion |
| Dollar gauge | `spend_ledger` (+ optional `agent_costs` for detail) | Worker / finance pipelines per `AGENT_MEMORY_SCHEMA_AND_RECORDS.md` |
| Tool definitions (dashboard + worker builtins) | `mcp_registered_tools` + `mcp_services` | Migrations/seeds + admin APIs; **worker `invokeMcpToolFromChat` must match `tool_name`** |
| MCP invocation audit | `mcp_tool_calls` | `recordMcpToolCall` (worker) |
| High-level MCP rollup | `mcp_usage_log` | DB trigger from `mcp_tool_calls` (see 161) |
| Security-ish audit events | `agent_audit_log` | `writeAuditLog` helper only |
| Cursor parity settings | `agentsam_*` | `/api/agentsam/*` handlers only |
| CICD narrative | `cicd_events` | Same transaction or `waitUntil` as the `cicd` / `cicd_runs` change that caused it |
| Deploy history | `cloudflare_deployments` | `post-deploy-record.sh` / `npm run deploy` / internal record API |

**Violation to avoid:** ad-hoc INSERTs from scripts into `agent_audit_log` or `mcp_tool_calls` without shared helpers (breaks correlation).

### Law 2 — Correlation IDs on every automated turn

Any LLM call that persists **must** attach:

- `tenant_id` (e.g. `tenant_sam_primeaux`)
- `session_id` or `conversation_id` (same id the UI uses)
- `message` row ids where applicable

**`agent_telemetry`** rows must be joinable to **`agent_messages`** for the same turn. **`mcp_tool_calls.session_id`** must match chat session when the tool ran inside chat.

### Law 3 — Tool name is a global API contract

- **`mcp_registered_tools.tool_name`** is the string the model sees and the worker dispatches.
- Adding a builtin: **(1)** migration seed row, **(2)** worker branch in `invokeMcpToolFromChat` (or shared registry), **(3)** optional MCP server tool if external.
- Renaming a tool: **migration UPDATE + worker + any Cursor docs** in one change set; never half-rename.

### Law 4 — Two channels for “agent” config (do not merge blindly)

- **`agentsam_ai`**: rows like `mcp_agent_architect` — **boot**, model policy, MCP orchestration personas.
- **`agent_configs`**: classic Agent Sam config (migration 127+).

**Rule:** Chat **must** resolve model + policy through **one documented precedence chain** (today: boot loads both; changing precedence requires an explicit doc + code comment). Do not add a third config table without deprecating one.

### Law 5 — Bootstrap contract (`/api/agent/boot`)

Whatever the dashboard shows for **models, agents, MCP services** must come from the **same queries** the chat handler trusts (or a shared function). If boot lies, the UI and the model diverge.

### Law 6 — Cursor is not D1

Cursor rules (`.cursor/rules`, `.cursorrules`) and local **Skills** are **developer guardrails**. They do **not** update `agentsam_*` automatically.

**Rule:** When you change production behavior for “what Cursor may do,” mirror into **`agentsam_rules_document`** or repo **only after** Sam approves — and document which is SSOT (usually **repo + R2 memory** for Agent Sam prompt, **D1 agentsam_** for dashboard Settings UI).

### Law 7 — Schema migrations before production data writes

No new `agent_*` / `mcp_*` / `cicd*` / `agentsam_*` table or column may be **required** by worker code until:

1. `migrations/*.sql` exists with `CREATE TABLE IF NOT EXISTS` / `ALTER` guarded for idempotency  
2. `docs/PLATFORM_TABLES_AUDIT_AND_WIRING.md` or this file updated with writer + reader  
3. For memory visible to Agent Sam: optional upload to `iam-platform/memory/schema-and-records.md` per `AGENT_MEMORY_SCHEMA_AND_RECORDS.md`

### Law 8 — CICD activity is append-only narrative

- **`cicd`**: state of a workflow (status, dates, ownership).  
- **`cicd_events`**: **append-only** explanation (who/what/when + `metadata_json`).  
Never “fix” history by DELETE; use compensating **new** rows with `backfill_id` in metadata when scripting (idempotent backfills).

### Law 9 — Sandbox vs production Workers

Same D1 binding on sandbox and prod means **writes from sandbox hit production data**.

**Rule:** Any script or UI that **mutates** `cicd`, `mcp_*`, or `agentsam_*` from sandbox must be **explicitly labeled** in runbooks; prefer **read-only** verification on sandbox or separate `tenant_id` / feature flags if you split data later.

### Law 10 — Human gates for irreversible actions

Deploy, `wrangler secret put`, production R2 overwrite of `agent-dashboard.js`, and OAuth handler edits require **explicit Sam approval** strings documented in `.cursorrules`. No “universal law” overrides that.

---

## Part 3 — Enforcement checklist (before merge)

- [ ] New tool? `mcp_registered_tools` seed + worker dispatch + telemetry path  
- [ ] New LLM model? `ai_models` (if used) + boot + Settings picker  
- [ ] New table? migration + this doc or PLATFORM_TABLES + writer function name  
- [ ] CICD change? `cicd` UPDATE + `cicd_events` INSERT  
- [ ] Cursor-only workflow? Document in `/iam` or `agentsam_rules_document` so Agent Sam users see parity  

---

## Part 4 — Related docs

- `docs/PLATFORM_TABLES_AUDIT_AND_WIRING.md` — per-table wiring status  
- `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md` — canonical metrics tables  
- `docs/CURSOR_HANDOFF_D1_CICD_ORCHESTRATION.md` — webhooks, deployments, roadmap  
- `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md` — capabilities / command execution vision  
- `migrations/163_agentsam_cursor_parity.sql` — full `agentsam_*` DDL  

---

*Last updated: 2026-03-23 — repo audit only; re-run D1 Studio verification after major migrations.*
