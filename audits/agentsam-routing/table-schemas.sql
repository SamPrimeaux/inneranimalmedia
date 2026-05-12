

-- agentsam_ai
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
  CHECK(tool_invocation_style IN ('aggressive', 'balanced', 'conservative')), icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), sort_order INTEGER NOT NULL DEFAULT 0, context_max_tokens INTEGER DEFAULT 1000000, output_max_tokens INTEGER DEFAULT 64000, thinking_mode TEXT DEFAULT 'adaptive', effort TEXT DEFAULT 'medium', person_uuid TEXT, provider       TEXT, model_key      TEXT, api_platform   TEXT DEFAULT 'unknown', secret_key_name TEXT, size_class     TEXT DEFAULT 'medium', billing_unit   TEXT DEFAULT 'tokens', supports_cache      INTEGER DEFAULT 0, supports_tools      INTEGER DEFAULT 1, supports_vision     INTEGER DEFAULT 0, supports_web_search INTEGER DEFAULT 0, supports_fast_mode  INTEGER DEFAULT 0, context_default_tokens INTEGER DEFAULT 0, pricing_unit            TEXT DEFAULT 'usd_per_mtok', pricing_source          TEXT DEFAULT 'manual', input_rate_per_mtok     REAL, output_rate_per_mtok    REAL, cache_write_rate_per_mtok REAL, cache_read_rate_per_mtok  REAL, web_search_per_1k_usd   REAL DEFAULT 0, neurons_usd_per_1k      REAL DEFAULT 0, cost_per_unit           REAL, rpm_limit  INTEGER DEFAULT 0, itpm_limit INTEGER DEFAULT 0, otpm_limit INTEGER DEFAULT 0, show_in_picker  INTEGER DEFAULT 0, picker_eligible INTEGER DEFAULT 1, picker_group    TEXT, features_json    TEXT DEFAULT '{}', input_schema_json TEXT, supports_responses_api INTEGER DEFAULT 0, supports_parallel_tools INTEGER DEFAULT 1, supports_structured_output INTEGER DEFAULT 0, supports_prompt_cache INTEGER DEFAULT 0, supports_thinking INTEGER DEFAULT 0, requires_phase_param INTEGER DEFAULT 0, max_tool_calls_per_turn INTEGER DEFAULT 10, display_name TEXT);


-- agentsam_approval_queue
CREATE TABLE "agentsam_approval_queue" (
  id              TEXT    PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8)))),
  tenant_id       TEXT    NOT NULL,
  workspace_id    TEXT,
  user_id         TEXT    NOT NULL,
  session_id      TEXT,

  -- Chain linkage — all three locked with FKs
  plan_id         TEXT    REFERENCES "agentsam_plans_old"(id)          ON DELETE SET NULL,
  todo_id         TEXT    REFERENCES agentsam_todo(id)            ON DELETE CASCADE,
  workflow_run_id TEXT    REFERENCES agentsam_workflow_runs(id)   ON DELETE SET NULL,
  command_run_id  TEXT    REFERENCES agentsam_command_run(id)     ON DELETE SET NULL,

  -- What needs approval
  tool_name       TEXT    NOT NULL,
  tool_id         TEXT,
  tool_key        TEXT,
  action_summary  TEXT    NOT NULL,
  input_json      TEXT    DEFAULT '{}',
  risk_level      TEXT    DEFAULT 'medium',
  approval_type   TEXT    DEFAULT 'tool',

  -- Resolution
  status          TEXT    DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','denied','expired')),
  approved_by     TEXT,
  decided_at      INTEGER,
  expires_at      INTEGER DEFAULT (unixepoch() + 300),

  -- Meta
  person_uuid     TEXT,
  created_at      INTEGER DEFAULT (unixepoch())
, execution_step_id TEXT REFERENCES agentsam_execution_steps(id) ON DELETE SET NULL);


-- agentsam_execution_performance_metrics
CREATE TABLE agentsam_execution_performance_metrics (
  id TEXT PRIMARY KEY DEFAULT ('epm_' || lower(hex(randomblob(8)))),

  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT,

  metric_date TEXT NOT NULL,
  metric_grain TEXT NOT NULL DEFAULT 'daily' CHECK (
    metric_grain IN ('hourly', 'daily', 'weekly', 'monthly')
  ),

  source_table TEXT NOT NULL DEFAULT 'mixed' CHECK (
    source_table IN (
      'agentsam_command_run',
      'agentsam_tool_call_log',
      'agentsam_tool_chain',
      'agentsam_workflow_runs',
      'mixed'
    )
  ),

  command_id TEXT,
  command_slug TEXT,
  tool_name TEXT,
  tool_category TEXT,
  workflow_id TEXT,
  workflow_run_id TEXT,
  chain_id TEXT,

  task_type TEXT,
  intent_category TEXT,
  trigger_key TEXT,

  model_key TEXT,
  provider TEXT,
  routing_arm_id TEXT,

  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  timeout_count INTEGER DEFAULT 0,
  blocked_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  cancelled_count INTEGER DEFAULT 0,
  approval_required_count INTEGER DEFAULT 0,
  sla_breach_count INTEGER DEFAULT 0,

  avg_duration_ms REAL DEFAULT 0,
  min_duration_ms INTEGER DEFAULT 0,
  max_duration_ms INTEGER DEFAULT 0,
  median_duration_ms INTEGER DEFAULT 0,
  p95_duration_ms INTEGER DEFAULT 0,
  p99_duration_ms INTEGER DEFAULT 0,

  success_rate_percent REAL DEFAULT 0,
  failure_rate_percent REAL DEFAULT 0,
  timeout_rate_percent REAL DEFAULT 0,
  sla_breach_rate_percent REAL DEFAULT 0,

  total_tokens_consumed INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,

  total_cost_usd REAL DEFAULT 0,
  total_cost_cents REAL DEFAULT 0,
  avg_cost_usd REAL DEFAULT 0,

  avg_confidence_score REAL DEFAULT 0,
  avg_quality_score REAL DEFAULT 0,

  error_types_json TEXT DEFAULT '{}',
  status_counts_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',

  first_seen_at INTEGER,
  last_seen_at INTEGER,
  last_computed_at INTEGER DEFAULT (unixepoch()), node_key TEXT DEFAULT NULL,

  FOREIGN KEY (command_id) REFERENCES agentsam_commands(id) ON DELETE SET NULL,

  UNIQUE (
    tenant_id,
    workspace_id,
    metric_date,
    metric_grain,
    source_table,
    command_id,
    command_slug,
    tool_name,
    tool_category,
    workflow_id,
    task_type,
    intent_category,
    model_key,
    provider,
    trigger_key
  )
);


-- agentsam_execution_steps
CREATE TABLE agentsam_execution_steps (
  id              TEXT    PRIMARY KEY DEFAULT ('estep_' || lower(hex(randomblob(8)))),
  execution_id    TEXT    NOT NULL REFERENCES agentsam_workflow_runs(id) ON DELETE CASCADE,
  node_key        TEXT    NOT NULL,
  node_type       TEXT,
  status          TEXT    NOT NULL DEFAULT 'pending'
                          CHECK(status IN (
                            'pending','running','success','failed',
                            'skipped','approval_pending','timed_out','retrying'
                          )),
  input_json      TEXT    DEFAULT '{}',
  output_json     TEXT    DEFAULT '{}',
  error_json      TEXT    DEFAULT '{}',
  started_at      INTEGER,
  completed_at    INTEGER,
  latency_ms      INTEGER,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        REAL    DEFAULT 0,
  quality_score   REAL,
  gate_results_json TEXT  DEFAULT '{}',
  approval_id     TEXT    REFERENCES agentsam_approval_queue(id) ON DELETE SET NULL,
  attempt         INTEGER DEFAULT 1,
  edge_taken      TEXT,
  created_at      TEXT    DEFAULT (datetime('now'))
);


-- agentsam_executions
CREATE TABLE "agentsam_executions" (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  workspace_id TEXT REFERENCES agentsam_workspace(id) ON DELETE SET NULL,
  user_id TEXT,

  plan_id TEXT REFERENCES agentsam_plans(id) ON DELETE SET NULL,
  todo_id TEXT REFERENCES agentsam_todo(id) ON DELETE SET NULL,
  command_run_id TEXT REFERENCES agentsam_command_run(id) ON DELETE SET NULL,

  workflow_run_id TEXT REFERENCES agentsam_workflow_runs(id) ON DELETE SET NULL,
  execution_step_id TEXT REFERENCES agentsam_execution_steps(id) ON DELETE SET NULL,

  task_id TEXT NOT NULL,
  subagent_id TEXT,
  agent_id TEXT,
  work_session_id TEXT,

  execution_type TEXT NOT NULL,
  command TEXT,
  file_path TEXT,

  node_key TEXT,
  model_key TEXT,
  provider TEXT,

  output TEXT,
  error TEXT,

  duration_ms INTEGER,
  timed_out INTEGER DEFAULT 0,
  sla_breach INTEGER DEFAULT 0,
  timeout_ms INTEGER DEFAULT 120000,

  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  quality_score REAL,

  status TEXT DEFAULT 'completed',

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);


-- agentsam_hook
CREATE TABLE "agentsam_hook" (
  id            TEXT    PRIMARY KEY,
  tenant_id     TEXT,
  workspace_id  TEXT,
  user_id       TEXT    NOT NULL,
  provider      TEXT    NOT NULL DEFAULT 'system',
  external_id   TEXT,
  trigger       TEXT    NOT NULL
                        CHECK(trigger IN ('start','stop','pre_deploy','post_deploy',
                                          'pre_commit','error','imessage_reply','email_reply')),
  command       TEXT    NOT NULL DEFAULT '',
  target_id     TEXT    NOT NULL DEFAULT '',
  metadata      TEXT    DEFAULT '{}',
  is_active     INTEGER NOT NULL DEFAULT 1,
  run_count     INTEGER DEFAULT 0,
  last_run_at   TEXT,
  workflow_id   TEXT    REFERENCES agentsam_mcp_workflows(id) ON DELETE SET NULL,
  subagent_slug TEXT,
  person_uuid   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);


-- agentsam_hook_execution
CREATE TABLE "agentsam_hook_execution" (
  id             TEXT    PRIMARY KEY DEFAULT ('hexec_' || lower(hex(randomblob(6)))),
  tenant_id      TEXT,
  workspace_id   TEXT,
  hook_id        TEXT    NOT NULL REFERENCES agentsam_hook(id) ON DELETE CASCADE,
  user_id        TEXT    NOT NULL,
  agent_id       TEXT,
  session_id     TEXT,
  plan_id        TEXT    REFERENCES "agentsam_plans_old"(id)       ON DELETE SET NULL,
  todo_id        TEXT    REFERENCES agentsam_todo(id)         ON DELETE SET NULL,
  command_run_id TEXT    REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  source         TEXT,
  event_type     TEXT,
  action         TEXT,
  actor          TEXT,
  target_type    TEXT,
  target_id      TEXT,
  payload_json   TEXT    DEFAULT '{}',
  metadata_json  TEXT    DEFAULT '{}',
  status         TEXT    NOT NULL CHECK(status IN ('success','fail','timeout')),
  duration_ms    INTEGER,
  output         TEXT,
  error          TEXT,
  person_uuid    TEXT,
  ran_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at     INTEGER DEFAULT (unixepoch())
);


-- agentsam_model_catalog
CREATE TABLE agentsam_model_catalog (
  id                    TEXT PRIMARY KEY DEFAULT ('mdl_' || lower(hex(randomblob(6)))),
  model_key             TEXT UNIQUE NOT NULL,   

  
  display_name          TEXT NOT NULL,
  provider              TEXT NOT NULL CHECK(provider IN ('anthropic','openai','google','workers_ai','ollama')),
  tier                  TEXT NOT NULL CHECK(tier IN ('micro','flash','standard','power','reasoning')),

  
  anthropic_model_id    TEXT DEFAULT NULL,      
  openai_model_id       TEXT DEFAULT NULL,      
  google_model_id       TEXT DEFAULT NULL,      
  workers_ai_model_id   TEXT DEFAULT NULL,      
  ollama_model_id       TEXT DEFAULT NULL,      

  
  context_window        INTEGER NOT NULL,       
  max_output_tokens     INTEGER NOT NULL,

  
  cost_per_1k_in        REAL NOT NULL DEFAULT 0,
  cost_per_1k_out       REAL NOT NULL DEFAULT 0,
  cost_per_tool_call    REAL NOT NULL DEFAULT 0,
  cost_notes            TEXT DEFAULT NULL,      

  
  supports_tools        INTEGER NOT NULL DEFAULT 0,
  supports_vision       INTEGER NOT NULL DEFAULT 0,
  supports_streaming    INTEGER NOT NULL DEFAULT 1,
  supports_json_mode    INTEGER NOT NULL DEFAULT 0,
  supports_reasoning    INTEGER NOT NULL DEFAULT 0,   
  reasoning_effort      TEXT DEFAULT NULL CHECK(reasoning_effort IN ('low','medium','high',NULL)),

  
  avg_latency_p50_ms    INTEGER DEFAULT NULL,
  avg_latency_p95_ms    INTEGER DEFAULT NULL,
  quality_score         REAL DEFAULT NULL,      
  total_calls           INTEGER DEFAULT 0,
  total_failures        INTEGER DEFAULT 0,

  
  rate_limit_rpm        INTEGER DEFAULT NULL,
  rate_limit_tpd        INTEGER DEFAULT NULL,   

  
  is_active             INTEGER NOT NULL DEFAULT 1,
  is_degraded           INTEGER NOT NULL DEFAULT 0,
  budget_exhausted      INTEGER NOT NULL DEFAULT 0,
  degraded_reason       TEXT DEFAULT NULL,

  created_at            INTEGER DEFAULT (unixepoch()),
  updated_at            INTEGER DEFAULT (unixepoch())
, api_platform TEXT);


-- agentsam_model_drift_signals
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
, ai_model_id TEXT, routing_arm_paused INTEGER DEFAULT 0, routing_arm_id     TEXT);


-- agentsam_model_routing_memory
CREATE TABLE agentsam_model_routing_memory (
  id TEXT PRIMARY KEY DEFAULT ('mrm_' || lower(hex(randomblob(8)))),
  workspace_id TEXT,
  tenant_id TEXT,
  task_type TEXT NOT NULL,
  subtask_type TEXT,
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  avg_latency_ms REAL,
  avg_input_tokens REAL,
  avg_output_tokens REAL,
  avg_cost_usd REAL,
  success_rate REAL DEFAULT 0,
  retry_rate REAL DEFAULT 0,
  hallucination_rate REAL DEFAULT 0,
  tool_success_rate REAL DEFAULT 0,
  code_pass_rate REAL DEFAULT 0,
  browser_success_rate REAL DEFAULT 0,
  image_generation_score REAL DEFAULT 0,
  writing_quality_score REAL DEFAULT 0,
  reasoning_quality_score REAL DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  last_evaluated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), sample_n INTEGER DEFAULT 0,
  UNIQUE(task_type, model_key, workspace_id)
);


-- agentsam_plan_tasks
CREATE TABLE "agentsam_plan_tasks" (
  id                TEXT    PRIMARY KEY DEFAULT ('task_' || lower(hex(randomblob(8)))),
  tenant_id         TEXT,
  workspace_id      TEXT,
  plan_id           TEXT    NOT NULL REFERENCES agentsam_plans(id) ON DELETE CASCADE,
  todo_id           TEXT    REFERENCES agentsam_todo(id) ON DELETE SET NULL,
  command_run_id    TEXT    REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  agent_id          TEXT,
  assigned_model    TEXT,
  order_index       INTEGER NOT NULL,
  title             TEXT    NOT NULL,
  description       TEXT,
  priority          TEXT    NOT NULL DEFAULT 'P1'
                            CHECK(priority IN ('P0','P1','P2','P3')),
  category          TEXT    DEFAULT 'backend'
                            CHECK(category IN ('frontend','backend','db','infra','ux','research','other')),
  status            TEXT    NOT NULL DEFAULT 'todo'
                            CHECK(status IN ('todo','in_progress','done','blocked','skipped','carried')),
  files_involved    TEXT    DEFAULT '[]',
  tables_involved   TEXT    DEFAULT '[]',
  routes_involved   TEXT    DEFAULT '[]',
  depends_on        TEXT    DEFAULT '[]',
  estimated_minutes INTEGER,
  actual_minutes    INTEGER,
  blocked_reason    TEXT,
  notes             TEXT,
  output_summary    TEXT,
  error_trace       TEXT,
  tokens_used       INTEGER DEFAULT 0,
  cost_usd          REAL    DEFAULT 0,
  started_at        INTEGER,
  completed_at      INTEGER,
  created_at        INTEGER DEFAULT (unixepoch()),
  node_key          TEXT DEFAULT NULL,
  execution_step_id TEXT REFERENCES agentsam_execution_steps(id) ON DELETE SET NULL,
  workflow_run_id   TEXT REFERENCES agentsam_workflow_runs(id) ON DELETE SET NULL,
  handler_key       TEXT DEFAULT NULL,
  handler_type      TEXT DEFAULT NULL CHECK(handler_type IS NULL OR handler_type IN ('agent','db_query','terminal','mcp_tool','script','eval','branch','webhook','approval_gate','retry','parallel','join')),
  risk_level        TEXT DEFAULT 'low' CHECK(risk_level IN ('low','medium','high','critical')),
  requires_approval INTEGER DEFAULT 0,
  quality_gate_json TEXT DEFAULT '{}',
  edge_taken        TEXT DEFAULT NULL
);


-- agentsam_plans
CREATE TABLE agentsam_plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  session_id TEXT,
  agent_id TEXT,
  client_id TEXT,
  client_name TEXT,
  plan_date TEXT NOT NULL,
  plan_type TEXT DEFAULT 'daily'
    CHECK(plan_type IN ('daily','sprint','incident','feature','refactor')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('draft','active','complete','abandoned')),
  morning_brief TEXT,
  session_notes TEXT,
  eod_summary TEXT,
  available_providers TEXT DEFAULT '["anthropic","openai","google","workers_ai"]',
  blocked_providers TEXT DEFAULT '[]',
  budget_snapshot TEXT DEFAULT '{}',
  default_model TEXT,
  token_budget INTEGER DEFAULT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  carry_over_from TEXT,
  carry_over_count INTEGER DEFAULT 0,
  tasks_total INTEGER DEFAULT 0,
  tasks_done INTEGER DEFAULT 0,
  tasks_blocked INTEGER DEFAULT 0,
  linked_project_keys TEXT DEFAULT '[]',
  linked_todo_ids TEXT DEFAULT '[]',
  linked_context_ids TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  workflow_id TEXT REFERENCES agentsam_workflows(id) ON DELETE SET NULL,
  workflow_run_id TEXT REFERENCES agentsam_workflow_runs(id) ON DELETE SET NULL,
  graph_mode INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'low',
  requires_approval INTEGER DEFAULT 0
);


-- agentsam_routing_arms
CREATE TABLE "agentsam_routing_arms" (
  id                    TEXT PRIMARY KEY DEFAULT ('ra_' || lower(hex(randomblob(8)))),
  task_type             TEXT NOT NULL,
  mode                  TEXT NOT NULL,
  model_key             TEXT NOT NULL,
  provider              TEXT NOT NULL,
  success_alpha         REAL NOT NULL DEFAULT 1.0,
  success_beta          REAL NOT NULL DEFAULT 1.0,
  cost_n                INTEGER NOT NULL DEFAULT 0,
  cost_mean             REAL NOT NULL DEFAULT 0,
  cost_m2               REAL NOT NULL DEFAULT 0,
  latency_n             INTEGER NOT NULL DEFAULT 0,
  latency_mean          REAL NOT NULL DEFAULT 0,
  latency_m2            REAL NOT NULL DEFAULT 0,
  decayed_score         REAL NOT NULL DEFAULT 0,
  last_decay_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  is_eligible           INTEGER NOT NULL DEFAULT 1,
  is_paused             INTEGER NOT NULL DEFAULT 0,
  pause_reason          TEXT,
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  ai_model_id           TEXT,
  last_chain_id         TEXT,
  last_plan_id          TEXT,
  avg_quality_score     REAL DEFAULT 0,
  quality_n             INTEGER DEFAULT 0,
  max_cost_per_call_usd REAL,
  budget_exhausted      INTEGER DEFAULT 0,
  drift_signal_id       TEXT,
  intent_slug           TEXT,
  total_executions      INTEGER DEFAULT 0,
  workflow_agent        TEXT,
  tools_json            TEXT DEFAULT '[]',
  is_active             INTEGER DEFAULT 1,
  reasoning_effort      TEXT DEFAULT 'medium',
  workspace_id          TEXT NOT NULL,
  fallback_model_key    TEXT,
  supports_tools        INTEGER DEFAULT 1,
  priority              INTEGER DEFAULT 50,
  model_catalog_id      TEXT REFERENCES agentsam_model_catalog(id) ON DELETE SET NULL,
  UNIQUE(workspace_id, task_type, mode, model_key)
);


-- agentsam_subagent_profile
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), personality_tone TEXT DEFAULT 'professional', personality_traits TEXT, personality_rules TEXT, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), run_in_background INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, agent_type TEXT DEFAULT 'custom', sandbox_mode TEXT DEFAULT 'workspace-write', model_reasoning_effort TEXT DEFAULT 'medium', nickname_candidates TEXT, can_spawn_subagents INTEGER DEFAULT 0, spawnable_agent_slugs TEXT, spawn_trigger_keywords TEXT, max_concurrent_threads INTEGER DEFAULT 6, max_spawn_depth INTEGER DEFAULT 1, job_timeout_seconds INTEGER DEFAULT 1800, mcp_servers_json TEXT, output_schema_json TEXT, is_parallelizable INTEGER DEFAULT 0, codex_compatible INTEGER DEFAULT 0, person_uuid TEXT, tenant_id TEXT, ai_model_id TEXT, is_platform_global INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, workspace_id, slug)
);


-- agentsam_todo
CREATE TABLE "agentsam_todo" (
  id                TEXT    PRIMARY KEY,
  tenant_id         TEXT    NOT NULL,
  workspace_id      TEXT,
  title             TEXT    NOT NULL,
  description       TEXT,
  status            TEXT    NOT NULL DEFAULT 'open',
  priority          TEXT    NOT NULL DEFAULT 'medium',
  category          TEXT,
  tags              TEXT    DEFAULT '[]',
  due_date          TEXT,
  completed_at      TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT    NOT NULL DEFAULT 'agentsam',
  notes             TEXT,
  linked_commit     TEXT,
  linked_route      TEXT,
  linked_table      TEXT,
  sort_order        INTEGER DEFAULT 50,
  plan_id           TEXT,
  project_key       TEXT,
  task_type         TEXT    NOT NULL DEFAULT 'execute',
  execution_status  TEXT    NOT NULL DEFAULT 'queued',
  assigned_to       TEXT    DEFAULT 'agentsam',
  depends_on        TEXT    DEFAULT '[]',
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_retries       INTEGER NOT NULL DEFAULT 2,
  timeout_seconds   INTEGER DEFAULT 300,
  context_snapshot  TEXT    DEFAULT '{}',
  output_summary    TEXT,
  error_trace       TEXT,
  token_budget      INTEGER DEFAULT NULL,
  tokens_used       INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL    NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by       TEXT,
  approved_at       TEXT,
  started_at        TEXT
, kanban_task_id TEXT REFERENCES kanban_tasks(id) ON DELETE SET NULL, kanban_board_id TEXT REFERENCES kanban_boards(id) ON DELETE SET NULL);
