-- 350: Thompson training ledger — one immutable reward row per canonical source event.
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/350_agentsam_performance_eto_events.sql
--
-- Verify:
--   SELECT name FROM sqlite_master WHERE name = 'agentsam_performance_eto_events';
--   PRAGMA table_info(agentsam_performance_eto_events);

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS agentsam_performance_eto_events (
  id TEXT PRIMARY KEY,

  tenant_id TEXT NOT NULL DEFAULT '',
  workspace_id TEXT NOT NULL DEFAULT '',
  user_id TEXT,

  source_table TEXT NOT NULL CHECK (source_table IN (
    'agentsam_agent_run',
    'agentsam_usage_events',
    'agentsam_command_run',
    'agentsam_workflow_runs',
    'agentsam_execution_steps',
    'agentsam_executions',
    'agentsam_tool_call_log',
    'agentsam_mcp_tool_execution',
    'agentsam_eval_runs',
    'agentsam_escalation'
  )),
  source_id TEXT NOT NULL,

  agent_run_id TEXT,
  workflow_run_id TEXT,
  execution_id TEXT,
  execution_step_id TEXT,
  command_run_id TEXT,
  tool_call_id TEXT,
  mcp_tool_execution_id TEXT,
  eval_run_id TEXT,
  usage_event_id TEXT,
  epm_id TEXT,

  routing_arm_id TEXT,
  inferred_routing_arm_id TEXT,
  route_key TEXT,
  task_type TEXT,
  mode TEXT,

  model_catalog_id TEXT,
  model_key TEXT,
  provider TEXT,

  event_status TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  failure INTEGER NOT NULL DEFAULT 0,
  timed_out INTEGER NOT NULL DEFAULT 0,
  sla_breach INTEGER NOT NULL DEFAULT 0,

  latency_ms INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  quality_score REAL,

  is_smoke_test INTEGER NOT NULL DEFAULT 0,
  is_training_eligible INTEGER NOT NULL DEFAULT 0,

  reward_score REAL NOT NULL DEFAULT 0,
  alpha_delta REAL NOT NULL DEFAULT 0,
  beta_delta REAL NOT NULL DEFAULT 0,

  reward_reason TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',

  etl_run_id TEXT,
  eto_run_id TEXT,
  applied_to_thompson_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(source_table, source_id),

  FOREIGN KEY (routing_arm_id) REFERENCES agentsam_routing_arms(id) ON DELETE SET NULL,
  FOREIGN KEY (inferred_routing_arm_id) REFERENCES agentsam_routing_arms(id) ON DELETE SET NULL,
  FOREIGN KEY (model_catalog_id) REFERENCES agentsam_model_catalog(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES agentsam_workspace(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_eto_pending_thompson
  ON agentsam_performance_eto_events(
    COALESCE(NULLIF(trim(routing_arm_id), ''), NULLIF(trim(inferred_routing_arm_id), '')),
    created_at
  )
  WHERE applied_to_thompson_at IS NULL AND is_training_eligible = 1;

CREATE INDEX IF NOT EXISTS idx_eto_workspace_arm_created
  ON agentsam_performance_eto_events(workspace_id, created_at);

CREATE INDEX IF NOT EXISTS idx_eto_agent_run
  ON agentsam_performance_eto_events(agent_run_id)
  WHERE agent_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eto_routing_arm
  ON agentsam_performance_eto_events(routing_arm_id)
  WHERE routing_arm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eto_inferred_arm
  ON agentsam_performance_eto_events(inferred_routing_arm_id)
  WHERE inferred_routing_arm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eto_inference_lookup
  ON agentsam_performance_eto_events(workspace_id, task_type, mode, model_key);

CREATE INDEX IF NOT EXISTS idx_eto_source
  ON agentsam_performance_eto_events(source_table, created_at);

PRAGMA foreign_keys = ON;
