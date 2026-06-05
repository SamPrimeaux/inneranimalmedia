-- 577: Tenant-owned vector dataset connections (BYOK / external indexes) + platform registry tenant pin.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/577_tenant_vector_connections.sql

CREATE TABLE IF NOT EXISTS tenant_vector_connections (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  index_name TEXT,
  table_name TEXT,
  schema_name TEXT DEFAULT 'agentsam',
  binding_label TEXT,
  account_id TEXT,
  dimensions INTEGER,
  metric TEXT DEFAULT 'cosine',
  connection_status TEXT NOT NULL DEFAULT 'pending',
  config_json TEXT DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_vector_connections_tenant
  ON tenant_vector_connections(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tenant_vector_connections_workspace
  ON tenant_vector_connections(workspace_id, is_active);

-- Platform CF lanes: operator-only (tenant_sam_primeaux).
UPDATE vectorize_index_registry
SET tenant_id = 'tenant_sam_primeaux',
    updated_at = datetime('now')
WHERE binding_name LIKE 'AGENTSAM_VECTORIZE_%'
  AND (tenant_id IS NULL OR trim(tenant_id) = '');
