-- Shell MCP workflow row for agentsam_workflow_runs.workflow_id FK (workspace capability action runtime).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/319_workspace_capability_mcp_workflow.sql

INSERT OR IGNORE INTO agentsam_mcp_workflows (
  id,
  workflow_key,
  display_name,
  description,
  status,
  priority,
  steps_json,
  tools_json,
  acceptance_criteria_json,
  tenant_id,
  workspace_id,
  is_active,
  category
) VALUES (
  'mcp_wf_workspace_capability_runtime',
  'wf_workspace_capability_runtime',
  'Workspace capability runtime',
  'D1 FK anchor for chat-led workspace capability runs (browser / monaco / excalidraw adapters). Per-run workflow_key is stored on agentsam_workflow_runs.workflow_key.',
  'ready',
  'medium',
  '[]',
  '[]',
  '[]',
  'tenant_inneranimalmedia',
  NULL,
  1,
  'workspace_capability'
);
