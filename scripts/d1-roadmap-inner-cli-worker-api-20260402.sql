-- Roadmap: @inneranimal/cli + Dashboard + Worker shared HTTP APIs
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-roadmap-inner-cli-worker-api-20260402.sql

INSERT INTO roadmap_plans (
  id,
  tenant_id,
  scope,
  title,
  objective,
  status,
  start_date,
  end_date,
  created_at,
  updated_at
) VALUES (
  'plan_inner_cli_worker_api_v1',
  'tenant_sam_primeaux',
  'platform',
  'InnerAnimal CLI + Worker HTTP APIs (shared with dashboard)',
  'Deliver npm package @inneranimal/cli that calls the same Cloudflare Worker /api/* routes as the React dashboard. CLI and dashboard integrate only at HTTP (not xterm): CLI uses Bearer token stored in ~/.inneranimal/config.json; browser uses session cookies. Running npx @inneranimal/cli inside the web PTY is unchanged shell IO. Workstreams: (1) token lifecycle POST /api/auth/cli-token or equivalent with audit and revoke; (2) document and consume existing routes R2 /api/r2/*, projects /api/projects, deployments /api/deployments/*, agent /api/agent/*, telemetry; (3) scaffold bin/cli.mjs, WorkerClient, commands status project deploy r2 telemetry config; (4) optional monorepo packages/inneranimal-cli; (5) npm publish and README.',
  'planned',
  date('now'),
  NULL,
  datetime('now'),
  datetime('now')
);

INSERT INTO roadmap_steps (
  id,
  tenant_id,
  plan_id,
  order_index,
  title,
  description,
  status,
  created_at,
  updated_at
) VALUES
(
  'step_inner_cli_token_api',
  'tenant_sam_primeaux',
  'plan_inner_cli_worker_api_v1',
  1,
  'CLI auth: mint and validate Bearer tokens on Worker',
  'Add POST /api/auth/cli-token (or equivalent) with secure storage, expiry, revoke; align with INTERNAL_API_SECRET or vault patterns; no browser cookie dependency.',
  'todo',
  datetime('now'),
  datetime('now')
),
(
  'step_inner_cli_http_surface',
  'tenant_sam_primeaux',
  'plan_inner_cli_worker_api_v1',
  2,
  'Map CLI commands to existing Worker routes',
  'Reuse /api/r2/list get upload, /api/projects, /api/deployments/*, /api/agent/*, telemetry endpoints; add thin aggregators only where needed (e.g. single status JSON).',
  'todo',
  datetime('now'),
  datetime('now')
),
(
  'step_inner_cli_package_scaffold',
  'tenant_sam_primeaux',
  'plan_inner_cli_worker_api_v1',
  3,
  'Scaffold @inneranimal/cli (bin/cli.mjs, WorkerClient, config)',
  'npx entry, ~/.inneranimal/config.json for base URL and token, shared fetch wrapper, pretty tables and spinners.',
  'todo',
  datetime('now'),
  datetime('now')
),
(
  'step_inner_cli_npm_publish',
  'tenant_sam_primeaux',
  'plan_inner_cli_worker_api_v1',
  4,
  'Publish CLI to npm and document first-run',
  'CI publish on tag, README for config init and example commands; smoke test against production API.',
  'todo',
  datetime('now'),
  datetime('now')
);
