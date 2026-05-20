# D1 execution truth vs Supabase analytics mirror

## Split

| Layer | Store | Role |
|--------|--------|------|
| **Execution truth** | D1 `agentsam_routing_arms` | Thompson state (α/β), picks, pauses, `total_executions` |
| **Training ledger** | D1 `agentsam_performance_eto_events` | Per-event rewards → nightly `applyEtoToRoutingArms` |
| **Analytics mirror** | Supabase `public.agentsam_routing_arms` | Arm dimension for BI / dashboards (seeded from D1 ids) |
| **Decision log** | Supabase `public.agentsam_routing_decisions` | Per-chat decision row; must use **same** `routing_arm_id` as D1 |
| **Learning views** | `v_agentsam_route_learning_events`, `v_agentsam_thompson_arm_scores` | Rollups over decisions + arms |

Supabase row counts can exceed D1 (historical imports, mirrors). **Picks and bandit updates always follow D1.**

## `routing_arm_id` contract

- Valid ids look like D1 primary keys: `ra_*`, `arm_*` (whatever `agentsam_routing_arms.id` uses).
- **Invalid:** `arm_<md5(model_key|task|mode)>` — deterministic fallbacks for backfill only; do not write from Worker.

Worker paths:

1. **Chat start** — `scheduleAgentsamChatAgentRunStart` → `buildChatRoutingDecisionPayload` → `resolveD1RoutingArmIdForDecision` → `writeSupabaseRoutingDecision`
2. **Chat end** — `scheduleAgentsamChatAgentRunInsert` patches Supabase with **outcome** arm (winning model after escalation) + `models_tried` metadata
3. **Each escalation attempt** — D1 `agentsam_escalation` + ETO `source_table=agentsam_escalation` (Thompson training)

## Verify arm linkage

```sql
-- D1
SELECT id, model_key, task_type, mode, success_alpha, success_beta, total_executions
FROM agentsam_routing_arms
WHERE id LIKE 'ra_%' OR id LIKE 'arm_%'
LIMIT 10;

-- Supabase (after mirror sync)
SELECT id, model_key, task_type, mode FROM public.agentsam_routing_arms LIMIT 10;

-- Decisions should join on id, not synthetic hash
SELECT COUNT(*) FROM public.agentsam_routing_decisions
WHERE routing_arm_id IS NULL OR routing_arm_id LIKE 'arm_%' AND length(routing_arm_id) = 37;
```

## Pumping real metrics

See `thompson_routing_repair.md` and `performance_eto_events.md`. Minimum loop:

1. Auto chat volume → D1 ETO (`escalation` + `agent_run`) + Supabase decisions with real `routing_arm_id`
2. Nightly `eto_pipeline` → D1 arms updated
3. Supabase views reflect decisions joined to mirrored arms
