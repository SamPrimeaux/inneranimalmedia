-- 545: Deactivate tenant-wide bootstrap rows on multi-member workspaces (cross-user bleed).
-- Runtime: resolveActiveBootstrap no longer selects tenant-only rows (src/core/bootstrap.js).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/545_bootstrap_user_scope_isolation.sql

UPDATE agentsam_bootstrap
SET is_active = 0,
    updated_at = datetime('now')
WHERE (user_id IS NULL OR trim(user_id) = '')
  AND COALESCE(is_active, 1) = 1
  AND workspace_id IN (
    SELECT workspace_id
      FROM workspace_members
     WHERE COALESCE(is_active, 1) = 1
     GROUP BY workspace_id
    HAVING COUNT(DISTINCT user_id) > 1
  );

-- 545a: Fix Connor's stale active_workspace_id pointing at ws_inneranimalmedia.
-- Without this, resolveEffectiveWorkspaceId trusts auth_users.active_workspace_id
-- and boots his session into Sam's workspace, injecting SamPrimeaux/inneranimalmedia
-- as github_repo context into every Agent Sam prompt.
UPDATE auth_users
SET active_workspace_id = 'ws_connor_mcneely',
    active_tenant_id    = 'tenant_connor_mcneely'
WHERE id = 'au_5d17673408aaebc7'
  AND (
    active_workspace_id != 'ws_connor_mcneely'
    OR active_tenant_id  != 'tenant_connor_mcneely'
    OR active_workspace_id IS NULL
    OR active_tenant_id   IS NULL
  );
