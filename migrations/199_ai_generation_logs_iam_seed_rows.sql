-- 199: ai_generation_logs — seed rows documenting IAM TOOLS / pipeline D1 work (migration_seed).
-- INSERT OR IGNORE by id.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/199_ai_generation_logs_iam_seed_rows.sql

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_iam_workspace_186_188',
  'migration_seed',
  'D1: workspaces ws_agentsandbox; workspace_projects; workspace_settings; workspace_audit_log seed',
  'cursor_agent',
  'Seeded ws_agentsandbox (TOOLS origin), wp_agentsandbox_iam_shell, wp_inneranimalmedia, audit wal_cursor_wp_seed_20260331.',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["186_ws_agentsandbox_workspace.sql","187_workspace_projects_wp_inneranimalmedia.sql","188_workspace_audit_log_cursor_workspace_seed.sql"]}',
  'migration_seed',
  'ws_agentsandbox',
  '["ws_agentsandbox","wp_agentsandbox_iam_shell","wp_inneranimalmedia","wal_cursor_wp_seed_20260331"]'
);

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_workflows_189',
  'migration_seed',
  'D1: workflows table wf_iam_* pipeline definitions (artifact through promote)',
  'cursor_agent',
  'Six rows INSERT OR IGNORE: wf_iam_artifact_init, monaco_save, excalidraw_save, playwright_validate, approval_gate, promote_prod.',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["189_workflows_iam_autonomous_pipeline.sql"]}',
  'migration_seed',
  'ws_inneranimalmedia',
  '["wf_iam_artifact_init","wf_iam_monaco_save","wf_iam_excalidraw_save","wf_iam_playwright_validate","wf_iam_approval_gate","wf_iam_promote_prod"]'
);

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_vectorize_registry_191_193',
  'migration_seed',
  'D1: vectorize_index_registry TOOLS agent workspace label; binding_name TOOLS',
  'cursor_agent',
  'vidx_tools_agent_workspace: registry for tools bucket (not AutoRAG). 193 aligned binding_name TOOLS with env.TOOLS.',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["191_vectorize_index_registry_d1_rag.sql","192_vectorize_registry_tools_agent_workspace_label.sql","193_vectorize_registry_binding_tools.sql"]}',
  'migration_seed',
  'ws_inneranimalmedia',
  '["vidx_tools_agent_workspace"]'
);

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_agent_workspace_state_194',
  'migration_seed',
  'D1: agent_conversations + agent_workspace_state for IAM TOOLS shell',
  'cursor_agent',
  'conv_iam_tools_agent_workspace; state_iam_tools_agent_workspace; state_json links registry and R2 prefixes.',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["194_agent_workspace_state_iam_tools.sql"]}',
  'migration_seed',
  'ws_agentsandbox',
  '["conv_iam_tools_agent_workspace","state_iam_tools_agent_workspace"]'
);

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_code_index_job_195',
  'migration_seed',
  'D1: agentsam_code_index_job cij_iam_tools_agent_workspace',
  'cursor_agent',
  'Idle index slot for iam_tools_agent_workspace workspace_id (d1_cosine backend).',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["195_agentsam_code_index_job_iam_tools.sql"]}',
  'migration_seed',
  'ws_inneranimalmedia',
  '["cij_iam_tools_agent_workspace"]'
);

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_project_context_196',
  'migration_seed',
  'D1: agentsam_project_context ctx_iam_tools_agent_workspace',
  'cursor_agent',
  'Platform context row: tables, routes, R2, CIDI, started_at 1775005200.',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["196_agentsam_project_context_iam_tools.sql"]}',
  'migration_seed',
  'ws_inneranimalmedia',
  '["ctx_iam_tools_agent_workspace"]'
);

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_skills_197',
  'migration_seed',
  'D1: agentsam_skill six IAM pipeline skills (slash_trigger iam-*)',
  'cursor_agent',
  'skill_iam_tools_r2_workspace through skill_iam_agentsam_project_context.',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["197_agentsam_skill_iam_pipeline.sql"]}',
  'migration_seed',
  'tenant_sam_primeaux',
  '["skill_iam_tools_r2_workspace","skill_iam_cidi_three_tier","skill_iam_workflow_l123","skill_iam_playwright_jobs","skill_iam_approval_gate","skill_iam_agentsam_project_context"]'
);

INSERT OR IGNORE INTO ai_generation_logs (
  id, generation_type, prompt, model, response_text, status, created_by, created_at, completed_at, tenant_id,
  metadata_json, source_kind, workspace_id, related_ids_json
) VALUES (
  'aigl_seed_workspace_notes_190',
  'migration_seed',
  'D1: workspace_notes + workspace_projects descriptions (IAM plan, start date)',
  'cursor_agent',
  'workspace_notes for ws_inneranimalmedia; start_date 2026-03-31 20:00 on wp projects.',
  'completed',
  'sam_primeaux',
  unixepoch(),
  unixepoch(),
  'tenant_sam_primeaux',
  '{"migrations":["190_workspace_notes_and_projects_iam_plan.sql"]}',
  'migration_seed',
  'ws_inneranimalmedia',
  '["wp_agentsandbox_iam_shell","wp_inneranimalmedia"]'
);
