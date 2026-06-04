-- 556: Platform owner primary login emails — is_superadmin + role (idempotent).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/556_platform_owner_primary_emails_superadmin.sql

UPDATE auth_users
SET is_superadmin = 1,
    role = 'superadmin',
    updated_at = unixepoch()
WHERE LOWER(TRIM(email)) IN (
  'info@inneranimals.com',
  'meauxbility@gmail.com',
  'ceosamprimeaux@gmail.com',
  'inneranimalclothing@gmail.com'
)
AND (
  COALESCE(is_superadmin, 0) != 1
  OR COALESCE(role, 'member') != 'superadmin'
);
