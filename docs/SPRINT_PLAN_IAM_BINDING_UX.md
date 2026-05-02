# IAM Platform — Sprint Plan (Binding / UX / Operations)

**Purpose:** Single place to track design, implementation, deploy, and verification—aligned with repo rules (sandbox first, prod promote only with Sam).

**Repo:** `inneranimalmedia-agentsam-dashboard`  
**Prod worker:** `inneranimalmedia` — `wrangler.production.toml`  
**Sandbox worker:** `inneranimal-dashboard` — `wrangler.jsonc`  
**MCP worker:** `inneranimalmedia-mcp-server` — `inneranimalmedia-mcp-server/wrangler.toml`

**Update this file** when a sprint slice ships: set status, add date, note commit SHA.

---

## D1 persistence (`inneranimalmedia-business`)

Apply or re-apply seed (idempotent `INSERT OR IGNORE` / `REPLACE` where noted):

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/226_iam_sprint_plan_binding_ux_d1_20260405.sql
```

| Table | Row id / key | Purpose |
|-------|----------------|--------|
| **`sprint_snapshots`** | `snap_iam_binding_ux_20260405` | Baseline note linking this doc + D1 keys |
| **`project_memory`** | id `pmem_iam_sprint_plan_binding_ux_v1`, key **`SPRINT_PLAN_IAM_BINDING_UX`** | JSON: doc path, commit, completed slice, next 5 days, backlog |
| **`project_issues`** | `iss_iam_bindux_*` | Open program issues (MCP r2_write, doc drift, queue metrics, post-deploy secret, billing UI) |
| **`project_goals`** | `goal_iam_bindux_*` | Five active goals aligned to Day 1–5 plan |

**Query examples:**

```sql
SELECT value FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = 'SPRINT_PLAN_IAM_BINDING_UX';
SELECT id, title, severity, status FROM project_issues WHERE project_id = 'inneranimalmedia' AND id LIKE 'iss_iam_bindux_%';
SELECT id, goal_name, status, current_progress_percent FROM project_goals WHERE id LIKE 'goal_iam_bindux_%';
```

---

## Completed (baseline — do not redo)

| Item | What | Status |
|------|------|--------|
| **Prod `DASHBOARD` R2** | Bound to **`agent-sam`** (not `agent-sam-sandbox-cicd`). Isolates prod dashboard assets from sandbox CICD bucket. | Done — `wrangler.production.toml` + prod deploy verified |
| **Sandbox `TOOLS` R2** | **`inneranimal-dashboard`** binds **`TOOLS` → `tools`** (same bucket as prod for Monaco/code paths). Was missing from `wrangler.jsonc` only—config gap, not Cloudflare block. | Done — `wrangler.jsonc` updated to match dashboard |
| **Status bar wiring** | Polling for health, git, problems, spend, tunnel, terminal config, deployments, notifications; Monaco indent/EOL; notifications panel + mark read. | Done — `App.tsx`, `StatusBar.tsx`, `MonacoEditorView.tsx` |
| **Git** | Commit `708e61a` pushed to `origin/main`. | Done |

**Deploy flow (unchanged):** `./scripts/deploy-sandbox.sh` → verify sandbox → `./scripts/promote-to-prod.sh` (Sam).  
**Prod worker deploy (when needed):** `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml`

---

## Rules (non-negotiable)

1. **Sandbox first.** No autonomous prod deploy; Sam runs promote when satisfied.
2. **After material changes:** run `benchmark-full.sh` before prod promote (31/31 gate per project).
3. **UI/CSS:** CSS variables / theme tokens only—no hardcoded hex in JSX/CSS; no emojis in code or product copy.
4. **No silent failures:** APIs return clear failure modes; UI shows a message or `--`, not endless spinners.
5. **Locked code:** Do not change `handleGoogleOAuthCallback` / `handleGitHubOAuthCallback` or prod wrangler secrets without explicit Sam approval.
6. **Documentation:** After each merged slice, add a row under **Changelog (this doc)** at the bottom with date + one line + optional SHA.

---

## Next 3–5 days (realistic daily outcomes)

Focus: **visibility**, **parity**, **trust**—not “every integration in five days.”

### Day 1 — Registry + parity confirmation

**Design**

- D1 table (e.g. `platform_binding_registry`) or agreed equivalent: columns for name, category, prod/sandbox/mcp flags, status (`active` | `deprecated` | `degraded` | `verify-needed`), notes, optional `last_verified_at`.
- Seed rows from binding inventory (names only—never secret values).

**Implement**

- `GET /api/settings/bindings-inventory` (session / superadmin gated): returns registry rows ordered by category, name.
- Settings UI tab (e.g. **Infrastructure**): read-only table; optional “Mark verified” updates timestamp only.

**Verify**

- Sandbox: tab loads; deprecated rows visually distinct; no secrets in JSON.

**Outcome:** One authoritative list of what exists where.

---

### Day 2 — LLM / routing visibility

**Design**

- One row = model (and provider if stored) from **`agent_telemetry`**—confirm column names once before writing SQL.
- Empty state: “No recent telemetry.”

**Implement**

- Settings tab **AI routing** (or extend Models): last activity, simple error/success signal from aggregates.

**Verify**

- After normal chat use, rows populate.

**Outcome:** You can see which providers/models are actually exercised.

---

### Day 3 — System truth in chrome

**Design**

- Map existing **`GET /api/system/health`** fields to pill states (e.g. fresh snapshot vs stale vs missing).
- Deprecate **AI Search / Vectorize** in UI copy—point RAG UX at **D1 cosine / custom RAG** path only.

**Implement**

- Status bar or settings header: health + last prod deploy line (from `deployments`); remove misleading “AI Search” labels where found.

**Verify**

- Failed polls show `--` or short message, not stuck loading.

**Outcome:** At-a-glance integrity + deploy awareness.

---

### Day 4 — Operations v0

**Design**

- Scope v0: **`cicd_pipeline_runs` + `cicd_run_steps`** only (already populated by deploy scripts).
- Queue “depth”: do **not** invent metrics—either omit or label “not tracked” until a log table or Queue Events exists.

**Implement**

- **Operations** (sidebar or settings): pipeline list + expandable steps; failed steps obvious.

**Verify**

- One sandbox deploy produces a visible run.

**Outcome:** Background pipeline work is visible.

---

### Day 5 — Data plane check

**Design**

- `GET /api/system/hyperdrive-health`: `SELECT 1` via **HYPERDRIVE**, return ok + latency only—no credentials in response.

**Implement**

- Settings **Data / Postgres** (or Network): health dot + “Test connection” + link to Supabase dashboard.

**Verify**

- Success and failure paths both readable in UI.

**Outcome:** Postgres path trust without leaving the app.

---

## Extended backlog (after day 5)

Ordered roughly by leverage:

| # | Theme | Deliverable |
|---|--------|-------------|
| B1 | MCP | Repair or replace degraded `r2_write`; surface degraded state in MCP panel |
| B2 | Worker | Terminal session `user_id` — no hardcoded `'sam'`; use auth context |
| B3 | MCP naming | Document `AUTORAG` vs `AUTORAG_BUCKET` per worker in code comments |
| B4 | Billing | Stripe summary + customer portal stub (`GET /api/billing/summary` pattern) |
| B5 | Media | CF Images / Stream / Calls cards (stats or “not configured”) |
| B6 | Tools | Meshy + CloudConvert minimal routes + agent tool registration |
| B7 | Queue | Real queue visibility only after design for events or D1 log |

---

## Changelog (maintain when you ship)

| Date | Note |
|------|------|
| 2026-04-05 | Baseline doc: TOOLS in `wrangler.jsonc`, prod `DASHBOARD` → `agent-sam`, status bar wiring, `708e61a` on `main`. |
| 2026-04-05 | D1 migration **226** applied: `sprint_snapshots`, `project_memory` `SPRINT_PLAN_IAM_BINDING_UX`, `project_issues`, `project_goals`. |

---

## Quick reference — TOOLS “holdup” (resolved)

- **Cause:** Sandbox `wrangler.jsonc` lacked `TOOLS` in `r2_buckets` while prod had it—`env.TOOLS` was `undefined` on sandbox.
- **Fix:** `{ "binding": "TOOLS", "bucket_name": "tools" }` + redeploy sandbox; repo now matches deployed worker.
- **Isolation note:** Same `tools` bucket as prod unless you later introduce a dedicated sandbox bucket and routing.
