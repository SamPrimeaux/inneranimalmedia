-- 737: Container pool + image tag 1:1 with worker name inneranimalmedia.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/737_container_inneranimalmedia_pool.sql

UPDATE agentsam_tools
SET handler_config = json_set(
      json_set(
        COALESCE(handler_config, '{}'),
        '$.pool_id', 'inneranimalmedia'
      ),
      '$.image_tag', 'inneranimalmedia:sandbox-v3'
    ),
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_container_exec', 'agentsam_terminal_sandbox');
