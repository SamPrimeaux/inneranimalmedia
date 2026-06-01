-- 490: Read-only repo audit child route — evidence tools pinned; orchestration blocked.

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
  'readonly_repo_audit',
  'Read-only repo audit',
  '["audit","inspect","repo","evidence","read_only","multitask_child"]',
  '["inspect","research","develop"]',
  '["audit","inspect","trace","matrix","runtime.profile","src/","tool selection"]',
  '["core_identity","workspace_context","agent_tool_routing"]',
  '["builtin","mcp","database"]',
  '[]',
  8,
  NULL,
  NULL,
  0,
  0,
  0,
  0,
  1,
  6000,
  1,
  8,
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
  'req_readonly_repo_audit',
  'readonly_repo_audit',
  1,
  'mini',
  'standard',
  'cost',
  '[]',
  '[]',
  1
);

UPDATE agentsam_route_requirements SET
  task_type = COALESCE(task_type, 'ask'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["inspect","develop","research","observe"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["workspace.read","code.search","github.read","repo_search","file.read","grep","d1.read","d1.schema"]',
  blocked_capability_keys_json = '["memory.write","memory.save","knowledge_search","knowledge.search","rag.search","context.search","terminal.execute","worker.deploy","d1.write","python.execute"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"deny","dangerous":"deny"}',
  max_tools = 8
WHERE route_key = 'readonly_repo_audit';
