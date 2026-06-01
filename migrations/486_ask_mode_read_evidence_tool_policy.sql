-- 486: Ask composer mode — read-only evidence tools; mutation/execution blocked.
-- resolvePromptRouteRow binds route_key = mode ('ask') before task_type fallback.

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
) VALUES (
  'ask',
  'Ask',
  '["ask","question","explain","lookup","evidence"]',
  '["chat","research","inspect"]',
  '["ask","what","how","why","explain","lookup","schema","table","rows"]',
  '["core_identity","workspace_context","agent_tool_routing"]',
  '["builtin","mcp","database"]',
  '[]',
  8,
  NULL,
  NULL,
  1,
  0,
  1,
  8,
  1,
  4000,
  1,
  12,
  NULL
);

INSERT OR IGNORE INTO agentsam_route_requirements (
  id,
  route_key,
  requires_tools,
  preferred_tier,
  max_tier,
  budget_priority,
  preferred_providers,
  blocked_providers,
  is_active
) VALUES (
  'req_ask_read_evidence',
  'ask',
  0,
  'mini',
  'standard',
  'cost',
  '[]',
  '[]',
  1
);

UPDATE agentsam_route_requirements SET
  task_type = COALESCE(task_type, 'chat'),
  mode = 'default',
  requires_tools = 0,
  allowed_lanes_json = '["think","research","inspect","observe"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["memory.read","context.search","knowledge_search","d1.read","d1.schema","browser.inspect","mcp.catalog.read","code.search","github.read","workspace.read"]',
  blocked_capability_keys_json = '["terminal.execute","worker.deploy","d1.write","python_execute","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"deny","dangerous":"deny"}',
  max_tools = 8
WHERE route_key = 'ask';
