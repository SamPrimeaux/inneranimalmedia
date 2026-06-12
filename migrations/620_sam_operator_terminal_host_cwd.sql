-- 620: Sam operator lanes — host_default cwd on cloud + local (real repo, not /workspace isolation).
-- Connor / customer rows keep platform_workspace (provisioned per-user clones).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/620_sam_operator_terminal_host_cwd.sql

UPDATE terminal_connections
SET cwd_strategy = 'host_default',
    description = 'Sam iMac — localpty.inneranimalmedia.com — primary dev terminal (host repo cwd)',
    updated_at = unixepoch()
WHERE id = 'conn_mac_local';

UPDATE terminal_connections
SET cwd_strategy = 'host_default',
    description = 'Sam operator cloud lane — terminal.inneranimalmedia.com — host repo cwd (workspace_settings.workspace_root)',
    updated_at = unixepoch()
WHERE id = 'conn_mac_shell2';
