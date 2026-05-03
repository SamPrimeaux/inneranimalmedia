# D1 agentic schema (filtered)

Source: remote D1 `inneranimalmedia-business`, `sqlite_master`.

Filter: `sqlite_master` tables excluding `sqlite_%` and `_cf_%`, including prefixes `agent_%`, `agentsam_%`, `ai_%`, `mcp_%`, `cursor_%`, `workflow_%`, `terminal_%`, `tool_%`, `command_%`, `project_memory%`, `prompt_%`, `iam_%`, `kanban_%`, `task%`, `dev_workflow%`, `memory_%`, `execution_%`, `hook_%`, `work_session%`, `brainstorm_%`.

Total tables: **193**.

Each `##` section is one ingest chunk.

## agent_actions

```sql
CREATE TABLE agent_actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('sql','http','deploy','r2_sync','d1_migration','note')),
  target TEXT,
  request_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','skipped')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
)
```

## agent_ai_executable_limits

```sql
CREATE TABLE agent_ai_executable_limits (
  id TEXT PRIMARY KEY,
  agent_role_id TEXT NOT NULL,
  cost_tier TEXT NOT NULL CHECK (cost_tier IN ('free','low','standard','unlimited')),
  max_ai_calls_per_day INTEGER NOT NULL DEFAULT 50,
  max_tokens_per_request INTEGER NOT NULL DEFAULT 1000,
  max_d1_queries_per_minute INTEGER NOT NULL DEFAULT 10,
  max_r2_operations_per_day INTEGER NOT NULL DEFAULT 20,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 5,
  allowed_operations TEXT NOT NULL,
  blocked_operations TEXT NOT NULL DEFAULT '[]',
  allowed_tools TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## agent_audit_log

```sql
CREATE TABLE agent_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  actor_user_id TEXT,
  actor_role_id TEXT NOT NULL,
  run_id TEXT,
  action_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, event_severity TEXT
  GENERATED ALWAYS AS (
    CASE 
      WHEN lower(COALESCE(event_type,'')) LIKE '%error%' THEN 'error'
      WHEN lower(COALESCE(event_type,'')) LIKE '%fail%' THEN 'fail'
      WHEN lower(COALESCE(event_type,'')) LIKE '%denied%' THEN 'denied'
      ELSE NULL 
    END
  ) VIRTUAL)
```

## agent_capabilities

```sql
CREATE TABLE agent_capabilities (
  id TEXT PRIMARY KEY,
  agent_role_id TEXT NOT NULL REFERENCES agent_roles(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL,
  capability_scope TEXT NOT NULL DEFAULT 'read' CHECK (capability_scope IN ('read','write','admin')),
  allowed_account_ids TEXT,
  config_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_role_id, capability_key)
)
```

## agent_command_audit_log

```sql
CREATE TABLE agent_command_audit_log (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  user_id TEXT,
  workspace_id TEXT,
  tenant_id TEXT,
  command_key TEXT NOT NULL,
  target TEXT,
  result TEXT NOT NULL,
  result_json TEXT,
  cost REAL,
  error_text TEXT,
  request_id TEXT
)
```

## agent_command_conversations

```sql
CREATE TABLE agent_command_conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  model_used TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
```

## agent_command_executions

```sql
CREATE TABLE agent_command_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT, -- Reference to agent_sessions
  command_id TEXT, -- Reference to agent_commands
  command_name TEXT NOT NULL, -- Command name (denormalized for performance)
  command_text TEXT NOT NULL, -- Full command text executed
  parameters_json TEXT DEFAULT '{}', -- Parameters passed to command
  status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
  output_text TEXT, -- Command output text
  output_json TEXT, -- Structured output as JSON
  error_message TEXT, -- Error message if failed
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER, -- Execution duration in milliseconds
  metadata_json TEXT DEFAULT '{}' -- Additional execution metadata
  -- Note: Foreign keys commented out for now - can be enabled after all tables exist
  -- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  -- FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
  -- FOREIGN KEY (command_id) REFERENCES agent_commands(id) ON DELETE SET NULL
, exit_code INTEGER, terminal_session_id TEXT, workspace_id TEXT DEFAULT 'ws_inneranimalmedia')
```

## agent_command_integrations

```sql
CREATE TABLE agent_command_integrations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  config_json TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
```

## agent_command_proposals

```sql
CREATE TABLE agent_command_proposals (
  id TEXT PRIMARY KEY DEFAULT ('prop_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  agent_session_id TEXT,
  agent_config_id TEXT,
  proposed_by TEXT NOT NULL DEFAULT 'agent',

  -- What the agent wants to run
  command_source TEXT NOT NULL CHECK(command_source IN ('commands_table','custom','template','agent_generated')),
  commands_table_id TEXT,
  command_name TEXT NOT NULL,
  command_text TEXT NOT NULL,
  filled_template TEXT NOT NULL,
  parameters_json TEXT DEFAULT '{}',
  provider TEXT DEFAULT 'system',
  tool TEXT,
  category TEXT,

  -- Why the agent wants to run it
  rationale TEXT NOT NULL,
  expected_output TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK(risk_level IN ('low','medium','high','critical')),
  cost_tier TEXT DEFAULT 'free',
  estimated_duration_ms INTEGER,
  affects_files TEXT DEFAULT '[]',
  affects_tables TEXT DEFAULT '[]',

  -- Approval flow
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','expired','executed','failed')),
  requires_confirmation INTEGER DEFAULT 1,
  approved_by TEXT,
  approved_at INTEGER,
  denied_by TEXT,
  denied_at INTEGER,
  denial_reason TEXT,
  expires_at INTEGER DEFAULT (unixepoch() + 3600),

  -- Execution result
  terminal_session_id TEXT,
  execution_id TEXT,
  output_text TEXT,
  exit_code INTEGER,
  executed_at INTEGER,
  duration_ms INTEGER,
  error_message TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (agent_session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (terminal_session_id) REFERENCES terminal_sessions(id) ON DELETE SET NULL
)
```

## agent_commands

```sql
CREATE TABLE agent_commands (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL, -- Command name (e.g., 'list-tools', 'call-tool', 'query-database')
  slug TEXT UNIQUE, -- Command slug for API access
  description TEXT, -- Command description
  category TEXT, -- 'meta', 'execution', 'resources', 'database', 'deployment', 'workflow'
  command_text TEXT, -- Actual command text/pattern
  parameters_json TEXT DEFAULT '[]', -- Command parameters schema as JSON
  implementation_type TEXT DEFAULT 'builtin', -- 'builtin', 'workflow', 'external'
  implementation_ref TEXT, -- Reference to workflow ID or external endpoint
  code_json TEXT, -- Implementation code/config as JSON
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'deprecated'
  is_public INTEGER DEFAULT 0, -- 0 = tenant-specific, 1 = public (available to all)
  usage_count INTEGER DEFAULT 0, -- Number of times command has been used
  last_used_at INTEGER, -- Last usage timestamp
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
  -- Note: Foreign keys commented out - tenants table may not exist yet
  -- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
, use_count INTEGER DEFAULT 0, context_tags TEXT)
```

## agent_configs

```sql
CREATE TABLE agent_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  config_type TEXT NOT NULL DEFAULT 'custom', -- 'recipe', 'custom', 'template'
  recipe_prompt TEXT, -- Pre-built recipe prompt text
  config_json TEXT NOT NULL, -- Full agent configuration as JSON
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'archived'
  version INTEGER DEFAULT 1, -- Config version number
  is_public INTEGER DEFAULT 0, -- 0 = private, 1 = public (shared across tenants)
  created_by TEXT, -- User ID who created this config
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
  -- Note: Foreign keys commented out - tenants/users tables may not exist yet
  -- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  -- FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
, default_model_id TEXT)
```

## agent_conversations

```sql
CREATE TABLE agent_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, r2_context_key TEXT, is_archived INTEGER DEFAULT 0, name TEXT, is_starred INTEGER DEFAULT 0, project_id TEXT, tenant_id TEXT, workspace_id TEXT, message_count INTEGER DEFAULT 0, last_message_at INTEGER, total_cost_usd REAL DEFAULT 0, model TEXT, person_uuid TEXT)
```

## agent_cost_ledger

```sql
CREATE TABLE agent_cost_ledger (
  id TEXT PRIMARY KEY DEFAULT ('acl_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  period_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  mcp_tool_calls INTEGER DEFAULT 0,
  terminal_commands INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(workspace_id, period_date, provider, model)
)
```

## agent_costs

```sql
CREATE TABLE agent_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_used TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  task_type TEXT,
  user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## agent_execution

```sql
CREATE TABLE agent_execution (
  id TEXT PRIMARY KEY,
  agent_role_id TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  cloudflare_account_id TEXT,
  execution_type TEXT NOT NULL CHECK (execution_type IN ('deploy','r2_put','r2_get','r2_list','d1_query','d1_execute','cf_api','realtime_edit','spam_filter','cms_read','cms_write','client_onboarding','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','throttled')),
  initiated_by TEXT,
  target_resource TEXT,
  request_meta TEXT,
  response_meta TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
, ip_address TEXT)
```

## agent_execution_plans

```sql
CREATE TABLE agent_execution_plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'system',
  session_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, approved_at TEXT, approved_by TEXT, run_id TEXT, estimated_cost_usd REAL DEFAULT 0)
```

## agent_file_changes

```sql
CREATE TABLE agent_file_changes (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    language TEXT,
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    diff_content TEXT,
    before_content TEXT,
    after_content TEXT,
    created_at INTEGER NOT NULL,
    metadata_json TEXT DEFAULT '{}',
    FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE CASCADE
)
```

## agent_intent_execution_log

```sql
CREATE TABLE agent_intent_execution_log (
  id TEXT PRIMARY KEY DEFAULT ('intexec_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  intent_pattern_id INTEGER NOT NULL,
  user_input TEXT NOT NULL,
  intent_detected TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  execution_id TEXT,
  was_correct INTEGER,
  user_feedback TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (intent_pattern_id) REFERENCES agent_intent_patterns(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_id) REFERENCES agent_command_executions(id) ON DELETE SET NULL
)
```

## agent_intent_patterns

```sql
CREATE TABLE agent_intent_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  triggers_json TEXT NOT NULL,
  required_context_json TEXT,
  workflow_agent TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, total_executions INTEGER DEFAULT 0, successful_executions INTEGER DEFAULT 0, accuracy_score REAL DEFAULT 0, last_executed_at INTEGER, is_deprecated INTEGER DEFAULT 0, tools_json TEXT DEFAULT '[]')
```

## agent_memory_index

```sql
CREATE TABLE agent_memory_index (
  id TEXT PRIMARY KEY DEFAULT ('mem_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  agent_config_id TEXT NOT NULL,
  session_id TEXT,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('learned_pattern', 'user_context', 'execution_outcome', 'error_recovery', 'decision_log')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source_execution_id TEXT,
  importance_score REAL DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  decay_rate REAL DEFAULT 0.999,
  last_accessed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_config_id) REFERENCES agent_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (source_execution_id) REFERENCES agent_command_executions(id) ON DELETE SET NULL
)
```

## agent_messages

```sql
CREATE TABLE "agent_messages" (
  id TEXT PRIMARY KEY DEFAULT ('msg_' || lower(hex(randomblob(8)))),
  conversation_id TEXT NOT NULL,
  tenant_id TEXT,
  user_id TEXT,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  thinking_content TEXT,
  thinking_time_seconds INTEGER DEFAULT 0,
  message_type TEXT DEFAULT 'message',
  is_compaction_marker INTEGER DEFAULT 0,
  r2_key TEXT,
  r2_bucket TEXT DEFAULT 'iam-platform',
  telemetry_id TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## agent_mode_configs

```sql
CREATE TABLE agent_mode_configs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  color_var TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  color_hex_dark TEXT NOT NULL,
  icon TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
, system_prompt_fragment TEXT, tool_policy_json TEXT DEFAULT '{}', model_preference TEXT, temperature REAL DEFAULT 0.7, auto_run INTEGER DEFAULT 0, max_tool_calls INTEGER DEFAULT 20, context_strategy TEXT DEFAULT 'standard' CHECK(context_strategy IN ('minimal','standard','full')), metadata_json TEXT DEFAULT '{}', gate_model TEXT DEFAULT 'gpt-5.4-nano', gate_reasoning_effort TEXT DEFAULT 'none', escalation_model TEXT DEFAULT NULL, escalation_threshold REAL DEFAULT 0.8, gate_prompt TEXT DEFAULT NULL)
```

## agent_model_registry

```sql
CREATE TABLE agent_model_registry (
  id TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  display_name TEXT,
  role TEXT,
  strengths TEXT,
  best_for TEXT,
  cost_tier TEXT,
  self_description TEXT,
  written_at TEXT DEFAULT (datetime('now')),
  written_by TEXT DEFAULT 'agent_sam_test'
, context_window INTEGER, input_cost_per_1m REAL, output_cost_per_1m REAL, charge_type TEXT, supports_function_calling INTEGER DEFAULT 0, supports_vision INTEGER DEFAULT 0, supports_reasoning INTEGER DEFAULT 0, supports_batch INTEGER DEFAULT 0, pricing_notes TEXT, charge_unit TEXT, cached_input_cost_per_1m REAL, cache_read_cost_per_1m REAL, cache_write_cost_per_1m REAL, cache_write_1h_cost_per_1m REAL, batch_output_cost_per_1m REAL, input_cost_per_1m_high REAL, output_cost_per_1m_high REAL, batch_input_cost_per_1m REAL)
```

## agent_platform_context

```sql
CREATE TABLE agent_platform_context (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('deployment','config','note','secret_location')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, memory_key)
)
```

## agent_policy_templates

```sql
CREATE TABLE agent_policy_templates (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  tier TEXT CHECK(tier IN ('starter', 'professional', 'enterprise')) DEFAULT 'professional',
  tool_permissions_json TEXT DEFAULT '{}',
  rate_limits_json TEXT DEFAULT '{}',
  budgets_json TEXT DEFAULT '{}',
  model_policy_json TEXT DEFAULT '{}',
  cost_policy_json TEXT DEFAULT '{}',
  pii_policy_json TEXT DEFAULT '{}',
  memory_policy_json TEXT DEFAULT '{}',
  description TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)
```

## agent_prompt_bindings

```sql
CREATE TABLE agent_prompt_bindings (
  id TEXT PRIMARY KEY DEFAULT ('apb_' || lower(hex(randomblob(8)))),
  prompt_id TEXT NOT NULL REFERENCES agent_prompts(id) ON DELETE CASCADE,
  tenant_id TEXT,
  role_id TEXT,
  mode_key TEXT,
  provider_key TEXT,
  model_key TEXT,
  tool_key TEXT,
  mcp_server_key TEXT,
  workflow_key TEXT,
  route_path TEXT,
  binding_kind TEXT NOT NULL DEFAULT 'include'
    CHECK (binding_kind IN ('include','exclude','override','prepend','append')),
  priority INTEGER NOT NULL DEFAULT 100,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
)
```

## agent_prompt_compilations

```sql
CREATE TABLE agent_prompt_compilations (
  id TEXT PRIMARY KEY DEFAULT ('apc_' || lower(hex(randomblob(8)))),
  tenant_id TEXT,
  session_id TEXT,
  run_id TEXT,
  provider_key TEXT,
  model_key TEXT,
  role_id TEXT,
  mode_key TEXT,
  prompt_set_id TEXT,
  compiled_prompt_hash TEXT NOT NULL,
  compiled_prompt_preview TEXT,
  prompt_ids_json TEXT NOT NULL DEFAULT '[]',
  token_estimate INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## agent_prompt_provider_profiles

```sql
CREATE TABLE agent_prompt_provider_profiles (
  id TEXT PRIMARY KEY DEFAULT ('appp_' || lower(hex(randomblob(8)))),
  provider_key TEXT NOT NULL,
  model_key TEXT,
  preferred_format TEXT NOT NULL DEFAULT 'text'
    CHECK (preferred_format IN ('text','markdown','xml','json','yaml')),
  instruction_style TEXT NOT NULL DEFAULT 'direct'
    CHECK (instruction_style IN ('direct','xml','schema','few_shot','minimal')),
  max_prompt_tokens INTEGER,
  supports_json_schema INTEGER NOT NULL DEFAULT 0,
  supports_tool_choice INTEGER NOT NULL DEFAULT 1,
  supports_parallel_tools INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(provider_key, model_key)
)
```

## agent_prompt_set_items

```sql
CREATE TABLE agent_prompt_set_items (
  id TEXT PRIMARY KEY DEFAULT ('apsi_' || lower(hex(randomblob(8)))),
  prompt_set_id TEXT NOT NULL REFERENCES agent_prompt_sets(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES agent_prompts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  include_condition_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(prompt_set_id, prompt_id)
)
```

## agent_prompt_sets

```sql
CREATE TABLE agent_prompt_sets (
  id TEXT PRIMARY KEY DEFAULT ('aps_' || lower(hex(randomblob(8)))),
  tenant_id TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived','draft')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(tenant_id, slug)
)
```

## agent_prompts

```sql
CREATE TABLE agent_prompts (
  id TEXT PRIMARY KEY,
  role_id TEXT REFERENCES agent_roles(id) ON DELETE CASCADE,
  prompt_kind TEXT NOT NULL CHECK (prompt_kind IN ('system','role','checklist','rubric')),
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), tenant_id TEXT, updated_at TEXT, slug TEXT, description TEXT, scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','tenant','workspace','project','role','mode','tool','provider')), format TEXT NOT NULL DEFAULT 'text' CHECK (format IN ('text','markdown','xml','json','yaml')), priority INTEGER NOT NULL DEFAULT 100, is_default INTEGER NOT NULL DEFAULT 0, variables_json TEXT NOT NULL DEFAULT '{}', metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(role_id, prompt_kind, version)
)
```

## agent_question_templates

```sql
CREATE TABLE agent_question_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_slug TEXT NOT NULL,
  context_key TEXT NOT NULL,
  question_text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (intent_slug) REFERENCES agent_intent_patterns(intent_slug)
)
```

## agent_recipe_prompts

```sql
CREATE TABLE agent_recipe_prompts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL for public recipes
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  category TEXT, -- 'workflow', 'automation', 'analysis', 'content', 'development'
  prompt_text TEXT NOT NULL, -- Full recipe prompt text
  parameters_json TEXT DEFAULT '{}', -- Recipe parameters with defaults
  example_usage TEXT, -- Example of how to use this recipe
  tags_json TEXT DEFAULT '[]', -- Tags for discovery
  usage_count INTEGER DEFAULT 0, -- Popularity metric
  rating REAL DEFAULT 0, -- Average rating (0-5)
  is_public INTEGER DEFAULT 1, -- 1 = public (shared), 0 = private
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
  -- Note: Foreign keys commented out - tenants/users tables may not exist yet
  -- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  -- FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
, role_name TEXT NOT NULL DEFAULT 'unassigned')
```

## agent_request_queue

```sql
CREATE TABLE agent_request_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'system',
  session_id TEXT NOT NULL,
  plan_id TEXT,
  task_type TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  position INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (plan_id) REFERENCES agent_execution_plans(id)
)
```

## agent_role_bindings

```sql
CREATE TABLE agent_role_bindings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  permissions_json TEXT DEFAULT '[]',
  scope TEXT DEFAULT 'workspace',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
)
```

## agent_roles

```sql
CREATE TABLE agent_roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, agent_id TEXT, agent_type TEXT CHECK (agent_type IN ('mcp_cms','mcp_analytics','platform_admin','mcp_gateway','family_assistant')), tier TEXT DEFAULT 'platform' CHECK (tier IN ('family','client','platform')), scope TEXT DEFAULT 'single_tenant' CHECK (scope IN ('single_tenant','multi_tenant')), client_id TEXT, cloudflare_account_id TEXT, mcp_service_id TEXT, worker_id TEXT, is_active INTEGER DEFAULT 1, metadata TEXT, updated_at TEXT DEFAULT (datetime('now')), is_admin INTEGER NOT NULL DEFAULT 0, description TEXT)
```

## agent_rules

```sql
CREATE TABLE agent_rules (
  id TEXT PRIMARY KEY DEFAULT ('rule_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',

  -- Identity
  rule_key TEXT NOT NULL UNIQUE,
  rule_name TEXT,
  content TEXT NOT NULL,

  -- Classification
  source TEXT NOT NULL DEFAULT 'owner' CHECK(source IN (
    'owner',        -- Sam set it directly — highest authority
    'agent_sam',    -- Agent Sam learned/proposed it
    'cursor',       -- Cursor agent operating rule
    'incident',     -- Post-incident prevention rule
    'system',       -- Platform-level enforcement
    'client'        -- Client-specific rule
  )),
  category TEXT NOT NULL DEFAULT 'behavior' CHECK(category IN (
    'behavior',     -- How agent acts
    'deploy',       -- Deploy protocol rules
    'ui',           -- UI/UX enforcement
    'security',     -- Security constraints
    'data',         -- Data integrity rules
    'cost',         -- Cost/spend controls
    'workflow',     -- Workflow execution rules
    'incident'      -- Post-incident rules
  )),
  scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN (
    'global',       -- Applies to everything
    'agent_sam',    -- Agent Sam only
    'cursor',       -- Cursor sessions only
    'worker',       -- Worker.js context only
    'ui',           -- UI/frontend only
    'client'        -- Specific client only
  )),

  -- Priority + enforcement
  priority INTEGER DEFAULT 50,  -- 1=highest, 100=lowest
  severity TEXT DEFAULT 'warning' CHECK(severity IN (
    'hard_block',   -- Never violate, rollback if violated
    'error',        -- Should never happen, flag immediately
    'warning',      -- Should be followed, flag if not
    'guidance'      -- Best practice, informational
  )),
  requires_confirmation INTEGER DEFAULT 0,
  auto_enforce INTEGER DEFAULT 0,

  -- Context
  applies_to_workflow_id TEXT,
  applies_to_client_id TEXT,
  incident_ref TEXT,
  notes TEXT,

  -- Status
  is_active INTEGER DEFAULT 1,
  violation_count INTEGER DEFAULT 0,
  last_violated_at TEXT,
  last_enforced_at TEXT,

  created_by TEXT DEFAULT 'sam_primeaux',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## agent_runs

```sql
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  scope_mode TEXT NOT NULL DEFAULT 'tenant' CHECK (scope_mode IN ('global','tenant','multi')),
  scope_tenant_ids_json TEXT NOT NULL DEFAULT '[]',
  user_intent TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 1 CHECK (dry_run IN (0,1)),
  plan_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','completed','failed','cancelled')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
)
```

## agent_runtime_configs

```sql
CREATE TABLE agent_runtime_configs (
  id TEXT PRIMARY KEY,
  agent_role_id TEXT NOT NULL REFERENCES agent_roles(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  model_id TEXT NOT NULL DEFAULT '@cf/meta/llama-3.1-8b-instruct',
  temperature REAL NOT NULL DEFAULT 0.3 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER NOT NULL DEFAULT 1024 CHECK (max_tokens >= 64 AND max_tokens <= 8192),
  response_mode TEXT NOT NULL DEFAULT 'structured' CHECK (response_mode IN ('conversational','structured','hybrid')),
  intent_slug TEXT,
  system_prompt_override TEXT,
  config_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_role_id, config_key)
)
```

## agent_scopes

```sql
CREATE TABLE agent_scopes (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES agent_roles(id) ON DELETE CASCADE,
  tenant_id TEXT,
  can_read INTEGER NOT NULL DEFAULT 1 CHECK (can_read IN (0,1)),
  can_write INTEGER NOT NULL DEFAULT 0 CHECK (can_write IN (0,1)),
  can_deploy INTEGER NOT NULL DEFAULT 0 CHECK (can_deploy IN (0,1)),
  requires_dry_run INTEGER NOT NULL DEFAULT 1 CHECK (requires_dry_run IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(role_id, tenant_id)
)
```

## agent_sessions

```sql
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_config_id TEXT, -- Reference to agent_configs
  name TEXT, -- Session name/description
  session_type TEXT DEFAULT 'chat', -- 'chat', 'execution', 'workflow', 'browser', 'livestream'
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'failed', 'cancelled'
  state_json TEXT NOT NULL DEFAULT '{}', -- Session state as JSON
  context_json TEXT DEFAULT '{}', -- Execution context
  participants_json TEXT DEFAULT '[]', -- Participant list (users, agents, etc.)
  metadata_json TEXT DEFAULT '{}', -- Additional metadata
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
  -- Note: Foreign keys commented out - can be enabled after all tables exist
  -- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  -- FOREIGN KEY (agent_config_id) REFERENCES agent_configs(id) ON DELETE SET NULL
, role_id TEXT REFERENCES agent_roles(id) ON DELETE RESTRICT, user_id TEXT, device_label TEXT, created_at TEXT DEFAULT (datetime('now')), project_id TEXT DEFAULT 'inneranimalmedia', r2_key TEXT, person_uuid TEXT)
```

## agent_tasks

```sql
CREATE TABLE agent_tasks (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    message_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    files_affected TEXT DEFAULT '[]',
    commands_run TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    metadata_json TEXT DEFAULT '{}',
    FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
)
```

## agent_telemetry

```sql
CREATE TABLE agent_telemetry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT, -- Reference to agent_sessions
  config_id TEXT, -- Reference to agent_configs
  command_id TEXT, -- Reference to agent_commands
  metric_type TEXT NOT NULL, -- 'execution_time', 'success_rate', 'error_rate', 'usage_count'
  metric_name TEXT NOT NULL, -- Specific metric name
  metric_value REAL NOT NULL, -- Metric value
  unit TEXT, -- Unit of measurement ('ms', 'count', 'percentage', etc.)
  timestamp INTEGER NOT NULL, -- When metric was recorded
  metadata_json TEXT DEFAULT '{}' -- Additional context
  -- Note: Foreign keys commented out for now - can be enabled after all tables exist
  -- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  -- FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
  -- FOREIGN KEY (config_id) REFERENCES agent_configs(id) ON DELETE CASCADE
  -- FOREIGN KEY (command_id) REFERENCES agent_commands(id) ON DELETE CASCADE
, role_name TEXT, created_by TEXT, event_type TEXT, severity TEXT, model_used TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_estimate REAL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), cache_creation_input_tokens INTEGER DEFAULT 0, provider TEXT, agent_id TEXT, agent_email TEXT, cache_read_input_tokens INTEGER DEFAULT 0, is_batch INTEGER DEFAULT 0, is_us_only INTEGER DEFAULT 0, is_fast_mode INTEGER DEFAULT 0, is_long_context INTEGER DEFAULT 0, tool_choice TEXT, tool_system_prompt_tokens INTEGER DEFAULT 0, tool_overhead_input_tokens INTEGER DEFAULT 0, web_search_requests INTEGER DEFAULT 0, code_exec_seconds INTEGER DEFAULT 0, computed_cost_usd REAL DEFAULT 0, cost_breakdown_json TEXT DEFAULT '{}', total_input_tokens INTEGER DEFAULT 0, cache_hit_rate REAL DEFAULT 0.0, cache_efficiency_score REAL DEFAULT 0.0, cache_cost_savings_usd REAL DEFAULT 0.0, cache_breakpoints_used INTEGER DEFAULT 0, cache_ttl_seconds INTEGER DEFAULT 300, cache_strategy TEXT DEFAULT NULL, pricing_source TEXT DEFAULT 'direct_api', output_rate_per_mtok REAL, input_rate_per_mtok REAL, cache_read_rate_per_mtok REAL, cache_write_rate_per_mtok REAL, subscription_monthly_usd REAL, neuron_cost_usd REAL DEFAULT 0, neurons_used INTEGER DEFAULT 0, neuron_rate_per_1k REAL DEFAULT 0.011, model_size_class TEXT, workspace_id TEXT, service_name TEXT, instance_id TEXT, location TEXT, trace_id TEXT, span_id TEXT, original_input_tokens INTEGER DEFAULT 0, tokens_saved INTEGER DEFAULT 0, cost_saved_usd DECIMAL(10,6) DEFAULT 0, optimization_applied TEXT, person_uuid TEXT)
```

## agent_tool_chain

```sql
CREATE TABLE "agent_tool_chain" (
  id TEXT PRIMARY KEY DEFAULT ('atc_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  agent_session_id TEXT,
  agent_message_id TEXT,
  tool_name TEXT NOT NULL,
  mcp_tool_call_id TEXT,
  terminal_session_id TEXT,
  command_execution_id TEXT,
  parent_chain_id TEXT,
  depth INTEGER DEFAULT 0,
  outcome TEXT CHECK(outcome IN ('success','failure','timeout','cancelled')),
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
)
```

## agent_tools

```sql
CREATE TABLE agent_tools (
  id TEXT PRIMARY KEY,
  agent_role_id TEXT NOT NULL REFERENCES agent_roles(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_binding TEXT,
  config_json TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_role_id, tool_name)
)
```

## agent_workspace_state

```sql
CREATE TABLE agent_workspace_state (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    workspace_type TEXT NOT NULL,
    active_file TEXT,
    state_json TEXT DEFAULT '{}',
    files_open TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, locked_by TEXT, lock_expires_at INTEGER, lock_reason TEXT, agent_session_id TEXT, current_task_id TEXT, last_agent_action TEXT,
    FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
)
```

## agentsam_agent_run

```sql
CREATE TABLE agentsam_agent_run (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  trigger TEXT,
  model_id TEXT,
  idempotency_key TEXT,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, agent_ai_id TEXT DEFAULT NULL, person_uuid TEXT, agent_id TEXT)
```

## agentsam_ai

```sql
CREATE TABLE agentsam_ai (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  is_global INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  role_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  mode TEXT NOT NULL DEFAULT 'orchestrator',
  safety_level TEXT NOT NULL DEFAULT 'strict',
  tenant_scope TEXT NOT NULL DEFAULT 'multi_tenant',
  allowed_tenants_json TEXT DEFAULT '[]',
  blocked_tenants_json TEXT DEFAULT '[]',
  auth_strategy TEXT DEFAULT 'zero_trust_plus_oauth',
  required_roles_json TEXT DEFAULT '["super_admin"]',
  requires_human_approval INTEGER NOT NULL DEFAULT 1,
  approvals_policy_json TEXT DEFAULT '{}',
  integrations_json TEXT DEFAULT '{}',
  mcp_services_json TEXT DEFAULT '[]',
  tool_permissions_json TEXT DEFAULT '{}',
  rate_limits_json TEXT DEFAULT '{}',
  budgets_json TEXT DEFAULT '{}',
  model_policy_json TEXT DEFAULT '{}',
  cost_policy_json TEXT DEFAULT '{}',
  pii_policy_json TEXT DEFAULT '{}',
  security_policy_json TEXT DEFAULT '{}',
  findings_policy_json TEXT DEFAULT '{}',
  notification_policy_json TEXT DEFAULT '{}',
  telemetry_enabled INTEGER NOT NULL DEFAULT 1,
  telemetry_policy_json TEXT DEFAULT '{}',
  last_health_check INTEGER,
  last_run_at INTEGER,
  last_error TEXT,
  config_version INTEGER NOT NULL DEFAULT 1,
  config_hash TEXT,
  notes TEXT,
  user_email TEXT,
  additional_alert_emails_json TEXT DEFAULT '[]',
  owner_user_id TEXT,
  backup_user_email TEXT,
  alert_escalation_email TEXT,
  memory_policy_json TEXT DEFAULT '{}',
  total_runs INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0.0,
  avg_response_ms INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.0,
  created_by TEXT NOT NULL DEFAULT 'sam_primeaux',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, system_prompt TEXT, tool_invocation_style TEXT
  DEFAULT 'balanced'
  CHECK(tool_invocation_style IN ('aggressive', 'balanced', 'conservative')), icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), sort_order INTEGER NOT NULL DEFAULT 0, context_max_tokens INTEGER DEFAULT 1000000, output_max_tokens INTEGER DEFAULT 64000, thinking_mode TEXT DEFAULT 'adaptive', effort TEXT DEFAULT 'medium', person_uuid TEXT)
```

## agentsam_analytics

```sql
CREATE TABLE agentsam_analytics (
  id TEXT PRIMARY KEY DEFAULT ('aan_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('session','daily','weekly','monthly','alltime')),
  period_date TEXT,
  
  -- Tool intelligence
  top_tool TEXT,
  top_tool_calls INTEGER DEFAULT 0,
  most_failed_tool TEXT,
  most_failed_tool_failure_rate REAL DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  total_tool_successes INTEGER DEFAULT 0,
  total_tool_failures INTEGER DEFAULT 0,
  overall_tool_success_rate REAL DEFAULT 0,
  
  -- Model intelligence  
  top_model TEXT,
  top_model_sessions INTEGER DEFAULT 0,
  top_provider TEXT,
  total_sessions INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  avg_cost_per_session REAL DEFAULT 0,
  avg_tokens_per_session REAL DEFAULT 0,
  cache_hit_rate REAL DEFAULT 0,
  cache_savings_usd REAL DEFAULT 0,
  
  -- Tool reliability scores (0-1)
  tool_reliability_json TEXT DEFAULT '{}',
  
  -- Model breakdown
  model_breakdown_json TEXT DEFAULT '{}',
  
  -- Known broken tools
  broken_tools_json TEXT DEFAULT '[]',
  
  -- Known healthy tools
  healthy_tools_json TEXT DEFAULT '[]',
  
  -- Workflow patterns
  most_common_intent TEXT,
  avg_session_length_turns REAL DEFAULT 0,
  
  -- Meta
  computed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  data_from INTEGER,
  data_to INTEGER,
  row_count_source INTEGER DEFAULT 0,
  notes TEXT,
  
  UNIQUE(tenant_id, period, period_date)
)
```

## agentsam_approval_queue

```sql
CREATE TABLE agentsam_approval_queue (
    id TEXT PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8)))),
    tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
    user_id TEXT NOT NULL,
    session_id TEXT,
    todo_id TEXT REFERENCES agentsam_todo(id) ON DELETE CASCADE,
    workflow_run_id TEXT,
    tool_name TEXT NOT NULL,
    action_summary TEXT NOT NULL,
    risk_level TEXT DEFAULT 'medium',
    input_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
    approved_by TEXT,
    decided_at INTEGER,
    expires_at INTEGER DEFAULT (unixepoch() + 300),
    created_at INTEGER DEFAULT (unixepoch())
  )
```

## agentsam_artifacts

```sql
CREATE TABLE "agentsam_artifacts" (
  id TEXT PRIMARY KEY DEFAULT ('art_' || lower(hex(randomblob(8)))),
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,       -- required, no default
  workspace_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  artifact_type TEXT NOT NULL DEFAULT 'html',
  r2_key TEXT NOT NULL,
  public_url TEXT,
  source TEXT NOT NULL,          -- required, no default
  tags TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 0,
  file_size_bytes INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)
```

## agentsam_bootstrap

```sql
CREATE TABLE agentsam_bootstrap (
  id                           TEXT NOT NULL PRIMARY KEY,
  workspace_id                 TEXT NOT NULL,
  tenant_id                    TEXT NOT NULL,
  brand_id                     TEXT,
  user_id                      TEXT,
  session_id                   TEXT,
  email                        TEXT,
  role_slug                    TEXT,
  display_name                 TEXT,
  workspace_slug               TEXT,
  workspace_name               TEXT,
  environment                  TEXT NOT NULL DEFAULT 'production'
                                 CHECK (environment IN ('production','sandbox','staging','development')),
  deploy_env                   TEXT,
  bootstrap_version            TEXT DEFAULT '1.0.0',
  is_active                    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  capabilities_json            TEXT NOT NULL DEFAULT '{}',
  governance_roles_json        TEXT NOT NULL DEFAULT '[]',
  approval_required_json       TEXT NOT NULL DEFAULT '[]',
  allowed_execution_modes_json TEXT NOT NULL DEFAULT '["pty"]',
  default_execution_mode       TEXT NOT NULL DEFAULT 'pty',
  runtime_status_json          TEXT NOT NULL DEFAULT '{}',
  backend_health_json          TEXT NOT NULL DEFAULT '{}',
  feature_flags_json           TEXT NOT NULL DEFAULT '{}',
  ui_preferences_json          TEXT NOT NULL DEFAULT '{}',
  theme_slug                   TEXT,
  agent_session_id             TEXT,
  terminal_session_id          TEXT,
  resume_token                 TEXT,
  resume_expires_at            TEXT,
  api_base_url                 TEXT DEFAULT '/api',
  terminal_ws_path             TEXT,
  agent_api_path               TEXT,
  mcp_api_path                 TEXT,
  cloud_api_path               TEXT,
  source_of_truth              TEXT DEFAULT 'worker',
  last_bootstrapped_at         TEXT,
  last_validated_at            TEXT,
  expires_at                   TEXT,
  created_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
, person_uuid TEXT, repo_json TEXT NOT NULL DEFAULT '{}', scripts_json TEXT NOT NULL DEFAULT '[]')
```

## agentsam_browser_trusted_origin

```sql
CREATE TABLE agentsam_browser_trusted_origin (
  user_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  cert_fingerprint_sha256 TEXT,
  trust_scope TEXT NOT NULL DEFAULT 'persistent',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  PRIMARY KEY (user_id, origin)
)
```

## agentsam_cad_jobs

```sql
CREATE TABLE agentsam_cad_jobs (id TEXT PRIMARY KEY, session_id TEXT, user_id TEXT NOT NULL, engine TEXT NOT NULL, prompt TEXT, mode TEXT DEFAULT 'text', status TEXT DEFAULT 'pending', external_task_id TEXT, result_url TEXT, r2_key TEXT, error TEXT, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))
```

## agentsam_code_index_job

```sql
CREATE TABLE agentsam_code_index_job (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'idle',
  -- idle | queued | indexing | completed | failed | stale
  progress_percent INTEGER DEFAULT 0,

  -- Source config
  source_type TEXT DEFAULT 'r2',
  -- r2 | github | local
  source_path TEXT,
  -- R2 prefix or GitHub repo path
  vector_backend TEXT DEFAULT 'supabase_pgvector',
  -- supabase_pgvector | vectorize | d1_cosine

  -- File manifest — JSON array of objects:
  -- [{path, language, size_bytes, hash, status, chunk_count, symbol_count, last_indexed_at}]
  file_manifest TEXT DEFAULT '[]',

  -- Symbol summary — JSON:
  -- {total, by_type: {function: N, class: N, component: N, hook: N}, top_exports: [...]}
  symbol_summary TEXT DEFAULT '{}',

  -- Dependency graph — JSON:
  -- {edges: [{from, to, type}], orphans: [...], entry_points: [...]}
  dependency_summary TEXT DEFAULT '{}',

  -- Language breakdown — JSON: {js: N, jsx: N, ts: N, tsx: N, css: N}
  languages TEXT DEFAULT '{}',

  -- Counters
  file_count INTEGER DEFAULT 0,
  indexed_file_count INTEGER DEFAULT 0,
  failed_file_count INTEGER DEFAULT 0,
  total_size_bytes INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  symbol_count INTEGER DEFAULT 0,

  -- Trigger + timing
  triggered_by TEXT DEFAULT 'manual',
  -- manual | cron | git_push | webhook
  started_at TEXT,
  completed_at TEXT,
  last_sync_at TEXT,
  last_error TEXT,

  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,

  UNIQUE (user_id, workspace_id)
)
```

## agentsam_command_allowlist

```sql
CREATE TABLE agentsam_command_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  command TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  UNIQUE (user_id, workspace_id, command)
)
```

## agentsam_command_pattern

```sql
CREATE TABLE agentsam_command_pattern (
  id               TEXT PRIMARY KEY DEFAULT ('pat_' || lower(hex(randomblob(8)))),
  workspace_id     TEXT NOT NULL REFERENCES agentsam_workspace(id) ON DELETE CASCADE,
  pattern          TEXT NOT NULL,
  pattern_type     TEXT NOT NULL DEFAULT 'exact'
    CHECK(pattern_type IN ('exact','prefix','regex','glob')),
  mapped_command   TEXT NOT NULL,
  description      TEXT,
  category         TEXT DEFAULT 'misc'
    CHECK(category IN ('deploy','debug','db','r2','git','worker','misc')),
  risk_level       TEXT NOT NULL DEFAULT 'low'
    CHECK(risk_level IN ('none','low','medium','high','critical')),
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  use_count        INTEGER NOT NULL DEFAULT 0,
  last_used_at     INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, pattern)
)
```

## agentsam_command_run

```sql
CREATE TABLE agentsam_command_run (
  id TEXT PRIMARY KEY DEFAULT ('run_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  conversation_id TEXT,
  user_input TEXT NOT NULL,
  normalized_intent TEXT,
  intent_category TEXT
    CHECK(intent_category IN ('deploy','debug','db','r2','git','worker','search','file','misc') OR intent_category IS NULL),
  tier_used INTEGER NOT NULL DEFAULT 0,
  model_id TEXT,
  commands_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT NOT NULL DEFAULT '{}',
  output_text TEXT,
  confidence_score REAL,
  success INTEGER NOT NULL DEFAULT 0,
  exit_code INTEGER,
  duration_ms INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  error_message TEXT,
  escalated_from_run_id TEXT REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, selected_command_id TEXT, selected_command_slug TEXT, risk_level TEXT, requires_confirmation INTEGER DEFAULT 0, approval_status TEXT DEFAULT 'not_required')
```

## agentsam_commands

```sql
CREATE TABLE agentsam_commands (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  slug TEXT UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  pattern TEXT,
  pattern_type TEXT DEFAULT 'exact',
  mapped_command TEXT NOT NULL,
  command_args TEXT,
  category TEXT DEFAULT 'misc',
  subcategory TEXT,
  risk_level TEXT DEFAULT 'low',
  requires_confirmation INTEGER DEFAULT 0,
  show_in_slash INTEGER DEFAULT 1,
  show_in_allowlist INTEGER DEFAULT 1,
  show_in_palette INTEGER DEFAULT 1,
  modes_json TEXT DEFAULT '["agent","auto","debug"]',
  sort_order INTEGER DEFAULT 50,
  use_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, internal_seo TEXT DEFAULT '')
```

## agentsam_compaction_events

```sql
CREATE TABLE agentsam_compaction_events (
  id TEXT PRIMARY KEY DEFAULT ('cmp_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  session_id TEXT,
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  tokens_before INTEGER NOT NULL,
  tokens_after INTEGER NOT NULL,
  tokens_saved INTEGER GENERATED ALWAYS AS (tokens_before - tokens_after) STORED,
  cost_saved_usd REAL DEFAULT 0,
  compaction_strategy TEXT CHECK(compaction_strategy IN ('summarize','truncate','selective','full')) DEFAULT 'summarize',
  summary_text TEXT,
  compacted_at TEXT NOT NULL DEFAULT (datetime('now'))
, agent_id TEXT)
```

## agentsam_deployment_health

```sql
CREATE TABLE agentsam_deployment_health (
  id TEXT PRIMARY KEY DEFAULT ('dhc_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  deployment_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  check_type TEXT NOT NULL
    CHECK(check_type IN ('http_ping','api_response','d1_query','r2_read','benchmark','smoke_test','manual')),
  check_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','healthy','degraded','failed','timeout','skipped')),
  http_status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  metadata_json TEXT DEFAULT '{}',
  checked_by TEXT DEFAULT 'cron',
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (deployment_id) REFERENCES deployments(id)
)
```

## agentsam_escalation

```sql
CREATE TABLE agentsam_escalation (
  id TEXT PRIMARY KEY DEFAULT ('esc_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  command_run_id TEXT NOT NULL REFERENCES agentsam_command_run(id) ON DELETE CASCADE,
  from_tier INTEGER NOT NULL,
  from_model TEXT,
  to_tier INTEGER NOT NULL,
  to_model TEXT NOT NULL,
  reason TEXT NOT NULL
    CHECK(reason IN ('low_confidence','execution_failure','timeout','complexity','user_requested','recovery')),
  context_tokens INTEGER DEFAULT 0,
  success INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  agent_id TEXT
)
```

## agentsam_eval_cases

```sql
CREATE TABLE agentsam_eval_cases (
  id TEXT PRIMARY KEY DEFAULT ('evc_' || lower(hex(randomblob(8)))),
  suite_id TEXT NOT NULL REFERENCES agentsam_eval_suites(id),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  input_prompt TEXT NOT NULL,
  expected_output TEXT,
  grading_criteria TEXT,
  tags TEXT DEFAULT '[]',
  is_edge_case INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## agentsam_eval_runs

```sql
CREATE TABLE agentsam_eval_runs (
  id TEXT PRIMARY KEY DEFAULT ('evr_' || lower(hex(randomblob(8)))),
  suite_id TEXT NOT NULL REFERENCES agentsam_eval_suites(id),
  case_id TEXT REFERENCES agentsam_eval_cases(id),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  score_quality REAL,
  score_latency REAL,
  score_cost REAL,
  score_tool_use REAL,
  score_safety REAL,
  score_overall REAL,
  passed INTEGER DEFAULT 0,
  output_text TEXT,
  grader_notes TEXT,
  grader_model TEXT,
  run_at TEXT NOT NULL DEFAULT (datetime('now'))
, cached_input_tokens INTEGER DEFAULT 0, schema_valid INTEGER DEFAULT NULL, retry_count INTEGER DEFAULT 0, prompt_version_id TEXT REFERENCES agentsam_prompt_versions(id), run_group_id TEXT, tool_calls_attempted INTEGER DEFAULT 0, tool_calls_succeeded INTEGER DEFAULT 0, failure_taxonomy TEXT)
```

## agentsam_eval_suites

```sql
CREATE TABLE agentsam_eval_suites (
  id TEXT PRIMARY KEY DEFAULT ('evs_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  name TEXT NOT NULL,
  description TEXT,
  provider TEXT,
  mode TEXT CHECK(mode IN ('ask','plan','agent','debug','auto','ui_review','mcp','terminal','deploy','cost','context')) DEFAULT 'auto',
  task_type TEXT,
  is_active INTEGER DEFAULT 1,
  run_count INTEGER DEFAULT 0,
  last_run_at TEXT,
  created_by TEXT DEFAULT 'sam_primeaux',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## agentsam_execution_context

```sql
CREATE TABLE agentsam_execution_context (
  id             TEXT PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  command_run_id TEXT NOT NULL REFERENCES agentsam_command_run(id) ON DELETE CASCADE,
  cwd            TEXT,
  files_json     TEXT DEFAULT '[]',
  recent_error   TEXT,
  goal           TEXT,
  extra_json     TEXT DEFAULT '{}',
  context_tokens INTEGER DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## agentsam_executions

```sql
CREATE TABLE agentsam_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  subagent_id TEXT,
  execution_type TEXT NOT NULL,
  command TEXT,
  file_path TEXT,
  output TEXT,
  error TEXT,
  duration_ms INTEGER,
  workspace_id TEXT REFERENCES agentsam_workspace(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## agentsam_feature_flag

```sql
CREATE TABLE agentsam_feature_flag (
  flag_key TEXT PRIMARY KEY,
  description TEXT,
  enabled_globally INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## agentsam_fetch_domain_allowlist

```sql
CREATE TABLE agentsam_fetch_domain_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  UNIQUE (user_id, workspace_id, host)
)
```

## agentsam_health_daily

```sql
CREATE TABLE agentsam_health_daily (
  id TEXT PRIMARY KEY DEFAULT ('ahd_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  day TEXT NOT NULL,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  green_count INTEGER NOT NULL DEFAULT 0,
  yellow_count INTEGER NOT NULL DEFAULT 0,
  red_count INTEGER NOT NULL DEFAULT 0,
  avg_tools_degraded REAL DEFAULT 0,
  avg_rd_total REAL DEFAULT 0,
  avg_tel_cost_24h REAL DEFAULT 0,
  worst_status TEXT,
  health_notes TEXT,
  rolled_up_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, day)
)
```

## agentsam_hook

```sql
CREATE TABLE "agentsam_hook" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'system', -- 'system', 'imessage', 'resend'
  external_id TEXT DEFAULT '',            -- chatGuid or email address
  trigger TEXT NOT NULL,
  command TEXT NOT NULL DEFAULT '',       -- command or target prompt
  target_id TEXT NOT NULL DEFAULT '',    -- sessionId or conversationId
  metadata TEXT DEFAULT '{}',             -- JSON blob for context (original message id, subject, etc)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT, run_count INTEGER DEFAULT 0, last_run_at TEXT, workflow_id TEXT, subagent_slug TEXT,
  CHECK (trigger IN ('start', 'stop', 'pre_deploy', 'post_deploy', 'pre_commit', 'error', 'imessage_reply', 'email_reply'))
)
```

## agentsam_hook_execution

```sql
CREATE TABLE agentsam_hook_execution (
  id         TEXT PRIMARY KEY DEFAULT ('hexec_' || lower(hex(randomblob(6)))),
  hook_id    TEXT NOT NULL REFERENCES agentsam_hook(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  status     TEXT NOT NULL CHECK(status IN ('success','fail','timeout')),
  duration_ms INTEGER,
  output     TEXT,
  error      TEXT,
  ran_at     TEXT NOT NULL DEFAULT (datetime('now'))
, person_uuid TEXT, agent_id TEXT)
```

## agentsam_ignore_pattern

```sql
CREATE TABLE agentsam_ignore_pattern (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  workspace_id TEXT,
  pattern TEXT NOT NULL,
  is_negation INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'db',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, person_uuid TEXT)
```

## agentsam_judge_runs

```sql
CREATE TABLE agentsam_judge_runs (
  id TEXT PRIMARY KEY DEFAULT ('jr_' || lower(hex(randomblob(8)))),
  eval_run_id TEXT NOT NULL REFERENCES agentsam_eval_runs(id),
  judge_model TEXT NOT NULL,
  judge_provider TEXT NOT NULL,
  judge_prompt_version_id TEXT REFERENCES agentsam_prompt_versions(id),
  rubric TEXT NOT NULL CHECK(rubric IN (
    'correctness','cost_efficiency','latency','tool_use','hallucination',
    'instruction_following','scope_discipline','context_retention','safety','output_format'
  )),
  score INTEGER CHECK(score BETWEEN 0 AND 10),
  rationale TEXT NOT NULL,
  confidence REAL,
  cost_usd REAL DEFAULT 0,
  latency_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## agentsam_mcp_allowlist

```sql
CREATE TABLE agentsam_mcp_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  tool_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
, person_uuid TEXT)
```

## agentsam_mcp_tool_execution

```sql
CREATE TABLE agentsam_mcp_tool_execution (
  id TEXT PRIMARY KEY,
  tool_id TEXT,
  tool_name TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER,
  cost_usd REAL DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', session_id TEXT, user_id TEXT, workflow_id TEXT, input_json TEXT DEFAULT '{}', requires_approval INTEGER DEFAULT 0, retry_count INTEGER DEFAULT 0, output_json TEXT DEFAULT '{}')
```

## agentsam_mcp_tools

```sql
CREATE TABLE agentsam_mcp_tools (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT, tool_name TEXT DEFAULT '', display_name TEXT DEFAULT '', tool_category TEXT DEFAULT 'mcp', mcp_service_url TEXT DEFAULT '', description TEXT DEFAULT '', input_schema TEXT DEFAULT '{}', output_schema TEXT DEFAULT '{}', intent_tags TEXT DEFAULT '[]', intent_category_tags TEXT DEFAULT '', modes_json TEXT DEFAULT '["auto","agent","debug"]', handler_config TEXT DEFAULT '{}', categories_json TEXT DEFAULT '[]', schema_hint TEXT DEFAULT '', risk_level TEXT DEFAULT 'low', input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, trigger_config_json TEXT DEFAULT '{}', trigger_type TEXT DEFAULT 'manual', steps_json TEXT DEFAULT '[]', timeout_seconds INTEGER DEFAULT 120, requires_approval INTEGER DEFAULT 0, estimated_cost_usd REAL DEFAULT 0.0, last_used_at TEXT, updated_at TEXT, handler_type TEXT DEFAULT 'builtin', is_active INTEGER DEFAULT 1, workspace_scope TEXT DEFAULT '["ws_inneranimalmedia"]',
  UNIQUE(user_id, tool_key)
)
```

## agentsam_mcp_workflows

```sql
CREATE TABLE agentsam_mcp_workflows (
  id TEXT PRIMARY KEY,
  workflow_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  priority TEXT NOT NULL DEFAULT 'medium',
  steps_json TEXT NOT NULL DEFAULT '[]',
  tools_json TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', workspace_id TEXT DEFAULT 'ws_inneranimalmedia', trigger_type TEXT DEFAULT 'manual', trigger_config_json TEXT DEFAULT '{}', input_schema_json TEXT DEFAULT '{}', output_schema_json TEXT DEFAULT '{}', requires_approval INTEGER DEFAULT 0, risk_level TEXT DEFAULT 'low', run_count INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0, last_run_at TEXT, last_run_status TEXT, avg_duration_ms REAL DEFAULT 0, total_cost_usd REAL DEFAULT 0, version INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, subagent_slug TEXT, model_id TEXT DEFAULT 'claude-sonnet-4-5', timeout_seconds INTEGER DEFAULT 300, category TEXT DEFAULT 'general', parent_workflow_id TEXT DEFAULT NULL, tags_json TEXT DEFAULT '[]', retry_policy_json TEXT DEFAULT '{"max_retries":2,"backoff":"exponential","delay_ms":2000,"retry_on":["timeout","network_error"]}', on_failure_json TEXT DEFAULT '{"action":"notify","notify_channel":"resend"}', max_concurrent_runs INTEGER DEFAULT 1, environment TEXT DEFAULT 'production', visibility TEXT DEFAULT 'workspace', input_defaults_json TEXT DEFAULT '{}', last_error TEXT DEFAULT NULL, task_type TEXT DEFAULT 'agent_workflow')
```

## agentsam_memory

```sql
CREATE TABLE agentsam_memory (
    id TEXT PRIMARY KEY DEFAULT ('mem_' || lower(hex(randomblob(8)))),
    tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
    user_id TEXT NOT NULL,
    workspace_id TEXT DEFAULT 'ws_inneranimalmedia',
    memory_type TEXT DEFAULT 'fact' CHECK (memory_type IN ('fact','preference','project','skill','error','decision')),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT,
    confidence REAL DEFAULT 1.0,
    decay_score REAL DEFAULT 1.0,
    recall_count INTEGER DEFAULT 0,
    last_recalled_at INTEGER,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()), agent_id TEXT, session_id TEXT, tags TEXT DEFAULT '[]', embedding_id TEXT,
    UNIQUE(user_id, workspace_id, key)
  )
```

## agentsam_model_drift_signals

```sql
CREATE TABLE agentsam_model_drift_signals (
  id TEXT PRIMARY KEY DEFAULT ('mds_' || lower(hex(randomblob(8)))),
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  task_type TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES agentsam_eval_cases(id),
  baseline_score REAL NOT NULL,
  baseline_run_id TEXT REFERENCES agentsam_eval_runs(id),
  current_score REAL NOT NULL,
  current_run_id TEXT REFERENCES agentsam_eval_runs(id),
  delta REAL NOT NULL,
  delta_pct REAL NOT NULL,
  detected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  severity TEXT NOT NULL CHECK(severity IN ('info','warn','regression','breaking')),
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at INTEGER,
  notes TEXT
)
```

## agentsam_model_tier

```sql
CREATE TABLE "agentsam_model_tier" (
      id TEXT PRIMARY KEY DEFAULT ('tier_' || lower(hex(randomblob(6)))),
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      tier_level INTEGER NOT NULL CHECK(tier_level BETWEEN 0 AND 4),
      tier_name TEXT NOT NULL,
      model_id TEXT,
      api_platform TEXT,
      role_description TEXT NOT NULL,
      escalate_if_confidence_below REAL DEFAULT 0.75,
      escalate_after_failures INTEGER DEFAULT 1,
      max_context_tokens INTEGER DEFAULT 4096,
      max_output_tokens INTEGER DEFAULT 1024,
      cost_tier TEXT DEFAULT 'free' CHECK(cost_tier IN ('free','low','standard','high')),
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, tier_level)
    )
```

## agentsam_plan_tasks

```sql
CREATE TABLE agentsam_plan_tasks (
  id TEXT PRIMARY KEY DEFAULT ('task_' || lower(hex(randomblob(8)))),
  plan_id TEXT NOT NULL REFERENCES agentsam_plans(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'P1' CHECK (priority IN ('P0','P1','P2','P3')),
  category TEXT DEFAULT 'backend' CHECK (category IN ('frontend','backend','db','infra','ux','research','other')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','blocked','skipped','carried')),
  files_involved TEXT DEFAULT '[]',
  tables_involved TEXT DEFAULT '[]',
  routes_involved TEXT DEFAULT '[]',
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  blocked_reason TEXT,
  notes TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER
, agent_id TEXT, tokens_used INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, output_summary TEXT, error_trace TEXT, started_at INTEGER, depends_on TEXT DEFAULT '[]', assigned_model TEXT)
```

## agentsam_plans

```sql
CREATE TABLE agentsam_plans (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','complete','abandoned')),
  morning_brief TEXT,
  available_providers TEXT DEFAULT '["openai","google","workers_ai"]',
  blocked_providers TEXT DEFAULT '[]',
  budget_snapshot TEXT DEFAULT '{}',
  default_model TEXT DEFAULT 'gpt-5.4',
  carry_over_from TEXT,
  carry_over_count INTEGER DEFAULT 0,
  session_notes TEXT,
  eod_summary TEXT,
  tasks_total INTEGER DEFAULT 0,
  tasks_done INTEGER DEFAULT 0,
  tasks_blocked INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
, workspace_id TEXT DEFAULT 'ws_inneranimalmedia', linked_project_keys TEXT DEFAULT '[]', linked_todo_ids TEXT DEFAULT '[]', plan_type TEXT DEFAULT 'daily' CHECK (plan_type IN ('daily','sprint','incident','feature','refactor')), token_budget INTEGER DEFAULT NULL, tokens_used INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', linked_context_ids TEXT DEFAULT '[]', client_id TEXT, client_name TEXT, agent_id TEXT, session_id TEXT)
```

## agentsam_project_context

```sql
CREATE TABLE agentsam_project_context (
  id TEXT PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  project_key TEXT NOT NULL,
  project_name TEXT NOT NULL,
  project_type TEXT,
  status TEXT DEFAULT 'active',
  priority INTEGER DEFAULT 50,
  description TEXT NOT NULL,
  goals TEXT,
  constraints TEXT,
  current_blockers TEXT,
  primary_tables TEXT,
  secondary_tables TEXT,
  workers_involved TEXT,
  r2_buckets_involved TEXT,
  domains_involved TEXT,
  mcp_services_involved TEXT,
  key_files TEXT,
  related_routes TEXT,
  cursor_usage_percent REAL DEFAULT 0,
  tokens_budgeted INTEGER,
  tokens_used INTEGER DEFAULT 0,
  started_at INTEGER,
  target_completion INTEGER,
  completed_at INTEGER,
  created_by TEXT DEFAULT 'sam_primeaux',
  notes TEXT,
  last_cursor_session TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, workspace_id TEXT DEFAULT 'ws_inneranimalmedia', linked_plan_id TEXT REFERENCES agentsam_plans(id), linked_todo_ids TEXT DEFAULT '[]', cost_usd REAL NOT NULL DEFAULT 0, tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', agent_id TEXT, client_id TEXT, session_id TEXT)
```

## agentsam_prompt_cache_keys

```sql
CREATE TABLE agentsam_prompt_cache_keys (
  id TEXT PRIMARY KEY DEFAULT ('pck_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  cache_key_hash TEXT NOT NULL,
  cache_type TEXT CHECK(cache_type IN ('5m','1h','ephemeral','auto')) DEFAULT 'ephemeral',
  token_count INTEGER DEFAULT 0,
  write_cost_usd REAL DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  total_read_savings_usd REAL DEFAULT 0,
  first_written_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_at TEXT,
  expires_at TEXT,
  source_type TEXT,
  source_id TEXT
)
```

## agentsam_prompt_versions

```sql
CREATE TABLE agentsam_prompt_versions (
  id TEXT PRIMARY KEY DEFAULT ('pv_' || lower(hex(randomblob(8)))),
  prompt_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_hash TEXT NOT NULL,
  body TEXT NOT NULL,
  body_tokens INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  superseded_by TEXT REFERENCES agentsam_prompt_versions(id),
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(prompt_key, version),
  UNIQUE(prompt_hash)
)
```

## agentsam_routing_arms

```sql
CREATE TABLE agentsam_routing_arms (
  id TEXT PRIMARY KEY DEFAULT ('ra_' || lower(hex(randomblob(8)))),
  task_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  success_alpha REAL NOT NULL DEFAULT 1.0,
  success_beta REAL NOT NULL DEFAULT 1.0,
  cost_n INTEGER NOT NULL DEFAULT 0,
  cost_mean REAL NOT NULL DEFAULT 0,
  cost_m2 REAL NOT NULL DEFAULT 0,
  latency_n INTEGER NOT NULL DEFAULT 0,
  latency_mean REAL NOT NULL DEFAULT 0,
  latency_m2 REAL NOT NULL DEFAULT 0,
  decayed_score REAL NOT NULL DEFAULT 0,
  last_decay_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_eligible INTEGER NOT NULL DEFAULT 1,
  is_paused INTEGER NOT NULL DEFAULT 0,
  pause_reason TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(task_type, mode, model_key)
)
```

## agentsam_rules_document

```sql
CREATE TABLE agentsam_rules_document (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  workspace_id TEXT,
  title TEXT NOT NULL DEFAULT 'default',
  body_markdown TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, person_uuid TEXT)
```

## agentsam_script_runs

```sql
CREATE TABLE agentsam_script_runs (
  id              TEXT PRIMARY KEY DEFAULT ('sr_' || lower(hex(randomblob(8)))),
  script_id       TEXT NOT NULL REFERENCES agentsam_scripts(id),
  workspace_id    TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  triggered_by    TEXT NOT NULL DEFAULT 'agent',
  trigger_source  TEXT NOT NULL DEFAULT 'agent_sam'
    CHECK(trigger_source IN ('agent_sam','cursor','manual','github_push','scheduled','cicd')),
  cicd_run_id     TEXT,
  git_commit_sha  TEXT,
  git_branch      TEXT DEFAULT 'main',
  environment     TEXT NOT NULL DEFAULT 'production'
    CHECK(environment IN ('production','sandbox','staging','dev')),
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','passed','failed','skipped','cancelled')),
  exit_code       INTEGER,
  duration_ms     INTEGER,
  output_summary  TEXT,
  error_message   TEXT,
  cost_usd        REAL DEFAULT 0,
  started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)
```

## agentsam_scripts

```sql
CREATE TABLE agentsam_scripts (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  name            TEXT NOT NULL,
  path            TEXT NOT NULL,
  description     TEXT NOT NULL,
  purpose         TEXT NOT NULL CHECK(purpose IN ('deploy','build','test','ingest','benchmark','maintenance','dev','dangerous','audit')),
  runner          TEXT NOT NULL DEFAULT 'npm' CHECK(runner IN ('npm','bash','node','python','sql','wrangler')),
  requires_env    INTEGER NOT NULL DEFAULT 1,
  owner_only      INTEGER NOT NULL DEFAULT 1,
  safe_to_run     INTEGER NOT NULL DEFAULT 1,
  run_before      TEXT,
  run_after       TEXT,
  never_run_with  TEXT,
  preferred_for   TEXT,
  notes           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)
```

## agentsam_shadow_runs

```sql
CREATE TABLE agentsam_shadow_runs (
  id TEXT PRIMARY KEY DEFAULT ('sr_' || lower(hex(randomblob(8)))),
  primary_routing_decision_id TEXT NOT NULL REFERENCES routing_decisions(id),
  shadow_model TEXT NOT NULL,
  shadow_provider TEXT NOT NULL,
  shadow_prompt_version_id TEXT REFERENCES agentsam_prompt_versions(id),
  shadow_output TEXT,
  shadow_input_tokens INTEGER DEFAULT 0,
  shadow_output_tokens INTEGER DEFAULT 0,
  shadow_cached_input_tokens INTEGER DEFAULT 0,
  shadow_cost_usd REAL DEFAULT 0,
  shadow_latency_ms INTEGER,
  shadow_tool_calls INTEGER DEFAULT 0,
  shadow_tool_success INTEGER DEFAULT 0,
  shadow_status TEXT,
  shadow_error TEXT,
  judge_winner TEXT CHECK(judge_winner IN ('primary','shadow','tie','inconclusive')),
  judge_model TEXT,
  judge_rationale TEXT,
  judge_score_delta REAL,
  promoted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## agentsam_skill

```sql
CREATE TABLE agentsam_skill (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'user',
  workspace_id TEXT,
  content_markdown TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write'
  CHECK(access_mode IN ('read_only','read_write')), default_model_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, slash_trigger TEXT, globs TEXT, always_apply INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, tags TEXT, person_uuid TEXT)
```

## agentsam_skill_invocation

```sql
CREATE TABLE agentsam_skill_invocation (
  id              TEXT PRIMARY KEY DEFAULT ('skillinv_' || lower(hex(randomblob(8)))),
  skill_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'sam_primeaux',
  workspace_id    TEXT NOT NULL DEFAULT '',
  conversation_id TEXT,
  trigger_method  TEXT NOT NULL DEFAULT 'slash'
    CHECK(trigger_method IN ('slash','at','auto','api')),
  input_summary   TEXT,
  success         INTEGER NOT NULL DEFAULT 1,
  error_message   TEXT,
  duration_ms     INTEGER,
  model_used      TEXT,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0.0,
  invoked_at      TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT, agent_id TEXT,
  FOREIGN KEY (skill_id) REFERENCES agentsam_skill(id) ON DELETE CASCADE
)
```

## agentsam_skill_revision

```sql
CREATE TABLE agentsam_skill_revision (
  id           TEXT PRIMARY KEY DEFAULT ('skillrev_' || lower(hex(randomblob(8)))),
  skill_id     TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  version      INTEGER NOT NULL,
  changed_by   TEXT NOT NULL DEFAULT 'sam_primeaux',
  change_note  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES agentsam_skill(id) ON DELETE CASCADE
)
```

## agentsam_slash_commands

```sql
CREATE TABLE agentsam_slash_commands (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description  TEXT NOT NULL,
  usage_hint   TEXT,
  handler_type TEXT NOT NULL CHECK(handler_type IN ('builtin','db_query','subagent_spawn','tool_invoke','ollama_local')),
  handler_ref  TEXT,
  handler_sql  TEXT,
  args_schema  TEXT,
  modes_json   TEXT DEFAULT '["ask","agent","auto","debug","plan"]',
  risk_level   TEXT DEFAULT 'none' CHECK(risk_level IN ('none','low','high')),
  requires_confirmation INTEGER DEFAULT 0,
  is_active    INTEGER DEFAULT 1,
  sort_order   INTEGER DEFAULT 50,
  call_count   INTEGER DEFAULT 0,
  last_called_at TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
)
```

## agentsam_subagent_profile

```sql
CREATE TABLE agentsam_subagent_profile (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  instructions_markdown TEXT,
  allowed_tool_globs TEXT,
  default_model_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), personality_tone TEXT DEFAULT 'professional', personality_traits TEXT, personality_rules TEXT, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), run_in_background INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, agent_type TEXT DEFAULT 'custom', sandbox_mode TEXT DEFAULT 'workspace-write', model_reasoning_effort TEXT DEFAULT 'medium', nickname_candidates TEXT, can_spawn_subagents INTEGER DEFAULT 0, spawnable_agent_slugs TEXT, spawn_trigger_keywords TEXT, max_concurrent_threads INTEGER DEFAULT 6, max_spawn_depth INTEGER DEFAULT 1, job_timeout_seconds INTEGER DEFAULT 1800, mcp_servers_json TEXT, output_schema_json TEXT, is_parallelizable INTEGER DEFAULT 0, codex_compatible INTEGER DEFAULT 0, person_uuid TEXT, tenant_id TEXT,
  UNIQUE (user_id, workspace_id, slug)
)
```

## agentsam_subscription_registry

```sql
CREATE TABLE agentsam_subscription_registry (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  provider         TEXT NOT NULL,
  model_name       TEXT,
  subscription_tier TEXT,
  linked_email     TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','expired')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)
```

## agentsam_task_slos

```sql
CREATE TABLE agentsam_task_slos (
  task_type TEXT PRIMARY KEY,
  sla_p95_latency_ms INTEGER NOT NULL,
  sla_avg_cost_usd REAL NOT NULL,
  sla_min_quality REAL NOT NULL,
  sla_min_schema_valid_rate REAL,
  sla_min_tool_success_rate REAL,
  alert_threshold_pct REAL NOT NULL DEFAULT 0.10,
  notes TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## agentsam_todo

```sql
CREATE TABLE agentsam_todo (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  tags TEXT DEFAULT '[]',
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL DEFAULT 'agentsam',
  notes TEXT,
  linked_commit TEXT,
  linked_route TEXT,
  linked_table TEXT,
  sort_order INTEGER DEFAULT 50,
  -- Queue/execution system columns (no bad FK constraints)
  plan_id TEXT,
  project_key TEXT,
  task_type TEXT NOT NULL DEFAULT 'execute',
  execution_status TEXT NOT NULL DEFAULT 'queued',
  assigned_to TEXT DEFAULT 'agentsam',
  depends_on TEXT DEFAULT '[]',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  timeout_seconds INTEGER DEFAULT 300,
  context_snapshot TEXT DEFAULT '{}',
  output_summary TEXT,
  error_trace TEXT,
  token_budget INTEGER DEFAULT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  started_at TEXT
)
```

## agentsam_tool_call_log

```sql
CREATE TABLE agentsam_tool_call_log (
  id TEXT PRIMARY KEY DEFAULT ('atcl_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  session_id TEXT,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','error','timeout','blocked','completed','failed','pending','running','skipped','cancelled')),
  duration_ms INTEGER,
  error_message TEXT,
  cost_usd REAL DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, agent_id TEXT, user_id TEXT, workflow_id TEXT, tool_category TEXT DEFAULT 'mcp', input_summary TEXT, output_summary TEXT, retry_count INTEGER DEFAULT 0)
```

## agentsam_tool_chain

```sql
CREATE TABLE agentsam_tool_chain (
  id TEXT PRIMARY KEY DEFAULT ('atc_' || lower(hex(randomblob(8)))),
  plan_id TEXT REFERENCES agentsam_plans(id),
  todo_id TEXT,
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  subagent_profile_id TEXT,
  agent_session_id TEXT,
  agent_message_id TEXT,
  tool_name TEXT NOT NULL,
  tool_id TEXT REFERENCES agentsam_tools(id),
  mcp_tool_call_id TEXT,
  terminal_session_id TEXT,
  command_execution_id TEXT,
  parent_chain_id TEXT REFERENCES agentsam_tool_chain(id),
  depth INTEGER NOT NULL DEFAULT 0,
  tool_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (tool_status IN ('pending','running','completed','failed','skipped','cancelled','timeout')),
  input_json TEXT DEFAULT '{}',
  output_summary TEXT,
  result_json TEXT,
  error_message TEXT,
  error_type TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  duration_ms INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at INTEGER,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
)
```

## agentsam_tool_stats_compacted

```sql
CREATE TABLE agentsam_tool_stats_compacted (
  id TEXT PRIMARY KEY DEFAULT ('atsc_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  total_calls INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  first_seen_at INTEGER,
  last_seen_at INTEGER,
  compacted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, tool_name)
)
```

## agentsam_tools

```sql
CREATE TABLE agentsam_tools (
  id TEXT PRIMARY KEY DEFAULT ('ast_' || lower(hex(randomblob(8)))),
  tool_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  handler_type TEXT NOT NULL DEFAULT 'builtin'
    CHECK (handler_type IN ('builtin','mcp','r2','github','terminal','http','proxy','ai','d1')),
  description TEXT,
  input_schema TEXT,
  output_schema TEXT,
  linked_mcp_tool_id TEXT,
  mcp_service_url TEXT,
  handler_config TEXT DEFAULT '{}',
  intent_tags TEXT DEFAULT '[]',
  intent_category_tags TEXT,
  modes_json TEXT DEFAULT '["auto","build","chat"]',
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low','medium','high','critical')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  token_budget_per_call INTEGER DEFAULT NULL,
  max_calls_per_session INTEGER DEFAULT NULL,
  cost_per_call_usd REAL DEFAULT 0.0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_degraded INTEGER NOT NULL DEFAULT 0,
  failure_rate REAL DEFAULT 0.0,
  avg_latency_ms REAL DEFAULT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER DEFAULT NULL,
  last_health_check INTEGER DEFAULT NULL,
  sort_priority INTEGER DEFAULT 50,
  workspace_scope TEXT DEFAULT '["ws_inneranimalmedia"]',
  subagent_profile_id TEXT DEFAULT NULL,
  schema_hint TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## agentsam_usage_events

```sql
CREATE TABLE agentsam_usage_events (
  id          TEXT PRIMARY KEY DEFAULT ('ue_' || lower(hex(randomblob(8)))),
  tenant_id   TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  user_id     TEXT,
  session_id  TEXT,
  agent_name  TEXT NOT NULL DEFAULT 'agent-sam',
  provider    TEXT NOT NULL,             -- anthropic, openai, google, cloudflare_workers_ai
  model       TEXT NOT NULL,             -- resolved model key, never hardcoded
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0,   -- REAL not INTEGER — preserves sub-cent precision
  status      TEXT NOT NULL DEFAULT 'ok'
    CHECK(status IN ('ok','blocked','error','timeout')),
  tool_name   TEXT,                      -- if this event was triggered by a tool call
  reason      TEXT,                      -- block reason / error message
  ref_table   TEXT,                      -- source table: ai_usage_log, agentsam_tool_call_log
  ref_id      TEXT,                      -- FK to source row for dedup
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(ref_table, ref_id)              -- prevents duplicate ingestion
)
```

## agentsam_usage_rollups_daily

```sql
CREATE TABLE agentsam_usage_rollups_daily (
  tenant_id               TEXT NOT NULL,
  workspace_id            TEXT NOT NULL,
  day                     TEXT NOT NULL,
  ai_calls                INTEGER NOT NULL DEFAULT 0,
  tokens_in               INTEGER NOT NULL DEFAULT 0,
  tokens_out              INTEGER NOT NULL DEFAULT 0,
  cost_usd                REAL NOT NULL DEFAULT 0,
  tool_calls              INTEGER NOT NULL DEFAULT 0,
  tool_successes          INTEGER NOT NULL DEFAULT 0,
  tool_failures           INTEGER NOT NULL DEFAULT 0,
  mcp_calls               INTEGER NOT NULL DEFAULT 0,
  deployments             INTEGER NOT NULL DEFAULT 0,
  webhook_events          INTEGER NOT NULL DEFAULT 0,
  blocked_count           INTEGER NOT NULL DEFAULT 0,
  error_count             INTEGER NOT NULL DEFAULT 0,
  provider_breakdown_json TEXT DEFAULT '{}',
  top_tools_json          TEXT DEFAULT '[]',
  rollup_source           TEXT NOT NULL DEFAULT 'daily_cron',
  rolled_up_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tenant_id, workspace_id, day)
)
```

## agentsam_user_feature_override

```sql
CREATE TABLE agentsam_user_feature_override (
  user_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  PRIMARY KEY (user_id, flag_key),
  FOREIGN KEY (flag_key) REFERENCES agentsam_feature_flag(flag_key)
)
```

## agentsam_user_policy

```sql
CREATE TABLE agentsam_user_policy (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  auto_run_mode TEXT NOT NULL DEFAULT 'allowlist',
  browser_protection INTEGER NOT NULL DEFAULT 0,
  mcp_tools_protection INTEGER NOT NULL DEFAULT 1,
  file_deletion_protection INTEGER NOT NULL DEFAULT 1,
  external_file_protection INTEGER NOT NULL DEFAULT 1,
  default_agent_location TEXT DEFAULT 'pane',
  text_size TEXT DEFAULT 'default',
  auto_clear_chat INTEGER NOT NULL DEFAULT 0,
  submit_with_mod_enter INTEGER NOT NULL DEFAULT 0,
  max_tab_count INTEGER NOT NULL DEFAULT 5,
  queue_messages_mode TEXT DEFAULT 'after_current',
  usage_summary_mode TEXT DEFAULT 'auto',
  agent_autocomplete INTEGER NOT NULL DEFAULT 1,
  web_search_enabled INTEGER NOT NULL DEFAULT 1,
  auto_accept_web_search INTEGER NOT NULL DEFAULT 0,
  web_fetch_enabled INTEGER NOT NULL DEFAULT 1,
  hierarchical_ignore INTEGER NOT NULL DEFAULT 0,
  ignore_symlinks INTEGER NOT NULL DEFAULT 0,
  inline_diffs INTEGER NOT NULL DEFAULT 1,
  jump_next_diff_on_accept INTEGER NOT NULL DEFAULT 1,
  auto_format_on_agent_finish INTEGER NOT NULL DEFAULT 0,
  legacy_terminal_tool INTEGER NOT NULL DEFAULT 1,
  toolbar_on_selection INTEGER NOT NULL DEFAULT 1,
  auto_parse_links INTEGER NOT NULL DEFAULT 0,
  themed_diff_backgrounds INTEGER NOT NULL DEFAULT 1,
  terminal_hint INTEGER NOT NULL DEFAULT 1,
  terminal_preview_box INTEGER NOT NULL DEFAULT 1,
  collapse_auto_run_commands INTEGER NOT NULL DEFAULT 1,
  voice_submit_keyword TEXT DEFAULT 'submit',
  commit_attribution INTEGER NOT NULL DEFAULT 1,
  pr_attribution INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT, tenant_id TEXT DEFAULT '', superadmin_uuid TEXT,
  PRIMARY KEY (user_id, workspace_id)
)
```

## agentsam_webhook_events

```sql
CREATE TABLE agentsam_webhook_events (
  id TEXT PRIMARY KEY DEFAULT ('whe_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  payload_json TEXT,
  status TEXT CHECK(status IN ('received','processing','processed','failed','ignored')) DEFAULT 'received',
  response_id TEXT,
  model_key TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  error_message TEXT,
  processed_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## agentsam_webhook_weekly

```sql
CREATE TABLE agentsam_webhook_weekly (
  id TEXT PRIMARY KEY DEFAULT ('whw_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  provider TEXT NOT NULL,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  top_event_types TEXT DEFAULT '{}',
  top_repos TEXT DEFAULT '{}',
  notes TEXT,
  rolled_up_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, week_start, provider)
)
```

## agentsam_workflow_runs

```sql
CREATE TABLE agentsam_workflow_runs (
    id TEXT PRIMARY KEY DEFAULT ('wrun_' || lower(hex(randomblob(8)))),
    workflow_id TEXT NOT NULL REFERENCES agentsam_mcp_workflows(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
    user_id TEXT,
    session_id TEXT,
    trigger_type TEXT DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled','timeout')),
    input_json TEXT DEFAULT '{}',
    output_json TEXT DEFAULT '{}',
    steps_completed INTEGER DEFAULT 0,
    steps_total INTEGER DEFAULT 0,
    error_message TEXT,
    model_used TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    duration_ms INTEGER,
    started_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER
  , workspace_id TEXT DEFAULT 'ws_inneranimalmedia', step_results_json TEXT DEFAULT '[]', parent_run_id TEXT DEFAULT NULL, retry_of_run_id TEXT DEFAULT NULL, approval_id TEXT DEFAULT NULL, environment TEXT DEFAULT 'production', retry_count INTEGER DEFAULT 0, supabase_run_id TEXT, supabase_sync_status TEXT DEFAULT 'pending', supabase_synced_at TEXT, supabase_sync_error TEXT, supabase_sync_attempts INTEGER DEFAULT 0, workflow_key TEXT, display_name TEXT)
```

## agentsam_workspace

```sql
CREATE TABLE agentsam_workspace (
  id TEXT PRIMARY KEY,
  workspace_slug TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_inneranimalmedia',
  project_id TEXT,
  project_slug TEXT,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT,
  r2_bucket TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','archived','paused')),
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, r2_prefix TEXT, github_repo TEXT, default_model_id TEXT, primary_subagent_id TEXT, display_name TEXT)
```

## agentsam_workspace_state

```sql
CREATE TABLE agentsam_workspace_state (
  id                TEXT PRIMARY KEY DEFAULT ('wss_' || lower(hex(randomblob(8)))),
  workspace_id      TEXT NOT NULL REFERENCES agentsam_workspace(id) ON DELETE CASCADE,
  conversation_id   TEXT,
  workspace_type    TEXT NOT NULL DEFAULT 'ide',
  active_file       TEXT,
  files_open        TEXT NOT NULL DEFAULT '[]',
  state_json        TEXT NOT NULL DEFAULT '{}',
  locked_by         TEXT,
  lock_expires_at   INTEGER,
  lock_reason       TEXT,
  agent_session_id  TEXT,
  current_task_id   TEXT,
  last_agent_action TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
, agent_id TEXT)
```

## ai_api_test_runs

```sql
CREATE TABLE ai_api_test_runs (
  id TEXT NOT NULL PRIMARY KEY,
  run_group_id TEXT NOT NULL DEFAULT '',
  parent_batch_id TEXT NOT NULL DEFAULT '',
  custom_id TEXT NOT NULL DEFAULT '',
  comparison_key TEXT NOT NULL DEFAULT '',

  test_suite TEXT NOT NULL DEFAULT 'default',
  test_name TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'normal',
  provider TEXT NOT NULL DEFAULT '',
  provider_account TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',

  status TEXT NOT NULL DEFAULT 'succeeded',
  http_status INTEGER NOT NULL DEFAULT 200,
  success INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',

  request_payload_json TEXT NOT NULL DEFAULT '',
  response_payload_json TEXT NOT NULL DEFAULT '',
  response_text TEXT NOT NULL DEFAULT '',
  structured_output_json TEXT NOT NULL DEFAULT '',
  schema_name TEXT NOT NULL DEFAULT '',
  schema_valid INTEGER NOT NULL DEFAULT -1,
  stop_reason TEXT NOT NULL DEFAULT '',

  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  input_cost_usd REAL NOT NULL DEFAULT 0,
  output_cost_usd REAL NOT NULL DEFAULT 0,
  tool_cost_usd REAL NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,

  latency_ms INTEGER NOT NULL DEFAULT 0,
  time_to_first_token_ms INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  inference_geo TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  prompt_hash TEXT NOT NULL DEFAULT '',
  response_hash TEXT NOT NULL DEFAULT '',

  expected_contains TEXT NOT NULL DEFAULT '',
  expected_json_shape TEXT NOT NULL DEFAULT '',
  assertion_passed INTEGER NOT NULL DEFAULT -1,
  notes TEXT NOT NULL DEFAULT '',

  workspace_id TEXT NOT NULL DEFAULT '',
  tenant_id TEXT NOT NULL DEFAULT ''
, prompt_id TEXT NOT NULL DEFAULT '', experiment_id TEXT NOT NULL DEFAULT '')
```

## ai_approvals

```sql
CREATE TABLE ai_approvals (
  id TEXT PRIMARY KEY,
  approval_token TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  pipeline_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by TEXT,
  approved_at INTEGER,
  expires_at INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## ai_compiled_context_cache

```sql
CREATE TABLE ai_compiled_context_cache (
  id TEXT PRIMARY KEY DEFAULT ('cache_' || lower(hex(randomblob(8)))),
  context_hash TEXT NOT NULL UNIQUE,
  context_type TEXT NOT NULL,
  compiled_context TEXT NOT NULL,
  source_context_ids_json TEXT NOT NULL,
  source_knowledge_chunk_ids_json TEXT DEFAULT '[]',
  token_count INTEGER NOT NULL,
  estimated_tokens_saved INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_accessed_at INTEGER,
  access_count INTEGER DEFAULT 0,
  expires_at INTEGER,
  cache_hit_count INTEGER DEFAULT 0, tenant_id TEXT NOT NULL DEFAULT 'system',
  UNIQUE(context_hash)
)
```

## ai_context_store

```sql
CREATE TABLE ai_context_store (
  id TEXT PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  context_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT,
  confidence_score REAL DEFAULT 1.0,
  last_used_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()), current_version_id TEXT, version_count INTEGER DEFAULT 1, refresh_frequency_hours INTEGER, last_refreshed_at INTEGER, tenant_id TEXT NOT NULL DEFAULT 'system',
  UNIQUE(entity_type, entity_id, key)
)
```

## ai_context_versions

```sql
CREATE TABLE ai_context_versions (
  id TEXT PRIMARY KEY DEFAULT ('ctxv_' || lower(hex(randomblob(8)))),
  context_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  value_before TEXT,
  value_after TEXT NOT NULL,
  change_reason TEXT,
  changed_by TEXT,
  changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_active INTEGER DEFAULT 0,
  FOREIGN KEY (context_id) REFERENCES ai_context_store(id) ON DELETE CASCADE,
  UNIQUE(context_id, version_number)
)
```

## ai_costs_daily

```sql
CREATE TABLE ai_costs_daily (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,
  total_tasks INTEGER DEFAULT 0,
  total_subagents INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  model_breakdown_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## ai_generation_log

```sql
CREATE TABLE ai_generation_log (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  generation_type   TEXT NOT NULL,
  prompt            TEXT DEFAULT '',
  model             TEXT DEFAULT 'unknown',
  response_text     TEXT DEFAULT '',
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  computed_cost_usd REAL DEFAULT 0,
  status            TEXT DEFAULT 'completed',
  created_by        TEXT DEFAULT 'worker',
  context_id        TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## ai_generation_logs

```sql
CREATE TABLE ai_generation_logs (
  id TEXT PRIMARY KEY,
  course_id TEXT,
  lesson_id TEXT,
  quiz_id TEXT,
  generation_type TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  response_text TEXT,
  tokens_used INTEGER,
  cost_cents INTEGER,
  quality_score REAL,
  status TEXT DEFAULT 'pending',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
, tenant_id TEXT NOT NULL DEFAULT 'system', metadata_json TEXT NOT NULL DEFAULT '{}', source_kind TEXT DEFAULT 'unknown'
  CHECK(source_kind IN ('unknown','lms','migration_seed','worker','cursor_agent','api_batch')), workspace_id TEXT, related_ids_json TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, computed_cost_usd REAL DEFAULT 0, provider TEXT DEFAULT NULL, conversation_id TEXT DEFAULT NULL, code_language TEXT DEFAULT NULL, code_char_count INTEGER DEFAULT 0)
```

## ai_integrations

```sql
CREATE TABLE ai_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'cloudflare',
  configured_at TEXT DEFAULT (datetime('now')),
  metadata TEXT,
  active INTEGER DEFAULT 1
, integration_key TEXT, integration_type TEXT DEFAULT 'llm', supports_chat INTEGER DEFAULT 0, supports_embeddings INTEGER DEFAULT 0, supports_rag INTEGER DEFAULT 0, supports_workflows INTEGER DEFAULT 0, default_model TEXT, secret_env_name TEXT, is_system INTEGER DEFAULT 0, brand_color TEXT, brand_color_dark TEXT)
```

## ai_interactions

```sql
CREATE TABLE ai_interactions (
  id TEXT PRIMARY KEY DEFAULT ('ai_' || lower(hex(randomblob(8)))),
  session_id TEXT,
  agent_name TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  prompt TEXT,
  response TEXT,
  context_used TEXT,
  tokens_used INTEGER,
  cost REAL,
  entity_type TEXT,
  entity_id TEXT,
  client_id TEXT,
  project_id TEXT,
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch())
, tenant_id TEXT NOT NULL DEFAULT 'system')
```

## ai_knowledge_base

```sql
CREATE TABLE ai_knowledge_base (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'document', -- 'document', 'article', 'code', 'prompt', 'workflow', 'policy', 'lesson'
    category TEXT, -- 'workflow', 'api', 'design', 'database', 'deployment', 'best_practices'
    source_url TEXT,
    author TEXT,
    metadata_json TEXT DEFAULT '{}', -- JSON: {tags: [], version, language, framework, etc.}
    embedding_model TEXT, -- 'text-embedding-ada-002', 'text-embedding-3-small', etc.
    embedding_vector TEXT, -- JSON array of floats (or base64 encoded for storage)
    chunk_count INTEGER DEFAULT 0, -- Number of chunks created from this document
    token_count INTEGER DEFAULT 0, -- Approximate token count
    is_indexed INTEGER DEFAULT 0, -- 1 = indexed and ready for search
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
)
```

## ai_knowledge_chunks

```sql
CREATE TABLE ai_knowledge_chunks (
    id TEXT PRIMARY KEY,
    knowledge_id TEXT NOT NULL, -- FK to ai_knowledge_base.id
    tenant_id TEXT NOT NULL DEFAULT 'system',
    chunk_index INTEGER NOT NULL, -- Order of chunk in document (0-based)
    content TEXT NOT NULL, -- The chunk text
    content_preview TEXT, -- First 200 chars for preview
    token_count INTEGER DEFAULT 0,
    embedding_model TEXT,
    embedding_vector TEXT, -- JSON array of floats (or base64 encoded)
    metadata_json TEXT DEFAULT '{}', -- JSON: {section_title, page_number, code_block, etc.}
    is_indexed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (knowledge_id) REFERENCES ai_knowledge_base(id) ON DELETE CASCADE
)
```

## ai_model_policies

```sql
CREATE TABLE ai_model_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  default_provider TEXT NOT NULL,
  default_lane TEXT NOT NULL DEFAULT 'general',
  policy_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## ai_models

```sql
CREATE TABLE ai_models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  billing_unit TEXT NOT NULL DEFAULT 'tokens',
  context_default_tokens INTEGER DEFAULT 0,
  context_max_tokens INTEGER DEFAULT 0,
  supports_cache INTEGER DEFAULT 0,
  supports_tools INTEGER DEFAULT 1,
  supports_vision INTEGER DEFAULT 0,
  supports_web_search INTEGER DEFAULT 0,
  supports_fast_mode INTEGER DEFAULT 0,
  size_class TEXT DEFAULT 'medium',
  is_active INTEGER DEFAULT 1,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()), input_rate_per_mtok REAL, output_rate_per_mtok REAL, cache_write_rate_per_mtok REAL, cache_read_rate_per_mtok REAL, web_search_per_1k_usd REAL DEFAULT 0, neurons_usd_per_1k REAL DEFAULT 0, pricing_source TEXT DEFAULT 'cursor_list', show_in_picker INTEGER DEFAULT 0, secret_key_name TEXT, api_platform TEXT DEFAULT 'unknown', pricing_unit TEXT NOT NULL DEFAULT 'usd_per_mtok', cost_per_unit REAL, rpm_limit INTEGER DEFAULT 0, itpm_limit INTEGER DEFAULT 0, otpm_limit INTEGER DEFAULT 0, features_json TEXT DEFAULT '{}', sort_order INTEGER DEFAULT 50, input_schema_json TEXT, picker_eligible INTEGER NOT NULL DEFAULT 1, picker_group TEXT,
  UNIQUE(provider, model_key)
)
```

## ai_project_context_config

```sql
CREATE TABLE ai_project_context_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  route_pattern TEXT NOT NULL,
  context_type TEXT NOT NULL DEFAULT 'dashboard',
  context_json TEXT NOT NULL,
  model_policy_ref TEXT,
  agent_sam_config_ref TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, enabled INTEGER DEFAULT 1)
```

## ai_projects

```sql
CREATE TABLE ai_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    phase TEXT CHECK(phase IN ('plan', 'build', 'ship')) DEFAULT 'plan',
    status TEXT CHECK(status IN ('active', 'paused', 'completed', 'archived')) DEFAULT 'active',
    ai_provider TEXT CHECK(ai_provider IN ('claude', 'openai', 'gemini', 'vertex', 'workers-ai')) DEFAULT 'claude',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    metadata TEXT
)
```

## ai_prompts_library

```sql
CREATE TABLE ai_prompts_library (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL, -- 'workflow', 'design', 'api', 'database', 'qa', '3d', 'router'
    description TEXT,
    prompt_template TEXT NOT NULL, -- Template with {{variable}} placeholders
    variables_json TEXT DEFAULT '[]', -- JSON array of variable names
    tool_role TEXT, -- 'chatgpt', 'claude', 'cursor', 'gemini', 'cloudflare', 'cloudconvert', 'meshy', 'blender'
    stage INTEGER, -- 0=Intake, 1=Spec, 2=Design, 3=Build, 4=QA, 5=Ship
    company TEXT, -- NULL = universal, or specific company
    version TEXT DEFAULT '1.0',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
, tenant_id TEXT NOT NULL DEFAULT 'system', weight INTEGER NOT NULL DEFAULT 100, experiment_id TEXT NOT NULL DEFAULT '', model_hint TEXT NOT NULL DEFAULT 'claude-opus-4-6', metadata_json TEXT NOT NULL DEFAULT '{}')
```

## ai_provider_usage

```sql
CREATE TABLE ai_provider_usage (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    date TEXT NOT NULL,
    requests INTEGER DEFAULT 0,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    errors INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, date)
)
```

## ai_rag_search_history

```sql
CREATE TABLE ai_rag_search_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    query_text TEXT NOT NULL,
    query_embedding TEXT, -- JSON array or base64 encoded embedding
    prompt_id TEXT, -- If search was triggered by a prompt execution
    pipeline_id TEXT, -- If search was triggered by a pipeline execution
    retrieved_chunk_ids_json TEXT DEFAULT '[]', -- JSON array: [chunk_id1, chunk_id2, ...]
    retrieval_score_json TEXT DEFAULT '{}', -- JSON: {chunk_id: score, ...}
    context_used TEXT, -- Final context that was used in generation
    was_useful INTEGER, -- User feedback: 1 = useful, 0 = not useful, NULL = no feedback
    feedback_text TEXT,
    created_at INTEGER NOT NULL
)
```

## ai_routing_rules

```sql
CREATE TABLE ai_routing_rules (
  id TEXT PRIMARY KEY DEFAULT ('route_' || lower(hex(randomblob(6)))),
  rule_name TEXT NOT NULL,
  priority INTEGER DEFAULT 50,
  match_type TEXT NOT NULL, 
  match_value TEXT NOT NULL, 
  target_model_key TEXT NOT NULL,
  target_provider TEXT NOT NULL,
  reason TEXT, 
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
, fallback_model_key TEXT, fallback_provider TEXT)
```

## ai_search_analytics

```sql
CREATE TABLE ai_search_analytics (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  workspace_id TEXT,
  user_id TEXT,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_result_id TEXT,
  search_type TEXT DEFAULT 'unified',
  provider TEXT,
  model TEXT,
  latency_ms INTEGER,
  session_id TEXT,
  source TEXT DEFAULT 'dashboard',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## ai_services

```sql
CREATE TABLE ai_services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config_json TEXT,
  usage_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
)
```

## ai_tasks

```sql
CREATE TABLE ai_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK(status IN ('todo', 'in_progress', 'in_review', 'completed')) DEFAULT 'todo',
    priority INTEGER DEFAULT 0,
    assigned_to TEXT,
    due_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY (project_id) REFERENCES ai_projects(id) ON DELETE CASCADE
)
```

## ai_tool_roles

```sql
CREATE TABLE ai_tool_roles (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL UNIQUE, -- 'chatgpt', 'claude', 'cursor', etc.
    role_description TEXT NOT NULL,
    responsibilities_json TEXT DEFAULT '[]', -- JSON array of responsibilities
    strengths_json TEXT DEFAULT '[]', -- JSON array of strengths
    limitations_json TEXT DEFAULT '[]', -- JSON array of limitations
    preferred_stages_json TEXT DEFAULT '[]', -- JSON array of stage numbers [0,1,2,3,4,5]
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
)
```

## ai_usage_log

```sql
CREATE TABLE ai_usage_log (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  endpoint TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, account TEXT, tenant_id TEXT NOT NULL DEFAULT 'system')
```

## ai_workflow_executions

```sql
CREATE TABLE ai_workflow_executions (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL, -- FK to ai_workflow_pipelines.id
    tenant_id TEXT NOT NULL DEFAULT 'system',
    execution_number INTEGER NOT NULL, -- 1, 2, 3... (incrementing)
    status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
    input_variables_json TEXT DEFAULT '{}', -- JSON: Variables provided at start
    output_json TEXT DEFAULT '{}', -- JSON: Final output/results
    stage_results_json TEXT DEFAULT '[]', -- JSON array: [{stage_number, stage_name, started_at, completed_at, output, error}]
    error_message TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    duration_seconds INTEGER, -- calculated: completed_at - started_at
    FOREIGN KEY (pipeline_id) REFERENCES ai_workflow_pipelines(id) ON DELETE CASCADE
)
```

## ai_workflow_pipelines

```sql
CREATE TABLE ai_workflow_pipelines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'development', 'design', 'deployment', 'maintenance', 'onboarding'
    trigger_event TEXT, -- 'manual', 'scheduled', 'webhook', 'api_call'
    stages_json TEXT NOT NULL DEFAULT '[]', -- JSON array: [{stage_number, stage_name, prompt_id, tool_role, expected_duration, dependencies}]
    variables_json TEXT DEFAULT '{}', -- JSON object: {default_variables: {}, required_variables: []}
    knowledge_base_ids_json TEXT DEFAULT '[]', -- JSON array: [knowledge_id1, knowledge_id2] - related docs
    success_criteria TEXT,
    is_template INTEGER DEFAULT 1, -- 1 = template (can be cloned), 0 = instance (running/completed)
    parent_template_id TEXT, -- If instance, reference to template
    status TEXT DEFAULT 'draft', -- 'draft', 'active', 'running', 'completed', 'failed'
    execution_history_json TEXT DEFAULT '[]', -- JSON array: [{started_at, completed_at, status, output, error}]
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
)
```

## brainstorm_idea_tracking

```sql
CREATE TABLE brainstorm_idea_tracking (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  idea_index INTEGER NOT NULL,
  idea_title TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  task_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (session_id) REFERENCES brainstorm_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
)
```

## command_execution_queue

```sql
CREATE TABLE command_execution_queue (
  id TEXT PRIMARY KEY DEFAULT ('ceq_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  priority INTEGER DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  queue_status TEXT DEFAULT 'pending' CHECK (queue_status IN ('pending', 'ready', 'processing', 'completed', 'failed', 'cancelled')),
  queued_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  execution_attempt_number INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at INTEGER,
  execution_parameters_json TEXT DEFAULT '{}',
  execution_context_json TEXT DEFAULT '{}',
  depends_on_queue_id TEXT,
  error_message TEXT, commands_table_id TEXT, terminal_session_id TEXT, approved_by TEXT, approved_at INTEGER, output_text TEXT, exit_code INTEGER,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (command_id) REFERENCES agent_commands(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_queue_id) REFERENCES command_execution_queue(id) ON DELETE SET NULL
)
```

## command_executions

```sql
CREATE TABLE command_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  command_id TEXT NOT NULL,
  workflow_id TEXT,
  project_id TEXT,
  command_text TEXT NOT NULL,
  parameters_used TEXT,
  status TEXT NOT NULL,
  output TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  executed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)
```

## commands

```sql
CREATE TABLE commands (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  command_name TEXT NOT NULL,
  command_template TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  tags TEXT,
  examples TEXT,
  parameters TEXT,
  when_to_use TEXT,
  prerequisites TEXT,
  expected_output TEXT,
  common_errors TEXT,
  related_commands TEXT,
  is_favorite INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, trigger TEXT, is_slash_command INTEGER DEFAULT 0, provider TEXT DEFAULT 'system', requires_confirmation INTEGER DEFAULT 0, cost_tier TEXT DEFAULT 'free', output_type TEXT DEFAULT 'text', is_system INTEGER DEFAULT 1, input_schema TEXT, version TEXT DEFAULT '1.0')
```

## cursor_executions

```sql
CREATE TABLE cursor_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  subagent_id TEXT,
  execution_type TEXT NOT NULL,
  command TEXT,
  file_path TEXT,
  output TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## cursor_usage_log

```sql
CREATE TABLE cursor_usage_log (
  id                  TEXT PRIMARY KEY DEFAULT ('cul_' || lower(hex(randomblob(8)))),
  tenant_id           TEXT,
  user_id             TEXT,
  model               TEXT NOT NULL,
  tokens              INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd  REAL NOT NULL DEFAULT 0,
  request_type        TEXT DEFAULT 'chat'
                        CHECK (request_type IN ('chat','completion','embedding','edit','other')),
  workspace_id        TEXT,
  session_id          TEXT,
  date                TEXT NOT NULL DEFAULT (date('now')),
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## dev_workflows

```sql
CREATE TABLE dev_workflows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  steps_json TEXT NOT NULL,
  command_sequence TEXT,
  estimated_time_minutes INTEGER,
  success_rate REAL,
  quality_score INTEGER,
  is_template INTEGER DEFAULT 0,
  tags TEXT,
  created_by TEXT,
  last_used_at INTEGER,
  use_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

## execution_dependency_graph

```sql
CREATE TABLE execution_dependency_graph (
  id                        TEXT PRIMARY KEY,
  tenant_id                 TEXT NOT NULL,
  execution_id              TEXT NOT NULL,
  depends_on_execution_id   TEXT NOT NULL,
  dependency_type           TEXT NOT NULL CHECK (dependency_type IN (
                              'sequential', 'conditional', 'parallel_allowed', 'compensation'
                            )),
  condition_expression      TEXT,
  compensation_execution_id TEXT,
  created_at                INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (tenant_id)                  REFERENCES tenants(id)             ON DELETE CASCADE,
  FOREIGN KEY (execution_id)               REFERENCES agentsam_tool_chain(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_execution_id)    REFERENCES agentsam_tool_chain(id) ON DELETE CASCADE,
  FOREIGN KEY (compensation_execution_id)  REFERENCES agentsam_tool_chain(id) ON DELETE SET NULL,

  UNIQUE(execution_id, depends_on_execution_id)
)
```

## execution_performance_metrics

```sql
CREATE TABLE execution_performance_metrics (
  id                    TEXT    PRIMARY KEY DEFAULT ('epm_' || lower(hex(randomblob(8)))),
  tenant_id             TEXT    NOT NULL,
  command_id            TEXT    NOT NULL,
  metric_date           TEXT    NOT NULL,
  execution_count       INTEGER DEFAULT 0,
  success_count         INTEGER DEFAULT 0,
  failure_count         INTEGER DEFAULT 0,
  avg_duration_ms       REAL    DEFAULT 0,
  min_duration_ms       INTEGER DEFAULT 0,
  max_duration_ms       INTEGER DEFAULT 0,
  median_duration_ms    INTEGER DEFAULT 0,
  p95_duration_ms       INTEGER DEFAULT 0,
  p99_duration_ms       INTEGER DEFAULT 0,
  success_rate_percent  REAL    DEFAULT 0,
  total_tokens_consumed INTEGER DEFAULT 0,
  total_cost_cents      REAL    DEFAULT 0,
  error_types_json      TEXT    DEFAULT '{}',
  last_computed_at      INTEGER DEFAULT (unixepoch()),

  FOREIGN KEY (tenant_id)  REFERENCES tenants(id)           ON DELETE CASCADE,
  FOREIGN KEY (command_id) REFERENCES agentsam_commands(id)  ON DELETE CASCADE,

  UNIQUE(tenant_id, command_id, metric_date)
)
```

## hook_executions

```sql
CREATE TABLE hook_executions (
  id TEXT PRIMARY KEY DEFAULT ('hxe_' || lower(hex(randomblob(8)))),
  subscription_id TEXT NOT NULL,
  webhook_event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  attempt INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN (
    'running','success','failed','skipped','timeout'
  )),
  result_json TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (subscription_id) REFERENCES hook_subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_event_id) REFERENCES webhook_events(id) ON DELETE CASCADE
)
```

## hook_subscriptions

```sql
CREATE TABLE hook_subscriptions (
  id TEXT PRIMARY KEY DEFAULT ('hks_' || lower(hex(randomblob(6)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  name TEXT NOT NULL,
  endpoint_id TEXT,
  source TEXT NOT NULL,
  event_filter TEXT,
  branch_filter TEXT,
  repo_filter TEXT,
  action_type TEXT NOT NULL CHECK(action_type IN (
    'write_d1','notify_agent','call_worker',
    'update_cidi','log_deployment','trigger_build',
    'send_notification','custom_handler'
  )),
  action_config_json TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  run_order INTEGER DEFAULT 0,
  on_failure TEXT DEFAULT 'continue' CHECK(on_failure IN ('continue','halt','retry')),
  max_retries INTEGER DEFAULT 2,
  timeout_ms INTEGER DEFAULT 5000,
  last_fired_at TEXT,
  total_fired INTEGER DEFAULT 0,
  total_succeeded INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), agentsam_hook_id TEXT REFERENCES agentsam_hook(id) ON DELETE SET NULL,
  FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE SET NULL
)
```

## iam_agent_sam_config

```sql
CREATE TABLE iam_agent_sam_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    slug TEXT NOT NULL DEFAULT 'agent_sam',
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'deprecated')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## iam_agent_sam_prompts

```sql
CREATE TABLE iam_agent_sam_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, agent_id TEXT REFERENCES agent_ai_sam(id), version INTEGER NOT NULL DEFAULT 1, variant TEXT NOT NULL DEFAULT 'control', ab_weight REAL NOT NULL DEFAULT 0.5, total_runs INTEGER NOT NULL DEFAULT 0, success_runs INTEGER NOT NULL DEFAULT 0, promoted_at INTEGER)
```

## iam_deploy_log

```sql
CREATE TABLE iam_deploy_log (
  id TEXT PRIMARY KEY DEFAULT ('dlog_' || lower(hex(randomblob(8)))),
  deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT,
  commit_message TEXT,
  entry_point TEXT NOT NULL,
  config_file TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('production','sandbox')),
  status TEXT NOT NULL CHECK(status IN ('success','failed','rolled_back')),
  deployed_by TEXT NOT NULL DEFAULT 'cf_builds',
  r2_assets_synced INTEGER DEFAULT 0,
  notes TEXT
)
```

## iam_system_health

```sql
CREATE TABLE iam_system_health (
  id TEXT PRIMARY KEY DEFAULT ('health_' || lower(hex(randomblob(6)))),
  component TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('healthy','degraded','down','unknown')),
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_healthy_at TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  check_source TEXT NOT NULL DEFAULT 'auto',
  UNIQUE(component)
)
```

## iam_user_onboarding_step

```sql
CREATE TABLE iam_user_onboarding_step (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  data_json TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(tenant_id, user_id, step)
)
```

## kanban_boards

```sql
CREATE TABLE kanban_boards (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT,
    board_type TEXT DEFAULT 'project', -- 'project', 'campaign', 'workflow', etc.
    config_json TEXT DEFAULT '{}', -- JSON: columns config, colors, etc.
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, project_id TEXT)
```

## kanban_columns

```sql
CREATE TABLE kanban_columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    config_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE
)
```

## kanban_tasks

```sql
CREATE TABLE kanban_tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    board_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN ('html', 'worker', 'content', 'client', 'system', 'api', 'database', 'design')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assignee_id TEXT,
    client_name TEXT,
    project_url TEXT,
    bindings TEXT,
    due_date INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    tags TEXT,
    meta_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER,
    FOREIGN KEY (board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE,
    FOREIGN KEY (column_id) REFERENCES kanban_columns(id) ON DELETE SET NULL
)
```

## mcp_agent_sessions

```sql
CREATE TABLE mcp_agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'iam',
  status TEXT NOT NULL DEFAULT 'idle',
  current_task TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  logs_json TEXT NOT NULL DEFAULT '[]',
  active_tools_json TEXT NOT NULL DEFAULT '[]',
  cost_usd REAL NOT NULL DEFAULT 0,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, conversation_id TEXT, last_activity TEXT, tool_calls_count INTEGER NOT NULL DEFAULT 0, panel TEXT)
```

## mcp_audit_log

```sql
CREATE TABLE mcp_audit_log (
  id TEXT PRIMARY KEY DEFAULT ('mcpal_' || lower(hex(randomblob(10)))),

  -- Identity
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  session_id TEXT,
  user_id TEXT,
  user_ip TEXT,
  user_agent TEXT,

  -- MCP Call Details
  server_name TEXT NOT NULL DEFAULT 'mcp.inneranimalmedia.com/mcp',
  server_endpoint TEXT NOT NULL DEFAULT 'https://mcp.inneranimalmedia.com/mcp',
  tool_name TEXT NOT NULL,
  tool_category TEXT,

  -- Request / Response
  prompt_hash TEXT,                  -- SHA-256 of the prompt (never store raw prompt)
  request_args_json TEXT DEFAULT '{}',
  response_size_bytes INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,

  -- Outcome
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error', 'blocked', 'timeout', 'rate_limited')),
  error_code TEXT,
  error_message TEXT,

  -- Human-in-the-loop
  required_approval INTEGER NOT NULL DEFAULT 0 CHECK (required_approval IN (0,1)),
  approved_by TEXT,
  approved_at INTEGER,

  -- Cost
  tokens_used INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0.0,

  -- Timestamps (INTEGER unix epoch — standardized)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, outcome TEXT DEFAULT 'success', approval_gate_id TEXT, invoked_by TEXT, duration_ms INTEGER)
```

## mcp_command_suggestions

```sql
CREATE TABLE mcp_command_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  example_prompt TEXT NOT NULL,
  intent_slug TEXT NOT NULL,
  routed_to_agent TEXT NOT NULL,
  icon TEXT DEFAULT 'terminal',
  sort_order INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0
)
```

## mcp_entitlements

```sql
CREATE TABLE mcp_entitlements (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id   TEXT NOT NULL,
  user_email  TEXT,             -- null = all users in tenant
  service     TEXT NOT NULL DEFAULT 'mcp',
  effect      TEXT NOT NULL DEFAULT 'allow' CHECK(effect IN ('allow', 'deny')),
  expires_at  TEXT,             -- null = never expires (ISO8601)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## mcp_prompt_registry

```sql
CREATE TABLE mcp_prompt_registry (
  id TEXT PRIMARY KEY DEFAULT ('mpr_' || lower(hex(randomblob(8)))),
  prompt_id TEXT NOT NULL REFERENCES agent_prompts(id) ON DELETE CASCADE,
  mcp_name TEXT NOT NULL UNIQUE,
  mcp_description TEXT NOT NULL,
  arguments_json TEXT NOT NULL DEFAULT '[]',
  is_public INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
)
```

## mcp_prompts

```sql
CREATE TABLE mcp_prompts (
  id TEXT PRIMARY KEY DEFAULT ('mpmt_' || lower(hex(randomblob(8)))),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  prompt_text TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global'
    CHECK(scope IN ('global','workspace','mode','tool_category','client')),
  workspace_id TEXT,
  mode_slug TEXT,
  tool_category TEXT,
  client_slug TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 50,
  version INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)
```

## mcp_registered_tools

```sql
CREATE TABLE mcp_registered_tools (
  id TEXT PRIMARY KEY,
  tool_name TEXT UNIQUE NOT NULL,
  tool_category TEXT NOT NULL,
  mcp_service_url TEXT NOT NULL,
  description TEXT,
  input_schema TEXT,
  requires_approval INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  cost_per_call_usd DECIMAL(10,6),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, intent_tags TEXT DEFAULT NULL, modes_json TEXT DEFAULT '["agent","ask","plan","debug"]', is_degraded INTEGER NOT NULL DEFAULT 0, failure_rate REAL DEFAULT 0.0, avg_latency_ms REAL DEFAULT NULL, last_health_check INTEGER DEFAULT NULL, handler_type TEXT NOT NULL DEFAULT 'builtin', handler_config TEXT DEFAULT NULL, sort_priority INTEGER DEFAULT 50, categories_json TEXT DEFAULT '[]', schema_hint TEXT DEFAULT NULL, intent_category_tags TEXT DEFAULT NULL, risk_level TEXT DEFAULT 'low' CHECK(risk_level IN ('none','low','medium','high')))
```

## mcp_server_allowlist

```sql
CREATE TABLE mcp_server_allowlist (
  id TEXT PRIMARY KEY DEFAULT ('mcpsl_' || lower(hex(randomblob(10)))),

  -- Identity
  server_name TEXT NOT NULL UNIQUE,          -- Human label: 'inneranimalmedia-primary'
  server_endpoint TEXT NOT NULL UNIQUE,      -- https://mcp.inneranimalmedia.com/mcp
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',

  -- Integrity
  expected_digest TEXT,                      -- SHA-256 of the Worker script / container image
  digest_algorithm TEXT DEFAULT 'sha256',
  sigstore_attestation_url TEXT,             -- Optional: link to Sigstore bundle
  pinned_version TEXT,                       -- e.g. 'v1.4.2' or Worker deployment ID
  last_digest_verified_at INTEGER,
  digest_verified_by TEXT,                   -- user_id or 'system'

  -- Access policy
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_blocked INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0, 1)),
  block_reason TEXT,
  allowed_tools_json TEXT DEFAULT '[]',      -- Empty = all tools allowed; or ['tool_a','tool_b']
  blocked_tools_json TEXT DEFAULT '[]',
  allowed_tenant_ids_json TEXT DEFAULT '[]', -- Empty = all tenants
  requires_approval_for_writes INTEGER NOT NULL DEFAULT 1 CHECK (requires_approval_for_writes IN (0, 1)),

  -- Network
  expected_ip_cidr TEXT,                     -- Optional: lock to known IP range
  mtls_required INTEGER NOT NULL DEFAULT 0 CHECK (mtls_required IN (0, 1)),
  rate_limit_per_minute INTEGER DEFAULT 100,

  -- Health tracking
  last_health_check_at INTEGER,
  last_health_status TEXT CHECK (last_health_status IN ('healthy', 'degraded', 'unreachable', 'unknown')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,

  -- Audit
  added_by TEXT NOT NULL DEFAULT 'sam_primeaux',
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## mcp_service_credentials

```sql
CREATE TABLE mcp_service_credentials (
  id TEXT PRIMARY KEY DEFAULT ('mcpcred_' || lower(hex(randomblob(10)))),

  -- Which service this credential belongs to
  service_name TEXT NOT NULL DEFAULT 'mcp.inneranimalmedia.com/mcp',
  service_endpoint TEXT NOT NULL DEFAULT 'https://mcp.inneranimalmedia.com/mcp',
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',

  -- Credential metadata (never store raw tokens here — use Workers Secrets)
  credential_type TEXT NOT NULL DEFAULT 'token'
    CHECK (credential_type IN ('token', 'oauth', 'api_key', 'mtls_cert', 'ssh_key')),
  secret_env_name TEXT NOT NULL,  -- Name of the Workers Secret / KV key holding the actual value
  scope TEXT,                     -- e.g. 'read:d1 write:r2' — what this credential is allowed to do

  -- Rotation lifecycle (all INTEGER unix epoch)
  issued_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,             -- NULL = manual rotation only
  last_rotated_at INTEGER,
  next_rotation_due_at INTEGER,   -- Computed: issued_at + rotation_interval_days * 86400
  rotation_interval_days INTEGER NOT NULL DEFAULT 30,
  rotation_count INTEGER NOT NULL DEFAULT 0,

  -- Who rotated it
  rotated_by TEXT,                -- user_id or 'system'
  rotation_notes TEXT,

  -- Health
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'rotation_pending', 'rotation_failed')),
  last_verified_at INTEGER,
  last_used_at INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## mcp_services

```sql
CREATE TABLE mcp_services (
  id TEXT PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  service_type TEXT CHECK(service_type IN ('ssh', 'mcp-server', 'api-gateway', 'remote-storage')) DEFAULT 'mcp-server',
  endpoint_url TEXT NOT NULL,
  worker_id TEXT,
  d1_databases TEXT, 
  r2_buckets TEXT, 
  authentication_type TEXT CHECK(authentication_type IN ('token', 'oauth', 'ssh-key', 'none')) DEFAULT 'token',
  token_secret_name TEXT,
  allowed_clients TEXT, 
  rate_limit INTEGER DEFAULT 100,
  is_active INTEGER DEFAULT 1,
  monthly_requests INTEGER DEFAULT 0,
  last_accessed INTEGER,
  metadata TEXT, 
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()), client_id TEXT, app_id TEXT, cloudflare_account_id TEXT, timezone TEXT DEFAULT 'America/Chicago', service_tier TEXT DEFAULT 'family', is_public INTEGER DEFAULT 0, requires_oauth INTEGER DEFAULT 1, hyperdrive_id TEXT, agent_role_id TEXT, entity_status TEXT DEFAULT 'active', health_status TEXT, last_health_check INTEGER, metadata_schema_version INTEGER DEFAULT 1, metadata_updated_at INTEGER, cms_tenant_id TEXT, last_used TEXT,
  FOREIGN KEY (worker_id) REFERENCES worker_registry(id)
)
```

## mcp_tool_call_stats

```sql
CREATE TABLE mcp_tool_call_stats (
  id TEXT PRIMARY KEY DEFAULT ('mcps_' || lower(hex(randomblob(6)))),
  date TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_category TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  call_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, tool_name, tenant_id)
)
```

## mcp_tool_calls

```sql
CREATE TABLE mcp_tool_calls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  input_schema TEXT,
  output TEXT,
  status TEXT DEFAULT 'pending',
  approval_gate_id TEXT,
  invoked_by TEXT,
  invoked_at TEXT,
  completed_at TEXT,
  cost_usd DECIMAL(10,6),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, user_id TEXT DEFAULT NULL, workspace_id TEXT DEFAULT 'ws_inneranimalmedia', person_uuid TEXT)
```

## mcp_usage_log

```sql
CREATE TABLE mcp_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL,
  requested_at INTEGER DEFAULT (unixepoch()),
  created_at INTEGER DEFAULT (unixepoch()), tool_name TEXT, session_id TEXT, input_summary TEXT, outcome TEXT DEFAULT 'success', duration_ms INTEGER, cost_usd DECIMAL(10,6) DEFAULT 0, invoked_by TEXT, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', date TEXT, call_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0, failure_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (service_id) REFERENCES mcp_services(id)
)
```

## mcp_workflow_runs

```sql
CREATE TABLE mcp_workflow_runs (
  id TEXT PRIMARY KEY DEFAULT ('wfr_' || lower(hex(randomblob(8)))),
  workflow_id TEXT NOT NULL REFERENCES mcp_workflows(id),
  session_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled', 'awaiting_approval')),
  triggered_by TEXT,
  step_results_json TEXT DEFAULT '[]',
  error_message TEXT,
  cost_usd REAL DEFAULT 0.0,
  duration_ms INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, app_id TEXT DEFAULT 'app_inneranimalmedia', agent_id TEXT DEFAULT NULL, user_id TEXT DEFAULT NULL, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, model_primary TEXT DEFAULT NULL, input_type TEXT DEFAULT NULL, input_preview TEXT DEFAULT NULL)
```

## mcp_workflows

```sql
CREATE TABLE mcp_workflows (
  id TEXT PRIMARY KEY DEFAULT ('wf_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled', 'webhook', 'event')),
  trigger_config_json TEXT DEFAULT '{}',
  steps_json TEXT NOT NULL DEFAULT '[]',
  timeout_seconds INTEGER DEFAULT 300,
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_approval IN (0,1)),
  estimated_cost_usd REAL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'deprecated', 'archived')),
  run_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER,
  created_by TEXT DEFAULT 'sam_primeaux',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, app_id TEXT DEFAULT 'app_inneranimalmedia', agent_id TEXT DEFAULT NULL)
```

## mcp_workspace_tokens

```sql
CREATE TABLE mcp_workspace_tokens (
  id TEXT PRIMARY KEY DEFAULT ('tok_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of actual token, never store raw
  allowed_tools TEXT,               -- JSON array or null = all tools
  repo_path TEXT,                   -- local path for workspace tools
  github_repo TEXT,                 -- owner/repo for github tools
  rate_limit_per_hour INTEGER DEFAULT 100,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER                -- null = never
)
```

## memory_retrieval_index

```sql
CREATE TABLE memory_retrieval_index (
  id TEXT PRIMARY KEY DEFAULT ('mri_' || lower(hex(randomblob(8)))),
  memory_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  memory_key_searchable TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  retrieval_score REAL DEFAULT 1.0,
  last_retrieved_at INTEGER,
  retrieval_count INTEGER DEFAULT 0,
  is_cached INTEGER DEFAULT 0,
  cached_at INTEGER,
  cache_expires_at INTEGER,
  related_memory_ids_json TEXT DEFAULT '[]',
  FOREIGN KEY (memory_id) REFERENCES agent_memory_index(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
)
```

## project_memory

```sql
CREATE TABLE project_memory (
  id TEXT PRIMARY KEY DEFAULT ('pmem_' || lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('workflow', 'constraint', 'best_practice', 'error_handling', 'goal_context', 'user_preference')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  importance_score REAL DEFAULT 1.0,
  confidence_score REAL DEFAULT 0.8,
  access_count INTEGER DEFAULT 0,
  last_accessed_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(project_id, memory_type, key)
)
```

## prompt_templates

```sql
CREATE TABLE prompt_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL DEFAULT 'system' CHECK (template_type IN ('system', 'user', 'workflow', 'api', 'ai', 'custom')),
    category TEXT, -- 'conversation', 'code', 'content', 'analysis', 'translation', 'summarization', etc.
    content TEXT NOT NULL, -- The prompt template content (with {{variables}})
    variables_json TEXT DEFAULT '{}', -- JSON: {variable_name: {type, description, default}, ...}
    model_preference TEXT, -- 'gpt-4', 'claude-3', 'gemini', etc.
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER,
    is_public INTEGER DEFAULT 0, -- 1 = available to all tenants
    is_active INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    tags TEXT, -- JSON array or comma-separated
    meta_json TEXT DEFAULT '{}', -- JSON: additional metadata
    created_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(tenant_id, name)
)
```

## prompt_transformations

```sql
CREATE TABLE prompt_transformations (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  input_text TEXT NOT NULL,
  output_text TEXT,
  client_id TEXT,
  quality_score INTEGER,
  time_saved_hours INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (prompt_id) REFERENCES ai_prompts_library(id)
)
```

## prompts

```sql
CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  icon TEXT,
  steps INTEGER DEFAULT 1,
  workflow TEXT,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
)
```

## task_activity

```sql
CREATE TABLE task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL, -- 'created', 'updated', 'assigned', 'status_changed', 'commented'
  changes_json TEXT, -- JSON of what changed
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
)
```

## task_attachments

```sql
CREATE TABLE task_attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_key TEXT NOT NULL,
    -- R2 Key
    file_size INTEGER,
    content_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
)
```

## task_comments

```sql
CREATE TABLE task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
)
```

## task_velocity

```sql
CREATE TABLE task_velocity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    github_commits INTEGER DEFAULT 0,
    github_prs INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    tasks_created INTEGER DEFAULT 0,
    tasks_in_progress INTEGER DEFAULT 0,
    avg_task_age_days REAL,
    blockers_count INTEGER DEFAULT 0,
    code_reviews_given INTEGER DEFAULT 0,
    deploys_production INTEGER DEFAULT 0,
    deploys_staging INTEGER DEFAULT 0,
    bugs_fixed INTEGER DEFAULT 0,
    features_shipped INTEGER DEFAULT 0,
    velocity_score INTEGER CHECK(velocity_score BETWEEN 0 AND 100),
    momentum TEXT CHECK(momentum IN ('accelerating', 'steady', 'slowing', 'stalled')) DEFAULT 'steady',
    sprint_goal TEXT,
    sprint_progress_percent INTEGER CHECK(sprint_progress_percent BETWEEN 0 AND 100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## tasks

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    task_type TEXT DEFAULT 'general' CHECK (task_type IN ('general', 'project', 'maintenance', 'support', 'bug', 'feature', 'content', 'marketing')),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'blocked', 'done', 'cancelled')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'critical')),
    assignee_id TEXT,
    assignee_email TEXT, -- For external assignees
    reporter_id TEXT,
    due_date INTEGER,
    start_date INTEGER,
    completed_date INTEGER,
    estimated_hours REAL,
    actual_hours REAL,
    progress_percent INTEGER DEFAULT 0,
    tags TEXT, -- JSON array or comma-separated
    category TEXT,
    project_id TEXT,
    parent_task_id TEXT, -- For subtasks
    related_entity_type TEXT, -- 'campaign', 'grant', 'project', etc.
    related_entity_id TEXT,
    attachments_json TEXT DEFAULT '[]', -- JSON array of attachment URLs/keys
    comments_count INTEGER DEFAULT 0,
    watchers_json TEXT DEFAULT '[]', -- JSON array of user IDs watching this task
    meta_json TEXT DEFAULT '{}',
    created_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## terminal_connections

```sql
CREATE TABLE terminal_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'pty',
  ws_url TEXT NOT NULL,
  auth_token_secret_name TEXT,
  host TEXT,
  username TEXT,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  last_connected_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
, connection_type TEXT DEFAULT 'pty_tunnel', ollama_url TEXT, mesh_ip TEXT, user_id TEXT, tenant_id TEXT, bridge_key_hash TEXT)
```

## terminal_history

```sql
CREATE TABLE terminal_history (
  id TEXT PRIMARY KEY DEFAULT ('th_' || lower(hex(randomblob(8)))),
  terminal_session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('input','output','system')),
  content TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER,
  triggered_by TEXT CHECK(triggered_by IN ('user','agent','system')),
  agent_session_id TEXT,
  command_execution_id TEXT,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (terminal_session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
)
```

## terminal_sessions

```sql
CREATE TABLE terminal_sessions (
  id TEXT PRIMARY KEY DEFAULT ('term_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  agent_session_id TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','idle','closed','error')),
  shell TEXT NOT NULL DEFAULT '/bin/zsh',
  cwd TEXT DEFAULT '/',
  tunnel_url TEXT,
  auth_token_hash TEXT NOT NULL,
  cols INTEGER DEFAULT 220,
  rows INTEGER DEFAULT 50,
  last_input_at INTEGER,
  last_output_at INTEGER,
  last_command TEXT,
  last_exit_code INTEGER,
  bytes_sent INTEGER DEFAULT 0,
  bytes_received INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  closed_at INTEGER, workspace_id TEXT DEFAULT 'ws_inneranimalmedia', person_uuid TEXT,
  FOREIGN KEY (agent_session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL
)
```

## tool_access

```sql
CREATE TABLE tool_access (id TEXT PRIMARY KEY, tool_id TEXT NOT NULL, tenant_id TEXT NOT NULL, user_id TEXT, can_view INTEGER DEFAULT 1, can_use INTEGER DEFAULT 1, can_configure INTEGER DEFAULT 0, custom_config TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)
```

## tool_capabilities

```sql
CREATE TABLE tool_capabilities (
  id TEXT PRIMARY KEY DEFAULT ('cap_' || lower(hex(randomblob(8)))),
  capability_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  requires_authentication INTEGER DEFAULT 0,
  requires_api_key INTEGER DEFAULT 0,
  rate_limit_calls_per_minute INTEGER,
  average_execution_time_ms INTEGER,
  cost_per_call_cents REAL DEFAULT 0,
  tags_json TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(capability_slug)
)
```

## tool_capability_mapping

```sql
CREATE TABLE tool_capability_mapping (
  id TEXT PRIMARY KEY DEFAULT ('tcm_' || lower(hex(randomblob(8)))),
  command_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (command_id) REFERENCES agent_commands(id) ON DELETE CASCADE,
  FOREIGN KEY (capability_id) REFERENCES tool_capabilities(id) ON DELETE CASCADE,
  UNIQUE(command_id, capability_id)
)
```

## tool_invocations

```sql
CREATE TABLE tool_invocations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  tool_name TEXT NOT NULL,
  tool_provider TEXT,
  input_params TEXT,
  output_result TEXT,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  duration_ms INTEGER,
  cost_usd REAL DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  http_status INTEGER,
  invoked_at INTEGER DEFAULT (unixepoch()),
  created_at INTEGER DEFAULT (unixepoch())
)
```

## tools

```sql
CREATE TABLE tools (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT,
  icon TEXT,
  description TEXT,
  config TEXT,
  is_enabled INTEGER DEFAULT 1,
  is_public INTEGER DEFAULT 0,
  version TEXT DEFAULT '1.0.0',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, domain_id TEXT, worker_id TEXT, auth_required INTEGER DEFAULT 1, auth_type TEXT DEFAULT 'oauth', access_level TEXT DEFAULT 'oauth_protected')
```

## work_sessions

```sql
CREATE TABLE work_sessions (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  started_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  total_active_seconds INTEGER DEFAULT 0,
  project_context TEXT,
  page_context TEXT,
  work_signals TEXT,
  auto_paused INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

