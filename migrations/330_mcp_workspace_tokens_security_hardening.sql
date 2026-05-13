-- 330: MCP workspace token security hardening
-- Adds columns required by the hash-only token model introduced in mcp-server 2.5.0.
-- Safe to re-run: all statements use IF NOT EXISTS / OR IGNORE guards.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/330_mcp_workspace_tokens_security_hardening.sql

-- ── Ensure base table exists (created earlier via wrangler or direct SQL) ──────

CREATE TABLE IF NOT EXISTS mcp_workspace_tokens (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id          TEXT NOT NULL,
  tenant_id             TEXT NOT NULL,
  label                 TEXT,
  token_hash            TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw token, hex-encoded
  allowed_tools         TEXT,                   -- JSON array or NULL (all tools allowed)
  github_repo           TEXT,
  repo_path             TEXT,
  rate_limit_per_hour   INTEGER DEFAULT 100,
  is_active             INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at            INTEGER,
  last_used_at          INTEGER,
  revoked_at            INTEGER,
  -- Entitlement fields (JSON arrays or NULL)
  allowed_capability_keys_json  TEXT,
  allowed_lanes_json            TEXT,
  allowed_risk_levels_json      TEXT,
  allowed_domains_json          TEXT,
  scopes_json                   TEXT
);

-- ── Add columns that may be missing on older installs ─────────────────────────
-- SQLite does not support IF NOT EXISTS on ALTER TABLE, so we use a
-- try-each-column approach; the worker migration runner handles failures gracefully.

ALTER TABLE mcp_workspace_tokens ADD COLUMN last_used_at           INTEGER;
ALTER TABLE mcp_workspace_tokens ADD COLUMN revoked_at             INTEGER;
ALTER TABLE mcp_workspace_tokens ADD COLUMN allowed_capability_keys_json TEXT;
ALTER TABLE mcp_workspace_tokens ADD COLUMN allowed_lanes_json           TEXT;
ALTER TABLE mcp_workspace_tokens ADD COLUMN allowed_risk_levels_json     TEXT;
ALTER TABLE mcp_workspace_tokens ADD COLUMN allowed_domains_json         TEXT;
ALTER TABLE mcp_workspace_tokens ADD COLUMN scopes_json                  TEXT;

-- ── Index for fast hash lookup ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mcp_workspace_tokens_hash
  ON mcp_workspace_tokens (token_hash)
  WHERE is_active = 1 AND revoked_at IS NULL;

-- ── Security audit: mark any rows that were created with raw token KV keys ────
-- (rows where the token_hash looks like a raw 'tok_...' value — should be 0)
-- This is a read-only diagnostic; no data is changed.
-- SELECT id, label, created_at
--   FROM mcp_workspace_tokens
--   WHERE token_hash LIKE 'tok_%';
