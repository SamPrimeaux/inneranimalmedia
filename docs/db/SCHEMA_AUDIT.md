# agentsam_* Schema Reference
> `scripts/d1_schema_audit.py` — 2026-05-07 04:43 UTC

**70 tables** audited.

### `agentsam_agent_run`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `conversation_id` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'queued'` |
| `trigger` | `TEXT` |  |  | `` |
| `model_id` | `TEXT` |  |  | `` |
| `idempotency_key` | `TEXT` |  |  | `` |
| `error_message` | `TEXT` |  |  | `` |
| `input_tokens` | `INTEGER` |  |  | `` |
| `output_tokens` | `INTEGER` |  |  | `` |
| `cost_usd` | `REAL` |  |  | `` |
| `started_at` | `TEXT` |  |  | `` |
| `completed_at` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `agent_ai_id` | `TEXT` |  |  | `NULL` |
| `person_uuid` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `ai_model_ref` | `TEXT` |  |  | `` |
| `routing_arm_id` | `TEXT` |  |  | `` |
| `chain_root_id` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `work_session_id` | `TEXT` |  |  | `` |
| `timed_out` | `INTEGER` |  |  | `0` |
| `sla_breach` | `INTEGER` |  |  | `0` |
| `timeout_ms` | `INTEGER` |  |  | `30000` |
| `command_id` | `TEXT` |  |  | `` |

**Indexes:** `idx_agent_run_timed_out`, `idx_agent_run_tenant_workspace`, `idx_agentsam_run_idempotency`, `idx_agentsam_run_conversation`, `idx_agentsam_run_user_created`

### `agentsam_ai`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `is_global` | `INTEGER` |  | ✓ | `1` |
| `name` | `TEXT` |  | ✓ | `` |
| `role_name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'active'` |
| `mode` | `TEXT` |  | ✓ | `'orchestrator'` |
| `safety_level` | `TEXT` |  | ✓ | `'strict'` |
| `tenant_scope` | `TEXT` |  | ✓ | `'multi_tenant'` |
| `allowed_tenants_json` | `TEXT` |  |  | `'[]'` |
| `blocked_tenants_json` | `TEXT` |  |  | `'[]'` |
| `auth_strategy` | `TEXT` |  |  | `'zero_trust_plus_oauth'` |
| `required_roles_json` | `TEXT` |  |  | `'["super_admin"]'` |
| `requires_human_approval` | `INTEGER` |  | ✓ | `1` |
| `approvals_policy_json` | `TEXT` |  |  | `'{}'` |
| `integrations_json` | `TEXT` |  |  | `'{}'` |
| `mcp_services_json` | `TEXT` |  |  | `'[]'` |
| `tool_permissions_json` | `TEXT` |  |  | `'{}'` |
| `rate_limits_json` | `TEXT` |  |  | `'{}'` |
| `budgets_json` | `TEXT` |  |  | `'{}'` |
| `model_policy_json` | `TEXT` |  |  | `'{}'` |
| `cost_policy_json` | `TEXT` |  |  | `'{}'` |
| `pii_policy_json` | `TEXT` |  |  | `'{}'` |
| `security_policy_json` | `TEXT` |  |  | `'{}'` |
| `findings_policy_json` | `TEXT` |  |  | `'{}'` |
| `notification_policy_json` | `TEXT` |  |  | `'{}'` |
| `telemetry_enabled` | `INTEGER` |  | ✓ | `1` |
| `telemetry_policy_json` | `TEXT` |  |  | `'{}'` |
| `last_health_check` | `INTEGER` |  |  | `` |
| `last_run_at` | `INTEGER` |  |  | `` |
| `last_error` | `TEXT` |  |  | `` |
| `config_version` | `INTEGER` |  | ✓ | `1` |
| `config_hash` | `TEXT` |  |  | `` |
| `notes` | `TEXT` |  |  | `` |
| `user_email` | `TEXT` |  |  | `` |
| `additional_alert_emails_json` | `TEXT` |  |  | `'[]'` |
| `owner_user_id` | `TEXT` |  |  | `` |
| `backup_user_email` | `TEXT` |  |  | `` |
| `alert_escalation_email` | `TEXT` |  |  | `` |
| `memory_policy_json` | `TEXT` |  |  | `'{}'` |
| `total_runs` | `INTEGER` |  |  | `0` |
| `total_cost_usd` | `REAL` |  |  | `0.0` |
| `avg_response_ms` | `INTEGER` |  |  | `0` |
| `success_rate` | `REAL` |  |  | `0.0` |
| `created_by` | `TEXT` |  | ✓ | `'sam_primeaux'` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `system_prompt` | `TEXT` |  |  | `` |
| `tool_invocation_style` | `TEXT` |  |  | `'balanced'` |
| `icon` | `TEXT` |  | ✓ | `''` |
| `access_mode` | `TEXT` |  | ✓ | `'read_write'` |
| `sort_order` | `INTEGER` |  | ✓ | `0` |
| `context_max_tokens` | `INTEGER` |  |  | `1000000` |
| `output_max_tokens` | `INTEGER` |  |  | `64000` |
| `thinking_mode` | `TEXT` |  |  | `'adaptive'` |
| `effort` | `TEXT` |  |  | `'medium'` |
| `person_uuid` | `TEXT` |  |  | `` |
| `provider` | `TEXT` |  |  | `` |
| `model_key` | `TEXT` |  |  | `` |
| `api_platform` | `TEXT` |  |  | `'unknown'` |
| `secret_key_name` | `TEXT` |  |  | `` |
| `size_class` | `TEXT` |  |  | `'medium'` |
| `billing_unit` | `TEXT` |  |  | `'tokens'` |
| `supports_cache` | `INTEGER` |  |  | `0` |
| `supports_tools` | `INTEGER` |  |  | `1` |
| `supports_vision` | `INTEGER` |  |  | `0` |
| `supports_web_search` | `INTEGER` |  |  | `0` |
| `supports_fast_mode` | `INTEGER` |  |  | `0` |
| `context_default_tokens` | `INTEGER` |  |  | `0` |
| `pricing_unit` | `TEXT` |  |  | `'usd_per_mtok'` |
| `pricing_source` | `TEXT` |  |  | `'manual'` |
| `input_rate_per_mtok` | `REAL` |  |  | `` |
| `output_rate_per_mtok` | `REAL` |  |  | `` |
| `cache_write_rate_per_mtok` | `REAL` |  |  | `` |
| `cache_read_rate_per_mtok` | `REAL` |  |  | `` |
| `web_search_per_1k_usd` | `REAL` |  |  | `0` |
| `neurons_usd_per_1k` | `REAL` |  |  | `0` |
| `cost_per_unit` | `REAL` |  |  | `` |
| `rpm_limit` | `INTEGER` |  |  | `0` |
| `itpm_limit` | `INTEGER` |  |  | `0` |
| `otpm_limit` | `INTEGER` |  |  | `0` |
| `show_in_picker` | `INTEGER` |  |  | `0` |
| `picker_eligible` | `INTEGER` |  |  | `1` |
| `picker_group` | `TEXT` |  |  | `` |
| `features_json` | `TEXT` |  |  | `'{}'` |
| `input_schema_json` | `TEXT` |  |  | `` |
| `supports_responses_api` | `INTEGER` |  |  | `0` |
| `supports_parallel_tools` | `INTEGER` |  |  | `1` |
| `supports_structured_output` | `INTEGER` |  |  | `0` |
| `supports_prompt_cache` | `INTEGER` |  |  | `0` |
| `supports_thinking` | `INTEGER` |  |  | `0` |
| `requires_phase_param` | `INTEGER` |  |  | `0` |
| `max_tool_calls_per_turn` | `INTEGER` |  |  | `10` |

**Indexes:** `uix_agentsam_ai_provider_model_key`

### `agentsam_analytics`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'aan_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `period` | `TEXT` |  | ✓ | `` |
| `period_date` | `TEXT` |  |  | `` |
| `top_tool` | `TEXT` |  |  | `` |
| `top_tool_calls` | `INTEGER` |  |  | `0` |
| `most_failed_tool` | `TEXT` |  |  | `` |
| `most_failed_tool_failure_rate` | `REAL` |  |  | `0` |
| `total_tool_calls` | `INTEGER` |  |  | `0` |
| `total_tool_successes` | `INTEGER` |  |  | `0` |
| `total_tool_failures` | `INTEGER` |  |  | `0` |
| `overall_tool_success_rate` | `REAL` |  |  | `0` |
| `top_model` | `TEXT` |  |  | `` |
| `top_model_sessions` | `INTEGER` |  |  | `0` |
| `top_provider` | `TEXT` |  |  | `` |
| `total_sessions` | `INTEGER` |  |  | `0` |
| `total_input_tokens` | `INTEGER` |  |  | `0` |
| `total_output_tokens` | `INTEGER` |  |  | `0` |
| `total_cache_tokens` | `INTEGER` |  |  | `0` |
| `total_cost_usd` | `REAL` |  |  | `0` |
| `avg_cost_per_session` | `REAL` |  |  | `0` |
| `avg_tokens_per_session` | `REAL` |  |  | `0` |
| `cache_hit_rate` | `REAL` |  |  | `0` |
| `cache_savings_usd` | `REAL` |  |  | `0` |
| `tool_reliability_json` | `TEXT` |  |  | `'{}'` |
| `model_breakdown_json` | `TEXT` |  |  | `'{}'` |
| `broken_tools_json` | `TEXT` |  |  | `'[]'` |
| `healthy_tools_json` | `TEXT` |  |  | `'[]'` |
| `most_common_intent` | `TEXT` |  |  | `` |
| `avg_session_length_turns` | `REAL` |  |  | `0` |
| `computed_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `data_from` | `INTEGER` |  |  | `` |
| `data_to` | `INTEGER` |  |  | `` |
| `row_count_source` | `INTEGER` |  |  | `0` |
| `notes` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `sla_breaches` | `INTEGER` |  |  | `0` |
| `timed_out_calls` | `INTEGER` |  |  | `0` |
| `time_tracked_seconds` | `INTEGER` |  |  | `0` |

**Indexes:** `idx_analytics_workspace`, `idx_aan_tenant_period`, `idx_aan_period_date`, `idx_aan_computed`

### `agentsam_approval_queue`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'appr_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `session_id` | `TEXT` |  |  | `` |
| `plan_id` | `TEXT` |  |  | `` |
| `todo_id` | `TEXT` |  |  | `` |
| `workflow_run_id` | `TEXT` |  |  | `` |
| `command_run_id` | `TEXT` |  |  | `` |
| `tool_name` | `TEXT` |  | ✓ | `` |
| `tool_id` | `TEXT` |  |  | `` |
| `tool_key` | `TEXT` |  |  | `` |
| `action_summary` | `TEXT` |  | ✓ | `` |
| `input_json` | `TEXT` |  |  | `'{}'` |
| `risk_level` | `TEXT` |  |  | `'medium'` |
| `approval_type` | `TEXT` |  |  | `'tool'` |
| `status` | `TEXT` |  |  | `'pending'` |
| `approved_by` | `TEXT` |  |  | `` |
| `decided_at` | `INTEGER` |  |  | `` |
| `expires_at` | `INTEGER` |  |  | `unixepoch() + 300` |
| `person_uuid` | `TEXT` |  |  | `` |
| `created_at` | `INTEGER` |  |  | `unixepoch()` |

**Indexes:** `idx_appr_user_status`, `idx_appr_tenant_status`, `idx_appr_command_run`, `idx_appr_workflow`, `idx_appr_plan`, `idx_appr_todo`, `idx_appr_status`

### `agentsam_artifacts`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'art_' || lower(hex(randomblob(8)))` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `artifact_type` | `TEXT` |  | ✓ | `'html'` |
| `r2_key` | `TEXT` |  | ✓ | `` |
| `public_url` | `TEXT` |  |  | `` |
| `source` | `TEXT` |  | ✓ | `` |
| `tags` | `TEXT` |  |  | `'[]'` |
| `is_public` | `INTEGER` |  |  | `0` |
| `file_size_bytes` | `INTEGER` |  |  | `` |
| `created_at` | `INTEGER` |  |  | `unixepoch()` |
| `updated_at` | `INTEGER` |  |  | `unixepoch()` |

### `agentsam_bootstrap`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `brand_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `email` | `TEXT` |  |  | `` |
| `role_slug` | `TEXT` |  |  | `` |
| `display_name` | `TEXT` |  |  | `` |
| `workspace_slug` | `TEXT` |  |  | `` |
| `workspace_name` | `TEXT` |  |  | `` |
| `environment` | `TEXT` |  | ✓ | `'production'` |
| `deploy_env` | `TEXT` |  |  | `` |
| `bootstrap_version` | `TEXT` |  |  | `'1.0.0'` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `capabilities_json` | `TEXT` |  | ✓ | `'{}'` |
| `governance_roles_json` | `TEXT` |  | ✓ | `'[]'` |
| `approval_required_json` | `TEXT` |  | ✓ | `'[]'` |
| `allowed_execution_modes_json` | `TEXT` |  | ✓ | `'["pty"]'` |
| `default_execution_mode` | `TEXT` |  | ✓ | `'pty'` |
| `runtime_status_json` | `TEXT` |  | ✓ | `'{}'` |
| `backend_health_json` | `TEXT` |  | ✓ | `'{}'` |
| `feature_flags_json` | `TEXT` |  | ✓ | `'{}'` |
| `ui_preferences_json` | `TEXT` |  | ✓ | `'{}'` |
| `theme_slug` | `TEXT` |  |  | `` |
| `agent_session_id` | `TEXT` |  |  | `` |
| `terminal_session_id` | `TEXT` |  |  | `` |
| `resume_token` | `TEXT` |  |  | `` |
| `resume_expires_at` | `TEXT` |  |  | `` |
| `api_base_url` | `TEXT` |  |  | `'/api'` |
| `terminal_ws_path` | `TEXT` |  |  | `` |
| `agent_api_path` | `TEXT` |  |  | `` |
| `mcp_api_path` | `TEXT` |  |  | `` |
| `cloud_api_path` | `TEXT` |  |  | `` |
| `source_of_truth` | `TEXT` |  |  | `'worker'` |
| `last_bootstrapped_at` | `TEXT` |  |  | `` |
| `last_validated_at` | `TEXT` |  |  | `` |
| `expires_at` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| `updated_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| `person_uuid` | `TEXT` |  |  | `` |
| `repo_json` | `TEXT` |  | ✓ | `'{}'` |
| `scripts_json` | `TEXT` |  | ✓ | `'[]'` |

**Indexes:** `idx_asb_workspace_env`, `idx_asb_workspace_user`, `idx_asb_is_active`, `idx_asb_session_id`, `idx_asb_user_id`, `idx_asb_tenant_id`, `idx_asb_workspace_id`

### `agentsam_browser_trusted_origin`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `user_id` | `TEXT` | ✓ | ✓ | `` |
| `origin` | `TEXT` | ✓ | ✓ | `` |
| `cert_fingerprint_sha256` | `TEXT` |  |  | `` |
| `trust_scope` | `TEXT` |  | ✓ | `'persistent'` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |

### `agentsam_cad_jobs`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `engine` | `TEXT` |  | ✓ | `` |
| `prompt` | `TEXT` |  |  | `` |
| `mode` | `TEXT` |  |  | `'text'` |
| `status` | `TEXT` |  |  | `'pending'` |
| `external_task_id` | `TEXT` |  |  | `` |
| `result_url` | `TEXT` |  |  | `` |
| `r2_key` | `TEXT` |  |  | `` |
| `error` | `TEXT` |  |  | `` |
| `created_at` | `INTEGER` |  |  | `unixepoch()` |
| `updated_at` | `INTEGER` |  |  | `unixepoch()` |

### `agentsam_code_index_job`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `status` | `TEXT` |  | ✓ | `'idle'` |
| `progress_percent` | `INTEGER` |  |  | `0` |
| `source_type` | `TEXT` |  |  | `'r2'` |
| `source_path` | `TEXT` |  |  | `` |
| `vector_backend` | `TEXT` |  |  | `'supabase_pgvector'` |
| `file_manifest` | `TEXT` |  |  | `'[]'` |
| `symbol_summary` | `TEXT` |  |  | `'{}'` |
| `dependency_summary` | `TEXT` |  |  | `'{}'` |
| `languages` | `TEXT` |  |  | `'{}'` |
| `file_count` | `INTEGER` |  |  | `0` |
| `indexed_file_count` | `INTEGER` |  |  | `0` |
| `failed_file_count` | `INTEGER` |  |  | `0` |
| `total_size_bytes` | `INTEGER` |  |  | `0` |
| `chunk_count` | `INTEGER` |  |  | `0` |
| `symbol_count` | `INTEGER` |  |  | `0` |
| `triggered_by` | `TEXT` |  |  | `'manual'` |
| `started_at` | `TEXT` |  |  | `` |
| `completed_at` | `TEXT` |  |  | `` |
| `last_sync_at` | `TEXT` |  |  | `` |
| `last_error` | `TEXT` |  |  | `` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |

### `agentsam_command_allowlist`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `''` |
| `command` | `TEXT` |  | ✓ | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |

**Indexes:** `idx_agentsam_cmd_allow_user`

### `agentsam_command_pattern`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'pat_' || lower(hex(randomblob(8)))` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `pattern` | `TEXT` |  | ✓ | `` |
| `pattern_type` | `TEXT` |  | ✓ | `'exact'` |
| `mapped_command` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `category` | `TEXT` |  |  | `'misc'` |
| `risk_level` | `TEXT` |  | ✓ | `'low'` |
| `requires_confirmation` | `INTEGER` |  | ✓ | `0` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `use_count` | `INTEGER` |  | ✓ | `0` |
| `last_used_at` | `INTEGER` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |

**Indexes:** `idx_agentsam_cmd_pattern_workspace`

### `agentsam_command_run`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'run_' || lower(hex(randomblob(8)))` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `session_id` | `TEXT` |  |  | `` |
| `conversation_id` | `TEXT` |  |  | `` |
| `user_input` | `TEXT` |  | ✓ | `` |
| `normalized_intent` | `TEXT` |  |  | `` |
| `intent_category` | `TEXT` |  |  | `` |
| `tier_used` | `INTEGER` |  | ✓ | `0` |
| `model_id` | `TEXT` |  |  | `` |
| `commands_json` | `TEXT` |  | ✓ | `'[]'` |
| `result_json` | `TEXT` |  | ✓ | `'{}'` |
| `output_text` | `TEXT` |  |  | `` |
| `confidence_score` | `REAL` |  |  | `` |
| `success` | `INTEGER` |  | ✓ | `0` |
| `exit_code` | `INTEGER` |  |  | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `input_tokens` | `INTEGER` |  |  | `0` |
| `output_tokens` | `INTEGER` |  |  | `0` |
| `cost_usd` | `REAL` |  |  | `0` |
| `error_message` | `TEXT` |  |  | `` |
| `escalated_from_run_id` | `TEXT` |  |  | `` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `selected_command_id` | `TEXT` |  |  | `` |
| `selected_command_slug` | `TEXT` |  |  | `` |
| `risk_level` | `TEXT` |  |  | `` |
| `requires_confirmation` | `INTEGER` |  |  | `0` |
| `approval_status` | `TEXT` |  |  | `'not_required'` |

**Indexes:** `idx_agentsam_command_run_selected_command`, `idx_agentsam_command_run_created`, `idx_agentsam_command_run_workspace`

### `agentsam_commands`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `workspace_id` | `TEXT` |  | ✓ | `'ws_inneranimalmedia'` |
| `slug` | `TEXT` |  |  | `` |
| `display_name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `pattern` | `TEXT` |  |  | `` |
| `pattern_type` | `TEXT` |  |  | `'exact'` |
| `mapped_command` | `TEXT` |  | ✓ | `` |
| `command_args` | `TEXT` |  |  | `` |
| `category` | `TEXT` |  |  | `'misc'` |
| `subcategory` | `TEXT` |  |  | `` |
| `risk_level` | `TEXT` |  |  | `'low'` |
| `requires_confirmation` | `INTEGER` |  |  | `0` |
| `show_in_slash` | `INTEGER` |  |  | `1` |
| `show_in_allowlist` | `INTEGER` |  |  | `1` |
| `show_in_palette` | `INTEGER` |  |  | `1` |
| `modes_json` | `TEXT` |  |  | `'["agent","auto","debug"]'` |
| `sort_order` | `INTEGER` |  |  | `50` |
| `use_count` | `INTEGER` |  |  | `0` |
| `last_used_at` | `TEXT` |  |  | `` |
| `is_active` | `INTEGER` |  |  | `1` |
| `created_at` | `TEXT` |  |  | `datetime('now')` |
| `updated_at` | `TEXT` |  |  | `datetime('now')` |
| `internal_seo` | `TEXT` |  |  | `''` |
| `task_type` | `TEXT` |  |  | `'tool_use'` |
| `timeout_seconds` | `INTEGER` |  |  | `120` |
| `estimated_cost_usd` | `REAL` |  |  | `0.0` |
| `allowed_models_json` | `TEXT` |  |  | `'[]'` |
| `output_schema` | `TEXT` |  |  | `'{}'` |
| `retry_policy` | `TEXT` |  |  | `'once'` |
| `requires_approval` | `INTEGER` |  |  | `0` |
| `tenant_id` | `TEXT` |  |  | `'tenant_sam_primeaux'` |
| `success_count` | `INTEGER` |  |  | `0` |
| `failure_count` | `INTEGER` |  |  | `0` |
| `avg_duration_ms` | `REAL` |  |  | `0` |
| `router_type` | `TEXT` |  |  | `'tool'` |
| `tool_key` | `TEXT` |  |  | `` |
| `workflow_key` | `TEXT` |  |  | `` |
| `subagent_slug` | `TEXT` |  |  | `` |
| `server_key` | `TEXT` |  |  | `` |
| `execution_mode` | `TEXT` |  |  | `'agent'` |

**Indexes:** `idx_agentsam_commands_slug`, `idx_agentsam_commands_active`, `idx_agentsam_commands_category`

### `agentsam_compaction_events`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'cmp_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `session_id` | `TEXT` |  |  | `` |
| `provider` | `TEXT` |  | ✓ | `` |
| `model_key` | `TEXT` |  | ✓ | `` |
| `tokens_before` | `INTEGER` |  | ✓ | `` |
| `tokens_after` | `INTEGER` |  | ✓ | `` |
| `cost_saved_usd` | `REAL` |  |  | `0` |
| `compaction_strategy` | `TEXT` |  |  | `'summarize'` |
| `summary_text` | `TEXT` |  |  | `` |
| `compacted_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `agent_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `person_uuid` | `TEXT` |  |  | `` |
| `metadata_json` | `TEXT` |  |  | `'{}'` |

**Indexes:** `idx_agentsam_compaction_events_scope`

### `agentsam_cron_runs`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'acr_' || lower(hex(randomblob(8)))` |
| `job_name` | `TEXT` |  | ✓ | `` |
| `cron_expression` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'running'` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `started_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `completed_at` | `INTEGER` |  |  | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `rows_read` | `INTEGER` |  |  | `0` |
| `rows_written` | `INTEGER` |  |  | `0` |
| `error_message` | `TEXT` |  |  | `` |
| `metadata_json` | `TEXT` |  |  | `'{}'` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |

**Indexes:** `idx_agentsam_cron_runs_stuck`, `idx_agentsam_cron_runs_status_started`, `idx_agentsam_cron_runs_scope_started`, `idx_agentsam_cron_runs_job_started`

### `agentsam_deployment_health`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'dhc_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `deployment_id` | `TEXT` |  | ✓ | `` |
| `worker_name` | `TEXT` |  | ✓ | `` |
| `environment` | `TEXT` |  | ✓ | `'production'` |
| `check_type` | `TEXT` |  | ✓ | `` |
| `check_url` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'pending'` |
| `http_status_code` | `INTEGER` |  |  | `` |
| `response_time_ms` | `INTEGER` |  |  | `` |
| `error_message` | `TEXT` |  |  | `` |
| `metadata_json` | `TEXT` |  |  | `'{}'` |
| `checked_by` | `TEXT` |  |  | `'cron'` |
| `checked_at` | `TEXT` |  | ✓ | `datetime('now')` |

**Indexes:** `idx_agentsam_deployment_health_status`, `idx_agentsam_deployment_health_scope`, `idx_agentsam_deployment_health_deployment`

### `agentsam_error_log`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'err_' || lower(hex(randomblob(8)))` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `session_id` | `TEXT` |  |  | `` |
| `error_code` | `TEXT` |  |  | `` |
| `error_type` | `TEXT` |  | ✓ | `` |
| `error_message` | `TEXT` |  | ✓ | `` |
| `source` | `TEXT` |  | ✓ | `` |
| `source_id` | `TEXT` |  |  | `` |
| `context_json` | `TEXT` |  |  | `'{}'` |
| `stack_trace` | `TEXT` |  |  | `` |
| `resolved` | `INTEGER` |  |  | `0` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |

**Indexes:** `idx_error_log_type`, `idx_error_log_source`, `idx_error_log_workspace`

### `agentsam_escalation`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'esc_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `plan_id` | `TEXT` |  |  | `` |
| `todo_id` | `TEXT` |  |  | `` |
| `command_run_id` | `TEXT` |  | ✓ | `` |
| `from_tier` | `INTEGER` |  | ✓ | `` |
| `from_model` | `TEXT` |  |  | `` |
| `to_tier` | `INTEGER` |  | ✓ | `` |
| `to_model` | `TEXT` |  | ✓ | `` |
| `reason` | `TEXT` |  | ✓ | `` |
| `context_tokens` | `INTEGER` |  |  | `0` |
| `success` | `INTEGER` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |

**Indexes:** `idx_esc_plan`, `idx_esc_todo`, `idx_esc_tenant`, `idx_esc_workspace`, `idx_esc_command_run`

### `agentsam_eval_cases`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'evc_' || lower(hex(randomblob(8)))` |
| `suite_id` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `input_prompt` | `TEXT` |  | ✓ | `` |
| `expected_output` | `TEXT` |  |  | `` |
| `grading_criteria` | `TEXT` |  |  | `` |
| `tags` | `TEXT` |  |  | `'[]'` |
| `is_edge_case` | `INTEGER` |  |  | `0` |
| `sort_order` | `INTEGER` |  |  | `50` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |

### `agentsam_eval_runs`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'evr_' || lower(hex(randomblob(8)))` |
| `suite_id` | `TEXT` |  | ✓ | `` |
| `case_id` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `model_key` | `TEXT` |  | ✓ | `` |
| `provider` | `TEXT` |  | ✓ | `` |
| `input_tokens` | `INTEGER` |  |  | `0` |
| `output_tokens` | `INTEGER` |  |  | `0` |
| `latency_ms` | `INTEGER` |  |  | `0` |
| `cost_usd` | `REAL` |  |  | `0` |
| `score_quality` | `REAL` |  |  | `` |
| `score_latency` | `REAL` |  |  | `` |
| `score_cost` | `REAL` |  |  | `` |
| `score_tool_use` | `REAL` |  |  | `` |
| `score_safety` | `REAL` |  |  | `` |
| `score_overall` | `REAL` |  |  | `` |
| `passed` | `INTEGER` |  |  | `0` |
| `output_text` | `TEXT` |  |  | `` |
| `grader_notes` | `TEXT` |  |  | `` |
| `grader_model` | `TEXT` |  |  | `` |
| `run_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `cached_input_tokens` | `INTEGER` |  |  | `0` |
| `schema_valid` | `INTEGER` |  |  | `NULL` |
| `retry_count` | `INTEGER` |  |  | `0` |
| `prompt_version_id` | `TEXT` |  |  | `` |
| `run_group_id` | `TEXT` |  |  | `` |
| `tool_calls_attempted` | `INTEGER` |  |  | `0` |
| `tool_calls_succeeded` | `INTEGER` |  |  | `0` |
| `failure_taxonomy` | `TEXT` |  |  | `` |

### `agentsam_eval_suites`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'evs_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `provider` | `TEXT` |  |  | `` |
| `mode` | `TEXT` |  |  | `'auto'` |
| `task_type` | `TEXT` |  |  | `` |
| `is_active` | `INTEGER` |  |  | `1` |
| `run_count` | `INTEGER` |  |  | `0` |
| `last_run_at` | `TEXT` |  |  | `` |
| `created_by` | `TEXT` |  |  | `'sam_primeaux'` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |

### `agentsam_execution_context`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'ctx_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `command_run_id` | `TEXT` |  | ✓ | `` |
| `todo_id` | `TEXT` |  |  | `` |
| `cwd` | `TEXT` |  |  | `` |
| `files_json` | `TEXT` |  |  | `'[]'` |
| `recent_error` | `TEXT` |  |  | `` |
| `goal` | `TEXT` |  |  | `` |
| `extra_json` | `TEXT` |  |  | `'{}'` |
| `context_tokens` | `INTEGER` |  |  | `0` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |

**Indexes:** `idx_ctx_todo`, `idx_ctx_tenant`, `idx_ctx_command_run`

### `agentsam_executions`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `plan_id` | `TEXT` |  |  | `` |
| `todo_id` | `TEXT` |  |  | `` |
| `command_run_id` | `TEXT` |  |  | `` |
| `task_id` | `TEXT` |  | ✓ | `` |
| `subagent_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `work_session_id` | `TEXT` |  |  | `` |
| `execution_type` | `TEXT` |  | ✓ | `` |
| `command` | `TEXT` |  |  | `` |
| `file_path` | `TEXT` |  |  | `` |
| `output` | `TEXT` |  |  | `` |
| `error` | `TEXT` |  |  | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `timed_out` | `INTEGER` |  |  | `0` |
| `sla_breach` | `INTEGER` |  |  | `0` |
| `timeout_ms` | `INTEGER` |  |  | `120000` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |

**Indexes:** `idx_exe_timed_out`, `idx_exe_plan`, `idx_exe_command_run`, `idx_exe_todo`, `idx_exe_workspace`, `idx_exe_tenant`, `idx_exe_task`

### `agentsam_feature_flag`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `flag_key` | `TEXT` | ✓ |  | `` |
| `description` | `TEXT` |  |  | `` |
| `enabled_globally` | `INTEGER` |  | ✓ | `0` |
| `config_json` | `TEXT` |  |  | `` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `enabled_for_tenants` | `TEXT` |  |  | `'[]'` |
| `enabled_for_users` | `TEXT` |  |  | `'[]'` |
| `rollout_pct` | `INTEGER` |  |  | `0` |
| `environment` | `TEXT` |  |  | `'all'` |
| `flag_type` | `TEXT` |  |  | `'boolean'` |
| `expires_at` | `INTEGER` |  |  | `` |
| `created_at` | `TEXT` |  |  | `` |
| `created_by` | `TEXT` |  |  | `'sam_primeaux'` |
| `is_archived` | `INTEGER` |  |  | `0` |
| `tags` | `TEXT` |  |  | `'[]'` |

### `agentsam_fetch_domain_allowlist`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `''` |
| `host` | `TEXT` |  | ✓ | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |

**Indexes:** `idx_agentsam_fetch_domain_user`

### `agentsam_guardrail_events`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `event_scope` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `identity_profile_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `conversation_id` | `TEXT` |  |  | `` |
| `request_id` | `TEXT` |  |  | `` |
| `run_group_id` | `TEXT` |  |  | `` |
| `guardrail_id` | `TEXT` |  |  | `` |
| `guardrail_key` | `TEXT` |  | ✓ | `` |
| `ruleset_id` | `TEXT` |  |  | `` |
| `ruleset_key` | `TEXT` |  |  | `` |
| `category` | `TEXT` |  | ✓ | `` |
| `severity` | `TEXT` |  | ✓ | `` |
| `action` | `TEXT` |  | ✓ | `` |
| `target_type` | `TEXT` |  | ✓ | `` |
| `target_name` | `TEXT` |  |  | `` |
| `route_path` | `TEXT` |  |  | `` |
| `tool_name` | `TEXT` |  |  | `` |
| `model_key` | `TEXT` |  |  | `` |
| `decision` | `TEXT` |  | ✓ | `` |
| `reason` | `TEXT` |  |  | `` |
| `input_preview` | `TEXT` |  |  | `` |
| `output_preview` | `TEXT` |  |  | `` |
| `metadata_json` | `TEXT` |  | ✓ | `'{}'` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |

**Indexes:** `idx_agentsam_guardrail_events_target`, `idx_agentsam_guardrail_events_key`, `idx_agentsam_guardrail_events_request`, `idx_agentsam_guardrail_events_workspace`

### `agentsam_guardrail_rulesets`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `ruleset_key` | `TEXT` |  | ✓ | `` |
| `title` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `scope` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `version` | `INTEGER` |  | ✓ | `1` |
| `status` | `TEXT` |  | ✓ | `'active'` |
| `guardrail_keys_json` | `TEXT` |  | ✓ | `'[]'` |
| `metadata_json` | `TEXT` |  | ✓ | `'{}'` |
| `is_enabled` | `INTEGER` |  | ✓ | `1` |
| `priority` | `INTEGER` |  | ✓ | `100` |
| `created_by` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |

**Indexes:** `idx_agentsam_guardrail_rulesets_scope_enabled`, `idx_agentsam_guardrail_rulesets_key`, `idx_agentsam_guardrail_rulesets_scope`

### `agentsam_guardrails`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `scope` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `guardrail_key` | `TEXT` |  | ✓ | `` |
| `title` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `category` | `TEXT` |  | ✓ | `` |
| `severity` | `TEXT` |  | ✓ | `'medium'` |
| `action` | `TEXT` |  | ✓ | `'warn'` |
| `applies_to` | `TEXT` |  | ✓ | `'agent'` |
| `matcher_json` | `TEXT` |  | ✓ | `'{}'` |
| `policy_json` | `TEXT` |  | ✓ | `'{}'` |
| `metadata_json` | `TEXT` |  | ✓ | `'{}'` |
| `is_enabled` | `INTEGER` |  | ✓ | `1` |
| `priority` | `INTEGER` |  | ✓ | `100` |
| `created_by` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `tags_json` | `TEXT` |  |  | `'[]'` |
| `version` | `INTEGER` |  |  | `1` |

**Indexes:** `idx_agentsam_guardrails_key_enabled`, `idx_agentsam_guardrails_scope_enabled`, `idx_agentsam_guardrails_category`, `idx_agentsam_guardrails_key`, `idx_agentsam_guardrails_scope_lookup`

### `agentsam_health_daily`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'ahd_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `day` | `TEXT` |  | ✓ | `` |
| `health_status` | `TEXT` |  | ✓ | `'unknown'` |
| `snapshot_count` | `INTEGER` |  | ✓ | `0` |
| `green_count` | `INTEGER` |  | ✓ | `0` |
| `yellow_count` | `INTEGER` |  | ✓ | `0` |
| `red_count` | `INTEGER` |  | ✓ | `0` |
| `avg_tools_degraded` | `REAL` |  |  | `0` |
| `avg_rd_total` | `REAL` |  |  | `0` |
| `avg_tel_cost_24h` | `REAL` |  |  | `0` |
| `worst_status` | `TEXT` |  |  | `` |
| `health_notes` | `TEXT` |  |  | `` |
| `rolled_up_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `workspace_id` | `TEXT` |  |  | `` |
| `sla_breach_count` | `INTEGER` |  |  | `0` |
| `timed_out_count` | `INTEGER` |  |  | `0` |

**Indexes:** `idx_health_daily_workspace`

### `agentsam_hook`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `provider` | `TEXT` |  | ✓ | `'system'` |
| `external_id` | `TEXT` |  |  | `` |
| `trigger` | `TEXT` |  | ✓ | `` |
| `command` | `TEXT` |  | ✓ | `''` |
| `target_id` | `TEXT` |  | ✓ | `''` |
| `metadata` | `TEXT` |  |  | `'{}'` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `run_count` | `INTEGER` |  |  | `0` |
| `last_run_at` | `TEXT` |  |  | `` |
| `workflow_id` | `TEXT` |  |  | `` |
| `subagent_slug` | `TEXT` |  |  | `` |
| `person_uuid` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |

**Indexes:** `idx_hook_external`, `idx_hook_tenant`, `idx_hook_trigger`, `idx_hook_provider`, `idx_hook_user_ws`

### `agentsam_hook_execution`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'hexec_' || lower(hex(randomblob(6)))` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `hook_id` | `TEXT` |  | ✓ | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `plan_id` | `TEXT` |  |  | `` |
| `todo_id` | `TEXT` |  |  | `` |
| `command_run_id` | `TEXT` |  |  | `` |
| `source` | `TEXT` |  |  | `` |
| `event_type` | `TEXT` |  |  | `` |
| `action` | `TEXT` |  |  | `` |
| `actor` | `TEXT` |  |  | `` |
| `target_type` | `TEXT` |  |  | `` |
| `target_id` | `TEXT` |  |  | `` |
| `payload_json` | `TEXT` |  |  | `'{}'` |
| `metadata_json` | `TEXT` |  |  | `'{}'` |
| `status` | `TEXT` |  | ✓ | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `output` | `TEXT` |  |  | `` |
| `error` | `TEXT` |  |  | `` |
| `person_uuid` | `TEXT` |  |  | `` |
| `ran_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `created_at` | `INTEGER` |  |  | `unixepoch()` |

**Indexes:** `idx_hexec_event_type`, `idx_hexec_plan`, `idx_hexec_command_run`, `idx_hexec_todo`, `idx_hexec_status`, `idx_hexec_workspace`, `idx_hexec_tenant`, `idx_hexec_hook_ran`

### `agentsam_ignore_pattern`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `pattern` | `TEXT` |  | ✓ | `` |
| `is_negation` | `INTEGER` |  | ✓ | `0` |
| `order_index` | `INTEGER` |  | ✓ | `0` |
| `source` | `TEXT` |  | ✓ | `'db'` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |

**Indexes:** `idx_agentsam_ignore_user`, `idx_agentsam_ignore_ws`

### `agentsam_mcp_allowlist`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `''` |
| `tool_key` | `TEXT` |  | ✓ | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `notes` | `TEXT` |  |  | `` |
| `person_uuid` | `TEXT` |  |  | `` |
| `agentsam_tools_id` | `TEXT` |  |  | `` |
| `risk_level_override` | `TEXT` |  |  | `` |
| `max_calls_per_day` | `INTEGER` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `is_allowed` | `INTEGER` |  |  | `1` |
| `timeout_override_ms` | `INTEGER` |  |  | `` |
| `requires_approval` | `INTEGER` |  |  | `0` |
| `granted_by` | `TEXT` |  |  | `` |

**Indexes:** `idx_mcp_allowlist_agent_tool`, `idx_allowlist_user_tool`, `idx_agentsam_mcp_allowlist_workspace`, `idx_agentsam_mcp_allowlist_user`, `idx_agentsam_mcp_allowlist_unique`

### `agentsam_mcp_servers`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'mcps_' || lower(hex(randomblob(8)))` |
| `server_key` | `TEXT` |  | ✓ | `` |
| `display_name` | `TEXT` |  | ✓ | `` |
| `url` | `TEXT` |  | ✓ | `` |
| `auth_type` | `TEXT` |  | ✓ | `'bearer'` |
| `token_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `timeout_ms` | `INTEGER` |  | ✓ | `30000` |
| `health_check_url` | `TEXT` |  |  | `` |
| `last_health_at` | `INTEGER` |  |  | `` |
| `health_status` | `TEXT` |  |  | `'unknown'` |
| `avg_latency_ms` | `REAL` |  |  | `` |
| `error_rate` | `REAL` |  |  | `0` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |

**Indexes:** `idx_mcp_servers_key`

### `agentsam_mcp_tool_execution`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `tool_id` | `TEXT` |  |  | `` |
| `tool_name` | `TEXT` |  |  | `` |
| `input_tokens` | `INTEGER` |  |  | `0` |
| `output_tokens` | `INTEGER` |  |  | `0` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `cost_usd` | `REAL` |  |  | `0` |
| `success` | `INTEGER` |  |  | `1` |
| `error_message` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  |  | `datetime('now')` |
| `tenant_id` | `TEXT` |  |  | `'tenant_sam_primeaux'` |
| `session_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `workflow_id` | `TEXT` |  |  | `` |
| `input_json` | `TEXT` |  |  | `'{}'` |
| `requires_approval` | `INTEGER` |  |  | `0` |
| `retry_count` | `INTEGER` |  |  | `0` |
| `output_json` | `TEXT` |  |  | `'{}'` |
| `tool_chain_id` | `TEXT` |  |  | `` |
| `agentsam_tools_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `timed_out` | `INTEGER` |  |  | `0` |
| `sla_breach` | `INTEGER` |  |  | `0` |
| `timeout_ms` | `INTEGER` |  |  | `30000` |

**Indexes:** `idx_mcp_exec_workspace_tool`, `idx_mcp_exec_tenant_session`, `idx_mcp_exec_chain`

### `agentsam_mcp_tools`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `tool_key` | `TEXT` |  | ✓ | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |
| `tool_name` | `TEXT` |  |  | `''` |
| `display_name` | `TEXT` |  |  | `''` |
| `tool_category` | `TEXT` |  |  | `'mcp'` |
| `mcp_service_url` | `TEXT` |  |  | `''` |
| `description` | `TEXT` |  |  | `''` |
| `input_schema` | `TEXT` |  |  | `'{}'` |
| `output_schema` | `TEXT` |  |  | `'{}'` |
| `intent_tags` | `TEXT` |  |  | `'[]'` |
| `intent_category_tags` | `TEXT` |  |  | `''` |
| `modes_json` | `TEXT` |  |  | `'["auto","agent","debug"]'` |
| `handler_config` | `TEXT` |  |  | `'{}'` |
| `categories_json` | `TEXT` |  |  | `'[]'` |
| `schema_hint` | `TEXT` |  |  | `''` |
| `risk_level` | `TEXT` |  |  | `'low'` |
| `input_tokens` | `INTEGER` |  |  | `0` |
| `output_tokens` | `INTEGER` |  |  | `0` |
| `duration_ms` | `INTEGER` |  |  | `0` |
| `trigger_config_json` | `TEXT` |  |  | `'{}'` |
| `trigger_type` | `TEXT` |  |  | `'manual'` |
| `steps_json` | `TEXT` |  |  | `'[]'` |
| `timeout_seconds` | `INTEGER` |  |  | `120` |
| `requires_approval` | `INTEGER` |  |  | `0` |
| `estimated_cost_usd` | `REAL` |  |  | `0.0` |
| `last_used_at` | `TEXT` |  |  | `` |
| `updated_at` | `TEXT` |  |  | `` |
| `handler_type` | `TEXT` |  |  | `'builtin'` |
| `is_active` | `INTEGER` |  |  | `1` |
| `workspace_scope` | `TEXT` |  |  | `'["ws_inneranimalmedia"]'` |
| `is_degraded` | `INTEGER` |  | ✓ | `0` |
| `failure_rate` | `REAL` |  |  | `0.0` |
| `avg_latency_ms` | `REAL` |  |  | `NULL` |
| `last_health_check` | `INTEGER` |  |  | `NULL` |
| `sort_priority` | `INTEGER` |  |  | `50` |
| `cost_per_call_usd` | `REAL` |  |  | `0.0` |
| `agentsam_tools_id` | `TEXT` |  |  | `` |
| `enabled` | `INTEGER` |  |  | `1` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `server_key` | `TEXT` |  |  | `` |
| `server_id` | `TEXT` |  |  | `` |
| `routing_scope` | `TEXT` |  |  | `'workspace'` |
| `last_error` | `TEXT` |  |  | `` |
| `health_status` | `TEXT` |  |  | `'unknown'` |
| `health_checked_at` | `TEXT` |  |  | `` |

**Indexes:** `idx_mcp_tools_tenant_key`, `idx_mcp_tools_workspace_active`, `idx_mcp_tools_category`, `idx_mcp_tools_tool_name`

### `agentsam_mcp_workflows`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `workflow_key` | `TEXT` |  | ✓ | `` |
| `display_name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'ready'` |
| `priority` | `TEXT` |  | ✓ | `'medium'` |
| `steps_json` | `TEXT` |  | ✓ | `'[]'` |
| `tools_json` | `TEXT` |  | ✓ | `'[]'` |
| `acceptance_criteria_json` | `TEXT` |  | ✓ | `'[]'` |
| `notes` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `trigger_type` | `TEXT` |  |  | `'manual'` |
| `trigger_config_json` | `TEXT` |  |  | `'{}'` |
| `input_schema_json` | `TEXT` |  |  | `'{}'` |
| `output_schema_json` | `TEXT` |  |  | `'{}'` |
| `requires_approval` | `INTEGER` |  |  | `0` |
| `risk_level` | `TEXT` |  |  | `'low'` |
| `run_count` | `INTEGER` |  |  | `0` |
| `success_count` | `INTEGER` |  |  | `0` |
| `last_run_at` | `TEXT` |  |  | `` |
| `last_run_status` | `TEXT` |  |  | `` |
| `avg_duration_ms` | `REAL` |  |  | `0` |
| `total_cost_usd` | `REAL` |  |  | `0` |
| `version` | `INTEGER` |  |  | `1` |
| `is_active` | `INTEGER` |  |  | `1` |
| `subagent_slug` | `TEXT` |  |  | `` |
| `model_id` | `TEXT` |  |  | `` |
| `timeout_seconds` | `INTEGER` |  |  | `300` |
| `category` | `TEXT` |  |  | `'general'` |
| `parent_workflow_id` | `TEXT` |  |  | `NULL` |
| `tags_json` | `TEXT` |  |  | `'[]'` |
| `retry_policy_json` | `TEXT` |  |  | `'{"max_retries":2,"backoff":"exponential","dela...` |
| `on_failure_json` | `TEXT` |  |  | `'{"action":"notify","notify_channel":"resend"}'` |
| `max_concurrent_runs` | `INTEGER` |  |  | `1` |
| `environment` | `TEXT` |  |  | `'production'` |
| `visibility` | `TEXT` |  |  | `'workspace'` |
| `input_defaults_json` | `TEXT` |  |  | `'{}'` |
| `last_error` | `TEXT` |  |  | `NULL` |
| `task_type` | `TEXT` |  |  | `'agent_workflow'` |

**Indexes:** `idx_agentsam_mcp_workflows_task_type`, `idx_agentsam_mcp_workflows_parent`, `idx_agentsam_mcp_workflows_updated`, `idx_agentsam_mcp_workflows_subagent`, `idx_agentsam_mcp_workflows_trigger`, `idx_agentsam_mcp_workflows_active_category`, `idx_agentsam_mcp_workflows_tenant_workspace_status`

### `agentsam_memory`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'mem_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `memory_type` | `TEXT` |  |  | `'fact'` |
| `key` | `TEXT` |  | ✓ | `` |
| `value` | `TEXT` |  | ✓ | `` |
| `source` | `TEXT` |  |  | `` |
| `confidence` | `REAL` |  |  | `1.0` |
| `decay_score` | `REAL` |  |  | `1.0` |
| `recall_count` | `INTEGER` |  |  | `0` |
| `last_recalled_at` | `INTEGER` |  |  | `` |
| `expires_at` | `INTEGER` |  |  | `` |
| `created_at` | `INTEGER` |  |  | `unixepoch()` |
| `updated_at` | `INTEGER` |  |  | `unixepoch()` |
| `agent_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `tags` | `TEXT` |  |  | `'[]'` |
| `embedding_id` | `TEXT` |  |  | `` |

**Indexes:** `idx_mem_user_type`, `idx_mem_agent`, `idx_mem_decay`, `idx_mem_tenant_expires`, `idx_mem_tenant_type`

### `agentsam_model_drift_signals`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'mds_' || lower(hex(randomblob(8)))` |
| `model_key` | `TEXT` |  | ✓ | `` |
| `provider` | `TEXT` |  | ✓ | `` |
| `task_type` | `TEXT` |  | ✓ | `` |
| `case_id` | `TEXT` |  | ✓ | `` |
| `baseline_score` | `REAL` |  | ✓ | `` |
| `baseline_run_id` | `TEXT` |  |  | `` |
| `current_score` | `REAL` |  | ✓ | `` |
| `current_run_id` | `TEXT` |  |  | `` |
| `delta` | `REAL` |  | ✓ | `` |
| `delta_pct` | `REAL` |  | ✓ | `` |
| `detected_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `severity` | `TEXT` |  | ✓ | `` |
| `acknowledged` | `INTEGER` |  | ✓ | `0` |
| `acknowledged_by` | `TEXT` |  |  | `` |
| `acknowledged_at` | `INTEGER` |  |  | `` |
| `notes` | `TEXT` |  |  | `` |
| `ai_model_id` | `TEXT` |  |  | `` |
| `routing_arm_paused` | `INTEGER` |  |  | `0` |
| `routing_arm_id` | `TEXT` |  |  | `` |

**Indexes:** `idx_mds_severity`

### `agentsam_model_tier`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'tier_' || lower(hex(randomblob(6)))` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `tier_level` | `INTEGER` |  | ✓ | `` |
| `tier_name` | `TEXT` |  | ✓ | `` |
| `model_id` | `TEXT` |  |  | `` |
| `api_platform` | `TEXT` |  |  | `` |
| `role_description` | `TEXT` |  | ✓ | `` |
| `escalate_if_confidence_below` | `REAL` |  |  | `0.75` |
| `escalate_after_failures` | `INTEGER` |  |  | `1` |
| `max_context_tokens` | `INTEGER` |  |  | `4096` |
| `max_output_tokens` | `INTEGER` |  |  | `1024` |
| `cost_tier` | `TEXT` |  |  | `'free'` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `sort_order` | `INTEGER` |  | ✓ | `0` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `fallback_model_id` | `TEXT` |  |  | `` |
| `routing_arm_id` | `TEXT` |  |  | `` |

### `agentsam_plan_tasks`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'task_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `plan_id` | `TEXT` |  | ✓ | `` |
| `todo_id` | `TEXT` |  |  | `` |
| `command_run_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `assigned_model` | `TEXT` |  |  | `` |
| `order_index` | `INTEGER` |  | ✓ | `` |
| `title` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `priority` | `TEXT` |  | ✓ | `'P1'` |
| `category` | `TEXT` |  |  | `'backend'` |
| `status` | `TEXT` |  | ✓ | `'todo'` |
| `files_involved` | `TEXT` |  |  | `'[]'` |
| `tables_involved` | `TEXT` |  |  | `'[]'` |
| `routes_involved` | `TEXT` |  |  | `'[]'` |
| `depends_on` | `TEXT` |  |  | `'[]'` |
| `estimated_minutes` | `INTEGER` |  |  | `` |
| `actual_minutes` | `INTEGER` |  |  | `` |
| `blocked_reason` | `TEXT` |  |  | `` |
| `notes` | `TEXT` |  |  | `` |
| `output_summary` | `TEXT` |  |  | `` |
| `error_trace` | `TEXT` |  |  | `` |
| `tokens_used` | `INTEGER` |  |  | `0` |
| `cost_usd` | `REAL` |  |  | `0` |
| `started_at` | `INTEGER` |  |  | `` |
| `completed_at` | `INTEGER` |  |  | `` |
| `created_at` | `INTEGER` |  |  | `unixepoch()` |

**Indexes:** `idx_aptasks_priority`, `idx_aptasks_command_run`, `idx_aptasks_todo`, `idx_aptasks_status`, `idx_aptasks_workspace`, `idx_aptasks_tenant`, `idx_aptasks_plan`

### `agentsam_plans`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `client_id` | `TEXT` |  |  | `` |
| `client_name` | `TEXT` |  |  | `` |
| `plan_date` | `TEXT` |  | ✓ | `` |
| `plan_type` | `TEXT` |  |  | `'daily'` |
| `title` | `TEXT` |  | ✓ | `` |
| `status` | `TEXT` |  | ✓ | `'active'` |
| `morning_brief` | `TEXT` |  |  | `` |
| `session_notes` | `TEXT` |  |  | `` |
| `eod_summary` | `TEXT` |  |  | `` |
| `available_providers` | `TEXT` |  |  | `'["anthropic","openai","google","workers_ai"]'` |
| `blocked_providers` | `TEXT` |  |  | `'[]'` |
| `budget_snapshot` | `TEXT` |  |  | `'{}'` |
| `default_model` | `TEXT` |  |  | `` |
| `token_budget` | `INTEGER` |  |  | `NULL` |
| `tokens_used` | `INTEGER` |  | ✓ | `0` |
| `cost_usd` | `REAL` |  | ✓ | `0` |
| `carry_over_from` | `TEXT` |  |  | `` |
| `carry_over_count` | `INTEGER` |  |  | `0` |
| `tasks_total` | `INTEGER` |  |  | `0` |
| `tasks_done` | `INTEGER` |  |  | `0` |
| `tasks_blocked` | `INTEGER` |  |  | `0` |
| `linked_project_keys` | `TEXT` |  |  | `'[]'` |
| `linked_todo_ids` | `TEXT` |  |  | `'[]'` |
| `linked_context_ids` | `TEXT` |  |  | `'[]'` |
| `created_at` | `INTEGER` |  |  | `unixepoch()` |
| `updated_at` | `INTEGER` |  |  | `unixepoch()` |

**Indexes:** `idx_aplans_type_status`, `idx_aplans_workspace`, `idx_aplans_agent`, `idx_aplans_date`, `idx_aplans_tenant_date`, `idx_aplans_tenant_status`

### `agentsam_project_context`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'ctx_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `project_key` | `TEXT` |  | ✓ | `` |
| `project_name` | `TEXT` |  | ✓ | `` |
| `project_type` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  |  | `'active'` |
| `priority` | `INTEGER` |  |  | `50` |
| `description` | `TEXT` |  | ✓ | `` |
| `goals` | `TEXT` |  |  | `` |
| `constraints` | `TEXT` |  |  | `` |
| `current_blockers` | `TEXT` |  |  | `` |
| `primary_tables` | `TEXT` |  |  | `` |
| `secondary_tables` | `TEXT` |  |  | `` |
| `workers_involved` | `TEXT` |  |  | `` |
| `r2_buckets_involved` | `TEXT` |  |  | `` |
| `domains_involved` | `TEXT` |  |  | `` |
| `mcp_services_involved` | `TEXT` |  |  | `` |
| `key_files` | `TEXT` |  |  | `` |
| `related_routes` | `TEXT` |  |  | `` |
| `cursor_usage_percent` | `REAL` |  |  | `0` |
| `tokens_budgeted` | `INTEGER` |  |  | `` |
| `tokens_used` | `INTEGER` |  |  | `0` |
| `cost_usd` | `REAL` |  | ✓ | `0` |
| `linked_plan_id` | `TEXT` |  |  | `` |
| `linked_todo_ids` | `TEXT` |  |  | `'[]'` |
| `agent_id` | `TEXT` |  |  | `` |
| `client_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `created_by` | `TEXT` |  |  | `` |
| `notes` | `TEXT` |  |  | `` |
| `last_cursor_session` | `TEXT` |  |  | `` |
| `started_at` | `INTEGER` |  |  | `` |
| `target_completion` | `INTEGER` |  |  | `` |
| `completed_at` | `INTEGER` |  |  | `` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |

**Indexes:** `idx_pctx_plan`, `idx_pctx_client`, `idx_pctx_agent`, `idx_pctx_workspace`, `idx_pctx_project_key`, `idx_pctx_tenant_status`

### `agentsam_prompt_cache_keys`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'pck_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `provider` | `TEXT` |  | ✓ | `` |
| `model_key` | `TEXT` |  | ✓ | `` |
| `cache_key_hash` | `TEXT` |  | ✓ | `` |
| `cache_type` | `TEXT` |  |  | `'ephemeral'` |
| `token_count` | `INTEGER` |  |  | `0` |
| `write_cost_usd` | `REAL` |  |  | `0` |
| `read_count` | `INTEGER` |  |  | `0` |
| `total_read_savings_usd` | `REAL` |  |  | `0` |
| `first_written_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `last_read_at` | `TEXT` |  |  | `` |
| `expires_at` | `TEXT` |  |  | `` |
| `source_type` | `TEXT` |  |  | `` |
| `source_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `prompt_version_id` | `TEXT` |  |  | `` |

**Indexes:** `idx_prompt_cache_workspace`

### `agentsam_prompt_versions`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'pv_' || lower(hex(randomblob(8)))` |
| `prompt_key` | `TEXT` |  | ✓ | `` |
| `version` | `INTEGER` |  | ✓ | `` |
| `prompt_hash` | `TEXT` |  | ✓ | `` |
| `body` | `TEXT` |  | ✓ | `` |
| `body_tokens` | `INTEGER` |  | ✓ | `` |
| `is_active` | `INTEGER` |  | ✓ | `0` |
| `superseded_by` | `TEXT` |  |  | `` |
| `notes` | `TEXT` |  |  | `` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `prompt_kind` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |

**Indexes:** `idx_pv_active`

### `agentsam_routing_arms`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'ra_' || lower(hex(randomblob(8)))` |
| `task_type` | `TEXT` |  | ✓ | `` |
| `mode` | `TEXT` |  | ✓ | `` |
| `model_key` | `TEXT` |  | ✓ | `` |
| `provider` | `TEXT` |  | ✓ | `` |
| `success_alpha` | `REAL` |  | ✓ | `1.0` |
| `success_beta` | `REAL` |  | ✓ | `1.0` |
| `cost_n` | `INTEGER` |  | ✓ | `0` |
| `cost_mean` | `REAL` |  | ✓ | `0` |
| `cost_m2` | `REAL` |  | ✓ | `0` |
| `latency_n` | `INTEGER` |  | ✓ | `0` |
| `latency_mean` | `REAL` |  | ✓ | `0` |
| `latency_m2` | `REAL` |  | ✓ | `0` |
| `decayed_score` | `REAL` |  | ✓ | `0` |
| `last_decay_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `is_eligible` | `INTEGER` |  | ✓ | `1` |
| `is_paused` | `INTEGER` |  | ✓ | `0` |
| `pause_reason` | `TEXT` |  |  | `` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `ai_model_id` | `TEXT` |  |  | `` |
| `last_chain_id` | `TEXT` |  |  | `` |
| `last_plan_id` | `TEXT` |  |  | `` |
| `avg_quality_score` | `REAL` |  |  | `0` |
| `quality_n` | `INTEGER` |  |  | `0` |
| `max_cost_per_call_usd` | `REAL` |  |  | `` |
| `budget_exhausted` | `INTEGER` |  |  | `0` |
| `drift_signal_id` | `TEXT` |  |  | `` |
| `intent_slug` | `TEXT` |  |  | `` |
| `total_executions` | `INTEGER` |  |  | `0` |
| `workflow_agent` | `TEXT` |  |  | `` |
| `tools_json` | `TEXT` |  |  | `'[]'` |
| `is_active` | `INTEGER` |  |  | `1` |
| `reasoning_effort` | `TEXT` |  |  | `'medium'` |
| `workspace_id` | `TEXT` |  |  | `'ws_inneranimalmedia'` |
| `fallback_model_key` | `TEXT` |  |  | `` |
| `supports_tools` | `INTEGER` |  |  | `1` |
| `priority` | `INTEGER` |  |  | `50` |

**Indexes:** `idx_routing_arms_priority`, `idx_routing_arms_workspace_task`, `idx_routing_arms_task_mode`, `idx_routing_arms_intent_slug`, `idx_routing_arms_task_mode_eligible`, `idx_routing_arms_model`, `idx_routing_arms_lookup`, `idx_arms_lookup`

### `agentsam_rules_document`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `title` | `TEXT` |  | ✓ | `'default'` |
| `body_markdown` | `TEXT` |  | ✓ | `` |
| `version` | `INTEGER` |  | ✓ | `1` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |

**Indexes:** `idx_agentsam_rules_ws_active`

### `agentsam_script_runs`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'sr_' || lower(hex(randomblob(8)))` |
| `script_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `'ws_inneranimalmedia'` |
| `triggered_by` | `TEXT` |  | ✓ | `'agent'` |
| `trigger_source` | `TEXT` |  | ✓ | `'agent_sam'` |
| `cicd_run_id` | `TEXT` |  |  | `` |
| `git_commit_sha` | `TEXT` |  |  | `` |
| `git_branch` | `TEXT` |  |  | `'main'` |
| `environment` | `TEXT` |  | ✓ | `'production'` |
| `status` | `TEXT` |  | ✓ | `'running'` |
| `exit_code` | `INTEGER` |  |  | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `output_summary` | `TEXT` |  |  | `` |
| `error_message` | `TEXT` |  |  | `` |
| `cost_usd` | `REAL` |  |  | `0` |
| `started_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| `completed_at` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |

### `agentsam_scripts`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `workspace_id` | `TEXT` |  | ✓ | `'ws_inneranimalmedia'` |
| `name` | `TEXT` |  | ✓ | `` |
| `path` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  | ✓ | `` |
| `purpose` | `TEXT` |  | ✓ | `` |
| `runner` | `TEXT` |  | ✓ | `'npm'` |
| `requires_env` | `INTEGER` |  | ✓ | `1` |
| `owner_only` | `INTEGER` |  | ✓ | `1` |
| `safe_to_run` | `INTEGER` |  | ✓ | `1` |
| `run_before` | `TEXT` |  |  | `` |
| `run_after` | `TEXT` |  |  | `` |
| `never_run_with` | `TEXT` |  |  | `` |
| `preferred_for` | `TEXT` |  |  | `` |
| `notes` | `TEXT` |  |  | `` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `created_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| `updated_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |

**Indexes:** `idx_agentsam_scripts_workspace_path`

### `agentsam_skill`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  | ✓ | `''` |
| `file_path` | `TEXT` |  | ✓ | `''` |
| `scope` | `TEXT` |  | ✓ | `'user'` |
| `workspace_id` | `TEXT` |  |  | `` |
| `content_markdown` | `TEXT` |  | ✓ | `''` |
| `metadata_json` | `TEXT` |  | ✓ | `'{}'` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `created_at` | `TEXT` |  |  | `datetime('now')` |
| `updated_at` | `TEXT` |  |  | `datetime('now')` |
| `icon` | `TEXT` |  | ✓ | `''` |
| `access_mode` | `TEXT` |  | ✓ | `'read_write'` |
| `default_model_id` | `TEXT` |  |  | `` |
| `sort_order` | `INTEGER` |  | ✓ | `0` |
| `slash_trigger` | `TEXT` |  |  | `` |
| `globs` | `TEXT` |  |  | `` |
| `always_apply` | `INTEGER` |  | ✓ | `0` |
| `version` | `INTEGER` |  | ✓ | `1` |
| `tags` | `TEXT` |  |  | `` |
| `person_uuid` | `TEXT` |  |  | `` |
| `ai_model_id` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  |  | `'tenant_sam_primeaux'` |

**Indexes:** `idx_skill_workspace_tenant`, `idx_agentsam_skill_workspace`, `idx_agentsam_skill_user_name`

### `agentsam_skill_invocation`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'skillinv_' || lower(hex(randomblob(8)))` |
| `skill_id` | `TEXT` |  | ✓ | `` |
| `user_id` | `TEXT` |  | ✓ | `'sam_primeaux'` |
| `workspace_id` | `TEXT` |  | ✓ | `''` |
| `conversation_id` | `TEXT` |  |  | `` |
| `trigger_method` | `TEXT` |  | ✓ | `'slash'` |
| `input_summary` | `TEXT` |  |  | `` |
| `success` | `INTEGER` |  | ✓ | `1` |
| `error_message` | `TEXT` |  |  | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `model_used` | `TEXT` |  |  | `` |
| `tokens_in` | `INTEGER` |  |  | `0` |
| `tokens_out` | `INTEGER` |  |  | `0` |
| `cost_usd` | `REAL` |  |  | `0.0` |
| `invoked_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `tool_chain_id` | `TEXT` |  |  | `` |
| `ai_model_id` | `TEXT` |  |  | `` |
| `plan_task_id` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  |  | `'tenant_sam_primeaux'` |

**Indexes:** `idx_skill_invoc_workspace`, `idx_skill_invoc_invoked`, `idx_skill_invoc_user`, `idx_skill_invoc_skill_id`

### `agentsam_skill_revision`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'skillrev_' || lower(hex(randomblob(8)))` |
| `skill_id` | `TEXT` |  | ✓ | `` |
| `content_markdown` | `TEXT` |  | ✓ | `` |
| `version` | `INTEGER` |  | ✓ | `` |
| `changed_by` | `TEXT` |  | ✓ | `'sam_primeaux'` |
| `change_note` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |

**Indexes:** `idx_skill_revision_version`, `idx_skill_revision_skill_id`

### `agentsam_slash_commands`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `slug` | `TEXT` |  | ✓ | `` |
| `display_name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  | ✓ | `` |
| `usage_hint` | `TEXT` |  |  | `` |
| `handler_type` | `TEXT` |  | ✓ | `` |
| `handler_ref` | `TEXT` |  |  | `` |
| `handler_sql` | `TEXT` |  |  | `` |
| `args_schema` | `TEXT` |  |  | `` |
| `modes_json` | `TEXT` |  |  | `'["ask","agent","auto","debug","plan"]'` |
| `risk_level` | `TEXT` |  |  | `'none'` |
| `requires_confirmation` | `INTEGER` |  |  | `0` |
| `is_active` | `INTEGER` |  |  | `1` |
| `sort_order` | `INTEGER` |  |  | `50` |
| `call_count` | `INTEGER` |  |  | `0` |
| `last_called_at` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  |  | `datetime('now')` |

### `agentsam_subagent_profile`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `user_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `''` |
| `slug` | `TEXT` |  | ✓ | `` |
| `display_name` | `TEXT` |  | ✓ | `` |
| `instructions_markdown` | `TEXT` |  |  | `` |
| `allowed_tool_globs` | `TEXT` |  |  | `` |
| `default_model_id` | `TEXT` |  |  | `` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `personality_tone` | `TEXT` |  |  | `'professional'` |
| `personality_traits` | `TEXT` |  |  | `` |
| `personality_rules` | `TEXT` |  |  | `` |
| `description` | `TEXT` |  | ✓ | `''` |
| `icon` | `TEXT` |  | ✓ | `''` |
| `access_mode` | `TEXT` |  | ✓ | `'read_write'` |
| `run_in_background` | `INTEGER` |  | ✓ | `0` |
| `sort_order` | `INTEGER` |  | ✓ | `0` |
| `agent_type` | `TEXT` |  |  | `'custom'` |
| `sandbox_mode` | `TEXT` |  |  | `'workspace-write'` |
| `model_reasoning_effort` | `TEXT` |  |  | `'medium'` |
| `nickname_candidates` | `TEXT` |  |  | `` |
| `can_spawn_subagents` | `INTEGER` |  |  | `0` |
| `spawnable_agent_slugs` | `TEXT` |  |  | `` |
| `spawn_trigger_keywords` | `TEXT` |  |  | `` |
| `max_concurrent_threads` | `INTEGER` |  |  | `6` |
| `max_spawn_depth` | `INTEGER` |  |  | `1` |
| `job_timeout_seconds` | `INTEGER` |  |  | `1800` |
| `mcp_servers_json` | `TEXT` |  |  | `` |
| `output_schema_json` | `TEXT` |  |  | `` |
| `is_parallelizable` | `INTEGER` |  |  | `0` |
| `codex_compatible` | `INTEGER` |  |  | `0` |
| `person_uuid` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  |  | `` |
| `ai_model_id` | `TEXT` |  |  | `` |
| `is_platform_global` | `INTEGER` |  | ✓ | `0` |

**Indexes:** `idx_agentsam_subagent_user`

### `agentsam_subscription_registry`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `name` | `TEXT` |  | ✓ | `` |
| `provider` | `TEXT` |  | ✓ | `` |
| `model_name` | `TEXT` |  |  | `` |
| `subscription_tier` | `TEXT` |  |  | `` |
| `linked_email` | `TEXT` |  |  | `` |
| `notes` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'active'` |
| `created_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| `updated_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |

### `agentsam_task_slos`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `task_type` | `TEXT` | ✓ |  | `` |
| `sla_p95_latency_ms` | `INTEGER` |  | ✓ | `` |
| `sla_avg_cost_usd` | `REAL` |  | ✓ | `` |
| `sla_min_quality` | `REAL` |  | ✓ | `` |
| `sla_min_schema_valid_rate` | `REAL` |  |  | `` |
| `sla_min_tool_success_rate` | `REAL` |  |  | `` |
| `alert_threshold_pct` | `REAL` |  | ✓ | `0.10` |
| `notes` | `TEXT` |  |  | `` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `pause_arm_on_breach` | `INTEGER` |  |  | `0` |

### `agentsam_todo`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `title` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'open'` |
| `priority` | `TEXT` |  | ✓ | `'medium'` |
| `category` | `TEXT` |  |  | `` |
| `tags` | `TEXT` |  |  | `'[]'` |
| `due_date` | `TEXT` |  |  | `` |
| `completed_at` | `TEXT` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `created_by` | `TEXT` |  | ✓ | `'agentsam'` |
| `notes` | `TEXT` |  |  | `` |
| `linked_commit` | `TEXT` |  |  | `` |
| `linked_route` | `TEXT` |  |  | `` |
| `linked_table` | `TEXT` |  |  | `` |
| `sort_order` | `INTEGER` |  |  | `50` |
| `plan_id` | `TEXT` |  |  | `` |
| `project_key` | `TEXT` |  |  | `` |
| `task_type` | `TEXT` |  | ✓ | `'execute'` |
| `execution_status` | `TEXT` |  | ✓ | `'queued'` |
| `assigned_to` | `TEXT` |  |  | `'agentsam'` |
| `depends_on` | `TEXT` |  |  | `'[]'` |
| `retry_count` | `INTEGER` |  | ✓ | `0` |
| `max_retries` | `INTEGER` |  | ✓ | `2` |
| `timeout_seconds` | `INTEGER` |  |  | `300` |
| `context_snapshot` | `TEXT` |  |  | `'{}'` |
| `output_summary` | `TEXT` |  |  | `` |
| `error_trace` | `TEXT` |  |  | `` |
| `token_budget` | `INTEGER` |  |  | `NULL` |
| `tokens_used` | `INTEGER` |  | ✓ | `0` |
| `cost_usd` | `REAL` |  | ✓ | `0` |
| `requires_approval` | `INTEGER` |  | ✓ | `0` |
| `approved_by` | `TEXT` |  |  | `` |
| `approved_at` | `TEXT` |  |  | `` |
| `started_at` | `TEXT` |  |  | `` |
| `kanban_task_id` | `TEXT` |  |  | `` |
| `kanban_board_id` | `TEXT` |  |  | `` |

**Indexes:** `idx_todo_requires_approval`, `idx_todo_execution_status`, `idx_todo_plan`, `idx_todo_workspace_status`, `idx_todo_tenant_status`

### `agentsam_tool_call_log`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'atcl_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `session_id` | `TEXT` |  |  | `` |
| `tool_name` | `TEXT` |  | ✓ | `` |
| `status` | `TEXT` |  | ✓ | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `error_message` | `TEXT` |  |  | `` |
| `cost_usd` | `REAL` |  |  | `0` |
| `input_tokens` | `INTEGER` |  |  | `0` |
| `output_tokens` | `INTEGER` |  |  | `0` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `agent_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `workflow_id` | `TEXT` |  |  | `` |
| `tool_category` | `TEXT` |  |  | `'mcp'` |
| `input_summary` | `TEXT` |  |  | `` |
| `output_summary` | `TEXT` |  |  | `` |
| `retry_count` | `INTEGER` |  |  | `0` |
| `workspace_id` | `TEXT` |  |  | `` |
| `timed_out` | `INTEGER` |  |  | `0` |
| `sla_breach` | `INTEGER` |  |  | `0` |
| `timeout_ms` | `INTEGER` |  |  | `30000` |

**Indexes:** `idx_tool_call_log_workspace_tool`, `idx_tool_call_log_tenant_time`

### `agentsam_tool_chain`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'atc_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  |  | `` |
| `workspace_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `agent_id` | `TEXT` |  |  | `` |
| `work_session_id` | `TEXT` |  |  | `` |
| `plan_id` | `TEXT` |  |  | `` |
| `todo_id` | `TEXT` |  |  | `` |
| `command_run_id` | `TEXT` |  |  | `` |
| `subagent_profile_id` | `TEXT` |  |  | `` |
| `agent_session_id` | `TEXT` |  |  | `` |
| `agent_message_id` | `TEXT` |  |  | `` |
| `parent_chain_id` | `TEXT` |  |  | `` |
| `depth` | `INTEGER` |  | ✓ | `0` |
| `tool_name` | `TEXT` |  | ✓ | `` |
| `tool_id` | `TEXT` |  |  | `` |
| `mcp_tool_ref` | `TEXT` |  |  | `` |
| `mcp_tool_call_id` | `TEXT` |  |  | `` |
| `terminal_session_id` | `TEXT` |  |  | `` |
| `command_execution_id` | `TEXT` |  |  | `` |
| `tool_status` | `TEXT` |  | ✓ | `'pending'` |
| `input_json` | `TEXT` |  |  | `'{}'` |
| `output_summary` | `TEXT` |  |  | `` |
| `result_json` | `TEXT` |  |  | `` |
| `error_message` | `TEXT` |  |  | `` |
| `error_type` | `TEXT` |  |  | `` |
| `retry_count` | `INTEGER` |  | ✓ | `0` |
| `max_retries` | `INTEGER` |  | ✓ | `2` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `input_tokens` | `INTEGER` |  | ✓ | `0` |
| `output_tokens` | `INTEGER` |  | ✓ | `0` |
| `cost_usd` | `REAL` |  | ✓ | `0` |
| `timed_out` | `INTEGER` |  |  | `0` |
| `sla_breach` | `INTEGER` |  |  | `0` |
| `timeout_ms` | `INTEGER` |  |  | `30000` |
| `requires_approval` | `INTEGER` |  | ✓ | `0` |
| `approved_by` | `TEXT` |  |  | `` |
| `approved_at` | `INTEGER` |  |  | `` |
| `started_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `completed_at` | `INTEGER` |  |  | `` |

**Indexes:** `idx_atc_parent`, `idx_atc_workspace`, `idx_atc_tenant`, `idx_atc_agent_session`, `idx_atc_tool_status`, `idx_atc_command_run`, `idx_atc_todo`, `idx_atc_plan_id`

### `agentsam_tool_stats_compacted`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'atsc_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `'__tenant__'` |
| `tool_name` | `TEXT` |  | ✓ | `` |
| `total_calls` | `INTEGER` |  |  | `0` |
| `success_count` | `INTEGER` |  |  | `0` |
| `failure_count` | `INTEGER` |  |  | `0` |
| `success_rate` | `REAL` |  |  | `0` |
| `total_cost_usd` | `REAL` |  |  | `0` |
| `total_tokens` | `INTEGER` |  |  | `0` |
| `avg_duration_ms` | `REAL` |  |  | `0` |
| `first_seen_at` | `INTEGER` |  |  | `` |
| `last_seen_at` | `INTEGER` |  |  | `` |
| `compacted_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `agent_id` | `TEXT` |  |  | `` |
| `timed_out_count` | `INTEGER` |  |  | `0` |
| `sla_breach_count` | `INTEGER` |  |  | `0` |
| `p95_duration_ms` | `REAL` |  |  | `0` |

**Indexes:** `idx_tool_stats_workspace`, `idx_agentsam_tool_stats_scope_tool`, `idx_agentsam_tool_stats_compacted_at`

### `agentsam_tools`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'ast_' || lower(hex(randomblob(8)))` |
| `tool_name` | `TEXT` |  | ✓ | `` |
| `display_name` | `TEXT` |  | ✓ | `` |
| `tool_category` | `TEXT` |  | ✓ | `` |
| `handler_type` | `TEXT` |  | ✓ | `'builtin'` |
| `description` | `TEXT` |  |  | `` |
| `input_schema` | `TEXT` |  |  | `` |
| `output_schema` | `TEXT` |  |  | `` |
| `linked_mcp_tool_id` | `TEXT` |  |  | `` |
| `mcp_service_url` | `TEXT` |  |  | `` |
| `handler_config` | `TEXT` |  |  | `'{}'` |
| `intent_tags` | `TEXT` |  |  | `'[]'` |
| `intent_category_tags` | `TEXT` |  |  | `` |
| `modes_json` | `TEXT` |  |  | `'["auto","build","chat"]'` |
| `risk_level` | `TEXT` |  | ✓ | `'low'` |
| `requires_approval` | `INTEGER` |  | ✓ | `0` |
| `requires_confirmation` | `INTEGER` |  | ✓ | `0` |
| `token_budget_per_call` | `INTEGER` |  |  | `NULL` |
| `max_calls_per_session` | `INTEGER` |  |  | `NULL` |
| `cost_per_call_usd` | `REAL` |  |  | `0.0` |
| `is_active` | `INTEGER` |  | ✓ | `1` |
| `is_degraded` | `INTEGER` |  | ✓ | `0` |
| `failure_rate` | `REAL` |  |  | `0.0` |
| `avg_latency_ms` | `REAL` |  |  | `NULL` |
| `use_count` | `INTEGER` |  | ✓ | `0` |
| `last_used_at` | `INTEGER` |  |  | `NULL` |
| `last_health_check` | `INTEGER` |  |  | `NULL` |
| `sort_priority` | `INTEGER` |  |  | `50` |
| `workspace_scope` | `TEXT` |  |  | `'["ws_inneranimalmedia"]'` |
| `subagent_profile_id` | `TEXT` |  |  | `NULL` |
| `schema_hint` | `TEXT` |  |  | `NULL` |
| `notes` | `TEXT` |  |  | `NULL` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |

### `agentsam_usage_events`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'ue_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `'ws_inneranimalmedia'` |
| `user_id` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `agent_name` | `TEXT` |  | ✓ | `'agent-sam'` |
| `provider` | `TEXT` |  | ✓ | `` |
| `model` | `TEXT` |  | ✓ | `` |
| `tokens_in` | `INTEGER` |  | ✓ | `0` |
| `tokens_out` | `INTEGER` |  | ✓ | `0` |
| `cost_usd` | `REAL` |  | ✓ | `0` |
| `status` | `TEXT` |  | ✓ | `'ok'` |
| `tool_name` | `TEXT` |  |  | `` |
| `reason` | `TEXT` |  |  | `` |
| `ref_table` | `TEXT` |  |  | `` |
| `ref_id` | `TEXT` |  |  | `` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `ai_model_id` | `TEXT` |  |  | `` |
| `routing_arm_id` | `TEXT` |  |  | `` |
| `event_type` | `TEXT` |  |  | `` |
| `model_key` | `TEXT` |  |  | `` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `total_tokens` | `INTEGER` |  |  | `` |

**Indexes:** `idx_usage_events_workspace_tenant`, `idx_usage_events_model`, `idx_aue_workspace`, `idx_aue_tenant_date`

### `agentsam_usage_rollups_daily`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `tenant_id` | `TEXT` | ✓ | ✓ | `` |
| `workspace_id` | `TEXT` | ✓ | ✓ | `` |
| `day` | `TEXT` | ✓ | ✓ | `` |
| `ai_calls` | `INTEGER` |  | ✓ | `0` |
| `tokens_in` | `INTEGER` |  | ✓ | `0` |
| `tokens_out` | `INTEGER` |  | ✓ | `0` |
| `cost_usd` | `REAL` |  | ✓ | `0` |
| `tool_calls` | `INTEGER` |  | ✓ | `0` |
| `tool_successes` | `INTEGER` |  | ✓ | `0` |
| `tool_failures` | `INTEGER` |  | ✓ | `0` |
| `mcp_calls` | `INTEGER` |  | ✓ | `0` |
| `deployments` | `INTEGER` |  | ✓ | `0` |
| `webhook_events` | `INTEGER` |  | ✓ | `0` |
| `blocked_count` | `INTEGER` |  | ✓ | `0` |
| `error_count` | `INTEGER` |  | ✓ | `0` |
| `provider_breakdown_json` | `TEXT` |  |  | `'{}'` |
| `top_tools_json` | `TEXT` |  |  | `'[]'` |
| `rollup_source` | `TEXT` |  | ✓ | `'daily_cron'` |
| `rolled_up_at` | `INTEGER` |  | ✓ | `unixepoch()` |

### `agentsam_user_feature_override`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `user_id` | `TEXT` | ✓ | ✓ | `` |
| `flag_key` | `TEXT` | ✓ | ✓ | `` |
| `enabled` | `INTEGER` |  | ✓ | `` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |

### `agentsam_user_policy`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `user_id` | `TEXT` | ✓ | ✓ | `` |
| `workspace_id` | `TEXT` | ✓ | ✓ | `''` |
| `auto_run_mode` | `TEXT` |  | ✓ | `'allowlist'` |
| `browser_protection` | `INTEGER` |  | ✓ | `0` |
| `mcp_tools_protection` | `INTEGER` |  | ✓ | `1` |
| `file_deletion_protection` | `INTEGER` |  | ✓ | `1` |
| `external_file_protection` | `INTEGER` |  | ✓ | `1` |
| `default_agent_location` | `TEXT` |  |  | `'pane'` |
| `text_size` | `TEXT` |  |  | `'default'` |
| `auto_clear_chat` | `INTEGER` |  | ✓ | `0` |
| `submit_with_mod_enter` | `INTEGER` |  | ✓ | `0` |
| `max_tab_count` | `INTEGER` |  | ✓ | `5` |
| `queue_messages_mode` | `TEXT` |  |  | `'after_current'` |
| `usage_summary_mode` | `TEXT` |  |  | `'auto'` |
| `agent_autocomplete` | `INTEGER` |  | ✓ | `1` |
| `web_search_enabled` | `INTEGER` |  | ✓ | `1` |
| `auto_accept_web_search` | `INTEGER` |  | ✓ | `0` |
| `web_fetch_enabled` | `INTEGER` |  | ✓ | `1` |
| `hierarchical_ignore` | `INTEGER` |  | ✓ | `0` |
| `ignore_symlinks` | `INTEGER` |  | ✓ | `0` |
| `inline_diffs` | `INTEGER` |  | ✓ | `1` |
| `jump_next_diff_on_accept` | `INTEGER` |  | ✓ | `1` |
| `auto_format_on_agent_finish` | `INTEGER` |  | ✓ | `0` |
| `legacy_terminal_tool` | `INTEGER` |  | ✓ | `1` |
| `toolbar_on_selection` | `INTEGER` |  | ✓ | `1` |
| `auto_parse_links` | `INTEGER` |  | ✓ | `0` |
| `themed_diff_backgrounds` | `INTEGER` |  | ✓ | `1` |
| `terminal_hint` | `INTEGER` |  | ✓ | `1` |
| `terminal_preview_box` | `INTEGER` |  | ✓ | `1` |
| `collapse_auto_run_commands` | `INTEGER` |  | ✓ | `1` |
| `voice_submit_keyword` | `TEXT` |  |  | `'submit'` |
| `commit_attribution` | `INTEGER` |  | ✓ | `1` |
| `pr_attribution` | `INTEGER` |  | ✓ | `1` |
| `settings_json` | `TEXT` |  |  | `` |
| `updated_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `person_uuid` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  |  | `''` |
| `superadmin_uuid` | `TEXT` |  |  | `` |
| `max_cost_per_session_usd` | `REAL` |  |  | `NULL` |
| `max_cost_per_call_usd` | `REAL` |  |  | `NULL` |
| `allowed_model_tier_max` | `INTEGER` |  |  | `4` |
| `tool_risk_level_max` | `TEXT` |  |  | `'high'` |
| `require_allowlist_for_mcp` | `INTEGER` |  |  | `1` |
| `allow_subagent_spawn` | `INTEGER` |  |  | `0` |
| `max_spawn_depth` | `INTEGER` |  |  | `1` |
| `max_tool_chain_depth` | `INTEGER` |  |  | `8` |

**Indexes:** `idx_agentsam_user_policy_user`

### `agentsam_webhook_events`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'whe_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_sam_primeaux'` |
| `provider` | `TEXT` |  | ✓ | `` |
| `event_type` | `TEXT` |  | ✓ | `` |
| `event_id` | `TEXT` |  |  | `` |
| `payload_json` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  |  | `'received'` |
| `response_id` | `TEXT` |  |  | `` |
| `model_key` | `TEXT` |  |  | `` |
| `input_tokens` | `INTEGER` |  |  | `0` |
| `output_tokens` | `INTEGER` |  |  | `0` |
| `cost_usd` | `REAL` |  |  | `0` |
| `error_message` | `TEXT` |  |  | `` |
| `processed_at` | `TEXT` |  |  | `` |
| `received_at` | `TEXT` |  | ✓ | `datetime('now')` |
| `endpoint_id` | `TEXT` |  |  | `` |
| `source` | `TEXT` |  |  | `` |
| `repo_full_name` | `TEXT` |  |  | `` |
| `branch` | `TEXT` |  |  | `` |
| `commit_sha` | `TEXT` |  |  | `` |
| `commit_message` | `TEXT` |  |  | `` |
| `actor` | `TEXT` |  |  | `` |
| `author_username` | `TEXT` |  |  | `` |
| `author_email` | `TEXT` |  |  | `` |
| `headers_json` | `TEXT` |  |  | `` |
| `signature_valid` | `INTEGER` |  |  | `1` |
| `ip_address` | `TEXT` |  |  | `` |
| `processing_error` | `TEXT` |  |  | `` |

### `agentsam_webhook_weekly`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'whw_' || lower(hex(randomblob(8)))` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `'__tenant__'` |
| `week_start` | `TEXT` |  | ✓ | `` |
| `week_end` | `TEXT` |  | ✓ | `` |
| `provider` | `TEXT` |  | ✓ | `` |
| `total_received` | `INTEGER` |  | ✓ | `0` |
| `total_processed` | `INTEGER` |  | ✓ | `0` |
| `total_failed` | `INTEGER` |  | ✓ | `0` |
| `total_cost_usd` | `REAL` |  |  | `0` |
| `top_event_types` | `TEXT` |  |  | `'{}'` |
| `top_repos` | `TEXT` |  |  | `'{}'` |
| `notes` | `TEXT` |  |  | `` |
| `rolled_up_at` | `TEXT` |  | ✓ | `datetime('now')` |

**Indexes:** `idx_agentsam_webhook_weekly_rolled_up`, `idx_agentsam_webhook_weekly_scope`

### `agentsam_workflow_runs`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'wrun_' || lower(hex(randomblob(8)))` |
| `workflow_id` | `TEXT` |  | ✓ | `` |
| `workflow_key` | `TEXT` |  |  | `` |
| `display_name` | `TEXT` |  |  | `` |
| `tenant_id` | `TEXT` |  | ✓ | `` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `project_id` | `TEXT` |  |  | `` |
| `user_id` | `TEXT` |  |  | `` |
| `d1_auth_user_id` | `TEXT` |  |  | `` |
| `user_email` | `TEXT` |  |  | `` |
| `session_id` | `TEXT` |  |  | `` |
| `run_group_id` | `TEXT` |  |  | `` |
| `trigger_type` | `TEXT` |  | ✓ | `'manual'` |
| `status` | `TEXT` |  | ✓ | `'running'` |
| `input_json` | `TEXT` |  | ✓ | `'{}'` |
| `output_json` | `TEXT` |  | ✓ | `'{}'` |
| `step_results_json` | `TEXT` |  | ✓ | `'[]'` |
| `steps_completed` | `INTEGER` |  | ✓ | `0` |
| `steps_total` | `INTEGER` |  | ✓ | `0` |
| `error_message` | `TEXT` |  |  | `` |
| `model_used` | `TEXT` |  |  | `` |
| `input_tokens` | `INTEGER` |  | ✓ | `0` |
| `output_tokens` | `INTEGER` |  | ✓ | `0` |
| `cost_usd` | `REAL` |  | ✓ | `0` |
| `duration_ms` | `INTEGER` |  |  | `` |
| `parent_run_id` | `TEXT` |  |  | `NULL` |
| `retry_of_run_id` | `TEXT` |  |  | `NULL` |
| `approval_id` | `TEXT` |  |  | `NULL` |
| `retry_count` | `INTEGER` |  | ✓ | `0` |
| `environment` | `TEXT` |  | ✓ | `'production'` |
| `git_commit_sha` | `TEXT` |  |  | `` |
| `git_branch` | `TEXT` |  |  | `'main'` |
| `supabase_run_id` | `TEXT` |  |  | `` |
| `supabase_sync_status` | `TEXT` |  | ✓ | `'pending'` |
| `supabase_synced_at` | `TEXT` |  |  | `` |
| `supabase_sync_error` | `TEXT` |  |  | `` |
| `supabase_sync_attempts` | `INTEGER` |  | ✓ | `0` |
| `metadata_json` | `TEXT` |  | ✓ | `'{}'` |
| `started_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `completed_at` | `INTEGER` |  |  | `` |
| `created_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |
| `updated_at` | `TEXT` |  | ✓ | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |

**Indexes:** `idx_agentsam_workflow_runs_supabase_sync`, `idx_agentsam_workflow_runs_user`, `idx_agentsam_workflow_runs_run_group`, `idx_agentsam_workflow_runs_workflow`, `idx_agentsam_workflow_runs_scope_status`

### `agentsam_workspace`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `` |
| `workspace_slug` | `TEXT` |  | ✓ | `` |
| `tenant_id` | `TEXT` |  | ✓ | `'tenant_inneranimalmedia'` |
| `project_id` | `TEXT` |  |  | `` |
| `project_slug` | `TEXT` |  |  | `` |
| `name` | `TEXT` |  | ✓ | `` |
| `description` | `TEXT` |  |  | `` |
| `root_path` | `TEXT` |  |  | `` |
| `r2_bucket` | `TEXT` |  |  | `` |
| `status` | `TEXT` |  | ✓ | `'active'` |
| `metadata_json` | `TEXT` |  |  | `'{}'` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `r2_prefix` | `TEXT` |  |  | `` |
| `github_repo` | `TEXT` |  |  | `` |
| `default_model_id` | `TEXT` |  |  | `` |
| `primary_subagent_id` | `TEXT` |  |  | `` |
| `display_name` | `TEXT` |  |  | `` |

**Indexes:** `idx_agentsam_workspace_slug`

### `agentsam_workspace_state`

| Column | Type | PK | NOT NULL | Default |
|--------|------|----|----------|---------|
| `id` | `TEXT` | ✓ |  | `'wss_' || lower(hex(randomblob(8)))` |
| `workspace_id` | `TEXT` |  | ✓ | `` |
| `conversation_id` | `TEXT` |  |  | `` |
| `workspace_type` | `TEXT` |  | ✓ | `'ide'` |
| `active_file` | `TEXT` |  |  | `` |
| `files_open` | `TEXT` |  | ✓ | `'[]'` |
| `state_json` | `TEXT` |  | ✓ | `'{}'` |
| `locked_by` | `TEXT` |  |  | `` |
| `lock_expires_at` | `INTEGER` |  |  | `` |
| `lock_reason` | `TEXT` |  |  | `` |
| `agent_session_id` | `TEXT` |  |  | `` |
| `current_task_id` | `TEXT` |  |  | `` |
| `last_agent_action` | `TEXT` |  |  | `` |
| `created_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `updated_at` | `INTEGER` |  | ✓ | `unixepoch()` |
| `agent_id` | `TEXT` |  |  | `` |
| `checkpoint_label` | `TEXT` |  |  | `` |
| `checkpoint_sha` | `TEXT` |  |  | `` |

**Indexes:** `uidx_agentsam_workspace_state_workspace`, `idx_agentsam_workspace_state_conv`, `idx_agentsam_workspace_state_ws`
