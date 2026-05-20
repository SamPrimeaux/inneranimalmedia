-- 351: Reset inflated Beta priors on arms that never executed (seeded / manual inflation).
-- Honest ignorance: Beta(1,1) for untested arms so Thompson explores fairly.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/351_reset_synthetic_routing_arm_priors.sql

UPDATE agentsam_routing_arms
SET
  success_alpha = 1.0,
  success_beta = 1.0,
  decayed_score = 0.5,
  updated_at = unixepoch()
WHERE COALESCE(total_executions, 0) = 0
  AND COALESCE(success_alpha, 1.0) > 1.5;
