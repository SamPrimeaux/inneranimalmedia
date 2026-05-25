-- 414: Database-controlled external MCP clients (ChatGPT, Claude.ai, Cursor) + user allowlist.
-- Runtime: src/core/mcp-oauth-external-clients.js (IAM) — not hardcoded in Worker guards.
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file migrations/414_mcp_oauth_external_client_registry.sql

CREATE TABLE IF NOT EXISTS agentsam_mcp_oauth_external_client_registry (
  client_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  oauth_client_id TEXT NOT NULL DEFAULT 'iam_mcp_inneranimalmedia',
  redirect_host_patterns TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_ext_client_registry_active
  ON agentsam_mcp_oauth_external_client_registry (oauth_client_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS agentsam_mcp_oauth_user_client_allowlist (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  client_key TEXT NOT NULL,
  tenant_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, workspace_id, client_key)
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_user_client_allowlist_ws
  ON agentsam_mcp_oauth_user_client_allowlist (workspace_id, client_key, is_active);

-- Canonical external apps (single OAuth client_id; identity from redirect_uri at runtime).
INSERT OR IGNORE INTO agentsam_mcp_oauth_external_client_registry
  (client_key, display_name, oauth_client_id, redirect_host_patterns, sort_order, notes)
VALUES
  ('chatgpt', 'ChatGPT', 'iam_mcp_inneranimalmedia',
   '["chatgpt.com","chat.openai.com"]', 10,
   'OpenAI ChatGPT connector_platform_oauth + per-connector redirect'),
  ('claude', 'Claude.ai', 'iam_mcp_inneranimalmedia',
   '["claude.ai","claude.com"]', 20,
   'Anthropic Claude.ai MCP auth_callback'),
  ('cursor', 'Cursor', 'iam_mcp_inneranimalmedia',
   '["mcp.inneranimalmedia.com"]', 30,
   'Cursor via IAM MCP worker /auth/callback');

-- User rows in agentsam_mcp_oauth_user_client_allowlist are written at OAuth consent approve
-- (session user_id + workspace_id from oauth_authorizations — never seeded with au_* here).
-- When a user has zero rows, runtime allows any active registry client (see mcp-oauth-external-clients.js).

-- Service metadata (observability / admin; not OAuth enforcement).
UPDATE mcp_services
SET allowed_clients = '["cursor","chatgpt","claude","agent_sam_dashboard","trusted_mcp_clients"]',
    updated_at = unixepoch(),
    metadata = json_set(
      COALESCE(metadata, '{}'),
      '$.allowed_external_mcp_clients', json('["chatgpt","claude","cursor"]')
    ),
    metadata_updated_at = unixepoch()
WHERE id = 'inneranimalmedia-mcp';

-- Default MCP text/JSON tool result schema for ChatGPT "output schema recommended" UX.
UPDATE agentsam_tools
SET output_schema = '{"type":"object","properties":{"ok":{"type":"boolean"},"text":{"type":"string"},"data":{},"error":{"type":"string"}},"additionalProperties":true}',
    updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND COALESCE(is_degraded, 0) = 0
  AND (
    tool_key IN (SELECT tool_key FROM agentsam_mcp_oauth_tool_allowlist
                  WHERE client_id = 'iam_mcp_inneranimalmedia' AND COALESCE(is_active, 1) = 1)
    OR display_name IN (SELECT tool_key FROM agentsam_mcp_oauth_tool_allowlist
                         WHERE client_id = 'iam_mcp_inneranimalmedia' AND COALESCE(is_active, 1) = 1)
    OR tool_key IN (SELECT match_value FROM agentsam_capability_aliases
                     WHERE match_kind = 'tool_key' AND COALESCE(is_active, 1) = 1
                       AND abstract_capability IN (
                         SELECT tool_key FROM agentsam_mcp_oauth_tool_allowlist
                          WHERE client_id = 'iam_mcp_inneranimalmedia' AND COALESCE(is_active, 1) = 1
                       ))
  )
  AND (trim(COALESCE(output_schema, '')) IN ('', '{}'));
