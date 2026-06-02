-- 511: Cloudflare lane categories + per-workspace deploy command keys for stack vs worker.
--
-- handler_type stays "deploy" (terminal dispatch). tool_category moves under cloudflare.% so
-- develop/operate lane filters include these tools alongside cloudflare_command_registry.
--
-- Per workspace (workspace_settings.settings_json), configure for example:
--   deploy_stack_command: "bash scripts/deploy-stack.sh"
--   deploy_worker_command: "npm run deploy:full"
-- Legacy deploy_command still works as fallback in catalog-tool-executor.js.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/511_deploy_tools_cloudflare_category.sql

UPDATE agentsam_tools
SET
  tool_category = 'cloudflare.deploy.stack',
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.auth_source', 'workspace',
    '$.provider', 'cloudflare',
    '$.operation', 'deploy.stack',
    '$.command_source', 'workspace_settings.deploy_stack_command'
  ),
  description = 'Run this workspace''s full-stack deploy script (multi-service / dashboard+worker). Command resolves from workspace_settings.settings_json.deploy_stack_command at dispatch (deploy_command fallback). Scoped to the active workspace — not a global operator script. Requires approval.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_stack_deploy';

UPDATE agentsam_tools
SET
  tool_category = 'cloudflare.deploy.worker',
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.auth_source', 'workspace',
    '$.provider', 'cloudflare',
    '$.operation', 'deploy.worker',
    '$.command_source', 'workspace_settings.deploy_worker_command'
  ),
  description = 'Run this workspace''s Worker deploy script (wrangler/npm). Command resolves from workspace_settings.settings_json.deploy_worker_command at dispatch (deploy_command fallback). Scoped to the active workspace — Connor and Sam can use different commands per project without overlap. Requires approval.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_worker_deploy';

-- Redundant with agentsam_terminal_* — LLM runs wrangler via terminal instead.
UPDATE agentsam_tools
SET is_active = 0,
    oauth_visible = 0,
    notes = 'Superseded by agentsam_terminal_* — use wrangler tail / wrangler deployments list',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_worker_tail', 'agentsam_worker_status');

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 0, updated_at = unixepoch()
WHERE tool_key IN ('agentsam_worker_tail', 'agentsam_worker_status')
  AND client_id = 'iam_mcp_inneranimalmedia';
