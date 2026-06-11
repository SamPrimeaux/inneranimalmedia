-- 609: auth_user_emails spine + IAM-owned identities + operator CF accounts

-- ── auth_users profile / IAM flags ───────────────────────────────────────────
ALTER TABLE auth_users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'human';
ALTER TABLE auth_users ADD COLUMN identity_label TEXT;
ALTER TABLE auth_users ADD COLUMN iam_owned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN downgrade_protected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN notification_email TEXT;
ALTER TABLE auth_users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE auth_users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE auth_users ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE auth_users ADD COLUMN last_active_at INTEGER;

-- ── auth_user_emails (indexed login aliases) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_user_emails (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  auth_user_id     TEXT NOT NULL,
  person_uuid      TEXT,
  kind             TEXT NOT NULL DEFAULT 'primary',
  label            TEXT,
  cf_account_id    TEXT,
  tenant_id        TEXT,
  is_verified      INTEGER NOT NULL DEFAULT 1,
  is_login_enabled INTEGER NOT NULL DEFAULT 1,
  iam_owned        INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_auth_user_emails_auth_user
  ON auth_user_emails (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_user_emails_person
  ON auth_user_emails (person_uuid) WHERE person_uuid IS NOT NULL;

-- ── operator_cloudflare_accounts (dual CF for platform operator person) ────────
CREATE TABLE IF NOT EXISTS operator_cloudflare_accounts (
  id                    TEXT PRIMARY KEY,
  person_uuid           TEXT NOT NULL,
  cloudflare_account_id TEXT NOT NULL,
  label                 TEXT,
  is_default            INTEGER NOT NULL DEFAULT 0,
  is_active             INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (person_uuid, cloudflare_account_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_cf_accounts_person
  ON operator_cloudflare_accounts (person_uuid, is_active);

-- Sam human operator person
INSERT OR IGNORE INTO operator_cloudflare_accounts
  (id, person_uuid, cloudflare_account_id, label, is_default, is_active)
VALUES
  ('ocfa_info_inneranimals', '550e8400-e29b-41d4-a716-446655440001',
   'ede6590ac0d2fb7daf155b35653457b2', 'Info@inneranimals.com main CF', 1, 1),
  ('ocfa_meauxbility_work', '550e8400-e29b-41d4-a716-446655440001',
   'e8d0359c2ad85845814f446f4dd174ea', 'Meauxbility@gmail.com work CF', 0, 1);

-- Fix sam@inneranimalmedia.com person_uuid
UPDATE auth_users
SET person_uuid = '550e8400-e29b-41d4-a716-446655440001',
    updated_at  = datetime('now')
WHERE id = 'au_8a5b76b737a9f14c'
  AND (person_uuid IS NULL OR trim(person_uuid) = '');

-- IAM-owned identity flags on auth_users
UPDATE auth_users SET
  iam_owned = 1,
  downgrade_protected = 1,
  account_type = 'human',
  role = 'superadmin',
  tenant_id = 'tenant_sam_primeaux',
  active_workspace_id = COALESCE(NULLIF(trim(active_workspace_id), ''), 'ws_inneranimalmedia'),
  default_workspace_id = COALESCE(NULLIF(trim(default_workspace_id), ''), 'ws_inneranimalmedia'),
  updated_at = datetime('now')
WHERE id IN (
  'au_871d920d1233cbd1',
  'au_cccac6ec2360ac75',
  'au_8a5b76b737a9f14c',
  'au_cd1d8f5ccce9e15a',
  'au_e3b3457d8243e46e',
  'au_32844a43aecdea33',
  'au_01b4b8a37ba92807',
  'au_c4bf765aff63b31f'
);

UPDATE auth_users SET
  iam_owned = 1,
  downgrade_protected = 1,
  account_type = 'agent',
  identity_label = 'AI Agent (IAM)',
  role = 'member',
  tenant_id = 'tenant_sam_primeaux',
  updated_at = datetime('now')
WHERE id = 'au_044647024b047493';

UPDATE auth_users SET identity_label = 'Sam Primeaux (main CF)'      WHERE id = 'au_871d920d1233cbd1';
UPDATE auth_users SET identity_label = 'Sam Work CF (Meauxbility)'   WHERE id = 'au_cccac6ec2360ac75';
UPDATE auth_users SET identity_label = 'Sam Primeaux (IAM alias)'    WHERE id = 'au_8a5b76b737a9f14c';
UPDATE auth_users SET identity_label = 'Sam Primeaux (CEO)'          WHERE id = 'au_cd1d8f5ccce9e15a';
UPDATE auth_users SET identity_label = 'Sam Primeaux (Meauxbility)'  WHERE id = 'au_e3b3457d8243e46e';
UPDATE auth_users SET identity_label = 'Sam Primeaux (clothing)'     WHERE id = 'au_32844a43aecdea33';
UPDATE auth_users SET identity_label = 'Sam Primeaux (Alt)'          WHERE id = 'au_01b4b8a37ba92807';
UPDATE auth_users SET identity_label = 'Sam Primeaux (iCloud)'       WHERE id = 'au_c4bf765aff63b31f';

-- Backfill profile columns from accounts / users
UPDATE auth_users SET
  notification_email = COALESCE(notification_email, (SELECT notification_email FROM accounts WHERE accounts.id = auth_users.id)),
  plan = COALESCE(NULLIF(trim(plan), ''), (SELECT plan FROM accounts WHERE accounts.id = auth_users.id), 'free'),
  meta_json = COALESCE(NULLIF(trim(meta_json), ''), (SELECT meta_json FROM accounts WHERE accounts.id = auth_users.id), '{}'),
  last_active_at = COALESCE(last_active_at, (SELECT last_active_at FROM accounts WHERE accounts.id = auth_users.id))
WHERE id IN (
  'au_871d920d1233cbd1','au_cccac6ec2360ac75','au_8a5b76b737a9f14c','au_cd1d8f5ccce9e15a',
  'au_e3b3457d8243e46e','au_32844a43aecdea33','au_01b4b8a37ba92807','au_c4bf765aff63b31f','au_044647024b047493'
);

UPDATE auth_users SET
  stripe_customer_id = COALESCE(stripe_customer_id, (SELECT stripe_customer_id FROM users WHERE users.auth_id = auth_users.id))
WHERE EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth_users.id AND users.stripe_customer_id IS NOT NULL);

-- auth_user_emails: Sam human family
INSERT OR IGNORE INTO auth_user_emails
  (id, email, auth_user_id, person_uuid, kind, label, cf_account_id, tenant_id, iam_owned)
VALUES
  ('aue_info_inneranimals', 'info@inneranimals.com', 'au_871d920d1233cbd1',
   '550e8400-e29b-41d4-a716-446655440001', 'primary', 'Main CF account',
   'ede6590ac0d2fb7daf155b35653457b2', 'tenant_sam_primeaux', 1),
  ('aue_meauxbility_gmail', 'meauxbility@gmail.com', 'au_cccac6ec2360ac75',
   '550e8400-e29b-41d4-a716-446655440001', 'iam_alias', 'Meaux Work CF',
   'e8d0359c2ad85845814f446f4dd174ea', 'tenant_sam_primeaux', 1),
  ('aue_sam_iam', 'sam@inneranimalmedia.com', 'au_8a5b76b737a9f14c',
   '550e8400-e29b-41d4-a716-446655440001', 'iam_alias', 'IAM alias', NULL, 'tenant_sam_primeaux', 1),
  ('aue_ceo_gmail', 'ceosamprimeaux@gmail.com', 'au_cd1d8f5ccce9e15a',
   '550e8400-e29b-41d4-a716-446655440001', 'iam_alias', 'CEO', NULL, 'tenant_sam_primeaux', 1),
  ('aue_meauxbility_org', 'sam@meauxbility.org', 'au_e3b3457d8243e46e',
   '550e8400-e29b-41d4-a716-446655440001', 'iam_alias', 'Meauxbility org', NULL, 'tenant_sam_primeaux', 1),
  ('aue_clothing', 'inneranimalclothing@gmail.com', 'au_32844a43aecdea33',
   '550e8400-e29b-41d4-a716-446655440001', 'iam_alias', 'Clothing alias', NULL, 'tenant_sam_primeaux', 1),
  ('aue_primeaux33', 'primeauxsam33@gmail.com', 'au_01b4b8a37ba92807',
   '550e8400-e29b-41d4-a716-446655440001', 'iam_alias', 'Alt', NULL, 'tenant_sam_primeaux', 1),
  ('aue_icloud', 'sam_primeaux@icloud.com', 'au_c4bf765aff63b31f',
   '550e8400-e29b-41d4-a716-446655440001', 'iam_alias', 'iCloud', NULL, 'tenant_sam_primeaux', 1),
  ('aue_ai_agent', 'ai@inneranimalmedia.com', 'au_044647024b047493',
   '52181d99-eede-4c78-abfc-536688934e94', 'primary', 'AI Agent (IAM)', NULL, 'tenant_sam_primeaux', 1);

-- Recovery emails from user_settings
INSERT OR IGNORE INTO auth_user_emails
  (id, email, auth_user_id, person_uuid, kind, label, tenant_id, is_login_enabled, iam_owned)
SELECT
  'aue_rec_' || lower(hex(randomblob(4))),
  lower(trim(us.backup_email)),
  us.user_id,
  au.person_uuid,
  'recovery',
  'Recovery email',
  au.tenant_id,
  0,
  COALESCE(au.iam_owned, 0)
FROM user_settings us
JOIN auth_users au ON au.id = us.user_id
WHERE us.backup_email IS NOT NULL
  AND trim(us.backup_email) != ''
  AND us.backup_email NOT IN (SELECT email FROM auth_user_emails);

-- ai@ service membership on ws_inneranimalmedia
INSERT OR IGNORE INTO memberships
  (id, workspace_id, account_id, org_id, role, can_run_pty, can_run_mcp, can_deploy, joined_at, created_at)
VALUES
  ('mbr_ai_iam_inneranimalmedia', 'ws_inneranimalmedia', 'au_044647024b047493',
   'tenant_sam_primeaux', 'agent', 1, 1, 1, unixepoch(), unixepoch());

INSERT OR IGNORE INTO memberships
  (id, workspace_id, account_id, org_id, role, can_run_pty, can_run_mcp, can_deploy, joined_at, created_at)
VALUES
  ('mbr_ai_iam_ws_ai', 'ws_ai', 'au_044647024b047493',
   'tenant_sam_primeaux', 'agent', 1, 1, 1, unixepoch(), unixepoch());

INSERT OR IGNORE INTO workspace_members
  (user_id, workspace_id, role, tenant_id, is_active, created_at, updated_at)
VALUES
  ('au_044647024b047493', 'ws_inneranimalmedia', 'agent', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch());
