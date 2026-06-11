-- Platform operator identity normalize: Sam's three auth_users rows → ws_inneranimalmedia

-- 1. Fix ceosamprimeaux: wrong default_workspace_id (ws_ceosamprimeaux → ws_inneranimalmedia)
UPDATE auth_users
SET default_workspace_id = 'ws_inneranimalmedia',
    active_workspace_id  = 'ws_inneranimalmedia',
    updated_at           = unixepoch()
WHERE id = 'au_cd1d8f5ccce9e15a';

-- 2. workspace_members: give meauxbility + ceosamprimeaux owner access to ws_inneranimalmedia
INSERT OR IGNORE INTO workspace_members
  (user_id, workspace_id, role, tenant_id, is_active, created_at, updated_at)
VALUES
  ('au_cccac6ec2360ac75', 'ws_inneranimalmedia', 'owner', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_cd1d8f5ccce9e15a', 'ws_inneranimalmedia', 'owner', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch());

-- 3. OAuth surface allowlist: mirror info@'s rows for the other two user_ids
INSERT OR IGNORE INTO agentsam_mcp_oauth_user_client_allowlist
  (user_id, workspace_id, client_key, tenant_id, is_active, created_at, updated_at)
VALUES
  ('au_cccac6ec2360ac75', 'ws_inneranimalmedia', 'chatgpt', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_cccac6ec2360ac75', 'ws_inneranimalmedia', 'claude',  'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_cccac6ec2360ac75', 'ws_inneranimalmedia', 'cursor',  'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_cd1d8f5ccce9e15a', 'ws_inneranimalmedia', 'chatgpt', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_cd1d8f5ccce9e15a', 'ws_inneranimalmedia', 'claude',  'tenant_sam_primeaux', 1, unixepoch(), unixepoch()),
  ('au_cd1d8f5ccce9e15a', 'ws_inneranimalmedia', 'cursor',  'tenant_sam_primeaux', 1, unixepoch(), unixepoch());

-- 4. Kill require_allowlist_for_mcp for all three Sam user_ids across all workspaces
UPDATE agentsam_user_policy
SET require_allowlist_for_mcp = 0, updated_at = unixepoch()
WHERE user_id IN ('au_871d920d1233cbd1','au_cccac6ec2360ac75','au_cd1d8f5ccce9e15a');

-- 5. Revoke all expired-but-still-active stale tokens (cleanup sprawl)
UPDATE mcp_workspace_tokens
SET is_active = 0, revoked_at = unixepoch()
WHERE user_id IN ('au_871d920d1233cbd1','au_cccac6ec2360ac75','au_cd1d8f5ccce9e15a')
  AND expires_at < unixepoch()
  AND revoked_at IS NULL;
