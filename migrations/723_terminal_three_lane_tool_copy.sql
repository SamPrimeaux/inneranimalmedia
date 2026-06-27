-- 723: Terminal three-lane model — canonical tool descriptions (local=device, remote=GCP VM, sandbox=container)
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/723_terminal_three_lane_tool_copy.sql

UPDATE agentsam_tools
SET
  description = 'Run a shell command on the signed-in user''s own machine via their provisioned device tunnel (user_hosted_tunnel). Examples: Sam''s Mac zsh at localpty, Connor''s Windows PowerShell. Requires terminal device setup in Settings. Not for cloud VM — use agentsam_terminal_remote when away from desk.',
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.target_type', 'user_hosted_tunnel'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_local';

UPDATE agentsam_tools
SET
  description = 'Run a shell command on the GCP cloud desk VM (terminal.inneranimalmedia.com) with the platform operator repo at /home/samprimeaux/inneranimalmedia. Use when Mac is asleep, from phone, or via OAuth MCP. Platform operators only. Full git/npm/wrangler capability.',
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.target_type', 'platform_vm'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_remote';

UPDATE agentsam_tools
SET
  description = 'Isolated developer container zone — one CF Container instance per zone_slug (engineer, architect, cms, specialist, or tenant slug). Safe experiments and user-preferred dev sandboxes; does not touch production VM paths. Target backend: MY_CONTAINER keyed by zone_slug.',
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.target_type', 'container',
    '$.binding', 'MY_CONTAINER',
    '$.zone_root_template', '.mcp-zones/{zone_slug}'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_sandbox';
