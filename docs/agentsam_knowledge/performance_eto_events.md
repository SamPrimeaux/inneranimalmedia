# agentsam_performance_eto_events — Thompson training ledger

## Role in the stack

| Layer | Table | Question |
|--------|--------|----------|
| Canonical | `agentsam_agent_run`, `agentsam_usage_events`, … | What happened? |
| Rollup | `agentsam_execution_performance_metrics` | What are dashboard aggregates? |
| **Bridge** | **`agentsam_performance_eto_events`** | What reward does this source row imply, and which arm learns? |
| Learned state | `agentsam_routing_arms` | Thompson `success_alpha` / `success_beta` |

One row per canonical source (`UNIQUE(source_table, source_id)`). Not a second rollup.

## Migration

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/350_agentsam_performance_eto_events.sql
```

## Code

| Function | File | When |
|----------|------|------|
| `upsertEtoFromAgentRun` | `src/core/performance-eto.js` | Live chat finalize (`agent-run-routing.js`) |
| `upsertEtoFromEvalRun` / `scheduleEtoFromEvalRun` | same | Live eval (`eval-runner.js`) + batch `agentsam_eval_runs` |
| `recordEscalationAttempt` / `upsertEtoFromEscalationAttempt` | same | Each chat model attempt (success + failure) → Thompson training |
| `buildEtoEventsBatch` | same | Nightly backfill (yesterday) |
| `applyEtoToRoutingArms` | same | After build; stamps `applied_to_thompson_at` |
| `applyEtoToRoutingArms` (live) | `agent.js` chat tail + `eval-runner.js` suite end | **Default on** when `model: auto` or quickstart/benchmark batch; opt-out `apply_eto_after_run: false` |
| `shouldApplyEtoAfterRun` | `performance-eto.js` | Body flag parser for live apply |
| `runEtoPipeline` | same | `build` + `apply` + `enforceEvalSlosPauseArms` (`eto_pipeline`) |
| `enforceEvalSlosPauseArms` | `src/core/routing-cron.js` | Hourly + ETO pipeline; pauses arms on D1 eval SLO breach |

Cron order (1 AM UTC): `rollupExecutionPerformanceMetrics` → `runEtoPipeline`.

When the ETO table exists, `applyRoutingArmUsageFeedback` and `updateArmsFromMetrics` skip Thompson writes (ETO owns learning).

### Side effects (same pipeline)

| Target | When | Notes |
|--------|------|--------|
| `agentsam_model_routing_memory` | Live `upsertEtoFromAgentRun` + `applyEtoToRoutingArms` | `writeRoutingMemoryPrior` — pick-time cold-start priors |
| `agentsam_routing_arms` | `applyEtoToRoutingArms` | Thompson α/β + Welford cost/latency |
| `epm_id` on ETO | Live best-effort; batch `backfillEtoEpmIds` after EPM | **Not 1:1** — points at daily `mixed` EPM slice |

## `epm_id` semantics (read this before joining)

`agentsam_execution_performance_metrics` is a **daily aggregate** (`metric_grain = 'daily'`, `source_table = 'mixed'` for chat). Many `agent_run` rows share one EPM row per `(workspace_id, model_key, intent_category/task_type, metric_date)`.

- **`epm_id` is traceability**, not a foreign key to “this run’s metric row.”
- **Live chat** ETO rows often have `epm_id = NULL` until the next 1 AM UTC EPM rollup + `backfillEtoEpmIds`.
- **Batch** `buildEtoEventsBatch` runs **after** EPM in cron, then calls `backfillEtoEpmIds` for yesterday’s agent_run ETO rows.
- `evidence_json.epm_link` repeats the same note on live inserts.

```sql
SELECT e.id, e.source_id, e.epm_id, epm.execution_count, epm.success_count
FROM agentsam_performance_eto_events e
LEFT JOIN agentsam_execution_performance_metrics epm ON epm.id = e.epm_id
WHERE e.epm_id IS NOT NULL
LIMIT 10;
```

## Table shape (D1 Studio)

```sql
PRAGMA table_info(agentsam_performance_eto_events);
```

### Hard FKs (enforced)

| Column | → Parent |
|--------|----------|
| `routing_arm_id` | `agentsam_routing_arms(id)` |
| `inferred_routing_arm_id` | `agentsam_routing_arms(id)` |
| `model_catalog_id` | `agentsam_model_catalog(id)` |
| `workspace_id` | `agentsam_workspace(id)` |

### Soft links (indexed TEXT, no FK)

`agent_run_id`, `workflow_run_id`, `execution_id`, `execution_step_id`, `command_run_id`, `tool_call_id`, `mcp_tool_execution_id`, `eval_run_id`, `usage_event_id`

`epm_id` → `agentsam_execution_performance_metrics.id` (optional, **aggregate slice**, not enforced FK)

### Idempotency

`UNIQUE(source_table, source_id)` — allowed `source_table` values are CHECK-enforced (10 canonical tables).

### Effective arm (query / app)

```sql
COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), ''))
```

## D1 Studio verification queries

**1. Table exists**

```sql
SELECT name, sql FROM sqlite_master
WHERE name = 'agentsam_performance_eto_events';
```

**2. Row counts by source**

```sql
SELECT source_table, COUNT(*) AS n,
  SUM(is_training_eligible) AS eligible,
  SUM(CASE WHEN applied_to_thompson_at IS NOT NULL THEN 1 ELSE 0 END) AS applied
FROM agentsam_performance_eto_events
GROUP BY source_table
ORDER BY n DESC;
```

**3. Pending Thompson apply**

```sql
SELECT COUNT(*) AS pending
FROM agentsam_performance_eto_events
WHERE is_training_eligible = 1
  AND applied_to_thompson_at IS NULL
  AND COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), '')) != '';
```

**4. Arm fill rate (live agent_run sources)**

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN routing_arm_id IS NOT NULL AND trim(routing_arm_id) != '' THEN 1 ELSE 0 END) AS with_arm,
  SUM(CASE WHEN inferred_routing_arm_id IS NOT NULL AND trim(inferred_routing_arm_id) != '' THEN 1 ELSE 0 END) AS inferred,
  SUM(is_training_eligible) AS training
FROM agentsam_performance_eto_events
WHERE source_table = 'agentsam_agent_run'
  AND created_at >= datetime('now', '-7 days');
```

**5. Join to routing arms**

```sql
SELECT e.id, e.source_id, e.reward_reason, e.alpha_delta, e.beta_delta,
       e.applied_to_thompson_at,
       ra.model_key, ra.success_alpha, ra.success_beta
FROM agentsam_performance_eto_events e
LEFT JOIN agentsam_routing_arms ra
  ON ra.id = COALESCE(NULLIF(trim(e.routing_arm_id), ''), NULLIF(trim(e.inferred_routing_arm_id), ''))
ORDER BY e.created_at DESC
LIMIT 20;
```

**6. Cron ledger**

```sql
SELECT id, job_name, status, started_at, completed_at, metadata_json
FROM agentsam_cron_runs
WHERE job_name IN ('eto_pipeline', 'execution_performance_rollup')
ORDER BY started_at DESC
LIMIT 10;
```

**7. No duplicate usage+run training**

```sql
SELECT ue.id AS usage_id, ar.id AS run_id
FROM agentsam_usage_events ue
JOIN agentsam_performance_eto_events e_usage ON e_usage.source_table = 'agentsam_usage_events' AND e_usage.source_id = ue.id
JOIN agentsam_performance_eto_events e_run ON e_run.source_table = 'agentsam_agent_run' AND e_run.source_id = ue.ref_id
WHERE ue.ref_table = 'agentsam_agent_run'
LIMIT 10;
-- expect 0 rows after batch rules are healthy
```

## Eval stack — D1 vs Supabase

| Store | Role |
|--------|------|
| **D1** `agentsam_eval_runs` | Canonical live execution (Worker `eval-runner`, Thompson ETO source) |
| **Supabase** `public.agentsam_eval_runs` | Analytics / trends / model comparisons over time (mirror; row counts may diverge) |

ETO reads **D1 only**. Do not dual-write eval rows into ETO from Supabase.

- Live: `scheduleEtoFromEvalRun` after each D1 `agentsam_eval_runs` INSERT (`run_group_id` = `ra_*` arm id when set).
- Batch: `buildEtoEventsBatch` INSERTs yesterday’s eval_runs with `LEFT JOIN agentsam_task_slos` for `sla_breach`.
- SLO hook: `agentsam_task_slos.pause_arm_on_breach = 1` → `enforceEvalSlosPauseArms` sets `routing_arms.is_paused` on `eval_slo_breach:*` (model_key + task_type + mode).

## Related tables (where they live)

| Table | Shape hint | Studio |
|--------|------------|--------|
| `agentsam_agent_run` | ~30 cols; `id`, `routing_arm_id`, `model_id`, `status` | `PRAGMA table_info(agentsam_agent_run);` |
| `agentsam_routing_arms` | Thompson state; `id`, `task_type`, `mode`, `model_key`, α/β | `SELECT id, model_key, success_alpha, success_beta FROM agentsam_routing_arms LIMIT 5;` |
| `agentsam_execution_performance_metrics` | Daily rollup; `metric_date`, `source_table`, `routing_arm_id` | `SELECT source_table, COUNT(*) FROM agentsam_execution_performance_metrics GROUP BY 1;` |
| `agentsam_model_catalog` | `id`, `model_key`, costs | `SELECT id, model_key FROM agentsam_model_catalog WHERE is_active=1 LIMIT 10;` |
| `agentsam_workspace` | PK `id` (e.g. `ws_inneranimalmedia`) | `SELECT id, tenant_id FROM agentsam_workspace LIMIT 5;` |
| `agentsam_cron_runs` | Job ledger; `metadata_json` | See query 6 above |
