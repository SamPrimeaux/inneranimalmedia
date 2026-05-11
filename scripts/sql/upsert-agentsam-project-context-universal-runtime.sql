INSERT INTO agentsam_project_context (
  id,
  tenant_id,
  workspace_id,
  project_key,
  project_name,
  project_type,
  status,
  priority,
  description,
  goals,
  constraints,
  current_blockers,
  primary_tables,
  secondary_tables,
  workers_involved,
  r2_buckets_involved,
  domains_involved,
  mcp_services_involved,
  key_files,
  related_routes,
  tokens_budgeted,
  tokens_used,
  cost_usd,
  linked_todo_ids,
  agent_id,
  client_id,
  session_id,
  created_by,
  notes,
  started_at,
  target_completion,
  completed_at,
  created_at,
  updated_at
)
VALUES (
  'ctx_agentsam_universal_runtime_20260510',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'agentsam_universal_autonomous_runtime',
  'Agent Sam Universal Autonomous Runtime',
  'platform_runtime',
  'active',
  100,

  'Agent Sam has proven that gpt-5.4-nano and gpt-5.4-mini can perform real end-to-end work by planning, generating, validating, and persisting a full website build. The next critical phase is wiring the global /dashboard/agent ChatAssistant into the real autonomous workflow runtime so a normal chat message creates and updates agentsam_workflow_runs, executes model/tool steps, persists step_results_json, streams live state to the UI, and registers artifacts.',

  '[
    "Wire /dashboard/agent ChatAssistant into agent_universal_autonomous_run without requiring workflow buttons",
    "Make normal chat create and update agentsam_workflow_runs",
    "Implement real agent-step handlers for nano classification, mini planning/generation, capability discovery, tool execution, observation, routing, and final persistence",
    "Bridge workflow node execution to the existing chat model/tool dispatcher instead of creating duplicate tool systems",
    "Persist current_node_key, steps_completed, step_results_json, input_tokens, output_tokens, cost_usd, duration_ms, heartbeat_at, output_json, and error_message",
    "Teach ChatAssistant to consume workflow_start, workflow_step, workflow_complete, workflow_error, and workflow_approval_required events",
    "Reuse the successful nano -> mini website build proof as the first real ChatAssistant-triggered autonomous protocol",
    "Publish/register generated artifacts through R2 and agentsam_artifacts",
    "Later expand into agentsam_subagent_profiles, queues, parallel child runs, multi-step routing, and approval/retry protocols once the first bridge is live"
  ]',

  '[
    "No new database tables unless absolutely required",
    "Do not build more workflow buttons",
    "Do not create more smoke workflows",
    "Do not use gpt-5.4-pro yet",
    "Use gpt-5.4-nano for classification, validation, routing, and cheap summaries",
    "Use gpt-5.4-mini for planning, generation, code reasoning, and substantial work",
    "Respect token, cost, runtime, and approval gates",
    "Keep existing agentsam_* schema as source of truth",
    "Do not duplicate tool registries or model registries"
  ]',

  '[
    "ChatAssistant currently streams /api/agent/chat responses but normal chat does not consistently create agentsam_workflow_runs",
    "Workflow graph executor can persist run state but key node handlers are stub/noop for agent, db_query, and internal mcp_tool execution",
    "src/core/agent-step.js is needed or equivalent real handler bridge is missing",
    "ChatAssistant does not yet consume workflow SSE as first-class live run state",
    "Approval event naming is inconsistent between backend and frontend",
    "Existing chat tool loop and workflow executor are powerful but split into separate paths",
    "Artifact publishing/registering from normal chat path still needs to be bridged"
  ]',

  '[
    "agentsam_project_context",
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_runs",
    "agentsam_ai",
    "agentsam_artifacts"
  ]',

  '[
    "agentsam_mcp_tools",
    "agentsam_scripts",
    "agentsam_commands",
    "agentsam_approval_queue",
    "agentsam_execution_steps",
    "agentsam_executions",
    "agentsam_usage_events",
    "agentsam_tool_call_log",
    "agentsam_agent_run",
    "agentsam_command_run",
    "agent_costs"
  ]',

  '[
    "inneranimalmedia main Worker",
    "dashboard Vite/React app",
    "Agent Sam backend runtime",
    "Cloudflare D1",
    "Cloudflare R2",
    "Cloudflare Hyperdrive later phase",
    "local Ollama fallback",
    "OpenAI Responses API"
  ]',

  '[
    "inneranimalmedia-assets",
    "agent-sam",
    "iam-platform",
    "iam-docs"
  ]',

  '[
    "https://inneranimalmedia.com/dashboard/agent",
    "https://inneranimalmedia.com/dashboard/library",
    "https://assets.inneranimalmedia.com",
    "http://localhost:8789 proof preview"
  ]',

  '[
    "OpenAI API",
    "Cloudflare D1",
    "Cloudflare R2",
    "Cloudflare Workers",
    "Cloudflare Hyperdrive",
    "GitHub",
    "local terminal/PTY",
    "BrowserView/Playwright",
    "MCP tool registry"
  ]',

  '[
    "docs/audits/agentsam-chatassistant-workflow-readiness.md",
    "scripts/e2e/openai-website-build-e2e.mjs",
    "scripts/generated-sites/agent-sam-site-1778454417077/index.html",
    "scripts/generated-sites/agent-sam-site-1778454417077/assets/styles.css",
    "scripts/generated-sites/agent-sam-site-1778454417077/assets/app.js",
    "scripts/generated-sites/agent-sam-site-1778454417077/README.md",
    "dashboard/components/ChatAssistant.tsx",
    "dashboard/App.tsx",
    "dashboard/components/BrowserView.tsx",
    "dashboard/components/MonacoEditorView.tsx",
    "src/api/agent.js",
    "src/core/workflow-executor.js",
    "src/core/workflows.js",
    "src/core/provider.js",
    "src/core/routing.js",
    "src/tools/ai-dispatch.js",
    "src/core/agentsam-mcp-tools.js",
    "src/core/agent-costs.js"
  ]',

  '[
    "/dashboard/agent",
    "/dashboard/library",
    "/api/agent/chat",
    "/api/agent/models",
    "/api/agent/context-picker/catalog",
    "/api/agent/chat/execute-approved-tool",
    "/api/artifacts",
    "/api/workflows",
    "/api/overview"
  ]',

  200000,
  14433,
  0.0548703,

  '[
    "todo_workflow-run-trace-overlay",
    "ptask_workflow_run_trace_overlay"
  ]',

  'agent_sam',
  NULL,
  'session_agentsam_universal_runtime_20260510',
  'sam_primeaux',

  'Current proof checkpoint: gpt-5.4-nano and gpt-5.4-mini successfully generated and validated a full website locally. Output: run wrun_90c5bec617b75191, 1,722 input tokens, 12,711 output tokens, cost $0.0548703, duration 98.4s, validation passed, 4 files generated totaling 42,151 bytes. The next milestone is moving this proven protocol into normal /dashboard/agent ChatAssistant execution so the global Agent Sam chat agent can create workflow runs, execute model/tool loops, stream state, persist step ledgers, and register artifacts without Cursor or workflow buttons. The last_cursor_session column should be treated as legacy/optional and not used in new context entries.',

  unixepoch(),
  NULL,
  NULL,
  unixepoch(),
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  project_key = excluded.project_key,
  project_name = excluded.project_name,
  project_type = excluded.project_type,
  status = excluded.status,
  priority = excluded.priority,
  description = excluded.description,
  goals = excluded.goals,
  constraints = excluded.constraints,
  current_blockers = excluded.current_blockers,
  primary_tables = excluded.primary_tables,
  secondary_tables = excluded.secondary_tables,
  workers_involved = excluded.workers_involved,
  r2_buckets_involved = excluded.r2_buckets_involved,
  domains_involved = excluded.domains_involved,
  mcp_services_involved = excluded.mcp_services_involved,
  key_files = excluded.key_files,
  related_routes = excluded.related_routes,
  tokens_budgeted = excluded.tokens_budgeted,
  tokens_used = excluded.tokens_used,
  cost_usd = excluded.cost_usd,
  linked_todo_ids = excluded.linked_todo_ids,
  agent_id = excluded.agent_id,
  client_id = excluded.client_id,
  session_id = excluded.session_id,
  created_by = excluded.created_by,
  notes = excluded.notes,
  started_at = excluded.started_at,
  target_completion = excluded.target_completion,
  completed_at = excluded.completed_at,
  updated_at = unixepoch();
