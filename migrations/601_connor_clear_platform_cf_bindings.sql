-- 601: Clear IAM platform Cloudflare bindings from Connor workspace (BYOK-only tenant).
-- Platform values must not appear in customer workspace dropdowns or D1 resolution.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/601_connor_clear_platform_cf_bindings.sql

UPDATE agentsam_workspace
SET
  cloudflare_account_id = NULL,
  d1_database_id = NULL,
  d1_binding = NULL,
  metadata_json = json_remove(
    json_remove(
      json_remove(
        COALESCE(metadata_json, '{}'),
        '$.cloudflare_account_id'
      ),
      '$.account_id'
    ),
    '$.cf_account_id'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_connor_mcneely'
  AND (
    cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2'
    OR d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49'
    OR json_extract(COALESCE(metadata_json, '{}'), '$.cloudflare_account_id') = 'ede6590ac0d2fb7daf155b35653457b2'
    OR json_extract(COALESCE(metadata_json, '{}'), '$.account_id') = 'ede6590ac0d2fb7daf155b35653457b2'
  );
