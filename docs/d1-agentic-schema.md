# D1 agentic schema (filtered)

Source: remote D1 `inneranimalmedia-business`, `sqlite_master`.

Filter: `sqlite_master` tables excluding `sqlite_%` and `_cf_%`, including prefixes `agent_%`, `agentsam_%`, `ai_%`, `mcp_%`, `cursor_%`, `workflow_%`, `terminal_%`, `tool_%`, `command_%`, `project_memory%`, `prompt_%`, `iam_%`, `kanban_%`, `task%`, `dev_workflow%`, `memory_%`, `execution_%`, `hook_%`, `work_session%`, `brainstorm_%`.

Total tables: **144**.

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
)
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
)
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
, r2_context_key TEXT, is_archived INTEGER DEFAULT 0, name TEXT, is_starred INTEGER DEFAULT 0, project_id TEXT)
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
)
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
, total_executions INTEGER DEFAULT 0, successful_executions INTEGER DEFAULT 0, accuracy_score REAL DEFAULT 0, last_executed_at INTEGER, is_deprecated INTEGER DEFAULT 0)
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
CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provider TEXT,
  file_url TEXT,
  created_at INTEGER NOT NULL, thinking_time_seconds INTEGER DEFAULT 0, thinking_content TEXT, message_type TEXT DEFAULT 'message', metadata_json TEXT DEFAULT '{}', token_count INTEGER DEFAULT 0, is_compaction_marker INTEGER DEFAULT 0, telemetry_id TEXT,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
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
)
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')), tenant_id TEXT, updated_at TEXT,
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
, role_id TEXT REFERENCES agent_roles(id) ON DELETE RESTRICT, user_id TEXT, device_label TEXT, created_at TEXT DEFAULT (datetime('now')), project_id TEXT DEFAULT 'inneranimalmedia')
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
, role_name TEXT, created_by TEXT, event_type TEXT, severity TEXT, model_used TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_estimate REAL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), cache_creation_input_tokens INTEGER DEFAULT 0, provider TEXT, agent_id TEXT, agent_email TEXT, cache_read_input_tokens INTEGER DEFAULT 0, is_batch INTEGER DEFAULT 0, is_us_only INTEGER DEFAULT 0, is_fast_mode INTEGER DEFAULT 0, is_long_context INTEGER DEFAULT 0, tool_choice TEXT, tool_system_prompt_tokens INTEGER DEFAULT 0, tool_overhead_input_tokens INTEGER DEFAULT 0, web_search_requests INTEGER DEFAULT 0, code_exec_seconds INTEGER DEFAULT 0, computed_cost_usd REAL DEFAULT 0, cost_breakdown_json TEXT DEFAULT '{}', total_input_tokens INTEGER DEFAULT 0, cache_hit_rate REAL DEFAULT 0.0, cache_efficiency_score REAL DEFAULT 0.0, cache_cost_savings_usd REAL DEFAULT 0.0, cache_breakpoints_used INTEGER DEFAULT 0, cache_ttl_seconds INTEGER DEFAULT 300, cache_strategy TEXT DEFAULT NULL, pricing_source TEXT DEFAULT 'direct_api', output_rate_per_mtok REAL, input_rate_per_mtok REAL, cache_read_rate_per_mtok REAL, cache_write_rate_per_mtok REAL, subscription_monthly_usd REAL, neuron_cost_usd REAL DEFAULT 0, neurons_used INTEGER DEFAULT 0, neuron_rate_per_1k REAL DEFAULT 0.011, model_size_class TEXT, workspace_id TEXT, service_name TEXT, instance_id TEXT, location TEXT, trace_id TEXT, span_id TEXT, original_input_tokens INTEGER DEFAULT 0, tokens_saved INTEGER DEFAULT 0, cost_saved_usd DECIMAL(10,6) DEFAULT 0, optimization_applied TEXT)
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
)
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
  CHECK(tool_invocation_style IN ('aggressive', 'balanced', 'conservative')), icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), sort_order INTEGER NOT NULL DEFAULT 0)
```

## agentsam_browser_trusted_origin

```sql
CREATE TABLE agentsam_browser_trusted_origin (
  user_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  cert_fingerprint_sha256 TEXT,
  trust_scope TEXT NOT NULL DEFAULT 'persistent',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, origin)
)
```

## agentsam_code_index_job

```sql
CREATE TABLE agentsam_code_index_job (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  file_count INTEGER DEFAULT 0,
  progress_percent INTEGER DEFAULT 0,
  last_sync_at TEXT,
  last_error TEXT,
  vector_backend TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, workspace_id, command)
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, workspace_id, host)
)
```

## agentsam_hook

```sql
CREATE TABLE agentsam_hook (
  id        TEXT PRIMARY KEY DEFAULT ('hook_' || lower(hex(randomblob(6)))),
  user_id   TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  trigger   TEXT NOT NULL CHECK(trigger IN ('start','stop','pre_deploy','post_deploy','pre_commit','error')),
  command   TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, workspace_id, trigger)
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
)
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
  UNIQUE (user_id, workspace_id, tool_key)
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
)
```

## agentsam_rules_revision

```sql
CREATE TABLE agentsam_rules_revision (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (document_id) REFERENCES agentsam_rules_document(id)
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
  CHECK(access_mode IN ('read_only','read_write')), default_model_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, slash_trigger TEXT, globs TEXT, always_apply INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, tags TEXT)
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
  invoked_at      TEXT NOT NULL DEFAULT (datetime('now')),
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), personality_tone TEXT DEFAULT 'professional', personality_traits TEXT, personality_rules TEXT, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), run_in_background INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, workspace_id, slug)
)
```

## agentsam_user_feature_override

```sql
CREATE TABLE agentsam_user_feature_override (
  user_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, workspace_id)
)
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
  completed_at INTEGER,
  tenant_id TEXT NOT NULL DEFAULT 'system',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_kind TEXT DEFAULT 'unknown'
    CHECK(source_kind IN ('unknown','lms','migration_seed','worker','cursor_agent','api_batch')),
  workspace_id TEXT,
  related_ids_json TEXT
)
```

Worker code logs completed asset generations (`source_kind` = `worker`) for images, R2 writes, CloudConvert exports, Meshy GLB uploads, and CF Images ingests. Migration seeds use `migration_seed` (see migrations `198` / `199`).

## ai_guardrails

```sql
CREATE TABLE "ai_guardrails" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    scope TEXT NOT NULL,
    scope_id TEXT,
    rules TEXT NOT NULL,
    validations TEXT DEFAULT '[]',
    constraints TEXT DEFAULT '{}',
    allowed_patterns TEXT DEFAULT '[]',
    blocked_patterns TEXT DEFAULT '[]',
    ai_model_config TEXT DEFAULT '{}',
    prompt_templates TEXT DEFAULT '[]',
    response_filters TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    priority INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    created_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()), enforcement_level TEXT DEFAULT 'hard', applies_to_integration TEXT, requires_confirmation INTEGER DEFAULT 0, auto_block INTEGER DEFAULT 0,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
)
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
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()), input_rate_per_mtok REAL, output_rate_per_mtok REAL, cache_write_rate_per_mtok REAL, cache_read_rate_per_mtok REAL, web_search_per_1k_usd REAL DEFAULT 0, neurons_usd_per_1k REAL DEFAULT 0, pricing_source TEXT DEFAULT 'cursor_list', show_in_picker INTEGER DEFAULT 0, secret_key_name TEXT,
  UNIQUE(provider, model_key)
)
```

## ai_pricing_rates

```sql
CREATE TABLE ai_pricing_rates (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  pricing_source TEXT NOT NULL,
  input_rate_per_mtok REAL NOT NULL,
  output_rate_per_mtok REAL NOT NULL,
  cache_write_rate_per_mtok REAL NOT NULL,
  cache_read_rate_per_mtok REAL NOT NULL,
  web_search_per_1k_usd REAL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, model_key, pricing_source)
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
, tenant_id TEXT NOT NULL DEFAULT 'system')
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

## brainstorm_sessions

```sql
CREATE TABLE brainstorm_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  session_type TEXT NOT NULL CHECK (session_type IN (
    'technical-architecture',
    'product-development', 
    'client-operations',
    'revenue-growth',
    'infrastructure'
  )),
  company_name TEXT NOT NULL,
  product_focus TEXT,
  timeline TEXT NOT NULL,
  goals TEXT,
  company_analysis TEXT NOT NULL,
  ideas_json TEXT NOT NULL,
  context_snapshot TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'implemented')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
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

## cursor_costs_daily

```sql
CREATE TABLE cursor_costs_daily (
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

## cursor_project_context

```sql
CREATE TABLE cursor_project_context (
  id TEXT PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  project_key TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  project_type TEXT CHECK (project_type IN ('feature', 'bugfix', 'refactor', 'new-page', 'integration', 'maintenance')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'blocked')),
  priority INTEGER DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
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
)
```

## cursor_subagents

```sql
CREATE TABLE cursor_subagents (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  model_used TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  cost_usd REAL DEFAULT 0
)
```

## cursor_tasks

```sql
CREATE TABLE cursor_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  instruction TEXT NOT NULL,
  context_json TEXT,
  status TEXT NOT NULL,
  files_changed_json TEXT,
  commits_json TEXT,
  cost_usd REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
, user_email TEXT, agent_type TEXT DEFAULT 'local')
```

## cursor_usage_log

```sql
CREATE TABLE cursor_usage_log (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  model TEXT NOT NULL,
  model_tier TEXT,
  tokens INTEGER NOT NULL,
  cost_type TEXT NOT NULL CHECK(cost_type IN ('included','on_demand')),
  estimated_cost_usd REAL,
  source TEXT DEFAULT 'cursor_import',
  created_at INTEGER NOT NULL
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
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  depends_on_execution_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('sequential', 'conditional', 'parallel_allowed', 'compensation')),
  condition_expression TEXT,
  compensation_execution_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_id) REFERENCES agent_command_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_execution_id) REFERENCES agent_command_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (compensation_execution_id) REFERENCES agent_command_executions(id) ON DELETE SET NULL,
  UNIQUE(execution_id, depends_on_execution_id)
)
```

## execution_performance_metrics

```sql
CREATE TABLE execution_performance_metrics (
  id TEXT PRIMARY KEY DEFAULT ('epm_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  min_duration_ms INTEGER DEFAULT 0,
  max_duration_ms INTEGER DEFAULT 0,
  median_duration_ms INTEGER DEFAULT 0,
  p95_duration_ms INTEGER DEFAULT 0,
  p99_duration_ms INTEGER DEFAULT 0,
  success_rate_percent REAL DEFAULT 0,
  total_tokens_consumed INTEGER DEFAULT 0,
  total_cost_cents REAL DEFAULT 0,
  error_types_json TEXT DEFAULT '{}',
  last_computed_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (command_id) REFERENCES agent_commands(id) ON DELETE CASCADE,
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
    'update_cicd','log_deployment','trigger_build',
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
)
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
)
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
)
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
)
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
)
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
  closed_at INTEGER,
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

## workflow_alerts

```sql
CREATE TABLE workflow_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('burnout_risk', 'cash_low', 'grant_deadline', 'opportunity_high_fit', 'task_stalled')),
    severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')) DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_required TEXT,
    action_url TEXT,
    is_acknowledged BOOLEAN DEFAULT 0,
    acknowledged_at TIMESTAMP,
    related_table TEXT,
    related_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
)
```

## workflow_artifacts

```sql
CREATE TABLE workflow_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  artifact_type TEXT NOT NULL,
  artifact_name TEXT,
  file_name TEXT,
  content TEXT,
  content_hash TEXT,
  file_size_bytes INTEGER,
  r2_bucket TEXT,
  r2_key TEXT,
  r2_url TEXT,
  mime_type TEXT,
  description TEXT,
  is_sensitive INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)
```

## workflow_checkpoints

```sql
CREATE TABLE workflow_checkpoints (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, workflow_id TEXT, session_id TEXT, agent_session_id TEXT, tenant_id TEXT, completed_by TEXT, completed_at INTEGER, metadata_json TEXT DEFAULT '{}')
```

## workflow_executions

```sql
CREATE TABLE workflow_executions (
  id TEXT PRIMARY KEY DEFAULT ('wfex_' || lower(hex(randomblob(8)))),
  workflow_id TEXT NOT NULL,
  trigger_source TEXT,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT DEFAULT 'running',
  input_data TEXT,
  output_data TEXT,
  error_message TEXT,
  started_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER
)
```

## workflow_locks

```sql
CREATE TABLE workflow_locks (
  lock_key TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  locked_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  operation TEXT,
  metadata_json TEXT DEFAULT '{}'
)
```

## workflow_runs

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY DEFAULT ('wfr_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  workflow_id TEXT,
  workflow_name TEXT NOT NULL,
  workflow_type TEXT,
  trigger_source TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_source IN (
    'manual','scheduled','webhook','agent','slash_command','api','cron'
  )),
  triggered_by TEXT DEFAULT 'sam_primeaux',
  slash_command TEXT,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending','running','success','failed',
    'cancelled','awaiting_approval','paused','timeout'
  )),
  steps_total INTEGER DEFAULT 0,
  steps_completed INTEGER DEFAULT 0,
  current_step TEXT,
  output_summary TEXT,
  error_message TEXT,
  cost_usd REAL DEFAULT 0,
  ai_tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER,
  input_data TEXT,
  metadata_json TEXT DEFAULT '{}',
  environment TEXT DEFAULT 'production' CHECK(environment IN (
    'production','sandbox','staging','development'
  )),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workflow_id) REFERENCES mcp_workflows(id) ON DELETE SET NULL
)
```

## workflow_schedule

```sql
CREATE TABLE workflow_schedule (
  id TEXT PRIMARY KEY DEFAULT ('wsch_' || lower(hex(randomblob(6)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  
  -- What to run
  workflow_id TEXT,
  workflow_name TEXT NOT NULL,
  display_name TEXT,
  
  -- Schedule
  schedule_cron TEXT NOT NULL,
  timezone TEXT DEFAULT 'America/Chicago',
  is_enabled INTEGER DEFAULT 1,
  
  -- Budget
  budget_daily_usd REAL DEFAULT 0,
  budget_monthly_usd REAL DEFAULT 0,
  
  -- Run history
  run_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_duration_ms REAL,
  total_cost_usd REAL DEFAULT 0,
  last_run_at TEXT,
  next_run_at TEXT,
  last_run_status TEXT CHECK(last_run_status IN (
    'success','failed','timeout','cancelled',NULL
  )),
  
  -- Config
  environment TEXT DEFAULT 'production' CHECK(environment IN (
    'production','sandbox','staging'
  )),
  notes TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (workflow_id) REFERENCES mcp_workflows(id) ON DELETE SET NULL
)
```

## workflow_stages

```sql
CREATE TABLE workflow_stages (
  id TEXT PRIMARY KEY DEFAULT ('wfs_' || lower(hex(randomblob(6)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  
  -- Stage identity
  stage_key TEXT NOT NULL,
  stage_number INTEGER NOT NULL,
  stage_name TEXT NOT NULL,
  stage_description TEXT,
  
  -- Context — can be global (workflow_id NULL) or workflow-specific
  workflow_id TEXT,
  workflow_type TEXT,
  
  -- Timing + deliverables
  duration_minutes INTEGER,
  deliverables_json TEXT DEFAULT '[]',
  acceptance_criteria TEXT,
  handoff_instructions TEXT,
  
  -- Status
  is_active INTEGER DEFAULT 1,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  UNIQUE(stage_key, workflow_id),
  FOREIGN KEY (workflow_id) REFERENCES mcp_workflows(id) ON DELETE CASCADE
)
```

## workflow_steps

```sql
CREATE TABLE workflow_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT DEFAULT 'execution',
  status TEXT DEFAULT 'pending',
  started_at INTEGER,
  completed_at INTEGER,
  duration_ms INTEGER,
  cost_usd REAL DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  input_data TEXT,
  output_summary TEXT,
  error_message TEXT,
  metadata TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)
```

## workflows

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY DEFAULT ('wf_' || lower(hex(randomblob(8)))),
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config TEXT,
  steps TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_run_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
)
```

