-- MCP builtins finish — roadmap_steps for plan_iam_dashboard_v1 (Mar 25, 2026)
-- Prereq: max(order_index) was 1001; these use 1010–1016.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-roadmap-mcp-builtins-finish-20260325.sql
--
-- Readable plan: docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md
-- R2 + KB registry (iam-docs + autorag + dashboard_assets + ai_knowledge_base): scripts/d1-register-plan-mcp-builtins-finish-20260325.sql

INSERT OR REPLACE INTO roadmap_steps (id, plan_id, tenant_id, title, description, status, order_index, created_at, updated_at)
VALUES
(
  'step_mcp_finish_preflight_20260325',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'MCP finish — pre-flight (D1 cdt_%, remote MCP, SUPABASE grep)',
  'D1: SELECT tool_name FROM mcp_registered_tools WHERE enabled=1 AND tool_name LIKE ''cdt_%''. Prod smoke: list_clients, get_worker_services, get_deploy_command. worker.js: grep SUPABASE (webhook-only expected). See docs/plans/TOMORROW_2026-03-25_MCP_BUILTINS_FINISH.md Block 0.',
  'not_started',
  1010,
  datetime('now'),
  datetime('now')
),
(
  'step_mcp_finish_r2_mcp_html_20260325',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'MCP finish — upload dashboard/mcp.html to prod R2 + UI smoke',
  'wrangler r2 object put (agent-sam, static/dashboard/mcp.html) per deploy-with-record pattern. Browser: /dashboard/mcp workspace phrases github repos, cf images list, resend list domains; optional resend_send_email via DevTools fetch. Doc: TOMORROW plan Block 1.',
  'not_started',
  1011,
  datetime('now'),
  datetime('now')
),
(
  'step_mcp_finish_builtin_matrix_20260325',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'MCP finish — builtin matrix (GitHub, Images, Gdrive, Resend, CDT)',
  'Verify github_* (GITHUB_TOKEN), cf_images_* (token+hash), gdrive_* (D1 user_oauth_tokens + oauth_token + refresh), resend_* (list_domains, send_email; audit create_api_key), cdt_* sample against MYBROWSER. MCP invoke + agent chat. TOMORROW plan Block 2.',
  'not_started',
  1012,
  datetime('now'),
  datetime('now')
),
(
  'step_mcp_finish_agent_workflows_20260325',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'MCP finish — Anthropic agent chat + workflow run',
  'Agent: natural language tool calls for repos/images/resend. GET /api/mcp/workflows; run one safe workflow; confirm no MCP proxy loop. TOMORROW plan Block 3.',
  'not_started',
  1013,
  datetime('now'),
  datetime('now')
),
(
  'step_mcp_finish_closeout_20260325',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'MCP finish — D1 closeout (steps completed, memory keys)',
  'Set roadmap_steps step_mcp_finish_* to completed or blocked+notes. Optional agent_memory_index active_priorities/today_todo/build_progress one-liner. Rollback: git 98ed8d8 or Worker revision pre-333355fb. TOMORROW plan Block 4.',
  'not_started',
  1014,
  datetime('now'),
  datetime('now')
);
