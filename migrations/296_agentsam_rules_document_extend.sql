-- Extend agentsam_rules_document (created in migrations/163_agentsam_cursor_parity.sql).
-- Optional columns for multi-tenant / identity joins; safe for dashboard + agent prompt queries.
--
-- NOT fully idempotent: if a column already exists, SQLite returns an error and you can skip that statement.
-- Apply once per environment, or remove lines for columns that already exist.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/296_agentsam_rules_document_extend.sql

ALTER TABLE agentsam_rules_document ADD COLUMN person_uuid TEXT;

ALTER TABLE agentsam_rules_document ADD COLUMN tenant_id TEXT;

-- Listing rules for Settings UI (user_id + recency)
CREATE INDEX IF NOT EXISTS idx_agentsam_rules_user_active_updated
  ON agentsam_rules_document(user_id, is_active, updated_at DESC);

-- Agent prompt assembly: workspace-scoped active docs by freshness
CREATE INDEX IF NOT EXISTS idx_agentsam_rules_ws_active_updated
  ON agentsam_rules_document(workspace_id, is_active, updated_at DESC);

-- Tenant-scoped dashboards (when tenant_id is populated)
CREATE INDEX IF NOT EXISTS idx_agentsam_rules_tenant_ws_active
  ON agentsam_rules_document(tenant_id, workspace_id, is_active)
  WHERE tenant_id IS NOT NULL;
