-- 507: Add a single-stack deploy tool (terminal-local deploy_command)
--
-- This tool is intentionally generic: it executes the workspace-configured
-- workspace_settings.settings_json.deploy_command. For the IAM workspace, set:
--   deploy_command = "bash scripts/deploy-stack.sh"
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/507_agentsam_stack_deploy_tool.sql

INSERT OR REPLACE INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval,
   workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES
(
  'agentsam_stack_deploy',
  'agentsam_stack_deploy',
  'Stack Deploy (IAM + MCP)',
  'deploy.stack',
  'Deploy the full IAM stack using the workspace deploy_command. Configure workspace_settings.settings_json.deploy_command (recommended: \"bash scripts/deploy-stack.sh\"). Requires approval.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"approval_id":{"type":"string"},"approvalId":{"type":"string"}}}',
  'deploy',
  '{"auth_source":"workspace","operation":"deploy","command_source":"workspace_settings.deploy_command"}',
  'high', 1,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1,
  unixepoch()
);

