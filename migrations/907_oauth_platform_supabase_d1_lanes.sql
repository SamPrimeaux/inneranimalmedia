-- 907: Operator OAuth (Claude/ChatGPT) Supabase + RAG lanes use platform Hyperdrive, not BYOK workspace.
-- auth_source=workspace was misleading: these tools already carried hyperdrive_id (platform pooler).
-- Explicit data_plane=platform + auth_source=platform so MCP dispatch never falls into user BYOK SQL.

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.data_plane', 'platform',
      '$.binding', 'HYPERDRIVE'
    ),
    updated_at = datetime('now')
WHERE tool_key IN (
  'agentsam_supabase_query',
  'agentsam_supabase_write',
  'agentsam_supabase_vector',
  'agentsam_autorag'
);

-- Semantic memory CRUD on platform D1/pgvector registry (operator session).
UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.scope', 'platform_operator'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_memory_manager';

-- D1 CRUD for OAuth: still requires CF credentials, but favor platform token lane for operators.
-- Explicit database_id in args continues to target any D1 in the account (not only workspace default).
UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.lane', 'account_d1',
      '$.hint', 'Pass database_id for any account D1; omit to use operator default (inneranimalmedia-business).'
    ),
    updated_at = datetime('now')
WHERE tool_key IN ('agentsam_d1_query', 'agentsam_d1_write', 'agentsam_d1_migrate');

-- Ensure a dedicated delete surface aliases write (DELETE SQL via same d1.write handler).
INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'agentsam_d1_delete', 'agentsam_d1_delete', 'D1 Delete', 'database',
  'Execute DELETE SQL against Cloudflare D1. Pass sql + optional database_id (any account D1). Prefer RETURNING for row payloads.',
  '{"type":"object","additionalProperties":false,"properties":{"sql":{"type":"string"},"query":{"type":"string"},"database_id":{"type":"string"},"params":{"type":"array"}},"required":[]}',
  'cf',
  '{"operation":"d1.write","auth_source":"platform","provider":"cloudflare","resource":"d1","lane":"account_d1","mutation":"delete"}',
  'high', 1, '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'agentsam_d1_delete');

INSERT OR REPLACE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, is_active, notes,
  created_at, updated_at, expose_on_connector, connector_priority
) VALUES (
  'iam_mcp_inneranimalmedia', 'agentsam_d1_delete', 'write', 95, 1,
  'D1 DELETE via platform CF credentials; pass database_id for non-default D1',
  unixepoch(), unixepoch(), 1, 95
);
