-- REFERENCE: copy-paste patterns for agentsam_* write operations.
-- Idempotent writes only — never bare INSERT on registry tables.
-- See migrations/340_agentsam_db_governance.sql for NULL-tier unique indexes.
--
-- ISOLATION CONTRACT
-- Platform-global  → tenant_id=NULL, workspace_id=NULL
-- Tenant-scoped    → tenant_id=set, workspace_id=NULL
-- Workspace-scoped → tenant_id=set, workspace_id=set
--
-- RULES
-- 1. INSERT OR REPLACE for canonical rows you own (deterministic id)
-- 2. INSERT OR IGNORE for seed data that must not overwrite prod edits
-- 3. Automated/test workflow_key MUST include _test or _smoke suffix
-- 4. Node descriptions: "RUNTIME workspace_id" — never literal ws_* in prose
-- 5. workflow_key / tool_name are stable identifiers — not randomblob ids

-- Pattern A: Platform-global workflow (id = workflow_key when global)
INSERT OR REPLACE INTO agentsam_workflows (
  id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_task_type,
  risk_level, requires_approval, timeout_ms,
  is_active, is_platform_global,
  tenant_id, workspace_id,
  metadata_json, quality_gate_json,
  updated_at
) VALUES (
  'i-am-inspector-playwright',
  'i-am-inspector-playwright', 'Inspector Playwright', 'Browser QA workflow...',
  'agentic', 'manual', 'debug',
  'medium', 0, 600000,
  1, 1,
  NULL, NULL,
  '{"model_preference":["gpt-5.4-mini"]}', '{}',
  datetime('now')
);

-- Pattern B: Tenant-scoped MCP workflow (workspace_id NULL at tenant tier)
INSERT OR REPLACE INTO agentsam_mcp_workflows (
  id, workflow_key, display_name, description,
  tenant_id, workspace_id,
  steps_json, is_active,
  updated_at
) VALUES (
  'mcpwf_deploy_to_production',
  'deploy_to_production', 'Deploy to Production', 'Full CF deploy pipeline.',
  'tenant_sam_primeaux', NULL,
  '[{"step":"build"},{"step":"deploy"},{"step":"verify"}]', 1,
  datetime('now')
);

-- Pattern C: Platform-global MCP catalog row (resolveMcpWorkflowRow fallback)
INSERT OR IGNORE INTO agentsam_mcp_workflows (
  id, workflow_key, display_name, description,
  tenant_id, workspace_id,
  steps_json, is_active,
  created_at, updated_at
) VALUES (
  'mcpwf_global_i-am-inspector-playwright',
  'i-am-inspector-playwright', 'Inspector Playwright',
  'Platform-global. Data isolation via RUNTIME workspace_id in every node write.',
  NULL, NULL,
  '[]', 1,
  datetime('now'), datetime('now')
);

-- Pattern D: Tool upsert (tool_name is UNIQUE)
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_name, display_name, tool_category,
  handler_type, handler_config,
  workflow_key, task_type,
  risk_level, requires_approval,
  is_active, is_global, workspace_scope,
  modes_json, updated_at
) VALUES (
  'ast_881027833bf09ab4',
  'playwright_screenshot', 'Playwright Screenshot', 'browser',
  'builtin', '{"dispatcher":"playwright_screenshot","source_file":"src/tools/builtin/web.js"}',
  'i-am-inspector-playwright', 'browser_ops',
  'low', 0,
  1, 1, 'global',
  '["auto","agent","build","debug","test"]', unixepoch()
);

-- Pattern E: Skill upsert (deterministic id; INSERT OR IGNORE to avoid stomping edits)
INSERT OR IGNORE INTO agentsam_skill (
  id, tenant_id, user_id,
  name, description, content_markdown,
  scope, task_types_json, route_keys_json,
  always_apply, is_active,
  created_at, updated_at
) VALUES (
  'skill_iam_playwright_jobs',
  'tenant_sam_primeaux', 'sam_primeaux',
  'Playwright validation jobs', 'playwright_jobs + MYBROWSER queue.',
  '# Playwright...',
  'workspace',
  '["debug","code","browser_ops","qa"]',
  '["debug","code_review","browser","qa"]',
  0, 1,
  datetime('now'), datetime('now')
);

-- Pattern F: Workflow node upsert
-- node_type: agent | db_query | mcp_tool | script | approval_gate | eval |
--            branch | webhook | terminal | retry | parallel | join
INSERT OR REPLACE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type,
  title, description,
  handler_key,
  timeout_ms, risk_level, is_active, sort_order,
  quality_gate_json, retry_policy_json,
  updated_at
) VALUES (
  'i-am-inspector-playwright-capture',
  'i-am-inspector-playwright', 'capture_evidence', 'mcp_tool',
  'Capture Evidence',
  'Poll playwright_jobs using RUNTIME workspace_id until completed.',
  'playwright_job_poll',
  90000, 'medium', 1, 20,
  '{"requires_screenshot":true,"requires_result_json":true}',
  '{"max_retries":1,"backoff":"linear","delay_ms":1000}',
  datetime('now')
);

-- Pattern G: Automated keys — GOOD vs BAD
-- GOOD: wf_pinstest_smoke_20260515, i-am-inspector-playwright
-- BAD:  wf_ollama_local_pinstest_20260510_025903_1277b4
