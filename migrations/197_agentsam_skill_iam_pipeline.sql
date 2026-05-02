-- 197: agentsam_skill — IAM TOOLS workspace, CIDI, workflows, Playwright, approval, project context.
-- INSERT OR IGNORE by fixed id.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/197_agentsam_skill_iam_pipeline.sql

INSERT OR IGNORE INTO agentsam_skill (
  id, user_id, name, description, file_path, scope, workspace_id, content_markdown, metadata_json,
  is_active, icon, access_mode, sort_order, slash_trigger, globs, always_apply, version, tags,
  created_at, updated_at
) VALUES (
  'skill_iam_tools_r2_workspace',
  'sam_primeaux',
  'IAM TOOLS R2 workspace',
  'Use env.TOOLS (tools bucket) for Monaco, Excalidraw, and shell HTML; not AutoRAG.',
  'skills/iam-tools-r2-workspace/SKILL.md',
  'workspace',
  'tenant_sam_primeaux',
  '# IAM TOOLS R2 workspace\n\n- Worker binding: env.TOOLS. Public: tools.inneranimalmedia.com.\n- Registry: vectorize_index_registry id vidx_tools_agent_workspace, binding_name TOOLS.\n- Key prefixes: monaco/, excalidraw/, code/iam-workspace-shell.html.\n- Do not use MCP r2_write for automation when degraded; use worker-side R2 put.\n- Distinct from VECTORIZE_INDEX AutoRAG (vidx_autorag).',
  '{"project_key":"iam_tools_agent_workspace","registry_id":"vidx_tools_agent_workspace"}',
  1,
  '',
  'read_write',
  30,
  'iam-tools',
  '["dashboard/iam-workspace-shell.html","tools/**"]',
  0,
  1,
  '["iam","tools","r2","monaco","excalidraw"]',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_skill (
  id, user_id, name, description, file_path, scope, workspace_id, content_markdown, metadata_json,
  is_active, icon, access_mode, sort_order, slash_trigger, globs, always_apply, version, tags,
  created_at, updated_at
) VALUES (
  'skill_iam_cidi_three_tier',
  'sam_primeaux',
  'CIDI three-tier build',
  'Sandbox build, validate benchmarks, promote to prod; never skip tiers.',
  'skills/iam-cidi-three-tier/SKILL.md',
  'workspace',
  'tenant_sam_primeaux',
  '# CIDI three-tier\n\n- T1: inneranimal-dashboard + agent-sam-sandbox-cidi (deploy-sandbox.sh after build:vite-only).\n- T2: benchmark-full.sh sandbox; Playwright against sandbox URLs.\n- T3: promote-to-prod.sh only after gates; Sam deploy approved for worker.\n- Promote does not run inside Worker; CI or operator shell.',
  '{"pipelines":["sandbox","validate","prod"]}',
  1,
  '',
  'read_write',
  31,
  'iam-cidi',
  '["scripts/deploy-sandbox.sh","scripts/promote-to-prod.sh","scripts/benchmark-full.sh"]',
  0,
  1,
  '["cidi","deploy","sandbox","prod"]',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_skill (
  id, user_id, name, description, file_path, scope, workspace_id, content_markdown, metadata_json,
  is_active, icon, access_mode, sort_order, slash_trigger, globs, always_apply, version, tags,
  created_at, updated_at
) VALUES (
  'skill_iam_workflow_l123',
  'sam_primeaux',
  'Workflow levels L1-L3',
  'Definitions, execution ledger, governance and approval.',
  'skills/iam-workflow-l123/SKILL.md',
  'workspace',
  'tenant_sam_primeaux',
  '# Workflow levels\n\n- L1: workflows + mcp_workflows + agent_commands definitions.\n- L2: workflow_runs, workflow_artifacts, playwright_jobs, queue.\n- L3: approved_at, awaiting_approval; status approved not in CHECK until migration; use approved_at for gate.\n- workflow_runs FK targets mcp_workflows; workflows table holds wf_iam_* JSON specs.\n- Slash /workflow uses mcp workflow ids; align seeds.',
  '{"wf_iam":["artifact_init","monaco_save","excalidraw_save","playwright_validate","approval_gate","promote_prod"]}',
  1,
  '',
  'read_write',
  32,
  'iam-workflow',
  '["migrations/189_workflows_iam_autonomous_pipeline.sql"]',
  0,
  1,
  '["workflow","governance","approval"]',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_skill (
  id, user_id, name, description, file_path, scope, workspace_id, content_markdown, metadata_json,
  is_active, icon, access_mode, sort_order, slash_trigger, globs, always_apply, version, tags,
  created_at, updated_at
) VALUES (
  'skill_iam_playwright_jobs',
  'sam_primeaux',
  'Playwright validation jobs',
  'playwright_jobs + MYBROWSER queue; url column; assertions in input_params_json.',
  'skills/iam-playwright-jobs/SKILL.md',
  'workspace',
  'tenant_sam_primeaux',
  '# Playwright jobs\n\n- Table: playwright_jobs. Required: id, job_type screenshot, url (not target_url).\n- Queue consumer: MYBROWSER, putAgentBrowserScreenshotToR2; result_url on success.\n- Assertions evaluation not fully in queue yet; extend worker if needed.\n- Metadata: store workflow_run_id in input_params_json.',
  '{"job_type":"screenshot"}',
  1,
  '',
  'read_write',
  33,
  'iam-playwright',
  '["worker.js"]',
  0,
  1,
  '["playwright","browser","validation"]',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_skill (
  id, user_id, name, description, file_path, scope, workspace_id, content_markdown, metadata_json,
  is_active, icon, access_mode, sort_order, slash_trigger, globs, always_apply, version, tags,
  created_at, updated_at
) VALUES (
  'skill_iam_approval_gate',
  'sam_primeaux',
  'Admin approval gate',
  'awaiting_approval, approved_at, no status=approved without migration.',
  'skills/iam-approval-gate/SKILL.md',
  'workspace',
  'tenant_sam_primeaux',
  '# Approval gate\n\n- Set workflow_runs status awaiting_approval; notify human.\n- Approval: set approved_at; transition status to success or running for next phase.\n- Do not rely on d1_poll; use PATCH or client poll.\n- Promote only after gate and deploy approved.',
  '{}',
  1,
  '',
  'read_write',
  34,
  'iam-approval',
  '[]',
  0,
  1,
  '["approval","governance"]',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_skill (
  id, user_id, name, description, file_path, scope, workspace_id, content_markdown, metadata_json,
  is_active, icon, access_mode, sort_order, slash_trigger, globs, always_apply, version, tags,
  created_at, updated_at
) VALUES (
  'skill_iam_agentsam_project_context',
  'sam_primeaux',
  'agentsam_project_context usage',
  'Read ctx_iam_tools_agent_workspace and linked D1 rows for IAM TOOLS work.',
  'skills/iam-agentsam-project-context/SKILL.md',
  'workspace',
  'tenant_sam_primeaux',
  '# Project context\n\n- Row id ctx_iam_tools_agent_workspace; project_key iam_tools_agent_workspace.\n- Links: vectorize_index_registry, agent_workspace_state state_iam_tools_agent_workspace, agentsam_code_index_job cij_iam_tools_agent_workspace, workspaces ws_agentsandbox.\n- Use for prompts when editing TOOLS shell or pipeline code.',
  '{"context_id":"ctx_iam_tools_agent_workspace"}',
  1,
  '',
  'read_write',
  35,
  'iam-context',
  '[]',
  0,
  1,
  '["context","d1","agentsam"]',
  datetime('now'),
  datetime('now')
);
