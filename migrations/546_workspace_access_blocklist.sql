-- 546: Hard-block non-owner, non-superadmin access to platform operator workspaces.
-- These workspaces must NEVER appear in any non-superadmin user's workspace switcher,
-- API responses, or session resolution — regardless of tenant, membership, or session state.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/546_workspace_access_blocklist.sql

CREATE TABLE IF NOT EXISTS agentsam_workspace_blocklist (
  workspace_id   TEXT PRIMARY KEY,
  owner_user_id  TEXT NOT NULL,   -- only this auth_users.id may access
  reason         TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_workspace_blocklist_owner
  ON agentsam_workspace_blocklist (owner_user_id);

-- Platform operator workspaces — Sam only (au_871d920d1233cbd1)
INSERT OR IGNORE INTO agentsam_workspace_blocklist (workspace_id, owner_user_id, reason) VALUES
  ('ws_inneranimalmedia',      'au_871d920d1233cbd1', 'platform operator workspace'),
  ('ws_inneranimalmedia_mcp',  'au_871d920d1233cbd1', 'platform MCP workspace'),
  ('ws_sam_primeaux',          'au_871d920d1233cbd1', 'platform operator workspace'),
  ('ws_meauxbility',           'au_871d920d1233cbd1', 'nonprofit operator workspace'),
  ('ws_meauxwork',             'au_871d920d1233cbd1', 'platform operator workspace'),
  ('ws_meauxcloud',            'au_871d920d1233cbd1', 'platform operator workspace');

-- Revoke any stale workspace_members rows for non-owner users on these workspaces
DELETE FROM workspace_members
WHERE workspace_id IN (
  'ws_inneranimalmedia',
  'ws_inneranimalmedia_mcp',
  'ws_sam_primeaux',
  'ws_meauxbility',
  'ws_meauxwork',
  'ws_meauxcloud'
)
AND user_id != 'au_871d920d1233cbd1';

-- Revoke any stale auth_sessions pointing at blocked workspaces for non-owner users
UPDATE auth_sessions
SET revoked_at = datetime('now'),
    revoke_reason = 'workspace_blocklist_546'
WHERE workspace_id IN (
  'ws_inneranimalmedia',
  'ws_inneranimalmedia_mcp',
  'ws_sam_primeaux',
  'ws_meauxbility',
  'ws_meauxwork',
  'ws_meauxcloud'
)
AND user_id != 'au_871d920d1233cbd1'
AND (revoked_at IS NULL OR TRIM(COALESCE(revoked_at, '')) = '');
