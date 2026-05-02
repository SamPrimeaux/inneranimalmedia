# MCP data model and remote D1 reference

**Database:** `inneranimalmedia-business` (D1 ID `cf87b717-d4e2-4cf8-bab0-a81268e32d49`)  
**Canonical MCP HTTP endpoint:** `https://mcp.inneranimalmedia.com/mcp`  
**Query remote D1 (from repo root):**

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --command="YOUR_SQL;"
```

Use `-c wrangler.production.toml` if your local setup expects that config; the wrapper usually loads the token from `.env.cloudflare`.

---

## 1. `mcp_registered_tools`

**Purpose:** Registry of tools exposed through the hosted MCP server (names, schemas, per-mode allowlists, health flags).

**Row count:** 85 (remote snapshot; verify with `COUNT(*)`).

### Schema

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT | PK |
| `tool_name` | TEXT | Unique tool id (e.g. `d1_query`, `r2_write`) |
| `tool_category` | TEXT | |
| `mcp_service_url` | TEXT | Usually `https://mcp.inneranimalmedia.com/mcp` |
| `description` | TEXT | |
| `input_schema` | TEXT | JSON schema string |
| `requires_approval` | INTEGER | 0/1 |
| `enabled` | INTEGER | **Not** `is_active` — use `enabled` |
| `cost_per_call_usd` | DECIMAL(10,6) | |
| `created_at`, `updated_at` | TEXT | |
| `intent_tags` | TEXT | |
| `modes_json` | TEXT | JSON array of modes: `agent`, `ask`, `plan`, `debug` (subset per tool) |
| `is_degraded` | INTEGER | 1 = exclude or warn in routing |
| `failure_rate` | REAL | |
| `avg_latency_ms` | REAL | |
| `last_health_check` | INTEGER | |

### Important rows / flags

- **`r2_write`:** `is_degraded = 1` in registry (high failure rate historically); still listed for agent mode in worker allowlists — verify worker + MCP behavior before relying on writes.
- Tools that omit **`plan`** in `modes_json` are typically **agent-only** or **debug+agent** (e.g. `terminal_execute`, `worker_deploy`, many `cdt_*` tools). Query:  
  `SELECT tool_name, modes_json FROM mcp_registered_tools WHERE enabled=1 AND modes_json NOT LIKE '%plan%';`
- **Search-related tool names** (no literal `web_search`): `knowledge_search`, `context_search`, `r2_search`, `a11y_audit_webpage` (matches `%search%` / `%web%` patterns).

### Full export

```sql
SELECT * FROM mcp_registered_tools ORDER BY tool_name;
```

---

## 2. `agentsam_mcp_allowlist`

**Purpose:** Per-user (and optional workspace) allowlist of `tool_key` values the agent may invoke.

**Row count:** 66 (remote snapshot).

### Schema

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT | PK |
| `user_id` | TEXT | |
| `workspace_id` | TEXT | Often `''` or e.g. `github_copilot` |
| `tool_key` | TEXT | Plain name (e.g. `d1_query`) or prefixed (e.g. `inneranimalmedia-mcp:d1_query`) |
| `created_at` | TEXT | |

### Known groupings (example)

- **`user_id = sam`**, **`workspace_id = github_copilot`:** 31 tools (context*, d1_*, gdrive_*, github_*, imgx_*, knowledge_search, list_*, platform_info, r2_*, resend_send_email, telemetry_*, terminal_execute, worker_deploy) — same `created_at` batch.
- **`user_id = sam_primeaux`**, **`workspace_id = ''`:** browser/CDT tools, meshy, `r2_write`, and five keys `inneranimalmedia-mcp:{d1_query,d1_write,r2_read,r2_list,terminal_execute}`.

---

## 3. `mcp_services`

**Purpose:** Catalog of MCP “services” (clients, platforms, client sites) with endpoint, worker binding hints, health.

**Row count:** 30.

### Schema (high level)

Includes: `service_name`, `service_type`, `endpoint_url`, `worker_id`, `authentication_type`, `is_active`, `rate_limit`, `monthly_requests`, `health_status`, `entity_status`, `service_tier`, `timezone`, `requires_oauth`, `metadata`, unix `created_at` / `updated_at`, plus `hyperdrive_id`, `agent_role_id`, `cms_tenant_id`, etc. (see `PRAGMA table_info(mcp_services)`).

### Endpoint patterns

- **Primary MCP:** `https://mcp.inneranimalmedia.com/mcp` (most rows).
- **Alternate / legacy:** `https://inneranimalmedia.com/api/mcp/a11y`, `/api/mcp/imgx`, `/api/mcp/context`.
- **Non-MCP URLs:** `health_status` may be `not_mcp` (e.g. marketing/dashboard URLs).

### Notable `health_status` values

`healthy`, `retired`, `not_implemented`, `not_mcp`.

### Compact list (id, name, active, health, url)

| id | service_name | is_active | health_status | endpoint_url |
|----|--------------|-----------|----------------|--------------|
| mcp_a11y_server | A11y MCP Server | 0 | not_implemented | https://inneranimalmedia.com/api/mcp/a11y |
| mcp_client_les_kittrell | ACE Medical — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_dylan_hollier | Anything Floors — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_chrome_devtools | Chrome DevTools MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_autorag | Ecosystem AutoRAG | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| svc_github_copilot_mcp | GitHub Copilot Agent (MCP Client) | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_ai_dashboard | IAM AI Dashboard MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_ide | IAM IDE | 0 | retired | https://mcp.inneranimalmedia.com/mcp |
| mcp_ecosystem | IAM SaaS Ecosystem MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_services | IAM Services | 0 | retired | https://mcp.inneranimalmedia.com/mcp |
| mcp_imgx_remote | IMGX Remote Builtin | 0 | not_implemented | https://inneranimalmedia.com/api/mcp/imgx |
| mcp_client_51838412025944c5 | Inner Animal App — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_6e067eaa16cba67c | Inner Animal Media — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_ca194253b55643f1 | Inner Autodidact — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_inneranimal | InnerAnimal Media MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| inneranimalmedia-mcp | InnerAnimalMedia MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_e148576390adcf16 | Meaux Cloud — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_meauxbility | Meauxbility (alt) — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_ea26fa10997a4364 | Meauxbility — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_church | New Iberia Church — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_pawlove | Paw Love Rescue — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_pelican | Pelican Peptides — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_platform_inneranimal | Platform Inner Animal (meauxxx.com) | 0 | not_mcp | https://meauxxx.com |
| mcp_shinshu_dashboard | Shinshu Solutions — Dashboard | 0 | not_mcp | https://dashboard.shinshusolutions.com |
| mcp_shinshu_main | Shinshu Solutions — Main Site | 0 | not_mcp | https://shinshusolutions.com |
| mcp_swampblood | Swamp Blood Gator Guides | 0 | not_mcp | https://swampbloodgatorguides.meauxbility.workers.dev |
| mcp_context_mem_server | context-mem | 0 | not_implemented | https://inneranimalmedia.com/api/mcp/context |
| mcp_client_e3ac8945e4afc82d | iAutodidact App — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_8e182081f8e8181c | iAutodidact Org — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |
| mcp_client_4973f1cf0018dd05 | iAutodidact — MCP | 1 | healthy | https://mcp.inneranimalmedia.com/mcp |

---

## 4. `mcp_workflows`

**Purpose:** Named workflow definitions (steps JSON, triggers, approval gates).

**Row count:** 15. **Tenant:** `tenant_sam_primeaux`. **Created by:** `sam_primeaux`.

### Schema

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `tenant_id` | TEXT |
| `name`, `description`, `category` | TEXT |
| `trigger_type` | manual \| scheduled \| webhook |
| `trigger_config_json` | TEXT |
| `steps_json` | TEXT (array of steps) |
| `timeout_seconds` | INTEGER |
| `requires_approval` | INTEGER |
| `estimated_cost_usd` | REAL |
| `status` | TEXT |
| `run_count`, `success_count` | INTEGER |
| `last_run_at` | INTEGER (unix) |
| `created_at`, `updated_at` | INTEGER (unix) |

### Workflow index (names and ids)

| id | name | category | trigger | status | runs (ok/total) |
|----|------|----------|---------|--------|------------------|
| wf_2step_ui_deploy | 2Step — UI Sandbox → Production | deploy | manual | active | 0/0 |
| wf_cicd_agent_ui_sandbox_to_prod | CICD — Agent UI: sandbox R2 then production R2 | deploy | manual | active | 0/0 |
| wf_client_onboard | Client Onboarding — Full Setup | client | manual | active | 0/0 |
| wf_cost_telemetry_report | Cost & Telemetry Report | ops | manual | active | 0/0 |
| wf_d1_schema_audit | D1 Schema Audit | maintenance | manual | active | 0/0 |
| wf_db_cleanup | DB Maintenance — Cleanup + Vacuum | maintenance | scheduled | active | 0/0 |
| wf_daily_briefing | Daily Briefing — Full Context | ops | scheduled | active | 0/0 |
| wf_daily_summary | Daily Work Summary | ops | manual | active | 2/2 |
| wf_dashboard_deploy | Dashboard Asset Deploy | deployment | manual | active | 0/0 |
| wf_github_pr_review | GitHub PR — Automated Review | ci | webhook | active | 0/0 |
| wf_knowledge_reindex | Knowledge Base Reindex | maintenance | manual | active | 0/0 |
| wf_meauxbility_deploy | Meauxbility — Deploy Pipeline | deploy | manual | active | 0/0 |
| wf_secret_rotation | Secret Rotation — Full Audit | maintenance | scheduled | active | 0/0 |
| wf_theme_qa | Theme QA — Sandbox Visual Check | qa | manual | active | 0/0 |
| wf_worker_health_check | Worker Health Check | maintenance | manual | active | 2/1 |

Full step bodies live in `steps_json` / `trigger_config_json` — query per row as needed.

---

## 5. `mcp_tool_call_stats`

**Purpose:** Daily (or periodic) aggregates per **`date` + `tool_name`** (+ `tenant_id`).

**Row count:** 56 (remote snapshot; grows over time).

### Schema

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `date` | TEXT (e.g. `YYYY-MM-DD`) |
| `tool_name`, `tool_category` | TEXT |
| `tenant_id` | TEXT |
| `call_count`, `success_count`, `failure_count` | INTEGER |
| `total_cost_usd`, `avg_duration_ms` | REAL |
| `total_tokens` | INTEGER |
| `created_at`, `updated_at` | TEXT |

### Typical use

Rollups for dashboards; **`total_cost_usd` / `total_tokens` / `avg_duration_ms`** may be zero if not populated in all paths.

---

## 6. `mcp_tool_calls`

**Purpose:** Append-only log of individual MCP tool invocations (session, status, payloads).

**Row count:** ~**1,190** (verify with `COUNT(*)`).

### Schema

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `tenant_id`, `session_id` | TEXT |
| `tool_name`, `tool_category` | TEXT |
| `input_schema`, `output` | TEXT (large JSON/text) |
| `status` | TEXT (`completed`, `failed`, …) |
| `approval_gate_id`, `invoked_by` | TEXT |
| `invoked_at`, `completed_at`, `created_at`, `updated_at` | TEXT |
| `cost_usd` | DECIMAL |
| `error_message` | TEXT |

### Snapshot stats (example period)

- **`created_at` range:** `2026-03-12` through `2026-03-31` (adjust with live query).
- **`tenant_id`:** all sampled rows were `tenant_sam_primeaux`.
- **Status:** ~969 `completed`, ~221 `failed` (verify live).
- **High-volume tools:** `d1_query`, `terminal_execute`, Excalidraw tools, `r2_*`, `knowledge_search`, etc.

### Full export (large)

```sql
SELECT * FROM mcp_tool_calls ORDER BY created_at;
```

Prefer exporting to a file; avoid loading full `output` in chat.

---

## 7. Worker integration (brief)

These are code-level pointers for Claude when reasoning about `/api/agent/chat` and tools:

- **Mode filtering:** `filterToolsByMode()` in `worker.js` — `plan` uses a fixed allowlist (comment above it once said “no tools” but code uses a whitelist); `agent` / `ask` / `debug` use different sets.
- **Intent filtering:** `filterToolsByIntent()` narrows by intent + keywords; **does not** use every `intent_slug` from `agent_intent_patterns` (those are DB-driven labels; **`classifyIntent()`** returns `sql` \| `shell` \| `question` \| `mixed` only).
- **DB `modes_json`:** SQL filters tools with `modes_json LIKE '%"' || mode || '"%'` then applies `filterToolsByMode`.
- **Streaming:** `canStreamAnthropic` requires `anthropic` provider, **`!(useGateway && gatewayModel)`**, and **`ANTHROPIC_API_KEY`**.

---

## 8. Related docs in repo

- `.cursor/mcp.json` — MCP client endpoint (Bearer token; do not commit tokens elsewhere).
- `docs/MCP_CURSOR_TERMINAL_SYNC.md` — if present, Cursor/MCP sync notes.

---

*Generated for consultation with Claude. Re-run counts and `MAX(created_at)` on D1 before production decisions; data drifts.*
