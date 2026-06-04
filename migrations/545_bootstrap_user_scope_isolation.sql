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
