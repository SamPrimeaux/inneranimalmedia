# Inner Animal Media — Platform Mental Map
**Snapshot date:** July 1, 2026  
**Author:** Agent Sam / Sam Primeaux  
**Purpose:** Living SSOT for platform architecture, quality/capability tracking, and month-over-month comparison baseline.

---

## 0. Quick Identity

| Field | Value |
|---|---|
| Platform | Agent Sam (IAM) — multi-tenant AI developer OS |
| Operator | Sam Primeaux, sole founder/engineer |
| Primary domain | inneranimalmedia.com |
| Worker entry | `src/index.js` → `production-dispatch.js` |
| Dashboard | `dashboard/` (SPA, served from R2 `static/dashboard/app/*`) |
| Local working dir | `/Users/samprimeaux/inneranimalmedia` |
| Git remote | `github.com/SamPrimeaux/inneranimalmedia` |
| Prod git HEAD | `3f7ace25` (Design Studio layout fix) |
| Cloudflare account | `ede6590ac0d2fb7daf155b35653457b2` |
| D1 primary | `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) ~300 MB |
| D1 last migration (ledger) | `749_agentsam_chat_sessions_turn_lifecycle.sql` @ 2026-07-01 20:14 UTC |
| D1 migrations 750–752 | **SQL effects live in prod**; **ledger rows missing** (applied manually, not via `d1_migrations`) |
| Hyperdrive | `08183bb9d2914e87ac8395d7e4ecff60` → Supabase `dpmuvynqixblxsilnlut` |
| R2 primary bucket | `inneranimalmedia` |
| MCP server | `~/inneranimalmedia-mcp-server` → `mcp.inneranimalmedia.com` (separate repo) |
| ExecOS / PTY | `github.com/SamPrimeaux/ExecOS` v2.0.0, GCP VM `iam-tunnel` (34.171.161.41, us-central1-f) |

---

## 1. Request Lifecycle — Top-Down

```
Browser
  └─ dashboard SPA (R2 static/dashboard/app/*)
       └─ L1 mount: GET /api/dashboard/bootstrap
       └─ L2 on chat load: GET /api/agent/policy, /api/agent/models, default model
            └─ src/index.js → production-dispatch.js
                 ├─ /api/dashboard/*   → src/api/dashboard-bootstrap.js
                 ├─ /api/agent/*       → src/api/agent.js  (+ agentsam-chat-sessions.js)
                 ├─ /api/mcp/*         → src/core/catalog-tool-executor.js
                 ├─ /api/cad/*         → src/api/cad.js
                 └─ /api/designstudio/* → src/api/designstudio/
```

---

## 2. Data Layer — SSOT by Domain

### 2A. Session / Identity

| Domain | Table / Source | Notes |
|---|---|---|
| Login truth | `auth_users` + `auth_sessions` (cookie) | `resolveRequestContext()` in `src/core/auth.js` |
| Active workspace | `auth_users.active_workspace_id` | Never trust client body |
| Workspace list | `workspace_members ⋈ workspaces` | Not `agentsam_workspace` for the list |
| Extended workspace meta | `agentsam_workspace.metadata_json` | Git status bar, per-tenant blob |
| Platform operators | `platform_operators` + `agentsam_user_policy.platform_operator` | |
| BYOK keys | `user_secrets` / `user_api_keys` | Never Wrangler per-user secrets |

### 2B. Bootstrap (L1 — single call on mount)

`GET /api/dashboard/bootstrap` → `src/api/dashboard-bootstrap.js` → `dashboard/src/loadDashboardBootstrap.ts`

| Domain | Source |
|---|---|
| Session / me | `auth_users` via `buildCanonicalAuthMe` |
| Theme | `cms_themes` + prefs via `resolveDashboardBootstrapTheme` → `applyCmsTheme.ts` |
| Git status bar | `agentsam_workspace.metadata_json` |
| Notifications | `agent_notifications` |
| Terminal pill | `terminal_sessions` |
| UI prefs | `agentsam_bootstrap` (`src/core/bootstrap.js`) |
| Supabase client config | Worker env secrets |

**L2 excluded** (fetched only when chat loads): agent policy, models, default model.

### 2C. Agent Chat — Three-Layer Store

```
Write path:  Worker → DO (AgentChatSqlV1)  +  D1 metadata bumps
Read path:   DO first → R2 fallback (legacy only)
List path:   D1 agentsam_chat_sessions only
```

| Layer | What it owns | Role |
|---|---|---|
| **DO `AGENT_SESSION` → `AgentChatSqlV1`** | `session_messages` + `turn_outbox` (SQLite) | Hot runtime — one DO per `conversation_id` |
| **D1 `agentsam_chat_sessions`** (84 rows prod) | Title, star, project, message_count, turn lifecycle, R2 key pointers | Session catalog — sidebar, nav, metadata |
| **R2 `context/{au}/{ws}/chats/{conv}/`** | `meta.json` (init only), `messages.jsonl` (legacy), `digest.md` (compaction) | Cold/archive/fallback — NOT live write path |

> **Key truth:** DO SQLite is primary for live convos. R2 `messages.jsonl` is pre-DO era legacy + compaction digests. Comments in `agentsam-chat-sessions.js` calling R2 "primary" are stale.

DO binding in prod (`wrangler.production.toml` L151–152):
```toml
name = "AGENT_SESSION"
class_name = "AgentChatSqlV1"
```

### 2D. Tools & MCP

| Table | Prod count | Role |
|---|---|---|
| `agentsam_tools` (active) | 130 | Canonical tool catalog |
| `oauth_visible` | 70 | OAuth-gated tools |
| `dispatch_target = 'both'` | 79 | Available in-app + external MCP |

Execution: `agentsam_tools.handler_type` + `handler_config` → `src/core/catalog-tool-executor.js`  
In-app invoke: `POST /api/mcp/catalog-invoke` (main worker, not MCP worker)  
External MCP: `mcp.inneranimalmedia.com` — same D1 catalog, separate repo

### 2E. Routing / Runtime

| Domain | SSOT |
|---|---|
| Thompson arms | `agentsam_prompt_routes` |
| Model eligibility | `agentsam_model_catalog.is_active` |
| User gates (PTY, spawn, tiers) | `agentsam_user_policy` |
| System prompt rules | `agentsam_rules_document` (27 active) — `src/core/agent-skills-rules.js` |
| Subagents | `agentsam_subagent_profile` (106 rows) |
| Workflows | `agentsam_workflows` (71 active) |

> **Known gap:** `/api/agent/modes` (agent/plan/debug/ask) is still code-hardcoded in `agent.js` — not D1 yet.

> **Known split to watch:** Model picker UI reads `agentsam_ai` (82 active). Router/cost arms read `agentsam_model_catalog` + `agentsam_prompt_routes` (`src/core/runtime-profile.js`, `src/core/routing.js`). If these drift, UI shows models the router can't pick.

### 2F. Design Studio

| Domain | Live table | Source file |
|---|---|---|
| Meshy/CAD jobs | `agentsam_cad_jobs` (13 prod) | `src/api/cad.js` |
| Scenes | `scene_snapshots` (D1) + R2 `scenes/{workspace_id}/…` | `src/api/designstudio/scenes.js` |
| Stock/user GLBs | `cms_assets` (118 prod) | `src/api/designstudio/index.js` |
| Blueprints | `designstudio_design_blueprints` | |
| Subagent | `agentsam_subagent_profile` → `cadcreator` (active in prod) | |

> ⚠️ Stale doc names: `cad_jobs` and `designstudio_scenes` do **not** exist in prod. Live names are above.

### 2G. Theme / Monaco / Chrome

| Domain | SSOT |
|---|---|
| CSS vars / dashboard chrome | `cms_themes` (112 rows) — merged server-side |
| Client apply | `dashboard/src/applyCmsTheme.ts` |
| Monaco colors | Same row: `monaco_theme`, `monaco_bg`, `monaco_theme_data` |
| Agent home scene defaults | `agent_home_scene` + `cms_themes.components_json.agent_home` |

Theme config keys: `bg / surface / text / textSecondary / border / primary / radius` → CSS vars  
Fix pattern: `setAttribute` + `localStorage`, persist via `PATCH /api/user/preferences {theme_preset: slug}`  
Never implement `/api/settings/theme` — it 404s by design.

### 2H. Terminal

| Domain | SSOT |
|---|---|
| Connection rows | `terminal_connections` (15 active prod) |
| PTY process | ExecOS on GCP VM `:3099` via CF tunnel |
| Policy gate | `agentsam_user_policy.can_run_pty` |
| Worker secret | `TERMINAL_SECRET` must match `PTY_AUTH_TOKEN` |
| WS URL | `TERMINAL_WS_URL` → `wss://terminal.inneranimalmedia.com` |

Auth model: `EXECOS_KEY` (X-ExecOS-Key header) is unified forward path. `PTY_AUTH_TOKEN` + `AGENTSAM_BRIDGE_KEY` are legacy/deprecated.

### 2I. Memory / Vectors (Rebuildable Mirrors — Not SSOT)

| Layer | Details |
|---|---|
| Supabase pgvector | `agentsam.agentsam_memory_oai3large_1536` (15 rows) |
| Vectorize index | `agentsam-memory-oai3large-1536` (semantic search live) |
| Memory search handler | `agentsam_memory_search` → OAI embed + Vectorize pipeline (wiring = next step as of late May 2026) |

---

## 3. Deploy Protocol

| Command | What it does |
|---|---|
| `git push main` | Triggers CF Builds — **preferred for API-only deploys** |
| `npm run deploy` | Worker only (note: alias errors for aws4fetch/pg/anthropic — use git push) |
| `npm run deploy:frontend` | Dashboard + worker |
| `npm run deploy:full` | Full pipeline |
| Raw wrangler | `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml` |

**Never use:** `wrangler deploy --env production` / bare `npx wrangler deploy` at repo root. No `[env.production]` block exists. Production config is `wrangler.production.toml`.

---

## 4. Active Clients / Companion Projects

| Client | Repo | Stack | Notes |
|---|---|---|---|
| Companions of CPAS | `SamPrimeaux/companionscpas` | Independent CF Worker + D1 `fd6dd6fb` | `companionsofcaddo.org`, Stripe live, DNS complete, client: Lori |
| Fuel & Free Time | — | Admin dashboard, auth, media library, Stripe | `fuelnfreetime.com` |
| Shinshu Solutions | — | Bilingual CMS dashboard | Japan real estate, client: Jake Waalk |
| Meauxbility Foundation | — | Nonprofit entity | EIN 33-4214907 |
| Connor McNeely | `tenant_connor_mcneely` / `ws_connor_mcneely` | Reseller-model tenant | First IAM platform reseller (`au_5d17673408aaebc7`) |

---

## 5. Known Gaps / Open Issues (as of July 1, 2026)

| # | Area | Gap | Priority |
|---|---|---|---|
| 1 | D1 migration ledger | 750–752 SQL already live in prod (gpt-5.4-nano platform, GitHub `both` dispatch, `list_commits` tool) but **not recorded** in `d1_migrations` — backfill ledger for audit parity | Medium |
| 2 | Model picker vs router | `agentsam_ai` (picker) vs `agentsam_model_catalog` (router) can drift | Medium |
| 3 | Agent modes | `/api/agent/modes` hardcoded in `agent.js` — not D1-driven | Medium |
| 4 | Stale R2 comments | `agentsam-chat-sessions.js` still references R2 as "primary" — misleading | Low |
| 5 | ExecOS default cwd | `ecosystem.config.cjs` still points to deleted `/home/samprimeaux/inneranimalmedia` — needs update to `/home/samprimeaux/ExecOS` | Medium |
| 6 | Security scan R2 path | Cron still reads `messages.jsonl` for sessions (legacy path) — should read DO | Low |
| 7 | Memory handler wiring | `agentsam_memory_search` handler config wiring incomplete | Medium |
| 8 | Doc staleness | `cad_jobs` / `designstudio_scenes` table names in old docs are wrong | Low |

---

## 6. Quality & Capability Baseline — July 2026

> This section is designed for month-over-month comparison. Add a dated block each month.

### July 1, 2026 Baseline

#### Platform Health
| Signal | Value |
|---|---|
| Worker health | `/api/health` → `ok` |
| D1 size | ~300 MB |
| Last migration | 749 @ 2026-07-01 20:14 UTC |
| Migration ledger gap | 3 (750–752 not in `d1_migrations`; data already applied) |
| Active sessions | 84 rows in `agentsam_chat_sessions` |
| Active tool catalog | 130 tools (79 dual-dispatch) |
| Subagent profiles | 106 |
| Active workflows | 71 |
| Rules documents | 27 |
| CMS themes | 112 |
| CMS assets (GLBs etc.) | 118 |
| CAD jobs (prod) | 13 |
| Terminal connections (active) | 15 |
| AI models in picker | 82 (`agentsam_ai`) |
| Memory vector rows | 15 (`agentsam_memory_oai3large_1536`) |

#### Architecture Maturity
| Area | Status |
|---|---|
| Worker modularization | ✅ Complete — `src/index.js` entry, all handlers in `src/api/` |
| Dashboard SPA | ✅ React, lazy routing, `AgentSamChatHost` singleton |
| DO conversation store | ✅ Live — `AgentChatSqlV1` per conversation |
| D1 session catalog | ✅ Live |
| R2 cold tier | ✅ Archive/fallback only (legacy pre-DO) |
| Thompson routing | ✅ Live (`agentsam_prompt_routes`) |
| Vectorize memory | ✅ Index live, handler wiring incomplete |
| Design Studio | ✅ Three.js + Meshy GLB pipeline, scene snapshots |
| ExecOS terminal | ✅ v2.0.0, GCP VM, health-aware resolver |
| Multi-tenant isolation | ✅ `resolveRequestContext()` per request |
| Stripe (CPAS) | ✅ Live mode |
| MCP server | ✅ Deployed at `mcp.inneranimalmedia.com` |

#### Capability Gaps (July 2026)
| Capability | Status |
|---|---|
| Agent modes in D1 | ❌ Hardcoded |
| Memory search E2E | ⚠️ Index live, handler wiring incomplete |
| PWA | ⚠️ Manifest + companion worker planned, not shipped |
| D1 migrations 750–752 ledger | ⚠️ Data live; ledger rows missing |
| Model picker/router parity | ⚠️ Two tables, can drift |

---

## 7. Month-Over-Month Comparison Template

Copy this block each month and fill in deltas:

```markdown
### [Month] [Year] Snapshot

**vs previous month:**
- D1 size: [X MB] (delta: +/- Y MB)
- Active tools: [X] (delta: +/- Y)
- Active workflows: [X]
- Subagent profiles: [X]
- Memory vector rows: [X]
- Pending migrations: [X]
- New clients / tenants: [list]
- Architecture changes: [list]
- Capability gaps closed: [list]
- New gaps identified: [list]
- Performance notes: [latency, error rates, etc.]
```

---

## 8. Infrastructure Constants (Quick Reference)

```
D1:          inneranimalmedia-business   cf87b717-d4e2-4cf8-bab0-a81268e32d49
Hyperdrive:  08183bb9d2914e87ac8395d7e4ecff60  →  Supabase dpmuvynqixblxsilnlut
R2:          inneranimalmedia  (dashboard at static/dashboard/ and dashboard/)
GCP VM:      iam-tunnel  34.171.161.41  us-central1-f
CF account:  ede6590ac0d2fb7daf155b35653457b2
ExecOS:      github.com/SamPrimeaux/ExecOS  (~/ExecOS on GCP VM)
MCP worker:  ~/inneranimalmedia-mcp-server  →  mcp.inneranimalmedia.com
CPAS D1:     companionscpas  fd6dd6fb-156b-4b6a-8ff0-505422652391
```

---

*Last updated: July 1, 2026 — next review: August 1, 2026*
