-- 694: Meauxbility — domain/route inventory in IAM registry metadata.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/694_meauxbility_domains.sql

PRAGMA foreign_keys = OFF;

UPDATE agentsam_workspace
SET metadata_json = json_set(
  json_set(
    json_set(
      json_set(
        COALESCE(NULLIF(metadata_json, ''), '{}'),
        '$.public_domain', 'meauxbility.org'
      ),
      '$.admin_domain', 'admin.meauxbility.org'
    ),
    '$.worker_preview_pattern', '*-meauxbility.meauxbility.workers.dev'
  ),
  '$.custom_domains', '["meauxbility.org","www.meauxbility.org","admin.meauxbility.org"]'
),
updated_at = unixepoch()
WHERE id = 'ws_meauxbility';

UPDATE agentsam_project_context
SET
  domains_involved = 'meauxbility.org,www.meauxbility.org,admin.meauxbility.org,meauxbility.meauxbility.workers.dev',
  updated_at = unixepoch()
WHERE id = 'ctx_meauxbility';

PRAGMA foreign_keys = ON;
