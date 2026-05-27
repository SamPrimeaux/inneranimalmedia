-- 439: D1-driven ChatGPT/Claude connector surface (no hardcoded pins in Worker).
-- expose_on_connector + runtime_contract_key + connector_priority on allowlist.

ALTER TABLE agentsam_mcp_oauth_tool_allowlist ADD COLUMN expose_on_connector INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_mcp_oauth_tool_allowlist ADD COLUMN runtime_contract_key TEXT;
ALTER TABLE agentsam_mcp_oauth_tool_allowlist ADD COLUMN connector_priority INTEGER NOT NULL DEFAULT 999;

-- Internal catalog keys — not on external connector when agentsam_* contract exists.
UPDATE agentsam_mcp_oauth_tool_allowlist
SET expose_on_connector = 0,
    runtime_contract_key = COALESCE(NULLIF(trim(runtime_contract_key), ''), tool_key),
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    'd1_query',
    'd1_schema',
    'd1_write',
    'd1_explain',
    'd1_migrations_draft',
    'cloudflare_command_registry',
    'deploy_status'
  );

-- Connector-facing runtime contracts (32-tool ChatGPT surface).
UPDATE agentsam_mcp_oauth_tool_allowlist
SET expose_on_connector = 1,
    runtime_contract_key = tool_key,
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    'agentsam_health_check',
    'agentsam_workspace_context',
    'agentsam_recent_errors',
    'agentsam_search_tools',
    'agentsam_list_agents',
    'agentsam_get_agent',
    'agentsam_db_query',
    'agentsam_db_schema',
    'agentsam_db_write',
    'agentsam_run',
    'agentsam_plan',
    'agentsam_todo_add',
    'agentsam_todo_update',
    'agentsam_memory_search',
    'agentsam_memory_save',
    'agentsam_send_email',
    'agentsam_notify',
    'agentsam_workflow_trigger',
    'agentsam_workflow_status',
    'agentsam_spend_summary',
    'agentsam_daily_summary',
    'agentsam_codebase_create',
    'agentsam_codebase_scan_fix',
    'agentsam_find_and_act',
    'agentsam_memory_manager',
    'agentsam_memory_query',
    'agentsam_memory_write',
    'agentsam_spawn_profile',
    'agentsam_vectorize_describe',
    'agentsam_cms_read',
    'agentsam_cms_write',
    'agentsam_cms_publish'
  );

UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 10,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_health_check';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 20,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_workspace_context';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 30,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_recent_errors';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 40,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_search_tools';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 50,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_list_agents';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 60,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_get_agent';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 70,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_db_query';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 80,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_db_schema';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 90,  updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_db_write';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 100, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_run';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 110, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_plan';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 120, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_todo_add';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 130, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_todo_update';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 140, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_memory_search';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 150, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_memory_save';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 160, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_send_email';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 170, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_notify';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 180, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_workflow_trigger';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 190, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_workflow_status';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 200, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_spend_summary';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 210, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_daily_summary';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 220, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_codebase_create';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 230, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_codebase_scan_fix';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 240, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_find_and_act';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 250, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_memory_manager';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 260, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_memory_query';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 270, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_memory_write';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 280, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_spawn_profile';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 290, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_vectorize_describe';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 300, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_cms_read';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 310, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_cms_write';
UPDATE agentsam_mcp_oauth_tool_allowlist SET connector_priority = 320, updated_at = unixepoch() WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_cms_publish';

-- Public contract → internal executor (tools/call delegation; not on connector list).
INSERT OR IGNORE INTO agentsam_capability_aliases (
  id, abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, rationale, is_active, created_at, updated_at
) VALUES
  ('cap_alias_d1_query_to_agentsam_db_query_439', 'd1_query', 'tool_key', 'agentsam_db_query', 'develop', 1, 0, '439: internal d1_query → agentsam_db_query', 1, unixepoch(), unixepoch()),
  ('cap_alias_d1_schema_to_agentsam_db_schema_439', 'd1_schema', 'tool_key', 'agentsam_db_schema', 'develop', 1, 0, '439: internal d1_schema → agentsam_db_schema', 1, unixepoch(), unixepoch()),
  ('cap_alias_d1_write_to_agentsam_db_write_439', 'd1_write', 'tool_key', 'agentsam_db_write', 'develop', 1, 1, '439: internal d1_write → agentsam_db_write executor', 1, unixepoch(), unixepoch()),
  ('cap_alias_deploy_status_agentsam_439', 'deploy_status', 'tool_key', 'agentsam_deploy_status', 'develop', 1, 0, '439: deploy_status → agentsam_deploy_status', 1, unixepoch(), unixepoch()),
  ('cap_alias_r2_read_agentsam_439', 'r2_read', 'tool_key', 'agentsam_r2_read', 'develop', 1, 0, '439: r2_read → agentsam_r2_read', 1, unixepoch(), unixepoch()),
  ('cap_alias_r2_list_agentsam_439', 'r2_list', 'tool_key', 'agentsam_r2_list', 'develop', 1, 0, '439: r2_list → agentsam_r2_list', 1, unixepoch(), unixepoch()),
  ('cap_alias_r2_write_agentsam_439', 'r2_write', 'tool_key', 'agentsam_r2_write', 'develop', 1, 0, '439: r2_write → agentsam_r2_write', 1, unixepoch(), unixepoch()),
  ('cap_alias_github_repos_agentsam_439', 'github_repos', 'tool_key', 'agentsam_github_repo_list', 'develop', 1, 0, '439: github_repos → agentsam_github_repo_list', 1, unixepoch(), unixepoch()),
  ('cap_alias_github_pr_agentsam_439', 'github_create_pr', 'tool_key', 'agentsam_github_pr_create', 'develop', 1, 0, '439: github_create_pr → agentsam_github_pr_create', 1, unixepoch(), unixepoch());

-- agentsam_db_write catalog row delegates to same D1 executor as d1_write (handler_config on agentsam_db_write).
UPDATE agentsam_tools
SET handler_type = 'd1',
    handler_config = (
      SELECT handler_config FROM agentsam_tools WHERE tool_key = 'd1_write' LIMIT 1
    ),
    requires_approval = 1,
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_db_write'
  AND EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'd1_write' AND trim(COALESCE(handler_config, '')) != '');
