-- Allow per-tenant agentsam_prompt_routes rows (route_key was globally UNIQUE).
-- FK refs on route_key: disable during rebuild, then seed Connor nano/mini routes.

PRAGMA foreign_keys=OFF;

CREATE TABLE agentsam_prompt_routes__551 (
  id                    TEXT PRIMARY KEY,
  route_key             TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  intent_labels         TEXT DEFAULT '[]',
  command_categories    TEXT DEFAULT '[]',
  trigger_keywords      TEXT DEFAULT '[]',
  prompt_layer_keys     TEXT NOT NULL DEFAULT '["core_identity"]',
  tool_categories       TEXT DEFAULT '[]',
  tool_keys             TEXT DEFAULT '[]',
  max_tools             INTEGER DEFAULT 8,
  preferred_model       TEXT DEFAULT NULL,
  fallback_model        TEXT DEFAULT NULL,
  include_rag           INTEGER DEFAULT 0,
  include_active_plan   INTEGER DEFAULT 1,
  include_recent_memory INTEGER DEFAULT 1,
  memory_limit          INTEGER DEFAULT 5,
  include_workspace_ctx INTEGER DEFAULT 1,
  token_budget          INTEGER DEFAULT 2000,
  is_active             INTEGER DEFAULT 1,
  priority              INTEGER DEFAULT 50,
  tenant_id             TEXT DEFAULT NULL,
  created_at            INTEGER DEFAULT (unixepoch()),
  updated_at            INTEGER DEFAULT (unixepoch()),
  mcp_arguments_json    TEXT DEFAULT '[]',
  mcp_template          TEXT DEFAULT ''
);

INSERT INTO agentsam_prompt_routes__551
SELECT
  id, route_key, display_name,
  intent_labels, command_categories, trigger_keywords,
  prompt_layer_keys, tool_categories, tool_keys, max_tools,
  preferred_model, fallback_model,
  include_rag, include_active_plan, include_recent_memory, memory_limit, include_workspace_ctx,
  token_budget, is_active, priority, tenant_id, created_at, updated_at,
  mcp_arguments_json, mcp_template
FROM agentsam_prompt_routes;

DROP TABLE agentsam_prompt_routes;

ALTER TABLE agentsam_prompt_routes__551 RENAME TO agentsam_prompt_routes;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_prompt_routes_key_tenant
  ON agentsam_prompt_routes(route_key, COALESCE(tenant_id, ''));

CREATE INDEX IF NOT EXISTS idx_prompt_routes_priority
  ON agentsam_prompt_routes(is_active, priority);

CREATE INDEX IF NOT EXISTS idx_prompt_routes_tenant
  ON agentsam_prompt_routes(tenant_id, is_active);

PRAGMA foreign_keys=ON;

INSERT INTO agentsam_prompt_routes
  (id, route_key, display_name, preferred_model, fallback_model, token_budget, tenant_id, priority, is_active)
VALUES
  ('route_connor_chat',     'chat',                  'General Chat [Connor]',      'gpt-5.4-nano', 'gpt-4.1-nano',       600,  'tenant_connor_mcneely', 10, 1),
  ('route_connor_code',     'code',                  'Code Gen [Connor]',          'gpt-5.4-nano', 'wai-qwen-coder-32b', 2000, 'tenant_connor_mcneely', 10, 1),
  ('route_connor_general',  'general',               'General [Connor]',           'gpt-5.4-nano', 'gpt-4.1-nano',       800,  'tenant_connor_mcneely', 10, 1),
  ('route_connor_plan',     'plan',                  'Planning [Connor]',          'gpt-5.4-mini', 'gpt-5.4-nano',       2000, 'tenant_connor_mcneely', 10, 1),
  ('route_connor_debug',    'debug',                 'Debug [Connor]',             'gpt-5.4-mini', 'gpt-5.4-nano',       1500, 'tenant_connor_mcneely', 10, 1),
  ('route_connor_github',   'github',                'GitHub [Connor]',            'gpt-5.4-nano', 'gpt-4.1-nano',       1000, 'tenant_connor_mcneely', 10, 1),
  ('route_connor_db',       'db_query',              'DB Query [Connor]',          'gpt-5.4-nano', 'wai-qwen-coder-32b', 1500, 'tenant_connor_mcneely', 10, 1),
  ('route_connor_workflow', 'workflow_orchestration', 'Workflow [Connor]',         'gpt-5.4-mini', 'gpt-5.4-nano',       2000, 'tenant_connor_mcneely', 10, 1),
  ('route_connor_ask',      'ask',                   'Quick Ask [Connor]',         'gpt-5.4-nano', 'gpt-4.1-nano',       400,  'tenant_connor_mcneely', 10, 1),
  ('route_connor_agent',    'agent',                 'Agent Mode [Connor]',        'gpt-5.4-mini', 'gpt-5.4-nano',       2000, 'tenant_connor_mcneely', 10, 1)
ON CONFLICT(id) DO UPDATE SET
  preferred_model = excluded.preferred_model,
  fallback_model  = excluded.fallback_model,
  token_budget    = excluded.token_budget,
  tenant_id       = excluded.tenant_id,
  priority        = excluded.priority,
  is_active       = 1,
  updated_at      = unixepoch();
