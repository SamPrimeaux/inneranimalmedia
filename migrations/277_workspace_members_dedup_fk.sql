PRAGMA foreign_keys = OFF;

-- Fix typo workspace IDs before anything else
UPDATE workspace_members SET workspace_id = 'ws_sam_primeaux'   WHERE workspace_id = 'ws_info';
UPDATE workspace_members SET workspace_id = 'ws_connor_mcneely' WHERE workspace_id = 'ws_connordmcneely';

-- Fix NULL tenant_id
UPDATE workspace_members SET tenant_id = 'tenant_sam_primeaux'   WHERE workspace_id = 'ws_sam_primeaux'   AND tenant_id IS NULL;
UPDATE workspace_members SET tenant_id = 'tenant_connor_mcneely' WHERE workspace_id = 'ws_connor_mcneely' AND tenant_id IS NULL;

-- Backfill user_id from auth_users by email
UPDATE workspace_members SET user_id = (
  SELECT id FROM auth_users WHERE auth_users.email = workspace_members.email
) WHERE email IS NOT NULL AND email != '' AND user_id IS NULL;

-- Dedup by (workspace_id, user_id) — keep MAX(rowid), delete the rest
DELETE FROM workspace_members
WHERE user_id IS NOT NULL
  AND rowid NOT IN (
    SELECT MAX(rowid) FROM workspace_members
    WHERE user_id IS NOT NULL
    GROUP BY workspace_id, user_id
  );

-- Dedup by (workspace_id, email) for any remaining NULL user_id rows
DELETE FROM workspace_members
WHERE user_id IS NULL
  AND email IS NOT NULL AND email != ''
  AND rowid NOT IN (
    SELECT MAX(rowid) FROM workspace_members
    WHERE user_id IS NULL AND email IS NOT NULL AND email != ''
    GROUP BY workspace_id, email
  );

-- Recreate with proper constraints
CREATE TABLE workspace_members_new (
  id             TEXT    PRIMARY KEY DEFAULT ('wsm_' || lower(hex(randomblob(8)))),
  workspace_id   TEXT    NOT NULL,
  tenant_id      TEXT    REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        TEXT    REFERENCES auth_users(id) ON DELETE CASCADE,
  member_id      TEXT,
  member_type    TEXT    NOT NULL DEFAULT 'user'
                         CHECK(member_type IN ('user','agent','service','student','client','project')),
  email          TEXT,
  display_name   TEXT,
  role           TEXT    NOT NULL DEFAULT 'member'
                         CHECK(role IN ('owner','admin','member','viewer','billing')),
  workspace_role TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  superadmin_uuid TEXT,
  person_uuid    TEXT,
  joined_at      TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(workspace_id, user_id)
);

INSERT INTO workspace_members_new SELECT
  id, workspace_id, tenant_id, user_id, member_id,
  member_type, email, display_name, role,
  workspace_role, is_active, superadmin_uuid, person_uuid,
  joined_at, created_at, updated_at
FROM workspace_members;

DROP TABLE workspace_members;
ALTER TABLE workspace_members_new RENAME TO workspace_members;

CREATE INDEX idx_wsm_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_wsm_tenant    ON workspace_members(tenant_id);
CREATE INDEX idx_wsm_user      ON workspace_members(user_id);
CREATE INDEX idx_wsm_email     ON workspace_members(email);
CREATE INDEX idx_wsm_active    ON workspace_members(is_active);

PRAGMA foreign_keys = ON;
