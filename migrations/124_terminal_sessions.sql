-- 124: terminal_sessions — PTY session persistence (tunnel_url, resume)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/124_terminal_sessions.sql

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  user_id TEXT NOT NULL DEFAULT 'sam',
  tunnel_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  shell TEXT,
  cwd TEXT,
  cols INTEGER,
  rows INTEGER,
  auth_token_hash TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user_status ON terminal_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_updated ON terminal_sessions(updated_at DESC);
