-- Operator browser trust — canonical https:// origins for ws_inneranimalmedia / au_871d920d1233cbd1.
-- INSERT OR IGNORE: does not overwrite existing rows (including host-only legacy rows).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./scripts/sql/seed-browser-trusted-origins-operator.sql

INSERT OR IGNORE INTO agentsam_browser_trusted_origin (
  workspace_id,
  user_id,
  origin,
  cert_fingerprint_sha256,
  trust_scope,
  created_at,
  updated_at,
  person_uuid
)
VALUES
  ('ws_inneranimalmedia', 'au_871d920d1233cbd1', 'https://dashboard.stripe.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', 'au_871d920d1233cbd1', 'https://dashboard.cloudflare.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', 'au_871d920d1233cbd1', 'https://github.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', 'au_871d920d1233cbd1', 'https://app.resend.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', 'au_871d920d1233cbd1', 'https://app.supabase.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', 'au_871d920d1233cbd1', 'https://supabase.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL);

UPDATE agentsam_browser_trusted_origin
SET trust_scope = 'persistent', updated_at = datetime('now')
WHERE workspace_id = 'ws_inneranimalmedia'
  AND user_id = 'au_871d920d1233cbd1'
  AND origin IN (
    'https://dashboard.stripe.com',
    'https://dashboard.cloudflare.com',
    'https://github.com',
    'https://app.resend.com',
    'https://app.supabase.com',
    'https://supabase.com',
    'dashboard.stripe.com',
    'dashboard.cloudflare.com',
    'github.com',
    'app.resend.com',
    'app.supabase.com',
    'supabase.com'
  );
