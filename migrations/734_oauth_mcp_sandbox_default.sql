-- 734: OAuth MCP + in-app chat — default terminal exec to CF Container sandbox (not GCP VM).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/734_oauth_mcp_sandbox_default.sql

-- agent_chat_essential: legacy terminal_run → agentsam_terminal_sandbox
DELETE FROM agentsam_tool_policy_keys
WHERE policy_kind = 'agent_chat_essential' AND tool_key IN ('terminal_run', 'terminal_execute', 'terminal_wrangler');

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes)
VALUES
  ('atpk_chat_term_sandbox', 'agent_chat_essential', 'agentsam_terminal_sandbox', 28, 'Default cloud shell — MY_CONTAINER sandbox-v2');

-- Sandbox tool: default lane for git/npm/wrangler/deploy (OAuth + dashboard)
UPDATE agentsam_tools
SET description = 'Default cloud shell for git, npm, wrangler, and deploy. Runs in an isolated CF Container (MY_CONTAINER sandbox-v2) — use this for OAuth MCP (ChatGPT/Claude) and when away from your desk. Pass zone_slug when using MCP experiment zones (engineer, architect, cms, specialist). For your Mac directly use agentsam_terminal_local; explicit GCP VM fallback only via agentsam_terminal_remote.',
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.target_type', 'container',
      '$.binding', 'MY_CONTAINER',
      '$.image_tag', 'sandbox-v2'
    ),
    oauth_visible = 1,
    is_active = 1,
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_sandbox';

-- Remote VM: explicit operator fallback only (not default)
UPDATE agentsam_tools
SET description = 'Explicit GCP cloud-desk fallback (terminal.inneranimalmedia.com). Use only when CF Container sandbox is unavailable. Prefer agentsam_terminal_sandbox for OAuth MCP and default cloud work.',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_remote';

-- Platform operator Sam: ensure sandbox on OAuth allowlist if missing
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, expose_on_connector, connector_priority, updated_at
) VALUES (
  'iam_mcp_inneranimalmedia',
  'agentsam_terminal_sandbox',
  'write',
  35,
  '734: default OAuth MCP cloud shell (MY_CONTAINER sandbox-v2)',
  1,
  1,
  35,
  unixepoch()
);
