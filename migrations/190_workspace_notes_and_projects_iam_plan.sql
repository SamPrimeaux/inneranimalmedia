-- 190: workspace_notes (IAM CIDI plan) + workspace_projects descriptions, start_date, metadata.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/190_workspace_notes_and_projects_iam_plan.sql

INSERT INTO workspace_notes (workspace, title, content, tags, created_at, updated_at)
VALUES (
  'ws_inneranimalmedia',
  'IAM 3-tier CIDI and agent workflow plan',
  'Started: 2026-03-31 20:00 (America/Chicago).

Three workflow levels: L1 definition (workflows, mcp_workflows, agent_commands), L2 execution (workflow_runs, workflow_artifacts, playwright_jobs, queue), L3 governance (approved_at, awaiting_approval, deploy approved before promote).

Three CIDI tiers: T1 sandbox (inneranimal-dashboard, agent-sam-sandbox-cidi), T2 validate (benchmarks, Playwright on sandbox URLs), T3 prod (promote-to-prod.sh to agent-sam plus worker).

Brain components for agent refinement: agent-dashboard/src (AgentDashboard.jsx, SettingsPanel.jsx, FloatingPreviewPanel.jsx, main.jsx, plus supporting jsx), dashboard/agent.html and iam-workspace-shell.html, worker.js routes. Slash commands: POST /api/agent/commands/execute from agent_commands. Chat: POST /api/agent/chat. Workflows table wf_iam_* seeded for pipeline spec; align mcp_workflows and runner for /workflow.

APIs to wire end-to-end: artifact save plus workflow_artifacts, playwright_jobs with input_params_json, approval PATCH setting approved_at, promote external to Worker (CI or operator with promote-to-prod.sh).

Provider mix: interactive via worker (Anthropic, OpenAI, Gemini); batch eval offline; Cursor API for dev automation outside hot path.

Related workspace ws_agentsandbox: TOOLS public origin tools.inneranimalmedia.com; shell HTML under tools bucket code/ path.',
  'cidi,workflow,agent,plan',
  datetime('now'),
  datetime('now')
);

UPDATE workspace_projects
SET
  description = 'IAM Agent sandbox deliverable: single-file workspace chrome (iam-workspace-shell.html) with Explorer, Monaco editor tab, Excalidraw-oriented saves, and agent column; assets target TOOLS R2 (tools.inneranimalmedia.com). Integrates with 3-tier CIDI (sandbox build, validate, then promote) and Agent Sam workflows for incremental wiring of save paths, collab DO, and validation.',
  start_date = '2026-03-31 20:00',
  metadata_json = '{"started_at_local":"2026-03-31 20:00","timezone":"America/Chicago","tools_public_origin":"https://tools.inneranimalmedia.com","r2_bucket":"tools","shell_r2_key":"code/iam-workspace-shell.html","cidi_tier":"T1_sandbox"}',
  updated_at = unixepoch()
WHERE id = 'wp_agentsandbox_iam_shell';

UPDATE workspace_projects
SET
  description = 'Primary Inner Animal Media platform: Vite agent-dashboard and R2 agent-sam bundles, worker.js (auth, /api/agent/*, D1, R2, IAM_COLLAB, MYBROWSER), MCP server, slash commands from agent_commands, and governance (approval before promote-to-prod). This project anchors L1 workflow definitions, L2 run ledger (workflow_runs, workflow_artifacts, playwright_jobs), and L3 human gates for production.',
  start_date = '2026-03-31 20:00',
  metadata_json = '{"started_at_local":"2026-03-31 20:00","timezone":"America/Chicago","primary_domain":"inneranimalmedia.com","cidi_tiers":["T1_sandbox","T2_validate","T3_prod"],"workflow_catalog_ids":["wf_iam_artifact_init","wf_iam_monaco_save","wf_iam_excalidraw_save","wf_iam_playwright_validate","wf_iam_approval_gate","wf_iam_promote_prod"]}',
  updated_at = unixepoch()
WHERE id = 'wp_inneranimalmedia';
