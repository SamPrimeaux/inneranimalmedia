-- 202: Fix projects row for proj_iam_tools_agent_workspace — migration 201 used project_type/status outside CHECK constraints, so INSERT OR IGNORE skipped projects (ai_projects + ai_project_context_config applied).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/202_projects_iam_tools_fix_projects_check.sql

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
