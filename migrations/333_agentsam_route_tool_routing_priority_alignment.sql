-- 333: Align deterministic tool routing with D1 prompt-route priority cleanup.
-- Contract: agentsam_prompt_routes.priority — lower number wins (see Worker resolveAgentsamPromptRoute).
-- Validation (run against D1 after apply):
--   SELECT pr.route_key, pr.display_name, pr.max_tools, pr.priority
--   FROM agentsam_prompt_routes pr
--   LEFT JOIN agentsam_route_requirements rr ON rr.route_key = pr.route_key
--   WHERE pr.is_active = 1 AND rr.route_key IS NULL
--   ORDER BY pr.priority, pr.route_key;
--
--   SELECT route_key, max_tools, allowed_lanes_json
--   FROM agentsam_route_requirements
--   WHERE is_active = 1 AND COALESCE(max_tools,0) > 0
--     AND (allowed_lanes_json IS NULL OR trim(allowed_lanes_json) IN ('','[]'));
--
-- simple_ask_greeting: zero MCP tools (must match pr.max_tools = 0).
UPDATE agentsam_route_requirements SET
  requires_tools = 0,
  max_tools = 0,
  mode = 'default',
  allowed_lanes_json = '["think","general"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '[]',
  blocked_capability_keys_json = '["terminal_execute","terminal_run","worker_deploy","d1_write","d1_query","python_execute","secret_write","email_broadcast"]',
  approval_policy_json = '{"high_risk_requires_approval":true}'
WHERE route_key = 'simple_ask_greeting';

-- Planning / research: distinct from generic chat (still DB-driven; avoids falling back to empty policy).
UPDATE agentsam_route_requirements SET
  task_type = COALESCE(task_type, 'plan'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["think","design","research"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["knowledge_search","excalidraw_open","d1_query","context_search","mcp_catalog_read"]',
  blocked_capability_keys_json = '["terminal_execute","terminal_run"]',
  approval_policy_json = '{"high_risk_requires_approval":true}',
  max_tools = 8
WHERE route_key = 'agent_planning';

UPDATE agentsam_route_requirements SET
  task_type = COALESCE(task_type, 'summary'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["research","think","inspect"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["knowledge_search","context_search","d1_query","browser_inspect","mcp_catalog_read"]',
  blocked_capability_keys_json = '["terminal_execute","terminal_run"]',
  approval_policy_json = '{"high_risk_requires_approval":true}',
  max_tools = 8
WHERE route_key = 'agent_research';

-- Default protocol profile for cms_live_editor.* prompt routes (exact child rows may still override).
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
  'req_cms_live_editor_default_protocol',
  'cms_live_editor._default_protocol',
  1,
  'mini',
  'standard',
  'balanced',
  '[]',
  '[]',
  1
);

UPDATE agentsam_route_requirements SET
  task_type = COALESCE(task_type, 'cms_edit'),
  mode = 'default',
  requires_tools = 1,
  allowed_lanes_json = '["design","develop","inspect","research"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["context_search","d1_read","mcp_catalog_read","workspace_read","knowledge_search"]',
  blocked_capability_keys_json = '["email_broadcast","secret_write"]',
  approval_policy_json = '{"high_risk_requires_approval":true}',
  max_tools = 14
WHERE route_key = 'cms_live_editor._default_protocol';

-- Experimental local fallback: small read-biased surface (adjust in D1 as needed).
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
  'req_ollama_local_pinstest',
  'ollama-local-workflow-pinstest',
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
  allowed_lanes_json = '["think","research"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["memory_read","context_search","mcp_catalog_read"]',
  blocked_capability_keys_json = '["terminal_execute","worker_deploy","d1_write","secret_write"]',
  approval_policy_json = '{"high_risk_requires_approval":true}',
  max_tools = 4
WHERE route_key = 'ollama-local-workflow-pinstest';
