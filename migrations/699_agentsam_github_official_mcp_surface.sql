-- 699: Register GitHub's official remote MCP server (api.githubcopilot.com) as a
-- second GitHub tool surface for Agent Sam, covering toolsets NOT already implemented
-- by the native agentsam_github_* REST handler (see 505_add_agentsam_github_full_surface.sql).
--
-- All rows: handler_type=mcp, dispatched via executeMcpCatalogRow -> JSON-RPC tools/call
-- against handler_config.mcp_service_url, using handler_config.operation as the exact
-- remote tool name. Auth: handler_config.auth_source=user_oauth_tokens, provider=github
-- (requires the catalog-tool-executor.js patch documented alongside this migration to
-- thread the GitHub PAT through as a Bearer token instead of platform MCP secrets).
--
-- Naming: agentsam_github_mcp_<official_tool_name> to avoid any collision with the
-- existing agentsam_github_* rows (505/506), which remain the source of truth for
-- repos/files/branches/PRs/issues/comments/search.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/699_agentsam_github_official_mcp_surface.sql

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval,
   workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES

-- ── Actions ──────────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_actions_get', 'agentsam_github_mcp_actions_get',
  'GitHub Actions Get', 'github.actions',
  'Get details of a GitHub Actions resource (workflow, run, job, or artifact) via method+resource_id.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"method":{"type":"string","enum":["get_workflow","get_workflow_run","get_workflow_run_usage","get_workflow_run_logs_url","download_workflow_run_artifact","get_workflow_job"]},"resource_id":{"type":"string"}},"required":["user_id","owner","repo","method","resource_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"actions_get","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_actions_list', 'agentsam_github_mcp_actions_list',
  'GitHub Actions List', 'github.actions',
  'List workflows, workflow runs, workflow jobs, or artifacts for a repository.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"method":{"type":"string","enum":["list_workflows","list_workflow_runs","list_workflow_jobs","list_workflow_run_artifacts"]},"resource_id":{"type":"string"},"page":{"type":"integer"},"per_page":{"type":"integer"}},"required":["user_id","owner","repo","method"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"actions_list","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_actions_run_trigger', 'agentsam_github_mcp_actions_run_trigger',
  'GitHub Actions Trigger', 'github.actions',
  'Trigger or manage a GitHub Actions workflow run (run_workflow, cancel_workflow_run, rerun_workflow_run, etc).',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"method":{"type":"string"},"workflow_id":{"type":"string"},"ref":{"type":"string"},"inputs":{"type":"object"},"run_id":{"type":"integer"}},"required":["user_id","owner","repo","method"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"actions_run_trigger","auth_source":"user_oauth_tokens","provider":"github"}',
  'high', 1, '["*"]', '["agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_get_job_logs', 'agentsam_github_mcp_get_job_logs',
  'GitHub Actions Job Logs', 'github.actions',
  'Get GitHub Actions workflow job logs, or all failed job logs for a run.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"job_id":{"type":"integer"},"run_id":{"type":"integer"},"failed_only":{"type":"boolean"},"return_content":{"type":"boolean"},"tail_lines":{"type":"integer"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_job_logs","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Code Security ────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_get_code_scanning_alert', 'agentsam_github_mcp_get_code_scanning_alert',
  'GitHub Code Scanning Alert', 'github.security',
  'Get a specific code scanning alert by number.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"alertNumber":{"type":"integer"}},"required":["user_id","owner","repo","alertNumber"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_code_scanning_alert","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_code_scanning_alerts', 'agentsam_github_mcp_list_code_scanning_alerts',
  'GitHub Code Scanning Alerts List', 'github.security',
  'List code scanning alerts for a repository, filterable by ref/severity/state/tool.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"ref":{"type":"string"},"severity":{"type":"string"},"state":{"type":"string"},"tool_name":{"type":"string"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_code_scanning_alerts","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Secret Protection ────────────────────────────────────────────────────
(
  'agentsam_github_mcp_get_secret_scanning_alert', 'agentsam_github_mcp_get_secret_scanning_alert',
  'GitHub Secret Scanning Alert', 'github.security',
  'Get a specific secret scanning alert by number.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"alertNumber":{"type":"integer"}},"required":["user_id","owner","repo","alertNumber"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_secret_scanning_alert","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_secret_scanning_alerts', 'agentsam_github_mcp_list_secret_scanning_alerts',
  'GitHub Secret Scanning Alerts List', 'github.security',
  'List secret scanning alerts for a repository, filterable by resolution/secret_type/state.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"resolution":{"type":"string"},"secret_type":{"type":"string"},"state":{"type":"string"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_secret_scanning_alerts","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Dependabot ───────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_get_dependabot_alert', 'agentsam_github_mcp_get_dependabot_alert',
  'GitHub Dependabot Alert', 'github.security',
  'Get a specific Dependabot alert by number.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"alertNumber":{"type":"integer"}},"required":["user_id","owner","repo","alertNumber"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_dependabot_alert","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_dependabot_alerts', 'agentsam_github_mcp_list_dependabot_alerts',
  'GitHub Dependabot Alerts List', 'github.security',
  'List Dependabot alerts for a repository, filterable by severity/state.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"severity":{"type":"string"},"state":{"type":"string"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_dependabot_alerts","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Security Advisories ──────────────────────────────────────────────────
(
  'agentsam_github_mcp_get_global_security_advisory', 'agentsam_github_mcp_get_global_security_advisory',
  'GitHub Global Security Advisory', 'github.security',
  'Get a global security advisory by GHSA id.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"ghsaId":{"type":"string"}},"required":["user_id","ghsaId"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_global_security_advisory","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_global_security_advisories', 'agentsam_github_mcp_list_global_security_advisories',
  'GitHub Global Security Advisories List', 'github.security',
  'List/search global security advisories by ecosystem, CVE, CWE, severity, or affected package.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"affects":{"type":"string"},"cveId":{"type":"string"},"cwes":{"type":"array","items":{"type":"string"}},"ecosystem":{"type":"string"},"ghsaId":{"type":"string"},"severity":{"type":"string"},"type":{"type":"string"}},"required":["user_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_global_security_advisories","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_org_repository_security_advisories', 'agentsam_github_mcp_list_org_repository_security_advisories',
  'GitHub Org Security Advisories List', 'github.security',
  'List repository security advisories across an organization.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"org":{"type":"string"},"direction":{"type":"string"},"sort":{"type":"string"},"state":{"type":"string"}},"required":["user_id","org"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_org_repository_security_advisories","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_repository_security_advisories', 'agentsam_github_mcp_list_repository_security_advisories',
  'GitHub Repo Security Advisories List', 'github.security',
  'List security advisories for a specific repository.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"direction":{"type":"string"},"sort":{"type":"string"},"state":{"type":"string"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_repository_security_advisories","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Discussions ──────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_get_discussion', 'agentsam_github_mcp_get_discussion',
  'GitHub Discussion Get', 'github.discussions',
  'Get a GitHub Discussion by number.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"discussionNumber":{"type":"integer"}},"required":["user_id","owner","repo","discussionNumber"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_discussion","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_get_discussion_comments', 'agentsam_github_mcp_get_discussion_comments',
  'GitHub Discussion Comments', 'github.discussions',
  'Get comments on a GitHub Discussion.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"discussionNumber":{"type":"integer"},"after":{"type":"string"},"perPage":{"type":"integer"}},"required":["user_id","owner","repo","discussionNumber"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_discussion_comments","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_discussion_categories', 'agentsam_github_mcp_list_discussion_categories',
  'GitHub Discussion Categories', 'github.discussions',
  'List discussion categories for a repository or organization.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","owner"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_discussion_categories","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_discussions', 'agentsam_github_mcp_list_discussions',
  'GitHub Discussions List', 'github.discussions',
  'List discussions for a repository or organization, filterable by category.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"after":{"type":"string"},"category":{"type":"string"},"direction":{"type":"string"},"orderBy":{"type":"string"},"perPage":{"type":"integer"}},"required":["user_id","owner"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_discussions","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Gists ────────────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_create_gist', 'agentsam_github_mcp_create_gist',
  'GitHub Gist Create', 'github.gists',
  'Create a single-file gist.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"content":{"type":"string"},"description":{"type":"string"},"filename":{"type":"string"},"public":{"type":"boolean"}},"required":["user_id","content","filename"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"create_gist","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_get_gist', 'agentsam_github_mcp_get_gist',
  'GitHub Gist Get', 'github.gists',
  'Get gist content by id.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"gist_id":{"type":"string"}},"required":["user_id","gist_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_gist","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_gists', 'agentsam_github_mcp_list_gists',
  'GitHub Gists List', 'github.gists',
  'List gists for the authenticated user or a given username.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"page":{"type":"integer"},"perPage":{"type":"integer"},"since":{"type":"string"},"username":{"type":"string"}},"required":["user_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_gists","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_update_gist', 'agentsam_github_mcp_update_gist',
  'GitHub Gist Update', 'github.gists',
  'Update a gist file/description.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"content":{"type":"string"},"description":{"type":"string"},"filename":{"type":"string"},"gist_id":{"type":"string"}},"required":["user_id","content","filename","gist_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"update_gist","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Labels ───────────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_get_label', 'agentsam_github_mcp_get_label',
  'GitHub Label Get', 'github.labels',
  'Get a specific label from a repository.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"name":{"type":"string"}},"required":["user_id","owner","repo","name"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_label","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_label_write', 'agentsam_github_mcp_label_write',
  'GitHub Label Write', 'github.labels',
  'Create, update, or delete a repository label.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"},"method":{"type":"string","enum":["create","update","delete"]},"name":{"type":"string"},"color":{"type":"string"},"description":{"type":"string"},"new_name":{"type":"string"}},"required":["user_id","owner","repo","method","name"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"label_write","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_label', 'agentsam_github_mcp_list_label',
  'GitHub Labels List', 'github.labels',
  'List labels from a repository.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_label","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Notifications ────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_dismiss_notification', 'agentsam_github_mcp_dismiss_notification',
  'GitHub Notification Dismiss', 'github.notifications',
  'Mark a notification thread as read or done.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"state":{"type":"string","enum":["read","done"]},"threadID":{"type":"string"}},"required":["user_id","state","threadID"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"dismiss_notification","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_get_notification_details', 'agentsam_github_mcp_get_notification_details',
  'GitHub Notification Details', 'github.notifications',
  'Get details for a specific notification.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"notificationID":{"type":"string"}},"required":["user_id","notificationID"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"get_notification_details","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_list_notifications', 'agentsam_github_mcp_list_notifications',
  'GitHub Notifications List', 'github.notifications',
  'List notifications for the authenticated user, optionally scoped to a repo.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"before":{"type":"string"},"filter":{"type":"string"},"owner":{"type":"string"},"page":{"type":"integer"},"perPage":{"type":"integer"},"repo":{"type":"string"},"since":{"type":"string"}},"required":["user_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_notifications","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_manage_notification_subscription', 'agentsam_github_mcp_manage_notification_subscription',
  'GitHub Notification Subscription', 'github.notifications',
  'Ignore, watch, or delete subscription for a notification thread.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"action":{"type":"string","enum":["ignore","watch","delete"]},"notificationID":{"type":"string"}},"required":["user_id","action","notificationID"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"manage_notification_subscription","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_manage_repository_notification_subscription', 'agentsam_github_mcp_manage_repository_notification_subscription',
  'GitHub Repo Notification Subscription', 'github.notifications',
  'Ignore, watch, or delete notification subscription for a repository.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"action":{"type":"string","enum":["ignore","watch","delete"]},"owner":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","action","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"manage_repository_notification_subscription","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_mark_all_notifications_read', 'agentsam_github_mcp_mark_all_notifications_read',
  'GitHub Notifications Mark All Read', 'github.notifications',
  'Mark all notifications (optionally scoped to a repo) as read.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"lastReadAt":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"}},"required":["user_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"mark_all_notifications_read","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Organizations ────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_search_orgs', 'agentsam_github_mcp_search_orgs',
  'GitHub Orgs Search', 'github.orgs',
  'Search GitHub organizations.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"order":{"type":"string"},"page":{"type":"integer"},"perPage":{"type":"integer"},"query":{"type":"string"},"sort":{"type":"string"}},"required":["user_id","query"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"search_orgs","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Projects (v2) ────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_projects_get', 'agentsam_github_mcp_projects_get',
  'GitHub Projects Get', 'github.projects',
  'Get details of a GitHub Projects (v2) resource (project, item, field, status update) by method.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"field_id":{"type":"integer"},"fields":{"type":"array","items":{"type":"string"}},"item_id":{"type":"integer"},"method":{"type":"string"},"owner":{"type":"string"},"owner_type":{"type":"string"},"project_number":{"type":"integer"},"status_update_id":{"type":"string"}},"required":["user_id","method"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"projects_get","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_projects_list', 'agentsam_github_mcp_projects_list',
  'GitHub Projects List', 'github.projects',
  'List GitHub Projects (v2) resources for a user/org: projects, fields, items, or status updates.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"after":{"type":"string"},"before":{"type":"string"},"fields":{"type":"array","items":{"type":"string"}},"method":{"type":"string"},"owner":{"type":"string"},"owner_type":{"type":"string"},"per_page":{"type":"integer"},"project_number":{"type":"integer"},"query":{"type":"string"}},"required":["user_id","method","owner"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"projects_list","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_projects_write', 'agentsam_github_mcp_projects_write',
  'GitHub Projects Write', 'github.projects',
  'Modify GitHub Projects (v2) items, fields, and status updates.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"body":{"type":"string"},"issue_number":{"type":"integer"},"item_id":{"type":"integer"},"item_owner":{"type":"string"},"item_repo":{"type":"string"},"item_type":{"type":"string"},"method":{"type":"string"},"owner":{"type":"string"},"owner_type":{"type":"string"},"project_number":{"type":"integer"},"pull_request_number":{"type":"integer"},"start_date":{"type":"string"},"status":{"type":"string"},"target_date":{"type":"string"},"updated_field":{"type":"object"}},"required":["user_id","method","owner","project_number"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"projects_write","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Stargazers ───────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_list_starred_repositories', 'agentsam_github_mcp_list_starred_repositories',
  'GitHub Starred Repos List', 'github.stargazers',
  'List starred repositories for the authenticated user or a given username.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"direction":{"type":"string"},"page":{"type":"integer"},"perPage":{"type":"integer"},"sort":{"type":"string"},"username":{"type":"string"}},"required":["user_id"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"list_starred_repositories","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_star_repository', 'agentsam_github_mcp_star_repository',
  'GitHub Star Repository', 'github.stargazers',
  'Star a repository.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"star_repository","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_unstar_repository', 'agentsam_github_mcp_unstar_repository',
  'GitHub Unstar Repository', 'github.stargazers',
  'Unstar a repository.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"unstar_repository","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Users ────────────────────────────────────────────────────────────────
(
  'agentsam_github_mcp_search_users', 'agentsam_github_mcp_search_users',
  'GitHub Users Search', 'github.users',
  'Search GitHub users.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"order":{"type":"string"},"page":{"type":"integer"},"perPage":{"type":"integer"},"query":{"type":"string"},"sort":{"type":"string"}},"required":["user_id","query"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"search_users","auth_source":"user_oauth_tokens","provider":"github"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
),

-- ── Copilot (coding agent) ───────────────────────────────────────────────
(
  'agentsam_github_mcp_assign_copilot_to_issue', 'agentsam_github_mcp_assign_copilot_to_issue',
  'GitHub Assign Copilot to Issue', 'github.copilot',
  'Assign GitHub Copilot coding agent to work an issue.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"base_ref":{"type":"string"},"custom_instructions":{"type":"string"},"issue_number":{"type":"integer"},"owner":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","issue_number","owner","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"assign_copilot_to_issue","auth_source":"user_oauth_tokens","provider":"github"}',
  'high', 1, '["*"]', '["agent","multitask"]', 1, 1, 1, unixepoch()
),
(
  'agentsam_github_mcp_request_copilot_review', 'agentsam_github_mcp_request_copilot_review',
  'GitHub Request Copilot Review', 'github.copilot',
  'Request a Copilot code review on a pull request.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"owner":{"type":"string"},"pullNumber":{"type":"integer"},"repo":{"type":"string"}},"required":["user_id","owner","pullNumber","repo"]}',
  'mcp', '{"mcp_service_url":"https://api.githubcopilot.com/mcp/","operation":"request_copilot_review","auth_source":"user_oauth_tokens","provider":"github"}',
  'medium', 1, '["*"]', '["ask","plan","debug","agent","multitask"]', 1, 1, 1, unixepoch()
)

ON CONFLICT(tool_key) DO UPDATE SET
  tool_name = excluded.tool_name,
  display_name = excluded.display_name,
  tool_category = excluded.tool_category,
  description = excluded.description,
  input_schema = excluded.input_schema,
  handler_type = excluded.handler_type,
  handler_config = excluded.handler_config,
  risk_level = excluded.risk_level,
  requires_approval = excluded.requires_approval,
  workspace_scope = excluded.workspace_scope,
  modes_json = excluded.modes_json,
  oauth_visible = excluded.oauth_visible,
  is_active = excluded.is_active,
  is_global = excluded.is_global,
  updated_at = unixepoch();
