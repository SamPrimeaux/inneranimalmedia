-- MCP OAuth refresh columns on mcp_workspace_tokens.
-- Production: added manually 2026-06-03 (refresh_token_hash, refresh_expires_at).
-- D1 SQLite does not support ADD COLUMN IF NOT EXISTS; ledger marks this migration applied.
-- Fresh DBs: run once before OAuth refresh ship:
--   ALTER TABLE mcp_workspace_tokens ADD COLUMN refresh_token_hash TEXT;
--   ALTER TABLE mcp_workspace_tokens ADD COLUMN refresh_expires_at INTEGER;

SELECT 1;
