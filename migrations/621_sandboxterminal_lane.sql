-- 621: Sandbox PTY lane — GCP-only hostname sandboxterminal.inneranimalmedia.com
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/621_sandboxterminal_lane.sql
--
-- Then: ./scripts/with-cloudflare-env.sh ./scripts/install-sandboxterminal-route.sh

UPDATE terminal_connections
SET ws_url = 'wss://sandboxterminal.inneranimalmedia.com',
    target_type = 'sandbox',
    cwd_strategy = 'platform_workspace',
    platform = 'linux',
    shell = '/bin/bash',
    target_priority = 55,
    is_active = 1,
    is_default = 0,
    auth_token_secret_name = 'PTY_AUTH_TOKEN',
    auth_mode = 'secret_name',
    description = 'GCP sandbox lane — isolated /workspace/{tenant}/{user}/ via sandboxterminal.inneranimalmedia.com',
    updated_at = unixepoch()
WHERE id = 'conn_sam_sandbox';
