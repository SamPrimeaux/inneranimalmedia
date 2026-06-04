-- 549: Operator deploy + D1 migration scripts — safe_to_run for superadmin Agent Sam (no approval gate).
-- Unblocks npm run deploy:full, d1-apply-pending (incl. destructive DML), wrangler-only fallback.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/549_agentsam_operator_deploy_d1_scripts.sql

INSERT OR IGNORE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES
(
  'script_d1_apply_pending_dry_run',
  'tenant_sam_primeaux',
  '*',
  'd1_apply_pending_dry_run',
  'D1 migrations — list pending (dry-run)',
  '',
  './scripts/with-cloudflare-env.sh node scripts/d1-apply-pending.mjs --dry-run',
  'Diff migrations/*.sql vs d1_migrations ledger; list pending files without applying.',
  'd1',
  'bash',
  'bash',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'low',
  'd1,migrations,deploy,operator',
  'Read-only ledger diff. Use d1_apply_pending_apply to execute pending SQL.',
  'repo:scripts/d1-apply-pending.mjs',
  unixepoch(),
  unixepoch()
),
(
  'script_d1_apply_pending_apply',
  'tenant_sam_primeaux',
  '*',
  'd1_apply_pending_apply',
  'D1 migrations — apply pending (incl. destructive DML)',
  '',
  'D1_ALLOW_DESTRUCTIVE=1 ./scripts/with-cloudflare-env.sh node scripts/d1-apply-pending.mjs --apply --allow-destructive',
  'Apply all pending migration files via wrangler d1 execute --file. Includes DELETE/revoke DML when flagged destructive.',
  'd1',
  'bash',
  'bash',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'medium',
  'd1,migrations,deploy,operator,destructive',
  'Matches deploy:full default (D1_ALLOW_DESTRUCTIVE=1). Requires .env.cloudflare / with-cloudflare-env.',
  'repo:scripts/d1-apply-pending.mjs',
  unixepoch(),
  unixepoch()
),
(
  'script_npm_deploy_full',
  'tenant_sam_primeaux',
  '*',
  'npm_deploy_full',
  'Production deploy — npm run deploy:full',
  'deploy:full',
  '',
  'Vite build, R2 sync, D1 migrations (destructive allowed), wrangler deploy. Canonical operator ship path.',
  'deploy',
  'npm',
  'bash',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'high',
  'deploy,production,worker,r2,d1',
  'Same as manual npm run deploy:full. No pre-deploy test/smoke unless you run separately.',
  'repo:package.json#deploy:full',
  unixepoch(),
  unixepoch()
),
(
  'script_wrangler_deploy_production',
  'tenant_sam_primeaux',
  '*',
  'wrangler_deploy_production',
  'Worker only — wrangler deploy production',
  '',
  './scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml',
  'Deploy main worker only (skip Vite/R2/migrations). Use when deploy:full stopped after D1 step or for hotfix worker pushes.',
  'deploy',
  'bash',
  'bash',
  '',
  1,
  1,
  1,
  1,
  1,
  0,
  'high',
  'deploy,worker,wrangler,hotfix',
  'Fallback when npm run deploy:full migrations already applied. Does not run dashboard build.',
  'repo:wrangler.production.toml',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_scripts
SET
  name = 'Production deploy — npm run deploy:full (frontend script)',
  path = 'scripts/deploy-frontend.sh',
  body = '',
  description = 'Vite build, R2 sync, D1 migrations (D1_ALLOW_DESTRUCTIVE=1 default), wrangler deploy production worker.',
  purpose = 'deploy',
  runner = 'bash',
  language = 'bash',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'high',
  preferred_for = 'deploy,production,worker,r2,d1,operator',
  notes = 'Invoked by npm run deploy:full. Destructive DML migrations apply by default; set D1_ALLOW_DESTRUCTIVE=0 to block.',
  source_stored = 'repo:scripts/deploy-frontend.sh',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_frontend'
  AND tenant_id = 'tenant_sam_primeaux';

UPDATE agentsam_scripts
SET
  safe_to_run = 1,
  approval_required = 0,
  owner_only = 1,
  risk_level = 'high',
  preferred_for = 'deploy,production,full-pipeline,operator',
  notes = 'Full pipeline (route-map, reingest, deploy-frontend, eval). Prefer npm_deploy_full slug for npm run deploy:full. Requires ALLOW_UNSAFE_R2_RECONCILE=1 or deploy:full:safe.',
  updated_at_epoch = unixepoch()
WHERE slug = 'deploy_full'
  AND tenant_id = 'tenant_sam_primeaux';

UPDATE agentsam_scripts
SET
  name = 'D1 migrations — list pending (dry-run)',
  body = './scripts/with-cloudflare-env.sh node scripts/d1-apply-pending.mjs --dry-run',
  description = 'Diff migrations/*.sql vs d1_migrations ledger; list pending files without applying.',
  purpose = 'd1',
  runner = 'bash',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'low',
  preferred_for = 'd1,migrations,deploy,operator',
  notes = 'Read-only ledger diff. Use d1_apply_pending_apply to execute pending SQL.',
  source_stored = 'repo:scripts/d1-apply-pending.mjs',
  updated_at_epoch = unixepoch()
WHERE slug = 'd1_apply_pending_dry_run';

UPDATE agentsam_scripts
SET
  name = 'D1 migrations — apply pending (incl. destructive DML)',
  body = 'D1_ALLOW_DESTRUCTIVE=1 ./scripts/with-cloudflare-env.sh node scripts/d1-apply-pending.mjs --apply --allow-destructive',
  description = 'Apply all pending migration files via wrangler d1 execute --file. Includes DELETE/revoke DML when flagged destructive.',
  purpose = 'd1',
  runner = 'bash',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'medium',
  preferred_for = 'd1,migrations,deploy,operator,destructive',
  notes = 'Matches deploy:full default (D1_ALLOW_DESTRUCTIVE=1). Requires .env.cloudflare / with-cloudflare-env.',
  source_stored = 'repo:scripts/d1-apply-pending.mjs',
  updated_at_epoch = unixepoch()
WHERE slug = 'd1_apply_pending_apply';

UPDATE agentsam_scripts
SET
  name = 'Production deploy — npm run deploy:full',
  path = 'deploy:full',
  body = '',
  runner = 'npm',
  description = 'Vite build, R2 sync, D1 migrations (destructive allowed), wrangler deploy. Canonical operator ship path.',
  purpose = 'deploy',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'high',
  preferred_for = 'deploy,production,worker,r2,d1',
  notes = 'Same as manual npm run deploy:full. No pre-deploy test/smoke unless you run separately.',
  source_stored = 'repo:package.json#deploy:full',
  updated_at_epoch = unixepoch()
WHERE slug = 'npm_deploy_full';

UPDATE agentsam_scripts
SET
  name = 'Worker only — wrangler deploy production',
  body = './scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml',
  description = 'Deploy main worker only (skip Vite/R2/migrations). Use when deploy:full stopped after D1 step or for hotfix worker pushes.',
  purpose = 'deploy',
  runner = 'bash',
  requires_env = 1,
  owner_only = 1,
  safe_to_run = 1,
  approval_required = 0,
  risk_level = 'high',
  preferred_for = 'deploy,worker,wrangler,hotfix',
  notes = 'Fallback when npm run deploy:full migrations already applied. Does not run dashboard build.',
  source_stored = 'repo:wrangler.production.toml',
  updated_at_epoch = unixepoch()
WHERE slug = 'wrangler_deploy_production';
