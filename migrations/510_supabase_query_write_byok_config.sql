-- 510: OAuth-visible Supabase SQL tools — drop platform HYPERDRIVE binding; BYOK user plane.
-- Supersedes legacy handler_config.binding = 'HYPERDRIVE' on agentsam_supabase_query / _write.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/510_supabase_query_write_byok_config.sql

UPDATE agentsam_tools
SET handler_type = 'hyperdrive',
    handler_config = json_patch(
      COALESCE(NULLIF(trim(handler_config), ''), '{}'),
      '{"binding":null,"provider":"supabase","data_plane":"user","auth_source":"workspace","operation":"supabase.query"}'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_supabase_query';

UPDATE agentsam_tools
SET handler_type = 'hyperdrive',
    handler_config = json_patch(
      COALESCE(NULLIF(trim(handler_config), ''), '{}'),
      '{"binding":null,"provider":"supabase","data_plane":"user","auth_source":"workspace","operation":"supabase.write"}'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_supabase_write';
