-- 394: wf_agentsam_codebase_embed — dimension-locked codebase embed pipeline (AGENTSAMVECTORIZE).
-- Playbook: agentsam_memory.schema_agentsam_vectorize_embed_pipeline (migration 393).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/394_wf_agentsam_codebase_embed.sql
--
-- Input JSON (workflow run):
--   { "embed_scope": "priority" | "full" | "describe_only", "workspace_id": "ws_inneranimalmedia" }
-- Default embed_scope: priority (smoke + index-codebase-live).

-- ─── Scripts (agentsam_scripts) ───────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes,
  created_by_rule_id, created_at_epoch, updated_at_epoch
) VALUES
(
  'script_embed_codebase_describe',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'embed_codebase_describe',
  'Embed pipeline: Vectorize describe smoke',
  '',
  'python3 scripts/embed-codebase.py --describe-only',
  'Calls Vectorize REST describe + OpenAI probe embed; hard-exits on dimension mismatch.',
  'embed',
  'python',
  'python',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'low',
  'embed,vectorize,smoke,agentsam',
  'wf_agentsam_codebase_embed step describe_validate',
  'rule_agentsam_vectorize_embed_pipeline',
  unixepoch(),
  unixepoch()
),
(
  'script_index_codebase_live',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'index_codebase_live',
  'Embed pipeline: priority codebase snapshot',
  '',
  'python3 scripts/index-codebase-live.py',
  'Smoke describe then embed priority paths into inneranimalmedia-vectors.',
  'embed',
  'python',
  'python',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'medium',
  'embed,codebase,priority',
  'wf_agentsam_codebase_embed step embed_priority',
  'rule_agentsam_vectorize_embed_pipeline',
  unixepoch(),
  unixepoch()
),
(
  'script_embed_codebase_full',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'embed_codebase_full',
  'Embed pipeline: full repo index',
  '',
  'python3 scripts/embed-codebase.py --all',
  'Full src/scripts/docs embed; expensive — approval on workflow node.',
  'embed',
  'python',
  'python',
  '',
  1,
  1,
  1,
  1,
  1,
  1,
  'high',
  'embed,codebase,full',
  'wf_agentsam_codebase_embed step embed_full',
  'rule_agentsam_vectorize_embed_pipeline',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_scripts SET body = 'python3 scripts/embed-codebase.py --describe-only', updated_at_epoch = unixepoch() WHERE slug = 'embed_codebase_describe';
UPDATE agentsam_scripts SET body = 'python3 scripts/index-codebase-live.py', updated_at_epoch = unixepoch() WHERE slug = 'index_codebase_live';
UPDATE agentsam_scripts SET body = 'python3 scripts/embed-codebase.py --all', approval_required = 1, risk_level = 'high', updated_at_epoch = unixepoch() WHERE slug = 'embed_codebase_full';

-- ─── Handlers (agentsam_workflow_handlers) ───────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, input_schema_json, quality_gate_json,
  risk_level, requires_approval, is_active, tenant_id, workspace_id,
  created_at, updated_at
) VALUES
(
  'agentsam.embed.load_playbook',
  'db_query',
  'd1_sql',
  'Load embed playbook + index registry',
  'Reads schema_agentsam_vectorize_embed_pipeline memory and vidx_agentsam_vectors dimensions.',
  '{"sql":"SELECT m.key AS memory_key, m.value AS playbook_json, v.id AS registry_id, v.index_name, v.binding_name, v.dimensions, v.metric FROM agentsam_memory m LEFT JOIN vectorize_index_registry v ON v.id = ''vidx_agentsam_vectors'' WHERE m.key = ''schema_agentsam_vectorize_embed_pipeline'' LIMIT 1","params":[]}',
  '{"type":"object"}',
  '{"required":true}',
  'low',
  0,
  1,
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agentsam.embed.describe_validate',
  'process',
  'script',
  'Describe + probe embed dimensions',
  'Runs embed_codebase_describe; must match index dimensions before any upsert.',
  '{"script_slug":"embed_codebase_describe"}',
  '{"type":"object"}',
  '{"required":true}',
  'low',
  0,
  1,
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agentsam.embed.pick_scope',
  'branch',
  'branch',
  'Choose embed scope from run input',
  'Branches on input.embed_scope: priority | full | describe_only (default priority).',
  '{"branch_field":"embed_scope"}',
  '{"type":"object","properties":{"embed_scope":{"type":"string","enum":["priority","full","describe_only"],"default":"priority"}}}',
  '{"branch_field":"embed_scope"}',
  'low',
  0,
  1,
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agentsam.embed.embed_priority',
  'process',
  'script',
  'Embed priority codebase snapshot',
  'Runs index_codebase_live (describe smoke + priority paths).',
  '{"script_slug":"index_codebase_live"}',
  '{"type":"object"}',
  '{}',
  'medium',
  0,
  1,
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agentsam.embed.embed_full',
  'process',
  'script',
  'Embed full codebase tree',
  'Runs embed_codebase_full (--all). Owner-only script; high cost.',
  '{"script_slug":"embed_codebase_full"}',
  '{"type":"object"}',
  '{}',
  'high',
  1,
  1,
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agentsam.embed.describe_only_done',
  'process',
  'passthrough',
  'Describe-only complete',
  'No upsert when embed_scope=describe_only.',
  '{"note":"describe_only_complete"}',
  '{}',
  '{}',
  'low',
  0,
  1,
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
),
(
  'agentsam.embed.emit_progress',
  'output',
  'ui_emit',
  'Emit embed workflow timeline',
  'Dashboard timeline event for codebase embed pipeline.',
  '{"event_type":"codebase_embed_progress"}',
  '{}',
  '{}',
  'low',
  0,
  1,
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

UPDATE agentsam_workflow_handlers
SET handler_config_json = '{"sql":"SELECT m.key AS memory_key, m.value AS playbook_json, v.id AS registry_id, v.index_name, v.binding_name, v.dimensions, v.metric FROM agentsam_memory m LEFT JOIN vectorize_index_registry v ON v.id = ''vidx_agentsam_vectors'' WHERE m.key = ''schema_agentsam_vectorize_embed_pipeline'' LIMIT 1","params":[]}',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.embed.load_playbook';

UPDATE agentsam_workflow_handlers
SET handler_config_json = '{"script_slug":"embed_codebase_describe"}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.embed.describe_validate';

UPDATE agentsam_workflow_handlers
SET handler_config_json = '{"script_slug":"index_codebase_live"}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.embed.embed_priority';

UPDATE agentsam_workflow_handlers
SET handler_config_json = '{"script_slug":"embed_codebase_full"}', requires_approval = 1, risk_level = 'high', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'agentsam.embed.embed_full';

-- ─── Workflow registry ───────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global
) VALUES (
  'wf_agentsam_codebase_embed',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'agentsam_codebase_embed',
  'Agent Sam — Codebase embed (AGENTSAMVECTORIZE)',
  'Dimension-locked pipeline: load D1 playbook → describe/probe index → branch on embed_scope → run priority or full embed scripts → complete. Uses inneranimalmedia-vectors; same model at index and query time. Never mix 1024 AutoRAG lane.',
  'maintenance',
  'manual',
  'agent',
  'codebase_embed',
  'medium',
  0,
  1,
  3600000,
  '{"requires_describe_before_embed":true,"requires_matching_embed_model":true,"playbook_memory_key":"schema_agentsam_vectorize_embed_pipeline"}',
  '{"source":"migrations/394_wf_agentsam_codebase_embed.sql","entry_node_key":"start","playbook_memory_key":"schema_agentsam_vectorize_embed_pipeline","registry_id":"vidx_agentsam_vectors","binding":"AGENTSAMVECTORIZE","index_name":"inneranimalmedia-vectors","surface_routes":{"database":[{"intent":"*","workflow_key":"agentsam_codebase_embed"}],"agent":[{"intent":"embed","workflow_key":"agentsam_codebase_embed"},{"intent":"vectorize","workflow_key":"agentsam_codebase_embed"}],"dashboard":[{"intent":"codebase","workflow_key":"agentsam_codebase_embed"}]},"default_input":{"embed_scope":"priority","workspace_id":"ws_inneranimalmedia"}}',
  1,
  1
);

UPDATE agentsam_workflows
SET
  display_name = 'Agent Sam — Codebase embed (AGENTSAMVECTORIZE)',
  description = 'Dimension-locked pipeline: load D1 playbook → describe/probe index → branch on embed_scope → run priority or full embed scripts → complete. Uses inneranimalmedia-vectors; same model at index and query time.',
  metadata_json = '{"source":"migrations/394_wf_agentsam_codebase_embed.sql","entry_node_key":"start","playbook_memory_key":"schema_agentsam_vectorize_embed_pipeline","registry_id":"vidx_agentsam_vectors","binding":"AGENTSAMVECTORIZE","index_name":"inneranimalmedia-vectors","surface_routes":{"database":[{"intent":"*","workflow_key":"agentsam_codebase_embed"}],"agent":[{"intent":"embed","workflow_key":"agentsam_codebase_embed"},{"intent":"vectorize","workflow_key":"agentsam_codebase_embed"}],"dashboard":[{"intent":"codebase","workflow_key":"agentsam_codebase_embed"}]},"default_input":{"embed_scope":"priority","workspace_id":"ws_inneranimalmedia"}}',
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'wf_agentsam_codebase_embed';

-- ─── Nodes ───────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
(
  'wnode_ace_start', 'wf_agentsam_codebase_embed', 'start', 'trigger',
  'Start', 'Manual trigger; pass embed_scope in run input.',
  'workflow.trigger.manual',
  '{"type":"object","properties":{"embed_scope":{"type":"string","default":"priority"},"workspace_id":{"type":"string"}}}',
  '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10
),
(
  'wnode_ace_load', 'wf_agentsam_codebase_embed', 'load_playbook', 'db_query',
  'Load playbook', 'D1 memory + vectorize_index_registry dimensions.',
  'agentsam.embed.load_playbook',
  '{}', '{}', 15000, '{"max_retries":1}', '{"required":true}', 'low', 0, 1, 20
),
(
  'wnode_ace_describe', 'wf_agentsam_codebase_embed', 'describe_validate', 'process',
  'Describe smoke', 'Probe index dimensions before spend.',
  'agentsam.embed.describe_validate',
  '{}', '{}', 120000, '{"max_retries":0}', '{"required":true}', 'low', 0, 1, 30
),
(
  'wnode_ace_scope', 'wf_agentsam_codebase_embed', 'pick_scope', 'branch',
  'Pick scope', 'priority | full | describe_only from input.',
  'agentsam.embed.pick_scope',
  '{"type":"object","properties":{"embed_scope":{"type":"string"}}}',
  '{"type":"object","properties":{"branch":{"type":"string"}}}',
  5000, '{"max_retries":0}', '{"branch_field":"embed_scope"}', 'low', 0, 1, 40
),
(
  'wnode_ace_priority', 'wf_agentsam_codebase_embed', 'embed_priority', 'process',
  'Priority embed', 'index-codebase-live.py',
  'agentsam.embed.embed_priority',
  '{}', '{}', 1800000, '{"max_retries":0}', '{}', 'medium', 0, 1, 50
),
(
  'wnode_ace_full', 'wf_agentsam_codebase_embed', 'embed_full', 'process',
  'Full embed', 'embed-codebase.py --all',
  'agentsam.embed.embed_full',
  '{}', '{}', 3600000, '{"max_retries":0}', '{}', 'high', 1, 1, 60
),
(
  'wnode_ace_skip', 'wf_agentsam_codebase_embed', 'describe_only_done', 'process',
  'Describe only', 'Skip upsert paths.',
  'agentsam.embed.describe_only_done',
  '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 55
),
(
  'wnode_ace_emit', 'wf_agentsam_codebase_embed', 'emit_progress', 'output',
  'Emit UI', 'Timeline event.',
  'agentsam.embed.emit_progress',
  '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 70
),
(
  'wnode_ace_complete', 'wf_agentsam_codebase_embed', 'complete_run', 'db_query',
  'Complete run', 'Mark agentsam_workflow_runs completed.',
  'agentsam.workflow.complete_run',
  '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 80
);

-- ─── Edges (from_status contract) ──────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_ace_01', 'wf_agentsam_codebase_embed', 'start', 'load_playbook', 'always', NULL, 0, 0, 'start → load'),
('wedge_ace_02', 'wf_agentsam_codebase_embed', 'load_playbook', 'describe_validate', 'status', '{"from_status":"success"}', 0, 0, 'loaded'),
('wedge_ace_02f', 'wf_agentsam_codebase_embed', 'load_playbook', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'load failed'),
('wedge_ace_03', 'wf_agentsam_codebase_embed', 'describe_validate', 'pick_scope', 'status', '{"from_status":"success"}', 0, 0, 'describe ok'),
('wedge_ace_03f', 'wf_agentsam_codebase_embed', 'describe_validate', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'describe failed'),
('wedge_ace_04p', 'wf_agentsam_codebase_embed', 'pick_scope', 'embed_priority', 'branch', '{"field":"branch","op":"eq","value":"priority"}', 0, 0, 'scope=priority'),
('wedge_ace_04f', 'wf_agentsam_codebase_embed', 'pick_scope', 'embed_full', 'branch', '{"field":"branch","op":"eq","value":"full"}', 0, 0, 'scope=full'),
('wedge_ace_04d', 'wf_agentsam_codebase_embed', 'pick_scope', 'describe_only_done', 'branch', '{"field":"branch","op":"eq","value":"describe_only"}', 0, 0, 'scope=describe_only'),
('wedge_ace_04def', 'wf_agentsam_codebase_embed', 'pick_scope', 'embed_priority', 'branch', '{"field":"branch","op":"eq","value":"default"}', 1, 1, 'default→priority'),
('wedge_ace_05p', 'wf_agentsam_codebase_embed', 'embed_priority', 'emit_progress', 'status', '{"from_status":"success"}', 0, 0, 'priority done'),
('wedge_ace_05pf', 'wf_agentsam_codebase_embed', 'embed_priority', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'priority failed'),
('wedge_ace_06f', 'wf_agentsam_codebase_embed', 'embed_full', 'emit_progress', 'status', '{"from_status":"success"}', 0, 0, 'full done'),
('wedge_ace_06ff', 'wf_agentsam_codebase_embed', 'embed_full', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'full failed'),
('wedge_ace_07d', 'wf_agentsam_codebase_embed', 'describe_only_done', 'emit_progress', 'always', NULL, 0, 0, 'describe only'),
('wedge_ace_08', 'wf_agentsam_codebase_embed', 'emit_progress', 'complete_run', 'always', NULL, 0, 0, 'finish');

-- ─── Command palette (agentsam_commands) ─────────────────────────────────────

INSERT OR IGNORE INTO agentsam_commands (
  id, workspace_id, tenant_id, slug, display_name, description, pattern, pattern_type,
  mapped_command, category, risk_level, requires_confirmation, show_in_slash,
  workflow_key, tool_key, router_type, is_active, sort_order, internal_seo
) VALUES
(
  'cmd_embed_codebase_priority',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'embed-codebase-priority',
  'Embed codebase (priority snapshot)',
  'Run wf_agentsam_codebase_embed with embed_scope=priority after describe smoke.',
  'embed codebase priority',
  'contains',
  'workflow:agentsam_codebase_embed',
  'research',
  'medium',
  1,
  1,
  'agentsam_codebase_embed',
  NULL,
  'workflow',
  1,
  41,
  'embed AGENTSAMVECTORIZE priority index-codebase-live'
),
(
  'cmd_embed_codebase_describe',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'embed-codebase-describe',
  'Validate Vectorize dimensions (smoke)',
  'Describe-only path: no upsert, validates dimension/model match.',
  'vectorize describe smoke',
  'contains',
  'python3 scripts/embed-codebase.py --describe-only',
  'research',
  'low',
  0,
  1,
  NULL,
  'agentsam_vectorize_describe',
  'tool',
  1,
  40,
  'AGENTSAMVECTORIZE describe inneranimalmedia-vectors'
);

UPDATE agentsam_commands
SET workflow_key = 'agentsam_codebase_embed', router_type = 'workflow', updated_at = datetime('now')
WHERE id = 'cmd_embed_codebase_priority';

UPDATE agentsam_commands
SET tool_key = 'agentsam_vectorize_describe', router_type = 'tool', updated_at = datetime('now')
WHERE id = 'cmd_embed_codebase_describe';

-- ─── Capability alias ──────────────────────────────────────────────────────────

INSERT INTO agentsam_capability_aliases (
  abstract_capability, match_kind, match_value, capability_lane,
  priority, requires_approval, is_mutation, rationale
) VALUES
  ('embed.codebase.workflow', 'workflow_key', 'agentsam_codebase_embed', 'research', 5, 0, 1, 'Orchestrated AGENTSAMVECTORIZE codebase embed pipeline.')
ON CONFLICT (abstract_capability, match_kind, match_value) DO UPDATE SET
  capability_lane = excluded.capability_lane,
  priority = excluded.priority,
  is_mutation = excluded.is_mutation,
  rationale = excluded.rationale,
  is_active = 1,
  updated_at = datetime('now');
