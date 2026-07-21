-- 966: Plan spine hygiene — expire stuck intake; abandon never-executed orphans.
-- Does NOT touch daily workbench rows (plan_type='daily').
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/966_plan_spine_hygiene_and_intake_expire.sql

-- Stuck clarify cards (never answered) → expired
UPDATE agentsam_plan_intake_batches
SET status = 'expired',
    answered_at = COALESCE(answered_at, unixepoch())
WHERE status = 'pending'
  AND created_at < unixepoch('now', '-3 days');

-- Feature/sprint/incident plans that were created and never touched (no Build, no refine)
-- stay "active" forever and inflate zero-done metrics. Mark abandoned after 14d idle.
UPDATE agentsam_plans
SET status = 'abandoned',
    updated_at = unixepoch()
WHERE status = 'active'
  AND COALESCE(plan_type, '') NOT IN ('daily')
  AND COALESCE(tasks_done, 0) = 0
  AND created_at = updated_at
  AND created_at < unixepoch('now', '-14 days');
