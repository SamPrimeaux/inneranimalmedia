-- Repair three production workflows: edge condition_json (from_status), handler configs, surface_routes.
-- Workflows: wf_agent_browser_inspection_to_patch, i-am-inspector-playwright, wf_cms_live_editor_dev_app
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/370_workflow_repair_edges_handlers.sql

-- ── 1. Edge condition_json: status → from_status ─────────────────────────────

UPDATE agentsam_workflow_edges
SET condition_json = '{"from_status":"success"}'
WHERE workflow_id = 'i-am-inspector-playwright'
  AND condition_type = 'status'
  AND (condition_json LIKE '%"status":"completed"%' OR condition_json LIKE '%"status": "completed"%');

UPDATE agentsam_workflow_edges
SET condition_json = '{"from_status":"failed"}'
WHERE workflow_id = 'i-am-inspector-playwright'
  AND condition_type = 'status'
  AND (condition_json LIKE '%"status":"failed"%' OR condition_json LIKE '%"status": "failed"%');

UPDATE agentsam_workflow_edges
SET condition_json = '{"from_status":"success"}'
WHERE workflow_id = 'wf_cms_live_editor_dev_app'
  AND condition_type = 'status'
  AND (condition_json LIKE '%"status":"completed"%' OR condition_json LIKE '%"status": "completed"%');

UPDATE agentsam_workflow_edges
SET condition_type = 'field',
    condition_json = '{"field":"pass","op":"eq","value":1}'
WHERE workflow_id = 'wf_cms_live_editor_dev_app'
  AND from_node_key = 'verify_live_editor_contract'
  AND to_node_key = 'promotion_gate';

-- ── 2. browser.capture_context (also in 369; idempotent refresh) ─────────────

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'builtin_tool',
  node_type = 'agent',
  handler_config_json = '{"tools":["browser_navigate","browser_content","cdt_list_console_messages","cdt_list_network_requests","cdt_take_snapshot","playwright_screenshot"],"source":"src/core/browser-capture-context.js"}',
  description = 'Structured DOM/console/network capture via DB-resolved browser tools.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'browser.capture_context';

-- ── 3. LLM handlers (browser inspection workflow) ────────────────────────────

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'agent_llm',
  handler_config_json = json('{
    "task_type": "browser_ui_repair",
    "mode": "agent",
    "model_key": "gpt-5.4-mini",
    "system_prompt": "You diagnose UI issues from structured browser capture (DOM, console, network, selected element). Return JSON: {\"issue_summary\",\"likely_component\",\"css_or_route_cause\",\"severity\",\"evidence\"}. No vague prose.",
    "user_message_field": "capture"
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'openai.mini.diagnose_ui_issue'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'agent_llm',
  handler_config_json = json('{
    "task_type": "code",
    "mode": "agent",
    "model_key": "gpt-5.4-mini",
    "system_prompt": "Prepare a Monaco/Cursor patch plan from the diagnosis. Return JSON: {\"files\":[{\"path\",\"change_summary\"}],\"validation_commands\":[],\"rollback_notes\":\"\"}. Every file path must be real under src/ or dashboard/.",
    "user_message_field": "result"
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'openai.mini.prepare_patch_plan'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'eval',
  quality_gate_json = json('{
    "assertions": [
      {"field": "has_file_paths", "op": "eq", "value": true},
      {"field": "vague_language", "op": "eq", "value": false}
    ]
  }'),
  handler_config_json = json('{"eval_handler":"eval.patch_plan_quality"}'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'eval.patch_plan_quality';

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'ui_emit',
  node_type = 'webhook',
  handler_config_json = json('{"event_type":"workflow_timeline"}'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'ui.emit_workflow_timeline_event';

-- ── 4. Inspector playwright: prepare_context + artifacts + telemetry ─────────

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, input_schema_json, quality_gate_json,
  risk_level, requires_approval, is_active, created_at, updated_at
) VALUES (
  'agentsam.workflow.prepare_context',
  'db_query',
  'd1_sql',
  'Prepare workflow run context',
  'Load agentsam_workflow_runs row for inspector graph.',
  '{"sql":"SELECT id, workflow_id, workflow_key, tenant_id, workspace_id, user_id, input_json, status, steps_completed, steps_total FROM agentsam_workflow_runs WHERE id = ?","params":["$.run_id"]}',
  '{}',
  '{}',
  'low',
  0,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'd1_sql',
  handler_config_json = '{"sql":"SELECT id, workflow_id, workflow_key, tenant_id, workspace_id, user_id, input_json, status, steps_completed, steps_total FROM agentsam_workflow_runs WHERE id = ?","params":["$.run_id"]}',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key IN ('agentsam.workflow.prepare_context', 'agentsam.contract.prepare_context')
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'd1_sql',
  handler_config_json = json('{
    "sql": "INSERT OR REPLACE INTO agentsam_artifacts (id, user_id, tenant_id, workspace_id, name, artifact_type, r2_key, source, source_run_id, source_workflow_id, metadata_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ''workflow_graph'', ?, ?, ?, unixepoch())",
    "params": [
      "$.artifact_id",
      "$.user_id",
      "$.tenant_id",
      "$.workspace_id",
      "$.name",
      "$.artifact_type",
      "$.r2_key",
      "$.run_id",
      "$.workflow_id",
      "$.metadata_json"
    ]
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.artifacts.write'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, quality_gate_json, risk_level, requires_approval, is_active,
  created_at, updated_at
) VALUES (
  'agentsam.qa.assertions',
  'eval',
  'eval',
  'Playwright QA assertions',
  'Assert capture evidence present before report.',
  '{}',
  json('{"assertions":[{"field":"passed","op":"eq","value":true}]}'),
  'low',
  0,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'eval',
  quality_gate_json = json('{"assertions":[{"field":"ok","op":"eq","value":true}]}'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.qa.assertions';

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'd1_sql',
  handler_config_json = '{"sql":"UPDATE agentsam_workflow_runs SET steps_completed = COALESCE(steps_completed,0), updated_at = datetime(''now'') WHERE id = ?","params":["$.run_id"]}',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.workflow.sync_run_metrics'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'd1_sql',
  handler_config_json = '{"sql":"UPDATE agentsam_workflow_runs SET status = ''completed'', completed_at = unixepoch(), current_node_key = ''complete_run'', updated_at = datetime(''now'') WHERE id = ?","params":["$.run_id"]}',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.workflow.complete_run'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'd1_sql',
  handler_config_json = '{"sql":"UPDATE agentsam_workflow_runs SET input_tokens = COALESCE(input_tokens,0) + COALESCE(?,0), output_tokens = COALESCE(output_tokens,0) + COALESCE(?,0), cost_usd = COALESCE(cost_usd,0) + COALESCE(?,0), updated_at = datetime(''now'') WHERE id = ?","params":["$.input_tokens","$.output_tokens","$.cost_usd","$.run_id"]}',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.telemetry.write_d1_usage'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

-- ── 5. CMS live editor handlers ──────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, risk_level, requires_approval, is_active, created_at, updated_at
) VALUES
(
  'agent.nano.cms_schema_discovery',
  'agent',
  'agent_llm',
  'CMS schema discovery',
  'Nano-tier CMS schema discovery for live editor dev app.',
  '{}',
  'low',
  0,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agent.nano.template_library_plan',
  'agent',
  'agent_llm',
  'Template library plan',
  'Plan template library structure for CMS live editor.',
  '{}',
  'low',
  0,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agent.nano.dev_app_manifest',
  'agent',
  'agent_llm',
  'Dev app manifest',
  'Generate dev app manifest JSON for CMS live editor.',
  '{}',
  'low',
  0,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'agent_llm',
  handler_config_json = json('{
    "task_type": "cms_edit",
    "mode": "agent",
    "model_key": "gpt-5.4-nano",
    "system_prompt": "Discover CMS schema tables and columns relevant to live editor dev artifacts. Return JSON: {\"tables\":[],\"notes\":\"\"}."
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agent.nano.cms_schema_discovery'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'agent_llm',
  handler_config_json = json('{
    "task_type": "cms_edit",
    "mode": "agent",
    "model_key": "gpt-5.4-nano",
    "system_prompt": "Design a template library plan for CMS live editor dev mode. Return JSON: {\"templates\":[],\"r2_prefix\":\"dev/cms-live-editor/\"}."
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agent.nano.template_library_plan'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'agent_llm',
  handler_config_json = json('{
    "task_type": "cms_edit",
    "mode": "agent",
    "model_key": "gpt-5.4-nano",
    "system_prompt": "Generate dev app manifest JSON for CMS live editor. Return JSON: {\"manifest_version\":1,\"routes\":[],\"artifacts\":[]}."
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agent.nano.dev_app_manifest'
  AND (handler_config_json IS NULL OR handler_config_json = '{}' OR handler_config_json = 'null');

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'builtin_tool',
  handler_config_json = json('{
    "delegate": "script",
    "tool_key": "script.r2_put_artifact",
    "r2_prefix": "dev/cms-live-editor/",
    "artifact_type": "cms_live_editor_dev"
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'script_write_cms_live_editor_dev_artifacts';

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, quality_gate_json, risk_level, requires_approval, is_active,
  created_at, updated_at
) VALUES (
  'eval_cms_live_editor_contract',
  'eval',
  'eval',
  'CMS live editor contract',
  'Verify manifest + R2 artifact contract.',
  '{}',
  json('{"assertions":[{"field":"passed","op":"eq","value":true}]}'),
  'low',
  0,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'approval',
  handler_config_json = json('{
    "tool_name": "cms_live_editor_promotion",
    "action_summary": "Approve promotion of CMS live editor dev artifacts to production paths",
    "approval_type": "workflow",
    "risk_level": "high",
    "ttl_sec": 86400
  }'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'approval.cms_live_editor_promotion';

-- ── 6. metadata_json.surface_routes (routing without code deploy) ───────────

UPDATE agentsam_workflows
SET metadata_json = json_set(
  COALESCE(NULLIF(trim(metadata_json), ''), '{}'),
  '$.surface_routes',
  json('{"browser":["*"],"inspector":["*"],"chat":["browser","inspect"]}')
),
updated_at = datetime('now')
WHERE id = 'wf_agent_browser_inspection_to_patch';

UPDATE agentsam_workflows
SET metadata_json = json_set(
  COALESCE(NULLIF(trim(metadata_json), ''), '{}'),
  '$.surface_routes',
  json('{"browser":["*"],"playwright":["*"],"e2e":["*"]}')
),
updated_at = datetime('now')
WHERE id = 'i-am-inspector-playwright';

UPDATE agentsam_workflows
SET metadata_json = json_set(
  COALESCE(NULLIF(trim(metadata_json), ''), '{}'),
  '$.surface_routes',
  json('{"cms":["live_editor","dev_app"],"code":["cms"]}')
),
updated_at = datetime('now')
WHERE id = 'wf_cms_live_editor_dev_app';
