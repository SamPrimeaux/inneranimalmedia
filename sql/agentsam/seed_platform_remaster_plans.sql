-- Agent Sam active execution plan seed
-- Purpose:
-- 1. Remaster /dashboard/learn into an Agent-integrated dev learning platform.
-- 2. Fully build /dashboard/database as the in-house D1/Supabase/Hyperdrive/SQLite/SQL editor.
-- 3. Replace legacy MCP session state with a proper agentsam_* session/execution stack.
-- 4. Keep all tenant/workspace values derived from agentsam_workspace.

-- -------------------------------------------------------------------
-- Project context: Learning OS remaster
-- -------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_project_context (
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
  cursor_usage_percent,
  tokens_budgeted,
  linked_plan_id,
  agent_id,
  client_id,
  session_id,
  created_by,
  notes,
  started_at,
  target_completion,
  updated_at
)
SELECT
  'ctx_learn_os_remaster_20260507',
  w.tenant_id,
  w.id,
  'learn_os_remaster',
  'Learning OS Remaster',
  'dashboard_feature',
  'active',
  5,
  'Remaster /dashboard/learn into a focused Agent-integrated learning workspace for dev education, course sessions, markdown lessons, labs, terminal/editor/browser execution, submissions, rubrics, and multi-user subscription-ready course delivery.',
  json_array(
    'Remove permanent Learn inspector/resources column',
    'Use course-library, course-session, lesson-lab, and admin curriculum-builder modes',
    'Wire lesson tabs to existing Agent workspace systems: ChatAssistant, Monaco, BrowserView, XTermShell, explorers, status bar',
    'Support clean markdown-rendered courses and real lesson editing/versioning',
    'Support multiple users/students while keeping admin-only curriculum editing controls'
  ),
  json_array(
    'Do not redesign global dashboard shell',
    'Do not create fake editor/browser/terminal tabs',
    'Do not duplicate Agent panel',
    'Do not let students edit/reorder course structure',
    'Use course/lesson tables plus agentsam_workspace_state for active tool context'
  ),
  json_array(
    'Current Learn UI is too sprawling',
    'Course resources/inspector column competes with Agent panel',
    'Lesson workspace needs real tool bridging',
    'course_lessons and lessons need compatibility normalization'
  ),
  json_array(
    'courses',
    'course_modules',
    'course_lessons',
    'lessons',
    'lesson_versions',
    'lesson_progress',
    'lesson_assets',
    'course_assignments',
    'course_submissions',
    'course_grades',
    'course_exports'
  ),
  json_array(
    'agentsam_workspace_state',
    'agentsam_agent_run',
    'agentsam_tool_call_log',
    'agentsam_command_run',
    'agentsam_guardrail_events',
    'cms_assets',
    'cms_component_templates',
    'cms_themes'
  ),
  json_array('inneranimalmedia main Worker', 'dashboard SPA'),
  json_array('agent-sam', 'inneranimalmedia-assets', 'iam-docs'),
  json_array('/dashboard/learn', '/dashboard/agent'),
  json_array('github', 'cloudflare', 'openai', 'anthropic', 'google', 'workers_ai'),
  json_array(
    'dashboard/App.tsx',
    'dashboard/components/LearnPage.tsx',
    'dashboard/components/learn/LearningOS.tsx',
    'dashboard/components/learn/learn.css',
    'dashboard/components/ChatAssistant.tsx',
    'dashboard/components/MonacoEditorView.tsx',
    'dashboard/components/BrowserView.tsx',
    'dashboard/components/XTermShell.tsx',
    'src/api/learn.js',
    'src/api/agent.js'
  ),
  json_array('/dashboard/learn', '/api/learn/dashboard', '/api/learn/progress', '/api/learn/submit'),
  0,
  180000,
  NULL,
  'asp_agent_sam',
  NULL,
  NULL,
  'sam',
  'This is the main productization path for InnerAutodidact / Agent Sam Learn. Build it as a real dev lab platform, not a passive LMS.',
  unixepoch(),
  unixepoch() + (14 * 86400),
  unixepoch()
FROM agentsam_workspace w
WHERE w.id = 'ws_inneranimalmedia';

-- -------------------------------------------------------------------
-- Project context: Database Studio replacement
-- -------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_project_context (
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
  cursor_usage_percent,
  tokens_budgeted,
  linked_plan_id,
  agent_id,
  client_id,
  session_id,
  created_by,
  notes,
  started_at,
  target_completion,
  updated_at
)
SELECT
  'ctx_database_studio_rebuild_20260507',
  w.tenant_id,
  w.id,
  'database_studio_rebuild',
  'In-House Database Studio',
  'dashboard_feature',
  'active',
  5,
  'Fully build /dashboard/database as the in-house replacement for D1 Studio/Supabase SQL editor for D1, SQLite-style schema inspection, Supabase/Postgres through Hyperdrive, saved SQL snippets, query history, schema browser, table editor, safe query execution, exports, and Agent Sam assisted DB workflows.',
  json_array(
    'Replace broken/half-built DatabaseBrowser implementation',
    'Create canonical agentsam DB snippet/history tables instead of missing legacy agent_db_snippets and agent_db_query_history',
    'Support D1 SQL execution and schema browsing',
    'Support Hyperdrive/Supabase/Postgres query execution through safe backend endpoint',
    'Add query history, saved snippets, table list, table detail, rows browser, SQL editor, explain/assist, and safety gating',
    'Wire command governance for D1 mutations and risky SQL'
  ),
  json_array(
    'Do not depend on non-existent legacy agent_db_snippets or agent_db_query_history',
    'Do not hardcode tenant/workspace/user IDs',
    'Use tenant/workspace context from auth/session/workspace',
    'Dangerous writes require approval/guardrails',
    'Do not expose secrets or raw Hyperdrive credentials to frontend'
  ),
  json_array(
    'Frontend expects missing legacy tables',
    'Need canonical agentsam_* DB snippet/history model',
    'Need D1 and Hyperdrive execution paths split by driver',
    'Need permission/guardrail layer before mutations'
  ),
  json_array(
    'agentsam_db_snippets',
    'agentsam_db_query_history',
    'agentsam_command_run',
    'agentsam_command_allowlist',
    'agentsam_guardrails',
    'agentsam_guardrail_events',
    'agentsam_execution_performance_metrics'
  ),
  json_array(
    'agentsam_workspace',
    'agentsam_workspace_state',
    'agentsam_tool_call_log',
    'agentsam_mcp_tool_execution',
    'agentsam_usage_events',
    'sqlite_master',
    'cms_*',
    'course_*',
    'auth_*'
  ),
  json_array('inneranimalmedia main Worker', 'dashboard SPA'),
  json_array('agent-sam', 'iam-docs'),
  json_array('/dashboard/database'),
  json_array('cloudflare', 'supabase', 'github'),
  json_array(
    'dashboard/components/DatabaseBrowser.tsx',
    'dashboard/App.tsx',
    'src/api/agent.js',
    'src/api/dashboard.js',
    'src/api/database.js',
    'src/api/hyperdrive.js',
    'src/core/production-dispatch.js'
  ),
  json_array('/dashboard/database', '/api/agent/db/snippets', '/api/agent/db/query-history', '/api/hyperdrive/query', '/api/database/*'),
  0,
  160000,
  NULL,
  'asp_agent_sam',
  NULL,
  NULL,
  'sam',
  'This must become a real in-house database editor. It should feel like a serious SQL workbench inside Agent Sam, not a placeholder table browser.',
  unixepoch(),
  unixepoch() + (10 * 86400),
  unixepoch()
FROM agentsam_workspace w
WHERE w.id = 'ws_inneranimalmedia';

-- -------------------------------------------------------------------
-- Project context: MCP Agent sessions consolidation
-- -------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_project_context (
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
  cursor_usage_percent,
  tokens_budgeted,
  linked_plan_id,
  agent_id,
  client_id,
  session_id,
  created_by,
  notes,
  started_at,
  target_completion,
  updated_at
)
SELECT
  'ctx_mcp_session_consolidation_20260507',
  w.tenant_id,
  w.id,
  'mcp_session_consolidation',
  'MCP Agent Session Consolidation',
  'backend_refactor',
  'active',
  4,
  'Replace or bridge legacy mcp_agent_sessions with a properly designed agentsam_* session/live-state stack while keeping agentsam_mcp_tool_execution as the append-only tool audit ledger.',
  json_array(
    'Do not blindly rename mcp_agent_sessions to agentsam_mcp_tool_execution',
    'Create or extend canonical agentsam MCP session/live-state model',
    'Preserve current live dashboard card status/progress/logs behavior',
    'Keep tool execution audit in agentsam_mcp_tool_execution',
    'Update mcp.js and agent.js call sites cleanly'
  ),
  json_array(
    'sessions and executions are different grains',
    'Live mutable session state needs progress/stage/logs/current_task',
    'Tool execution ledger should remain append-mostly',
    'PATCH by conversation_id must still work or be replaced with a better key'
  ),
  json_array(
    'mcp_agent_sessions is still used for live MCP card state',
    'agentsam_mcp_tool_execution lacks session status/progress fields',
    'Need designed bridge table or extended agentsam session table'
  ),
  json_array(
    'agentsam_mcp_tool_execution',
    'agentsam_mcp_tools',
    'agentsam_mcp_servers',
    'agentsam_mcp_workflows',
    'agentsam_tool_call_log'
  ),
  json_array(
    'mcp_agent_sessions',
    'agentsam_workspace_state',
    'agentsam_agent_run',
    'agentsam_execution_context'
  ),
  json_array('inneranimalmedia main Worker'),
  json_array('agent-sam'),
  json_array('/dashboard/mcp', '/dashboard/agent'),
  json_array('cloudflare', 'github', 'supabase', 'notion'),
  json_array(
    'src/api/mcp.js',
    'src/api/agent.js',
    'src/cron/retention-purge.js',
    'dashboard/components/Mcp*.tsx',
    'dashboard/components/ChatAssistant.tsx'
  ),
  json_array('/api/mcp/agents/status', '/api/mcp/agents', '/api/mcp/dispatch', '/api/mcp/audit', '/dashboard/mcp'),
  0,
  90000,
  NULL,
  'asp_agent_sam',
  NULL,
  NULL,
  'sam',
  'Keep sessions and execution audit separate unless a new agentsam_mcp_sessions table is intentionally introduced. Do not collapse live progress into the execution ledger without schema support.',
  unixepoch(),
  unixepoch() + (10 * 86400),
  unixepoch()
FROM agentsam_workspace w
WHERE w.id = 'ws_inneranimalmedia';

-- -------------------------------------------------------------------
-- Main sprint plan
-- -------------------------------------------------------------------
INSERT OR REPLACE INTO agentsam_plans (
  id,
  tenant_id,
  workspace_id,
  session_id,
  agent_id,
  client_id,
  client_name,
  plan_date,
  plan_type,
  title,
  status,
  morning_brief,
  session_notes,
  available_providers,
  blocked_providers,
  budget_snapshot,
  default_model,
  token_budget,
  tokens_used,
  cost_usd,
  carry_over_from,
  carry_over_count,
  tasks_total,
  tasks_done,
  tasks_blocked,
  linked_project_keys,
  linked_todo_ids,
  linked_context_ids,
  created_at,
  updated_at
)
SELECT
  'plan_platform_remaster_sprint_20260507',
  w.tenant_id,
  w.id,
  NULL,
  'asp_agent_sam',
  NULL,
  'Inner Animal Media',
  date('now'),
  'sprint',
  'Platform Remaster Sprint: Learn OS, Database Studio, MCP Sessions',
  'active',
  'Today we are formalizing the highest-priority Agent Sam platform work into an executable plan: remaster Learn into a real dev learning cockpit, finish Database Studio as the in-house D1/Supabase/Hyperdrive editor, and consolidate MCP session/live-state handling into the agentsam_* stack without breaking existing dashboard behavior.',
  'Seeded from active architecture discussion. Priority is implementation-quality guidance and Cursor-ready task breakdown, not conceptual backlog.',
  json_array('anthropic','openai','google','workers_ai'),
  json_array(),
  json_object(
    'token_budget_reason', 'large multi-module platform refactor',
    'cost_guardrail', 'track through agentsam_usage_events and agentsam_execution_performance_metrics',
    'requires_approval_for', json_array('D1 mutation', 'production deploy', 'secret access', 'destructive storage operation')
  ),
  NULL,
  250000,
  0,
  0,
  NULL,
  0,
  18,
  0,
  0,
  json_array('learn_os_remaster','database_studio_rebuild','mcp_session_consolidation'),
  json_array(),
  json_array(
    'ctx_learn_os_remaster_20260507',
    'ctx_database_studio_rebuild_20260507',
    'ctx_mcp_session_consolidation_20260507'
  ),
  unixepoch(),
  unixepoch()
FROM agentsam_workspace w
WHERE w.id = 'ws_inneranimalmedia';

-- -------------------------------------------------------------------
-- Plan tasks
-- -------------------------------------------------------------------
DELETE FROM agentsam_plan_tasks
WHERE plan_id = 'plan_platform_remaster_sprint_20260507';

INSERT INTO agentsam_plan_tasks (
  tenant_id,
  workspace_id,
  plan_id,
  agent_id,
  assigned_model,
  order_index,
  title,
  description,
  priority,
  category,
  status,
  files_involved,
  tables_involved,
  routes_involved,
  depends_on,
  estimated_minutes,
  notes,
  created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 1,
  'Audit current Learn route and Agent workspace integration points',
  'Inspect /dashboard/learn, /dashboard/agent, App.tsx, LearnPage, LearningOS, ChatAssistant, MonacoEditorView, BrowserView, XTermShell, and workspace state flows. Produce exact integration map before patching.',
  'P0', 'research', 'todo',
  json_array('dashboard/App.tsx','dashboard/components/LearnPage.tsx','dashboard/components/learn/LearningOS.tsx','dashboard/components/ChatAssistant.tsx','dashboard/components/MonacoEditorView.tsx','dashboard/components/BrowserView.tsx','dashboard/components/XTermShell.tsx'),
  json_array('agentsam_workspace_state','courses','course_modules','course_lessons','lessons','lesson_assets','lesson_versions'),
  json_array('/dashboard/learn','/dashboard/agent','/api/learn/dashboard'),
  json_array(),
  90,
  'No fake tabs. Learn must reuse real Agent workspace systems.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 2,
  'Refactor Learn into Library, Course Session, Lesson Lab, and Builder modes',
  'Remove permanent Learn inspector/resources column. Implement focused modes and move resources, assignments, rubrics, submissions, and feedback into the center workspace.',
  'P0', 'frontend', 'todo',
  json_array('dashboard/components/learn/LearnOS.tsx','dashboard/components/learn/components/*','dashboard/components/learn/learn.css'),
  json_array('courses','course_modules','course_lessons','lessons','lesson_assets','course_assignments','course_submissions','course_grades','course_exports'),
  json_array('/dashboard/learn'),
  json_array('1'),
  180,
  'Must preserve unified dashboard shell and visual language from /dashboard/agent.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 3,
  'Wire Learn lesson tabs to real Agent workspace tools',
  'Connect Lesson Lab tabs to the existing Monaco editor, BrowserView preview, XTermShell terminal, Agent Sam context bridge, explorers, and status bar. Do not create duplicate implementations.',
  'P0', 'frontend', 'todo',
  json_array('dashboard/App.tsx','dashboard/components/learn/hooks/useLearnWorkspaceBridge.ts','dashboard/components/ChatAssistant.tsx','dashboard/components/MonacoEditorView.tsx','dashboard/components/BrowserView.tsx','dashboard/components/XTermShell.tsx'),
  json_array('agentsam_workspace_state','agentsam_tool_call_log','agentsam_command_run','agentsam_guardrail_events'),
  json_array('/dashboard/learn','/dashboard/agent'),
  json_array('2'),
  180,
  'Terminal/editor/browser must be real and immediately usable.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 4,
  'Normalize Learn API across course_lessons and lessons tables',
  'Update src/api/learn.js so Learn uses a single normalized lesson view model. Prefer lessons when rows exist, fallback to course_lessons, and attach lesson_assets, lesson_versions, progress, assignments, submissions, grades, and exports.',
  'P0', 'backend', 'todo',
  json_array('src/api/learn.js','dashboard/components/learn/learn.types.ts','dashboard/components/learn/utils/normalizeLessons.ts'),
  json_array('course_lessons','lessons','lesson_assets','lesson_versions','course_progress','lesson_progress','course_assignments','course_submissions','course_grades','course_exports'),
  json_array('/api/learn/dashboard','/api/learn/progress','/api/learn/submit'),
  json_array('1'),
  150,
  'Do not break existing course_lessons data.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 5,
  'Design and create canonical agentsam DB snippet/history tables',
  'Replace missing legacy agent_db_snippets and agent_db_query_history dependencies with agentsam_db_snippets and agentsam_db_query_history or equivalent canonical agentsam tables.',
  'P0', 'db', 'todo',
  json_array('migrations/*_agentsam_db_studio.sql','src/api/database.js','src/api/agent.js','dashboard/components/DatabaseBrowser.tsx'),
  json_array('agentsam_db_snippets','agentsam_db_query_history','agentsam_command_run','agentsam_guardrail_events'),
  json_array('/dashboard/database','/api/agent/db/snippets','/api/agent/db/query-history','/api/database/*'),
  json_array(),
  120,
  'Do not continue using non-existent legacy tables.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 6,
  'Build Database Studio backend execution layer',
  'Implement safe D1 query execution, schema introspection, table browsing, saved snippets, query history, and Hyperdrive/Supabase/Postgres query execution with strict guardrails.',
  'P0', 'backend', 'todo',
  json_array('src/api/database.js','src/api/hyperdrive.js','src/api/agent.js','src/core/production-dispatch.js'),
  json_array('agentsam_db_snippets','agentsam_db_query_history','agentsam_command_run','agentsam_guardrails','agentsam_guardrail_events','agentsam_tool_call_log'),
  json_array('/api/database/*','/api/hyperdrive/query','/dashboard/database'),
  json_array('5'),
  210,
  'D1 writes, schema changes, destructive SQL, and Hyperdrive mutations require approval.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 7,
  'Build Database Studio frontend',
  'Replace half-built DatabaseBrowser with a polished dashboard-native SQL workbench: connections, schema tree, table grid, row viewer, SQL editor, snippets, history, result grid, explain/error panel, and Agent Sam assist.',
  'P0', 'frontend', 'todo',
  json_array('dashboard/components/DatabaseBrowser.tsx','dashboard/components/database/*','dashboard/App.tsx'),
  json_array('agentsam_db_snippets','agentsam_db_query_history','agentsam_workspace_state'),
  json_array('/dashboard/database'),
  json_array('5','6'),
  240,
  'This should replace day-to-day D1 Studio/Supabase Studio usage for your app workflows.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 8,
  'Implement command governance for Database Studio and Learn labs',
  'Ensure D1/Hyperdrive mutations, deploys, destructive storage operations, and risky terminal actions route through agentsam_commands, command_allowlist, guardrails, guardrail_events, and command_run.',
  'P0', 'backend', 'todo',
  json_array('src/api/agentsamCommandGovernance.js','src/api/database.js','src/api/learn.js','src/api/agent.js'),
  json_array('agentsam_commands','agentsam_command_pattern','agentsam_command_allowlist','agentsam_command_run','agentsam_guardrails','agentsam_guardrail_events'),
  json_array('/dashboard/database','/dashboard/learn','/api/database/*','/api/learn/*'),
  json_array('3','6'),
  160,
  'No production mutation should bypass governance.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 9,
  'Design agentsam MCP session/live-state replacement',
  'Create the proper agentsam_* session/live-state model for MCP agent cards instead of blindly replacing mcp_agent_sessions with agentsam_mcp_tool_execution.',
  'P1', 'db', 'todo',
  json_array('migrations/*_agentsam_mcp_sessions.sql','src/api/mcp.js','src/api/agent.js'),
  json_array('mcp_agent_sessions','agentsam_mcp_tool_execution','agentsam_tool_call_log','agentsam_workspace_state'),
  json_array('/api/mcp/agents/status','/api/mcp/agents','/api/mcp/dispatch','/dashboard/mcp'),
  json_array(),
  120,
  'Session live state and execution audit are different grains.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 10,
  'Refactor MCP endpoints to canonical agentsam session state',
  'Update src/api/mcp.js and src/api/agent.js call sites so MCP dashboard status, reset, dispatch, audit, and conversation patching use the new agentsam session/live-state design while preserving agentsam_mcp_tool_execution as audit ledger.',
  'P1', 'backend', 'todo',
  json_array('src/api/mcp.js','src/api/agent.js','src/cron/retention-purge.js'),
  json_array('mcp_agent_sessions','agentsam_mcp_tool_execution','agentsam_tool_call_log','agentsam_workspace_state'),
  json_array('/api/mcp/agents/status','/api/mcp/agents','/api/mcp/dispatch','/api/mcp/audit','/api/agent/sessions/:id'),
  json_array('9'),
  210,
  'Do not break current MCP dashboard cards.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 11,
  'Wire execution dependency graph and performance metrics into task flows',
  'Use agentsam_execution_dependency_graph for ordered/conditional/parallel/compensation flows and agentsam_execution_performance_metrics for command/tool reliability/cost rollups.',
  'P1', 'backend', 'todo',
  json_array('src/api/agentExecutionMetrics.js','src/api/agentsamCommandGovernance.js','src/cron/*','dashboard/components/*'),
  json_array('agentsam_execution_dependency_graph','agentsam_execution_performance_metrics','agentsam_tool_chain','agentsam_tool_call_log','agentsam_command_run'),
  json_array('/dashboard/agent','/dashboard/learn','/dashboard/database','/dashboard/mcp'),
  json_array('8','10'),
  150,
  'Metrics should be derived from raw logs. Do not hardcode tenant/workspace/user values.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';

INSERT INTO agentsam_plan_tasks (
  tenant_id, workspace_id, plan_id, agent_id, assigned_model, order_index,
  title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, created_at
)
SELECT w.tenant_id, w.id, 'plan_platform_remaster_sprint_20260507', 'asp_agent_sam', NULL, 12,
  'Create QA scripts for Learn, Database, MCP, and command governance',
  'Add repeatable validation scripts and smoke checks for dashboard routes, API contracts, D1 schema, guarded mutations, Learn workspace tabs, Database Studio queries, and MCP session status.',
  'P0', 'infra', 'todo',
  json_array('scripts/*','docs/db/*','dashboard/*','src/api/*'),
  json_array('agentsam_plans','agentsam_plan_tasks','agentsam_execution_performance_metrics','agentsam_guardrail_events'),
  json_array('/dashboard/learn','/dashboard/database','/dashboard/mcp','/dashboard/agent'),
  json_array('2','3','6','7','8','10'),
  180,
  'No “looks good” completion. Require route/API/schema validation.',
  unixepoch()
FROM agentsam_workspace w WHERE w.id = 'ws_inneranimalmedia';


-- Link project contexts to the plan after the plan row exists.
UPDATE agentsam_project_context
SET
  linked_plan_id = 'plan_platform_remaster_sprint_20260507',
  updated_at = unixepoch()
WHERE id IN (
  'ctx_learn_os_remaster_20260507',
  'ctx_database_studio_rebuild_20260507',
  'ctx_mcp_session_consolidation_20260507'
);

-- Update plan counts.
UPDATE agentsam_plans
SET
  tasks_total = (
    SELECT COUNT(*)
    FROM agentsam_plan_tasks
    WHERE plan_id = 'plan_platform_remaster_sprint_20260507'
  ),
  tasks_done = (
    SELECT COUNT(*)
    FROM agentsam_plan_tasks
    WHERE plan_id = 'plan_platform_remaster_sprint_20260507'
      AND status = 'done'
  ),
  tasks_blocked = (
    SELECT COUNT(*)
    FROM agentsam_plan_tasks
    WHERE plan_id = 'plan_platform_remaster_sprint_20260507'
      AND status = 'blocked'
  ),
  updated_at = unixepoch()
WHERE id = 'plan_platform_remaster_sprint_20260507';

