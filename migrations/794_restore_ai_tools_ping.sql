-- 794: Restore ai_complete + agentsam_run_agent on OAuth catalog; add agentsam_ping.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/794_restore_ai_tools_ping.sql

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, handler_key, handler_config,
  description, input_schema,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_global, workspace_scope, oauth_visible, dispatch_target,
  sort_priority, updated_at
) VALUES
(
  'ast_ai_complete',
  'ai_complete',
  'ai_complete',
  'AI Complete',
  'ai',
  'ai',
  'ai_complete',
  '{"operation":"complete","default_provider":"anthropic","auth_source":"workspace"}',
  'Single-turn LLM completion for OAuth MCP clients (Anthropic/OpenAI/Gemini via catalog).',
  '{"type":"object","properties":{"prompt":{"type":"string","description":"User prompt"},"message":{"type":"string","description":"Alias for prompt"},"system":{"type":"string"},"provider":{"type":"string","enum":["anthropic","openai","gemini"]},"model":{"type":"string"},"max_tokens":{"type":"integer","minimum":1,"maximum":8192},"temperature":{"type":"number"}},"additionalProperties":true}',
  'medium',
  0,
  0,
  1,
  1,
  '["*"]',
  1,
  'both',
  130,
  unixepoch()
),
(
  'ast_agentsam_run_agent',
  'agentsam_run_agent',
  'agentsam_run_agent',
  'Run Agent Workflow',
  'agent',
  'agent',
  'agentsam_run_agent',
  '{"handler":"agentsam_run_agent","auth_source":"workspace"}',
  'Execute an agentsam workflow by workflow_key (async graph runner). Requires approval in registry.',
  '{"type":"object","properties":{"workflow_key":{"type":"string","description":"Workflow key from agentsam_workflows"},"agent_id":{"type":"string","description":"Alias for workflow_key"},"prompt":{"type":"string","description":"Optional user message mapped to workflow input"},"input":{"type":"object","description":"Workflow input payload"}},"required":["workflow_key"],"additionalProperties":true}',
  'high',
  1,
  0,
  1,
  1,
  '["*"]',
  1,
  'both',
  100,
  unixepoch()
),
(
  'ast_agentsam_ping',
  'agentsam_ping',
  'agentsam_ping',
  'Ping',
  'platform',
  'platform',
  'agentsam_ping',
  '{"operation":"ping","auth_source":"none"}',
  'Liveness ping — returns MCP server version and workspace context (no side effects).',
  '{"type":"object","properties":{"echo":{"type":"string","description":"Optional string echoed in response"}},"additionalProperties":false}',
  'low',
  0,
  0,
  1,
  1,
  '["*"]',
  1,
  'mcp',
  3,
  unixepoch()
);

UPDATE agentsam_tools
SET
  handler_type = 'ai',
  handler_key = 'ai_complete',
  handler_config = '{"operation":"complete","default_provider":"anthropic","auth_source":"workspace"}',
  oauth_visible = 1,
  is_active = 1,
  dispatch_target = COALESCE(NULLIF(dispatch_target, ''), 'both'),
  updated_at = unixepoch()
WHERE tool_key = 'ai_complete';

UPDATE agentsam_tools
SET
  handler_type = 'agent',
  handler_key = 'agentsam_run_agent',
  handler_config = '{"handler":"agentsam_run_agent","auth_source":"workspace"}',
  oauth_visible = 1,
  is_active = 1,
  requires_approval = 1,
  dispatch_target = COALESCE(NULLIF(dispatch_target, ''), 'both'),
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_run_agent';

UPDATE agentsam_tools
SET oauth_visible = 1, is_active = 1, updated_at = unixepoch()
WHERE tool_key = 'agentsam_ping';

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, expose_on_connector, connector_priority, updated_at
) VALUES
  ('iam_mcp_inneranimalmedia', 'ai_complete', 'write', 130, '794: LLM completion', 1, 1, 130, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'agentsam_run_agent', 'write', 100, '794: workflow runner', 1, 1, 100, unixepoch()),
  ('iam_mcp_inneranimalmedia', 'agentsam_ping', 'read', 3, '794: MCP liveness ping', 1, 1, 3, unixepoch());

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1, expose_on_connector = 1, updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN ('ai_complete', 'agentsam_run_agent', 'agentsam_ping');
