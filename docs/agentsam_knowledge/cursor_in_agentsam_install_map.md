# Cursor inside Agent Sam — install map

**Updated:** 2026-05-28  
**Surfaces:** `/dashboard/agent`, `POST /api/cursor/agent/spawn`, D1 `agentsam_model_catalog` + `agentsam_routing_arms`

## What exists today

| Layer | Status | Path / table |
|-------|--------|----------------|
| Cursor Cloud Agents API proxy | Shipped | `src/api/cursor-agent.js` → `handleCursorAgentApi` via `src/core/production-dispatch.js` |
| Routes | Shipped | `POST /api/cursor/agent/spawn`, `GET /api/cursor/agent/:id/stream`, status |
| Wrangler secret | Required | `CURSOR_API_KEY` (platform only — never per-user) |
| Run ledger | Partial | `agentsam_agent_run` with `trigger = 'cursor_api'` |
| In-dashboard plan executor | Shipped | `agentsam-planner.js` + `agentsam-task-executor.js` (uses `resolveModelForTask`, not Cursor SDK) |
| Model routing | D1-driven | `agentsam_routing_arms` + `agentsam_model_catalog` |
| Alignment workflow | Registry | `wf_cursor_alignment_snapshot` in `alignment-sync.js` |

## What failed (2026-05-28)

**Symptom:** Plan execution steps failed with  
`agentsam-task-executor: resolveModelForTask returned no model`.

**Cause:** Executor called `resolveModelForTask` with default `mode: 'auto'`, but production arms for `task_type = agent` use `mode = 'agent'` (workspace-scoped to `ws_inneranimalmedia`). Thompson + global policy found zero arms.

**Fix (code):** Pass `mode: 'agent'` from task executor; `mode: 'agent'` for planner (`task_type: plan`); coerce `auto` → canonical task mode in `resolveModel.js`; workspace-aware global policy + `ask` → `chat` arm fallback.

## Install checklist — Cursor as a first-class Agent Sam provider

### Phase 1 — Routing & catalog (D1, no new Worker)

1. **`agentsam_model_catalog`** — rows for Cursor-routable models you expose in Sam (e.g. Composer tiers if billed separately). Use existing providers or add `provider = 'cursor'` only if dispatch supports it.
2. **`agentsam_routing_arms`** — arms per workspace (or `["*"]` tools pattern):
   - `task_type`: `agent` | `plan` | `research` | `code`
   - `mode`: must match UI mode (`agent`, not `auto`, unless you seed `auto` rows)
   - `workspace_id`: tenant workspace or empty for global
3. **`agentsam_tools`** — register tools the dashboard/agent loop needs (`search_web`, `cdt_evaluate_script`, etc.) with `workspace_scope = '["*"]'`.
4. **`agentsam_user_policy`** — owner rows: `tool_risk_level_max = critical`, `require_allowlist_for_mcp = 0`, `can_run_pty = 1`.

### Phase 2 — Worker dispatch

| File | Action |
|------|--------|
| `src/core/resolveModel.js` | Keep single resolver; map `mode: auto` → task mode; workspace policy |
| `src/core/provider.js` | Add `cursor` provider branch if spawning in-Worker (optional) |
| `src/api/cursor-agent.js` | Already proxies Cloud Agents API |
| `wrangler.production.toml` | Confirm `CURSOR_API_KEY` secret binding |

### Phase 3 — PTY / SDK runner (optional, for “Cursor inside Sam” parity)

From product planning (not all shipped):

| File | Purpose |
|------|---------|
| `pty-service/cursor-runner.js` | Node runner using Cursor SDK for long sessions |
| `src/index.js` or agent routes | `POST /api/internal/cursor/session` — mint session, bridge to PTY |
| D1 | Session table keyed to `agentsam_agent_run.id` (no new `agent_run_id` table) |

**Rules:** Reuse existing IAM Worker; no per-user Wrangler secrets; terminal gate = `agentsam_user_policy.can_run_pty`, not `isSuperAdmin()`.

### Phase 4 — Cost & observability

- Write usage to `agentsam_usage_events` with `ref_table = 'agentsam_agent_run'`.
- Mirror runs per `agentsam-d1-supabase-alignment.mdc` workflow lifecycle.
- Surface per-turn model + cost in dashboard (gap noted in `21-dashboard-agent-model-routing-and-costs.md`).

## Modes vs D1 (Cursor product vs Sam routing)

| User-facing (dashboard) | D1 `agentsam_routing_arms.mode` | Notes |
|-------------------------|----------------------------------|-------|
| Auto | Prefer seed `agent` arms, or map `auto` → `agent` in resolver | Do not rely on `mode = auto` alone for `task_type = agent` |
| Agent | `agent` | Plan task execution |
| Plan | `agent` on `task_type = plan` | Planner decomposition |
| Ask / chat | `ask` or legacy `chat` task_type | Resolver tries both |
| Debug | `debug` | |

## Cursor IDE product vs Sam “Cursor agent”

| Question | Answer |
|----------|--------|
| Cursor IDE billing modes | External — websearch / docs; not stored in D1 unless you ingest a price sheet |
| Sam “Cursor agent” | `POST /api/cursor/agent/spawn` + optional PTY runner; models/costs from **your** D1 catalog + arms |
| Web search in Sam | Builtin `search_web` (`src/tools/builtin/web.js`, Tavily); requires tool row + model resolution |

## Validation after deploy

```bash
# Health
curl -sS https://inneranimalmedia.com/health

# Registry tools (picker / browser)
curl -sS -b "$SESSION_COOKIE" \
  'https://inneranimalmedia.com/api/agent/browser/registry-tools?workspace_id=ws_inneranimalmedia' \
  | jq '.pickers.evaluate'

# Plan path: send a goal in /dashboard/agent with mode Agent; confirm steps complete without resolveModel errors
```

## Related migrations (2026-05-28)

- `451_browser_picker_cdt_tools.sql` — CDT picker tools + owner policy
- Code: `resolveModel.js`, `agentsam-task-executor.js`, `agentsam-planner.js`
