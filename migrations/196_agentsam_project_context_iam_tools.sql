-- 196: agentsam_project_context — IAM TOOLS agent workspace (R2 tools bucket, shell, CIDI alignment).
-- started_at unix: 2026-03-31 20:00 America/Chicago (1775005200).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/196_agentsam_project_context_iam_tools.sql

INSERT OR IGNORE INTO agentsam_project_context (
  id,
  project_key,
  project_name,
  project_type,
  status,
  priority,
  description,
  goals,
  constraints,
  current_blockers,
  primary_tables,
  secondary_tables,
  workers_involved,
  r2_buckets_involved,
  domains_involved,
  mcp_services_involved,
  key_files,
  related_routes,
  started_at,
  created_by,
  notes,
  created_at,
  updated_at
) VALUES (
  'ctx_iam_tools_agent_workspace',
  'iam_tools_agent_workspace',
  'IAM TOOLS agent workspace (Monaco, Excalidraw, shell)',
  'platform',
  'active',
  88,
  'Agent-facing workspace that stores artifacts in the tools R2 bucket (Worker binding env.TOOLS, public tools.inneranimalmedia.com): iam-workspace-shell.html, monaco/ and excalidraw/ prefixes. Aligned with vectorize_index_registry vidx_tools_agent_workspace (not AutoRAG). Part of L1-L3 workflow and T1-T3 CIDI planning.',
  'Wire save paths from shell to TOOLS; workflow_artifacts rows; optional Playwright validation; approval gate before promote. Index job cij_iam_tools_agent_workspace. Mirror key workflow ids wf_iam_* in runner.',
  'Do not rename wrangler TOOLS binding. MCP r2_write degraded use worker R2. Locked OAuth and wrangler.production.toml per repo rules.',
  'Indexer and orchestration hooks not fully wired; depends on worker routes and promote path.',
  '["vectorize_index_registry","workflow_artifacts","workflow_runs","agentsam_code_index_job","agent_workspace_state","workspaces","workspace_projects"]',
  '["agent_commands","workflows","mcp_workflows","playwright_jobs"]',
  '["inneranimalmedia"]',
  '["tools","agent-sam"]',
  '["tools.inneranimalmedia.com","inneranimalmedia.com"]',
  '["inneranimalmedia-mcp-server"]',
  '["dashboard/iam-workspace-shell.html","agent-dashboard/src/AgentDashboard.jsx","worker.js"]',
  '["POST /api/agent/chat","POST /api/agent/commands/execute","POST /api/agent/workflows/trigger","GET /api/commands"]',
  1775005200,
  'sam_primeaux',
  'Registry id vidx_tools_agent_workspace; state state_iam_tools_agent_workspace; conv conv_iam_tools_agent_workspace; code index cij_iam_tools_agent_workspace; workspaces ws_agentsandbox / wp_agentsandbox_iam_shell; ws_inneranimalmedia / wp_inneranimalmedia.',
  unixepoch(),
  unixepoch()
);
