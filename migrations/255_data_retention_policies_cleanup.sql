-- 255: Deduplicate active data_retention_policies, add missing table policies, align agentsam_webhook_events (3d).
-- Schema: id, table_name, retention_days, condition, is_active, last_purged_at, rows_purged_total, created_at
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/255_data_retention_policies_cleanup.sql

-- ── Dedup: keep one active row (MIN(rowid)) per table ───────────────────────

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_usage_events'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_usage_events' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_hook_execution'
  AND retention_days = 30
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_hook_execution' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'terminal_history'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'terminal_history' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_webhook_events'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_webhook_events' AND COALESCE(is_active, 1) = 1
  );

-- ── Align existing webhook_events policy (7 → 3 days, conditional purge) ───

UPDATE data_retention_policies
SET retention_days = 3,
    condition = 'status IN (''processed'',''ignored'')'
WHERE table_name = 'agentsam_webhook_events'
  AND COALESCE(is_active, 1) = 1;

-- ── Missing policies (INSERT OR IGNORE by id; webhook row inserted only if none exists) ──

INSERT OR IGNORE INTO data_retention_policies (id, table_name, retention_days, condition, is_active)
VALUES
  ('ret_oauth_nonces', 'oauth_state_nonces', 1, 'expires_at < unixepoch()', 1),
  ('ret_auth_events', 'auth_event_log', 90, 'status = ''ok''', 1),
  ('ret_routing_arms_log', 'agentsam_shadow_runs', 7, NULL, 1),
  ('ret_exec_ctx', 'agentsam_execution_context', 7, 'status = ''complete''', 1),
  ('ret_prompt_cache', 'agentsam_prompt_cache_keys', 3, 'expires_at < unixepoch()', 1),
  ('ret_compaction', 'agentsam_compaction_events', 30, NULL, 1),
  ('ret_mcp_exec', 'agentsam_mcp_tool_execution', 30, 'status IN (''success'',''failed'')', 1);

INSERT OR IGNORE INTO data_retention_policies (id, table_name, retention_days, condition, is_active)
SELECT 'ret_webhook_3d', 'agentsam_webhook_events', 3, 'status IN (''processed'',''ignored'')', 1
WHERE NOT EXISTS (
  SELECT 1 FROM data_retention_policies WHERE table_name = 'agentsam_webhook_events'
);

UPDATE data_retention_policies
SET retention_days = 3,
    condition = 'status IN (''processed'',''ignored'')'
WHERE table_name = 'agentsam_webhook_events'
  AND COALESCE(is_active, 1) = 1;
