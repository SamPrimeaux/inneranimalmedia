-- 717: Meauxbility — enable IAM CMS bridge profile + studio path.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/717_meauxbility_cms_bridge_profile.sql

UPDATE agentsam_workspace
SET metadata_json = json_set(
  json_set(
    json_set(
      COALESCE(NULLIF(metadata_json, ''), '{}'),
      '$.api_profile', 'cpas_fragment'
    ),
    '$.studio_path', '/dashboard/cms'
  ),
  '$.cms.bridge_enabled', 1
),
updated_at = unixepoch()
WHERE id = 'ws_meauxbility';
