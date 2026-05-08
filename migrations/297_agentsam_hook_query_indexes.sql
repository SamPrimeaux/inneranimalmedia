-- Faster hook lookup for tenant/workspace/trigger + audit joins (agentsam_hook_execution).
-- agentsam_hook.updated_at: restored for /api/settings/hooks (removed during 273_hook_alignment reshape).
-- Idempotent: CREATE INDEX IF NOT EXISTS; ALTER ADD COLUMN may error if updated_at already exists — skip that line on re-run.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/297_agentsam_hook_query_indexes.sql

ALTER TABLE agentsam_hook ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_tenant_ws_trigger
  ON agentsam_hook(tenant_id, workspace_id, trigger, is_active);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_ws_ran
  ON agentsam_hook_execution(workspace_id, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_hook_status
  ON agentsam_hook_execution(hook_id, status, ran_at DESC);
