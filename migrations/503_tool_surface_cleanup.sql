-- 503: Tool Surface Cleanup + approval/modes fixes (Sprint 02)
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/503_tool_surface_cleanup.sql

-- 1a + 1b + 1c: Deactivate legacy/placeholder tools + deactivate agentsam_run + agentsam_plan
-- agentsam_plan is reasoning wrapped in a tool. Deactivate it.
-- Model reads active plans via agentsam_d1_query on agentsam_plans directly.
UPDATE agentsam_tools
SET is_active = 0,
    updated_at = unixepoch()
WHERE tool_name IN (
  'terminal_execute', 'terminal_run', 'terminal_wrangler',
  'workspace_search_semantic',
  'codemode',
  'rag_ingest', 'rag_status',
  'agentsam_run',
  'agentsam_plan'
);

-- 1d: Fix agentsam_d1_write modes_json — keep "auto" and add user modes
UPDATE agentsam_tools
SET modes_json = '["auto","agent","debug","multitask"]',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_d1_write';

-- 1e: cloudflare_command_registry too broad — restrict to agent/debug
UPDATE agentsam_tools
SET modes_json = '["agent","debug"]',
    updated_at = unixepoch()
WHERE tool_name = 'cloudflare_command_registry';

-- 1f: agentsam_send_email should require approval
UPDATE agentsam_tools
SET requires_approval = 1,
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_send_email'
  AND requires_approval = 0;

-- 1g: High-risk tools missing approval gates
UPDATE agentsam_tools
SET requires_approval = 1,
    updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_r2_delete',
  'agentsam_github_write',
  'agentsam_github_pr',
  'agentsam_worker_deploy',
  'agentsam_supabase_write',
  'agentsam_supabase_project_write'
)
AND requires_approval = 0;

