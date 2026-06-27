-- 716: Meauxbility — point ASSETS_BUCKET spine to meauxbilityv2 (WNAM).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/716_meauxbility_r2_meauxbilityv2.sql
--
-- Runtime D1 defaults:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute meauxbilityorg --remote \
--     --file=./migrations/client-runtime/meauxbilityorg_002_r2_meauxbilityv2.sql

PRAGMA foreign_keys = OFF;

UPDATE agentsam_workspace
SET
  r2_bucket = 'meauxbilityv2',
  byok_r2_bucket = 'meauxbilityv2',
  metadata_json = json_set(
    json_set(
      json_set(
        json_set(
          COALESCE(NULLIF(metadata_json, ''), '{}'),
          '$.r2_assets_bucket', 'meauxbilityv2'
        ),
        '$.r2_bindings',
        json('[{"binding":"ASSETS_BUCKET","bucket":"meauxbilityv2","s3_api":"https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/meauxbilityv2","location":"WNAM"},{"binding":"INFRASTRUCTURE_BUCKET","bucket":"allinfrastructure"}]')
      ),
      '$.cms',
      json_set(
        COALESCE(json_extract(metadata_json, '$.cms'), '{}'),
        '$.proceed_defaults',
        json_set(
          COALESCE(json_extract(json_extract(metadata_json, '$.cms'), '$.proceed_defaults'), '{}'),
          '$.r2_bucket', 'meauxbilityv2'
        )
      )
    ),
    '$.cms.r2_layout',
    json_set(
      COALESCE(json_extract(json_extract(metadata_json, '$.cms'), '$.r2_layout'), '{}'),
      '$.assets_bucket', 'meauxbilityv2'
    )
  ),
  updated_at = unixepoch()
WHERE id = 'ws_meauxbility';

UPDATE agentsam_project_context
SET
  r2_buckets_involved = 'meauxbilityv2,allinfrastructure,cms',
  notes = 'Migration 716 — ASSETS_BUCKET meauxbilityv2 (WNAM). Infra: allinfrastructure.',
  updated_at = unixepoch()
WHERE id = 'ctx_meauxbility';

PRAGMA foreign_keys = ON;
