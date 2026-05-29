-- 466: R2 agent tools — get/put/delete only; no wrangler object list in agent path.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/466_r2_agent_get_put_delete_only.sql

UPDATE agentsam_tools
SET
  is_degraded = 1,
  description = COALESCE(description, '') || ' [DEGRADED: use r2_read/r2_write/r2_delete with explicit bucket+key — no object listing. Wrangler supports get/put/delete only.]',
  handler_config = json_patch(
    COALESCE(NULLIF(trim(handler_config), ''), '{}'),
    '{"operation":"list","auth_source":"platform","listing":"disabled"}'
  ),
  updated_at = unixepoch()
WHERE tool_key IN ('r2_list', 'agentsam_r2_list')
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET
  handler_config = json_patch(
    COALESCE(NULLIF(trim(handler_config), ''), '{"binding":"ASSETS","auth_source":"platform"}'),
    '{"operation":"read"}'
  ),
  description = 'Read R2 object by bucket + key (get). Customer: connect R2 keys in Settings → Storage.',
  updated_at = unixepoch()
WHERE tool_key IN ('r2_read', 'agentsam_r2_read')
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET
  handler_config = json_patch(
    COALESCE(NULLIF(trim(handler_config), ''), '{"binding":"ASSETS","auth_source":"platform"}'),
    '{"operation":"write"}'
  ),
  description = 'Write R2 object by bucket + key (put). Approval-gated. Customer: own R2 credentials required.',
  updated_at = unixepoch()
WHERE tool_key IN ('r2_write', 'agentsam_r2_write', 'agentsam_r2_upload', 'r2_upload')
  AND COALESCE(is_active, 1) = 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_r2_delete',
  'r2_delete', 'r2_delete', 'R2 Delete Object', 'storage.r2', 'r2', 'r2_delete',
  'Delete one R2 object by bucket + key. Customer must connect R2 API keys; platform bindings owner-only.',
  '{"type":"object","properties":{"bucket":{"type":"string"},"key":{"type":"string"}},"required":["bucket","key"]}',
  '{"operation":"delete","binding":"ASSETS","auth_source":"customer"}',
  'r2_delete',
  'high', 1, 1, 1, 0, '["*"]', 55, 1, unixepoch()
);

UPDATE agentsam_tools
SET is_degraded = 1,
    description = COALESCE(description, '') || ' [DEGRADED: prefix search not supported — use explicit keys.]',
    updated_at = unixepoch()
WHERE tool_key = 'r2_search'
  AND COALESCE(is_active, 1) = 1;
