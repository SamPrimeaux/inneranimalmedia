-- 513: terminal_connections cleanup for ws_inneranimalmedia
--
-- Mac primary (conn_mac_local) + GCP fallback (conn_mac_shell2); deactivate orphaned defaults.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/513_terminal_connections_cleanup.sql

-- 1. Deactivate orphaned default rows (wrong user_ids, duplicate defaults)
UPDATE terminal_connections
SET is_default = 0, is_active = 0, updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND id IN (
    'conn_sam_primary_token_mint',
    'conn_9921099895d1489b',
    'conn_af73aa527d9248bb',
    'conn_a5d785c5936245cd'
  );

-- 2. conn_mac_local — Sam iMac primary Mac PTY
UPDATE terminal_connections
SET is_default = 1,
    is_active = 1,
    auth_token_secret_name = 'PTY_AUTH_TOKEN',
    target_priority = 10,
    cwd_strategy = 'host_default',
    user_id = 'au_871d920d1233cbd1',
    description = 'Sam iMac — localpty.inneranimalmedia.com — primary dev terminal',
    updated_at = unixepoch()
WHERE id = 'conn_mac_local';

-- 3. conn_mac_shell2 — GCP VM fallback
UPDATE terminal_connections
SET is_default = 0,
    is_active = 1,
    auth_token_secret_name = 'PTY_AUTH_TOKEN',
    target_priority = 50,
    user_id = 'au_871d920d1233cbd1',
    description = 'GCP VM fallback — terminal.inneranimalmedia.com — used when Mac PTY is down',
    updated_at = unixepoch()
WHERE id = 'conn_mac_shell2';
