-- dev_workflows: upsert canonical row for CI/CD / dual-zone + sibling repos (matches production D1 schema).
-- Remote columns: id, tenant_id, name, description, category, steps_json, command_sequence,
--   estimated_time_minutes, success_rate, quality_score, is_template, tags, created_by,
--   last_used_at, use_count, created_at, updated_at
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-dev-workflows-insert-platform-setup.sql
--
-- Related MCP workflow: wf_cidi_agent_ui_sandbox_to_prod (scripts/d1-bootstrap-sandbox-workflow-20260322.sql)

INSERT OR REPLACE INTO dev_workflows (
  id,
  tenant_id,
  name,
  description,
  category,
  steps_json,
  command_sequence,
  estimated_time_minutes,
  success_rate,
  quality_score,
  is_template,
  tags,
  created_by,
  last_used_at,
  use_count,
  created_at,
  updated_at
) VALUES (
  'dw_cidi_inneranimal_platform',
  'tenant_sam_primeaux',
  'CI/CD inneranimalmedia + dashboard sandbox (2-zone) + MCP + PTY',
  'Production Worker inneranimalmedia + R2 agent-sam; sandbox Worker inneranimal-dashboard + R2 agent-sam-sandbox-cicd. Agent UI: upload sandbox script then PROMOTE_OK promote script. MCP Worker inneranimalmedia-mcp-server at mcp.inneranimalmedia.com. PTY/tunnel: github.com/SamPrimeaux/iam-pty, terminal.inneranimalmedia.com. GitHub webhooks: POST inneranimalmedia.com/api/webhooks/github; D1 webhook_endpoints.endpoint_path must match the URL GitHub calls. Local WIP = uncommitted git only; production unchanged until commit, R2 upload, deploy approved.',
  'cicd',
  '[{"step":1,"title":"Read system map","action":"doc","path":"docs/SYSTEM_CICD_ARCHITECTURE_README.md"},{"step":2,"title":"Handoff D1 + webhooks","action":"doc","path":"docs/CURSOR_HANDOFF_D1_CICD_ORCHESTRATION.md"},{"step":3,"title":"Sandbox UI upload","action":"shell","path":"./scripts/upload-repo-to-r2-sandbox.sh"},{"step":4,"title":"Promote agent UI to prod R2","action":"shell","path":"PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh"},{"step":5,"title":"Parallel MCP workflow","action":"mcp_workflow","id":"wf_cidi_agent_ui_sandbox_to_prod"},{"step":6,"title":"Worker deploy if code changed","action":"manual","note":"Sam types deploy approved; npm run deploy from repo root"},{"step":7,"context":{"production":{"worker":"inneranimalmedia","r2":"agent-sam","d1":"inneranimalmedia-business"},"sandbox":{"worker":"inneranimal-dashboard","workers_dev":"inneranimal-dashboard.meauxbility.workers.dev","r2":"agent-sam-sandbox-cicd"},"repos":{"dashboard":"https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard","mcp":"https://github.com/SamPrimeaux/inneranimalmedia-mcp-server","iam_pty":"https://github.com/SamPrimeaux/iam-pty"}}}]',
  './scripts/upload-repo-to-r2-sandbox.sh
PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-bootstrap-sandbox-workflow-20260322.sql',
  45,
  NULL,
  NULL,
  0,
  'cicd,sandbox,r2,mcp,pty,github-webhooks,dual-worker',
  'cursor-agent',
  NULL,
  0,
  unixepoch(),
  unixepoch()
);
