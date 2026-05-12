INSERT OR REPLACE INTO agentsam_workflows (
  id,
  tenant_id,
  workspace_id,
  workflow_key,
  display_name,
  description,
  workflow_type,
  trigger_type,
  default_mode,
  default_task_type,
  risk_level,
  requires_approval,
  max_concurrent_nodes,
  timeout_ms,
  quality_gate_json,
  metadata_json,
  is_active,
  created_at,
  updated_at,
  is_platform_global
)
VALUES
(
  'wf_dashboard_agent_self_debug',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'dashboard_agent_self_debug',
  'Dashboard Agent Self Debug',
  'Agent Sam inspects the live /dashboard/agent workbench using browser/CDT tools, stream debug, console/network evidence, and D1 state.',
  'agentic',
  'agent_chat',
  'agent',
  'dashboard_debug',
  'low',
  0,
  3,
  300000,
  json_object(
    'pass_conditions', json_array(
      'dashboard_agent_page_loads',
      'stream_debug_readable',
      'console_and_network_checked',
      'd1_run_state_checked'
    )
  ),
  json_object(
    'version', 1,
    'purpose', 'debug_live_dashboard_agent_workbench',
    'entrypoint', '/dashboard/agent',
    'model_preference', 'gpt-5.4-mini',
    'tool_policy', json_object(
      'allow_readonly', 1,
      'allow_browser', 1,
      'allow_d1_read', 1,
      'allow_terminal_read', 1,
      'allow_writes', 0,
      'allow_deploy', 0
    ),
    'steps', json_array(
      json_object('node_key','classify_request','title','Classify workbench debug request','handler_type','agent'),
      json_object('node_key','create_plan','title','Create Agent Sam plan and tasks','handler_type','agent','tool','agentsam_plan_create'),
      json_object('node_key','open_dashboard','title','Open live dashboard agent page','handler_type','mcp_tool','tool','browser_open_url','input',json_object('url','https://inneranimalmedia.com/dashboard/agent')),
      json_object('node_key','read_stream_debug','title','Read dashboard stream debug object','handler_type','mcp_tool','tool','browser_eval_safe','input',json_object('script','(() => window.__IAM_AGENT_LAST_STREAM_DEBUG || null)()')),
      json_object('node_key','inspect_console','title','Inspect console errors','handler_type','mcp_tool','tool','browser_get_console_errors'),
      json_object('node_key','inspect_network','title','Inspect network activity','handler_type','mcp_tool','tool','browser_get_network_events'),
      json_object('node_key','query_d1_run_state','title','Query D1 run state','handler_type','db_query','tool','d1_readonly_query'),
      json_object('node_key','diagnose','title','Return diagnosis in chat','handler_type','agent')
    ),
    'edges', json_array(
      json_object('from','classify_request','to','create_plan'),
      json_object('from','create_plan','to','open_dashboard'),
      json_object('from','open_dashboard','to','read_stream_debug'),
      json_object('from','read_stream_debug','to','inspect_console'),
      json_object('from','inspect_console','to','inspect_network'),
      json_object('from','inspect_network','to','query_d1_run_state'),
      json_object('from','query_d1_run_state','to','diagnose')
    )
  ),
  1,
  datetime('now'),
  datetime('now'),
  1
),
(
  'wf_agent_chat_plan_from_request',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'agent_chat_plan_from_request',
  'Agent Chat Plan From Request',
  'Turns a multi-step /dashboard/agent chat message into an agentsam_plan plus agentsam_plan_tasks before execution.',
  'agentic',
  'agent_chat',
  'agent',
  'planning',
  'low',
  0,
  3,
  300000,
  json_object(
    'pass_conditions', json_array(
      'plan_created',
      'tasks_created',
      'plan_visible_to_chat'
    )
  ),
  json_object(
    'version', 1,
    'purpose', 'create_plan_and_tasks_from_chat',
    'model_preference', 'gpt-5.4-mini',
    'tool_policy', json_object(
      'allow_readonly', 1,
      'allow_d1_write_plan_only', 1,
      'allow_terminal', 0,
      'allow_deploy', 0
    ),
    'steps', json_array(
      json_object('node_key','detect_multistep','title','Detect whether request needs a plan','handler_type','agent'),
      json_object('node_key','insert_plan','title','Insert agentsam_plans row','handler_type','agent','tool','agentsam_plan_create'),
      json_object('node_key','insert_tasks','title','Insert agentsam_plan_tasks rows','handler_type','agent','tool','agentsam_plan_tasks_create'),
      json_object('node_key','stream_plan_to_chat','title','Stream plan to dashboard chat','handler_type','agent')
    ),
    'edges', json_array(
      json_object('from','detect_multistep','to','insert_plan'),
      json_object('from','insert_plan','to','insert_tasks'),
      json_object('from','insert_tasks','to','stream_plan_to_chat')
    )
  ),
  1,
  datetime('now'),
  datetime('now'),
  1
),
(
  'wf_repo_clone_inspect',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'repo_clone_inspect',
  'Repository Clone and Inspect',
  'Agent Sam selects a GitHub repository, clones or opens it in the workbench, inspects files, and reports project state without deploying.',
  'agentic',
  'agent_chat',
  'agent',
  'repo_inspect',
  'medium',
  0,
  3,
  300000,
  json_object(
    'pass_conditions', json_array(
      'repo_selected',
      'repo_available_locally_or_remotely',
      'repo_tree_read',
      'project_state_reported'
    )
  ),
  json_object(
    'version', 1,
    'purpose', 'clone_or_open_repo_and_inspect',
    'model_preference', 'gpt-5.4-mini',
    'tool_policy', json_object(
      'allow_github_read', 1,
      'allow_filesystem_read', 1,
      'allow_terminal_read', 1,
      'allow_writes', 0,
      'allow_deploy', 0
    ),
    'steps', json_array(
      json_object('node_key','list_repos','title','List available GitHub repositories','handler_type','mcp_tool','tool','github_repos'),
      json_object('node_key','select_repo','title','Select target repository','handler_type','agent'),
      json_object('node_key','open_or_clone_repo','title','Open or clone repository','handler_type','terminal','tool','terminal_command'),
      json_object('node_key','read_repo_tree','title','Read repository tree','handler_type','terminal','tool','terminal_command'),
      json_object('node_key','inspect_package_and_routes','title','Inspect app scripts and routing files','handler_type','terminal','tool','terminal_command'),
      json_object('node_key','report_repo_state','title','Report repository state in chat','handler_type','agent')
    ),
    'edges', json_array(
      json_object('from','list_repos','to','select_repo'),
      json_object('from','select_repo','to','open_or_clone_repo'),
      json_object('from','open_or_clone_repo','to','read_repo_tree'),
      json_object('from','read_repo_tree','to','inspect_package_and_routes'),
      json_object('from','inspect_package_and_routes','to','report_repo_state')
    )
  ),
  1,
  datetime('now'),
  datetime('now'),
  1
),
(
  'wf_file_artifact_read_scan',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'file_artifact_read_scan',
  'File and Artifact Read Scan',
  'Agent Sam reads uploaded files, R2 artifacts, repo files, or dashboard artifacts and summarizes them with evidence.',
  'agentic',
  'agent_chat',
  'agent',
  'file_analysis',
  'low',
  0,
  3,
  300000,
  json_object(
    'pass_conditions', json_array(
      'file_or_artifact_located',
      'content_or_metadata_read',
      'summary_grounded_in_evidence'
    )
  ),
  json_object(
    'version', 1,
    'purpose', 'read_scan_files_artifacts',
    'model_preference', 'gpt-5.4-mini',
    'tool_policy', json_object(
      'allow_file_read', 1,
      'allow_r2_read', 1,
      'allow_repo_read', 1,
      'allow_d1_read', 1,
      'allow_writes', 0
    ),
    'steps', json_array(
      json_object('node_key','locate_file','title','Locate requested file or artifact','handler_type','agent','tool','file_scan'),
      json_object('node_key','read_file','title','Read file contents or metadata','handler_type','agent','tool','file_read'),
      json_object('node_key','summarize_evidence','title','Summarize with evidence','handler_type','agent')
    ),
    'edges', json_array(
      json_object('from','locate_file','to','read_file'),
      json_object('from','read_file','to','summarize_evidence')
    )
  ),
  1,
  datetime('now'),
  datetime('now'),
  1
),
(
  'wf_deploy_plan_verify',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'deploy_plan_verify',
  'Deployment Plan and Verify',
  'Agent Sam prepares a deployment plan, checks git status/build state, and verifies live deployment evidence. Actual deploy execution requires approval.',
  'agentic',
  'agent_chat',
  'agent',
  'deploy',
  'high',
  1,
  2,
  600000,
  json_object(
    'pass_conditions', json_array(
      'git_status_checked',
      'build_check_completed',
      'deploy_plan_created',
      'approval_required_before_execution',
      'live_verify_completed_after_deploy'
    )
  ),
  json_object(
    'version', 1,
    'purpose', 'plan_and_verify_deployment',
    'model_preference', 'gpt-5.4-mini',
    'tool_policy', json_object(
      'allow_git_read', 1,
      'allow_build_read', 1,
      'allow_d1_read', 1,
      'allow_r2_read', 1,
      'allow_deploy_execute', 0,
      'requires_approval_for_deploy', 1
    ),
    'steps', json_array(
      json_object('node_key','git_status','title','Check git status and current commit','handler_type','terminal','tool','terminal_command'),
      json_object('node_key','build_check','title','Run safe build/check commands','handler_type','terminal','tool','terminal_command'),
      json_object('node_key','deployment_plan','title','Create deployment plan','handler_type','agent'),
      json_object('node_key','approval_gate','title','Require approval before deploy execution','handler_type','approval_gate','risk_level','high','requires_approval',1),
      json_object('node_key','verify_live','title','Verify live deployment evidence','handler_type','agent','tool','deploy_verify')
    ),
    'edges', json_array(
      json_object('from','git_status','to','build_check'),
      json_object('from','build_check','to','deployment_plan'),
      json_object('from','deployment_plan','to','approval_gate'),
      json_object('from','approval_gate','to','verify_live')
    )
  ),
  1,
  datetime('now'),
  datetime('now'),
  1
);
