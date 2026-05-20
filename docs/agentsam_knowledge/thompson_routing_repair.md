# Thompson routing repair (May 2026)

## Problems addressed

1. **Inflated priors** — arms with `total_executions = 0` but `success_alpha > 1.5` (seeded, not earned) caused Thompson to favor phantom winners (e.g. `gpt-5.4-nano` at α≈17).
2. **Escalation black hole** — chat fallback wrote `agentsam_escalation` but not ETO; failed attempts never moved α/β.
3. **Hardcoded waterfall** — `loadToolFallbackChain` / `agentsam_ai` sort_order spliced a fixed list after the first failure instead of re-sampling Thompson.
4. **Dead quality signal** — `avg_quality_score` / `quality_n` rarely updated (workspace-only UPDATE missed global arms).

## Fixes shipped

| Fix | What |
|-----|------|
| **351 migration** | `UPDATE … SET success_alpha=1, success_beta=1 WHERE total_executions=0 AND success_alpha>1.5` |
| **ETO escalation** | `recordEscalationAttempt` → `agentsam_escalation` + `agentsam_performance_eto_events` (`source_table=agentsam_escalation`) per attempt |
| **Thompson fallback** | After failure: `resolveRoutingArm({ excludeModelKeys: tried })` — second/third pick is Thompson, not `agentsam_ai` sort_order |
| **Quality** | `scheduleRoutingArmQualityUpdate` tries workspace arm then global (`workspace_id=''`); success path passes `confidence` as quality |
| **recordArmOutcome** | When ETO table exists: only `total_executions++` (no inline α/β; ETO + nightly `applyEtoToRoutingArms` own learning) |

## Verify (D1 Studio)

```sql
-- Untested arms should be Beta(1,1)
SELECT model_key, task_type, mode, success_alpha, success_beta, total_executions
FROM agentsam_routing_arms
WHERE COALESCE(total_executions, 0) = 0
ORDER BY success_alpha DESC LIMIT 20;

-- Escalation training rows
SELECT source_id, model_key, alpha_delta, beta_delta, reward_reason, created_at
FROM agentsam_performance_eto_events
WHERE source_table = 'agentsam_escalation'
ORDER BY created_at DESC LIMIT 15;

-- Quality signal filling
SELECT model_key, avg_quality_score, quality_n, total_executions
FROM agentsam_routing_arms
WHERE COALESCE(quality_n, 0) > 0
ORDER BY quality_n DESC LIMIT 10;
```

## Deploy

Worker deploy required for chat path changes. Migration 351 is safe to run before or after deploy.

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/351_reset_synthetic_routing_arm_priors.sql
```
