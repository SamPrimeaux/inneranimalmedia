-- Link plan_inner_cli_worker_api_v1 to docs/roadmap/cli-npm-publish-mechanics.md (full runbook in git, not in D1).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-roadmap-cli-npm-runbook-pointer.sql

UPDATE roadmap_plans
SET
  objective = objective || ' Publishing runbook (repo): docs/roadmap/cli-npm-publish-mechanics.md',
  updated_at = datetime('now')
WHERE id = 'plan_inner_cli_worker_api_v1';

UPDATE roadmap_steps
SET
  description = 'CI on tag cli@*, NPM_TOKEN, README. Full npm/scoped/CI/monorepo/PTY mechanics: docs/roadmap/cli-npm-publish-mechanics.md',
  links_json = '{"runbook_doc":"docs/roadmap/cli-npm-publish-mechanics.md"}',
  updated_at = datetime('now')
WHERE id = 'step_inner_cli_npm_publish';
