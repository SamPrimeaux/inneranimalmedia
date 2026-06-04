-- 559: D1 bloat phase 2 — agentsam_scripts body purge, retention policies, autorag script paths.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/559_d1_bloat_phase2_retention.sql

-- Phase 2: R2-backed scripts store metadata only (bytes live in inneranimalmedia-autorag/scripts/).
UPDATE agentsam_scripts
SET body = '',
    updated_at_epoch = unixepoch()
WHERE source_stored LIKE 'r2:%'
  AND COALESCE(body, '') != '';

-- Point registered scripts at autorag bucket (upload via ./scripts/upload-agentsam-scripts-r2.sh).
UPDATE agentsam_scripts SET
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/rotate-supabase-db-password.sh',
  path = 'scripts/maintenance/rotate-supabase-db-password.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'rotate_supabase_db_password';

UPDATE agentsam_scripts SET
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/sync-supabase-db-password.sh',
  path = 'scripts/maintenance/sync-supabase-db-password.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'sync_supabase_db_password';

UPDATE agentsam_scripts SET
  source_stored = 'r2:inneranimalmedia-autorag/scripts/maintenance/verify-supabase-pg.mjs',
  path = 'scripts/maintenance/verify-supabase-pg.mjs',
  updated_at_epoch = unixepoch()
WHERE slug = 'verify_supabase_pg';

-- ── data_retention_policies (midnight runRetentionPurge) ─────────────────────

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_tool_call_log'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_tool_call_log' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_mcp_tool_execution'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_mcp_tool_execution' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_hook_execution'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_hook_execution' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies SET is_active = 0
WHERE table_name = 'agentsam_webhook_events'
  AND COALESCE(is_active, 1) = 1
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM data_retention_policies
    WHERE table_name = 'agentsam_webhook_events' AND COALESCE(is_active, 1) = 1
  );

UPDATE data_retention_policies
SET retention_days = 30, condition = NULL, is_active = 1
WHERE table_name = 'agentsam_tool_call_log'
  AND COALESCE(is_active, 1) = 1;

UPDATE data_retention_policies
SET retention_days = 30, is_active = 1
WHERE table_name = 'agentsam_mcp_tool_execution'
  AND COALESCE(is_active, 1) = 1;

UPDATE data_retention_policies
SET retention_days = 30, is_active = 1
WHERE table_name = 'agentsam_hook_execution'
  AND COALESCE(is_active, 1) = 1;

UPDATE data_retention_policies
SET retention_days = 14,
    condition = 'payload_json IS NULL OR status IN (''processed'',''ignored'',''duplicate'')',
    is_active = 1
WHERE table_name = 'agentsam_webhook_events'
  AND COALESCE(is_active, 1) = 1;

INSERT OR IGNORE INTO data_retention_policies (id, table_name, retention_days, condition, is_active)
VALUES
  ('ret_tool_chain_60d', 'agentsam_tool_chain', 60, NULL, 1),
  ('ret_exec_steps_30d', 'agentsam_execution_steps', 30, NULL, 1),
  ('ret_cron_runs_45d', 'agentsam_cron_runs', 45, NULL, 1);
