-- 791: Align Companions CPAS execution context SSOT (agentsam_workspace metadata + projects display name).
-- Canonical JSON: workspace ws_companionscpas · project proj_companions_cpas_web
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/791_companions_execution_context_ssot.sql

UPDATE projects
SET
  name = 'Companions of CPAS',
  domain = 'companionsofcaddo.org',
  worker_id = 'companionscpas',
  d1_databases = 'companionscpas',
  updated_at = datetime('now')
WHERE id = 'proj_companions_cpas_web';

UPDATE agentsam_workspace
SET
  name = 'Companions of CPAS',
  display_name = 'Companions of CPAS',
  metadata_json = json_patch(
    json_patch(
      COALESCE(metadata_json, '{}'),
      json_object(
        'd1_database_name', 'companionscpas',
        'd1_binding_name', 'DB',
        'r2_binding_name', 'WEBSITE_ASSETS',
        'kv_binding_name', 'CMS_CACHE',
        'workers_ai_binding', 'AGENTSAM_WAI',
        'bridge_telemetry_url_secret', 'IAM_TELEMETRY_URL',
        'secrets_needed', json('[\"GOOGLE_CLIENT_ID\",\"GOOGLE_CLIENT_SECRET\",\"META_APP_ID\",\"META_APP_SECRET\"]')
      )
    ),
    json_object(
      'execution_context_ssot', '791_companions_execution_context_ssot',
      'execution_context_verified_at', '2026-07-07'
    )
  ),
  updated_at = unixepoch()
WHERE id = 'ws_companionscpas';
