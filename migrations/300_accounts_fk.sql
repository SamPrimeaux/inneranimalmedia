-- =============================================================================
-- 300_accounts_fk.sql — accounts ↔ auth_users integrity + membership indexes
-- =============================================================================
-- accounts.id shares au_* with auth_users.id; enforce on INSERT via trigger.
-- Gap-fill on login: createLoginSession → ensureIdentityPlaneBeforeSession (Worker).
--
-- Apply: ./scripts/apply_migration_300_accounts_fk.sh
-- =============================================================================

PRAGMA foreign_keys = OFF;

-- Guard: accounts row must reference existing auth_users.id
DROP TRIGGER IF EXISTS trg_accounts_requires_auth_user;
CREATE TRIGGER trg_accounts_requires_auth_user
BEFORE INSERT ON accounts
FOR EACH ROW
WHEN NEW.id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'accounts.id must match an existing auth_users.id')
  WHERE NOT EXISTS (SELECT 1 FROM auth_users WHERE id = NEW.id);
END;

-- Performance indexes (idempotent; 299 may have created composite indexes)
CREATE INDEX IF NOT EXISTS idx_memberships_account_id ON memberships(account_id);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace_id ON memberships(workspace_id);

PRAGMA foreign_keys = ON;
