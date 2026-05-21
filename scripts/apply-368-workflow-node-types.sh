#!/usr/bin/env bash
# Apply migration 368 in discrete statements (wrangler --file can choke on CHECK/JSON commas).
set -euo pipefail
cd "$(dirname "$0")/.."
WR="./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml"

run() {
  echo ">> $1"
  $WR --command "$1"
}

run "CREATE TABLE agentsam_workflow_nodes_new ( id TEXT PRIMARY KEY DEFAULT ('wnode_' || lower(hex(randomblob(8)))), workflow_id TEXT NOT NULL REFERENCES agentsam_workflows(id) ON DELETE CASCADE, node_key TEXT NOT NULL, node_type TEXT NOT NULL DEFAULT 'agent' CHECK(node_type IN ('agent','db_query','mcp_tool','script','approval_gate','eval','branch','webhook','terminal','retry','parallel','join','trigger','process','output')), title TEXT NOT NULL, description TEXT, handler_key TEXT, input_schema_json TEXT DEFAULT '{}', output_schema_json TEXT DEFAULT '{}', timeout_ms INTEGER DEFAULT 30000, retry_policy_json TEXT DEFAULT '{}', quality_gate_json TEXT DEFAULT '{}', risk_level TEXT DEFAULT 'low' CHECK(risk_level IN ('low','medium','high','critical')), requires_approval INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), created_at_unix INTEGER, pos_x REAL, pos_y REAL, UNIQUE(workflow_id, node_key) );"

run "INSERT INTO agentsam_workflow_nodes_new ( id, workflow_id, node_key, node_type, title, description, handler_key, input_schema_json, output_schema_json, timeout_ms, retry_policy_json, quality_gate_json, risk_level, requires_approval, is_active, sort_order, created_at, updated_at, created_at_unix, pos_x, pos_y ) SELECT id, workflow_id, node_key, node_type, title, description, handler_key, input_schema_json, output_schema_json, timeout_ms, retry_policy_json, quality_gate_json, risk_level, requires_approval, is_active, sort_order, created_at, updated_at, created_at_unix, pos_x, pos_y FROM agentsam_workflow_nodes;"

run "DROP TABLE agentsam_workflow_nodes;"
run "ALTER TABLE agentsam_workflow_nodes_new RENAME TO agentsam_workflow_nodes;"
run "CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow ON agentsam_workflow_nodes(workflow_id, is_active);"
run "CREATE INDEX IF NOT EXISTS idx_workflow_nodes_type ON agentsam_workflow_nodes(node_type);"
run "CREATE INDEX IF NOT EXISTS idx_workflow_nodes_risk ON agentsam_workflow_nodes(risk_level);"

for hk in \
  "workflow.trigger.manual|trigger|passthrough|Manual trigger|Passes run input into the graph" \
  "workflow.trigger.agent|trigger|passthrough|Agent chat trigger|Normalizes agent chat payload" \
  "workflow.trigger.scheduled|trigger|passthrough|Scheduled trigger|Cron scheduled payload" \
  "workflow.process.pass_through|process|passthrough|Process passthrough|Merges upstream output" \
  "workflow.process.merge_upstream|process|passthrough|Process merge|Flattens prior step output" \
  "workflow.output.final|output|passthrough|Final output|Terminal workflow output" \
  "workflow.output.emit|output|passthrough|Output emit|Terminal output with node_key" \
  "workflow.join.finish|join|passthrough|Join finish|Fan-in terminal node"
do
  IFS='|' read -r key nt ek title desc <<< "$hk"
  run "INSERT OR REPLACE INTO agentsam_workflow_node_handlers (handler_key, node_type, executor_kind, title, description, handler_config_json, is_active) VALUES ('${key}', '${nt}', '${ek}', '${title}', '${desc}', '{}', 1);"
done

run "INSERT OR IGNORE INTO agentsam_workflows ( id, workflow_key, display_name, description, workflow_type, trigger_type, default_mode, default_task_type, risk_level, requires_approval, max_concurrent_nodes, timeout_ms, quality_gate_json, metadata_json, is_active, is_platform_global ) VALUES ( 'wf_graph_flow_primitives', 'graph-flow-primitives', 'Graph flow primitives', 'Template: trigger process output node types', 'maintenance', 'manual', 'agent', 'workflow_orchestration', 'low', 0, 1, 60000, '{}', '{\"entry_node_key\":\"start\",\"template\":true}', 1, 1 );"

run "INSERT OR IGNORE INTO agentsam_workflow_nodes ( id, workflow_id, node_key, node_type, title, description, handler_key, input_schema_json, output_schema_json, timeout_ms, retry_policy_json, quality_gate_json, risk_level, requires_approval, is_active, sort_order ) VALUES ( 'wnode_gfp_start', 'wf_graph_flow_primitives', 'start', 'trigger', 'Start', 'Entry trigger', 'workflow.trigger.manual', '{}', '{}', 5000, '{}', '{}', 'low', 0, 1, 10 );"

run "INSERT OR IGNORE INTO agentsam_workflow_nodes ( id, workflow_id, node_key, node_type, title, description, handler_key, input_schema_json, output_schema_json, timeout_ms, retry_policy_json, quality_gate_json, risk_level, requires_approval, is_active, sort_order ) VALUES ( 'wnode_gfp_process', 'wf_graph_flow_primitives', 'process_step', 'process', 'Process', 'Merge upstream', 'workflow.process.pass_through', '{}', '{}', 5000, '{}', '{}', 'low', 0, 1, 20 );"

run "INSERT OR IGNORE INTO agentsam_workflow_nodes ( id, workflow_id, node_key, node_type, title, description, handler_key, input_schema_json, output_schema_json, timeout_ms, retry_policy_json, quality_gate_json, risk_level, requires_approval, is_active, sort_order ) VALUES ( 'wnode_gfp_output', 'wf_graph_flow_primitives', 'finish', 'output', 'Finish', 'Terminal output', 'workflow.output.final', '{}', '{}', 5000, '{}', '{}', 'low', 0, 1, 30 );"

run "INSERT OR IGNORE INTO agentsam_workflow_edges ( id, workflow_id, from_node_key, to_node_key, condition_type, priority, label ) VALUES ( 'wedge_gfp_01', 'wf_graph_flow_primitives', 'start', 'process_step', 'always', 10, 'start to process' ), ( 'wedge_gfp_02', 'wf_graph_flow_primitives', 'process_step', 'finish', 'always', 20, 'process to finish' );"

run "UPDATE agentsam_workflow_nodes SET handler_key = 'workflow.join.finish', updated_at = datetime('now') WHERE node_type = 'join' AND (handler_key IS NULL OR trim(handler_key) = '');"

echo "368 apply complete."
