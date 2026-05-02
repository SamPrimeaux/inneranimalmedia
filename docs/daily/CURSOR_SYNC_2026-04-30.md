# Cursor daily sync — 2026-04-30

**Branch:** `production`  
**Purpose:** Single source of truth for what shipped locally today, how components fit together, and how teammates stay aligned while iterating.

**Pushed to `origin/production` (2026-04-30):** cumulative from `aee7e16` through the commits below. **Authoritative tip SHA:** run `git fetch origin && git rev-parse origin/production` after pull (avoids doc drift from doc-only commits).

| Commit | Subject |
|--------|---------|
| `eec05cc` | docs: daily Cursor sync log + ignore `supabase/.temp` |
| `5f3b569` | feat(core): Thompson routing arms + daily retention |
| `082bdcb` | feat(api): CI/CD overview, Supabase OAuth, Thompson chat wiring |
| `f8edfde` | feat(dashboard): polling, integrations UX, overview visibility |
| `9931ea7` | feat(supabase): embed-on-ingest Edge Function |
| `def45d0` | feat(worker): retention cron + shared CI/CD overview fetch |
| `94fafe2` | docs: record production push commit range |
| `28f6ff2` | docs: refresh push SHA range table |
| `81aa8d5` | docs: finalize Cursor sync log commit table |

Further doc-only commits may appear after this table; use `git rev-parse origin/production` for the true tip.

*(Earlier on production:* `aee7e16` *BrowserView / browser trust.)*

---

## Quick sync checklist (start of day)

1. `git fetch origin && git checkout production && git pull origin production`
2. Read **§ Ship snapshot** below for anything that touches your area.
3. If you touch **D1**: confirm migrations applied in target env before relying on new tables/columns.
4. If you deploy **Workers**: use your normal promote script; this doc does **not** trigger deploys by itself.
5. **Supabase Edge**: functions under `supabase/functions/` deploy via Supabase CLI, not the Worker bundle.

---

## Ship snapshot — bundles on `production` after this push

| Area | Summary |
|------|---------|
| **Thompson routing** | `src/core/routing.js` — Beta-bandit selection over `agentsam_routing_arms`; `getDefaultModelForTask`, `recordRoutingArmOutcome`; PRAGMA before writes. Wired in `src/api/agent.js` SSE chat (prepend selected model, record outcome). |
| **Retention** | `src/core/retention.js` — Daily rollups, purge paths, optional offload; PRAGMA-driven; may `CREATE TABLE IF NOT EXISTS` for rollup tables. **`worker.js`** scheduled cron invokes `runMasterDailyRetention(env)`. |
| **CI/CD overview** | `src/api/overview.js` exports `fetchCicdPipelineRunsForOverview(env)` — schema-safe `cicd_pipeline_runs` query. **`worker.js`** `handleOverviewDeployments` uses it for `cicd_runs` payload. |
| **OAuth / Supabase** | `src/api/oauth.js` — exported `ensureOauthTokenColumns`, optional `workspace_id` / `metadata_json`, Supabase management project listing, workspace-scoped account ids. `src/api/integrations.js` — `DELETE /api/integrations/supabase`, richer token rows, registry tweaks when `SUPABASE_OAUTH_CLIENT_ID` unset. |
| **Dashboard** | `App.tsx` — split polling (`tunnel`, `terminal`, `deployments`, `telemetry`), visibility-aware intervals. `IntegrationsPage.tsx` — Supabase disconnect, metadata-driven project hints. `OverviewPage.tsx` — visibility-aware refresh, 120s interval when visible. |
| **Supabase Edge** | `supabase/functions/embed-on-ingest/index.ts` — webhook-verified embed pipeline (CF Workers AI + write-back). Secrets via `Deno.env` only. |

**Ignored in git:** `supabase/.temp/` (CLI cache) — listed in `.gitignore`.

---

## Thompson routing (`src/core/routing.js`)

- **Table:** `agentsam_routing_arms` (must exist in D1 for sampling to activate). If missing or empty, chat falls back to existing static chain (`model_preference` → escalation → last resort).
- **Columns** are discovered via `PRAGMA table_info(agentsam_routing_arms)`. Supported shapes include: `id` / `arm_id`, `model_id` / `ai_model_id`, `task_key` / `intent_slug` / `task_type`, `tenant_id`, `alpha`/`beta` or success/failure counts, `is_active`.
- **Outcome updates:** `recordRoutingArmOutcome` runs PRAGMA, then updates only columns that exist (success/failure counts or alpha/beta).
- **Agent wiring:** `src/api/agent.js` — Thompson row prepended to deduped model chain; after stream, success/failure recorded when `armId` present.

**Verify locally (no deploy):** `grep -n getDefaultModelForTask src/api/agent.js src/core/routing.js`

---

## CI/CD overview helper (`fetchCicdPipelineRunsForOverview`)

- Lives in `src/api/overview.js`; avoids brittle SQL by adapting to `cicd_pipeline_runs`, `cicd_github_runs`, `cicd_run_steps` column sets.
- **Worker** `handleOverviewDeployments` maps rows into the shape the dashboard expects (`run_id`, `workflow_name`, `steps_*`, etc.).

---

## OAuth / integrations (Supabase)

- Token rows may include **`metadata_json`** (e.g. project list) and **`workspace_id`** when columns exist (`ensureOauthTokenColumns` runs PRAGMA-driven alters).
- **Disconnect:** `DELETE /api/integrations/supabase` (session auth) clears integration state as implemented in `integrations.js`.
- **UI:** `IntegrationsPage.tsx` uses CSS variables for provider chrome (`var(--solar-*)`, `var(--bg-app)`).

---

## Retention (`src/core/retention.js` + worker cron)

- **`runMasterDailyRetention(env)`** is scheduled from **`worker.js`** on cron `0 0 * * *` alongside existing retention purge (both may run when DB present).
- Module uses **PRAGMA** before writes; may create rollup tables if absent — review in staging before relying in prod.
- **Note:** `DEFAULT_TENANT` and similar constants inside retention deserve a follow-up to align with tenant resolution from auth.

---

## Dashboard polling behavior

- **`App.tsx`:** Tunnel / terminal / deployments / telemetry polls split into focused callbacks; combined `fetchLiveStatus` respects **`visibilitychange`** (polling paused when tab hidden — see inline comment for intervals).
- **`OverviewPage.tsx`:** Load polling pauses when document hidden; interval **120s** when visible (was 60s always-on).

---

## Supabase Edge function — `embed-on-ingest`

- **Path:** `supabase/functions/embed-on-ingest/index.ts`
- **Runtime:** Deno (Supabase Functions), not Cloudflare Worker.
- **Required secrets (environment):** `CF_ACCOUNT_ID`, `CF_AI_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_SECRET` (see file header).
- **Deploy:** `supabase functions deploy embed-on-ingest` (with project linked); configure webhook in Supabase to hit the function URL with HMAC secret.

---

## Worker bundle notes

- **`worker.js`** changes are limited to **imports** and **delegation**: overview CI/CD fetch, retention cron `waitUntil`. No duplicate implementation of SQL strings for pipeline runs in the worker body beyond calling the shared helper.
- Policy reminder: prefer adding logic under **`src/`** and importing into `worker.js` rather than growing inline worker-only code.

---

## Files touched (reference)

```
.gitignore
agent-dashboard/agent-dashboard/App.tsx
agent-dashboard/agent-dashboard/components/IntegrationsPage.tsx
agent-dashboard/agent-dashboard/components/OverviewPage.tsx
docs/daily/CURSOR_SYNC_2026-04-30.md
src/api/agent.js
src/api/integrations.js
src/api/oauth.js
src/api/overview.js
src/core/retention.js
src/core/routing.js
supabase/functions/embed-on-ingest/index.ts
worker.js
```

---

## Suggested verification commands (post-pull)

```bash
git log -1 --oneline
node --check src/core/routing.js && node --check src/api/agent.js
grep -n "fetchCicdPipelineRunsForOverview\|runMasterDailyRetention\|getDefaultModelForTask" worker.js src/api/overview.js src/api/agent.js | head -40
```

---

## Contact / ownership

- Treat this file as **append-only for the day**: add bullets under a **“Follow-ups”** subsection if you discover gaps during review.
- Tomorrow’s log: copy this template to `CURSOR_SYNC_2026-05-01.md` and reset the ship snapshot.

---

## Follow-ups (fill in as you work)

- [ ] Confirm `agentsam_routing_arms` rows exist in prod D1 if Thompson routing should be live.
- [ ] Confirm Supabase Edge secrets exist in Supabase project before enabling webhook.
- [ ] Review retention DDL vs formal migrations for production parity.
