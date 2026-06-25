-- Google Drive: allow full drive scope for shared drive create/manage (API v3)
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/707_google_drive_manage_scope.sql
UPDATE integration_catalog
SET
  oauth_scopes_available = '["https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com/auth/drive.file","https://www.googleapis.com/auth/drive"]',
  updated_at = datetime('now')
WHERE slug IN ('google_drive', 'google-drive');
