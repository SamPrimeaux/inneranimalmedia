-- 463: Backfill handler_key for all active agentsam_tools (catalog executor dispatch index).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/463_agentsam_tools_handler_key_backfill.sql

-- 1. handler_type = 'ai'
UPDATE agentsam_tools SET handler_key = 'ai_embed', updated_at = unixepoch()
WHERE tool_name = 'ai_embed';

UPDATE agentsam_tools SET handler_key = 'vectorize_query', updated_at = unixepoch()
WHERE tool_name = 'vectorize_query';

UPDATE agentsam_tools SET handler_key = 'vectorize_upsert', updated_at = unixepoch()
WHERE tool_name = 'vectorize_upsert';

UPDATE agentsam_tools SET
  handler_key = 'dispatchDatabaseAssistant',
  handler_type = 'hyperdrive',
  updated_at = unixepoch()
WHERE tool_name IN ('hyperdrive_readonly_query', 'hyperdrive_schema_inspect');

UPDATE agentsam_tools SET handler_key = 'imgx_generate', updated_at = unixepoch()
WHERE tool_name = 'imgx_generate_image';

UPDATE agentsam_tools SET handler_key = 'imgx_edit', updated_at = unixepoch()
WHERE tool_name = 'imgx_edit_image';

UPDATE agentsam_tools SET handler_key = 'imgx_list_providers', updated_at = unixepoch()
WHERE tool_name = 'imgx_list_providers';

UPDATE agentsam_tools SET handler_key = 'meshyai_text_to_3d', updated_at = unixepoch()
WHERE tool_name = 'meshyai_text_to_3d';

UPDATE agentsam_tools SET handler_key = 'meshyai_image_to_3d', updated_at = unixepoch()
WHERE tool_name = 'meshyai_image_to_3d';

UPDATE agentsam_tools SET handler_key = 'social_card_generate', updated_at = unixepoch()
WHERE tool_name = 'social_card_generate';

UPDATE agentsam_tools SET handler_key = 'veo_generate_video', updated_at = unixepoch()
WHERE tool_name = 'veo_generate_video';

UPDATE agentsam_tools SET handler_key = 'workspace_grep', updated_at = unixepoch()
WHERE tool_name = 'fs_search_files';

UPDATE agentsam_tools SET handler_key = 'open_web_search', updated_at = unixepoch()
WHERE tool_name = 'search_web';

UPDATE agentsam_tools SET handler_key = 'web_fetch', updated_at = unixepoch()
WHERE tool_name = 'web_fetch';

UPDATE agentsam_tools SET handler_key = 'dispatchSemanticRetrieval', updated_at = unixepoch()
WHERE tool_name IN (
  'code_semantic_search',
  'schema_semantic_search',
  'memory_semantic_search',
  'docs_knowledge_search',
  'deep_archive_search'
);

UPDATE agentsam_tools SET handler_key = 'dispatchDatabaseAssistant', updated_at = unixepoch()
WHERE tool_name = 'database_assistant';

-- 2. handler_type = 'd1'
UPDATE agentsam_tools SET handler_key = 'd1_query', updated_at = unixepoch() WHERE tool_name = 'd1_query';
UPDATE agentsam_tools SET handler_key = 'd1_write', updated_at = unixepoch() WHERE tool_name = 'd1_write';
UPDATE agentsam_tools SET handler_key = 'd1_schema', updated_at = unixepoch() WHERE tool_name = 'd1_schema';
UPDATE agentsam_tools SET handler_key = 'd1_explain', updated_at = unixepoch() WHERE tool_name = 'd1_explain';
UPDATE agentsam_tools SET handler_key = 'd1_migrate', updated_at = unixepoch() WHERE tool_name = 'd1_migrations_draft';

UPDATE agentsam_tools SET handler_key = 'agentsam_health_check', updated_at = unixepoch() WHERE tool_name = 'agentsam_health_check';
UPDATE agentsam_tools SET handler_key = 'agentsam_workspace_context', updated_at = unixepoch() WHERE tool_name = 'agentsam_workspace_context';
UPDATE agentsam_tools SET handler_key = 'agentsam_recent_errors', updated_at = unixepoch() WHERE tool_name = 'agentsam_recent_errors';
UPDATE agentsam_tools SET handler_key = 'agentsam_search_tools', updated_at = unixepoch() WHERE tool_name = 'agentsam_search_tools';
UPDATE agentsam_tools SET handler_key = 'agentsam_list_agents', updated_at = unixepoch() WHERE tool_name = 'agentsam_list_agents';
UPDATE agentsam_tools SET handler_key = 'agentsam_get_agent', updated_at = unixepoch() WHERE tool_name = 'agentsam_get_agent';
UPDATE agentsam_tools SET handler_key = 'agentsam_todo_add', updated_at = unixepoch() WHERE tool_name = 'agentsam_todo_add';
UPDATE agentsam_tools SET handler_key = 'agentsam_todo_update', updated_at = unixepoch() WHERE tool_name = 'agentsam_todo_update';
UPDATE agentsam_tools SET handler_key = 'agentsam_workflow_status', updated_at = unixepoch() WHERE tool_name = 'agentsam_workflow_status';
UPDATE agentsam_tools SET handler_key = 'agentsam_spend_summary', updated_at = unixepoch() WHERE tool_name = 'agentsam_spend_summary';
UPDATE agentsam_tools SET handler_key = 'd1_query', updated_at = unixepoch() WHERE tool_name = 'agentsam_db_query';
UPDATE agentsam_tools SET handler_key = 'd1_schema', updated_at = unixepoch() WHERE tool_name = 'agentsam_db_schema';
UPDATE agentsam_tools SET handler_key = 'd1_write', updated_at = unixepoch() WHERE tool_name = 'agentsam_db_write';

-- 3. filesystem
UPDATE agentsam_tools SET handler_key = 'fs_read', updated_at = unixepoch() WHERE tool_name = 'fs_read_file';
UPDATE agentsam_tools SET handler_key = 'fs_write', updated_at = unixepoch() WHERE tool_name = 'fs_write_file';
UPDATE agentsam_tools SET handler_key = 'fs_edit', updated_at = unixepoch() WHERE tool_name = 'fs_edit_file';
UPDATE agentsam_tools SET handler_key = 'fs_write', updated_at = unixepoch() WHERE tool_name = 'workspace_write_file';
UPDATE agentsam_tools SET handler_key = 'fs_apply_patch', updated_at = unixepoch() WHERE tool_name = 'workspace_apply_patch';

-- 4. github
UPDATE agentsam_tools SET handler_key = 'github_get_file', updated_at = unixepoch() WHERE tool_name = 'github_file';
UPDATE agentsam_tools SET handler_key = 'github_list_repos', updated_at = unixepoch() WHERE tool_name IN ('github_repos', 'agentsam_github_repo_list');
UPDATE agentsam_tools SET handler_key = 'github_create_file', updated_at = unixepoch() WHERE tool_name = 'github_create_file';
UPDATE agentsam_tools SET handler_key = 'github_update_file', updated_at = unixepoch() WHERE tool_name = 'github_update_file';
UPDATE agentsam_tools SET handler_key = 'github_create_branch', updated_at = unixepoch() WHERE tool_name = 'github_create_branch';
UPDATE agentsam_tools SET handler_key = 'github_create_pr', updated_at = unixepoch() WHERE tool_name IN ('github_create_pr', 'agentsam_github_pr_create');
UPDATE agentsam_tools SET handler_key = 'github_merge_pr', updated_at = unixepoch() WHERE tool_name = 'github_merge_pr';

-- 5. http
UPDATE agentsam_tools SET handler_key = 'http_fetch', updated_at = unixepoch() WHERE tool_name = 'http_fetch';
UPDATE agentsam_tools SET handler_key = 'resend_send_email', updated_at = unixepoch() WHERE tool_name = 'resend_send_email';
UPDATE agentsam_tools SET handler_key = 'resend_send_broadcast', updated_at = unixepoch() WHERE tool_name = 'resend_send_broadcast';
UPDATE agentsam_tools SET handler_key = 'cloudflare_api', updated_at = unixepoch() WHERE tool_name = 'cloudflare_command_registry';
UPDATE agentsam_tools SET handler_key = 'agentsam_vectorize_describe', updated_at = unixepoch() WHERE tool_name = 'agentsam_vectorize_describe';
UPDATE agentsam_tools SET handler_key = 'cms_write', updated_at = unixepoch() WHERE tool_name = 'agentsam_cms_write';
UPDATE agentsam_tools SET handler_key = 'cms_publish', updated_at = unixepoch() WHERE tool_name = 'agentsam_cms_publish';
UPDATE agentsam_tools SET handler_key = 'workflow_trigger', updated_at = unixepoch() WHERE tool_name = 'agentsam_workflow_trigger';
UPDATE agentsam_tools SET handler_key = 'codemode', updated_at = unixepoch() WHERE tool_name = 'codemode';

-- 6. hyperdrive
UPDATE agentsam_tools SET handler_key = 'rag_ingest', updated_at = unixepoch() WHERE tool_name = 'rag_ingest';
UPDATE agentsam_tools SET handler_key = 'rag_status', updated_at = unixepoch() WHERE tool_name = 'rag_status';

-- 7. mcp
UPDATE agentsam_tools SET handler_key = 'agentsam_plan', updated_at = unixepoch() WHERE tool_name = 'agentsam_plan';
UPDATE agentsam_tools SET handler_key = 'agentsam_run', updated_at = unixepoch() WHERE tool_name = 'agentsam_run';
UPDATE agentsam_tools SET handler_key = 'agentsam_spawn_profile', updated_at = unixepoch() WHERE tool_name = 'agentsam_spawn_profile';
UPDATE agentsam_tools SET handler_key = 'cms_read', updated_at = unixepoch() WHERE tool_name = 'agentsam_cms_read';
UPDATE agentsam_tools SET handler_key = 'codebase_create', updated_at = unixepoch() WHERE tool_name = 'agentsam_codebase_create';
UPDATE agentsam_tools SET handler_key = 'codebase_scan_fix', updated_at = unixepoch() WHERE tool_name = 'agentsam_codebase_scan_fix';
UPDATE agentsam_tools SET handler_key = 'human_context_list', updated_at = unixepoch() WHERE tool_name = 'human_context_list';
UPDATE agentsam_tools SET handler_key = 'worker_deploy', updated_at = unixepoch() WHERE tool_name = 'worker_deploy';
UPDATE agentsam_tools SET handler_key = 'deploy_status', updated_at = unixepoch() WHERE tool_name IN ('deploy_status', 'agentsam_deploy_status');
UPDATE agentsam_tools SET handler_key = 'get_deploy_command', updated_at = unixepoch() WHERE tool_name = 'get_deploy_command';
UPDATE agentsam_tools SET handler_key = 'get_worker_services', updated_at = unixepoch() WHERE tool_name = 'get_worker_services';
UPDATE agentsam_tools SET handler_key = 'list_workers', updated_at = unixepoch() WHERE tool_name = 'list_workers';
UPDATE agentsam_tools SET handler_key = 'moviemode_export', updated_at = unixepoch() WHERE tool_name = 'moviemode_export';
UPDATE agentsam_tools SET handler_key = 'memory_manager', updated_at = unixepoch() WHERE tool_name = 'agentsam_memory_manager';
UPDATE agentsam_tools SET handler_key = 'memory_query', updated_at = unixepoch() WHERE tool_name = 'agentsam_memory_query';
UPDATE agentsam_tools SET handler_key = 'memory_save', updated_at = unixepoch() WHERE tool_name = 'agentsam_memory_save';
UPDATE agentsam_tools SET handler_key = 'memory_search', updated_at = unixepoch() WHERE tool_name = 'agentsam_memory_search';
UPDATE agentsam_tools SET handler_key = 'memory_write', updated_at = unixepoch() WHERE tool_name = 'agentsam_memory_write';
UPDATE agentsam_tools SET handler_key = 'notify', updated_at = unixepoch() WHERE tool_name = 'agentsam_notify';
UPDATE agentsam_tools SET handler_key = 'send_email', updated_at = unixepoch() WHERE tool_name = 'agentsam_send_email';
UPDATE agentsam_tools SET handler_key = 'daily_summary', updated_at = unixepoch() WHERE tool_name = 'agentsam_daily_summary';
UPDATE agentsam_tools SET handler_key = 'find_and_act', updated_at = unixepoch() WHERE tool_name = 'agentsam_find_and_act';
UPDATE agentsam_tools SET handler_key = 'generate_execution_plan', updated_at = unixepoch() WHERE tool_name = 'generate_execution_plan';
UPDATE agentsam_tools SET handler_key = 'workflow_run_pipeline', updated_at = unixepoch() WHERE tool_name = 'workflow_run_pipeline';

-- 8. mybrowser
UPDATE agentsam_tools SET handler_key = 'browser_navigate', updated_at = unixepoch() WHERE tool_name = 'browser_navigate';
UPDATE agentsam_tools SET handler_key = 'browser_content', updated_at = unixepoch() WHERE tool_name = 'browser_content';
UPDATE agentsam_tools SET handler_key = 'browser_close_session', updated_at = unixepoch() WHERE tool_name = 'browser_close_session';
UPDATE agentsam_tools SET handler_key = 'cdt_take_snapshot', updated_at = unixepoch() WHERE tool_name = 'cdt_take_snapshot';
UPDATE agentsam_tools SET handler_key = 'cdt_evaluate_script', updated_at = unixepoch() WHERE tool_name = 'cdt_evaluate_script';
UPDATE agentsam_tools SET handler_key = 'cdt_list_console_messages', updated_at = unixepoch() WHERE tool_name = 'cdt_list_console_messages';
UPDATE agentsam_tools SET handler_key = 'cdt_list_network_requests', updated_at = unixepoch() WHERE tool_name = 'cdt_list_network_requests';
UPDATE agentsam_tools SET handler_key = 'cdt_take_screenshot', updated_at = unixepoch() WHERE tool_name = 'cdt_take_screenshot';
UPDATE agentsam_tools SET handler_key = 'playwright_screenshot', updated_at = unixepoch() WHERE tool_name = 'playwright_screenshot';
UPDATE agentsam_tools SET handler_key = 'cdt_hover', updated_at = unixepoch() WHERE tool_name = 'cdt_hover';
UPDATE agentsam_tools SET handler_key = 'cdt_navigate_page', updated_at = unixepoch() WHERE tool_name = 'cdt_navigate_page';

-- 9. proxy
UPDATE agentsam_tools SET handler_key = 'gdrive_fetch', updated_at = unixepoch() WHERE tool_name = 'gdrive_fetch';
UPDATE agentsam_tools SET handler_key = 'gdrive_list', updated_at = unixepoch() WHERE tool_name = 'gdrive_list';
UPDATE agentsam_tools SET handler_key = 'gdrive_fetch', updated_at = unixepoch() WHERE tool_name = 'agentsam_drive_read';
UPDATE agentsam_tools SET handler_key = 'excalidraw_open', updated_at = unixepoch() WHERE tool_name = 'excalidraw_open';

-- 10. r2
UPDATE agentsam_tools SET handler_key = 'r2_read', updated_at = unixepoch() WHERE tool_name IN ('r2_read', 'agentsam_r2_read');
UPDATE agentsam_tools SET handler_key = 'r2_write', updated_at = unixepoch() WHERE tool_name IN ('r2_write', 'agentsam_r2_write');
UPDATE agentsam_tools SET handler_key = 'r2_list', updated_at = unixepoch() WHERE tool_name IN ('r2_list', 'agentsam_r2_list');
UPDATE agentsam_tools SET handler_key = 'r2_search', updated_at = unixepoch() WHERE tool_name = 'r2_search';
UPDATE agentsam_tools SET handler_key = 'r2_upload', updated_at = unixepoch() WHERE tool_name = 'agentsam_r2_upload';

-- 11. supabase
UPDATE agentsam_tools SET handler_key = 'supabase_query', updated_at = unixepoch() WHERE tool_name = 'supabase_query';
UPDATE agentsam_tools SET handler_key = 'supabase_write', updated_at = unixepoch() WHERE tool_name = 'supabase_write';
UPDATE agentsam_tools SET handler_key = 'supabase_schema', updated_at = unixepoch() WHERE tool_name = 'supabase_schema';
UPDATE agentsam_tools SET handler_key = 'supabase_vector', updated_at = unixepoch() WHERE tool_name = 'supabase_vector';

-- 12. terminal
UPDATE agentsam_tools SET handler_key = 'terminal_wrangler', updated_at = unixepoch() WHERE tool_name = 'terminal_wrangler';
UPDATE agentsam_tools SET handler_key = 'terminal_execute', updated_at = unixepoch() WHERE tool_name = 'terminal_execute';
UPDATE agentsam_tools SET handler_key = 'terminal_run', updated_at = unixepoch() WHERE tool_name = 'terminal_run';

-- 13. workspace.reader
UPDATE agentsam_tools SET handler_key = 'workspace_read', updated_at = unixepoch() WHERE tool_name = 'workspace_read_file';
UPDATE agentsam_tools SET handler_key = 'workspace_list', updated_at = unixepoch() WHERE tool_name = 'workspace_list_files';
UPDATE agentsam_tools SET handler_key = 'workspace_grep', updated_at = unixepoch() WHERE tool_name = 'workspace_search';
UPDATE agentsam_tools SET handler_key = 'workspace_semantic', updated_at = unixepoch() WHERE tool_name = 'workspace_search_semantic';

-- legacy RAG (degraded)
UPDATE agentsam_tools SET handler_key = 'legacy_unified_rag', updated_at = unixepoch()
WHERE tool_name IN ('knowledge_search', 'rag_search', 'ss_search_knowledge');

-- Semantic lane tools (462): keep handler_type ai for catalog executor case 'ai' dispatchers
UPDATE agentsam_tools SET handler_type = 'ai', updated_at = unixepoch()
WHERE tool_name IN (
  'code_semantic_search',
  'schema_semantic_search',
  'memory_semantic_search',
  'docs_knowledge_search',
  'deep_archive_search',
  'database_assistant'
);
