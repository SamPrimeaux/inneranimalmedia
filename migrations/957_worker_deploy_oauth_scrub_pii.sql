-- 957: Expose agentsam_worker_deploy on MCP OAuth + connector; scrub PII from global description.
-- Prefers Workers Builds deploy hook (no PTY). Keep requires_approval=1.
-- Do not expose agentsam_stack_deploy yet (heavier / often Mac deploy:full).

UPDATE agentsam_tools
SET
  is_active = 1,
  oauth_visible = 1,
  requires_approval = 1,
  sort_priority = 28,
  display_name = 'Worker Deploy',
  description = 'Ship this workspace Worker via the configured Workers Builds deploy hook (or workspace deploy_worker_command). Scoped per workspace from workspace_settings — no cross-project overlap. Requires approval. Prefer this over terminal wrangler when the hook is configured.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_worker_deploy';

UPDATE agentsam_tools
SET
  description = 'Run this workspace full-stack deploy script when configured (dashboard + worker). Command resolves from workspace_settings.deploy_stack_command (deploy_command fallback). Scoped per workspace. Requires approval. Prefer agentsam_worker_deploy / CF Builds hook for phone and MCP ship.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_stack_deploy'
  AND description LIKE '%Connor%';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 28,
  access_class = 'write',
  runtime_contract_key = 'agentsam_worker_deploy',
  notes = 'Workers Builds hook ship — approval-gated',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_worker_deploy';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id,
  tool_key,
  is_active,
  expose_on_connector,
  connector_priority,
  access_class,
  runtime_contract_key,
  notes,
  updated_at
)
SELECT
  'iam_mcp_inneranimalmedia',
  'agentsam_worker_deploy',
  1,
  1,
  28,
  'write',
  'agentsam_worker_deploy',
  'Workers Builds hook ship — approval-gated',
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia'
    AND tool_key = 'agentsam_worker_deploy'
);
