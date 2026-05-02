-- Tenant/user-scoped storage policy rows for S3-compatible access rules.
-- Apply prod:
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/234_storage_policies.sql

CREATE TABLE IF NOT EXISTS storage_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  actions TEXT NOT NULL,
  resource TEXT NOT NULL DEFAULT '*',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_storage_policies_tenant
  ON storage_policies(tenant_id);
