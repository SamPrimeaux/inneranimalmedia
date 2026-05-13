-- 332: agentsam_route_requirements deterministic tool routing setup
-- Schema-compatible with current live D1:
-- agentsam_route_requirements has UNIQUE(route_key), so seed one row per route_key.
-- Do not insert multiple task_type/mode variants under the same route_key.

-- Ensure MCP panel parent route exists.
INSERT OR IGNORE INTO agentsam_prompt_routes (
  route_key,
  display_name,
  intent_labels,
  command_categories,
  trigger_keywords,
  prompt_layer_keys,
  tool_categories,
  tool_keys,
  max_tools,
  preferred_model,
  fallback_model,
  include_rag,
  include_active_plan,
  include_recent_memory,
  memory_limit,
  include_workspace_ctx,
  token_budget,
  is_active,
  priority,
  tenant_id
)
VALUES (
  'mcp_panel',
  'MCP Panel',
  '["mcp","tools","catalog","inspect","panel"]',
  '["mcp","tools","catalog"]',
  '["mcp","tool","catalog","inspect","panel"]',
  '["core_identity","workspace_context","agent_tool_routing"]',
  '["mcp","builtin"]',
  '[]',
  24,
  NULL,
  NULL,
  0,
  1,
  1,
  5,
  1,
  3000,
  1,
  75,
  'tenant_sam_primeaux'
);

ALTER TABLE agentsam_route_requirements ADD COLUMN mode TEXT DEFAULT 'default';
ALTER TABLE agentsam_route_requirements ADD COLUMN allowed_lanes_json TEXT DEFAULT '[]';
ALTER TABLE agentsam_route_requirements ADD COLUMN required_capability_keys_json TEXT DEFAULT '[]';
ALTER TABLE agentsam_route_requirements ADD COLUMN optional_capability_keys_json TEXT DEFAULT '[]';
ALTER TABLE agentsam_route_requirements ADD COLUMN blocked_capability_keys_json TEXT DEFAULT '[]';
ALTER TABLE agentsam_route_requirements ADD COLUMN approval_policy_json TEXT DEFAULT '{}';
ALTER TABLE agentsam_route_requirements ADD COLUMN max_tools INTEGER;

UPDATE agentsam_route_requirements
SET
  mode = COALESCE(mode, 'default'),
  allowed_lanes_json = COALESCE(NULLIF(allowed_lanes_json, ''), '[]'),
  required_capability_keys_json = COALESCE(NULLIF(required_capability_keys_json, ''), '[]'),
  optional_capability_keys_json = COALESCE(NULLIF(optional_capability_keys_json, ''), '[]'),
  blocked_capability_keys_json = COALESCE(NULLIF(blocked_capability_keys_json, ''), '[]'),
  approval_policy_json = COALESCE(NULLIF(approval_policy_json, ''), '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}'),
  max_tools = COALESCE(max_tools, 4)
WHERE is_active = 1;

-- General ask/chat: tiny safe set.
UPDATE agentsam_route_requirements
SET
  task_type = COALESCE(task_type, 'chat'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["think","research","inspect"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["memory.read","context.search","browser.inspect","d1.read","mcp.catalog.read"]',
  blocked_capability_keys_json = '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 4
WHERE route_key IN ('general','chat','agent_general','simple_ask_greeting','summary','plan','agent_planning','agent_research');

-- Debug: inspect + observe + read-only develop.
UPDATE agentsam_route_requirements
SET
  task_type = COALESCE(task_type, 'debug'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["inspect","observe","develop"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["browser.inspect","logs.read","d1.read","r2.read","github.read","code.search","mcp.catalog.read"]',
  blocked_capability_keys_json = '["worker.deploy","email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8
WHERE route_key IN ('debug','agent_debug','code_review','security_audit','agent_cost_audit');

-- Code/build/frontend: allow dev lanes, mutations require approval.
UPDATE agentsam_route_requirements
SET
  task_type = COALESCE(task_type, 'develop'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["develop","inspect","observe","design"]',
  required_capability_keys_json = '["code.search"]',
  optional_capability_keys_json = '["github.read","github.write","d1.read","d1.write","r2.read","r2.write","terminal.execute","browser.inspect","worker.preview"]',
  blocked_capability_keys_json = '["email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 12
WHERE route_key IN ('code','agent_code','agent_frontend','client_work','cms_edit');

-- Database: D1 read required, writes approval-gated.
UPDATE agentsam_route_requirements
SET
  task_type = COALESCE(task_type, 'database'),
  mode = 'approved_mutation',
  requires_tools = 1,
  allowed_lanes_json = '["develop","inspect","observe"]',
  required_capability_keys_json = '["d1.read"]',
  optional_capability_keys_json = '["d1.write","d1.batch_write","schema.inspect","logs.read"]',
  blocked_capability_keys_json = '["worker.deploy","email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8
WHERE route_key IN ('db_query','agent_database');

-- Deploy/R2/Cloudflare/terminal: powerful, approval-gated.
UPDATE agentsam_route_requirements
SET
  task_type = COALESCE(task_type, 'deploy'),
  mode = 'approved_mutation',
  requires_tools = 1,
  allowed_lanes_json = '["develop","observe","operate"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["worker.deploy","github.read","github.write","d1.read","r2.read","r2.write","logs.read","terminal.execute","worker.preview"]',
  blocked_capability_keys_json = '["email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"approval_required","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 10
WHERE route_key IN ('deploy','r2_ops','terminal_execution','agent_terminal','agent_cloudflare');

-- Workflow/tool orchestration: broad catalog, still approval-gated for mutations.
UPDATE agentsam_route_requirements
SET
  task_type = COALESCE(task_type, 'tool_use'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["think","research","inspect","observe","develop","design","operate","integrate","admin"]',
  required_capability_keys_json = '["mcp.catalog.read"]',
  optional_capability_keys_json = '["mcp.tool.inspect","d1.read","logs.read","context.search","workflow.run","agent.run"]',
  blocked_capability_keys_json = '["worker.deploy","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 24
WHERE route_key IN ('tool_use','workflow_run','workflow_orchestration','agent_tool_orchestration','agent_smoke_test','mcp_panel');

-- If mcp_panel had no child row yet, create exactly one.
INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key,
  task_type,
  mode,
  requires_tools,
  requires_streaming,
  preferred_tier,
  max_tier,
  budget_priority,
  preferred_providers,
  blocked_providers,
  allowed_lanes_json,
  required_capability_keys_json,
  optional_capability_keys_json,
  blocked_capability_keys_json,
  approval_policy_json,
  max_tools,
  is_active
)
VALUES (
  'mcp_panel',
  'tool_use',
  'default',
  1,
  1,
  'mini',
  'standard',
  'balanced',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["think","research","inspect","observe","develop","design","operate","integrate","admin"]',
  '["mcp.catalog.read"]',
  '["mcp.tool.inspect","d1.read","logs.read","context.search"]',
  '["worker.deploy","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  24,
  1
);

SELECT
  route_key,
  task_type,
  mode,
  requires_tools,
  allowed_lanes_json,
  required_capability_keys_json,
  optional_capability_keys_json,
  blocked_capability_keys_json,
  approval_policy_json,
  max_tools,
  is_active
FROM agentsam_route_requirements
WHERE is_active = 1
ORDER BY route_key;
