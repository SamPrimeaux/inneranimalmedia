-- =============================================================================
-- 301_agentsam_analytics_tenant_id.sql — multi-tenant time tracking scope
-- =============================================================================
-- Fixes: [time_tracking] D1_ERROR: table agentsam_analytics has no column named tenant_id
--
-- Apply (remote, idempotent):
--   ./scripts/apply_migration_301_agentsam_analytics_tenant_id.sh
-- =============================================================================

ALTER TABLE agentsam_analytics ADD COLUMN tenant_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_analytics ADD COLUMN workspace_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_analytics_tenant
  ON agentsam_analytics(tenant_id, bucket_date);
