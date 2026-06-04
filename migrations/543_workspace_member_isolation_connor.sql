-- Enforce Connor identity tenant + strip cross-user workspace membership (idempotent).
-- Apply: wrangler d1 execute inneranimalmedia-production --remote
--   -c wrangler.production.toml --file=./migrations/543_workspace_member_isolation_connor.sql

UPDATE auth_users
SET tenant_id = 'tenant_connor_mcneely',
    updated_at = unixepoch()
WHERE id = 'au_5d17673408aaebc7'
  AND (tenant_id IS NULL OR tenant_id != 'tenant_connor_mcneely');

DELETE FROM workspace_members
WHERE user_id IN ('au_5d17673408aaebc7', 'connor_mcneely')
  AND workspace_id IN (
    'ws_inneranimalmedia',
    'ws_sam_primeaux',
    'ws_meauxbility',
    'ws_meauxwork',
    'ws_meauxcloud'
  );

UPDATE workspaces
SET github_repo = NULL,
    updated_at = datetime('now')
WHERE id = 'ws_connor_mcneely'
  AND github_repo IS NOT NULL
  AND LOWER(github_repo) LIKE 'samprimeaux/%';
