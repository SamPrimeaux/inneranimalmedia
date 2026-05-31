-- 480: reasoning_effort on agentsam_routing_arms (gate.js + routing telemetry).
--
-- Production (inneranimalmedia-business remote): column already present from
-- migrations/374_agentsam_routing_arms_agent_slug_unique.sql — ALTER will no-op
-- with "duplicate column name". Safe to skip ADD on that DB; run UPDATE below only.
--
-- Drifted / fresh replicas missing the column:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/480_agentsam_routing_arms_reasoning_effort.sql
--
-- Verify:
--   PRAGMA table_info(agentsam_routing_arms);  -- expect reasoning_effort
--   SELECT id, task_type, reasoning_effort FROM agentsam_routing_arms LIMIT 5;

ALTER TABLE agentsam_routing_arms ADD COLUMN reasoning_effort TEXT DEFAULT 'medium';

UPDATE agentsam_routing_arms
SET reasoning_effort = 'medium'
WHERE reasoning_effort IS NULL OR trim(reasoning_effort) = '';
