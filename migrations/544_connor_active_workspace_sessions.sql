-- Connor: pin active workspace/tenant and heal stale session workspace_id (idempotent).
-- Apply: wrangler d1 execute inneranimalmedia-business --remote
--   -c wrangler.production.toml --file=./migrations/544_connor_active_workspace_sessions.sql

UPDATE auth_users
SET active_workspace_id = 'ws_connor_mcneely',
    active_tenant_id = 'tenant_connor_mcneely',
    tenant_id = COALESCE(NULLIF(TRIM(tenant_id), ''), 'tenant_connor_mcneely'),
    updated_at = unixepoch()
WHERE id = 'au_5d17673408aaebc7';

-- Cross-tenant membership rows (e.g. MCP operator workspace) must not appear in customer switchers.
DELETE FROM workspace_members
WHERE user_id IN ('au_5d17673408aaebc7', 'connor_mcneely')
  AND workspace_id IN (
    'ws_inneranimalmedia',
    'ws_inneranimalmedia_mcp',
    'ws_sam_primeaux',
    'ws_meauxbility',
    'ws_meauxwork',
    'ws_meauxcloud'
  );

UPDATE user_settings
SET default_workspace_id = 'ws_connor_mcneely',
    updated_at = unixepoch()
WHERE user_id = 'au_5d17673408aaebc7'
  AND (default_workspace_id IS NULL OR default_workspace_id != 'ws_connor_mcneely');
