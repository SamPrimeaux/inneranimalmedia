-- Connor workspace must not inherit Sam's github_repo SSOT.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--   -c wrangler.production.toml --file=./migrations/542_connor_workspace_github_repo_scope.sql

UPDATE workspaces
SET github_repo = NULL,
    updated_at = unixepoch()
WHERE id = 'ws_connor_mcneely'
  AND (
    github_repo IS NULL
    OR github_repo LIKE 'SamPrimeaux/%'
    OR github_repo = 'SamPrimeaux/inneranimalmedia'
  );

UPDATE agentsam_workspace
SET github_repo = NULL,
    updated_at = unixepoch()
WHERE id = 'ws_connor_mcneely'
  AND (
    github_repo IS NULL
    OR github_repo LIKE 'SamPrimeaux/%'
  );
