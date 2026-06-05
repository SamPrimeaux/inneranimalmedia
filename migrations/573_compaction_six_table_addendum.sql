-- 573: Six-table compaction addendum — project context demotion, usage_events 24h, error breakdown column.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/573_compaction_six_table_addendum.sql

-- Step 3 pre-deploy: demote stale ws_inneranimalmedia priority-100 rows (canonical = ctx_iam_platform).
UPDATE agentsam_project_context
SET priority = 50, status = 'archived', updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND id != 'ctx_iam_platform'
  AND status = 'active'
  AND priority = 100;

-- usage_events: 24h hot retention (rollup-first at 1 AM).
UPDATE data_retention_policies
SET retention_days = 1, is_active = 1, condition = NULL
WHERE table_name = 'agentsam_usage_events';

INSERT OR IGNORE INTO data_retention_policies (id, table_name, retention_days, condition, is_active)
SELECT 'ret_usage_events_24h', 'agentsam_usage_events', 1, NULL, 1
WHERE NOT EXISTS (
  SELECT 1 FROM data_retention_policies
  WHERE table_name = 'agentsam_usage_events' AND COALESCE(is_active, 1) = 1
);

-- error_breakdown_json: applied manually before first deploy (ALTER is not idempotent in batch import).
