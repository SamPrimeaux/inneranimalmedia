# Agent Sam — Migration Chain Report
**Generated:** 2026-05-19T13:09:37.508098+00:00

## Summary
- Migration files found: 290
- Tables ever created/referenced by DDL: 200
- Live tables (not dropped): 162
- Indexes created: 326
- Destructive operations: 45
- Destructive ops without rollback marker: 34

## Wrangler D1 Binding
- Config file: `wrangler.jsonc`
- Database IDs: []
- Database names: []
- Bindings: []

## Gap Analysis
### Known Tables Not Created by Migration Chain
These may be created manually, created in remote D1 only, or missing migrations.
- `agent_memory_index`
- `agentsam_approvals`
- `agentsam_artifacts`
- `agentsam_error_log`
- `agentsam_plan_tasks`
- `agentsam_plans`
- `agentsam_scripts`
- `agentsam_todo`
- `context_index`
- `spend_audit`
- `vectorize_index_registry`

### Tables in Migrations Not in Known Agent Sam List
May be legacy, client tables, CMS tables, renamed tables, or unused tables.
- `activity_signals`
- `agent_command_audit_log`
- `agent_command_proposals`
- `agent_configs`
- `agent_conversations`
- `agent_execution_plans`
- `agent_intent_patterns`
- `agent_messages`
- `agent_mode_configs`
- `agent_request_queue`
- `agent_sessions`
- `agent_workspace_state`
- `agentsam_ai`
- `agentsam_analytics_new`
- `agentsam_approval_queue_new`
- `agentsam_browser_trusted_origin`
- `agentsam_capability_aliases`
- `agentsam_code_index_job`
- `agentsam_command_allowlist`
- `agentsam_cron_runs`
- `agentsam_escalation_new`
- `agentsam_execution_context_new`
- `agentsam_executions_new`
- `agentsam_feature_flag`
- `agentsam_fetch_domain_allowlist`
- `agentsam_guardrail_events`
- `agentsam_guardrail_rulesets`
- `agentsam_guardrails`
- `agentsam_hook_execution__new`
- `agentsam_hook_execution_new`
- `agentsam_hook_new`
- `agentsam_ignore_pattern`
- `agentsam_mcp_allowlist`
- `agentsam_mcp_tool_execution_new`
- `agentsam_mcp_tools_new`
- `agentsam_mcp_workflows`
- `agentsam_mcp_workflows_new`
- `agentsam_memory_new`
- `agentsam_model_catalog`
- `agentsam_model_routing_memory`
- `agentsam_plan_tasks_new`
- `agentsam_plans_new`
- `agentsam_plans_old`
- `agentsam_project_context_new`
- `agentsam_route_requirements`
- `agentsam_rules_document`
- `agentsam_rules_revision`
- `agentsam_script_runs_new`
- `agentsam_scripts_new`
- `agentsam_skill`
- `agentsam_skill_invocation`
- `agentsam_skill_revision`
- `agentsam_subagent_profile`
- `agentsam_todo_new`
- `agentsam_tool_chain`
- `agentsam_tool_chain_new`
- `agentsam_tools_new`
- `agentsam_usage_events`
- `agentsam_user_feature_override`
- `agentsam_user_policy`
- `agentsam_webhook_events_new`
- `agentsam_workspace`
- `ai_api_test_runs`
- `ai_compiled_context_cache`
- `ai_generation_logs`
- `ai_models`
- `ai_prompts_library`
- `ai_query_history`
- `ai_query_snippets`
- `ai_routing_rules`
- `ai_search_analytics`
- `auth_event_log`
- `auth_sessions`
- `auth_users`
- `change_set_items`
- `change_sets`
- `ci_di_workflow_runs`
- `cicd_runs`
- `cidi_pipeline_runs`
- `cidi_run_results`

### Known Tables That Were Dropped
High risk if code still references these.
- `agentsam_plan_tasks`
- `agentsam_plans`
- `agentsam_scripts`
- `agentsam_todo`

## Destructive Operations Without Rollback Marker
- `migrations/129_ai_models_gemini_2_5_flash_key.sql`
- `migrations/144_user_oauth_tokens_multi_github.sql`
- `migrations/184_system_b_iam_workspace_shell_ledger.sql`
- `migrations/204_project_memory_cidi_three_step_and_plan_steps.sql`
- `migrations/229_unify_agentsam_prompt_registry.sql`
- `migrations/232_agentsam_communication_hooks.sql`
- `migrations/251_agentsam_hook_execution_extend.sql`
- `migrations/263_agentsam_workspace_scoped_rollup_uniques.sql`
- `migrations/265_agentsam_analytics_unique_workspace.sql`
- `migrations/266_analytics_unique_add_workspace.sql`
- `migrations/268_mcp_workflows_strip_hardcoded_defaults.sql`
- `migrations/269_memory_canonical_user_unique.sql`
- `migrations/270_todo_strip_hardcoded_defaults.sql`
- `migrations/271_approval_queue_lock_chain.sql`
- `migrations/272_execution_chain_alignment.sql`
- `migrations/273_hook_alignment.sql`
- `migrations/274_plans_tasks_toolchain_alignment.sql`
- `migrations/275_kanban_strip_defaults_add_workspace.sql`
- `migrations/277_workspace_members_dedup_fk.sql`
- `migrations/279_project_context_strip_defaults.sql`
- `migrations/280_drop_unused_tables.sql`
- `migrations/285_otlp_traces_multitenant.sql`
- `migrations/298_retire_claude_haiku_3_context_cap.sql`
- `migrations/303_secret_audit_log_source_expansion.sql`
- `migrations/307_delete_deprecated_anthropic_ghost_catalog.sql`
- `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql`
- `migrations/336_rebuild_agentsam_capability_index.sql`
- `migrations/339_agent_mode_configs_drop_model_preference.sql`
- `migrations/340_user_storage_access_keys_encrypted.sql`
- `migrations/343_auth_sessions_absorb_sessions.sql`
- `db/seed_core_workflows.sql`
- `migrations/drop_secret_audit_log_fk.sql`
- `sql/agentsam/seed_platform_remaster_plans.sql`
- `migrations/20260329_fix_quality_checks_constraint.sql`

## Destructive Operations Detail
| Migration | Table | Operation |
|-----------|-------|-----------|
| `migrations/144_user_oauth_tokens_multi_github.sql` | `user_oauth_tokens` | DROP TABLE |
| `migrations/229_unify_agentsam_prompt_registry.sql` | `agentsam_prompt` | DROP TABLE |
| `migrations/232_agentsam_communication_hooks.sql` | `agentsam_hook` | DROP TABLE |
| `migrations/251_agentsam_hook_execution_extend.sql` | `agentsam_hook_execution` | DROP TABLE |
| `migrations/263_agentsam_workspace_scoped_rollup_uniques.sql` | `agentsam_tool_stats_compacted__new` | DROP TABLE |
| `migrations/263_agentsam_workspace_scoped_rollup_uniques.sql` | `agentsam_tool_stats_compacted` | DROP TABLE |
| `migrations/263_agentsam_workspace_scoped_rollup_uniques.sql` | `agentsam_webhook_weekly__new` | DROP TABLE |
| `migrations/263_agentsam_workspace_scoped_rollup_uniques.sql` | `agentsam_webhook_weekly` | DROP TABLE |
| `migrations/265_agentsam_analytics_unique_workspace.sql` | `agentsam_analytics__new` | DROP TABLE |
| `migrations/265_agentsam_analytics_unique_workspace.sql` | `agentsam_analytics` | DROP TABLE |
| `migrations/266_analytics_unique_add_workspace.sql` | `agentsam_analytics` | DROP TABLE |
| `migrations/268_mcp_workflows_strip_hardcoded_defaults.sql` | `agentsam_mcp_workflows` | DROP TABLE |
| `migrations/269_memory_canonical_user_unique.sql` | `agentsam_memory` | DROP TABLE |
| `migrations/270_todo_strip_hardcoded_defaults.sql` | `agentsam_todo` | DROP TABLE |
| `migrations/271_approval_queue_lock_chain.sql` | `agentsam_approval_queue` | DROP TABLE |
| `migrations/272_execution_chain_alignment.sql` | `agentsam_escalation` | DROP TABLE |
| `migrations/272_execution_chain_alignment.sql` | `agentsam_execution_context` | DROP TABLE |
| `migrations/272_execution_chain_alignment.sql` | `agentsam_executions` | DROP TABLE |
| `migrations/273_hook_alignment.sql` | `agentsam_hook` | DROP TABLE |
| `migrations/273_hook_alignment.sql` | `agentsam_hook_execution` | DROP TABLE |
| `migrations/274_plans_tasks_toolchain_alignment.sql` | `agentsam_plans` | DROP TABLE |
| `migrations/274_plans_tasks_toolchain_alignment.sql` | `agentsam_plan_tasks` | DROP TABLE |
| `migrations/274_plans_tasks_toolchain_alignment.sql` | `agentsam_tool_chain` | DROP TABLE |
| `migrations/275_kanban_strip_defaults_add_workspace.sql` | `kanban_boards` | DROP TABLE |
| `migrations/275_kanban_strip_defaults_add_workspace.sql` | `kanban_columns` | DROP TABLE |
| `migrations/275_kanban_strip_defaults_add_workspace.sql` | `kanban_tasks` | DROP TABLE |
| `migrations/277_workspace_members_dedup_fk.sql` | `workspace_members` | DROP TABLE |
| `migrations/279_project_context_strip_defaults.sql` | `agentsam_project_context` | DROP TABLE |
| `migrations/280_drop_unused_tables.sql` | `otlp_traces` | DROP TABLE |
| `migrations/280_drop_unused_tables.sql` | `agentsam_shadow_runs` | DROP TABLE |
| `migrations/280_drop_unused_tables.sql` | `agentsam_judge_runs` | DROP TABLE |
| `migrations/280_drop_unused_tables.sql` | `agent_telemetry` | DROP TABLE |
| `migrations/285_otlp_traces_multitenant.sql` | `otlp_traces` | DROP TABLE |
| `migrations/303_secret_audit_log_source_expansion.sql` | `secret_audit_log_old` | DROP TABLE |
| `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | `agentsam_tools` | DROP TABLE |
| `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | `agentsam_scripts` | DROP TABLE |
| `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | `agentsam_script_runs` | DROP TABLE |
| `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | `agentsam_mcp_tool_execution` | DROP TABLE |
| `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | `agentsam_webhook_events` | DROP TABLE |
| `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | `agentsam_mcp_tools` | DROP TABLE |
| `migrations/336_rebuild_agentsam_capability_index.sql` | `agentsam_capability_index` | DROP TABLE |
| `migrations/339_agent_mode_configs_drop_model_preference.sql` | `agent_mode_configs` | DROP COLUMN model_preference |
| `migrations/343_auth_sessions_absorb_sessions.sql` | `sessions` | DROP TABLE |
| `migrations/drop_secret_audit_log_fk.sql` | `secret_audit_log` | DROP TABLE |
| `migrations/20260329_fix_quality_checks_constraint.sql` | `quality_checks` | DROP TABLE |

## Live Table Snapshot
| Table | Created In | Columns Added | Renamed To |
|-------|------------|---------------|------------|
| `activity_signals` | `migrations/145_deployments_tracking_tables.sql` | 0 | `None` |
| `agent_command_audit_log` | `migrations/106_agent_governance_audit_changesets.sql` | 0 | `None` |
| `agent_command_proposals` | `migrations/117_agent_command_proposals_terminal_history.sql` | 0 | `None` |
| `agent_configs` | `migrations/127_agent_configs_default_model.sql` | 1 | `None` |
| `agent_conversations` | `unknown` | 3 | `None` |
| `agent_execution_plans` | `migrations/129_agent_execution_plans_and_queue.sql` | 0 | `None` |
| `agent_intent_patterns` | `migrations/121_mcp_dashboard_tables.sql` | 0 | `None` |
| `agent_messages` | `migrations/112_agent_sessions_messages.sql` | 2 | `None` |
| `agent_mode_configs` | `unknown` | 0 | `None` |
| `agent_request_queue` | `migrations/129_agent_execution_plans_and_queue.sql` | 0 | `None` |
| `agent_sessions` | `migrations/112_agent_sessions_messages.sql` | 2 | `None` |
| `agent_workspace_state` | `migrations/116_browser_rendering_and_agent_tools.sql` | 0 | `None` |
| `agentsam_agent_run` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_ai` | `unknown` | 6 | `None` |
| `agentsam_analytics_new` | `migrations/266_analytics_unique_add_workspace.sql` | 0 | `agentsam_analytics` |
| `agentsam_approval_queue_new` | `migrations/271_approval_queue_lock_chain.sql` | 0 | `agentsam_approval_queue` |
| `agentsam_browser_trusted_origin` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_capability_aliases` | `migrations/334_agentsam_capability_aliases.sql` | 0 | `None` |
| `agentsam_code_index_job` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_command_allowlist` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_command_run` | `unknown` | 1 | `None` |
| `agentsam_cron_runs` | `migrations/261_agentsam_cron_runs.sql` | 0 | `None` |
| `agentsam_escalation_new` | `migrations/272_execution_chain_alignment.sql` | 0 | `agentsam_escalation` |
| `agentsam_execution_context_new` | `migrations/272_execution_chain_alignment.sql` | 0 | `agentsam_execution_context` |
| `agentsam_execution_steps` | `unknown` | 1 | `None` |
| `agentsam_executions_new` | `migrations/272_execution_chain_alignment.sql` | 0 | `agentsam_executions` |
| `agentsam_feature_flag` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_fetch_domain_allowlist` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_guardrail_events` | `migrations/294_agentsam_guardrails.sql` | 0 | `None` |
| `agentsam_guardrail_rulesets` | `migrations/294_agentsam_guardrails.sql` | 0 | `None` |
| `agentsam_guardrails` | `migrations/294_agentsam_guardrails.sql` | 0 | `None` |
| `agentsam_hook_execution__new` | `migrations/251_agentsam_hook_execution_extend.sql` | 0 | `agentsam_hook_execution` |
| `agentsam_hook_execution_new` | `migrations/273_hook_alignment.sql` | 0 | `agentsam_hook_execution` |
| `agentsam_hook_new` | `migrations/232_agentsam_communication_hooks.sql` | 0 | `agentsam_hook` |
| `agentsam_ignore_pattern` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_mcp_allowlist` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_mcp_tool_execution_new` | `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | 0 | `agentsam_mcp_tool_execution` |
| `agentsam_mcp_tools_new` | `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | 0 | `agentsam_mcp_tools` |
| `agentsam_mcp_workflows` | `db/schema_agentsam_mcp_workflows.sql` | 0 | `None` |
| `agentsam_mcp_workflows_new` | `migrations/268_mcp_workflows_strip_hardcoded_defaults.sql` | 0 | `agentsam_mcp_workflows` |
| `agentsam_memory_new` | `migrations/269_memory_canonical_user_unique.sql` | 0 | `agentsam_memory` |
| `agentsam_model_catalog` | `migrations/291_agentsam_routing_engine_tables.sql` | 1 | `None` |
| `agentsam_model_routing_memory` | `migrations/291_agentsam_routing_engine_tables.sql` | 0 | `None` |
| `agentsam_plan_tasks_new` | `migrations/274_plans_tasks_toolchain_alignment.sql` | 0 | `agentsam_plan_tasks` |
| `agentsam_plans_new` | `migrations/274_plans_tasks_toolchain_alignment.sql` | 0 | `agentsam_plans` |
| `agentsam_plans_old` | `migrations/d1/20260512120000_agentsam_plans_old_fk_shim.sql` | 0 | `None` |
| `agentsam_project_context_new` | `migrations/279_project_context_strip_defaults.sql` | 0 | `agentsam_project_context` |
| `agentsam_route_requirements` | `migrations/291_agentsam_routing_engine_tables.sql` | 13 | `None` |
| `agentsam_rules_document` | `migrations/163_agentsam_cursor_parity.sql` | 2 | `None` |
| `agentsam_rules_revision` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_script_runs_new` | `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | 0 | `agentsam_script_runs` |
| `agentsam_scripts_new` | `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | 0 | `agentsam_scripts` |
| `agentsam_skill` | `migrations/164_agentsam_skill.sql` | 9 | `None` |
| `agentsam_skill_invocation` | `migrations/177_agentsam_skill_parity.sql` | 0 | `None` |
| `agentsam_skill_revision` | `migrations/177_agentsam_skill_parity.sql` | 0 | `None` |
| `agentsam_subagent_profile` | `migrations/163_agentsam_cursor_parity.sql` | 1 | `None` |
| `agentsam_todo_new` | `migrations/270_todo_strip_hardcoded_defaults.sql` | 0 | `agentsam_todo` |
| `agentsam_tool_call_log` | `unknown` | 5 | `None` |
| `agentsam_tool_chain` | `migrations/d1/20260501120000_migrate_tool_chain_to_agentsam.sql` | 2 | `None` |
| `agentsam_tool_chain_new` | `migrations/274_plans_tasks_toolchain_alignment.sql` | 0 | `agentsam_tool_chain` |
| `agentsam_tools_new` | `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | 0 | `agentsam_tools` |
| `agentsam_usage_events` | `unknown` | 4 | `None` |
| `agentsam_user_feature_override` | `migrations/163_agentsam_cursor_parity.sql` | 0 | `None` |
| `agentsam_user_policy` | `migrations/163_agentsam_cursor_parity.sql` | 4 | `None` |
| `agentsam_webhook_events_new` | `migrations/325_agentsam_strip_iam_hardcoded_defaults.sql` | 0 | `agentsam_webhook_events` |
| `agentsam_workflow_runs` | `unknown` | 7 | `None` |
| `agentsam_workflows` | `migrations/286_agentsam_workflow_cms_theme_pipeline.sql` | 0 | `None` |
| `agentsam_workspace` | `migrations/244_create_agentsam_workspace_table.sql` | 3 | `None` |
| `ai_api_test_runs` | `unknown` | 2 | `None` |
| `ai_compiled_context_cache` | `migrations/119_ai_compiled_context_cache.sql` | 0 | `None` |
| `ai_generation_logs` | `unknown` | 11 | `None` |
| `ai_models` | `unknown` | 4 | `None` |
| `ai_prompts_library` | `unknown` | 4 | `None` |
| `ai_query_history` | `migrations/225_database_explorer_unified_search.sql` | 2 | `None` |
| `ai_query_snippets` | `migrations/225_database_explorer_unified_search.sql` | 3 | `None` |
| `ai_routing_rules` | `migrations/165_agentsam_hook_ai_routing.sql` | 0 | `None` |
| `ai_search_analytics` | `migrations/225_database_explorer_unified_search.sql` | 4 | `None` |
| `auth_event_log` | `migrations/254_auth_events_and_integration_normalization.sql` | 0 | `None` |
| `auth_sessions` | `unknown` | 11 | `None` |
| `auth_users` | `unknown` | 9 | `None` |
| `change_set_items` | `migrations/106_agent_governance_audit_changesets.sql` | 0 | `None` |
| `change_sets` | `migrations/106_agent_governance_audit_changesets.sql` | 0 | `None` |
| `ci_di_workflow_runs` | `migrations/140_ci_di_workflow_runs.sql` | 0 | `None` |
| `cicd_runs` | `unknown` | 15 | `None` |
| `cidi_pipeline_runs` | `migrations/175_cidi_pipeline.sql` | 0 | `None` |
| `cidi_run_results` | `migrations/175_cidi_pipeline.sql` | 0 | `None` |
| `cloudflare_deployments` | `migrations/113_cloudflare_deployments_and_checkpoints.sql` | 3 | `None` |
| `cms_tenants` | `unknown` | 1 | `None` |
| `cms_theme_preferences` | `migrations/256_cms_theme_preferences.sql` | 0 | `None` |
| `deployment_changes` | `migrations/145_deployments_tracking_tables.sql` | 0 | `None` |
| `deployments` | `migrations/145_deployments_tracking_tables.sql` | 3 | `None` |
| `deployments_weekly_rollup` | `migrations/245_deployments_weekly_rollup.sql` | 0 | `None` |
| `designstudio_design_blueprints` | `migrations/247_designstudio_design_blueprints.sql` | 0 | `None` |
| `email_verification_tokens` | `migrations/add_auth_verification.sql` | 0 | `None` |
| `governance_capabilities` | `migrations/106_agent_governance_audit_changesets.sql` | 0 | `None` |
| `governance_roles` | `migrations/106_agent_governance_audit_changesets.sql` | 0 | `None` |
| `iam_user_onboarding_step` | `migrations/236_user_intake_profiles.sql` | 0 | `None` |
| `image_generation_jobs` | `unknown` | 2 | `None` |
| `image_generation_variants` | `unknown` | 2 | `None` |
| `image_metadata` | `unknown` | 2 | `None` |
| `images` | `unknown` | 1 | `None` |
| `integration_audit_log` | `migrations/254_auth_events_and_integration_normalization.sql` | 0 | `None` |
| `integration_catalog` | `migrations/249_integration_catalog.sql` | 0 | `None` |
| `integration_connections` | `migrations/254_auth_events_and_integration_normalization.sql` | 0 | `None` |
| `integration_events` | `migrations/240_integrations_full_buildout.sql` | 0 | `None` |
| `integration_health_checks` | `migrations/240_integrations_full_buildout.sql` | 0 | `None` |
| `integration_registry` | `migrations/240_integrations_full_buildout.sql` | 0 | `None` |
| `integration_resources` | `migrations/254_auth_events_and_integration_normalization.sql` | 0 | `None` |
| `kanban_boards_new` | `migrations/275_kanban_strip_defaults_add_workspace.sql` | 0 | `kanban_boards` |
| `kanban_columns_new` | `migrations/275_kanban_strip_defaults_add_workspace.sql` | 0 | `kanban_columns` |
| `kanban_tasks_new` | `migrations/275_kanban_strip_defaults_add_workspace.sql` | 0 | `kanban_tasks` |
| `keyboard_shortcuts` | `migrations/168_keyboard_shortcuts.sql` | 0 | `None` |
| `mcp_agent_sessions` | `migrations/121_mcp_dashboard_tables.sql` | 7 | `None` |
| `mcp_command_suggestions` | `migrations/121_mcp_dashboard_tables.sql` | 0 | `None` |
| `mcp_entitlements` | `migrations/241_mcp_entitlements.sql` | 0 | `None` |
| `mcp_services` | `unknown` | 4 | `None` |
| `mcp_tool_calls` | `migrations/137_mcp_tool_calls_table.sql` | 2 | `None` |
| `mcp_usage_log` | `migrations/134_mcp_usage_log.sql` | 2 | `None` |
| `mcp_workflow_runs` | `migrations/159_mcp_workflows_tables.sql` | 0 | `None` |
| `mcp_workflows` | `migrations/159_mcp_workflows.sql` | 0 | `None` |
| `mcp_workspace_tokens` | `migrations/330_mcp_workspace_tokens_security_hardening.sql` | 7 | `None` |
| `media_assets` | `migrations/341_moviemode_media_backend.sql` | 0 | `None` |
| `media_scenes` | `migrations/341_moviemode_media_backend.sql` | 0 | `None` |
| `moviemode_edit_sessions` | `migrations/342_moviemode_edit_sessions.sql` | 0 | `None` |
| `moviemode_exports` | `migrations/341_moviemode_media_backend.sql` | 0 | `None` |
| `moviemode_projects` | `migrations/341_moviemode_media_backend.sql` | 0 | `None` |
| `moviemode_render_jobs` | `migrations/341_moviemode_media_backend.sql` | 0 | `None` |
| `moviemode_timelines` | `migrations/341_moviemode_media_backend.sql` | 0 | `None` |
| `oauth_state_nonces` | `migrations/254_auth_events_and_integration_normalization.sql` | 0 | `None` |
| `playwright_jobs` | `migrations/116_browser_rendering_and_agent_tools.sql` | 1 | `None` |
| `project_files` | `migrations/227_database_explorer_template_alignment.sql` | 0 | `None` |
| `quality_checks_new` | `migrations/20260329_fix_quality_checks_constraint.sql` | 0 | `quality_checks` |
| `quality_results` | `unknown` | 2 | `None` |
| `quality_runs` | `unknown` | 4 | `None` |
| `r2_bucket_summary` | `unknown` | 4 | `None` |
| `r2_deploy_manifest_objects` | `migrations/282_r2_deploy_inventory_manifest.sql` | 0 | `None` |
| `r2_deploy_manifests` | `migrations/282_r2_deploy_inventory_manifest.sql` | 0 | `None` |
| `r2_object_inventory` | `unknown` | 16 | `None` |
| `rag_query_log` | `unknown` | 6 | `None` |
| `role_capabilities` | `migrations/106_agent_governance_audit_changesets.sql` | 0 | `None` |
| `secret_audit_log__new` | `migrations/drop_secret_audit_log_fk.sql` | 0 | `secret_audit_log` |
| `spend_ledger` | `unknown` | 1 | `None` |
| `sprint_snapshots` | `migrations/175_sprint_snapshots.sql` | 0 | `None` |
| `storage_policies` | `migrations/234_storage_policies.sql` | 0 | `None` |
| `tenants` | `unknown` | 5 | `None` |
| `terminal_history` | `migrations/117_agent_command_proposals_terminal_history.sql` | 3 | `None` |
| `terminal_sessions` | `migrations/124_terminal_sessions.sql` | 0 | `None` |
| `ui_loading_states` | `migrations/179_ui_loading_states.sql` | 0 | `None` |
| `user_api_keys` | `migrations/240_integrations_full_buildout.sql` | 0 | `None` |
| `user_backup_codes` | `migrations/142_user_backup_codes.sql` | 0 | `None` |
| `user_governance_roles` | `migrations/106_agent_governance_audit_changesets.sql` | 0 | `None` |
| `user_intake_profiles` | `migrations/236_user_intake_profiles.sql` | 0 | `None` |
| `user_oauth_tokens_new` | `migrations/144_user_oauth_tokens_multi_github.sql` | 0 | `user_oauth_tokens` |
| `user_settings` | `unknown` | 1 | `None` |
| `user_storage_access_keys` | `migrations/233_storage_preferences_and_keys.sql` | 2 | `None` |
| `user_storage_preferences` | `migrations/233_storage_preferences_and_keys.sql` | 0 | `None` |
| `user_storage_provider_preferences` | `migrations/289_storage_provider_prefs_general_ui.sql` | 0 | `None` |
| `user_workspace_settings` | `migrations/141_user_workspace_settings.sql` | 2 | `None` |
| `work_sessions` | `migrations/145_deployments_tracking_tables.sql` | 0 | `None` |
| `worker_analytics_errors` | `migrations/167_worker_analytics_errors.sql` | 0 | `None` |
| `workflow_checkpoints` | `migrations/113_cloudflare_deployments_and_checkpoints.sql` | 0 | `None` |
| `workspace_members_new` | `migrations/277_workspace_members_dedup_fk.sql` | 0 | `workspace_members` |

---
*Generated by `scripts/audit_migration_chain.py` at 2026-05-19T13:09:37.508098+00:00*