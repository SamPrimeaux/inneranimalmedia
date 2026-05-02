-- 241: Cloudflare Access External Evaluation entitlements for MCP
-- Apply (prod example):
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/241_mcp_entitlements.sql

CREATE TABLE IF NOT EXISTS mcp_entitlements (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id   TEXT NOT NULL,
  user_email  TEXT,             -- null = all users in tenant
  service     TEXT NOT NULL DEFAULT 'mcp',
  effect      TEXT NOT NULL DEFAULT 'allow' CHECK(effect IN ('allow', 'deny')),
  expires_at  TEXT,             -- null = never expires (ISO8601)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_ent_tenant  ON mcp_entitlements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_ent_email   ON mcp_entitlements(user_email);
CREATE INDEX IF NOT EXISTS idx_mcp_ent_service ON mcp_entitlements(service);

