-- 333: Align deterministic tool routing with D1 prompt-route priority cleanup.
-- **Authoritative** migration for this sequence number. Do not add a second `migrations/333_*.sql`.
-- Regenerator output lives at `migrations/_wip_generated_agentsam_route_requirements_specialized_routes.sql`
-- (see scripts/audit/agentsam_route_tool_alignment_e2e.py); merge into this file when promoting.
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

-- Merged specialized route rows (single authoritative 333; do not add a second 333_*.sql).
-- agent_cloudflare
UPDATE agentsam_route_requirements
SET

  task_type = 'deploy',
  mode = 'approved_mutation',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["develop","observe","operate"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["worker.preview","logs.read","r2.read","r2.write","d1.read","github.read","github.write","terminal.execute"]',
  blocked_capability_keys_json = '["email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 10,
  is_active = 1
WHERE route_key = 'agent_cloudflare';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_cloudflare',
  'deploy',
  'approved_mutation',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["develop","observe","operate"]',
  '[]',
  '["worker.preview","logs.read","r2.read","r2.write","d1.read","github.read","github.write","terminal.execute"]',
  '["email.broadcast","secret.write"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  10,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_cloudflare')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_cloudflare');

-- agent_code
UPDATE agentsam_route_requirements
SET

  task_type = 'develop',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["develop","inspect","observe"]',
  required_capability_keys_json = '["code.search"]',
  optional_capability_keys_json = '["github.read","github.write","terminal.execute","d1.read","r2.read"]',
  blocked_capability_keys_json = '["worker.deploy","email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 12,
  is_active = 1
WHERE route_key = 'agent_code';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_code',
  'develop',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["develop","inspect","observe"]',
  '["code.search"]',
  '["github.read","github.write","terminal.execute","d1.read","r2.read"]',
  '["worker.deploy","email.broadcast","secret.write"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  12,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_code')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_code');

-- agent_frontend
UPDATE agentsam_route_requirements
SET

  task_type = 'develop',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["develop","inspect","observe","design"]',
  required_capability_keys_json = '["code.search"]',
  optional_capability_keys_json = '["browser.inspect","github.read","github.write","r2.read","r2.write","worker.preview"]',
  blocked_capability_keys_json = '["email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 12,
  is_active = 1
WHERE route_key = 'agent_frontend';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_frontend',
  'develop',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["develop","inspect","observe","design"]',
  '["code.search"]',
  '["browser.inspect","github.read","github.write","r2.read","r2.write","worker.preview"]',
  '["email.broadcast","secret.write"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  12,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_frontend')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_frontend');

-- agent_database
UPDATE agentsam_route_requirements
SET

  task_type = 'database',
  mode = 'approved_mutation',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["develop","inspect","observe"]',
  required_capability_keys_json = '["d1.read"]',
  optional_capability_keys_json = '["d1.write","d1.batch_write","schema.inspect","logs.read"]',
  blocked_capability_keys_json = '["worker.deploy","email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'agent_database';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_database',
  'database',
  'approved_mutation',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["develop","inspect","observe"]',
  '["d1.read"]',
  '["d1.write","d1.batch_write","schema.inspect","logs.read"]',
  '["worker.deploy","email.broadcast","secret.write"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_database')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_database');

-- agent_terminal
UPDATE agentsam_route_requirements
SET

  task_type = 'deploy',
  mode = 'approved_mutation',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["develop","observe","operate"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["terminal.execute","logs.read","github.read","d1.read","r2.read"]',
  blocked_capability_keys_json = '["email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'agent_terminal';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_terminal',
  'deploy',
  'approved_mutation',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["develop","observe","operate"]',
  '[]',
  '["terminal.execute","logs.read","github.read","d1.read","r2.read"]',
  '["email.broadcast","secret.write"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_terminal')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_terminal');

-- agent_debug
UPDATE agentsam_route_requirements
SET

  task_type = 'debug',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["inspect","observe","develop"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["browser.inspect","logs.read","d1.read","r2.read","github.read","code.search","mcp.catalog.read"]',
  blocked_capability_keys_json = '["worker.deploy","email.broadcast","secret.write"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'agent_debug';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_debug',
  'debug',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["inspect","observe","develop"]',
  '[]',
  '["browser.inspect","logs.read","d1.read","r2.read","github.read","code.search","mcp.catalog.read"]',
  '["worker.deploy","email.broadcast","secret.write"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_debug')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_debug');

-- agent_tool_orchestration
UPDATE agentsam_route_requirements
SET

  task_type = 'tool_use',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["think","research","inspect","observe","develop","operate","integrate","admin"]',
  required_capability_keys_json = '["mcp.catalog.read"]',
  optional_capability_keys_json = '["mcp.tool.inspect","workflow.run","agent.run","d1.read","logs.read"]',
  blocked_capability_keys_json = '["worker.deploy","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 24,
  is_active = 1
WHERE route_key = 'agent_tool_orchestration';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_tool_orchestration',
  'tool_use',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["think","research","inspect","observe","develop","operate","integrate","admin"]',
  '["mcp.catalog.read"]',
  '["mcp.tool.inspect","workflow.run","agent.run","d1.read","logs.read"]',
  '["worker.deploy","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  24,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_tool_orchestration')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_tool_orchestration');

-- agent_smoke_test
UPDATE agentsam_route_requirements
SET

  task_type = 'tool_use',
  mode = 'default_safe',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["inspect","observe","develop"]',
  required_capability_keys_json = '["mcp.catalog.read"]',
  optional_capability_keys_json = '["d1.read","logs.read","mcp.tool.inspect"]',
  blocked_capability_keys_json = '["worker.deploy","d1.write","d1.batch_write","terminal.execute","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 12,
  is_active = 1
WHERE route_key = 'agent_smoke_test';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_smoke_test',
  'tool_use',
  'default_safe',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["inspect","observe","develop"]',
  '["mcp.catalog.read"]',
  '["d1.read","logs.read","mcp.tool.inspect"]',
  '["worker.deploy","d1.write","d1.batch_write","terminal.execute","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  12,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_smoke_test')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_smoke_test');

-- agent_cost_audit
UPDATE agentsam_route_requirements
SET

  task_type = 'finance',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'mini',
  max_tier = 'standard',
  budget_priority = 'balanced',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["inspect","observe","integrate"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["d1.read","logs.read","context.search","mcp.catalog.read"]',
  blocked_capability_keys_json = '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast","billing.mutate"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 6,
  is_active = 1
WHERE route_key = 'agent_cost_audit';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_cost_audit',
  'finance',
  'default',
  1,
  1,
  'mini',
  'standard',
  'balanced',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["inspect","observe","integrate"]',
  '[]',
  '["d1.read","logs.read","context.search","mcp.catalog.read"]',
  '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast","billing.mutate"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  6,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_cost_audit')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_cost_audit');

-- agent_general
UPDATE agentsam_route_requirements
SET

  task_type = 'chat',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'mini',
  max_tier = 'standard',
  budget_priority = 'balanced',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["think","research","inspect"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["memory.read","context.search","browser.inspect","d1.read","mcp.catalog.read"]',
  blocked_capability_keys_json = '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 4,
  is_active = 1
WHERE route_key = 'agent_general';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'agent_general',
  'chat',
  'default',
  1,
  1,
  'mini',
  'standard',
  'balanced',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["think","research","inspect"]',
  '[]',
  '["memory.read","context.search","browser.inspect","d1.read","mcp.catalog.read"]',
  '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  4,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'agent_general')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'agent_general');

-- cms_live_editor.discover_cms_schema
UPDATE agentsam_route_requirements
SET

  task_type = 'cms_schema',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["inspect","develop","design"]',
  required_capability_keys_json = '["d1.read"]',
  optional_capability_keys_json = '["cms.schema.read","r2.read","context.search"]',
  blocked_capability_keys_json = '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'cms_live_editor.discover_cms_schema';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'cms_live_editor.discover_cms_schema',
  'cms_schema',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["inspect","develop","design"]',
  '["d1.read"]',
  '["cms.schema.read","r2.read","context.search"]',
  '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'cms_live_editor.discover_cms_schema')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'cms_live_editor.discover_cms_schema');

-- cms_live_editor.design_template_library
UPDATE agentsam_route_requirements
SET

  task_type = 'cms_design',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["design","inspect","develop"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["cms.template.read","r2.read","browser.inspect","context.search"]',
  blocked_capability_keys_json = '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'cms_live_editor.design_template_library';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'cms_live_editor.design_template_library',
  'cms_design',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["design","inspect","develop"]',
  '[]',
  '["cms.template.read","r2.read","browser.inspect","context.search"]',
  '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'cms_live_editor.design_template_library')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'cms_live_editor.design_template_library');

-- cms_live_editor.generate_dev_app_manifest
UPDATE agentsam_route_requirements
SET

  task_type = 'cms_manifest',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["develop","design","inspect"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["cms.manifest.write","r2.read","r2.write","d1.read"]',
  blocked_capability_keys_json = '["worker.deploy","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'cms_live_editor.generate_dev_app_manifest';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'cms_live_editor.generate_dev_app_manifest',
  'cms_manifest',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["develop","design","inspect"]',
  '[]',
  '["cms.manifest.write","r2.read","r2.write","d1.read"]',
  '["worker.deploy","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'cms_live_editor.generate_dev_app_manifest')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'cms_live_editor.generate_dev_app_manifest');

-- cms_live_editor.write_r2_artifacts
UPDATE agentsam_route_requirements
SET

  task_type = 'cms_publish',
  mode = 'approved_mutation',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["develop","design","operate"]',
  required_capability_keys_json = '["r2.write"]',
  optional_capability_keys_json = '["r2.read","d1.read","cms.artifact.write"]',
  blocked_capability_keys_json = '["worker.deploy","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'cms_live_editor.write_r2_artifacts';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'cms_live_editor.write_r2_artifacts',
  'cms_publish',
  'approved_mutation',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["develop","design","operate"]',
  '["r2.write"]',
  '["r2.read","d1.read","cms.artifact.write"]',
  '["worker.deploy","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'cms_live_editor.write_r2_artifacts')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'cms_live_editor.write_r2_artifacts');

-- cms_live_editor.verify_contract
UPDATE agentsam_route_requirements
SET

  task_type = 'cms_verify',
  mode = 'default',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'standard',
  max_tier = 'pro',
  budget_priority = 'quality',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["inspect","observe","develop"]',
  required_capability_keys_json = '[]',
  optional_capability_keys_json = '["browser.inspect","r2.read","d1.read","logs.read"]',
  blocked_capability_keys_json = '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 8,
  is_active = 1
WHERE route_key = 'cms_live_editor.verify_contract';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'cms_live_editor.verify_contract',
  'cms_verify',
  'default',
  1,
  1,
  'standard',
  'pro',
  'quality',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["inspect","observe","develop"]',
  '[]',
  '["browser.inspect","r2.read","d1.read","logs.read"]',
  '["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  8,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'cms_live_editor.verify_contract')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'cms_live_editor.verify_contract');

-- cms_live_editor.promotion_gate
UPDATE agentsam_route_requirements
SET

  task_type = 'cms_approval',
  mode = 'approved_mutation',
  requires_tools = 1,
  requires_streaming = 1,
  preferred_tier = 'mini',
  max_tier = 'standard',
  budget_priority = 'balanced',
  preferred_providers = '["openai","google","anthropic","workers_ai"]',
  blocked_providers = '[]',
  allowed_lanes_json = '["inspect","observe","operate"]',
  required_capability_keys_json = '["approval.request"]',
  optional_capability_keys_json = '["d1.read","logs.read","r2.read"]',
  blocked_capability_keys_json = '["worker.deploy","secret.write","email.broadcast"]',
  approval_policy_json = '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  max_tools = 6,
  is_active = 1
WHERE route_key = 'cms_live_editor.promotion_gate';

INSERT OR IGNORE INTO agentsam_route_requirements (
  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,
  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,
  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,
  approval_policy_json, max_tools, is_active
)
SELECT
  'cms_live_editor.promotion_gate',
  'cms_approval',
  'approved_mutation',
  1,
  1,
  'mini',
  'standard',
  'balanced',
  '["openai","google","anthropic","workers_ai"]',
  '[]',
  '["inspect","observe","operate"]',
  '["approval.request"]',
  '["d1.read","logs.read","r2.read"]',
  '["worker.deploy","secret.write","email.broadcast"]',
  '{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
  6,
  1
WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = 'cms_live_editor.promotion_gate')
  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'cms_live_editor.promotion_gate');



-- v_agentsam_mcp_tools_branded: stable capability_key for PRAGMA + route JSON audits (D1 may omit view columns until recreated).
DROP VIEW IF EXISTS v_agentsam_mcp_tools_branded;

CREATE VIEW v_agentsam_mcp_tools_branded AS
SELECT
  m.id,
  m.tool_name,
  m.tool_category,
  m.handler_type,
  COALESCE(
    NULLIF(trim(m.server_key), ''),
    NULLIF(trim(m.handler_type), ''),
    'workspace'
  ) AS handler_brand,
  CASE
    WHEN lower(COALESCE(m.tool_category, '')) IN ('terminal', 'shell', 'deploy') THEN 'develop'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('db_query', 'd1', 'database') THEN 'develop'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('browser', 'devtools', 'a11y', 'inspect') THEN 'inspect'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('mcp_tool', 'http', 'web_fetch', 'fetch') THEN 'research'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('operate', 'cron', 'queue') THEN 'operate'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('observe', 'metrics', 'logs') THEN 'observe'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('admin', 'billing') THEN 'admin'
    ELSE 'general'
  END AS capability_lane,
  CASE WHEN COALESCE(m.requires_approval, 0) = 1 THEN 'approval_required' ELSE 'standard' END AS safety_badge,
  m.description,
  m.input_schema,
  COALESCE(NULLIF(trim(m.risk_level), ''), 'low') AS risk_level,
  m.requires_approval,
  COALESCE(m.enabled, 1) AS enabled,
  COALESCE(m.sort_priority, 50) AS sort_priority,
  m.schema_hint,
  m.avg_latency_ms,
  m.failure_rate,
  COALESCE(NULLIF(trim(m.tool_key), ''), NULLIF(trim(m.tool_name), '')) AS tool_key,
  COALESCE(
    NULLIF(lower(trim(m.tool_key)), ''),
    NULLIF(lower(trim(m.tool_name)), ''),
    lower(replace(trim(COALESCE(m.tool_category, 'mcp')), ' ', '_'))
      || ':'
      || lower(replace(trim(COALESCE(m.tool_name, '')), ' ', '_'))
  ) AS capability_key,
  m.server_key,
  m.agentsam_tools_id,
  m.mcp_service_url
FROM agentsam_mcp_tools m
WHERE COALESCE(m.enabled, 0) = 1
  AND COALESCE(m.is_active, 0) = 1
  AND COALESCE(m.is_degraded, 0) = 0;

-- Post-merge sample check
SELECT route_key, task_type, mode, max_tools
FROM agentsam_route_requirements
WHERE route_key LIKE 'agent_%' OR route_key LIKE 'cms_live_editor%'
ORDER BY route_key
LIMIT 80;
