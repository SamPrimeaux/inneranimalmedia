-- =============================================================================
-- migrations/327_agentsam_dashboard_agent_self_debug.sql
--
-- Seeds:
--   1) agentsam_skill — live /dashboard/agent self-debug playbook (Browser + SSE
--      diagnostics + file pointers + smoke scripts). Loaded into every chat for
--      user sam_primeaux when workspace_id matches ws_inneranimalmedia (or NULL/blank).
--   2) agentsam_workflows + one db_query node — minimal runnable graph so
--      agentsam_run_agent(workflow_key='dashboard_agent_self_debug') completes without
--      custom dispatch handlers (db_query is a noop success in workflow-executor.js).
--
-- Supabase: static registry + skill content; no mirror required for these INSERTs
-- (D1 canonical per product rules).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/327_agentsam_dashboard_agent_self_debug.sql
-- =============================================================================

-- agentsam_skill layout matches prod (tenant_id, tags_json, task_types_json, etc.; no legacy `tags` column).
INSERT OR IGNORE INTO agentsam_skill (
  id,
  tenant_id,
  user_id,
  person_uuid,
  workspace_id,
  name,
  description,
  content_markdown,
  file_path,
  scope,
  slash_trigger,
  globs,
  always_apply,
  task_types_json,
  route_keys_json,
  default_model_key,
  model_constraints_json,
  access_mode,
  icon,
  tags_json,
  metadata_json,
  token_estimate,
  invocation_count,
  last_invoked_at,
  version,
  is_active,
  sort_order,
  created_at,
  updated_at
) VALUES (
  'skill_dashboard_agent_self_debug',
  'tenant_sam_primeaux',
  'sam_primeaux',
  NULL,
  'ws_inneranimalmedia',
  'Dashboard Agent — live self-debug',
  'Playbook for debugging https://inneranimalmedia.com/dashboard/agent using Browser tools, stream debug globals, and smoke scripts.',
  '# Dashboard Agent — live self-debug

When asked to debug **/dashboard/agent** or the live Agent chat, work **only** through the real dashboard (Browser tab, Composer, Explorer, Terminal). Do not invent fake provider-only debug routes.

## Browser / CDP tools (aliases resolve in Worker — `src/tools/ai-dispatch.js`)
- Open: `browser_open_url` or `cdt_navigate_page` → `https://inneranimalmedia.com/dashboard/agent`
- DOM: `browser_get_dom_summary` / `cdt_take_snapshot`
- Console: `browser_get_console_errors` / `cdt_list_console_messages`
- Network: `browser_get_network_events` / `cdt_list_network_requests`
- Screenshot: `cdt_take_screenshot` or `playwright_screenshot`
- Wait for UI: `browser_wait_for_text` / `cdt_wait_for` (e.g. composer placeholder)

## After a test send (e.g. "hello")
In the dashboard page context, read **`window.__IAM_AGENT_LAST_STREAM_DEBUG`** — includes `context` (e.g. `prompt_lane`, `tool_count`, `system_prompt_chars`), stream timings (`first_sse_event_at`, `first_text_at`, `done_at`), `done_received`, and parser errors if any.

## UI wiring (when changing behavior)
- `dashboard/features/agent-chat/streamDebug.ts` — global debug object
- `dashboard/features/agent-chat/hooks/useAgentChatStream.ts` — SSE patches + `iam:agent-browser-tool-active`
- `dashboard/features/agent-chat/ChatAssistant.tsx` — init/patch around `/api/agent/chat`
- `dashboard/App.tsx` — opens Browser tab on `iam:agent-browser-tool-active`

## Automated checks
- `python3 scripts/smoke_dashboard_agent_browser_workbench.py` — Playwright; needs `IAM_SESSION` (or cookie file env documented in script).
- `python3 scripts/smoke_agentsam_latency.py` — API latency / integrity (no fake provider gate).

## Workflow registry (optional smoke)
- `workflow_key`: **dashboard_agent_self_debug** — single **db_query** noop node; safe to run via `agentsam_run_agent` to prove D1 graph + executor wiring. Full live-debug procedure remains this skill, not the graph.',
  'migrations/327_agentsam_dashboard_agent_self_debug.sql',
  'workspace',
  'dashboard-agent-debug',
  '["dashboard/features/agent-chat/**","dashboard/App.tsx","src/tools/ai-dispatch.js"]',
  0,
  '["debug","code","chat","terminal_execution"]',
  '["debug","code_review","general","terminal_execution"]',
  NULL,
  '{}',
  'read_write',
  '',
  '["debug","dashboard","agent","browser","sse"]',
  '{"project_key":"agent_sam_visualizer","workflow_key":"dashboard_agent_self_debug","workflow_id":"wf_dashboard_agent_self_debug","scripts":{"browser_workbench":"scripts/smoke_dashboard_agent_browser_workbench.py","latency":"scripts/smoke_agentsam_latency.py"}}',
  0,
  0,
  NULL,
  1,
  1,
  95,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global
) VALUES (
  'wf_dashboard_agent_self_debug',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'dashboard_agent_self_debug',
  'Dashboard Agent — self-debug registry ping',
  'Minimal D1 graph: one db_query noop. Proves agentsam_workflows + agentsam_workflow_nodes + executeWorkflowGraph wiring. Live-debug instructions live in agentsam_skill id skill_dashboard_agent_self_debug.',
  'maintenance',
  'manual',
  'agent',
  'debug',
  'low',
  0,
  1,
  15000,
  '{"noop":true}',
  '{"source":"migrations/327_agentsam_dashboard_agent_self_debug.sql","skill_id":"skill_dashboard_agent_self_debug","executor_note":"db_query branch returns ok:true noop"}',
  1,
  0
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES (
  'wnode_dasd_registry_ping',
  'wf_dashboard_agent_self_debug',
  'registry_ping',
  'db_query',
  'Registry ping',
  'No-op ledger step; completes the workflow run for alignment and tooling smoke.',
  'agentsam.dashboard.self_debug.registry_ping',
  '{}',
  '{}',
  5000,
  '{"max_retries":0}',
  '{}',
  'low',
  0,
  1,
  1
);
