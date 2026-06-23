-- 682: Repair agentsam_workspace.github_repo drift from workspaces compat table.
-- Root cause: agentsam_workspace held SamPrimeaux/inneranimalmedia for ws_fuelnfreetime
-- while workspaces.github_repo correctly had SamPrimeaux/fuelnfreetime.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/682_workspace_github_repo_drift_fix.sql

PRAGMA foreign_keys = OFF;

-- Sync agentsam from workspaces when compat row has a non-empty repo and values differ.
UPDATE agentsam_workspace
SET
  github_repo = (
    SELECT w.github_repo
    FROM workspaces w
    WHERE w.id = agentsam_workspace.id
      AND w.github_repo IS NOT NULL
      AND TRIM(w.github_repo) != ''
    LIMIT 1
  ),
  updated_at = unixepoch()
WHERE id IN (
  SELECT aw.id
  FROM agentsam_workspace aw
  INNER JOIN workspaces w ON w.id = aw.id
  WHERE w.github_repo IS NOT NULL
    AND TRIM(w.github_repo) != ''
    AND COALESCE(aw.github_repo, '') != TRIM(w.github_repo)
);

-- Explicit fuel anchor (idempotent).
UPDATE agentsam_workspace
SET github_repo = 'SamPrimeaux/fuelnfreetime', updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

UPDATE workspaces
SET github_repo = 'SamPrimeaux/fuelnfreetime', updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

PRAGMA foreign_keys = ON;
