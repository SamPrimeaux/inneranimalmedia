-- 634: MY_CONTAINER operator scripts — R2 inneranimalmedia/scripts/ + agentsam_scripts.
-- Upload: ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/scripts/<file> ...
-- Or:    ./scripts/sync-scripts-to-r2.sh (uploads all scripts/*.sh)

INSERT OR REPLACE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES
(
  'script_build_iam_sandbox_container',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'build_iam_sandbox_container',
  'Build + push iam-sandbox container (sandbox-v2)',
  'scripts/build-iam-sandbox-container.sh',
  './scripts/build-iam-sandbox-container.sh',
  'Builds containers/iam-sandbox and pushes meauxcontainer-mycontainer:sandbox-v2 to Cloudflare Registry. Requires Docker Desktop running.',
  'deploy',
  'bash',
  'bash',
  '48d4d0852247c12e2dec9d68d8bac7a44f3d4f53c47514ba7fc6522b0d4bafa9',
  0,
  1,
  1,
  1,
  0,
  1,
  'high',
  'container,my_container,sandbox-v2,wrangler,operator',
  'Run before deploy when container image changes. Pair with npm run deploy:full. Docker must be running locally.',
  'r2:inneranimalmedia/scripts/build-iam-sandbox-container.sh',
  unixepoch(),
  unixepoch()
),
(
  'script_smoke_my_container_exec',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'smoke_my_container_exec',
  'Smoke MY_CONTAINER exec via internal API',
  'scripts/smoke-my-container-exec.sh',
  './scripts/smoke-my-container-exec.sh',
  'POST /api/internal/my-container/exec with INTERNAL_API_SECRET from .env.cloudflare. Default command: echo hello from sandbox-v2.',
  'test',
  'bash',
  'bash',
  '9964bce3d475075c0718cb4ad322464a9b2c871b004db05f95c150971c99185d',
  0,
  1,
  1,
  1,
  1,
  0,
  'low',
  'container,my_container,smoke,operator,exec',
  'Read-only smoke against prod Worker. Optional arg: custom shell command string.',
  'r2:inneranimalmedia/scripts/smoke-my-container-exec.sh',
  unixepoch(),
  unixepoch()
);
