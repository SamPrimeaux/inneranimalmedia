-- 424: MCP catalog fixes (zero Worker deploy) — agentsam_tools + OAuth allowlist hygiene.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/424_mcp_catalog_fixes.sql
--
-- Fixes from smoke-mcp-live.mjs (2026-05-27): r2_list operation, D1 scoping on discovery SQL,
-- workflow_trigger row, memory_save alias target, blocked external allowlist keys.

-- ── 1–2. r2_list / r2_read: MCP handleR2 requires handler_config.operation ─────────────
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{"binding":"ASSETS","auth_source":"platform"}'
    ELSE handler_config
  END,
  '{"operation":"list"}'
),
updated_at = unixepoch()
WHERE tool_key = 'r2_list'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{"binding":"ASSETS","auth_source":"platform"}'
    ELSE handler_config
  END,
  '{"operation":"read"}'
),
updated_at = unixepoch()
WHERE tool_key = 'r2_read'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

-- Mirror on agentsam_mcp_tools when present (MCP runtime reads agentsam_tools; keep parity).
UPDATE agentsam_mcp_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{"operation":"list"}'
    ELSE handler_config
  END,
  '{"operation":"list"}'
),
updated_at = unixepoch()
WHERE tool_key = 'r2_list';

UPDATE agentsam_mcp_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{"operation":"read"}'
    ELSE handler_config
  END,
  '{"operation":"read"}'
),
updated_at = unixepoch()
WHERE tool_key = 'r2_read';

-- ── 3–4. Discovery D1 tools: SQL must satisfy assertD1SqlScoped (workspace_id / tenant_id) ─
UPDATE agentsam_tools
SET handler_config = '{"sql":"SELECT id, name, tenant_id, r2_prefix, github_repo FROM workspaces WHERE workspace_id = :workspace_id AND tenant_id = :tenant_id LIMIT 1","bind_workspace":true,"envelope":"mcp_health"}',
updated_at = unixepoch()
WHERE tool_key = 'agentsam_health_check'
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET handler_config = '{"sql":"SELECT w.id, w.name, w.handle, w.domain, w.tenant_id, w.r2_prefix, w.github_repo, ws.settings_json AS settings_json FROM workspaces w LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id WHERE w.workspace_id = :workspace_id AND w.tenant_id = :tenant_id LIMIT 1","bind_workspace":true,"envelope":"workspace_context"}',
updated_at = unixepoch()
WHERE tool_key = 'agentsam_workspace_context'
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_mcp_tools
SET handler_config = '{"sql":"SELECT id, name, tenant_id, r2_prefix, github_repo FROM workspaces WHERE workspace_id = :workspace_id AND tenant_id = :tenant_id LIMIT 1","bind_workspace":true,"envelope":"mcp_health"}',
updated_at = unixepoch()
WHERE tool_key = 'agentsam_health_check';

UPDATE agentsam_mcp_tools
SET handler_config = '{"sql":"SELECT w.id, w.name, w.handle, w.domain, w.tenant_id, w.r2_prefix, w.github_repo, ws.settings_json AS settings_json FROM workspaces w LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id WHERE w.workspace_id = :workspace_id AND w.tenant_id = :tenant_id LIMIT 1","bind_workspace":true,"envelope":"workspace_context"}',
updated_at = unixepoch()
WHERE tool_key = 'agentsam_workspace_context';

-- ── 5. agentsam_workflow_trigger: alias pointed at missing mcp_workflow_trigger ─────────
INSERT OR IGNORE INTO agentsam_tools (
  id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  handler_type,
  description,
  input_schema,
  handler_config,
  risk_level,
  requires_approval,
  requires_confirmation,
  is_active,
  is_degraded,
  workspace_scope,
  sort_priority,
  is_global,
  updated_at
) VALUES (
  'ast_agentsam_workflow_trigger',
  'agentsam_workflow_trigger',
  'agentsam_workflow_trigger',
  'Workflow Trigger',
  'workflow',
  'http',
  'Start a registered workflow for this workspace (POST /api/agent/workflow/start).',
  '{"type":"object","properties":{"workflow_key":{"type":"string"},"workflowId":{"type":"string"},"input":{"type":"object"}},"required":["workflow_key"]}',
  '{"url":"https://inneranimalmedia.com/api/agent/workflow/start","method":"POST","auth":"workspace_token","body":"full_args"}',
  'medium',
  1,
  0,
  1,
  0,
  '["*"]',
  12,
  1,
  unixepoch()
);

UPDATE agentsam_capability_aliases
SET match_value = 'agentsam_workflow_trigger',
    rationale = COALESCE(rationale, '') || ' (424: canonical tool_key row)',
    is_active = 1
WHERE abstract_capability = 'agentsam_workflow_trigger'
  AND match_kind = 'tool_key';

-- ── 6. agentsam_memory_save: alias → missing agent_memory_write; point at live row ───────
UPDATE agentsam_capability_aliases
SET match_value = 'agentsam_memory_write',
    rationale = COALESCE(rationale, '') || ' (424: agentsam_memory_write catalog row)',
    is_active = 1
WHERE abstract_capability = 'agentsam_memory_save'
  AND match_kind = 'tool_key';

-- ── 7. OAuth allowlist: deactivate non-MCP-executable external keys ─────────────────────
UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 0,
    updated_at = unixepoch(),
    notes = COALESCE(notes, '') || ' | 424: deactivated (filesystem/hyperdrive — not MCP-executable)'
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    'agentsam_file_read',
    'agentsam_file_write',
    'agentsam_knowledge_search'
  );

-- ── Verify (informational) ───────────────────────────────────────────────────────────────
SELECT tool_key, handler_config
FROM agentsam_tools
WHERE tool_key IN ('r2_list', 'r2_read', 'agentsam_health_check', 'agentsam_workspace_context', 'agentsam_workflow_trigger');

SELECT COUNT(*) AS active_oauth_allowlist
FROM agentsam_mcp_oauth_tool_allowlist
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND COALESCE(is_active, 1) = 1;
