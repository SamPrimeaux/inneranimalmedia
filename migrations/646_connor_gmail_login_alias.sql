-- 646: Connor — link connordmcneely@gmail.com (Claude / Google sign-in) to au_5d17673408aaebc7.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/646_connor_gmail_login_alias.sql

INSERT OR IGNORE INTO auth_user_emails
  (id, email, auth_user_id, kind, label, tenant_id, is_verified, is_login_enabled, iam_owned)
VALUES
  (
    'aue_connor_primary',
    'connordmcneely@leadershiplegacydigital.com',
    'au_5d17673408aaebc7',
    'primary',
    'Connor IAM primary',
    'tenant_connor_mcneely',
    1,
    1,
    0
  ),
  (
    'aue_connor_gmail',
    'connordmcneely@gmail.com',
    'au_5d17673408aaebc7',
    'google',
    'Claude / Google sign-in',
    'tenant_connor_mcneely',
    1,
    1,
    0
  );
