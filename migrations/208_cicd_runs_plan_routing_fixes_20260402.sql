-- plan_routing_fixes (2026-04-02): record CIDI row before merge to main for worker-only routing + model-perf-sync work.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/208_cicd_runs_plan_routing_fixes_20260402.sql

INSERT INTO cicd_runs (
  id,
  worker_name,
  environment,
  deployment_type,
  trigger_source,
  triggered_by,
  status,
  conclusion,
  git_branch,
  git_commit_sha,
  notes,
  phase_sandbox_status,
  phase_sandbox_completed_at,
  completed_at,
  created_at,
  updated_at
) VALUES (
  'run_manual_plan_routing_fixes_20260402',
  'inneranimal-dashboard',
  'sandbox',
  'worker_r2',
  'manual',
  'sam_primeaux',
  'success',
  'success',
  'agentsam-clean',
  'fdf2804cc21707af533bc960438faf9facbbfd49',
  'plan_routing_fixes steps 1-3: classifyIntent confidence on routing_decisions; POST /api/internal/model-perf-sync; sandbox deploy with --worker-only (no R2).',
  'passed',
  unixepoch(),
  unixepoch(),
  unixepoch(),
  unixepoch()
);
