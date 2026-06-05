-- 572: agentsam_tool_call_log hot retention — 24h (rollup-first via midnight usage pipeline).
-- Purge runs at 0 1 * * * via one_am_compaction_pipeline → rollupToolCallLogDaily.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/572_tool_call_log_retention_24h.sql

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_tool_call_log'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_tool_call_log' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies
SET retention_days = 1, condition = NULL, is_active = 1
WHERE table_name = 'agentsam_tool_call_log'
  AND COALESCE(is_active, 1) = 1;

INSERT OR IGNORE INTO data_retention_policies (id, table_name, retention_days, condition, is_active)
SELECT 'ret_tool_call_log_24h', 'agentsam_tool_call_log', 1, NULL, 1
WHERE NOT EXISTS (
  SELECT 1 FROM data_retention_policies
  WHERE table_name = 'agentsam_tool_call_log' AND COALESCE(is_active, 1) = 1
);
