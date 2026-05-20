# Thompson routing — incremental test playbook (agents)

**Repo:** `/Users/samprimeaux/inneranimalmedia` only  
**Live deploy:** Worker `164585f` + overview remaster `c4baa8c` (May 2026)  
**Canonical learning:** D1 `agentsam_performance_eto_events` → `applyEtoToRoutingArms` → `agentsam_routing_arms`

Use this doc when populating **real** routing/metrics data or validating providers. Never seed fake α/β without a source row in ETO or `agentsam_agent_run`.

---

## Golden rules

1. **D1 is truth** for Thompson picks and arm state; Supabase is observability mirror.
2. **One source row → one ETO row** (`UNIQUE(source_table, source_id)`).
3. **Auto routing** (`model: auto`) triggers live `applyEtoToRoutingArms` after each chat (opt-out: `apply_eto_after_run: false`).
4. **Pinned model** does not auto-apply ETO unless `apply_eto_after_run: true` or benchmark flags.
5. Validate with **D1 SQL + Worker logs**, not `/health` alone.

---

## Layer 0 — Preconditions (run once per environment)

```bash
# ETO table exists (migration 350)
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml --json --command \
  "SELECT name FROM sqlite_master WHERE name='agentsam_performance_eto_events';"

# Arms + catalog for workspace under test
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml --json --command \
  "SELECT COUNT(*) AS arms FROM agentsam_routing_arms WHERE workspace_id='<workspace_id>' AND is_active=1 AND is_eligible=1;"
```

Replace `<workspace_id>` from session (`GET /api/auth/me` → `workspace_id`). Do not hardcode in committed scripts.

---

## Layer 1 — Single provider smoke (one model, one outcome)

**Goal:** Prove chat spine + ETO + arm update for one provider.

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | `POST /api/agent/chat` with `model: auto`, `apply_eto_after_run: true`, real `workspace_id` | SSE completes; `agentsam_agent_run` row with `routing_arm_id` NOT NULL |
| 2 | Worker logs | `[agent] applyEtoToRoutingArms_after_chat` with `armsUpdated` > 0 OR `no_arms_updated` + pending ETO query explains why |
| 3 | D1 ETO | `SELECT * FROM agentsam_performance_eto_events WHERE source_table='agentsam_agent_run' ORDER BY created_at DESC LIMIT 3;` |
| 4 | D1 arms | `success_alpha`/`success_beta`/`total_executions` changed for that `routing_arm_id` |

**Anthropic-only batch:** See `anthropic_team_test_flows.md` — `quickstart_batch=anthropic_smoketest_quickstart`.

---

## Layer 2 — Thompson draw diversity (multi-model)

**Goal:** Confirm bandit explores eligible arms, not a single pinned winner.

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | 10+ auto chats, same `task_type`/`mode`, varied prompts | Multiple `routing_arm_id` values in `agentsam_agent_run` |
| 2 | Force failure path once | `agentsam_escalation` rows; ETO `source_table='agentsam_escalation'` |
| 3 | D1 | Pending ETO → 0 after each chat (live apply) |

```sql
SELECT model_key, COUNT(*) AS picks
FROM agentsam_agent_run
WHERE workspace_id = ? AND created_at > unixepoch('now','-1 hour')
  AND routing_arm_id IS NOT NULL
GROUP BY model_key;
```

---

## Layer 3 — Eval / benchmark harness

**Goal:** Controlled scores → ETO → arms (repeatable benchmarks).

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | Active suite in `agentsam_eval_suites` + cases in `agentsam_eval_cases` | Suite `is_active=1` |
| 2 | Trigger eval (milestone on arm or manual eval runner) | Rows in `agentsam_eval_runs` |
| 3 | Logs | `[eval-runner] applyEtoToRoutingArms` with `armsUpdated` > 0 |
| 4 | Manual flush | `POST /api/agent/routing/apply-eto` (session auth) returns `{ ok: true, armsUpdated: N }` |

---

## Layer 4 — Metrics rollups (dashboards)

**Goal:** Overview / analytics show real aggregates, not empty stubs.

| Table | Populated by | UI surface |
|-------|----------------|------------|
| `agentsam_agent_run` | Chat finalize | Model Intelligence leaderboard, agent analytics |
| `agentsam_routing_arms` | ETO apply, `recordCallOutcome` | Cost/latency scatter, routing tab |
| `agentsam_execution_performance_metrics` | Command/chat rollups (cron + realtime command path) | D1 telemetry, costs |
| `agentsam_usage_events` | `writeUsageEvent` | Spend charts |
| `agentsam_eval_runs` | Eval runner | Model quality scores |
| Supabase `agentsam_routing_decisions` | `writeSupabaseRoutingDecision` | Realtime signal (decisions only) |

**Bundle check (authenticated):**

```bash
curl -sS -b "$COOKIE" "https://inneranimalmedia.com/api/overview/bundle?workspace_id=<ws>" | jq '.model_leaderboard | length, .routing_arms | length'
```

**UI:** `/dashboard/overview` → Model Intelligence card; hard refresh after deploy (`deploy:frontend` if chunks 404).

---

## Layer 5 — Provider matrix (incremental)

Add one provider column at a time; do not enable all providers in one batch.

| Provider | Catalog key pattern | Suggested first `task_type` | Notes |
|----------|---------------------|-----------------------------|--------|
| Anthropic | `anthropic_*` | `intent_classification` / `chat` | `anthropic_team_test_flows.md` |
| OpenAI | `gpt-*` | `chat` | Watch `agentsam_model_pricing` list rates |
| Google | `gemini-*` | `chat` | Tool policy via `supports_tools` |
| Cloudflare | `wai-*`, `@cf/*` | `chat` | Deprioritized in Thompson order SQL |

Per provider: 3 success + 1 failure → verify ETO deltas → verify arm movement → then next provider.

---

## SQL verification pack (copy/paste in D1 Studio)

```sql
-- Pending training not yet applied to arms
SELECT COUNT(*) AS pending_eto
FROM agentsam_performance_eto_events
WHERE is_training_eligible = 1 AND applied_to_thompson_at IS NULL;

-- Arm state for workspace
SELECT id, model_key, task_type, mode, success_alpha, success_beta,
       total_executions, decayed_score, cost_mean, latency_mean, is_paused
FROM agentsam_routing_arms
WHERE workspace_id = '<workspace_id>'
ORDER BY total_executions DESC LIMIT 20;

-- Recent agent runs with arm linkage
SELECT id, model_key, routing_arm_id, status, total_cost_usd, created_at
FROM agentsam_agent_run
WHERE workspace_id = '<workspace_id>'
ORDER BY created_at DESC LIMIT 10;

-- Escalation training feed
SELECT source_id, model_key, alpha_delta, beta_delta, reward_reason, created_at
FROM agentsam_performance_eto_events
WHERE source_table = 'agentsam_escalation'
ORDER BY created_at DESC LIMIT 10;
```

---

## Python audits (repo scripts)

Run from repo root after real traffic exists:

```bash
python3 scripts/audit_run_spine_linkage.py
python3 scripts/plan01_chat_run_spine_audit.py
python3 scripts/audit_agentsam_table_usage.py
```

See `docs/agentsam_knowledge/plans_1_7_python_audit_guide.md`.

---

## Anti-patterns (mark task blocked)

| Flag | Meaning |
|------|---------|
| `HEALTH_ONLY_FALSE_SUCCESS` | Only checked `/health` |
| `STUBBED_SUCCESS` | Manual SQL on arms without ETO/agent_run source |
| `DRY_RUN_MISMATCH` | Benchmark wrote to wrong workspace |
| `HARDCODED_IDENTITY` | `ws_*` / `tenant_*` in test scripts |

---

## Related docs

- `performance_eto_events.md` — ETO lifecycle
- `thompson_routing_repair.md` — prior fixes, verify queries
- `d1_supabase_routing_mirror.md` — D1 vs Supabase
- `anthropic_team_test_flows.md` — Phase-1 provider smoke
