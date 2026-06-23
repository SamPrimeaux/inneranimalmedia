-- 688: Workspace D1 database catalog in agentsam_workspace.metadata_json (SSOT for Studio URLs).
-- Fuel collab lane: /dashboard/database/fuelnfreetime → remote D1 9fd6ff92… (no wrangler binding).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/688_workspace_d1_database_catalog.sql

UPDATE agentsam_workspace
SET
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.d1_databases',
    json('[{"binding":"DB","database_name":"fuelnfreetime","database_id":"9fd6ff92-e407-4b51-8b01-3c93f3845bb2"}]')
  ),
  d1_database_id = '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
  d1_binding = 'DB',
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';
