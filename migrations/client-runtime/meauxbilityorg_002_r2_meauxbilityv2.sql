-- meauxbilityorg — default R2 bucket → meauxbilityv2 (ASSETS_BUCKET).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute meauxbilityorg --remote \
--     --file=./migrations/client-runtime/meauxbilityorg_002_r2_meauxbilityv2.sql

UPDATE cms_site_registry
SET
  r2_bucket = 'meauxbilityv2',
  metadata_json = json_set(
    COALESCE(NULLIF(metadata_json, ''), '{}'),
    '$.r2_assets_bucket', 'meauxbilityv2'
  ),
  updated_at = unixepoch()
WHERE id = 'site_meauxbility';

-- Future rows default to meauxbilityv2 (SQLite cannot ALTER COLUMN DEFAULT easily; patch existing nulls)
UPDATE cms_pages SET r2_bucket = 'meauxbilityv2' WHERE r2_bucket = 'meauxbilityorgfinal' OR r2_bucket IS NULL;
UPDATE cms_assets SET r2_bucket = 'meauxbilityv2' WHERE r2_bucket = 'meauxbilityorgfinal' OR r2_bucket IS NULL;
