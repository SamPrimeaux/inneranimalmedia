-- roadmap_steps: sandbox agent UI lane + theme FOUC + promotion workflow
INSERT OR REPLACE INTO roadmap_steps (
  id, tenant_id, plan_id, order_index, title, description, owner, due_date, status, links_json, created_at, updated_at
) VALUES
(
  'step_agent_theme_initial_paint',
  'system',
  'plan_iam_dashboard_v1',
  28,
  'Agent /dashboard/agent — first-load theme (no FOUC)',
  'Root cause addressed 2026-03-22: agent.html now loads styles_themes.css + shell.css in head; always fetch /api/settings/theme on load (not only when localStorage preset). Re-upload dashboard/agent.html to sandbox + prod R2 after edits. Verify inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent cold load.',
  NULL,
  NULL,
  'in_progress',
  '{"repo":["dashboard/agent.html"],"scripts":["scripts/upload-repo-to-r2-sandbox.sh","scripts/promote-agent-dashboard-to-production.sh"]}',
  datetime('now'),
  datetime('now')
),
(
  'step_sandbox_agent_promote_workflow',
  'system',
  'plan_iam_dashboard_v1',
  29,
  'Sandbox agent UI to production — scripts and Agent workflow',
  'Sandbox: inneranimal-dashboard + R2 agent-sam-sandbox-cicd. Iterate with upload-repo-to-r2-sandbox.sh. Production agent bundle: PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh then Sam deploy approved if worker changes. Future: wire Agent /workflow or slash command to run promotion checklist (multistep CI/CD) — document in agent_commands or recipes.',
  NULL,
  NULL,
  'in_progress',
  '{"sandbox_url":"https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent","prod_url":"https://inneranimalmedia.com/dashboard/agent","handoff_doc":"docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md"}',
  datetime('now'),
  datetime('now')
);
