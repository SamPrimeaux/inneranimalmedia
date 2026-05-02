-- CI/CD bootstrap: sandbox R2 registry, MCP workflow (2-step agent UI lane), worker_registry cleanup.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-bootstrap-sandbox-workflow-20260322.sql

INSERT OR REPLACE INTO r2_buckets (
  id, tenant_id, bucket_name, display_name, description, region, public_access,
  s3_url, catalog_url, warehouse_name, public_dev_url, is_active, created_at, updated_at
) VALUES (
  'r2_agent_sam_sandbox_cidi',
  'system',
  'agent-sam-sandbox-cidi',
  'Agent Sam — Sandbox (CI/CD)',
  'Dashboard static mirror for UI iteration; production bucket remains agent-sam. Region WNAM.',
  'wnam',
  0,
  'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/agent-sam-sandbox-cidi',
  'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/agent-sam-sandbox-cidi',
  'ede6590ac0d2fb7daf155b35653457b2_agent-sam-sandbox-cidi',
  'https://pub-08888c8207d64fcdbe61d3aa80cab347.r2.dev',
  1,
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO mcp_workflows (
  id,
  tenant_id,
  name,
  description,
  category,
  trigger_type,
  trigger_config_json,
  steps_json,
  timeout_seconds,
  requires_approval,
  status,
  created_at,
  updated_at
) VALUES (
  'wf_cidi_agent_ui_sandbox_to_prod',
  'tenant_sam_primeaux',
  'CI/CD — Agent UI: sandbox R2 then production R2',
  'Step 1: sync repo dashboard + Vite outputs to agent-sam-sandbox-cidi (./scripts/upload-repo-to-r2-sandbox.sh). Step 2: after Sam approval, promote agent shell + bundle to agent-sam (PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh). Worker deploy only with deploy approved. Full playbook: docs/CURSOR_HANDOFF_D1_CICD_ORCHESTRATION.md',
  'deploy',
  'manual',
  '{"repo":"march1st-inneranimalmedia","sandbox_bucket":"agent-sam-sandbox-cidi","prod_bucket":"agent-sam"}',
  '[{"step":1,"name":"Verify sandbox + prod buckets in D1","tool":"d1_query","agent":"mcp_agent_operator","params":{"query":"SELECT id, bucket_name, display_name FROM r2_buckets WHERE id IN (''r2_agent_sam'',''r2_agent_sam_sandbox_cidi'') ORDER BY bucket_name"},"requires_approval":false,"on_failure":"halt","cidi_handoff":"From repo root: ./scripts/upload-repo-to-r2-sandbox.sh (build agent-dashboard / overview-dashboard first if JSX changed)"},{"step":2,"name":"Production promotion gate","tool":"d1_query","agent":"mcp_agent_operator","params":{"query":"SELECT id, title, status FROM roadmap_steps WHERE id IN (''step_sandbox_agent_promote_workflow'',''step_agent_theme_initial_paint'')"},"requires_approval":true,"on_failure":"halt","cidi_handoff":"PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh; if worker.js changed, Sam must type deploy approved before wrangler deploy"}]',
  600,
  1,
  'active',
  unixepoch(),
  unixepoch()
);

UPDATE worker_registry SET
  worker_type = 'staging',
  script_name = 'inneranimal-dashboard',
  workers_dev_subdomain = 'inneranimal-dashboard.meauxbility.workers.dev',
  r2_buckets = '["agent-sam-sandbox-cidi","agent-sam-sandbox-cidi"]',
  bindings_count = 3,
  notes = COALESCE(notes, '') || ' | CI/CD: R2 sandbox agent-sam-sandbox-cidi (DASHBOARD+ASSETS); promote via scripts/promote-agent-dashboard-to-production.sh after approval.',
  updated_at = unixepoch()
WHERE id = 'wr_inneranimal_dashboard_001';

UPDATE github_repositories SET
  status_notes = TRIM(COALESCE(status_notes, '') || ' workers_dev_subdomain = inneranimal-dashboard preview; production Worker name inneranimalmedia unchanged.'),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1 AND (status_notes IS NULL OR status_notes NOT LIKE '%inneranimal-dashboard preview%');
