-- 204: Canonical CIDI three-step system in project_memory + plan_steps for IAM TOOLS workspace (accomplished + next).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/204_project_memory_cidi_three_step_and_plan_steps.sql

INSERT OR REPLACE INTO project_memory (
  id,
  project_id,
  tenant_id,
  memory_type,
  key,
  value,
  importance_score,
  confidence_score,
  created_by,
  created_at,
  updated_at
) VALUES (
  'pmem_cidi_three_step_v1',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'workflow',
  'CIDI_THREE_STEP_SYSTEM',
  '{"version":"1","name":"CIDI three-step pipeline","extends_keys":["DEPLOY_WORKFLOW_CANONICAL","DEPLOY_RULES"],"steps":[{"n":1,"name":"Sandbox build and R2 upload","commands":["cd agent-dashboard && npm run build:vite-only","cd .. && ./scripts/deploy-sandbox.sh"],"worker":"inneranimal-dashboard","sandbox_agent_url":"https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent","sandbox_shell_url":"https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/iam-workspace-shell","r2_bucket":"agent-sam-sandbox-cidi","notes":"Script uploads dist, agent.html (vbump v=), iam-workspace-shell.html, shell.css."},{"n":2,"name":"Benchmark gate","commands":["./scripts/benchmark-full.sh sandbox"],"must_pass_before_promote":true},{"n":3,"name":"Promote to production","commands":["./scripts/promote-to-prod.sh"],"operator_human":"sam","prod_agent_url":"https://inneranimalmedia.com/dashboard/agent","verify":["curl sandbox and prod /dashboard/agent | grep v= match after promote"]}],"d1_logging":{"git_push":"cicd_runs","narrative":"cidi_activity_log","pipeline_run":"cidi_pipeline_runs","step_results":"cidi_run_results","example":"SELECT value FROM project_memory WHERE project_id=''inneranimalmedia'' AND key=''CIDI_THREE_STEP_SYSTEM'';"},"repo_docs":["tools/code/skills/WORKFLOW.md","tools/code/skills/DEPLOY-CIDI.md","tools/code/README.md"]}',
  1.0,
  1.0,
  'cursor_agent',
  unixepoch(),
  unixepoch()
);

DELETE FROM plan_steps WHERE project_id = 'proj_iam_tools_agent_workspace' AND step_index BETWEEN 1 AND 10;

INSERT INTO plan_steps (id, project_id, step_index, title, description, status, notes_md, links_json) VALUES
('ps_cidi_ws_01', 'proj_iam_tools_agent_workspace', 1, 'tools/code runbooks + TOOLS R2 mirror', 'Core READMEs (core-*), integration pack, skills; uploaded to tools bucket code/ prefix.', 'complete', 'Done: public URLs under tools.inneranimalmedia.com/code/...', '["https://tools.inneranimalmedia.com/code/README.md"]'),
('ps_cidi_ws_02', 'proj_iam_tools_agent_workspace', 2, 'Cursor skill + autorag index', '.cursor/skills/iam-platform-sync/SKILL.md; docs/autorag/context/iam-rag-index.md on autorag bucket.', 'complete', 'Agents load SKILL; RAG index points at TOOLS URLs.', '["https://autorag.inneranimalmedia.com/context/iam-rag-index.md"]'),
('ps_cidi_ws_03', 'proj_iam_tools_agent_workspace', 3, 'deploy-sandbox.sh: workspace shell + shell.css', 'Extended script uploads iam-workspace-shell.html and shell.css to agent-sam-sandbox-cidi.', 'complete', 'Keys static/dashboard/iam-workspace-shell.html and static/dashboard/shell.css.', '[]'),
('ps_cidi_ws_04', 'proj_iam_tools_agent_workspace', 4, 'Monaco TOOLS upload script + CORS policy file', 'scripts/upload-monaco-to-tools-r2.sh; scripts/r2-cors-tools-bucket.json; applied CORS on tools bucket.', 'complete', 'CORS allows listed origins; monaco vs tree optional upload.', '[]'),
('ps_cidi_ws_05', 'proj_iam_tools_agent_workspace', 5, 'Git main + push 393a9c0 + migration 203', 'main branch; chore commit; D1 logged cicd_runs, cidi_activity_log, cidi_pipeline_runs, cidi_run_results.', 'complete', 'Follow-up dbf0cf2 documents migration 203 in repo.', '[]'),
('ps_cidi_ws_06', 'proj_iam_tools_agent_workspace', 6, 'project_memory CIDI_THREE_STEP_SYSTEM', 'This migration: single canonical JSON row for agents.', 'complete', 'Query: SELECT value FROM project_memory WHERE key=''CIDI_THREE_STEP_SYSTEM'';', '[]'),
('ps_cidi_ws_07', 'proj_iam_tools_agent_workspace', 7, 'Run sandbox deploy (live v=)', 'Execute deploy-sandbox.sh so sandbox serves current agent.html + dist + shell.', 'not_started', 'Pending until Sam/CI runs script; updates cidi_pipeline_runs when done.', '[]'),
('ps_cidi_ws_08', 'proj_iam_tools_agent_workspace', 8, 'benchmark-full.sh sandbox', 'Gate before promote; update cidi_run_results from skip to pass/fail.', 'not_started', 'Depends on step 7.', '[]'),
('ps_cidi_ws_09', 'proj_iam_tools_agent_workspace', 9, 'promote-to-prod.sh', 'Sam runs; copies sandbox R2 to prod; deploys worker.', 'not_started', 'Requires benchmark gate.', '[]'),
('ps_cidi_ws_10', 'proj_iam_tools_agent_workspace', 10, 'Verify prod v= + benchmark prod', 'curl prod and sandbox v= match; ./scripts/benchmark-full.sh prod optional.', 'not_started', 'Final CIDI closeout.', '[]');
