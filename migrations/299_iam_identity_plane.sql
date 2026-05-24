-- =============================================================================
-- 299_iam_identity_plane.sql — accounts / identities / memberships identity plane
-- =============================================================================
-- Canonical org = tenants (tenant_* ids). Does not modify orgs stub table.
-- Preserves auth_users.id (au_*) and workspaces.id (ws_*). No deletes.
--
-- Apply (remote):
--   ./scripts/with-cloudflare-env.sh bash scripts/migrations/299_iam_identity_plane_alter_safe.sh
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/299_iam_identity_plane.sql
-- =============================================================================

PRAGMA foreign_keys = OFF;

-- -----------------------------------------------------------------------------
-- 1. accounts (id = auth_users.id, au_* preserved)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL DEFAULT 'human'
                  CHECK (type IN ('human', 'agent', 'system')),
  email           TEXT UNIQUE,
  display_name    TEXT NOT NULL,
  avatar_url      TEXT,
  password_hash   TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended', 'pending', 'deleted')),
  plan            TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free', 'pro', 'agency', 'enterprise')),
  timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
  meta_json       TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  last_active_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_type_status ON accounts(type, status);

-- -----------------------------------------------------------------------------
-- 2. account_identities
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_identities (
  id                  TEXT PRIMARY KEY DEFAULT ('aid_' || lower(hex(randomblob(8)))),
  account_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_subject    TEXT NOT NULL,
  email               TEXT,
  access_token_enc    TEXT,
  refresh_token_enc   TEXT,
  expires_at          INTEGER,
  scopes              TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_identities_account ON account_identities(account_id);
CREATE INDEX IF NOT EXISTS idx_identities_provider ON account_identities(provider, provider_subject);

-- -----------------------------------------------------------------------------
-- 3. memberships (replaces scattered workspace_members + policy flags over time)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
  id              TEXT PRIMARY KEY DEFAULT ('mbr_' || lower(hex(randomblob(8)))),
  workspace_id    TEXT NOT NULL,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  org_id          TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'agent', 'billing')),
  can_run_pty     INTEGER NOT NULL DEFAULT 0,
  can_run_mcp     INTEGER NOT NULL DEFAULT 1,
  can_deploy      INTEGER NOT NULL DEFAULT 0,
  invited_by      TEXT REFERENCES accounts(id),
  joined_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (workspace_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_account ON memberships(account_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id, role);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id, workspace_id);

-- -----------------------------------------------------------------------------
-- 4. Backfill accounts from auth_users
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO accounts (
  id, type, email, display_name, avatar_url, password_hash, status, plan, timezone,
  meta_json, created_at, updated_at, last_active_at
)
SELECT
  au.id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = au.id AND wm.member_type = 'agent' LIMIT 1
    ) THEN 'agent'
    ELSE 'human'
  END,
  au.email,
  COALESCE(NULLIF(TRIM(au.display_name), ''), NULLIF(TRIM(au.name), ''), au.email),
  au.avatar_url,
  au.password_hash,
  COALESCE(NULLIF(TRIM(au.status), ''), 'active'),
  'free',
  COALESCE(NULLIF(TRIM(au.timezone), ''), 'America/Chicago'),
  '{}',
  unixepoch(COALESCE(au.created_at, datetime('now'))),
  unixepoch(COALESCE(au.updated_at, datetime('now'))),
  au.last_login_at
FROM auth_users au;

UPDATE accounts
SET type = 'agent'
WHERE id IN (
  SELECT wm.user_id FROM workspace_members wm
  WHERE wm.user_id IS NOT NULL AND wm.member_type = 'agent'
);

-- -----------------------------------------------------------------------------
-- 5. Backfill account_identities from user_oauth_tokens
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO account_identities (
  id, account_id, provider, provider_subject, email, scopes, created_at, updated_at
)
SELECT
  'aid_' || lower(hex(randomblob(8))),
  t.user_id,
  t.provider,
  CASE
    WHEN t.account_identifier IS NOT NULL AND TRIM(t.account_identifier) != ''
      THEN TRIM(t.account_identifier)
    ELSE t.user_id || ':' || t.provider
  END,
  t.account_email,
  t.scopes,
  COALESCE(t.created_at, unixepoch()),
  COALESCE(t.updated_at, unixepoch())
FROM user_oauth_tokens t
WHERE t.user_id IS NOT NULL
  AND t.provider IS NOT NULL
  AND TRIM(t.provider) != '';

-- Distinct login lanes from auth_sessions (provider + subject)
INSERT OR IGNORE INTO account_identities (
  id, account_id, provider, provider_subject, email, created_at, updated_at
)
SELECT
  'aid_' || lower(hex(randomblob(8))),
  s.user_id,
  s.provider,
  COALESCE(NULLIF(TRIM(s.provider_subject), ''), s.user_id || ':' || s.provider),
  s.email,
  COALESCE(
    CAST(strftime('%s', s.created_at) AS INTEGER),
    unixepoch()
  ),
  unixepoch()
FROM auth_sessions s
WHERE s.user_id IS NOT NULL
  AND s.provider IS NOT NULL
  AND TRIM(s.provider) != ''
GROUP BY s.user_id, s.provider, COALESCE(NULLIF(TRIM(s.provider_subject), ''), s.user_id || ':' || s.provider);

-- -----------------------------------------------------------------------------
-- 6. tenants as orgs — owner_account_id, slug, meta_json
-- -----------------------------------------------------------------------------
UPDATE tenants
SET slug = COALESCE(
  NULLIF(TRIM(slug), ''),
  LOWER(REPLACE(REPLACE(REPLACE(id, 'tenant_', ''), ' ', '-'), '_', '-'))
)
WHERE slug IS NULL OR TRIM(slug) = '';

UPDATE tenants
SET meta_json = COALESCE(NULLIF(TRIM(meta_json), ''), NULLIF(TRIM(settings), ''), '{}')
WHERE meta_json IS NULL OR TRIM(meta_json) = '';

UPDATE tenants
SET owner_account_id = (
  SELECT au.id
  FROM auth_users au
  WHERE au.tenant_id = tenants.id
  ORDER BY COALESCE(au.is_superadmin, 0) DESC, au.created_at ASC
  LIMIT 1
)
WHERE owner_account_id IS NULL;

-- -----------------------------------------------------------------------------
-- 7. workspaces — org_id (= tenant), pty_path, settings_json
-- -----------------------------------------------------------------------------
UPDATE workspaces
SET org_id = COALESCE(NULLIF(TRIM(org_id), ''), NULLIF(TRIM(tenant_id), ''))
WHERE (org_id IS NULL OR TRIM(org_id) = '')
  AND tenant_id IS NOT NULL
  AND TRIM(tenant_id) != '';

UPDATE workspaces
SET settings_json = COALESCE(NULLIF(TRIM(settings_json), ''), '{}')
WHERE settings_json IS NULL OR TRIM(settings_json) = '';

UPDATE workspaces
SET pty_path = '/workspace/' || COALESCE(NULLIF(TRIM(org_id), ''), NULLIF(TRIM(tenant_id), ''), 'unknown') || '/'
WHERE pty_path IS NULL OR TRIM(pty_path) = '';

-- -----------------------------------------------------------------------------
-- 8. auth_sessions — type, org_id (token_hash backfill skipped: no raw tokens stored)
-- -----------------------------------------------------------------------------
UPDATE auth_sessions
SET type = COALESCE(NULLIF(TRIM(type), ''), 'browser')
WHERE type IS NULL OR TRIM(type) = '';

UPDATE auth_sessions
SET org_id = COALESCE(NULLIF(TRIM(org_id), ''), NULLIF(TRIM(tenant_id), ''))
WHERE (org_id IS NULL OR TRIM(org_id) = '')
  AND tenant_id IS NOT NULL
  AND TRIM(tenant_id) != '';

-- -----------------------------------------------------------------------------
-- 9. memberships from workspace_members + agentsam_user_policy
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO memberships (
  id, workspace_id, account_id, org_id, role,
  can_run_pty, can_run_mcp, can_deploy, joined_at, created_at
)
SELECT
  wm.id,
  wm.workspace_id,
  wm.user_id,
  COALESCE(
    NULLIF(TRIM(wm.tenant_id), ''),
    NULLIF(TRIM(au.tenant_id), ''),
    NULLIF(TRIM(w.tenant_id), ''),
    NULLIF(TRIM(w.org_id), ''),
    'tenant_unknown'
  ),
  CASE
    WHEN wm.member_type = 'agent' THEN 'agent'
    ELSE COALESCE(NULLIF(TRIM(wm.role), ''), 'member')
  END,
  COALESCE((
    SELECT MAX(p.can_run_pty)
    FROM agentsam_user_policy p
    WHERE p.user_id = wm.user_id
      AND (p.workspace_id = wm.workspace_id OR p.workspace_id = '' OR p.workspace_id IS NULL)
  ), CASE WHEN COALESCE(wm.role, '') = 'owner' THEN 1 ELSE 0 END),
  CASE
    WHEN EXISTS (
      SELECT 1 FROM agentsam_user_policy p
      WHERE p.user_id = wm.user_id
        AND (p.workspace_id = wm.workspace_id OR p.workspace_id = '' OR p.workspace_id IS NULL)
        AND COALESCE(p.mcp_tools_protection, 1) = 0
    ) THEN 1
    ELSE 1
  END,
  CASE WHEN COALESCE(wm.role, '') IN ('owner', 'admin') THEN 1 ELSE 0 END,
  COALESCE(
    CAST(wm.joined_at AS INTEGER),
    wm.created_at,
    unixepoch()
  ),
  COALESCE(wm.created_at, unixepoch())
FROM workspace_members wm
LEFT JOIN auth_users au ON au.id = wm.user_id
LEFT JOIN workspaces w ON w.id = wm.workspace_id
WHERE wm.user_id IS NOT NULL
  AND TRIM(wm.user_id) != ''
  AND COALESCE(wm.is_active, 1) = 1;

PRAGMA foreign_keys = ON;
