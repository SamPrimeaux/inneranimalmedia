-- 368: Allow trigger / process / output node_type on agentsam_workflow_nodes + handler catalog seeds.
-- Executor: src/core/workflow-executor.js (cases trigger, process, output).
--
-- Apply prod (use script; wrangler --file can fail on CHECK commas):
--   ./scripts/apply-368-workflow-node-types.sh

-- ================================================================
-- 1. Expand node_type CHECK (SQLite: table recreate)
-- ================================================================
CREATE TABLE agentsam_workflow_nodes_new (
  id TEXT PRIMARY KEY DEFAULT ('wnode_' || lower(hex(randomblob(8))),
  workflow_id TEXT NOT NULL REFERENCES agentsam_workflows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL DEFAULT 'agent'
    CHECK(node_type IN (
      'agent','db_query','mcp_tool','script',
      'approval_gate','eval','branch','webhook','terminal',
      'retry','parallel','join',
      'trigger','process','output'
    )),
  title TEXT NOT NULL,
  description TEXT,
  handler_key TEXT,
  input_schema_json TEXT DEFAULT '{}',
  output_schema_json TEXT DEFAULT '{}',
  timeout_ms INTEGER DEFAULT 30000,
  retry_policy_json TEXT DEFAULT '{}',
  quality_gate_json TEXT DEFAULT '{}',
  risk_level TEXT DEFAULT 'low'
    CHECK(risk_level IN ('low','medium','high','critical')),
  requires_approval INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_at_unix INTEGER,
  pos_x REAL,
  pos_y REAL,
  UNIQUE(workflow_id, node_key)
);

INSERT INTO agentsam_workflow_nodes_new (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order,
  created_at, updated_at, created_at_unix, pos_x, pos_y
)
SELECT
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order,
  created_at, updated_at, created_at_unix, pos_x, pos_y
FROM agentsam_workflow_nodes;

DROP TABLE agentsam_workflow_nodes;
ALTER TABLE agentsam_workflow_nodes_new RENAME TO agentsam_workflow_nodes;

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow ON agentsam_workflow_nodes(workflow_id, is_active);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_type ON agentsam_workflow_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_risk ON agentsam_workflow_nodes(risk_level);

-- ================================================================
-- 2. Handler catalog (canonical semantics for DB-driven graphs)
-- ================================================================
CREATE TABLE IF NOT EXISTS agentsam_workflow_node_handlers (
  handler_key TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,
  executor_kind TEXT NOT NULL,
  title TEXT,
  description TEXT,
  handler_config_json TEXT DEFAULT '{}',
  input_schema_json TEXT DEFAULT '{}',
  quality_gate_json TEXT DEFAULT '{}',
  risk_level TEXT DEFAULT 'low',
  requires_approval INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  tenant_id TEXT,
  workspace_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR REPLACE INTO agentsam_workflow_node_handlers (
  handler_key, node_type, executor_kind, title, description, handler_config_json, is_active
) VALUES
  (
    'workflow.trigger.manual',
    'trigger',
    'passthrough',
    'Manual trigger',
    'Passes run input into the graph; use as entry_node_key.',
    '{"emit":{"triggered":true}}',
    1
  ),
  (
    'workflow.trigger.agent',
    'trigger',
    'passthrough',
    'Agent chat trigger',
    'Normalizes agent/chat payload as graph input.',
    '{"source":"agent_chat"}',
    1
  ),
  (
    'workflow.trigger.scheduled',
    'trigger',
    'passthrough',
    'Scheduled trigger',
    'Cron/scheduled payload passthrough.',
    '{"source":"scheduled"}',
    1
  ),
  (
    'workflow.process.pass_through',
    'process',
    'passthrough',
    'Process (passthrough)',
    'Merges upstream output; optional script handler_key on node runs first in executor.',
    '{}',
    1
  ),
  (
    'workflow.process.merge_upstream',
    'process',
    'passthrough',
    'Process (merge upstream)',
    'Flattens prior step output into a single object for downstream nodes.',
    '{"merge":true}',
    1
  ),
  (
    'workflow.output.final',
    'output',
    'passthrough',
    'Final output',
    'Terminal node: exposes flattened upstream as workflow output.',
    '{"terminal":true}',
    1
  ),
  (
    'workflow.output.emit',
    'output',
    'passthrough',
    'Output + node_key stamp',
    'Same as final output; includes node_key in payload for Studio trace.',
    '{"terminal":true,"stamp_node_key":true}',
    1
  ),
  (
    'workflow.join.finish',
    'join',
    'passthrough',
    'Join / finish',
    'Fan-in terminal (maps to join node_type in graphs).',
    '{"terminal":true}',
    1
  );

-- ================================================================
-- 3. Reference graph: trigger → process → output (platform template)
-- ================================================================
INSERT OR IGNORE INTO agentsam_workflows (
  id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global
) VALUES (
  'wf_graph_flow_primitives',
  'graph-flow-primitives',
  'Graph flow primitives (trigger → process → output)',
  'Template workflow demonstrating trigger, process, and output node_types. Safe smoke graph.',
  'maintenance',
  'manual',
  'agent',
  'workflow_orchestration',
  'low',
  0,
  1,
  60000,
  '{}',
  '{"source":"migrations/368_agentsam_workflow_node_types_trigger_process_output.sql","entry_node_key":"start","production_real":false,"template":true}',
  1,
  1
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
  (
    'wnode_gfp_start',
    'wf_graph_flow_primitives',
    'start',
    'trigger',
    'Start',
    'Entry trigger; passes run input downstream.',
    'workflow.trigger.manual',
    '{}',
    '{}',
    5000,
    '{"max_retries":0}',
    '{}',
    'low',
    0,
    1,
    10
  ),
  (
    'wnode_gfp_process',
    'wf_graph_flow_primitives',
    'process_step',
    'process',
    'Process',
    'Merge upstream payload for downstream steps.',
    'workflow.process.pass_through',
    '{}',
    '{}',
    5000,
    '{"max_retries":0}',
    '{}',
    'low',
    0,
    1,
    20
  ),
  (
    'wnode_gfp_output',
    'wf_graph_flow_primitives',
    'finish',
    'output',
    'Finish',
    'Terminal output node.',
    'workflow.output.final',
    '{}',
    '{}',
    5000,
    '{"max_retries":0}',
    '{}',
    'low',
    0,
    1,
    30
  );

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, priority, label
) VALUES
  ('wedge_gfp_01', 'wf_graph_flow_primitives', 'start', 'process_step', 'always', 10, 'start -> process_step'),
  ('wedge_gfp_02', 'wf_graph_flow_primitives', 'process_step', 'finish', 'always', 20, 'process_step -> finish');

-- Backfill handler_key on lone production join node if missing
UPDATE agentsam_workflow_nodes
SET handler_key = 'workflow.join.finish',
    updated_at = datetime('now')
WHERE node_type = 'join'
  AND (handler_key IS NULL OR trim(handler_key) = '');
