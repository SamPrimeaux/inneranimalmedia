-- 547: Heal Connor auth_sessions using typo workspace id ws_connordmcneely.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/547_connor_auth_sessions_typo_workspace.sql

UPDATE auth_sessions
SET workspace_id = 'ws_connor_mcneely',
    tenant_id = 'tenant_connor_mcneely'
WHERE user_id = 'au_5d17673408aaebc7'
  AND workspace_id = 'ws_connordmcneely';
