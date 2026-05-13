# Timestamp Audit — agentsam_* + cms_*
Generated: 2026-05-13T21:25:28 UTC | 113 tables

## Storage Format Distribution

| Format | Tables | Correct for D1? |
|--------|--------|----------------|
| `TEXT_SQLITE` | 49 | ⚠️ Slower — use strftime('%s',col) for range queries |
| `INTEGER_UNIX_10` | 38 | ✅ Yes — fastest, correct for range queries |
| `TEXT_ISO8601` | 9 | ⚠️ Slower — use strftime('%s',col) for range queries |

**Recommended standard:** `INTEGER` storing `unixepoch()` — fastest D1 comparisons, no parsing, correct `WHERE ts > X` syntax.

---

## Issues Found

### ⚠️ Mixed Formats (10 tables)
These tables have different timestamp formats across columns — range queries comparing them will silently produce wrong results.

- `agentsam_agent_run`: {'TEXT_SQLITE', 'TEXT_ISO8601'}
- `agentsam_analytics`: {'TEXT_DATE_ONLY', 'INTEGER_UNIX_10'}
- `agentsam_bootstrap`: {'TEXT_SQLITE', 'TEXT_ISO8601'}
- `agentsam_execution_performance_metrics`: {'TEXT_DATE_ONLY', 'INTEGER_UNIX_10'}
- `agentsam_execution_steps`: {'TEXT_SQLITE', 'INTEGER_UNIX_10'}
- `agentsam_hook_execution`: {'TEXT_SQLITE', 'INTEGER_UNIX_10'}
- `agentsam_mcp_tools`: {'TEXT_SQLITE', 'INTEGER_UNIX_10'}
- `agentsam_model_routing_memory`: {'TEXT_SQLITE', 'INTEGER_UNIX_10', 'TEXT_ISO8601'}
- `agentsam_workflow_runs`: {'INTEGER_UNIX_10', 'TEXT_ISO8601', 'TEXT_SQLITE'}
- `cms_site_pages`: {'TEXT_SQLITE', 'TEXT_ISO8601'}

### 🔴 Type Mismatches (1 tables)
SQLite declared type doesn't match actual stored value.

- `agentsam_model_routing_memory`: updated_at: declared text, value is unix int

### ⚪ Missing created_at (19 tables)
These tables have data but no `created_at` column — impossible to do time-range analytics.

- `agentsam_analytics`
- `agentsam_code_index_job`
- `agentsam_deployment_health`
- `agentsam_eval_runs`
- `agentsam_execution_performance_metrics`
- `agentsam_health_daily`
- `agentsam_model_drift_signals`
- `agentsam_prompt_cache_keys`
- `agentsam_route_requirements`
- `agentsam_routing_arms`
- `agentsam_task_slos`
- `agentsam_tool_chain`
- `agentsam_tool_stats_compacted`
- `agentsam_tools_input_schema_backup`
- `agentsam_usage_rollups_daily`
- `agentsam_user_policy`
- `agentsam_webhook_events`
- `agentsam_webhook_weekly`
- `cms_content`

---

## Canonical Timestamp Column Map

Use this in audit scripts and API handlers for correct time queries.

| Table | Primary TS Col | Format | Safe SQLite Expr |
|-------|---------------|--------|-----------------|
| `agentsam_agent_run` | `created_at` | `TEXT_ISO8601` | `strftime('%s', created_at)` |
| `agentsam_ai` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_analytics` | `computed_at` | `INTEGER_UNIX_10` | `computed_at` |
| `agentsam_artifact_skills` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_artifacts` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_bootstrap` | `created_at` | `TEXT_ISO8601` | `strftime('%s', created_at)` |
| `agentsam_browser_trusted_origin` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_cad_jobs` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_capability_aliases` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_code_index_job` | `updated_at` | `TEXT_ISO8601` | `strftime('%s', updated_at)` |
| `agentsam_command_allowlist` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_command_pattern` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_command_run` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_commands` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_context_digest` | `created_at` | `TEXT_ISO8601` | `strftime('%s', created_at)` |
| `agentsam_cron_runs` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_deployment_health` | `checked_at` | `TEXT_SQLITE` | `strftime('%s', checked_at)` |
| `agentsam_error_log` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_escalation` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_eval_cases` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_eval_runs` | `run_at` | `TEXT_SQLITE` | `strftime('%s', run_at)` |
| `agentsam_eval_suites` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_execution_context` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_execution_dependency_graph` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_execution_performance_metrics` | `last_seen_at` | `INTEGER_UNIX_10` | `last_seen_at` |
| `agentsam_execution_steps` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_executions` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_executions_backup_20260509_014549` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_feature_flag` | `updated_at` | `TEXT_SQLITE` | `strftime('%s', updated_at)` |
| `agentsam_fetch_domain_allowlist` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_guardrail_rulesets` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_guardrails` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_health_daily` | `rolled_up_at` | `TEXT_SQLITE` | `strftime('%s', rolled_up_at)` |
| `agentsam_hook` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_hook_execution` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_ignore_pattern` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_mcp_allowlist` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_mcp_servers` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_mcp_tool_execution` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_mcp_tools` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_mcp_workflows` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_memory` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_model_catalog` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_model_drift_signals` | `detected_at` | `INTEGER_UNIX_10` | `detected_at` |
| `agentsam_model_routing_memory` | `created_at` | `TEXT_ISO8601` | `strftime('%s', created_at)` |
| `agentsam_model_tier` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_plan_tasks` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_plans` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_project_context` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_prompt_cache_keys` | `first_written_at` | `TEXT_SQLITE` | `strftime('%s', first_written_at)` |
| `agentsam_prompt_routes` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_prompt_versions` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_routing_arms` | `updated_at` | `INTEGER_UNIX_10` | `updated_at` |
| `agentsam_rules_document` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_script_runs` | `created_at` | `TEXT_ISO8601` | `strftime('%s', created_at)` |
| `agentsam_scripts` | `created_at` | `TEXT_ISO8601` | `strftime('%s', created_at)` |
| `agentsam_skill` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_slash_commands` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_subagent_profile` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_subscription_registry` | `created_at` | `TEXT_ISO8601` | `strftime('%s', created_at)` |
| `agentsam_task_slos` | `updated_at` | `INTEGER_UNIX_10` | `updated_at` |
| `agentsam_todo` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_tool_cache` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_tool_call_log` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_tool_chain` | `started_at` | `INTEGER_UNIX_10` | `started_at` |
| `agentsam_tool_stats_compacted` | `last_seen_at` | `INTEGER_UNIX_10` | `last_seen_at` |
| `agentsam_tools` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_tools_input_schema_backup` | `backed_up_at` | `INTEGER_UNIX_10` | `backed_up_at` |
| `agentsam_usage_events` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_usage_rollups_daily` | `rolled_up_at` | `INTEGER_UNIX_10` | `rolled_up_at` |
| `agentsam_user_policy` | `updated_at` | `TEXT_SQLITE` | `strftime('%s', updated_at)` |
| `agentsam_webhook_events` | `processed_at` | `TEXT_SQLITE` | `strftime('%s', processed_at)` |
| `agentsam_webhook_weekly` | `rolled_up_at` | `TEXT_SQLITE` | `strftime('%s', rolled_up_at)` |
| `agentsam_workflow_edges` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_workflow_nodes` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_workflow_runs` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_workflows` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `agentsam_workspace` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `agentsam_workspace_state` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `cms_3d_assets` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `cms_activity_log` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `cms_assets` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_collections` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `cms_component_templates` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_content` | `updated_at` | `TEXT_ISO8601` | `strftime('%s', updated_at)` |
| `cms_folders` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `cms_global_settings` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_navigation_menus` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_page_sections` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_pages` | `created_at` | `INTEGER_UNIX_10` | `created_at` |
| `cms_section_components` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_site_pages` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_tenants` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_theme_preferences` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_themes` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |
| `cms_video_projects` | `created_at` | `TEXT_SQLITE` | `strftime('%s', created_at)` |

---

## Standardization Migration SQL

Add `created_at INTEGER DEFAULT (unixepoch())` to tables missing it.

**Review each before running** — SQLite ALTER TABLE cannot modify existing columns.

```sql
ALTER TABLE agentsam_analytics ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_code_index_job ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_deployment_health ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_eval_runs ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_execution_performance_metrics ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_health_daily ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_model_drift_signals ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_prompt_cache_keys ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_route_requirements ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_routing_arms ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_task_slos ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_tool_chain ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_tool_stats_compacted ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_tools_input_schema_backup ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
ALTER TABLE agentsam_usage_rollups_daily ADD COLUMN created_at INTEGER DEFAULT (unixepoch());
```

### Text → Integer timestamp notes
These tables store timestamps as TEXT. Backfilling to INTEGER requires a new column + data migration:

```sql
-- agentsam_agent_run.started_at is TEXT 'TEXT_SQLITE' — to standardize:
ALTER TABLE agentsam_agent_run ADD COLUMN started_at_unix INTEGER;
UPDATE agentsam_agent_run SET started_at_unix = strftime('%s', started_at) WHERE started_at IS NOT NULL;
-- After verifying: drop started_at, rename started_at_unix to started_at

-- agentsam_agent_run.completed_at is TEXT 'TEXT_SQLITE' — to standardize:
ALTER TABLE agentsam_agent_run ADD COLUMN completed_at_unix INTEGER;
UPDATE agentsam_agent_run SET completed_at_unix = strftime('%s', completed_at) WHERE completed_at IS NOT NULL;
-- After verifying: drop completed_at, rename completed_at_unix to completed_at

-- agentsam_agent_run.created_at is TEXT 'TEXT_ISO8601' — to standardize:
ALTER TABLE agentsam_agent_run ADD COLUMN created_at_unix INTEGER;
UPDATE agentsam_agent_run SET created_at_unix = strftime('%s', created_at) WHERE created_at IS NOT NULL;
-- After verifying: drop created_at, rename created_at_unix to created_at

-- agentsam_bootstrap.last_bootstrapped_at is TEXT 'TEXT_ISO8601' — to standardize:
ALTER TABLE agentsam_bootstrap ADD COLUMN last_bootstrapped_at_unix INTEGER;
UPDATE agentsam_bootstrap SET last_bootstrapped_at_unix = strftime('%s', last_bootstrapped_at) WHERE last_bootstrapped_at IS NOT NULL;
-- After verifying: drop last_bootstrapped_at, rename last_bootstrapped_at_unix to last_bootstrapped_at

-- agentsam_bootstrap.last_validated_at is TEXT 'TEXT_ISO8601' — to standardize:
ALTER TABLE agentsam_bootstrap ADD COLUMN last_validated_at_unix INTEGER;
UPDATE agentsam_bootstrap SET last_validated_at_unix = strftime('%s', last_validated_at) WHERE last_validated_at IS NOT NULL;
-- After verifying: drop last_validated_at, rename last_validated_at_unix to last_validated_at

-- agentsam_bootstrap.expires_at is TEXT 'TEXT_SQLITE' — to standardize:
ALTER TABLE agentsam_bootstrap ADD COLUMN expires_at_unix INTEGER;
UPDATE agentsam_bootstrap SET expires_at_unix = strftime('%s', expires_at) WHERE expires_at IS NOT NULL;
-- After verifying: drop expires_at, rename expires_at_unix to expires_at

-- agentsam_bootstrap.created_at is TEXT 'TEXT_ISO8601' — to standardize:
ALTER TABLE agentsam_bootstrap ADD COLUMN created_at_unix INTEGER;
UPDATE agentsam_bootstrap SET created_at_unix = strftime('%s', created_at) WHERE created_at IS NOT NULL;
-- After verifying: drop created_at, rename created_at_unix to created_at

-- agentsam_bootstrap.updated_at is TEXT 'TEXT_ISO8601' — to standardize:
ALTER TABLE agentsam_bootstrap ADD COLUMN updated_at_unix INTEGER;
UPDATE agentsam_bootstrap SET updated_at_unix = strftime('%s', updated_at) WHERE updated_at IS NOT NULL;
-- After verifying: drop updated_at, rename updated_at_unix to updated_at

-- agentsam_browser_trusted_origin.created_at is TEXT 'TEXT_SQLITE' — to standardize:
ALTER TABLE agentsam_browser_trusted_origin ADD COLUMN created_at_unix INTEGER;
UPDATE agentsam_browser_trusted_origin SET created_at_unix = strftime('%s', created_at) WHERE created_at IS NOT NULL;
-- After verifying: drop created_at, rename created_at_unix to created_at

-- agentsam_browser_trusted_origin.updated_at is TEXT 'TEXT_SQLITE' — to standardize:
ALTER TABLE agentsam_browser_trusted_origin ADD COLUMN updated_at_unix INTEGER;
UPDATE agentsam_browser_trusted_origin SET updated_at_unix = strftime('%s', updated_at) WHERE updated_at IS NOT NULL;
-- After verifying: drop updated_at, rename updated_at_unix to updated_at

```

---

## Python Audit Script Patch

Replace the `TIMESTAMP_COLS` set and add `TS_OVERRIDE` in `analytics_ui_audit.py`:

```python
# Canonical timestamp column overrides (from timestamp_audit.py)
TS_OVERRIDE = {
    "agentsam_analytics": "computed_at",
    "agentsam_deployment_health": "checked_at",
    "agentsam_eval_runs": "run_at",
    "agentsam_execution_performance_metrics": "last_seen_at",
    "agentsam_health_daily": "rolled_up_at",
    "agentsam_model_drift_signals": "detected_at",
    "agentsam_prompt_cache_keys": "first_written_at",
    "agentsam_tool_chain": "started_at",
    "agentsam_tool_stats_compacted": "last_seen_at",
    "agentsam_tools_input_schema_backup": "backed_up_at",
    "agentsam_usage_rollups_daily": "rolled_up_at",
    "agentsam_webhook_events": "processed_at",
    "agentsam_webhook_weekly": "rolled_up_at",
}

# In d1_count_and_fresh(), use:
# ts_col = TS_OVERRIDE.get(table, ts_col)  # before the MAX() query
```

---
*Run `scripts/timestamp_audit.py` to refresh.*