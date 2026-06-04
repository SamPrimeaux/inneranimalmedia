-- 557: MCP terminal — operator localpty + terminal VM lanes; superadmin does not need per-ws tunnels.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/557_mcp_terminal_superadmin_operator_lanes.sql

UPDATE agentsam_tools
SET description = 'Platform operator shell (localpty primary, terminal VM fallback). Args: command + optional path/cwd. Superadmin reuses operator terminal_connections — no per-customer tunnel. BYOK tunnels are for team/customer workspaces.',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_local';

UPDATE agentsam_tools
SET description = 'Same operator lanes as terminal_local: localpty.inneranimalmedia.com + terminal.inneranimalmedia.com. Args: command + optional path/cwd + optional target_id (conn_mac_local / conn_mac_shell2). Superadmin: works on any workspace_id without provisioning ws_* tunnels.',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_remote';
