-- 201: projects + ai_projects + ai_project_context_config — IAM TOOLS agent workspace (TOOLS R2, workflows, agentsam context).
-- Links agentsam_project_context id ctx_iam_tools_agent_workspace (migration 196).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/201_projects_ai_iam_tools_agent_workspace.sql

INSERT OR IGNORE INTO projects (
  id,
  name,
  client_name,
  project_type,
  status,
  tenant_id,
  domain,
  description,
  metadata_json,
  tags_json,
  priority
) VALUES (
  'proj_iam_tools_agent_workspace',
  'IAM TOOLS agent workspace',
  'Inner Animal Media',
  'internal-tool',
  'development',
  'tenant_sam_primeaux',
  'inneranimalmedia.com',
  'Monaco, Excalidraw, and shell artifacts in TOOLS R2 (tools.inneranimalmedia.com). Workflows wf_iam_*; CIDI; agentsam_project_context ctx_iam_tools_agent_workspace.',
  '{"agentsam_project_context_id":"ctx_iam_tools_agent_workspace","workspace_ids":["ws_agentsandbox","ws_inneranimalmedia"],"workspace_project_ids":["wp_agentsandbox_iam_shell","wp_inneranimalmedia"],"vectorize_index_registry_id":"vidx_tools_agent_workspace"}',
  '["iam","tools","agent-workspace","cidi","workflows"]',
  88
);

INSERT OR IGNORE INTO ai_projects (
  id,
  name,
  description,
  phase,
  status,
  ai_provider,
  created_by,
  metadata
) VALUES (
  'proj_iam_tools_agent_workspace',
  'IAM TOOLS agent workspace',
  'AI project record for the TOOLS-bucket agent workspace: L1-L3 workflows, Playwright jobs, approval gate, promote. Same id as projects.proj_iam_tools_agent_workspace.',
  'build',
  'active',
  'claude',
  'sam_primeaux',
  '{"projects_table_id":"proj_iam_tools_agent_workspace","agentsam_project_context_id":"ctx_iam_tools_agent_workspace"}'
);

INSERT OR IGNORE INTO ai_project_context_config (
  id,
  tenant_id,
  project_id,
  route_pattern,
  context_type,
  context_json,
  version,
  created_at,
  updated_at,
  enabled
) VALUES (
  'ctx_iam_tools_dashboard_agent',
  'tenant_sam_primeaux',
  'proj_iam_tools_agent_workspace',
  '/dashboard/agent',
  'dashboard',
  '{"blocks":["agent","mcp","terminal","workflows","tools_r2"],"agentsam_project_context_id":"ctx_iam_tools_agent_workspace","workspace_ids":["ws_agentsandbox","ws_inneranimalmedia"],"registry_id":"vidx_tools_agent_workspace","tools_public_origin":"https://tools.inneranimalmedia.com","shell_html":"dashboard/iam-workspace-shell.html","provider_intent":{"lane":"build","provider":"anthropic"}}',
  1,
  unixepoch(),
  unixepoch(),
  1
);
