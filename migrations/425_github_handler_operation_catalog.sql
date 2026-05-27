-- 425: GitHub handler_config.operation — MCP handleGitHub dispatches on cfg.operation (not tool_key).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/425_github_handler_operation_catalog.sql
--
-- Smoke gap: github_repos → "Unknown GitHub operation: undefined" (same class as r2_list missing operation).

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"list_repos"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_repos'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"get_file"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_file'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"create_file"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_create_file'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"update_file"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_update_file'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"create_branch"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_create_branch'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"create_pr"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_create_pr'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_tools
SET handler_config = json_patch(handler_config, '{"operation":"merge_pr"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_merge_pr'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

-- Parity on agentsam_mcp_tools when rows exist.
UPDATE agentsam_mcp_tools
SET handler_config = json_patch(handler_config, '{"operation":"list_repos"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_repos'
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_mcp_tools
SET handler_config = json_patch(handler_config, '{"operation":"get_file"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_file'
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_mcp_tools
SET handler_config = json_patch(handler_config, '{"operation":"create_file"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_create_file'
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_mcp_tools
SET handler_config = json_patch(handler_config, '{"operation":"update_file"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_update_file'
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_mcp_tools
SET handler_config = json_patch(handler_config, '{"operation":"create_branch"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_create_branch'
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_mcp_tools
SET handler_config = json_patch(handler_config, '{"operation":"create_pr"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_create_pr'
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';

UPDATE agentsam_mcp_tools
SET handler_config = json_patch(handler_config, '{"operation":"merge_pr"}'),
    updated_at = unixepoch()
WHERE tool_key = 'github_merge_pr'
  AND COALESCE(json_extract(handler_config, '$.operation'), '') = '';
