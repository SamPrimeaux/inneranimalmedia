-- 422: Sixteen agentsam_* catalog tools for external MCP (d1 / http / proxy handlers).
-- Execution: inneranimalmedia-mcp-server dispatchTool → handler_config.sql / url / proxy_tool.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/422_agentsam_external_catalog_tools_16.sql

-- agentsam_recent_errors
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_recent_errors',
  'agentsam_recent_errors', 'agentsam_recent_errors', 'Recent Errors', 'platform', 'd1',
  'Returns the most recent platform errors from agentsam_error_log for this workspace.',
  '{"type":"object","properties":{"limit":{"type":"integer","default":20,"description":"Max errors to return (default 20)"}}}',
  '{"sql":"SELECT error_type, error_message, source, context_json, created_at FROM agentsam_error_log WHERE workspace_id = :workspace_id ORDER BY created_at DESC LIMIT :limit","defaults":{"limit":20},"bind_workspace":true}',
  'low', 0, 0, 1, 0, '["*"]', 3, 1, unixepoch()
);

-- agentsam_search_tools
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_search_tools',
  'agentsam_search_tools', 'agentsam_search_tools', 'Search Tools', 'platform', 'd1',
  'Search the agentsam_tools registry by keyword.',
  '{"type":"object","properties":{"query":{"type":"string","description":"Keyword to search tool names and descriptions"}},"required":["query"]}',
  '{"sql":"SELECT tool_key, display_name, tool_category, handler_type, description, risk_level FROM agentsam_tools WHERE (lower(tool_key) LIKE lower(''%''||:query||''%'') OR lower(description) LIKE lower(''%''||:query||''%'')) AND is_active = 1 LIMIT 30","bind_workspace":false}',
  'low', 0, 0, 1, 0, '["*"]', 4, 1, unixepoch()
);

-- agentsam_list_agents
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_list_agents',
  'agentsam_list_agents', 'agentsam_list_agents', 'List Agents', 'agent', 'd1',
  'Lists Agent Sam subagent profiles for this workspace (plus platform-global profiles).',
  '{"type":"object","properties":{}}',
  '{"sql":"SELECT slug, display_name, agent_type, description, is_active, sort_order FROM agentsam_subagent_profile WHERE is_active = 1 AND (workspace_id = :workspace_id OR COALESCE(is_platform_global, 0) = 1 OR trim(COALESCE(workspace_id, '''')) = '''') ORDER BY sort_order ASC LIMIT 50","bind_workspace":true}',
  'low', 0, 0, 1, 0, '["*"]', 5, 1, unixepoch()
);

-- agentsam_get_agent
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_get_agent',
  'agentsam_get_agent', 'agentsam_get_agent', 'Get Agent', 'agent', 'd1',
  'Returns full profile for a specific Agent Sam subagent by slug.',
  '{"type":"object","properties":{"slug":{"type":"string","description":"Agent slug e.g. toolbox, recall, engineer"}},"required":["slug"]}',
  '{"sql":"SELECT slug, display_name, agent_type, description, instructions_markdown, allowed_tool_globs, is_active FROM agentsam_subagent_profile WHERE slug = :slug AND is_active = 1 AND (workspace_id = :workspace_id OR COALESCE(is_platform_global, 0) = 1 OR trim(COALESCE(workspace_id, '''')) = '''') LIMIT 1","bind_workspace":true}',
  'low', 0, 0, 1, 0, '["*"]', 6, 1, unixepoch()
);

-- agentsam_todo_add
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_todo_add',
  'agentsam_todo_add', 'agentsam_todo_add', 'Add Todo', 'tasks', 'd1',
  'Creates a new todo in agentsam_todo for this workspace.',
  '{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"status":{"type":"string","enum":["open","todo","in_progress","blocked","done"],"default":"open"},"project_key":{"type":"string"},"due_date":{"type":"string"},"assigned_to":{"type":"string"}},"required":["title"]}',
  '{"sql":"INSERT INTO agentsam_todo (id, tenant_id, workspace_id, title, description, status, project_key, due_date, assigned_to, created_by, created_at, updated_at) VALUES (''todo_'' || lower(hex(randomblob(8))), :tenant_id, :workspace_id, :title, COALESCE(:description, ''''), COALESCE(:status, ''open''), :project_key, :due_date, COALESCE(:assigned_to, ''agentsam''), ''mcp'', datetime(''now''), datetime(''now''))","bind_workspace":true,"write":true}',
  'low', 0, 0, 1, 0, '["*"]', 7, 1, unixepoch()
);

-- agentsam_todo_update
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_todo_update',
  'agentsam_todo_update', 'agentsam_todo_update', 'Update Todo', 'tasks', 'd1',
  'Updates status, description, or assignee of an existing todo by id.',
  '{"type":"object","properties":{"id":{"type":"string"},"status":{"type":"string","enum":["open","todo","in_progress","blocked","done"]},"description":{"type":"string"},"assigned_to":{"type":"string"},"blocker":{"type":"string"}},"required":["id"]}',
  '{"sql":"UPDATE agentsam_todo SET status = COALESCE(:status, status), description = COALESCE(:description, description), assigned_to = COALESCE(:assigned_to, assigned_to), notes = COALESCE(:blocker, notes), updated_at = datetime(''now'') WHERE id = :id AND workspace_id = :workspace_id","bind_workspace":true,"write":true}',
  'low', 0, 0, 1, 0, '["*"]', 8, 1, unixepoch()
);

-- agentsam_workflow_status
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_workflow_status',
  'agentsam_workflow_status', 'agentsam_workflow_status', 'Workflow Status', 'workflow', 'd1',
  'Returns recent workflow run statuses for this workspace.',
  '{"type":"object","properties":{"limit":{"type":"integer","default":10},"status":{"type":"string","description":"Optional filter: running, completed, failed"}}}',
  '{"sql":"SELECT id, workflow_id, workflow_key, status, started_at, completed_at, error_message FROM agentsam_workflow_runs WHERE workspace_id = :workspace_id ORDER BY started_at DESC LIMIT :limit","defaults":{"limit":10},"bind_workspace":true}',
  'low', 0, 0, 1, 0, '["*"]', 9, 1, unixepoch()
);

-- agentsam_spend_summary
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_spend_summary',
  'agentsam_spend_summary', 'agentsam_spend_summary', 'Spend Summary', 'platform', 'd1',
  'Returns AI spend and usage rollup for this workspace (daily rollups).',
  '{"type":"object","properties":{"days":{"type":"integer","default":7,"description":"Number of days to look back"}}}',
  '{"sql":"SELECT day, ai_calls, tokens_in, tokens_out, cost_usd, tool_calls, mcp_calls, deployments, error_count FROM agentsam_usage_rollups_daily WHERE workspace_id = :workspace_id AND tenant_id = :tenant_id AND day >= date(''now'', ''-'' || :days || '' days'') ORDER BY day DESC LIMIT 100","defaults":{"days":7},"bind_workspace":true}',
  'low', 0, 0, 1, 0, '["*"]', 10, 1, unixepoch()
);

-- agentsam_cms_read
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_cms_read',
  'agentsam_cms_read', 'agentsam_cms_read', 'CMS Read', 'cms', 'http',
  'Reads CMS content for a client site (pages, posts, or assets).',
  '{"type":"object","properties":{"client":{"type":"string"},"type":{"type":"string","enum":["pages","posts","assets"],"default":"pages"},"slug":{"type":"string"}},"required":["client"]}',
  '{"url":"https://inneranimalmedia.com/api/cms/read","method":"POST","auth":"workspace_token","body":"full_args"}',
  'low', 0, 0, 1, 0, '["*"]', 11, 1, unixepoch()
);

-- agentsam_cms_write
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_cms_write',
  'agentsam_cms_write', 'agentsam_cms_write', 'CMS Write', 'cms', 'http',
  'Creates or updates CMS content for a client site.',
  '{"type":"object","properties":{"client":{"type":"string"},"type":{"type":"string","enum":["pages","posts"]},"slug":{"type":"string"},"title":{"type":"string"},"content":{"type":"string"},"status":{"type":"string","enum":["draft","published"],"default":"draft"}},"required":["client","type","slug","content"]}',
  '{"url":"https://inneranimalmedia.com/api/cms/write","method":"POST","auth":"workspace_token","body":"full_args"}',
  'medium', 1, 1, 1, 0, '["*"]', 12, 1, unixepoch()
);

-- agentsam_cms_publish
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_cms_publish',
  'agentsam_cms_publish', 'agentsam_cms_publish', 'CMS Publish', 'cms', 'http',
  'Publishes a draft CMS page or post to production.',
  '{"type":"object","properties":{"client":{"type":"string"},"type":{"type":"string","enum":["pages","posts"]},"slug":{"type":"string"}},"required":["client","type","slug"]}',
  '{"url":"https://inneranimalmedia.com/api/cms/publish","method":"POST","auth":"workspace_token","body":"full_args"}',
  'medium', 1, 1, 1, 0, '["*"]', 13, 1, unixepoch()
);

-- agentsam_notify
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_notify',
  'agentsam_notify', 'agentsam_notify', 'Notify', 'platform', 'http',
  'Sends a notification via the IAM platform notification system.',
  '{"type":"object","properties":{"message":{"type":"string"},"channel":{"type":"string","enum":["dashboard","email","sms"],"default":"dashboard"},"priority":{"type":"string","enum":["low","normal","high"],"default":"normal"}},"required":["message"]}',
  '{"url":"https://inneranimalmedia.com/api/notify","method":"POST","auth":"workspace_token","body":"full_args"}',
  'low', 0, 0, 1, 0, '["*"]', 14, 1, unixepoch()
);

-- agentsam_drive_read
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_drive_read',
  'agentsam_drive_read', 'agentsam_drive_read', 'Drive Read', 'integrations', 'proxy',
  'Reads files and folders from Google Drive via IAM gdrive proxy tools.',
  '{"type":"object","properties":{"file_id":{"type":"string"},"query":{"type":"string"}}}',
  '{"proxy_tool":"gdrive_fetch","fallback":"gdrive_list"}',
  'low', 0, 0, 1, 0, '["*"]', 15, 1, unixepoch()
);

-- agentsam_run
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_run',
  'agentsam_run', 'agentsam_run', 'Run Agent', 'agent', 'http',
  'Triggers an Agent Sam run with a prompt.',
  '{"type":"object","properties":{"prompt":{"type":"string"},"agent":{"type":"string","default":"agent-sam"},"mode":{"type":"string","enum":["auto","agent","plan","ask"],"default":"auto"}},"required":["prompt"]}',
  '{"url":"https://inneranimalmedia.com/api/agent/run","method":"POST","auth":"workspace_token","body":"full_args"}',
  'medium', 0, 0, 1, 0, '["*"]', 16, 1, unixepoch()
);

-- agentsam_plan
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_plan',
  'agentsam_plan', 'agentsam_plan', 'Create Plan', 'agent', 'http',
  'Creates a structured execution plan for a given goal.',
  '{"type":"object","properties":{"goal":{"type":"string"},"context":{"type":"string"}},"required":["goal"]}',
  '{"url":"https://inneranimalmedia.com/api/plan","method":"POST","auth":"workspace_token","body":"full_args"}',
  'low', 0, 0, 1, 0, '["*"]', 17, 1, unixepoch()
);

-- agentsam_daily_summary
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, risk_level, requires_approval,
  requires_confirmation, is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_agentsam_daily_summary',
  'agentsam_daily_summary', 'agentsam_daily_summary', 'Daily Summary', 'platform', 'http',
  'Generates a daily briefing: todos, spend, errors, and deploy activity.',
  '{"type":"object","properties":{"date":{"type":"string","description":"ISO date (default today)"}}}',
  '{"url":"https://inneranimalmedia.com/api/agent/daily-summary","method":"POST","auth":"workspace_token","body":"full_args"}',
  'low', 0, 0, 1, 0, '["*"]', 18, 1, unixepoch()
);
