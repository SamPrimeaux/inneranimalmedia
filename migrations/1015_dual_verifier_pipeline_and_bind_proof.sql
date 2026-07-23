-- 1015: Dual-verifier pipeline (N-of-M gate) + standing local-bind proof ticket
-- + soft-consolidate duplicate architect / agent-sam orchestrator profiles.
-- Zero new tables. Ticket status "resolved" in design → in_review (shipped still via assert).

-- ── Standing ticket for append-only local-bind proofs ────────────────────────
INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority,
  doc_path, required_pass_count, consecutive_pass_count, created_at, updated_at
) VALUES (
  'tkt_local_workspace_bind_continuity',
  'Local Explorer → real workspace bind (Mac↔device continuity)',
  'active',
  'Standing ticket for append-only local-bind proof receipts (agentsam_ticket_events)',
  'inneranimalmedia',
  'workspace',
  '["continuity","local-bind","proof"]',
  'p0',
  'scripts/prove-local-workspace-bind.mjs',
  2,
  0,
  unixepoch(),
  unixepoch()
);

-- ── Soft-consolidate duplicate profiles (keep canonical; deactivate extras) ──
-- Canonical architect: platform-global mcp_zone (mcp_zone_architect)
UPDATE agentsam_subagent_profile
SET is_active = 0,
    updated_at = unixepoch(),
    description = COALESCE(description, '') || ' [superseded by mcp_zone_architect / slug=architect platform-global]'
WHERE id = 'sub_architect_001' AND slug = 'architect' AND agent_type = 'custom';

-- Canonical orchestrator: asp_agent_sam (builtin_orchestrator, slug=agent-sam)
UPDATE agentsam_subagent_profile
SET is_active = 0,
    updated_at = unixepoch(),
    description = COALESCE(description, '') || ' [superseded by asp_agent_sam / slug=agent-sam]'
WHERE id = 'subagent_core' AND slug = 'agent_sam_core';

-- Point agent-sam spawn list at explorer / architect / reviewers / d1-audit (idempotent merge)
UPDATE agentsam_subagent_profile
SET spawnable_agent_slugs = '["code-mapper","architect","code-reviewer","d1-audit","codex-worker","commerce_validator"]',
    can_spawn_subagents = 1,
    max_spawn_depth = COALESCE(NULLIF(max_spawn_depth, 0), 2),
    updated_at = unixepoch()
WHERE id = 'asp_agent_sam' AND slug = 'agent-sam';

-- ── Gate handler (executor_kind=agent_step → dual-verifier-gate.js) ─────────
INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, input_schema_json, quality_gate_json,
  risk_level, requires_approval, is_active, tenant_id, workspace_id,
  created_at, updated_at
) VALUES (
  'agentsam.gate.dual_verifier_agree',
  'eval',
  'agent_step',
  'Dual verifier N-of-M gate',
  'Requires ≥2 independent verifier outputs with primary evidence that all pass. Disagreement fails the node (ok=false) and appends both notes to agentsam_ticket_events. Never sets shipped.',
  '{"handler_key":"agentsam.gate.dual_verifier_agree","min_agree":2,"require_evidence":true}',
  '{"type":"object","properties":{"ticket_id":{"type":"string"},"verifier_a":{"type":"object"},"verifier_b":{"type":"object"},"verifiers":{"type":"array"},"min_agree":{"type":"integer","default":2}}}',
  '{"min_agree":2,"require_primary_evidence":true}',
  'high',
  0,
  1,
  NULL,
  NULL,
  datetime('now'),
  datetime('now')
);

-- ── Workflow: explore → plan → implement → verifier×2 → gate ────────────────
INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global,
  created_at, updated_at
) VALUES (
  'wf_dual_verifier_pipeline',
  NULL,
  NULL,
  'dual_verifier_pipeline',
  'Dual-verifier engineering pipeline',
  'code-mapper → architect → implementer → code-reviewer×2 (independent evidence) → N-of-M gate. Gate flips ticket to in_review only when both verifiers agree; never ships.',
  'agent',
  'manual',
  'agent',
  'agent_workflow',
  'high',
  0,
  2,
  1800000,
  '{"min_agree":2,"require_primary_evidence":true,"never_auto_ship":true}',
  '{"entry_node_key":"start","profiles":{"explore":"code-mapper","plan":"architect","implement":"codex-worker","verifier":"code-reviewer"},"verifier_independence":"Each verifier must pull primary evidence (query/grep/live cmd). Graph walk is sequential (executor picks one edge); independence is evidence, not wall-clock parallel.","gate_handler":"agentsam.gate.dual_verifier_agree","source":"migrations/1015_dual_verifier_pipeline_and_bind_proof.sql"}',
  1,
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order,
  handler_config_json
) VALUES
(
  'wnode_dvp_start', 'wf_dual_verifier_pipeline', 'start', 'trigger',
  'Start', 'Manual trigger', 'workflow.trigger.manual',
  '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10,
  '{}'
),
(
  'wnode_dvp_explore', 'wf_dual_verifier_pipeline', 'explore', 'agent',
  'Explore (code-mapper)', 'Scoped file/table list as evidence — paths/rows, not summaries',
  NULL,
  '{}',
  '{"type":"object","required":["paths_or_rows"],"properties":{"paths_or_rows":{"type":"array"},"tables":{"type":"array"}}}',
  300000, '{"max_retries":1}', '{}', 'medium', 0, 1, 20,
  '{"subagent_slug":"code-mapper","role":"explorer","requires_evidence":true}'
),
(
  'wnode_dvp_plan', 'wf_dual_verifier_pipeline', 'plan', 'agent',
  'Plan (architect)', 'Consume explorer raw output; produce implementation plan',
  NULL,
  '{}', '{}', 300000, '{"max_retries":1}', '{}', 'medium', 0, 1, 30,
  '{"subagent_slug":"architect","role":"planner","consume_node":"explore"}'
),
(
  'wnode_dvp_implement', 'wf_dual_verifier_pipeline', 'implement', 'agent',
  'Implement (codex-worker)', 'Apply the plan',
  NULL,
  '{}', '{}', 600000, '{"max_retries":1}', '{}', 'high', 0, 1, 40,
  '{"subagent_slug":"codex-worker","role":"implementer","consume_node":"plan"}'
),
(
  'wnode_dvp_vfy_a', 'wf_dual_verifier_pipeline', 'verifier_a', 'agent',
  'Verifier A (code-reviewer)', 'Independent pass/fail with primary evidence attached',
  NULL,
  '{}',
  '{"type":"object","required":["verdict","evidence"],"properties":{"verdict":{"enum":["pass","fail"]},"evidence":{"type":"string"}}}',
  300000, '{"max_retries":0}',
  '{"require_primary_evidence":true}', 'high', 0, 1, 50,
  '{"subagent_slug":"code-reviewer","role":"verifier","instance":"a","requires_primary_evidence":true,"no_rewrites":true}'
),
(
  'wnode_dvp_vfy_b', 'wf_dual_verifier_pipeline', 'verifier_b', 'agent',
  'Verifier B (code-reviewer)', 'Second independent pass/fail with primary evidence',
  NULL,
  '{}',
  '{"type":"object","required":["verdict","evidence"],"properties":{"verdict":{"enum":["pass","fail"]},"evidence":{"type":"string"}}}',
  300000, '{"max_retries":0}',
  '{"require_primary_evidence":true}', 'high', 0, 1, 60,
  '{"subagent_slug":"code-reviewer","role":"verifier","instance":"b","requires_primary_evidence":true,"no_rewrites":true}'
),
(
  'wnode_dvp_gate', 'wf_dual_verifier_pipeline', 'dual_gate', 'eval',
  'N-of-M dual verifier gate', 'Both verifiers must agree with evidence; else fail',
  'agentsam.gate.dual_verifier_agree',
  '{"type":"object","properties":{"ticket_id":{"type":"string"}}}',
  '{"type":"object","properties":{"passed":{"type":"boolean"},"agree_count":{"type":"integer"}}}',
  60000, '{"max_retries":0}',
  '{"min_agree":2,"require_primary_evidence":true,"never_auto_ship":true}', 'high', 0, 1, 70,
  '{"handler_key":"agentsam.gate.dual_verifier_agree","min_agree":2}'
),
(
  'wnode_dvp_done', 'wf_dual_verifier_pipeline', 'done', 'output',
  'Done', 'Pipeline complete (ticket in_review if gate passed)',
  'workflow.output.final',
  '{}', '{}', 15000, '{"max_retries":0}', '{}', 'low', 0, 1, 80,
  '{}'
);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_dvp_01', 'wf_dual_verifier_pipeline', 'start', 'explore', 'always', NULL, 0, 0, NULL),
('wedge_dvp_02', 'wf_dual_verifier_pipeline', 'explore', 'plan', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_dvp_03', 'wf_dual_verifier_pipeline', 'plan', 'implement', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_dvp_04', 'wf_dual_verifier_pipeline', 'implement', 'verifier_a', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_dvp_05', 'wf_dual_verifier_pipeline', 'verifier_a', 'verifier_b', 'status', '{"from_status":"success"}', 0, 0, 'independent evidence pull'),
('wedge_dvp_06', 'wf_dual_verifier_pipeline', 'verifier_b', 'dual_gate', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_dvp_07', 'wf_dual_verifier_pipeline', 'dual_gate', 'done', 'status', '{"from_status":"success"}', 0, 0, NULL);

INSERT OR IGNORE INTO agentsam_ticket_events (
  id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
) VALUES (
  'tevt_dvp_wired_1015',
  'tkt_phase_gate_stop',
  'note',
  NULL,
  NULL,
  '2026-07-22: Wired wf_dual_verifier_pipeline + agentsam.gate.dual_verifier_agree (N-of-M). Soft-deactivated duplicate architect custom + agent_sam_core. Local-bind proofs append to tkt_local_workspace_bind_continuity.',
  NULL,
  unixepoch()
);
