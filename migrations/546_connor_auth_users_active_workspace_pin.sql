-- 546 (545a): Pin Connor auth_users + heal stale auth_sessions (idempotent).
-- Stops session resolution drifting to ws_inneranimalmedia after membership cleanup.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/546_connor_auth_users_active_workspace_pin.sql

UPDATE auth_users
SET active_workspace_id = 'ws_connor_mcneely',
    active_tenant_id = 'tenant_connor_mcneely',
    tenant_id = COALESCE(NULLIF(TRIM(tenant_id), ''), 'tenant_connor_mcneely'),
    updated_at = unixepoch()
WHERE id = 'au_5d17673408aaebc7';

UPDATE auth_sessions
SET workspace_id = 'ws_connor_mcneely',
    tenant_id = 'tenant_connor_mcneely'
WHERE user_id = 'au_5d17673408aaebc7'
  AND (
    workspace_id IS NULL
    OR trim(workspace_id) = ''
    OR workspace_id IN (
      'ws_inneranimalmedia',
      'ws_inneranimalmedia_mcp',
      'ws_sam_primeaux',
      'ws_meauxbility',
      'ws_meauxwork',
      'ws_meauxcloud',
      'ws_connordmcneely'
    )
  );

UPDATE user_settings
SET default_workspace_id = 'ws_connor_mcneely',
    updated_at = unixepoch()
WHERE user_id = 'au_5d17673408aaebc7'
  AND (default_workspace_id IS NULL OR default_workspace_id != 'ws_connor_mcneely');
