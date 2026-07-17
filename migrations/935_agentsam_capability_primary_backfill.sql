-- 935: Primary capability backfill for active catalog tools.
WITH primary_map(tool_key, capability_key) AS (
  SELECT tool_key,
    CASE
      WHEN tool_key IN ('agentsam_get_agent','agentsam_list_agents') THEN 'agent.read'
      WHEN tool_key IN ('agentsam_spawn_profile','agentsam_create_subagent') THEN 'agent.spawn'
      WHEN tool_key IN ('agentsam_run_agent','ai_complete') THEN 'agent.execute'
      WHEN tool_key = 'agentsam_workflow_trigger' THEN 'workflow.execute'
      WHEN tool_key IN ('agentsam_ticket_get','agentsam_ticket_list') THEN 'ticket.read'
      WHEN tool_key IN ('agentsam_ticket_create','agentsam_ticket_add_note') THEN 'ticket.write'
      WHEN tool_key = 'agentsam_ticket_set_status' THEN 'ticket.status'
      WHEN tool_key = 'agentsam_memory_manager' THEN 'memory.read'
      WHEN tool_key = 'fs_read_file' THEN 'file.read'
      WHEN tool_key IN ('fs_search_files','agentsam_workspace_search') THEN 'file.search'
      WHEN tool_key IN ('fs_write_file','fs_edit_file','agentsam_codebase_scan_fix') THEN 'file.write'
      WHEN tool_key IN ('pty_git_status','pty_git_diff','pty_git_log') THEN 'git.read'
      WHEN tool_key = 'pty_git_commit' THEN 'git.commit'
      WHEN tool_key = 'pty_git_push' THEN 'git.push'
      WHEN tool_key = 'agentsam_github_mcp_actions_run_trigger' THEN 'github.workflow.execute'
      WHEN tool_category = 'github.security' THEN 'github.security.read'
      WHEN tool_key LIKE '%_write' OR tool_key LIKE '%_create_gist'
        OR tool_key LIKE '%_update_gist' OR tool_key LIKE '%_star_repository'
        OR tool_key LIKE '%_unstar_repository' OR tool_key LIKE '%_dismiss_notification'
        OR tool_key LIKE '%_mark_all_notifications_read'
        OR tool_key IN ('agentsam_github_issue','agentsam_github_pr','agentsam_github_patch','agentsam_github_write',
                        'agentsam_github_mcp_assign_copilot_to_issue','agentsam_github_mcp_request_copilot_review',
                        'agentsam_github_mcp_manage_notification_subscription',
                        'agentsam_github_mcp_manage_repository_notification_subscription')
        THEN 'github.write'
      WHEN tool_category LIKE 'github.%' THEN 'github.read'
      WHEN tool_key IN ('agentsam_terminal_local','agentsam_terminal_remote','agentsam_terminal_sandbox') THEN 'terminal.execute'
      WHEN tool_key = 'agentsam_container_exec' THEN 'container.execute'
      WHEN tool_key = 'agentsam_code_interpreter' THEN 'python.execute'
      WHEN tool_key IN ('agentsam_d1_query','agentsam_cf_d1_list') THEN 'd1.read'
      WHEN tool_key IN ('agentsam_d1_write','agentsam_d1_delete') THEN 'd1.write'
      WHEN tool_key = 'agentsam_d1_migrate' THEN 'd1.migrate'
      WHEN tool_key = 'agentsam_supabase_query' THEN 'supabase.read'
      WHEN tool_key = 'agentsam_supabase_write' THEN 'supabase.write'
      WHEN tool_key = 'agentsam_supabase_vector' THEN 'supabase.vector.read'
      WHEN tool_key = 'agentsam_cf_kv_list' THEN 'kv.read'
      WHEN tool_key = 'agentsam_kv_manage' THEN 'kv.write'
      WHEN tool_key IN ('agentsam_cf_r2_buckets','agentsam_r2_list','agentsam_r2_get') THEN 'r2.read'
      WHEN tool_key = 'agentsam_r2_put' THEN 'r2.write'
      WHEN tool_key = 'agentsam_r2_delete' THEN 'r2.delete'
      WHEN tool_key = 'agentsam_cf_vectorize' THEN 'vector.write'
      WHEN tool_key IN ('agentsam_cf_images_upload','agentsam_cf_image_upload') THEN 'images.write'
      WHEN tool_key IN ('agentsam_cf_workers_list','agentsam_cf_worker_get','agentsam_cf_worker_code',
                        'search_cloudflare_documentation','migrate_pages_to_workers_guide') THEN 'cloudflare.read'
      WHEN tool_key = 'cloudflare_command_registry' THEN 'cloudflare.execute'
      WHEN tool_key IN ('agentsam_worker_deploy','agentsam_stack_deploy') THEN 'cloudflare.deploy'
      WHEN tool_key IN ('browser_content','browser_run_content','browser_run_links','browser_run_crawl') THEN 'browser.read'
      WHEN tool_key = 'browser_navigate' THEN 'browser.navigate'
      WHEN tool_key IN ('agentsam_playwright','cdt_evaluate_script','browser_run_json',
                        'browser_run_markdown','browser_run_pdf','browser_run_scrape') THEN 'browser.execute'
      WHEN tool_key IN ('cdt_take_screenshot','browser_run_screenshot','browser_run_snapshot') THEN 'browser.capture'
      WHEN tool_key = 'search_web' THEN 'web.search'
      WHEN tool_key = 'web_fetch' THEN 'web.fetch'
      WHEN tool_key IN ('gmail_list_inbox','gmail_get_message','agentsam_gmail_mcp_get_thread',
                        'agentsam_gmail_mcp_search_threads','agentsam_gmail_mcp_list_drafts',
                        'agentsam_gmail_mcp_list_labels') THEN 'email.read'
      WHEN tool_key IN ('agentsam_gmail_mcp_create_draft','agentsam_gmail_mcp_create_label') THEN 'email.draft'
      WHEN tool_key IN ('gmail_send','agentsam_send_email') THEN 'email.send'
      WHEN tool_category IN ('gmail','gmail.official') THEN 'email.modify'
      WHEN tool_key IN ('agentsam_cms_read','agentsam_cms_verify_live') THEN 'cms.read'
      WHEN tool_key LIKE 'agentsam_cms_publish%' THEN 'cms.publish'
      WHEN tool_category = 'cms.execute' THEN 'cms.write'
      WHEN tool_key IN ('imgx_generate_image','veo_generate_video','illustration_create',
                        'meshyai_text_to_3d','meshyai_image_to_3d') THEN 'media.generate'
      WHEN tool_key = 'meshyai_get_task' THEN 'media.status'
      WHEN tool_key LIKE 'meshyai_%' OR tool_key = 'agentsam_video_embed' THEN 'media.transform'
      WHEN tool_key = 'moviemode_render' THEN 'media.render'
      WHEN tool_key = 'moviemode_export' THEN 'media.export'
      WHEN tool_key IN ('agentsam_excalidraw','excalidraw_load_library') THEN 'design.read'
      WHEN tool_key = 'excalidraw_plan_map_create' THEN 'design.write'
      WHEN tool_key = 'excalidraw_export' THEN 'design.export'
      WHEN tool_key = 'agentsam_gdrive' THEN 'drive.read'
      WHEN tool_key IN ('agentsam_mcp_audit','agentsam_spawn_tree') THEN 'platform.audit'
      WHEN tool_key = 'agentsam_ping' THEN 'platform.read'
      ELSE NULL
    END
  FROM agentsam_tools
  WHERE COALESCE(is_active,1)=1
)
INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, created_at)
SELECT t.id, pm.capability_key, 'required', 1, unixepoch()
FROM primary_map pm
JOIN agentsam_tools t ON t.tool_key = pm.tool_key
WHERE pm.capability_key IS NOT NULL;
