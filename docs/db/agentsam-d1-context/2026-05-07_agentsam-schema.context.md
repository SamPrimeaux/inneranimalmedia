---
doc_type: d1_schema_context
scope: agentsam-platform
database: inneranimalmedia-business
generated_at: 2026-05-07T05:17:18.222090+00:00
date: 2026-05-07
consumer: cursor
autorag_ready: true
tags:
  - d1
  - schema
  - agentsam
  - agent-sam
  - platform
---

# Agent Sam D1 Schema Context

## Purpose

This file is the source of truth for `agentsam_*` D1 tables. Use it before writing SQL for `/api/agent`, `/api/mcp`, `/api/settings`, `/api/dashboard`, hooks, evals, workflows, tools, scripts, model routing, analytics, and Agent Sam runtime features.

## Cursor rules

- Do not invent columns.
- Do not add migrations to satisfy guessed queries unless explicitly approved.
- Patch API queries to match the real schema.
- Keep `agentsam_*` as the active namespace unless a specific legacy table is intentionally required.
- Use this file to reduce repeated D1 schema lookups and token cost.

## Table index

- `agentsam_agent_run` — group: `execution` — rows: `312` — tags: `agentsam, d1, execution, schema`
- `agentsam_ai` — group: `models-routing-evals` — rows: `112` — tags: `agentsam, d1, models-routing-evals, schema`
- `agentsam_analytics` — group: `observability-analytics` — rows: `3` — tags: `agentsam, analytics, d1, observability-analytics, schema`
- `agentsam_approval_queue` — group: `security-governance` — rows: `2` — tags: `agentsam, approval, d1, schema, security-governance`
- `agentsam_artifacts` — group: `other` — rows: `3` — tags: `agentsam, d1, other, schema`
- `agentsam_bootstrap` — group: `workspace-projects` — rows: `12` — tags: `agentsam, d1, schema, workspace-projects`
- `agentsam_browser_trusted_origin` — group: `security-governance` — rows: `10` — tags: `agentsam, d1, schema, security-governance`
- `agentsam_cad_jobs` — group: `settings-jobs` — rows: `2` — tags: `agentsam, d1, schema, settings-jobs`
- `agentsam_code_index_job` — group: `settings-jobs` — rows: `8` — tags: `agentsam, d1, schema, settings-jobs`
- `agentsam_command_allowlist` — group: `commands` — rows: `155` — tags: `agentsam, command, commands, d1, schema`
- `agentsam_command_pattern` — group: `commands` — rows: `10` — tags: `agentsam, command, commands, d1, schema`
- `agentsam_command_run` — group: `execution` — rows: `69` — tags: `agentsam, command, d1, execution, schema`
- `agentsam_commands` — group: `commands` — rows: `372` — tags: `agentsam, command, commands, d1, schema`
- `agentsam_compaction_events` — group: `execution` — rows: `0` — tags: `agentsam, d1, execution, schema`
- `agentsam_cron_runs` — group: `execution` — rows: `156` — tags: `agentsam, cron, d1, execution, schema`
- `agentsam_deployment_health` — group: `observability-analytics` — rows: `7` — tags: `agentsam, d1, health, observability-analytics, schema`
- `agentsam_error_log` — group: `observability-analytics` — rows: `1` — tags: `agentsam, d1, error, observability-analytics, schema`
- `agentsam_escalation` — group: `execution` — rows: `0` — tags: `agentsam, d1, execution, schema`
- `agentsam_eval_cases` — group: `models-routing-evals` — rows: `12` — tags: `agentsam, d1, eval, models-routing-evals, schema`
- `agentsam_eval_runs` — group: `execution` — rows: `12` — tags: `agentsam, d1, eval, execution, schema`
- `agentsam_eval_suites` — group: `models-routing-evals` — rows: `8` — tags: `agentsam, d1, eval, models-routing-evals, schema`
- `agentsam_execution_context` — group: `execution` — rows: `59` — tags: `agentsam, d1, execution, schema`
- `agentsam_executions` — group: `execution` — rows: `12` — tags: `agentsam, d1, execution, schema`
- `agentsam_feature_flag` — group: `settings-jobs` — rows: `13` — tags: `agentsam, d1, feature, schema, settings-jobs`
- `agentsam_fetch_domain_allowlist` — group: `models-routing-evals` — rows: `18` — tags: `agentsam, d1, models-routing-evals, schema`
- `agentsam_guardrail_events` — group: `models-routing-evals` — rows: `0` — tags: `agentsam, d1, guardrail, models-routing-evals, schema`
- `agentsam_guardrail_rulesets` — group: `models-routing-evals` — rows: `2` — tags: `agentsam, d1, guardrail, models-routing-evals, schema`
- `agentsam_guardrails` — group: `models-routing-evals` — rows: `13` — tags: `agentsam, d1, guardrail, models-routing-evals, schema`
- `agentsam_health_daily` — group: `models-routing-evals` — rows: `3` — tags: `agentsam, d1, health, models-routing-evals, schema`
- `agentsam_hook` — group: `hooks-webhooks` — rows: `14` — tags: `agentsam, d1, hook, hooks-webhooks, schema`
- `agentsam_hook_execution` — group: `execution` — rows: `78` — tags: `agentsam, d1, execution, hook, schema`
- `agentsam_ignore_pattern` — group: `memory-skills-rules` — rows: `10` — tags: `agentsam, d1, memory-skills-rules, schema`
- `agentsam_mcp_allowlist` — group: `mcp-tools` — rows: `412` — tags: `agentsam, d1, mcp, mcp-tools, schema`
- `agentsam_mcp_servers` — group: `mcp-tools` — rows: `3` — tags: `agentsam, d1, mcp, mcp-tools, schema`
- `agentsam_mcp_tool_execution` — group: `execution` — rows: `13` — tags: `agentsam, d1, execution, mcp, schema, tool`
- `agentsam_mcp_tools` — group: `mcp-tools` — rows: `392` — tags: `agentsam, d1, mcp, mcp-tools, schema, tool`
- `agentsam_mcp_workflows` — group: `mcp-tools` — rows: `86` — tags: `agentsam, d1, mcp, mcp-tools, schema, workflow`
- `agentsam_memory` — group: `memory-skills-rules` — rows: `80` — tags: `agentsam, d1, memory, memory-skills-rules, schema`
- `agentsam_model_drift_signals` — group: `models-routing-evals` — rows: `3` — tags: `agentsam, d1, model, models-routing-evals, schema`
- `agentsam_model_tier` — group: `models-routing-evals` — rows: `5` — tags: `agentsam, d1, model, models-routing-evals, schema`
- `agentsam_plan_tasks` — group: `workflows-plans-tasks` — rows: `75` — tags: `agentsam, d1, plan, schema, workflows-plans-tasks`
- `agentsam_plans` — group: `workflows-plans-tasks` — rows: `13` — tags: `agentsam, d1, plan, schema, workflows-plans-tasks`
- `agentsam_project_context` — group: `execution` — rows: `51` — tags: `agentsam, d1, execution, schema`
- `agentsam_prompt_cache_keys` — group: `models-routing-evals` — rows: `0` — tags: `agentsam, d1, models-routing-evals, prompt, schema`
- `agentsam_prompt_versions` — group: `models-routing-evals` — rows: `11` — tags: `agentsam, d1, models-routing-evals, prompt, schema`
- `agentsam_routing_arms` — group: `models-routing-evals` — rows: `57` — tags: `agentsam, d1, models-routing-evals, routing, schema`
- `agentsam_rules_document` — group: `memory-skills-rules` — rows: `4` — tags: `agentsam, d1, memory-skills-rules, schema`
- `agentsam_script_runs` — group: `execution` — rows: `0` — tags: `agentsam, d1, execution, schema, script`
- `agentsam_scripts` — group: `cicd-scripts` — rows: `96` — tags: `agentsam, cicd-scripts, d1, schema, script`
- `agentsam_skill` — group: `memory-skills-rules` — rows: `47` — tags: `agentsam, d1, memory-skills-rules, schema, skill`
- `agentsam_skill_invocation` — group: `memory-skills-rules` — rows: `303` — tags: `agentsam, d1, memory-skills-rules, schema, skill`
- `agentsam_skill_revision` — group: `memory-skills-rules` — rows: `7` — tags: `agentsam, d1, memory-skills-rules, schema, skill`
- `agentsam_slash_commands` — group: `commands` — rows: `22` — tags: `agentsam, command, commands, d1, schema`
- `agentsam_subagent_profile` — group: `workspace-projects` — rows: `41` — tags: `agentsam, d1, schema, workspace-projects`
- `agentsam_subscription_registry` — group: `settings-jobs` — rows: `16` — tags: `agentsam, d1, schema, script, settings-jobs`
- `agentsam_task_slos` — group: `observability-analytics` — rows: `3` — tags: `agentsam, d1, observability-analytics, schema`
- `agentsam_todo` — group: `workflows-plans-tasks` — rows: `75` — tags: `agentsam, d1, schema, todo, workflows-plans-tasks`
- `agentsam_tool_call_log` — group: `mcp-tools` — rows: `18` — tags: `agentsam, d1, mcp-tools, schema, tool`
- `agentsam_tool_chain` — group: `execution` — rows: `19` — tags: `agentsam, d1, execution, schema, tool`
- `agentsam_tool_stats_compacted` — group: `mcp-tools` — rows: `74` — tags: `agentsam, d1, mcp-tools, schema, tool`
- `agentsam_tools` — group: `mcp-tools` — rows: `40` — tags: `agentsam, d1, mcp-tools, schema, tool`
- `agentsam_usage_events` — group: `observability-analytics` — rows: `393` — tags: `agentsam, d1, observability-analytics, schema, usage`
- `agentsam_usage_rollups_daily` — group: `models-routing-evals` — rows: `26` — tags: `agentsam, d1, models-routing-evals, schema, usage`
- `agentsam_user_feature_override` — group: `security-governance` — rows: `0` — tags: `agentsam, d1, feature, schema, security-governance`
- `agentsam_user_policy` — group: `security-governance` — rows: `4` — tags: `agentsam, d1, policy, schema, security-governance`
- `agentsam_webhook_events` — group: `hooks-webhooks` — rows: `1277` — tags: `agentsam, d1, hook, hooks-webhooks, schema, webhook`
- `agentsam_webhook_weekly` — group: `hooks-webhooks` — rows: `1` — tags: `agentsam, d1, hook, hooks-webhooks, schema, webhook`
- `agentsam_workflow_runs` — group: `execution` — rows: `0` — tags: `agentsam, d1, execution, schema, workflow`
- `agentsam_workspace` — group: `workspace-projects` — rows: `24` — tags: `agentsam, d1, schema, workspace, workspace-projects`
- `agentsam_workspace_state` — group: `workspace-projects` — rows: `6` — tags: `agentsam, d1, schema, workspace, workspace-projects`

# CI/CD Scripts and Automation

## Table: `agentsam_scripts`

Meta: `table=agentsam_scripts` `group=cicd-scripts` `rows=96` `tags=agentsam,cicd-scripts,d1,schema,script`

### Purpose

Registry of automation scripts, runners, safety flags, owner-only requirements, and preferred usage.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia', name TEXT NOT NULL, path TEXT NOT NULL, description TEXT NOT NULL, purpose TEXT NOT NULL, runner TEXT NOT NULL DEFAULT 'npm', requires_env INTEGER NOT NULL DEFAULT 1, owner_only INTEGER NOT NULL DEFAULT 1, safe_to_run INTEGER NOT NULL DEFAULT 1, run_before TEXT, run_after TEXT, never_run_with TEXT, preferred_for TEXT, notes TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `'ws_inneranimalmedia'` | 0 |
| 2 | `name` | `TEXT` | 1 | `None` | 0 |
| 3 | `path` | `TEXT` | 1 | `None` | 0 |
| 4 | `description` | `TEXT` | 1 | `None` | 0 |
| 5 | `purpose` | `TEXT` | 1 | `None` | 0 |
| 6 | `runner` | `TEXT` | 1 | `'npm'` | 0 |
| 7 | `requires_env` | `INTEGER` | 1 | `1` | 0 |
| 8 | `owner_only` | `INTEGER` | 1 | `1` | 0 |
| 9 | `safe_to_run` | `INTEGER` | 1 | `1` | 0 |
| 10 | `run_before` | `TEXT` | 0 | `None` | 0 |
| 11 | `run_after` | `TEXT` | 0 | `None` | 0 |
| 12 | `never_run_with` | `TEXT` | 0 | `None` | 0 |
| 13 | `preferred_for` | `TEXT` | 0 | `None` | 0 |
| 14 | `notes` | `TEXT` | 0 | `None` | 0 |
| 15 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 16 | `created_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |
| 17 | `updated_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_scripts_workspace_path` | 0 | `c` | 0 | `workspace_id, path` |
| `sqlite_autoindex_agentsam_scripts_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_scripts (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  name            TEXT NOT NULL,
  path            TEXT NOT NULL,
  description     TEXT NOT NULL,
  purpose         TEXT NOT NULL CHECK(purpose IN ('deploy','build','test','ingest','benchmark','maintenance','dev','dangerous','audit')),
  runner          TEXT NOT NULL DEFAULT 'npm' CHECK(runner IN ('npm','bash','node','python','sql','wrangler')),
  requires_env    INTEGER NOT NULL DEFAULT 1,
  owner_only      INTEGER NOT NULL DEFAULT 1,
  safe_to_run     INTEGER NOT NULL DEFAULT 1,
  run_before      TEXT,
  run_after       TEXT,
  never_run_with  TEXT,
  preferred_for   TEXT,
  notes           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)
```

# Commands and Intent Routing

## Table: `agentsam_command_allowlist`

Meta: `table=agentsam_command_allowlist` `group=commands` `rows=155` `tags=agentsam,command,commands,d1,schema`

### Purpose

agentsam table in the Commands and Intent Routing domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, workspace_id, command, created_at, person_uuid.

### Relationship hints

- `agentsam_command_pattern`
- `agentsam_command_run`
- `agentsam_commands`
- `agentsam_slash_commands`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT '', command TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `''` | 0 |
| 3 | `command` | `TEXT` | 1 | `None` | 0 |
| 4 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 5 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_cmd_allow_user` | 0 | `c` | 0 | `user_id, workspace_id` |
| `sqlite_autoindex_agentsam_command_allowlist_2` | 1 | `u` | 0 | `user_id, workspace_id, command` |
| `sqlite_autoindex_agentsam_command_allowlist_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_command_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  command TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  UNIQUE (user_id, workspace_id, command)
)
```

## Table: `agentsam_command_pattern`

Meta: `table=agentsam_command_pattern` `group=commands` `rows=10` `tags=agentsam,command,commands,d1,schema`

### Purpose

agentsam table in the Commands and Intent Routing domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id, pattern, pattern_type, mapped_command, description, category, risk_level.

### Relationship hints

- `agentsam_command_allowlist`
- `agentsam_command_run`
- `agentsam_commands`
- `agentsam_slash_commands`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'pat_' || lower(hex(randomblob(8))), workspace_id TEXT NOT NULL, pattern TEXT NOT NULL, pattern_type TEXT NOT NULL DEFAULT 'exact', mapped_command TEXT NOT NULL, description TEXT, category TEXT DEFAULT 'misc', risk_level TEXT NOT NULL DEFAULT 'low', requires_confirmation INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, use_count INTEGER NOT NULL DEFAULT 0, last_used_at INTEGER, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'pat_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `pattern` | `TEXT` | 1 | `None` | 0 |
| 3 | `pattern_type` | `TEXT` | 1 | `'exact'` | 0 |
| 4 | `mapped_command` | `TEXT` | 1 | `None` | 0 |
| 5 | `description` | `TEXT` | 0 | `None` | 0 |
| 6 | `category` | `TEXT` | 0 | `'misc'` | 0 |
| 7 | `risk_level` | `TEXT` | 1 | `'low'` | 0 |
| 8 | `requires_confirmation` | `INTEGER` | 1 | `0` | 0 |
| 9 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 10 | `use_count` | `INTEGER` | 1 | `0` | 0 |
| 11 | `last_used_at` | `INTEGER` | 0 | `None` | 0 |
| 12 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 13 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_cmd_pattern_workspace` | 0 | `c` | 0 | `workspace_id, is_active, pattern_type` |
| `sqlite_autoindex_agentsam_command_pattern_2` | 1 | `u` | 0 | `workspace_id, pattern` |
| `sqlite_autoindex_agentsam_command_pattern_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_command_pattern (
  id               TEXT PRIMARY KEY DEFAULT ('pat_' || lower(hex(randomblob(8)))),
  workspace_id     TEXT NOT NULL REFERENCES agentsam_workspace(id) ON DELETE CASCADE,
  pattern          TEXT NOT NULL,
  pattern_type     TEXT NOT NULL DEFAULT 'exact'
    CHECK(pattern_type IN ('exact','prefix','regex','glob')),
  mapped_command   TEXT NOT NULL,
  description      TEXT,
  category         TEXT DEFAULT 'misc'
    CHECK(category IN ('deploy','debug','db','r2','git','worker','misc')),
  risk_level       TEXT NOT NULL DEFAULT 'low'
    CHECK(risk_level IN ('none','low','medium','high','critical')),
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  use_count        INTEGER NOT NULL DEFAULT 0,
  last_used_at     INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, pattern)
)
```

## Table: `agentsam_commands`

Meta: `table=agentsam_commands` `group=commands` `rows=372` `tags=agentsam,command,commands,d1,schema`

### Purpose

Canonical command registry for Agent Sam actions and command routing.

### Relationship hints

- `agentsam_slash_commands`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia', slug TEXT, display_name TEXT NOT NULL, description TEXT, pattern TEXT, pattern_type TEXT DEFAULT 'exact', mapped_command TEXT NOT NULL, command_args TEXT, category TEXT DEFAULT 'misc', subcategory TEXT, risk_level TEXT DEFAULT 'low', requires_confirmation INTEGER DEFAULT 0, show_in_slash INTEGER DEFAULT 1, show_in_allowlist INTEGER DEFAULT 1, show_in_palette INTEGER DEFAULT 1, modes_json TEXT DEFAULT '["agent","auto","debug"]', sort_order INTEGER DEFAULT 50, use_count INTEGER DEFAULT 0, last_used_at TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now'), internal_seo TEXT DEFAULT '', task_type TEXT DEFAULT 'tool_use', timeout_seconds INTEGER DEFAULT 120, estimated_cost_usd REAL DEFAULT 0.0, allowed_models_json TEXT DEFAULT '[]', output_schema TEXT DEFAULT '{}', retry_policy TEXT DEFAULT 'once', requires_approval INTEGER DEFAULT 0, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0, avg_duration_ms REAL DEFAULT 0, router_type TEXT DEFAULT 'tool', tool_key TEXT, workflow_key TEXT, subagent_slug TEXT, server_key TEXT, execution_mode TEXT DEFAULT 'agent'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `'ws_inneranimalmedia'` | 0 |
| 2 | `slug` | `TEXT` | 0 | `None` | 0 |
| 3 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `description` | `TEXT` | 0 | `None` | 0 |
| 5 | `pattern` | `TEXT` | 0 | `None` | 0 |
| 6 | `pattern_type` | `TEXT` | 0 | `'exact'` | 0 |
| 7 | `mapped_command` | `TEXT` | 1 | `None` | 0 |
| 8 | `command_args` | `TEXT` | 0 | `None` | 0 |
| 9 | `category` | `TEXT` | 0 | `'misc'` | 0 |
| 10 | `subcategory` | `TEXT` | 0 | `None` | 0 |
| 11 | `risk_level` | `TEXT` | 0 | `'low'` | 0 |
| 12 | `requires_confirmation` | `INTEGER` | 0 | `0` | 0 |
| 13 | `show_in_slash` | `INTEGER` | 0 | `1` | 0 |
| 14 | `show_in_allowlist` | `INTEGER` | 0 | `1` | 0 |
| 15 | `show_in_palette` | `INTEGER` | 0 | `1` | 0 |
| 16 | `modes_json` | `TEXT` | 0 | `'["agent","auto","debug"]'` | 0 |
| 17 | `sort_order` | `INTEGER` | 0 | `50` | 0 |
| 18 | `use_count` | `INTEGER` | 0 | `0` | 0 |
| 19 | `last_used_at` | `TEXT` | 0 | `None` | 0 |
| 20 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 21 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 22 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 23 | `internal_seo` | `TEXT` | 0 | `''` | 0 |
| 24 | `task_type` | `TEXT` | 0 | `'tool_use'` | 0 |
| 25 | `timeout_seconds` | `INTEGER` | 0 | `120` | 0 |
| 26 | `estimated_cost_usd` | `REAL` | 0 | `0.0` | 0 |
| 27 | `allowed_models_json` | `TEXT` | 0 | `'[]'` | 0 |
| 28 | `output_schema` | `TEXT` | 0 | `'{}'` | 0 |
| 29 | `retry_policy` | `TEXT` | 0 | `'once'` | 0 |
| 30 | `requires_approval` | `INTEGER` | 0 | `0` | 0 |
| 31 | `tenant_id` | `TEXT` | 0 | `'tenant_sam_primeaux'` | 0 |
| 32 | `success_count` | `INTEGER` | 0 | `0` | 0 |
| 33 | `failure_count` | `INTEGER` | 0 | `0` | 0 |
| 34 | `avg_duration_ms` | `REAL` | 0 | `0` | 0 |
| 35 | `router_type` | `TEXT` | 0 | `'tool'` | 0 |
| 36 | `tool_key` | `TEXT` | 0 | `None` | 0 |
| 37 | `workflow_key` | `TEXT` | 0 | `None` | 0 |
| 38 | `subagent_slug` | `TEXT` | 0 | `None` | 0 |
| 39 | `server_key` | `TEXT` | 0 | `None` | 0 |
| 40 | `execution_mode` | `TEXT` | 0 | `'agent'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_commands_slug` | 0 | `c` | 0 | `slug` |
| `idx_agentsam_commands_active` | 0 | `c` | 0 | `is_active` |
| `idx_agentsam_commands_category` | 0 | `c` | 0 | `category` |
| `sqlite_autoindex_agentsam_commands_2` | 1 | `u` | 0 | `slug` |
| `sqlite_autoindex_agentsam_commands_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_commands (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  slug TEXT UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  pattern TEXT,
  pattern_type TEXT DEFAULT 'exact',
  mapped_command TEXT NOT NULL,
  command_args TEXT,
  category TEXT DEFAULT 'misc',
  subcategory TEXT,
  risk_level TEXT DEFAULT 'low',
  requires_confirmation INTEGER DEFAULT 0,
  show_in_slash INTEGER DEFAULT 1,
  show_in_allowlist INTEGER DEFAULT 1,
  show_in_palette INTEGER DEFAULT 1,
  modes_json TEXT DEFAULT '["agent","auto","debug"]',
  sort_order INTEGER DEFAULT 50,
  use_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, internal_seo TEXT DEFAULT '', task_type TEXT DEFAULT 'tool_use', timeout_seconds INTEGER DEFAULT 120, estimated_cost_usd REAL DEFAULT 0.0, allowed_models_json TEXT DEFAULT '[]', output_schema TEXT DEFAULT '{}', retry_policy TEXT DEFAULT 'once', requires_approval INTEGER DEFAULT 0, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0, avg_duration_ms REAL DEFAULT 0, router_type TEXT DEFAULT 'tool', tool_key TEXT, workflow_key TEXT, subagent_slug TEXT, server_key TEXT, execution_mode TEXT DEFAULT 'agent')
```

## Table: `agentsam_slash_commands`

Meta: `table=agentsam_slash_commands` `group=commands` `rows=22` `tags=agentsam,command,commands,d1,schema`

### Purpose

agentsam table in the Commands and Intent Routing domain. Use the actual columns listed here before writing API SQL. Leading columns: id, slug, display_name, description, usage_hint, handler_type, handler_ref, handler_sql.

### Compact columns

```txt
id TEXT PK, slug TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT NOT NULL, usage_hint TEXT, handler_type TEXT NOT NULL, handler_ref TEXT, handler_sql TEXT, args_schema TEXT, modes_json TEXT DEFAULT '["ask","agent","auto","debug","plan"]', risk_level TEXT DEFAULT 'none', requires_confirmation INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 50, call_count INTEGER DEFAULT 0, last_called_at TEXT, created_at TEXT DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `slug` | `TEXT` | 1 | `None` | 0 |
| 2 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 3 | `description` | `TEXT` | 1 | `None` | 0 |
| 4 | `usage_hint` | `TEXT` | 0 | `None` | 0 |
| 5 | `handler_type` | `TEXT` | 1 | `None` | 0 |
| 6 | `handler_ref` | `TEXT` | 0 | `None` | 0 |
| 7 | `handler_sql` | `TEXT` | 0 | `None` | 0 |
| 8 | `args_schema` | `TEXT` | 0 | `None` | 0 |
| 9 | `modes_json` | `TEXT` | 0 | `'["ask","agent","auto","debug","plan"]'` | 0 |
| 10 | `risk_level` | `TEXT` | 0 | `'none'` | 0 |
| 11 | `requires_confirmation` | `INTEGER` | 0 | `0` | 0 |
| 12 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 13 | `sort_order` | `INTEGER` | 0 | `50` | 0 |
| 14 | `call_count` | `INTEGER` | 0 | `0` | 0 |
| 15 | `last_called_at` | `TEXT` | 0 | `None` | 0 |
| 16 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_slash_commands_2` | 1 | `u` | 0 | `slug` |
| `sqlite_autoindex_agentsam_slash_commands_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_slash_commands (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description  TEXT NOT NULL,
  usage_hint   TEXT,
  handler_type TEXT NOT NULL CHECK(handler_type IN ('builtin','db_query','subagent_spawn','tool_invoke','ollama_local')),
  handler_ref  TEXT,
  handler_sql  TEXT,
  args_schema  TEXT,
  modes_json   TEXT DEFAULT '["ask","agent","auto","debug","plan"]',
  risk_level   TEXT DEFAULT 'none' CHECK(risk_level IN ('none','low','high')),
  requires_confirmation INTEGER DEFAULT 0,
  is_active    INTEGER DEFAULT 1,
  sort_order   INTEGER DEFAULT 50,
  call_count   INTEGER DEFAULT 0,
  last_called_at TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
)
```

# Agent Execution

## Table: `agentsam_agent_run`

Meta: `table=agentsam_agent_run` `group=execution` `rows=312` `tags=agentsam,d1,execution,schema`

### Purpose

High-level agent invocation/run record for status, model, cost, token, and workflow tracking.

### Relationship hints

- `agentsam_ai`
- `agentsam_commands`
- `agentsam_subagent_profile`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, workspace_id TEXT, conversation_id TEXT, status TEXT NOT NULL DEFAULT 'queued', trigger TEXT, model_id TEXT, idempotency_key TEXT, error_message TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL, started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT datetime('now'), agent_ai_id TEXT DEFAULT NULL, person_uuid TEXT, agent_id TEXT, ai_model_ref TEXT, routing_arm_id TEXT, chain_root_id TEXT, tenant_id TEXT, work_session_id TEXT, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 30000, command_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `conversation_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `status` | `TEXT` | 1 | `'queued'` | 0 |
| 5 | `trigger` | `TEXT` | 0 | `None` | 0 |
| 6 | `model_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `idempotency_key` | `TEXT` | 0 | `None` | 0 |
| 8 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 9 | `input_tokens` | `INTEGER` | 0 | `None` | 0 |
| 10 | `output_tokens` | `INTEGER` | 0 | `None` | 0 |
| 11 | `cost_usd` | `REAL` | 0 | `None` | 0 |
| 12 | `started_at` | `TEXT` | 0 | `None` | 0 |
| 13 | `completed_at` | `TEXT` | 0 | `None` | 0 |
| 14 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 15 | `agent_ai_id` | `TEXT` | 0 | `NULL` | 0 |
| 16 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 17 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `ai_model_ref` | `TEXT` | 0 | `None` | 0 |
| 19 | `routing_arm_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `chain_root_id` | `TEXT` | 0 | `None` | 0 |
| 21 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 22 | `work_session_id` | `TEXT` | 0 | `None` | 0 |
| 23 | `timed_out` | `INTEGER` | 0 | `0` | 0 |
| 24 | `sla_breach` | `INTEGER` | 0 | `0` | 0 |
| 25 | `timeout_ms` | `INTEGER` | 0 | `30000` | 0 |
| 26 | `command_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agent_run_timed_out` | 0 | `c` | 0 | `timed_out, sla_breach` |
| `idx_agent_run_tenant_workspace` | 0 | `c` | 0 | `tenant_id, workspace_id, created_at` |
| `idx_agentsam_run_idempotency` | 1 | `c` | 1 | `user_id, idempotency_key` |
| `idx_agentsam_run_conversation` | 0 | `c` | 0 | `conversation_id` |
| `idx_agentsam_run_user_created` | 0 | `c` | 0 | `user_id, created_at` |
| `sqlite_autoindex_agentsam_agent_run_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_agent_run (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  trigger TEXT,
  model_id TEXT,
  idempotency_key TEXT,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, agent_ai_id TEXT DEFAULT NULL, person_uuid TEXT, agent_id TEXT, ai_model_ref     TEXT, routing_arm_id   TEXT, chain_root_id    TEXT, tenant_id TEXT, work_session_id TEXT, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 30000, command_id TEXT REFERENCES agentsam_commands(id))
```

## Table: `agentsam_command_run`

Meta: `table=agentsam_command_run` `group=execution` `rows=69` `tags=agentsam,command,d1,execution,schema`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id, session_id, conversation_id, user_input, normalized_intent, intent_category, tier_used.

### Relationship hints

- `agentsam_ai`
- `agentsam_command_allowlist`
- `agentsam_command_pattern`
- `agentsam_commands`
- `agentsam_slash_commands`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'run_' || lower(hex(randomblob(8))), workspace_id TEXT NOT NULL, session_id TEXT, conversation_id TEXT, user_input TEXT NOT NULL, normalized_intent TEXT, intent_category TEXT, tier_used INTEGER NOT NULL DEFAULT 0, model_id TEXT, commands_json TEXT NOT NULL DEFAULT '[]', result_json TEXT NOT NULL DEFAULT '{}', output_text TEXT, confidence_score REAL, success INTEGER NOT NULL DEFAULT 0, exit_code INTEGER, duration_ms INTEGER, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, error_message TEXT, escalated_from_run_id TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), selected_command_id TEXT, selected_command_slug TEXT, risk_level TEXT, requires_confirmation INTEGER DEFAULT 0, approval_status TEXT DEFAULT 'not_required'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'run_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `conversation_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `user_input` | `TEXT` | 1 | `None` | 0 |
| 5 | `normalized_intent` | `TEXT` | 0 | `None` | 0 |
| 6 | `intent_category` | `TEXT` | 0 | `None` | 0 |
| 7 | `tier_used` | `INTEGER` | 1 | `0` | 0 |
| 8 | `model_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `commands_json` | `TEXT` | 1 | `'[]'` | 0 |
| 10 | `result_json` | `TEXT` | 1 | `'{}'` | 0 |
| 11 | `output_text` | `TEXT` | 0 | `None` | 0 |
| 12 | `confidence_score` | `REAL` | 0 | `None` | 0 |
| 13 | `success` | `INTEGER` | 1 | `0` | 0 |
| 14 | `exit_code` | `INTEGER` | 0 | `None` | 0 |
| 15 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 16 | `input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 17 | `output_tokens` | `INTEGER` | 0 | `0` | 0 |
| 18 | `cost_usd` | `REAL` | 0 | `0` | 0 |
| 19 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 20 | `escalated_from_run_id` | `TEXT` | 0 | `None` | 0 |
| 21 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 22 | `selected_command_id` | `TEXT` | 0 | `None` | 0 |
| 23 | `selected_command_slug` | `TEXT` | 0 | `None` | 0 |
| 24 | `risk_level` | `TEXT` | 0 | `None` | 0 |
| 25 | `requires_confirmation` | `INTEGER` | 0 | `0` | 0 |
| 26 | `approval_status` | `TEXT` | 0 | `'not_required'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_command_run_selected_command` | 0 | `c` | 0 | `selected_command_id, selected_command_slug` |
| `idx_agentsam_command_run_created` | 0 | `c` | 0 | `created_at` |
| `idx_agentsam_command_run_workspace` | 0 | `c` | 0 | `workspace_id` |
| `sqlite_autoindex_agentsam_command_run_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_command_run (
  id TEXT PRIMARY KEY DEFAULT ('run_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  conversation_id TEXT,
  user_input TEXT NOT NULL,
  normalized_intent TEXT,
  intent_category TEXT
    CHECK(intent_category IN ('deploy','debug','db','r2','git','worker','search','file','misc') OR intent_category IS NULL),
  tier_used INTEGER NOT NULL DEFAULT 0,
  model_id TEXT,
  commands_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT NOT NULL DEFAULT '{}',
  output_text TEXT,
  confidence_score REAL,
  success INTEGER NOT NULL DEFAULT 0,
  exit_code INTEGER,
  duration_ms INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  error_message TEXT,
  escalated_from_run_id TEXT REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, selected_command_id TEXT, selected_command_slug TEXT, risk_level TEXT, requires_confirmation INTEGER DEFAULT 0, approval_status TEXT DEFAULT 'not_required')
```

## Table: `agentsam_compaction_events`

Meta: `table=agentsam_compaction_events` `group=execution` `rows=0` `tags=agentsam,d1,execution,schema`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, session_id, provider, model_key, tokens_before, tokens_after, cost_saved_usd.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'cmp_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', session_id TEXT, provider TEXT NOT NULL, model_key TEXT NOT NULL, tokens_before INTEGER NOT NULL, tokens_after INTEGER NOT NULL, cost_saved_usd REAL DEFAULT 0, compaction_strategy TEXT DEFAULT 'summarize', summary_text TEXT, compacted_at TEXT NOT NULL DEFAULT datetime('now'), agent_id TEXT, workspace_id TEXT, user_id TEXT, person_uuid TEXT, metadata_json TEXT DEFAULT '{}'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'cmp_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 2 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `provider` | `TEXT` | 1 | `None` | 0 |
| 4 | `model_key` | `TEXT` | 1 | `None` | 0 |
| 5 | `tokens_before` | `INTEGER` | 1 | `None` | 0 |
| 6 | `tokens_after` | `INTEGER` | 1 | `None` | 0 |
| 7 | `cost_saved_usd` | `REAL` | 0 | `0` | 0 |
| 8 | `compaction_strategy` | `TEXT` | 0 | `'summarize'` | 0 |
| 9 | `summary_text` | `TEXT` | 0 | `None` | 0 |
| 10 | `compacted_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 11 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 15 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_compaction_events_scope` | 0 | `c` | 0 | `tenant_id, workspace_id, compacted_at` |
| `sqlite_autoindex_agentsam_compaction_events_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_compaction_events (
  id TEXT PRIMARY KEY DEFAULT ('cmp_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  session_id TEXT,
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  tokens_before INTEGER NOT NULL,
  tokens_after INTEGER NOT NULL,
  tokens_saved INTEGER GENERATED ALWAYS AS (tokens_before - tokens_after) STORED,
  cost_saved_usd REAL DEFAULT 0,
  compaction_strategy TEXT CHECK(compaction_strategy IN ('summarize','truncate','selective','full')) DEFAULT 'summarize',
  summary_text TEXT,
  compacted_at TEXT NOT NULL DEFAULT (datetime('now'))
, agent_id TEXT, workspace_id TEXT, user_id TEXT, person_uuid TEXT, metadata_json TEXT DEFAULT '{}')
```

## Table: `agentsam_cron_runs`

Meta: `table=agentsam_cron_runs` `group=execution` `rows=156` `tags=agentsam,cron,d1,execution,schema`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, job_name, cron_expression, status, tenant_id, workspace_id, started_at, completed_at.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'acr_' || lower(hex(randomblob(8))), job_name TEXT NOT NULL, cron_expression TEXT, status TEXT NOT NULL DEFAULT 'running', tenant_id TEXT, workspace_id TEXT, started_at INTEGER NOT NULL DEFAULT unixepoch(), completed_at INTEGER, duration_ms INTEGER, rows_read INTEGER DEFAULT 0, rows_written INTEGER DEFAULT 0, error_message TEXT, metadata_json TEXT DEFAULT '{}', created_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'acr_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `job_name` | `TEXT` | 1 | `None` | 0 |
| 2 | `cron_expression` | `TEXT` | 0 | `None` | 0 |
| 3 | `status` | `TEXT` | 1 | `'running'` | 0 |
| 4 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `started_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 7 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 8 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 9 | `rows_read` | `INTEGER` | 0 | `0` | 0 |
| 10 | `rows_written` | `INTEGER` | 0 | `0` | 0 |
| 11 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 12 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 13 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_cron_runs_stuck` | 0 | `c` | 1 | `status, started_at` |
| `idx_agentsam_cron_runs_status_started` | 0 | `c` | 0 | `status, started_at` |
| `idx_agentsam_cron_runs_scope_started` | 0 | `c` | 0 | `tenant_id, workspace_id, started_at` |
| `idx_agentsam_cron_runs_job_started` | 0 | `c` | 0 | `job_name, started_at` |
| `sqlite_autoindex_agentsam_cron_runs_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_cron_runs (
  id TEXT PRIMARY KEY DEFAULT ('acr_' || lower(hex(randomblob(8)))),
  job_name TEXT NOT NULL,
  cron_expression TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','skipped')),
  tenant_id TEXT,
  workspace_id TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  duration_ms INTEGER,
  rows_read INTEGER DEFAULT 0,
  rows_written INTEGER DEFAULT 0,
  error_message TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## Table: `agentsam_escalation`

Meta: `table=agentsam_escalation` `group=execution` `rows=0` `tags=agentsam,d1,execution,schema`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, plan_id, todo_id, command_run_id, from_tier, from_model.

### Relationship hints

- `agentsam_plans`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'esc_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, plan_id TEXT, todo_id TEXT, command_run_id TEXT NOT NULL, from_tier INTEGER NOT NULL, from_model TEXT, to_tier INTEGER NOT NULL, to_model TEXT NOT NULL, reason TEXT NOT NULL, context_tokens INTEGER DEFAULT 0, success INTEGER, agent_id TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'esc_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `plan_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `todo_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `command_run_id` | `TEXT` | 1 | `None` | 0 |
| 6 | `from_tier` | `INTEGER` | 1 | `None` | 0 |
| 7 | `from_model` | `TEXT` | 0 | `None` | 0 |
| 8 | `to_tier` | `INTEGER` | 1 | `None` | 0 |
| 9 | `to_model` | `TEXT` | 1 | `None` | 0 |
| 10 | `reason` | `TEXT` | 1 | `None` | 0 |
| 11 | `context_tokens` | `INTEGER` | 0 | `0` | 0 |
| 12 | `success` | `INTEGER` | 0 | `None` | 0 |
| 13 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_esc_plan` | 0 | `c` | 0 | `plan_id` |
| `idx_esc_todo` | 0 | `c` | 0 | `todo_id` |
| `idx_esc_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_esc_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_esc_command_run` | 0 | `c` | 0 | `command_run_id` |
| `sqlite_autoindex_agentsam_escalation_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_escalation" (
  id             TEXT    PRIMARY KEY DEFAULT ('esc_' || lower(hex(randomblob(8)))),
  tenant_id      TEXT    NOT NULL,
  workspace_id   TEXT    NOT NULL,
  plan_id        TEXT    REFERENCES agentsam_plans(id)        ON DELETE SET NULL,
  todo_id        TEXT    REFERENCES agentsam_todo(id)          ON DELETE SET NULL,
  command_run_id TEXT    NOT NULL REFERENCES agentsam_command_run(id) ON DELETE CASCADE,
  from_tier      INTEGER NOT NULL,
  from_model     TEXT,
  to_tier        INTEGER NOT NULL,
  to_model       TEXT    NOT NULL,
  reason         TEXT    NOT NULL CHECK(reason IN ('low_confidence','execution_failure','timeout','complexity','user_requested','recovery')),
  context_tokens INTEGER DEFAULT 0,
  success        INTEGER,
  agent_id       TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## Table: `agentsam_eval_runs`

Meta: `table=agentsam_eval_runs` `group=execution` `rows=12` `tags=agentsam,d1,eval,execution,schema`

### Purpose

Evaluation run results and quality/cost/latency scoring.

### Relationship hints

- `agentsam_eval_cases`
- `agentsam_eval_suites`

### Compact columns

```txt
id TEXT PK DEFAULT 'evr_' || lower(hex(randomblob(8))), suite_id TEXT NOT NULL, case_id TEXT, tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', model_key TEXT NOT NULL, provider TEXT NOT NULL, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, latency_ms INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, score_quality REAL, score_latency REAL, score_cost REAL, score_tool_use REAL, score_safety REAL, score_overall REAL, passed INTEGER DEFAULT 0, output_text TEXT, grader_notes TEXT, grader_model TEXT, run_at TEXT NOT NULL DEFAULT datetime('now'), cached_input_tokens INTEGER DEFAULT 0, schema_valid INTEGER DEFAULT NULL, retry_count INTEGER DEFAULT 0, prompt_version_id TEXT, run_group_id TEXT, tool_calls_attempted INTEGER DEFAULT 0, tool_calls_succeeded INTEGER DEFAULT 0, failure_taxonomy TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'evr_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `suite_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `case_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 4 | `model_key` | `TEXT` | 1 | `None` | 0 |
| 5 | `provider` | `TEXT` | 1 | `None` | 0 |
| 6 | `input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 7 | `output_tokens` | `INTEGER` | 0 | `0` | 0 |
| 8 | `latency_ms` | `INTEGER` | 0 | `0` | 0 |
| 9 | `cost_usd` | `REAL` | 0 | `0` | 0 |
| 10 | `score_quality` | `REAL` | 0 | `None` | 0 |
| 11 | `score_latency` | `REAL` | 0 | `None` | 0 |
| 12 | `score_cost` | `REAL` | 0 | `None` | 0 |
| 13 | `score_tool_use` | `REAL` | 0 | `None` | 0 |
| 14 | `score_safety` | `REAL` | 0 | `None` | 0 |
| 15 | `score_overall` | `REAL` | 0 | `None` | 0 |
| 16 | `passed` | `INTEGER` | 0 | `0` | 0 |
| 17 | `output_text` | `TEXT` | 0 | `None` | 0 |
| 18 | `grader_notes` | `TEXT` | 0 | `None` | 0 |
| 19 | `grader_model` | `TEXT` | 0 | `None` | 0 |
| 20 | `run_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 21 | `cached_input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 22 | `schema_valid` | `INTEGER` | 0 | `NULL` | 0 |
| 23 | `retry_count` | `INTEGER` | 0 | `0` | 0 |
| 24 | `prompt_version_id` | `TEXT` | 0 | `None` | 0 |
| 25 | `run_group_id` | `TEXT` | 0 | `None` | 0 |
| 26 | `tool_calls_attempted` | `INTEGER` | 0 | `0` | 0 |
| 27 | `tool_calls_succeeded` | `INTEGER` | 0 | `0` | 0 |
| 28 | `failure_taxonomy` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_eval_runs_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_eval_runs (
  id TEXT PRIMARY KEY DEFAULT ('evr_' || lower(hex(randomblob(8)))),
  suite_id TEXT NOT NULL REFERENCES agentsam_eval_suites(id),
  case_id TEXT REFERENCES agentsam_eval_cases(id),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  score_quality REAL,
  score_latency REAL,
  score_cost REAL,
  score_tool_use REAL,
  score_safety REAL,
  score_overall REAL,
  passed INTEGER DEFAULT 0,
  output_text TEXT,
  grader_notes TEXT,
  grader_model TEXT,
  run_at TEXT NOT NULL DEFAULT (datetime('now'))
, cached_input_tokens INTEGER DEFAULT 0, schema_valid INTEGER DEFAULT NULL, retry_count INTEGER DEFAULT 0, prompt_version_id TEXT REFERENCES agentsam_prompt_versions(id), run_group_id TEXT, tool_calls_attempted INTEGER DEFAULT 0, tool_calls_succeeded INTEGER DEFAULT 0, failure_taxonomy TEXT)
```

## Table: `agentsam_execution_context`

Meta: `table=agentsam_execution_context` `group=execution` `rows=59` `tags=agentsam,d1,execution,schema`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, command_run_id, todo_id, cwd, files_json, recent_error.

### Relationship hints

- `agentsam_executions`
- `agentsam_hook_execution`
- `agentsam_mcp_tool_execution`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'ctx_' || lower(hex(randomblob(8))), tenant_id TEXT, workspace_id TEXT, command_run_id TEXT NOT NULL, todo_id TEXT, cwd TEXT, files_json TEXT DEFAULT '[]', recent_error TEXT, goal TEXT, extra_json TEXT DEFAULT '{}', context_tokens INTEGER DEFAULT 0, created_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'ctx_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `command_run_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `todo_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `cwd` | `TEXT` | 0 | `None` | 0 |
| 6 | `files_json` | `TEXT` | 0 | `'[]'` | 0 |
| 7 | `recent_error` | `TEXT` | 0 | `None` | 0 |
| 8 | `goal` | `TEXT` | 0 | `None` | 0 |
| 9 | `extra_json` | `TEXT` | 0 | `'{}'` | 0 |
| 10 | `context_tokens` | `INTEGER` | 0 | `0` | 0 |
| 11 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_ctx_todo` | 0 | `c` | 0 | `todo_id` |
| `idx_ctx_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_ctx_command_run` | 0 | `c` | 0 | `command_run_id` |
| `sqlite_autoindex_agentsam_execution_context_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_execution_context" (
  id             TEXT    PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  tenant_id      TEXT,
  workspace_id   TEXT,
  command_run_id TEXT    NOT NULL REFERENCES agentsam_command_run(id) ON DELETE CASCADE,
  todo_id        TEXT    REFERENCES agentsam_todo(id) ON DELETE SET NULL,
  cwd            TEXT,
  files_json     TEXT    DEFAULT '[]',
  recent_error   TEXT,
  goal           TEXT,
  extra_json     TEXT    DEFAULT '{}',
  context_tokens INTEGER DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## Table: `agentsam_executions`

Meta: `table=agentsam_executions` `group=execution` `rows=12` `tags=agentsam,d1,execution,schema`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, user_id, plan_id, todo_id, command_run_id, task_id.

### Relationship hints

- `agentsam_plan_tasks`
- `agentsam_plans`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT, workspace_id TEXT, user_id TEXT, plan_id TEXT, todo_id TEXT, command_run_id TEXT, task_id TEXT NOT NULL, subagent_id TEXT, agent_id TEXT, work_session_id TEXT, execution_type TEXT NOT NULL, command TEXT, file_path TEXT, output TEXT, error TEXT, duration_ms INTEGER, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 120000, created_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `plan_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `todo_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `command_run_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `task_id` | `TEXT` | 1 | `None` | 0 |
| 8 | `subagent_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 10 | `work_session_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `execution_type` | `TEXT` | 1 | `None` | 0 |
| 12 | `command` | `TEXT` | 0 | `None` | 0 |
| 13 | `file_path` | `TEXT` | 0 | `None` | 0 |
| 14 | `output` | `TEXT` | 0 | `None` | 0 |
| 15 | `error` | `TEXT` | 0 | `None` | 0 |
| 16 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 17 | `timed_out` | `INTEGER` | 0 | `0` | 0 |
| 18 | `sla_breach` | `INTEGER` | 0 | `0` | 0 |
| 19 | `timeout_ms` | `INTEGER` | 0 | `120000` | 0 |
| 20 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_exe_timed_out` | 0 | `c` | 0 | `timed_out` |
| `idx_exe_plan` | 0 | `c` | 0 | `plan_id` |
| `idx_exe_command_run` | 0 | `c` | 0 | `command_run_id` |
| `idx_exe_todo` | 0 | `c` | 0 | `todo_id` |
| `idx_exe_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_exe_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_exe_task` | 0 | `c` | 0 | `task_id` |
| `sqlite_autoindex_agentsam_executions_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_executions" (
  id              TEXT    PRIMARY KEY,
  tenant_id       TEXT,
  workspace_id    TEXT    REFERENCES agentsam_workspace(id)   ON DELETE SET NULL,
  user_id         TEXT,
  plan_id         TEXT    REFERENCES agentsam_plans(id)       ON DELETE SET NULL,
  todo_id         TEXT    REFERENCES agentsam_todo(id)         ON DELETE SET NULL,
  command_run_id  TEXT    REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  task_id         TEXT    NOT NULL,
  subagent_id     TEXT,
  agent_id        TEXT,
  work_session_id TEXT,
  execution_type  TEXT    NOT NULL,
  command         TEXT,
  file_path       TEXT,
  output          TEXT,
  error           TEXT,
  duration_ms     INTEGER,
  timed_out       INTEGER DEFAULT 0,
  sla_breach      INTEGER DEFAULT 0,
  timeout_ms      INTEGER DEFAULT 120000,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## Table: `agentsam_hook_execution`

Meta: `table=agentsam_hook_execution` `group=execution` `rows=78` `tags=agentsam,d1,execution,hook,schema`

### Purpose

Execution records for triggered hooks.

### Relationship hints

- `agentsam_hook`
- `agentsam_plans`
- `agentsam_webhook_events`
- `agentsam_webhook_weekly`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'hexec_' || lower(hex(randomblob(6))), tenant_id TEXT, workspace_id TEXT, hook_id TEXT NOT NULL, user_id TEXT NOT NULL, agent_id TEXT, session_id TEXT, plan_id TEXT, todo_id TEXT, command_run_id TEXT, source TEXT, event_type TEXT, action TEXT, actor TEXT, target_type TEXT, target_id TEXT, payload_json TEXT DEFAULT '{}', metadata_json TEXT DEFAULT '{}', status TEXT NOT NULL, duration_ms INTEGER, output TEXT, error TEXT, person_uuid TEXT, ran_at TEXT NOT NULL DEFAULT datetime('now'), created_at INTEGER DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'hexec_' || lower(hex(randomblob(6)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `hook_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 5 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `plan_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `todo_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `command_run_id` | `TEXT` | 0 | `None` | 0 |
| 10 | `source` | `TEXT` | 0 | `None` | 0 |
| 11 | `event_type` | `TEXT` | 0 | `None` | 0 |
| 12 | `action` | `TEXT` | 0 | `None` | 0 |
| 13 | `actor` | `TEXT` | 0 | `None` | 0 |
| 14 | `target_type` | `TEXT` | 0 | `None` | 0 |
| 15 | `target_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `payload_json` | `TEXT` | 0 | `'{}'` | 0 |
| 17 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 18 | `status` | `TEXT` | 1 | `None` | 0 |
| 19 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 20 | `output` | `TEXT` | 0 | `None` | 0 |
| 21 | `error` | `TEXT` | 0 | `None` | 0 |
| 22 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 23 | `ran_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 24 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_hexec_event_type` | 0 | `c` | 0 | `event_type` |
| `idx_hexec_plan` | 0 | `c` | 0 | `plan_id` |
| `idx_hexec_command_run` | 0 | `c` | 0 | `command_run_id` |
| `idx_hexec_todo` | 0 | `c` | 0 | `todo_id` |
| `idx_hexec_status` | 0 | `c` | 0 | `status` |
| `idx_hexec_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_hexec_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_hexec_hook_ran` | 0 | `c` | 0 | `hook_id, ran_at` |
| `sqlite_autoindex_agentsam_hook_execution_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_hook_execution" (
  id             TEXT    PRIMARY KEY DEFAULT ('hexec_' || lower(hex(randomblob(6)))),
  tenant_id      TEXT,
  workspace_id   TEXT,
  hook_id        TEXT    NOT NULL REFERENCES agentsam_hook(id) ON DELETE CASCADE,
  user_id        TEXT    NOT NULL,
  agent_id       TEXT,
  session_id     TEXT,
  plan_id        TEXT    REFERENCES agentsam_plans(id)       ON DELETE SET NULL,
  todo_id        TEXT    REFERENCES agentsam_todo(id)         ON DELETE SET NULL,
  command_run_id TEXT    REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  source         TEXT,
  event_type     TEXT,
  action         TEXT,
  actor          TEXT,
  target_type    TEXT,
  target_id      TEXT,
  payload_json   TEXT    DEFAULT '{}',
  metadata_json  TEXT    DEFAULT '{}',
  status         TEXT    NOT NULL CHECK(status IN ('success','fail','timeout')),
  duration_ms    INTEGER,
  output         TEXT,
  error          TEXT,
  person_uuid    TEXT,
  ran_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at     INTEGER DEFAULT (unixepoch())
)
```

## Table: `agentsam_mcp_tool_execution`

Meta: `table=agentsam_mcp_tool_execution` `group=execution` `rows=13` `tags=agentsam,d1,execution,mcp,schema,tool`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tool_id, tool_name, input_tokens, output_tokens, duration_ms, cost_usd, success.

### Relationship hints

- `agentsam_mcp_allowlist`
- `agentsam_mcp_servers`
- `agentsam_mcp_tools`
- `agentsam_mcp_workflows`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, tool_id TEXT, tool_name TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, duration_ms INTEGER, cost_usd REAL DEFAULT 0, success INTEGER DEFAULT 1, error_message TEXT, created_at TEXT DEFAULT datetime('now'), tenant_id TEXT DEFAULT 'tenant_sam_primeaux', session_id TEXT, user_id TEXT, workflow_id TEXT, input_json TEXT DEFAULT '{}', requires_approval INTEGER DEFAULT 0, retry_count INTEGER DEFAULT 0, output_json TEXT DEFAULT '{}', tool_chain_id TEXT, agentsam_tools_id TEXT, workspace_id TEXT, agent_id TEXT, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 30000
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tool_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `tool_name` | `TEXT` | 0 | `None` | 0 |
| 3 | `input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 4 | `output_tokens` | `INTEGER` | 0 | `0` | 0 |
| 5 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 6 | `cost_usd` | `REAL` | 0 | `0` | 0 |
| 7 | `success` | `INTEGER` | 0 | `1` | 0 |
| 8 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 10 | `tenant_id` | `TEXT` | 0 | `'tenant_sam_primeaux'` | 0 |
| 11 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `workflow_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `input_json` | `TEXT` | 0 | `'{}'` | 0 |
| 15 | `requires_approval` | `INTEGER` | 0 | `0` | 0 |
| 16 | `retry_count` | `INTEGER` | 0 | `0` | 0 |
| 17 | `output_json` | `TEXT` | 0 | `'{}'` | 0 |
| 18 | `tool_chain_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `agentsam_tools_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 21 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 22 | `timed_out` | `INTEGER` | 0 | `0` | 0 |
| 23 | `sla_breach` | `INTEGER` | 0 | `0` | 0 |
| 24 | `timeout_ms` | `INTEGER` | 0 | `30000` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_mcp_exec_workspace_tool` | 0 | `c` | 0 | `workspace_id, tool_name, created_at` |
| `idx_mcp_exec_tenant_session` | 0 | `c` | 0 | `tenant_id, session_id` |
| `idx_mcp_exec_chain` | 0 | `c` | 0 | `tool_chain_id` |
| `sqlite_autoindex_agentsam_mcp_tool_execution_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_mcp_tool_execution (
  id TEXT PRIMARY KEY,
  tool_id TEXT,
  tool_name TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER,
  cost_usd REAL DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', session_id TEXT, user_id TEXT, workflow_id TEXT, input_json TEXT DEFAULT '{}', requires_approval INTEGER DEFAULT 0, retry_count INTEGER DEFAULT 0, output_json TEXT DEFAULT '{}', tool_chain_id TEXT, agentsam_tools_id TEXT, workspace_id TEXT, agent_id TEXT, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 30000)
```

## Table: `agentsam_project_context`

Meta: `table=agentsam_project_context` `group=execution` `rows=51` `tags=agentsam,d1,execution,schema`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, project_key, project_name, project_type, status, priority.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'ctx_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, workspace_id TEXT, project_key TEXT NOT NULL, project_name TEXT NOT NULL, project_type TEXT, status TEXT DEFAULT 'active', priority INTEGER DEFAULT 50, description TEXT NOT NULL, goals TEXT, constraints TEXT, current_blockers TEXT, primary_tables TEXT, secondary_tables TEXT, workers_involved TEXT, r2_buckets_involved TEXT, domains_involved TEXT, mcp_services_involved TEXT, key_files TEXT, related_routes TEXT, cursor_usage_percent REAL DEFAULT 0, tokens_budgeted INTEGER, tokens_used INTEGER DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, linked_plan_id TEXT, linked_todo_ids TEXT DEFAULT '[]', agent_id TEXT, client_id TEXT, session_id TEXT, created_by TEXT, notes TEXT, last_cursor_session TEXT, started_at INTEGER, target_completion INTEGER, completed_at INTEGER, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'ctx_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `project_key` | `TEXT` | 1 | `None` | 0 |
| 4 | `project_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `project_type` | `TEXT` | 0 | `None` | 0 |
| 6 | `status` | `TEXT` | 0 | `'active'` | 0 |
| 7 | `priority` | `INTEGER` | 0 | `50` | 0 |
| 8 | `description` | `TEXT` | 1 | `None` | 0 |
| 9 | `goals` | `TEXT` | 0 | `None` | 0 |
| 10 | `constraints` | `TEXT` | 0 | `None` | 0 |
| 11 | `current_blockers` | `TEXT` | 0 | `None` | 0 |
| 12 | `primary_tables` | `TEXT` | 0 | `None` | 0 |
| 13 | `secondary_tables` | `TEXT` | 0 | `None` | 0 |
| 14 | `workers_involved` | `TEXT` | 0 | `None` | 0 |
| 15 | `r2_buckets_involved` | `TEXT` | 0 | `None` | 0 |
| 16 | `domains_involved` | `TEXT` | 0 | `None` | 0 |
| 17 | `mcp_services_involved` | `TEXT` | 0 | `None` | 0 |
| 18 | `key_files` | `TEXT` | 0 | `None` | 0 |
| 19 | `related_routes` | `TEXT` | 0 | `None` | 0 |
| 20 | `cursor_usage_percent` | `REAL` | 0 | `0` | 0 |
| 21 | `tokens_budgeted` | `INTEGER` | 0 | `None` | 0 |
| 22 | `tokens_used` | `INTEGER` | 0 | `0` | 0 |
| 23 | `cost_usd` | `REAL` | 1 | `0` | 0 |
| 24 | `linked_plan_id` | `TEXT` | 0 | `None` | 0 |
| 25 | `linked_todo_ids` | `TEXT` | 0 | `'[]'` | 0 |
| 26 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 27 | `client_id` | `TEXT` | 0 | `None` | 0 |
| 28 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 29 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 30 | `notes` | `TEXT` | 0 | `None` | 0 |
| 31 | `last_cursor_session` | `TEXT` | 0 | `None` | 0 |
| 32 | `started_at` | `INTEGER` | 0 | `None` | 0 |
| 33 | `target_completion` | `INTEGER` | 0 | `None` | 0 |
| 34 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 35 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 36 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_pctx_plan` | 0 | `c` | 0 | `linked_plan_id` |
| `idx_pctx_client` | 0 | `c` | 0 | `client_id` |
| `idx_pctx_agent` | 0 | `c` | 0 | `agent_id` |
| `idx_pctx_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_pctx_project_key` | 0 | `c` | 0 | `project_key` |
| `idx_pctx_tenant_status` | 0 | `c` | 0 | `tenant_id, status` |
| `sqlite_autoindex_agentsam_project_context_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_project_context" (
  id                    TEXT    PRIMARY KEY DEFAULT ('ctx_' || lower(hex(randomblob(8)))),
  tenant_id             TEXT    NOT NULL,
  workspace_id          TEXT,
  project_key           TEXT    NOT NULL,
  project_name          TEXT    NOT NULL,
  project_type          TEXT,
  status                TEXT    DEFAULT 'active',
  priority              INTEGER DEFAULT 50,
  description           TEXT    NOT NULL,
  goals                 TEXT,
  constraints           TEXT,
  current_blockers      TEXT,
  primary_tables        TEXT,
  secondary_tables      TEXT,
  workers_involved      TEXT,
  r2_buckets_involved   TEXT,
  domains_involved      TEXT,
  mcp_services_involved TEXT,
  key_files             TEXT,
  related_routes        TEXT,
  cursor_usage_percent  REAL    DEFAULT 0,
  tokens_budgeted       INTEGER,
  tokens_used           INTEGER DEFAULT 0,
  cost_usd              REAL    NOT NULL DEFAULT 0,
  linked_plan_id        TEXT    REFERENCES agentsam_plans(id),
  linked_todo_ids       TEXT    DEFAULT '[]',
  agent_id              TEXT,
  client_id             TEXT,
  session_id            TEXT,
  created_by            TEXT,
  notes                 TEXT,
  last_cursor_session   TEXT,
  started_at            INTEGER,
  target_completion     INTEGER,
  completed_at          INTEGER,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## Table: `agentsam_script_runs`

Meta: `table=agentsam_script_runs` `group=execution` `rows=0` `tags=agentsam,d1,execution,schema,script`

### Purpose

Execution history for registered scripts, including branch/SHA, environment, status, and output summaries.

### Relationship hints

- `agentsam_scripts`
- `agentsam_subscription_registry`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'sr_' || lower(hex(randomblob(8))), script_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia', triggered_by TEXT NOT NULL DEFAULT 'agent', trigger_source TEXT NOT NULL DEFAULT 'agent_sam', cicd_run_id TEXT, git_commit_sha TEXT, git_branch TEXT DEFAULT 'main', environment TEXT NOT NULL DEFAULT 'production', status TEXT NOT NULL DEFAULT 'running', exit_code INTEGER, duration_ms INTEGER, output_summary TEXT, error_message TEXT, cost_usd REAL DEFAULT 0, started_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now'), completed_at TEXT, created_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'sr_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `script_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `'ws_inneranimalmedia'` | 0 |
| 3 | `triggered_by` | `TEXT` | 1 | `'agent'` | 0 |
| 4 | `trigger_source` | `TEXT` | 1 | `'agent_sam'` | 0 |
| 5 | `cicd_run_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `git_commit_sha` | `TEXT` | 0 | `None` | 0 |
| 7 | `git_branch` | `TEXT` | 0 | `'main'` | 0 |
| 8 | `environment` | `TEXT` | 1 | `'production'` | 0 |
| 9 | `status` | `TEXT` | 1 | `'running'` | 0 |
| 10 | `exit_code` | `INTEGER` | 0 | `None` | 0 |
| 11 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 12 | `output_summary` | `TEXT` | 0 | `None` | 0 |
| 13 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 14 | `cost_usd` | `REAL` | 0 | `0` | 0 |
| 15 | `started_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |
| 16 | `completed_at` | `TEXT` | 0 | `None` | 0 |
| 17 | `created_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_script_runs_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_script_runs (
  id              TEXT PRIMARY KEY DEFAULT ('sr_' || lower(hex(randomblob(8)))),
  script_id       TEXT NOT NULL REFERENCES agentsam_scripts(id),
  workspace_id    TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  triggered_by    TEXT NOT NULL DEFAULT 'agent',
  trigger_source  TEXT NOT NULL DEFAULT 'agent_sam'
    CHECK(trigger_source IN ('agent_sam','cursor','manual','github_push','scheduled','cicd')),
  cicd_run_id     TEXT,
  git_commit_sha  TEXT,
  git_branch      TEXT DEFAULT 'main',
  environment     TEXT NOT NULL DEFAULT 'production'
    CHECK(environment IN ('production','sandbox','staging','dev')),
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','passed','failed','skipped','cancelled')),
  exit_code       INTEGER,
  duration_ms     INTEGER,
  output_summary  TEXT,
  error_message   TEXT,
  cost_usd        REAL DEFAULT 0,
  started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)
```

## Table: `agentsam_tool_chain`

Meta: `table=agentsam_tool_chain` `group=execution` `rows=19` `tags=agentsam,d1,execution,schema,tool`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, user_id, agent_id, work_session_id, plan_id, todo_id.

### Relationship hints

- `agentsam_mcp_tool_execution`
- `agentsam_mcp_tools`
- `agentsam_plans`
- `agentsam_tool_call_log`
- `agentsam_tool_stats_compacted`
- `agentsam_tools`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'atc_' || lower(hex(randomblob(8))), tenant_id TEXT, workspace_id TEXT, user_id TEXT, agent_id TEXT, work_session_id TEXT, plan_id TEXT, todo_id TEXT, command_run_id TEXT, subagent_profile_id TEXT, agent_session_id TEXT, agent_message_id TEXT, parent_chain_id TEXT, depth INTEGER NOT NULL DEFAULT 0, tool_name TEXT NOT NULL, tool_id TEXT, mcp_tool_ref TEXT, mcp_tool_call_id TEXT, terminal_session_id TEXT, command_execution_id TEXT, tool_status TEXT NOT NULL DEFAULT 'pending', input_json TEXT DEFAULT '{}', output_summary TEXT, result_json TEXT, error_message TEXT, error_type TEXT, retry_count INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 2, duration_ms INTEGER, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 30000, requires_approval INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at INTEGER, started_at INTEGER NOT NULL DEFAULT unixepoch(), completed_at INTEGER
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'atc_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `work_session_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `plan_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `todo_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `command_run_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `subagent_profile_id` | `TEXT` | 0 | `None` | 0 |
| 10 | `agent_session_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `agent_message_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `parent_chain_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `depth` | `INTEGER` | 1 | `0` | 0 |
| 14 | `tool_name` | `TEXT` | 1 | `None` | 0 |
| 15 | `tool_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `mcp_tool_ref` | `TEXT` | 0 | `None` | 0 |
| 17 | `mcp_tool_call_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `terminal_session_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `command_execution_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `tool_status` | `TEXT` | 1 | `'pending'` | 0 |
| 21 | `input_json` | `TEXT` | 0 | `'{}'` | 0 |
| 22 | `output_summary` | `TEXT` | 0 | `None` | 0 |
| 23 | `result_json` | `TEXT` | 0 | `None` | 0 |
| 24 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 25 | `error_type` | `TEXT` | 0 | `None` | 0 |
| 26 | `retry_count` | `INTEGER` | 1 | `0` | 0 |
| 27 | `max_retries` | `INTEGER` | 1 | `2` | 0 |
| 28 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 29 | `input_tokens` | `INTEGER` | 1 | `0` | 0 |
| 30 | `output_tokens` | `INTEGER` | 1 | `0` | 0 |
| 31 | `cost_usd` | `REAL` | 1 | `0` | 0 |
| 32 | `timed_out` | `INTEGER` | 0 | `0` | 0 |
| 33 | `sla_breach` | `INTEGER` | 0 | `0` | 0 |
| 34 | `timeout_ms` | `INTEGER` | 0 | `30000` | 0 |
| 35 | `requires_approval` | `INTEGER` | 1 | `0` | 0 |
| 36 | `approved_by` | `TEXT` | 0 | `None` | 0 |
| 37 | `approved_at` | `INTEGER` | 0 | `None` | 0 |
| 38 | `started_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 39 | `completed_at` | `INTEGER` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_atc_parent` | 0 | `c` | 0 | `parent_chain_id` |
| `idx_atc_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_atc_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_atc_agent_session` | 0 | `c` | 0 | `agent_session_id` |
| `idx_atc_tool_status` | 0 | `c` | 0 | `tool_status` |
| `idx_atc_command_run` | 0 | `c` | 0 | `command_run_id` |
| `idx_atc_todo` | 0 | `c` | 0 | `todo_id` |
| `idx_atc_plan_id` | 0 | `c` | 0 | `plan_id` |
| `sqlite_autoindex_agentsam_tool_chain_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_tool_chain" (
  id                   TEXT    PRIMARY KEY DEFAULT ('atc_' || lower(hex(randomblob(8)))),
  tenant_id            TEXT,
  workspace_id         TEXT,
  user_id              TEXT,
  agent_id             TEXT,
  work_session_id      TEXT,
  plan_id              TEXT    REFERENCES agentsam_plans(id)        ON DELETE SET NULL,
  todo_id              TEXT    REFERENCES agentsam_todo(id)          ON DELETE SET NULL,
  command_run_id       TEXT    REFERENCES agentsam_command_run(id)  ON DELETE SET NULL,
  subagent_profile_id  TEXT,
  agent_session_id     TEXT,
  agent_message_id     TEXT,
  parent_chain_id      TEXT    REFERENCES agentsam_tool_chain(id),
  depth                INTEGER NOT NULL DEFAULT 0,
  tool_name            TEXT    NOT NULL,
  tool_id              TEXT    REFERENCES agentsam_tools(id),
  mcp_tool_ref         TEXT,
  mcp_tool_call_id     TEXT,
  terminal_session_id  TEXT,
  command_execution_id TEXT,
  tool_status          TEXT    NOT NULL DEFAULT 'pending'
                               CHECK(tool_status IN ('pending','running','completed',
                                                      'failed','skipped','cancelled','timeout')),
  input_json           TEXT    DEFAULT '{}',
  output_summary       TEXT,
  result_json          TEXT,
  error_message        TEXT,
  error_type           TEXT,
  retry_count          INTEGER NOT NULL DEFAULT 0,
  max_retries          INTEGER NOT NULL DEFAULT 2,
  duration_ms          INTEGER,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_usd             REAL    NOT NULL DEFAULT 0,
  timed_out            INTEGER DEFAULT 0,
  sla_breach           INTEGER DEFAULT 0,
  timeout_ms           INTEGER DEFAULT 30000,
  requires_approval    INTEGER NOT NULL DEFAULT 0,
  approved_by          TEXT,
  approved_at          INTEGER,
  started_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at         INTEGER
)
```

## Table: `agentsam_workflow_runs`

Meta: `table=agentsam_workflow_runs` `group=execution` `rows=0` `tags=agentsam,d1,execution,schema,workflow`

### Purpose

agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workflow_id, workflow_key, display_name, tenant_id, workspace_id, project_id, user_id.

### Relationship hints

- `agentsam_approval_queue`
- `agentsam_mcp_workflows`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'wrun_' || lower(hex(randomblob(8))), workflow_id TEXT NOT NULL, workflow_key TEXT, display_name TEXT, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT, user_id TEXT, d1_auth_user_id TEXT, user_email TEXT, session_id TEXT, run_group_id TEXT, trigger_type TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'running', input_json TEXT NOT NULL DEFAULT '{}', output_json TEXT NOT NULL DEFAULT '{}', step_results_json TEXT NOT NULL DEFAULT '[]', steps_completed INTEGER NOT NULL DEFAULT 0, steps_total INTEGER NOT NULL DEFAULT 0, error_message TEXT, model_used TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, duration_ms INTEGER, parent_run_id TEXT DEFAULT NULL, retry_of_run_id TEXT DEFAULT NULL, approval_id TEXT DEFAULT NULL, retry_count INTEGER NOT NULL DEFAULT 0, environment TEXT NOT NULL DEFAULT 'production', git_commit_sha TEXT, git_branch TEXT DEFAULT 'main', supabase_run_id TEXT, supabase_sync_status TEXT NOT NULL DEFAULT 'pending', supabase_synced_at TEXT, supabase_sync_error TEXT, supabase_sync_attempts INTEGER NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL DEFAULT '{}', started_at INTEGER NOT NULL DEFAULT unixepoch(), completed_at INTEGER, created_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'wrun_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `workflow_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workflow_key` | `TEXT` | 0 | `None` | 0 |
| 3 | `display_name` | `TEXT` | 0 | `None` | 0 |
| 4 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 5 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 6 | `project_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `d1_auth_user_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `user_email` | `TEXT` | 0 | `None` | 0 |
| 10 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `run_group_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `trigger_type` | `TEXT` | 1 | `'manual'` | 0 |
| 13 | `status` | `TEXT` | 1 | `'running'` | 0 |
| 14 | `input_json` | `TEXT` | 1 | `'{}'` | 0 |
| 15 | `output_json` | `TEXT` | 1 | `'{}'` | 0 |
| 16 | `step_results_json` | `TEXT` | 1 | `'[]'` | 0 |
| 17 | `steps_completed` | `INTEGER` | 1 | `0` | 0 |
| 18 | `steps_total` | `INTEGER` | 1 | `0` | 0 |
| 19 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 20 | `model_used` | `TEXT` | 0 | `None` | 0 |
| 21 | `input_tokens` | `INTEGER` | 1 | `0` | 0 |
| 22 | `output_tokens` | `INTEGER` | 1 | `0` | 0 |
| 23 | `cost_usd` | `REAL` | 1 | `0` | 0 |
| 24 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 25 | `parent_run_id` | `TEXT` | 0 | `NULL` | 0 |
| 26 | `retry_of_run_id` | `TEXT` | 0 | `NULL` | 0 |
| 27 | `approval_id` | `TEXT` | 0 | `NULL` | 0 |
| 28 | `retry_count` | `INTEGER` | 1 | `0` | 0 |
| 29 | `environment` | `TEXT` | 1 | `'production'` | 0 |
| 30 | `git_commit_sha` | `TEXT` | 0 | `None` | 0 |
| 31 | `git_branch` | `TEXT` | 0 | `'main'` | 0 |
| 32 | `supabase_run_id` | `TEXT` | 0 | `None` | 0 |
| 33 | `supabase_sync_status` | `TEXT` | 1 | `'pending'` | 0 |
| 34 | `supabase_synced_at` | `TEXT` | 0 | `None` | 0 |
| 35 | `supabase_sync_error` | `TEXT` | 0 | `None` | 0 |
| 36 | `supabase_sync_attempts` | `INTEGER` | 1 | `0` | 0 |
| 37 | `metadata_json` | `TEXT` | 1 | `'{}'` | 0 |
| 38 | `started_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 39 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 40 | `created_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |
| 41 | `updated_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_workflow_runs_supabase_sync` | 0 | `c` | 0 | `supabase_sync_status, supabase_sync_attempts` |
| `idx_agentsam_workflow_runs_user` | 0 | `c` | 0 | `d1_auth_user_id, user_email, started_at` |
| `idx_agentsam_workflow_runs_run_group` | 0 | `c` | 0 | `run_group_id` |
| `idx_agentsam_workflow_runs_workflow` | 0 | `c` | 0 | `workflow_id, workflow_key, started_at` |
| `idx_agentsam_workflow_runs_scope_status` | 0 | `c` | 0 | `tenant_id, workspace_id, status, started_at` |
| `sqlite_autoindex_agentsam_workflow_runs_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_workflow_runs (
  id TEXT PRIMARY KEY DEFAULT ('wrun_' || lower(hex(randomblob(8)))),

  workflow_id TEXT NOT NULL REFERENCES agentsam_mcp_workflows(id) ON DELETE CASCADE,
  workflow_key TEXT,
  display_name TEXT,

  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT,

  user_id TEXT,
  d1_auth_user_id TEXT,
  user_email TEXT,
  session_id TEXT,
  run_group_id TEXT,

  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK(trigger_type IN ('manual','agent','cursor','github_push','scheduled','cicd','deploy','api')),

  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','cancelled','timeout')),

  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  step_results_json TEXT NOT NULL DEFAULT '[]',

  steps_completed INTEGER NOT NULL DEFAULT 0,
  steps_total INTEGER NOT NULL DEFAULT 0,

  error_message TEXT,

  model_used TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER,

  parent_run_id TEXT DEFAULT NULL,
  retry_of_run_id TEXT DEFAULT NULL,
  approval_id TEXT DEFAULT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,

  environment TEXT NOT NULL DEFAULT 'production'
    CHECK(environment IN ('production','sandbox','staging','dev')),

  git_commit_sha TEXT,
  git_branch TEXT DEFAULT 'main',

  supabase_run_id TEXT,
  supabase_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(supabase_sync_status IN ('pending','synced','failed','skipped')),
  supabase_synced_at TEXT,
  supabase_sync_error TEXT,
  supabase_sync_attempts INTEGER NOT NULL DEFAULT 0,

  metadata_json TEXT NOT NULL DEFAULT '{}',

  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CHECK(length(trim(tenant_id)) > 0),
  CHECK(length(trim(workspace_id)) > 0)
)
```

# Hooks and Webhooks

## Table: `agentsam_hook`

Meta: `table=agentsam_hook` `group=hooks-webhooks` `rows=14` `tags=agentsam,d1,hook,hooks-webhooks,schema`

### Purpose

Hook definitions connecting events to workflows, tools, or commands.

### Relationship hints

- `agentsam_hook_execution`
- `agentsam_mcp_workflows`
- `agentsam_webhook_events`
- `agentsam_webhook_weekly`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT, workspace_id TEXT, user_id TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'system', external_id TEXT, trigger TEXT NOT NULL, command TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '', metadata TEXT DEFAULT '{}', is_active INTEGER NOT NULL DEFAULT 1, run_count INTEGER DEFAULT 0, last_run_at TEXT, workflow_id TEXT, subagent_slug TEXT, person_uuid TEXT, created_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `provider` | `TEXT` | 1 | `'system'` | 0 |
| 5 | `external_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `trigger` | `TEXT` | 1 | `None` | 0 |
| 7 | `command` | `TEXT` | 1 | `''` | 0 |
| 8 | `target_id` | `TEXT` | 1 | `''` | 0 |
| 9 | `metadata` | `TEXT` | 0 | `'{}'` | 0 |
| 10 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 11 | `run_count` | `INTEGER` | 0 | `0` | 0 |
| 12 | `last_run_at` | `TEXT` | 0 | `None` | 0 |
| 13 | `workflow_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `subagent_slug` | `TEXT` | 0 | `None` | 0 |
| 15 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 16 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_hook_external` | 0 | `c` | 0 | `external_id, provider` |
| `idx_hook_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_hook_trigger` | 0 | `c` | 0 | `trigger, is_active` |
| `idx_hook_provider` | 0 | `c` | 0 | `provider` |
| `idx_hook_user_ws` | 0 | `c` | 0 | `user_id, workspace_id` |
| `sqlite_autoindex_agentsam_hook_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_hook" (
  id            TEXT    PRIMARY KEY,
  tenant_id     TEXT,
  workspace_id  TEXT,
  user_id       TEXT    NOT NULL,
  provider      TEXT    NOT NULL DEFAULT 'system',
  external_id   TEXT,
  trigger       TEXT    NOT NULL
                        CHECK(trigger IN ('start','stop','pre_deploy','post_deploy',
                                          'pre_commit','error','imessage_reply','email_reply')),
  command       TEXT    NOT NULL DEFAULT '',
  target_id     TEXT    NOT NULL DEFAULT '',
  metadata      TEXT    DEFAULT '{}',
  is_active     INTEGER NOT NULL DEFAULT 1,
  run_count     INTEGER DEFAULT 0,
  last_run_at   TEXT,
  workflow_id   TEXT    REFERENCES agentsam_mcp_workflows(id) ON DELETE SET NULL,
  subagent_slug TEXT,
  person_uuid   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
)
```

## Table: `agentsam_webhook_events`

Meta: `table=agentsam_webhook_events` `group=hooks-webhooks` `rows=1277` `tags=agentsam,d1,hook,hooks-webhooks,schema,webhook`

### Purpose

Inbound webhook event log and processing state.

### Relationship hints

- `agentsam_webhook_weekly`

### Compact columns

```txt
id TEXT PK DEFAULT 'whe_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', provider TEXT NOT NULL, event_type TEXT NOT NULL, event_id TEXT, payload_json TEXT, status TEXT DEFAULT 'received', response_id TEXT, model_key TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, error_message TEXT, processed_at TEXT, received_at TEXT NOT NULL DEFAULT datetime('now'), endpoint_id TEXT, source TEXT, repo_full_name TEXT, branch TEXT, commit_sha TEXT, commit_message TEXT, actor TEXT, author_username TEXT, author_email TEXT, headers_json TEXT, signature_valid INTEGER DEFAULT 1, ip_address TEXT, processing_error TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'whe_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 2 | `provider` | `TEXT` | 1 | `None` | 0 |
| 3 | `event_type` | `TEXT` | 1 | `None` | 0 |
| 4 | `event_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `payload_json` | `TEXT` | 0 | `None` | 0 |
| 6 | `status` | `TEXT` | 0 | `'received'` | 0 |
| 7 | `response_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `model_key` | `TEXT` | 0 | `None` | 0 |
| 9 | `input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 10 | `output_tokens` | `INTEGER` | 0 | `0` | 0 |
| 11 | `cost_usd` | `REAL` | 0 | `0` | 0 |
| 12 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 13 | `processed_at` | `TEXT` | 0 | `None` | 0 |
| 14 | `received_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 15 | `endpoint_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `source` | `TEXT` | 0 | `None` | 0 |
| 17 | `repo_full_name` | `TEXT` | 0 | `None` | 0 |
| 18 | `branch` | `TEXT` | 0 | `None` | 0 |
| 19 | `commit_sha` | `TEXT` | 0 | `None` | 0 |
| 20 | `commit_message` | `TEXT` | 0 | `None` | 0 |
| 21 | `actor` | `TEXT` | 0 | `None` | 0 |
| 22 | `author_username` | `TEXT` | 0 | `None` | 0 |
| 23 | `author_email` | `TEXT` | 0 | `None` | 0 |
| 24 | `headers_json` | `TEXT` | 0 | `None` | 0 |
| 25 | `signature_valid` | `INTEGER` | 0 | `1` | 0 |
| 26 | `ip_address` | `TEXT` | 0 | `None` | 0 |
| 27 | `processing_error` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_webhook_events_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_webhook_events (
  id TEXT PRIMARY KEY DEFAULT ('whe_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  payload_json TEXT,
  status TEXT CHECK(status IN ('received','processing','processed','failed','ignored')) DEFAULT 'received',
  response_id TEXT,
  model_key TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  error_message TEXT,
  processed_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
, endpoint_id TEXT, source TEXT, repo_full_name TEXT, branch TEXT, commit_sha TEXT, commit_message TEXT, actor TEXT, author_username TEXT, author_email TEXT, headers_json TEXT, signature_valid INTEGER DEFAULT 1, ip_address TEXT, processing_error TEXT, created_at TEXT GENERATED ALWAYS AS (received_at) VIRTUAL)
```

## Table: `agentsam_webhook_weekly`

Meta: `table=agentsam_webhook_weekly` `group=hooks-webhooks` `rows=1` `tags=agentsam,d1,hook,hooks-webhooks,schema,webhook`

### Purpose

agentsam table in the Hooks and Webhooks domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, week_start, week_end, provider, total_received, total_processed.

### Relationship hints

- `agentsam_webhook_events`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'whw_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT '__tenant__', week_start TEXT NOT NULL, week_end TEXT NOT NULL, provider TEXT NOT NULL, total_received INTEGER NOT NULL DEFAULT 0, total_processed INTEGER NOT NULL DEFAULT 0, total_failed INTEGER NOT NULL DEFAULT 0, total_cost_usd REAL DEFAULT 0, top_event_types TEXT DEFAULT '{}', top_repos TEXT DEFAULT '{}', notes TEXT, rolled_up_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'whw_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `'__tenant__'` | 0 |
| 3 | `week_start` | `TEXT` | 1 | `None` | 0 |
| 4 | `week_end` | `TEXT` | 1 | `None` | 0 |
| 5 | `provider` | `TEXT` | 1 | `None` | 0 |
| 6 | `total_received` | `INTEGER` | 1 | `0` | 0 |
| 7 | `total_processed` | `INTEGER` | 1 | `0` | 0 |
| 8 | `total_failed` | `INTEGER` | 1 | `0` | 0 |
| 9 | `total_cost_usd` | `REAL` | 0 | `0` | 0 |
| 10 | `top_event_types` | `TEXT` | 0 | `'{}'` | 0 |
| 11 | `top_repos` | `TEXT` | 0 | `'{}'` | 0 |
| 12 | `notes` | `TEXT` | 0 | `None` | 0 |
| 13 | `rolled_up_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_webhook_weekly_rolled_up` | 0 | `c` | 0 | `rolled_up_at` |
| `idx_agentsam_webhook_weekly_scope` | 0 | `c` | 0 | `tenant_id, workspace_id, week_start, provider` |
| `sqlite_autoindex_agentsam_webhook_weekly_2` | 1 | `u` | 0 | `tenant_id, workspace_id, week_start, provider` |
| `sqlite_autoindex_agentsam_webhook_weekly_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_webhook_weekly" (
  id TEXT PRIMARY KEY DEFAULT ('whw_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '__tenant__',
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  provider TEXT NOT NULL,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  top_event_types TEXT DEFAULT '{}',
  top_repos TEXT DEFAULT '{}',
  notes TEXT,
  rolled_up_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, workspace_id, week_start, provider)
)
```

# MCP Tools, Servers, and Tool Logs

## Table: `agentsam_mcp_allowlist`

Meta: `table=agentsam_mcp_allowlist` `group=mcp-tools` `rows=412` `tags=agentsam,d1,mcp,mcp-tools,schema`

### Purpose

agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, workspace_id, tool_key, created_at, notes, person_uuid, agentsam_tools_id.

### Relationship hints

- `agentsam_mcp_servers`
- `agentsam_mcp_tool_execution`
- `agentsam_mcp_tools`
- `agentsam_mcp_workflows`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT '', tool_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT datetime('now'), notes TEXT, person_uuid TEXT, agentsam_tools_id TEXT, risk_level_override TEXT, max_calls_per_day INTEGER, agent_id TEXT, tenant_id TEXT, is_allowed INTEGER DEFAULT 1, timeout_override_ms INTEGER, requires_approval INTEGER DEFAULT 0, granted_by TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `''` | 0 |
| 3 | `tool_key` | `TEXT` | 1 | `None` | 0 |
| 4 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 5 | `notes` | `TEXT` | 0 | `None` | 0 |
| 6 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 7 | `agentsam_tools_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `risk_level_override` | `TEXT` | 0 | `None` | 0 |
| 9 | `max_calls_per_day` | `INTEGER` | 0 | `None` | 0 |
| 10 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `is_allowed` | `INTEGER` | 0 | `1` | 0 |
| 13 | `timeout_override_ms` | `INTEGER` | 0 | `None` | 0 |
| 14 | `requires_approval` | `INTEGER` | 0 | `0` | 0 |
| 15 | `granted_by` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_mcp_allowlist_agent_tool` | 0 | `c` | 0 | `agent_id, tool_key, workspace_id` |
| `idx_allowlist_user_tool` | 0 | `c` | 0 | `user_id, workspace_id, agentsam_tools_id` |
| `idx_agentsam_mcp_allowlist_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_agentsam_mcp_allowlist_user` | 0 | `c` | 0 | `user_id` |
| `idx_agentsam_mcp_allowlist_unique` | 1 | `c` | 0 | `user_id, workspace_id, tool_key` |
| `sqlite_autoindex_agentsam_mcp_allowlist_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_mcp_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  tool_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
, person_uuid TEXT, agentsam_tools_id TEXT, risk_level_override TEXT, max_calls_per_day INTEGER, agent_id TEXT, tenant_id TEXT, is_allowed INTEGER DEFAULT 1, timeout_override_ms INTEGER, requires_approval INTEGER DEFAULT 0, granted_by TEXT)
```

## Table: `agentsam_mcp_servers`

Meta: `table=agentsam_mcp_servers` `group=mcp-tools` `rows=3` `tags=agentsam,d1,mcp,mcp-tools,schema`

### Purpose

Registry of MCP servers and health/routing metadata.

### Relationship hints

- `agentsam_mcp_allowlist`
- `agentsam_mcp_tool_execution`
- `agentsam_mcp_tools`
- `agentsam_mcp_workflows`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'mcps_' || lower(hex(randomblob(8))), server_key TEXT NOT NULL, display_name TEXT NOT NULL, url TEXT NOT NULL, auth_type TEXT NOT NULL DEFAULT 'bearer', token_id TEXT, workspace_id TEXT, tenant_id TEXT, is_active INTEGER NOT NULL DEFAULT 1, timeout_ms INTEGER NOT NULL DEFAULT 30000, health_check_url TEXT, last_health_at INTEGER, health_status TEXT DEFAULT 'unknown', avg_latency_ms REAL, error_rate REAL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'mcps_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `server_key` | `TEXT` | 1 | `None` | 0 |
| 2 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 3 | `url` | `TEXT` | 1 | `None` | 0 |
| 4 | `auth_type` | `TEXT` | 1 | `'bearer'` | 0 |
| 5 | `token_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 9 | `timeout_ms` | `INTEGER` | 1 | `30000` | 0 |
| 10 | `health_check_url` | `TEXT` | 0 | `None` | 0 |
| 11 | `last_health_at` | `INTEGER` | 0 | `None` | 0 |
| 12 | `health_status` | `TEXT` | 0 | `'unknown'` | 0 |
| 13 | `avg_latency_ms` | `REAL` | 0 | `None` | 0 |
| 14 | `error_rate` | `REAL` | 0 | `0` | 0 |
| 15 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 16 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_mcp_servers_key` | 0 | `c` | 0 | `server_key, is_active` |
| `sqlite_autoindex_agentsam_mcp_servers_2` | 1 | `u` | 0 | `server_key` |
| `sqlite_autoindex_agentsam_mcp_servers_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_mcp_servers (
  id               TEXT PRIMARY KEY DEFAULT ('mcps_' || lower(hex(randomblob(8)))),
  server_key       TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL,
  url              TEXT NOT NULL,
  auth_type        TEXT NOT NULL DEFAULT 'bearer',
  token_id         TEXT,
  workspace_id     TEXT,
  tenant_id        TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  timeout_ms       INTEGER NOT NULL DEFAULT 30000,
  health_check_url TEXT,
  last_health_at   INTEGER,
  health_status    TEXT DEFAULT 'unknown',
  avg_latency_ms   REAL,
  error_rate       REAL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## Table: `agentsam_mcp_tools`

Meta: `table=agentsam_mcp_tools` `group=mcp-tools` `rows=392` `tags=agentsam,d1,mcp,mcp-tools,schema,tool`

### Purpose

Registry of MCP tools and tool schema/risk/health metadata.

### Relationship hints

- `agentsam_mcp_allowlist`
- `agentsam_mcp_servers`
- `agentsam_mcp_tool_execution`
- `agentsam_mcp_workflows`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, tool_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT, tool_name TEXT DEFAULT '', display_name TEXT DEFAULT '', tool_category TEXT DEFAULT 'mcp', mcp_service_url TEXT DEFAULT '', description TEXT DEFAULT '', input_schema TEXT DEFAULT '{}', output_schema TEXT DEFAULT '{}', intent_tags TEXT DEFAULT '[]', intent_category_tags TEXT DEFAULT '', modes_json TEXT DEFAULT '["auto","agent","debug"]', handler_config TEXT DEFAULT '{}', categories_json TEXT DEFAULT '[]', schema_hint TEXT DEFAULT '', risk_level TEXT DEFAULT 'low', input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, trigger_config_json TEXT DEFAULT '{}', trigger_type TEXT DEFAULT 'manual', steps_json TEXT DEFAULT '[]', timeout_seconds INTEGER DEFAULT 120, requires_approval INTEGER DEFAULT 0, estimated_cost_usd REAL DEFAULT 0.0, last_used_at TEXT, updated_at TEXT, handler_type TEXT DEFAULT 'builtin', is_active INTEGER DEFAULT 1, workspace_scope TEXT DEFAULT '["ws_inneranimalmedia"]', is_degraded INTEGER NOT NULL DEFAULT 0, failure_rate REAL DEFAULT 0.0, avg_latency_ms REAL DEFAULT NULL, last_health_check INTEGER DEFAULT NULL, sort_priority INTEGER DEFAULT 50, cost_per_call_usd REAL DEFAULT 0.0, agentsam_tools_id TEXT, enabled INTEGER DEFAULT 1, tenant_id TEXT, workspace_id TEXT, agent_id TEXT, server_key TEXT, server_id TEXT, routing_scope TEXT DEFAULT 'workspace', last_error TEXT, health_status TEXT DEFAULT 'unknown', health_checked_at TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tool_key` | `TEXT` | 1 | `None` | 0 |
| 3 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 4 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 5 | `tool_name` | `TEXT` | 0 | `''` | 0 |
| 6 | `display_name` | `TEXT` | 0 | `''` | 0 |
| 7 | `tool_category` | `TEXT` | 0 | `'mcp'` | 0 |
| 8 | `mcp_service_url` | `TEXT` | 0 | `''` | 0 |
| 9 | `description` | `TEXT` | 0 | `''` | 0 |
| 10 | `input_schema` | `TEXT` | 0 | `'{}'` | 0 |
| 11 | `output_schema` | `TEXT` | 0 | `'{}'` | 0 |
| 12 | `intent_tags` | `TEXT` | 0 | `'[]'` | 0 |
| 13 | `intent_category_tags` | `TEXT` | 0 | `''` | 0 |
| 14 | `modes_json` | `TEXT` | 0 | `'["auto","agent","debug"]'` | 0 |
| 15 | `handler_config` | `TEXT` | 0 | `'{}'` | 0 |
| 16 | `categories_json` | `TEXT` | 0 | `'[]'` | 0 |
| 17 | `schema_hint` | `TEXT` | 0 | `''` | 0 |
| 18 | `risk_level` | `TEXT` | 0 | `'low'` | 0 |
| 19 | `input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 20 | `output_tokens` | `INTEGER` | 0 | `0` | 0 |
| 21 | `duration_ms` | `INTEGER` | 0 | `0` | 0 |
| 22 | `trigger_config_json` | `TEXT` | 0 | `'{}'` | 0 |
| 23 | `trigger_type` | `TEXT` | 0 | `'manual'` | 0 |
| 24 | `steps_json` | `TEXT` | 0 | `'[]'` | 0 |
| 25 | `timeout_seconds` | `INTEGER` | 0 | `120` | 0 |
| 26 | `requires_approval` | `INTEGER` | 0 | `0` | 0 |
| 27 | `estimated_cost_usd` | `REAL` | 0 | `0.0` | 0 |
| 28 | `last_used_at` | `TEXT` | 0 | `None` | 0 |
| 29 | `updated_at` | `TEXT` | 0 | `None` | 0 |
| 30 | `handler_type` | `TEXT` | 0 | `'builtin'` | 0 |
| 31 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 32 | `workspace_scope` | `TEXT` | 0 | `'["ws_inneranimalmedia"]'` | 0 |
| 33 | `is_degraded` | `INTEGER` | 1 | `0` | 0 |
| 34 | `failure_rate` | `REAL` | 0 | `0.0` | 0 |
| 35 | `avg_latency_ms` | `REAL` | 0 | `NULL` | 0 |
| 36 | `last_health_check` | `INTEGER` | 0 | `NULL` | 0 |
| 37 | `sort_priority` | `INTEGER` | 0 | `50` | 0 |
| 38 | `cost_per_call_usd` | `REAL` | 0 | `0.0` | 0 |
| 39 | `agentsam_tools_id` | `TEXT` | 0 | `None` | 0 |
| 40 | `enabled` | `INTEGER` | 0 | `1` | 0 |
| 41 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 42 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 43 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 44 | `server_key` | `TEXT` | 0 | `None` | 0 |
| 45 | `server_id` | `TEXT` | 0 | `None` | 0 |
| 46 | `routing_scope` | `TEXT` | 0 | `'workspace'` | 0 |
| 47 | `last_error` | `TEXT` | 0 | `None` | 0 |
| 48 | `health_status` | `TEXT` | 0 | `'unknown'` | 0 |
| 49 | `health_checked_at` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_mcp_tools_tenant_key` | 0 | `c` | 0 | `tenant_id, tool_key, is_active` |
| `idx_mcp_tools_workspace_active` | 0 | `c` | 0 | `workspace_id, is_active, tool_key` |
| `idx_mcp_tools_category` | 0 | `c` | 0 | `tool_category` |
| `idx_mcp_tools_tool_name` | 0 | `c` | 0 | `tool_name` |
| `sqlite_autoindex_agentsam_mcp_tools_2` | 1 | `u` | 0 | `user_id, tool_key` |
| `sqlite_autoindex_agentsam_mcp_tools_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_mcp_tools (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT, tool_name TEXT DEFAULT '', display_name TEXT DEFAULT '', tool_category TEXT DEFAULT 'mcp', mcp_service_url TEXT DEFAULT '', description TEXT DEFAULT '', input_schema TEXT DEFAULT '{}', output_schema TEXT DEFAULT '{}', intent_tags TEXT DEFAULT '[]', intent_category_tags TEXT DEFAULT '', modes_json TEXT DEFAULT '["auto","agent","debug"]', handler_config TEXT DEFAULT '{}', categories_json TEXT DEFAULT '[]', schema_hint TEXT DEFAULT '', risk_level TEXT DEFAULT 'low', input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, trigger_config_json TEXT DEFAULT '{}', trigger_type TEXT DEFAULT 'manual', steps_json TEXT DEFAULT '[]', timeout_seconds INTEGER DEFAULT 120, requires_approval INTEGER DEFAULT 0, estimated_cost_usd REAL DEFAULT 0.0, last_used_at TEXT, updated_at TEXT, handler_type TEXT DEFAULT 'builtin', is_active INTEGER DEFAULT 1, workspace_scope TEXT DEFAULT '["ws_inneranimalmedia"]', is_degraded      INTEGER NOT NULL DEFAULT 0, failure_rate      REAL DEFAULT 0.0, avg_latency_ms    REAL DEFAULT NULL, last_health_check INTEGER DEFAULT NULL, sort_priority     INTEGER DEFAULT 50, cost_per_call_usd REAL DEFAULT 0.0, agentsam_tools_id TEXT, enabled INTEGER DEFAULT 1, tenant_id TEXT, workspace_id TEXT, agent_id TEXT, server_key TEXT, server_id TEXT, routing_scope TEXT DEFAULT 'workspace', last_error TEXT, health_status TEXT DEFAULT 'unknown', health_checked_at TEXT,
  UNIQUE(user_id, tool_key)
)
```

## Table: `agentsam_mcp_workflows`

Meta: `table=agentsam_mcp_workflows` `group=mcp-tools` `rows=86` `tags=agentsam,d1,mcp,mcp-tools,schema,workflow`

### Purpose

agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workflow_key, display_name, description, status, priority, steps_json, tools_json.

### Relationship hints

- `agentsam_ai`
- `agentsam_mcp_allowlist`
- `agentsam_mcp_servers`
- `agentsam_mcp_tool_execution`
- `agentsam_mcp_tools`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, workflow_key TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'ready', priority TEXT NOT NULL DEFAULT 'medium', steps_json TEXT NOT NULL DEFAULT '[]', tools_json TEXT NOT NULL DEFAULT '[]', acceptance_criteria_json TEXT NOT NULL DEFAULT '[]', notes TEXT, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), tenant_id TEXT NOT NULL, workspace_id TEXT, trigger_type TEXT DEFAULT 'manual', trigger_config_json TEXT DEFAULT '{}', input_schema_json TEXT DEFAULT '{}', output_schema_json TEXT DEFAULT '{}', requires_approval INTEGER DEFAULT 0, risk_level TEXT DEFAULT 'low', run_count INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0, last_run_at TEXT, last_run_status TEXT, avg_duration_ms REAL DEFAULT 0, total_cost_usd REAL DEFAULT 0, version INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, subagent_slug TEXT, model_id TEXT, timeout_seconds INTEGER DEFAULT 300, category TEXT DEFAULT 'general', parent_workflow_id TEXT DEFAULT NULL, tags_json TEXT DEFAULT '[]', retry_policy_json TEXT DEFAULT '{"max_retries":2,"backoff":"exponential","delay_ms":2000,"retry_on":["timeout","network_error"]}', on_failure_json TEXT DEFAULT '{"action":"notify","notify_channel":"resend"}', max_concurrent_runs INTEGER DEFAULT 1, environment TEXT DEFAULT 'production', visibility TEXT DEFAULT 'workspace', input_defaults_json TEXT DEFAULT '{}', last_error TEXT DEFAULT NULL, task_type TEXT DEFAULT 'agent_workflow'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `workflow_key` | `TEXT` | 1 | `None` | 0 |
| 2 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 3 | `description` | `TEXT` | 0 | `None` | 0 |
| 4 | `status` | `TEXT` | 1 | `'ready'` | 0 |
| 5 | `priority` | `TEXT` | 1 | `'medium'` | 0 |
| 6 | `steps_json` | `TEXT` | 1 | `'[]'` | 0 |
| 7 | `tools_json` | `TEXT` | 1 | `'[]'` | 0 |
| 8 | `acceptance_criteria_json` | `TEXT` | 1 | `'[]'` | 0 |
| 9 | `notes` | `TEXT` | 0 | `None` | 0 |
| 10 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 11 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 12 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 13 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `trigger_type` | `TEXT` | 0 | `'manual'` | 0 |
| 15 | `trigger_config_json` | `TEXT` | 0 | `'{}'` | 0 |
| 16 | `input_schema_json` | `TEXT` | 0 | `'{}'` | 0 |
| 17 | `output_schema_json` | `TEXT` | 0 | `'{}'` | 0 |
| 18 | `requires_approval` | `INTEGER` | 0 | `0` | 0 |
| 19 | `risk_level` | `TEXT` | 0 | `'low'` | 0 |
| 20 | `run_count` | `INTEGER` | 0 | `0` | 0 |
| 21 | `success_count` | `INTEGER` | 0 | `0` | 0 |
| 22 | `last_run_at` | `TEXT` | 0 | `None` | 0 |
| 23 | `last_run_status` | `TEXT` | 0 | `None` | 0 |
| 24 | `avg_duration_ms` | `REAL` | 0 | `0` | 0 |
| 25 | `total_cost_usd` | `REAL` | 0 | `0` | 0 |
| 26 | `version` | `INTEGER` | 0 | `1` | 0 |
| 27 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 28 | `subagent_slug` | `TEXT` | 0 | `None` | 0 |
| 29 | `model_id` | `TEXT` | 0 | `None` | 0 |
| 30 | `timeout_seconds` | `INTEGER` | 0 | `300` | 0 |
| 31 | `category` | `TEXT` | 0 | `'general'` | 0 |
| 32 | `parent_workflow_id` | `TEXT` | 0 | `NULL` | 0 |
| 33 | `tags_json` | `TEXT` | 0 | `'[]'` | 0 |
| 34 | `retry_policy_json` | `TEXT` | 0 | `'{"max_retries":2,"backoff":"exponential","delay_ms":2000,"retry_on":["timeout","network_error"]}'` | 0 |
| 35 | `on_failure_json` | `TEXT` | 0 | `'{"action":"notify","notify_channel":"resend"}'` | 0 |
| 36 | `max_concurrent_runs` | `INTEGER` | 0 | `1` | 0 |
| 37 | `environment` | `TEXT` | 0 | `'production'` | 0 |
| 38 | `visibility` | `TEXT` | 0 | `'workspace'` | 0 |
| 39 | `input_defaults_json` | `TEXT` | 0 | `'{}'` | 0 |
| 40 | `last_error` | `TEXT` | 0 | `NULL` | 0 |
| 41 | `task_type` | `TEXT` | 0 | `'agent_workflow'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_mcp_workflows_task_type` | 0 | `c` | 0 | `task_type` |
| `idx_agentsam_mcp_workflows_parent` | 0 | `c` | 0 | `parent_workflow_id` |
| `idx_agentsam_mcp_workflows_updated` | 0 | `c` | 0 | `updated_at` |
| `idx_agentsam_mcp_workflows_subagent` | 0 | `c` | 0 | `subagent_slug` |
| `idx_agentsam_mcp_workflows_trigger` | 0 | `c` | 0 | `trigger_type` |
| `idx_agentsam_mcp_workflows_active_category` | 0 | `c` | 0 | `is_active, category` |
| `idx_agentsam_mcp_workflows_tenant_workspace_status` | 0 | `c` | 0 | `tenant_id, workspace_id, status` |
| `sqlite_autoindex_agentsam_mcp_workflows_2` | 1 | `u` | 0 | `workflow_key` |
| `sqlite_autoindex_agentsam_mcp_workflows_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_mcp_workflows" (
  id                      TEXT    PRIMARY KEY,
  workflow_key            TEXT    NOT NULL UNIQUE,
  display_name            TEXT    NOT NULL,
  description             TEXT,
  status                  TEXT    NOT NULL DEFAULT 'ready',
  priority                TEXT    NOT NULL DEFAULT 'medium',
  steps_json              TEXT    NOT NULL DEFAULT '[]',
  tools_json              TEXT    NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT   NOT NULL DEFAULT '[]',
  notes                   TEXT,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  tenant_id               TEXT    NOT NULL,
  workspace_id            TEXT,
  trigger_type            TEXT    DEFAULT 'manual',
  trigger_config_json     TEXT    DEFAULT '{}',
  input_schema_json       TEXT    DEFAULT '{}',
  output_schema_json      TEXT    DEFAULT '{}',
  requires_approval       INTEGER DEFAULT 0,
  risk_level              TEXT    DEFAULT 'low',
  run_count               INTEGER DEFAULT 0,
  success_count           INTEGER DEFAULT 0,
  last_run_at             TEXT,
  last_run_status         TEXT,
  avg_duration_ms         REAL    DEFAULT 0,
  total_cost_usd          REAL    DEFAULT 0,
  version                 INTEGER DEFAULT 1,
  is_active               INTEGER DEFAULT 1,
  subagent_slug           TEXT,
  model_id                TEXT,
  timeout_seconds         INTEGER DEFAULT 300,
  category                TEXT    DEFAULT 'general',
  parent_workflow_id      TEXT    DEFAULT NULL,
  tags_json               TEXT    DEFAULT '[]',
  retry_policy_json       TEXT    DEFAULT '{"max_retries":2,"backoff":"exponential","delay_ms":2000,"retry_on":["timeout","network_error"]}',
  on_failure_json         TEXT    DEFAULT '{"action":"notify","notify_channel":"resend"}',
  max_concurrent_runs     INTEGER DEFAULT 1,
  environment             TEXT    DEFAULT 'production',
  visibility              TEXT    DEFAULT 'workspace',
  input_defaults_json     TEXT    DEFAULT '{}',
  last_error              TEXT    DEFAULT NULL,
  task_type               TEXT    DEFAULT 'agent_workflow'
)
```

## Table: `agentsam_tool_call_log`

Meta: `table=agentsam_tool_call_log` `group=mcp-tools` `rows=18` `tags=agentsam,d1,mcp-tools,schema,tool`

### Purpose

agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, session_id, tool_name, status, duration_ms, error_message, cost_usd.

### Relationship hints

- `agentsam_mcp_tool_execution`
- `agentsam_mcp_tools`
- `agentsam_mcp_workflows`
- `agentsam_tool_chain`
- `agentsam_tool_stats_compacted`
- `agentsam_tools`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'atcl_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, session_id TEXT, tool_name TEXT NOT NULL, status TEXT NOT NULL, duration_ms INTEGER, error_message TEXT, cost_usd REAL DEFAULT 0, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, created_at INTEGER NOT NULL DEFAULT unixepoch(), agent_id TEXT, user_id TEXT, workflow_id TEXT, tool_category TEXT DEFAULT 'mcp', input_summary TEXT, output_summary TEXT, retry_count INTEGER DEFAULT 0, workspace_id TEXT, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 30000
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'atcl_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `tool_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `status` | `TEXT` | 1 | `None` | 0 |
| 5 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 6 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 7 | `cost_usd` | `REAL` | 0 | `0` | 0 |
| 8 | `input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 9 | `output_tokens` | `INTEGER` | 0 | `0` | 0 |
| 10 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 11 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `workflow_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `tool_category` | `TEXT` | 0 | `'mcp'` | 0 |
| 15 | `input_summary` | `TEXT` | 0 | `None` | 0 |
| 16 | `output_summary` | `TEXT` | 0 | `None` | 0 |
| 17 | `retry_count` | `INTEGER` | 0 | `0` | 0 |
| 18 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `timed_out` | `INTEGER` | 0 | `0` | 0 |
| 20 | `sla_breach` | `INTEGER` | 0 | `0` | 0 |
| 21 | `timeout_ms` | `INTEGER` | 0 | `30000` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_tool_call_log_workspace_tool` | 0 | `c` | 0 | `workspace_id, tool_name, created_at` |
| `idx_tool_call_log_tenant_time` | 0 | `c` | 0 | `tenant_id, created_at` |
| `sqlite_autoindex_agentsam_tool_call_log_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_tool_call_log (
  id TEXT PRIMARY KEY DEFAULT ('atcl_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  session_id TEXT,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','error','timeout','blocked','completed','failed','pending','running','skipped','cancelled')),
  duration_ms INTEGER,
  error_message TEXT,
  cost_usd REAL DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
, agent_id TEXT, user_id TEXT, workflow_id TEXT, tool_category TEXT DEFAULT 'mcp', input_summary TEXT, output_summary TEXT, retry_count INTEGER DEFAULT 0, workspace_id TEXT, timed_out INTEGER DEFAULT 0, sla_breach INTEGER DEFAULT 0, timeout_ms INTEGER DEFAULT 30000)
```

## Table: `agentsam_tool_stats_compacted`

Meta: `table=agentsam_tool_stats_compacted` `group=mcp-tools` `rows=74` `tags=agentsam,d1,mcp-tools,schema,tool`

### Purpose

agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, tool_name, total_calls, success_count, failure_count, success_rate.

### Relationship hints

- `agentsam_mcp_tool_execution`
- `agentsam_mcp_tools`
- `agentsam_tool_call_log`
- `agentsam_tool_chain`
- `agentsam_tools`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'atsc_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT '__tenant__', tool_name TEXT NOT NULL, total_calls INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0, success_rate REAL DEFAULT 0, total_cost_usd REAL DEFAULT 0, total_tokens INTEGER DEFAULT 0, avg_duration_ms REAL DEFAULT 0, first_seen_at INTEGER, last_seen_at INTEGER, compacted_at INTEGER NOT NULL DEFAULT unixepoch(), agent_id TEXT, timed_out_count INTEGER DEFAULT 0, sla_breach_count INTEGER DEFAULT 0, p95_duration_ms REAL DEFAULT 0
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'atsc_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `'__tenant__'` | 0 |
| 3 | `tool_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `total_calls` | `INTEGER` | 0 | `0` | 0 |
| 5 | `success_count` | `INTEGER` | 0 | `0` | 0 |
| 6 | `failure_count` | `INTEGER` | 0 | `0` | 0 |
| 7 | `success_rate` | `REAL` | 0 | `0` | 0 |
| 8 | `total_cost_usd` | `REAL` | 0 | `0` | 0 |
| 9 | `total_tokens` | `INTEGER` | 0 | `0` | 0 |
| 10 | `avg_duration_ms` | `REAL` | 0 | `0` | 0 |
| 11 | `first_seen_at` | `INTEGER` | 0 | `None` | 0 |
| 12 | `last_seen_at` | `INTEGER` | 0 | `None` | 0 |
| 13 | `compacted_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 14 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 15 | `timed_out_count` | `INTEGER` | 0 | `0` | 0 |
| 16 | `sla_breach_count` | `INTEGER` | 0 | `0` | 0 |
| 17 | `p95_duration_ms` | `REAL` | 0 | `0` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_tool_stats_workspace` | 0 | `c` | 0 | `workspace_id, tool_name` |
| `idx_agentsam_tool_stats_scope_tool` | 0 | `c` | 0 | `tenant_id, workspace_id, tool_name` |
| `idx_agentsam_tool_stats_compacted_at` | 0 | `c` | 0 | `compacted_at` |
| `sqlite_autoindex_agentsam_tool_stats_compacted_2` | 1 | `u` | 0 | `tenant_id, workspace_id, tool_name` |
| `sqlite_autoindex_agentsam_tool_stats_compacted_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_tool_stats_compacted" (
  id TEXT PRIMARY KEY DEFAULT ('atsc_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '__tenant__',
  tool_name TEXT NOT NULL,
  total_calls INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  first_seen_at INTEGER,
  last_seen_at INTEGER,
  compacted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  agent_id TEXT,
  timed_out_count INTEGER DEFAULT 0,
  sla_breach_count INTEGER DEFAULT 0,
  p95_duration_ms REAL DEFAULT 0,
  UNIQUE(tenant_id, workspace_id, tool_name)
)
```

## Table: `agentsam_tools`

Meta: `table=agentsam_tools` `group=mcp-tools` `rows=40` `tags=agentsam,d1,mcp-tools,schema,tool`

### Purpose

agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tool_name, display_name, tool_category, handler_type, description, input_schema, output_schema.

### Relationship hints

- `agentsam_mcp_tools`

### Compact columns

```txt
id TEXT PK DEFAULT 'ast_' || lower(hex(randomblob(8))), tool_name TEXT NOT NULL, display_name TEXT NOT NULL, tool_category TEXT NOT NULL, handler_type TEXT NOT NULL DEFAULT 'builtin', description TEXT, input_schema TEXT, output_schema TEXT, linked_mcp_tool_id TEXT, mcp_service_url TEXT, handler_config TEXT DEFAULT '{}', intent_tags TEXT DEFAULT '[]', intent_category_tags TEXT, modes_json TEXT DEFAULT '["auto","build","chat"]', risk_level TEXT NOT NULL DEFAULT 'low', requires_approval INTEGER NOT NULL DEFAULT 0, requires_confirmation INTEGER NOT NULL DEFAULT 0, token_budget_per_call INTEGER DEFAULT NULL, max_calls_per_session INTEGER DEFAULT NULL, cost_per_call_usd REAL DEFAULT 0.0, is_active INTEGER NOT NULL DEFAULT 1, is_degraded INTEGER NOT NULL DEFAULT 0, failure_rate REAL DEFAULT 0.0, avg_latency_ms REAL DEFAULT NULL, use_count INTEGER NOT NULL DEFAULT 0, last_used_at INTEGER DEFAULT NULL, last_health_check INTEGER DEFAULT NULL, sort_priority INTEGER DEFAULT 50, workspace_scope TEXT DEFAULT '["ws_inneranimalmedia"]', subagent_profile_id TEXT DEFAULT NULL, schema_hint TEXT DEFAULT NULL, notes TEXT DEFAULT NULL, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'ast_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tool_name` | `TEXT` | 1 | `None` | 0 |
| 2 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 3 | `tool_category` | `TEXT` | 1 | `None` | 0 |
| 4 | `handler_type` | `TEXT` | 1 | `'builtin'` | 0 |
| 5 | `description` | `TEXT` | 0 | `None` | 0 |
| 6 | `input_schema` | `TEXT` | 0 | `None` | 0 |
| 7 | `output_schema` | `TEXT` | 0 | `None` | 0 |
| 8 | `linked_mcp_tool_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `mcp_service_url` | `TEXT` | 0 | `None` | 0 |
| 10 | `handler_config` | `TEXT` | 0 | `'{}'` | 0 |
| 11 | `intent_tags` | `TEXT` | 0 | `'[]'` | 0 |
| 12 | `intent_category_tags` | `TEXT` | 0 | `None` | 0 |
| 13 | `modes_json` | `TEXT` | 0 | `'["auto","build","chat"]'` | 0 |
| 14 | `risk_level` | `TEXT` | 1 | `'low'` | 0 |
| 15 | `requires_approval` | `INTEGER` | 1 | `0` | 0 |
| 16 | `requires_confirmation` | `INTEGER` | 1 | `0` | 0 |
| 17 | `token_budget_per_call` | `INTEGER` | 0 | `NULL` | 0 |
| 18 | `max_calls_per_session` | `INTEGER` | 0 | `NULL` | 0 |
| 19 | `cost_per_call_usd` | `REAL` | 0 | `0.0` | 0 |
| 20 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 21 | `is_degraded` | `INTEGER` | 1 | `0` | 0 |
| 22 | `failure_rate` | `REAL` | 0 | `0.0` | 0 |
| 23 | `avg_latency_ms` | `REAL` | 0 | `NULL` | 0 |
| 24 | `use_count` | `INTEGER` | 1 | `0` | 0 |
| 25 | `last_used_at` | `INTEGER` | 0 | `NULL` | 0 |
| 26 | `last_health_check` | `INTEGER` | 0 | `NULL` | 0 |
| 27 | `sort_priority` | `INTEGER` | 0 | `50` | 0 |
| 28 | `workspace_scope` | `TEXT` | 0 | `'["ws_inneranimalmedia"]'` | 0 |
| 29 | `subagent_profile_id` | `TEXT` | 0 | `NULL` | 0 |
| 30 | `schema_hint` | `TEXT` | 0 | `NULL` | 0 |
| 31 | `notes` | `TEXT` | 0 | `NULL` | 0 |
| 32 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 33 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_tools_2` | 1 | `u` | 0 | `tool_name` |
| `sqlite_autoindex_agentsam_tools_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_tools (
  id TEXT PRIMARY KEY DEFAULT ('ast_' || lower(hex(randomblob(8)))),
  tool_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  handler_type TEXT NOT NULL DEFAULT 'builtin'
    CHECK (handler_type IN ('builtin','mcp','r2','github','terminal','http','proxy','ai','d1')),
  description TEXT,
  input_schema TEXT,
  output_schema TEXT,
  linked_mcp_tool_id TEXT,
  mcp_service_url TEXT,
  handler_config TEXT DEFAULT '{}',
  intent_tags TEXT DEFAULT '[]',
  intent_category_tags TEXT,
  modes_json TEXT DEFAULT '["auto","build","chat"]',
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low','medium','high','critical')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  token_budget_per_call INTEGER DEFAULT NULL,
  max_calls_per_session INTEGER DEFAULT NULL,
  cost_per_call_usd REAL DEFAULT 0.0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_degraded INTEGER NOT NULL DEFAULT 0,
  failure_rate REAL DEFAULT 0.0,
  avg_latency_ms REAL DEFAULT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER DEFAULT NULL,
  last_health_check INTEGER DEFAULT NULL,
  sort_priority INTEGER DEFAULT 50,
  workspace_scope TEXT DEFAULT '["ws_inneranimalmedia"]',
  subagent_profile_id TEXT DEFAULT NULL,
  schema_hint TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

# Memory, Skills, Rules, and Ignore Patterns

## Table: `agentsam_ignore_pattern`

Meta: `table=agentsam_ignore_pattern` `group=memory-skills-rules` `rows=10` `tags=agentsam,d1,memory-skills-rules,schema`

### Purpose

agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, workspace_id, pattern, is_negation, order_index, source, created_at.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT, workspace_id TEXT, pattern TEXT NOT NULL, is_negation INTEGER NOT NULL DEFAULT 0, order_index INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'db', created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `pattern` | `TEXT` | 1 | `None` | 0 |
| 4 | `is_negation` | `INTEGER` | 1 | `0` | 0 |
| 5 | `order_index` | `INTEGER` | 1 | `0` | 0 |
| 6 | `source` | `TEXT` | 1 | `'db'` | 0 |
| 7 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 8 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 9 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_ignore_user` | 0 | `c` | 0 | `user_id, order_index` |
| `idx_agentsam_ignore_ws` | 0 | `c` | 0 | `workspace_id, order_index` |
| `sqlite_autoindex_agentsam_ignore_pattern_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_ignore_pattern (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  workspace_id TEXT,
  pattern TEXT NOT NULL,
  is_negation INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'db',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, person_uuid TEXT)
```

## Table: `agentsam_memory`

Meta: `table=agentsam_memory` `group=memory-skills-rules` `rows=80` `tags=agentsam,d1,memory,memory-skills-rules,schema`

### Purpose

Persistent memory/facts/preferences used for Agent Sam context.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'mem_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, workspace_id TEXT, memory_type TEXT DEFAULT 'fact', key TEXT NOT NULL, value TEXT NOT NULL, source TEXT, confidence REAL DEFAULT 1.0, decay_score REAL DEFAULT 1.0, recall_count INTEGER DEFAULT 0, last_recalled_at INTEGER, expires_at INTEGER, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch(), agent_id TEXT, session_id TEXT, tags TEXT DEFAULT '[]', embedding_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'mem_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `memory_type` | `TEXT` | 0 | `'fact'` | 0 |
| 5 | `key` | `TEXT` | 1 | `None` | 0 |
| 6 | `value` | `TEXT` | 1 | `None` | 0 |
| 7 | `source` | `TEXT` | 0 | `None` | 0 |
| 8 | `confidence` | `REAL` | 0 | `1.0` | 0 |
| 9 | `decay_score` | `REAL` | 0 | `1.0` | 0 |
| 10 | `recall_count` | `INTEGER` | 0 | `0` | 0 |
| 11 | `last_recalled_at` | `INTEGER` | 0 | `None` | 0 |
| 12 | `expires_at` | `INTEGER` | 0 | `None` | 0 |
| 13 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 14 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 15 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `tags` | `TEXT` | 0 | `'[]'` | 0 |
| 18 | `embedding_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_mem_user_type` | 0 | `c` | 0 | `user_id, memory_type` |
| `idx_mem_agent` | 0 | `c` | 0 | `agent_id` |
| `idx_mem_decay` | 0 | `c` | 0 | `decay_score` |
| `idx_mem_tenant_expires` | 0 | `c` | 0 | `tenant_id, expires_at` |
| `idx_mem_tenant_type` | 0 | `c` | 0 | `tenant_id, memory_type` |
| `sqlite_autoindex_agentsam_memory_2` | 1 | `u` | 0 | `tenant_id, user_id, key` |
| `sqlite_autoindex_agentsam_memory_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_memory" (
  id               TEXT    PRIMARY KEY DEFAULT ('mem_' || lower(hex(randomblob(8)))),
  tenant_id        TEXT    NOT NULL,
  user_id          TEXT    NOT NULL,
  workspace_id     TEXT,
  memory_type      TEXT    DEFAULT 'fact'
                           CHECK (memory_type IN ('fact','preference','project','skill','error','decision')),
  key              TEXT    NOT NULL,
  value            TEXT    NOT NULL,
  source           TEXT,
  confidence       REAL    DEFAULT 1.0,
  decay_score      REAL    DEFAULT 1.0,
  recall_count     INTEGER DEFAULT 0,
  last_recalled_at INTEGER,
  expires_at       INTEGER,
  created_at       INTEGER DEFAULT (unixepoch()),
  updated_at       INTEGER DEFAULT (unixepoch()),
  agent_id         TEXT,
  session_id       TEXT,
  tags             TEXT    DEFAULT '[]',
  embedding_id     TEXT,
  UNIQUE(tenant_id, user_id, key)
)
```

## Table: `agentsam_rules_document`

Meta: `table=agentsam_rules_document` `group=memory-skills-rules` `rows=4` `tags=agentsam,d1,memory-skills-rules,schema`

### Purpose

agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, workspace_id, title, body_markdown, version, is_active, created_at.

### Relationship hints

- `agentsam_guardrail_rulesets`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT, workspace_id TEXT, title TEXT NOT NULL DEFAULT 'default', body_markdown TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `title` | `TEXT` | 1 | `'default'` | 0 |
| 4 | `body_markdown` | `TEXT` | 1 | `None` | 0 |
| 5 | `version` | `INTEGER` | 1 | `1` | 0 |
| 6 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 7 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 8 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 9 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_rules_ws_active` | 0 | `c` | 0 | `workspace_id, is_active` |
| `sqlite_autoindex_agentsam_rules_document_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_rules_document (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  workspace_id TEXT,
  title TEXT NOT NULL DEFAULT 'default',
  body_markdown TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, person_uuid TEXT)
```

## Table: `agentsam_skill`

Meta: `table=agentsam_skill` `group=memory-skills-rules` `rows=47` `tags=agentsam,d1,memory-skills-rules,schema,skill`

### Purpose

agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, name, description, file_path, scope, workspace_id, content_markdown.

### Relationship hints

- `agentsam_skill_invocation`
- `agentsam_skill_revision`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', file_path TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT 'user', workspace_id TEXT, content_markdown TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now'), icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write', default_model_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, slash_trigger TEXT, globs TEXT, always_apply INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, tags TEXT, person_uuid TEXT, ai_model_id TEXT, tenant_id TEXT DEFAULT 'tenant_sam_primeaux'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `name` | `TEXT` | 1 | `None` | 0 |
| 3 | `description` | `TEXT` | 1 | `''` | 0 |
| 4 | `file_path` | `TEXT` | 1 | `''` | 0 |
| 5 | `scope` | `TEXT` | 1 | `'user'` | 0 |
| 6 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `content_markdown` | `TEXT` | 1 | `''` | 0 |
| 8 | `metadata_json` | `TEXT` | 1 | `'{}'` | 0 |
| 9 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 10 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 11 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 12 | `icon` | `TEXT` | 1 | `''` | 0 |
| 13 | `access_mode` | `TEXT` | 1 | `'read_write'` | 0 |
| 14 | `default_model_id` | `TEXT` | 0 | `None` | 0 |
| 15 | `sort_order` | `INTEGER` | 1 | `0` | 0 |
| 16 | `slash_trigger` | `TEXT` | 0 | `None` | 0 |
| 17 | `globs` | `TEXT` | 0 | `None` | 0 |
| 18 | `always_apply` | `INTEGER` | 1 | `0` | 0 |
| 19 | `version` | `INTEGER` | 1 | `1` | 0 |
| 20 | `tags` | `TEXT` | 0 | `None` | 0 |
| 21 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 22 | `ai_model_id` | `TEXT` | 0 | `None` | 0 |
| 23 | `tenant_id` | `TEXT` | 0 | `'tenant_sam_primeaux'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_skill_workspace_tenant` | 0 | `c` | 0 | `workspace_id, tenant_id, is_active` |
| `idx_agentsam_skill_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_agentsam_skill_user_name` | 0 | `c` | 0 | `user_id, name` |
| `sqlite_autoindex_agentsam_skill_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_skill (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'user',
  workspace_id TEXT,
  content_markdown TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write'
  CHECK(access_mode IN ('read_only','read_write')), default_model_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, slash_trigger TEXT, globs TEXT, always_apply INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, tags TEXT, person_uuid TEXT, ai_model_id TEXT, tenant_id TEXT DEFAULT 'tenant_sam_primeaux')
```

## Table: `agentsam_skill_invocation`

Meta: `table=agentsam_skill_invocation` `group=memory-skills-rules` `rows=303` `tags=agentsam,d1,memory-skills-rules,schema,skill`

### Purpose

agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading columns: id, skill_id, user_id, workspace_id, conversation_id, trigger_method, input_summary, success.

### Relationship hints

- `agentsam_skill`
- `agentsam_skill_revision`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'skillinv_' || lower(hex(randomblob(8))), skill_id TEXT NOT NULL, user_id TEXT NOT NULL DEFAULT 'sam_primeaux', workspace_id TEXT NOT NULL DEFAULT '', conversation_id TEXT, trigger_method TEXT NOT NULL DEFAULT 'slash', input_summary TEXT, success INTEGER NOT NULL DEFAULT 1, error_message TEXT, duration_ms INTEGER, model_used TEXT, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0.0, invoked_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT, agent_id TEXT, tool_chain_id TEXT, ai_model_id TEXT, plan_task_id TEXT, tenant_id TEXT DEFAULT 'tenant_sam_primeaux'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'skillinv_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `skill_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `'sam_primeaux'` | 0 |
| 3 | `workspace_id` | `TEXT` | 1 | `''` | 0 |
| 4 | `conversation_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `trigger_method` | `TEXT` | 1 | `'slash'` | 0 |
| 6 | `input_summary` | `TEXT` | 0 | `None` | 0 |
| 7 | `success` | `INTEGER` | 1 | `1` | 0 |
| 8 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 9 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 10 | `model_used` | `TEXT` | 0 | `None` | 0 |
| 11 | `tokens_in` | `INTEGER` | 0 | `0` | 0 |
| 12 | `tokens_out` | `INTEGER` | 0 | `0` | 0 |
| 13 | `cost_usd` | `REAL` | 0 | `0.0` | 0 |
| 14 | `invoked_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 15 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 16 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `tool_chain_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `ai_model_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `plan_task_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `tenant_id` | `TEXT` | 0 | `'tenant_sam_primeaux'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_skill_invoc_workspace` | 0 | `c` | 0 | `workspace_id, tenant_id, invoked_at` |
| `idx_skill_invoc_invoked` | 0 | `c` | 0 | `invoked_at` |
| `idx_skill_invoc_user` | 0 | `c` | 0 | `user_id` |
| `idx_skill_invoc_skill_id` | 0 | `c` | 0 | `skill_id` |
| `sqlite_autoindex_agentsam_skill_invocation_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_skill_invocation (
  id              TEXT PRIMARY KEY DEFAULT ('skillinv_' || lower(hex(randomblob(8)))),
  skill_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'sam_primeaux',
  workspace_id    TEXT NOT NULL DEFAULT '',
  conversation_id TEXT,
  trigger_method  TEXT NOT NULL DEFAULT 'slash'
    CHECK(trigger_method IN ('slash','at','auto','api')),
  input_summary   TEXT,
  success         INTEGER NOT NULL DEFAULT 1,
  error_message   TEXT,
  duration_ms     INTEGER,
  model_used      TEXT,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0.0,
  invoked_at      TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT, agent_id TEXT, tool_chain_id TEXT, ai_model_id   TEXT, plan_task_id  TEXT, tenant_id TEXT DEFAULT 'tenant_sam_primeaux',
  FOREIGN KEY (skill_id) REFERENCES agentsam_skill(id) ON DELETE CASCADE
)
```

## Table: `agentsam_skill_revision`

Meta: `table=agentsam_skill_revision` `group=memory-skills-rules` `rows=7` `tags=agentsam,d1,memory-skills-rules,schema,skill`

### Purpose

agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading columns: id, skill_id, content_markdown, version, changed_by, change_note, created_at.

### Relationship hints

- `agentsam_skill`
- `agentsam_skill_invocation`

### Compact columns

```txt
id TEXT PK DEFAULT 'skillrev_' || lower(hex(randomblob(8))), skill_id TEXT NOT NULL, content_markdown TEXT NOT NULL, version INTEGER NOT NULL, changed_by TEXT NOT NULL DEFAULT 'sam_primeaux', change_note TEXT, created_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'skillrev_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `skill_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `content_markdown` | `TEXT` | 1 | `None` | 0 |
| 3 | `version` | `INTEGER` | 1 | `None` | 0 |
| 4 | `changed_by` | `TEXT` | 1 | `'sam_primeaux'` | 0 |
| 5 | `change_note` | `TEXT` | 0 | `None` | 0 |
| 6 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_skill_revision_version` | 0 | `c` | 0 | `skill_id, version` |
| `idx_skill_revision_skill_id` | 0 | `c` | 0 | `skill_id` |
| `sqlite_autoindex_agentsam_skill_revision_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_skill_revision (
  id           TEXT PRIMARY KEY DEFAULT ('skillrev_' || lower(hex(randomblob(8)))),
  skill_id     TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  version      INTEGER NOT NULL,
  changed_by   TEXT NOT NULL DEFAULT 'sam_primeaux',
  change_note  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES agentsam_skill(id) ON DELETE CASCADE
)
```

# AI Models, Routing, Prompts, and Evals

## Table: `agentsam_ai`

Meta: `table=agentsam_ai` `group=models-routing-evals` `rows=112` `tags=agentsam,d1,models-routing-evals,schema`

### Purpose

AI model/provider catalog and model capability metadata.

### Relationship hints

- `agentsam_fetch_domain_allowlist`
- `agentsam_guardrail_events`
- `agentsam_guardrail_rulesets`
- `agentsam_guardrails`
- `agentsam_health_daily`
- `agentsam_tool_chain`
- `agentsam_usage_rollups_daily`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, is_global INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, role_name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'active', mode TEXT NOT NULL DEFAULT 'orchestrator', safety_level TEXT NOT NULL DEFAULT 'strict', tenant_scope TEXT NOT NULL DEFAULT 'multi_tenant', allowed_tenants_json TEXT DEFAULT '[]', blocked_tenants_json TEXT DEFAULT '[]', auth_strategy TEXT DEFAULT 'zero_trust_plus_oauth', required_roles_json TEXT DEFAULT '["super_admin"]', requires_human_approval INTEGER NOT NULL DEFAULT 1, approvals_policy_json TEXT DEFAULT '{}', integrations_json TEXT DEFAULT '{}', mcp_services_json TEXT DEFAULT '[]', tool_permissions_json TEXT DEFAULT '{}', rate_limits_json TEXT DEFAULT '{}', budgets_json TEXT DEFAULT '{}', model_policy_json TEXT DEFAULT '{}', cost_policy_json TEXT DEFAULT '{}', pii_policy_json TEXT DEFAULT '{}', security_policy_json TEXT DEFAULT '{}', findings_policy_json TEXT DEFAULT '{}', notification_policy_json TEXT DEFAULT '{}', telemetry_enabled INTEGER NOT NULL DEFAULT 1, telemetry_policy_json TEXT DEFAULT '{}', last_health_check INTEGER, last_run_at INTEGER, last_error TEXT, config_version INTEGER NOT NULL DEFAULT 1, config_hash TEXT, notes TEXT, user_email TEXT, additional_alert_emails_json TEXT DEFAULT '[]', owner_user_id TEXT, backup_user_email TEXT, alert_escalation_email TEXT, memory_policy_json TEXT DEFAULT '{}', total_runs INTEGER DEFAULT 0, total_cost_usd REAL DEFAULT 0.0, avg_response_ms INTEGER DEFAULT 0, success_rate REAL DEFAULT 0.0, created_by TEXT NOT NULL DEFAULT 'sam_primeaux', created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch(), system_prompt TEXT, tool_invocation_style TEXT DEFAULT 'balanced', icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write', sort_order INTEGER NOT NULL DEFAULT 0, context_max_tokens INTEGER DEFAULT 1000000, output_max_tokens INTEGER DEFAULT 64000, thinking_mode TEXT DEFAULT 'adaptive', effort TEXT DEFAULT 'medium', person_uuid TEXT, provider TEXT, model_key TEXT, api_platform TEXT DEFAULT 'unknown', secret_key_name TEXT, size_class TEXT DEFAULT 'medium', billing_unit TEXT DEFAULT 'tokens', supports_cache INTEGER DEFAULT 0, supports_tools INTEGER DEFAULT 1, supports_vision INTEGER DEFAULT 0, supports_web_search INTEGER DEFAULT 0, supports_fast_mode INTEGER DEFAULT 0, context_default_tokens INTEGER DEFAULT 0, pricing_unit TEXT DEFAULT 'usd_per_mtok', pricing_source TEXT DEFAULT 'manual', input_rate_per_mtok REAL, output_rate_per_mtok REAL, cache_write_rate_per_mtok REAL, cache_read_rate_per_mtok REAL, web_search_per_1k_usd REAL DEFAULT 0, neurons_usd_per_1k REAL DEFAULT 0, cost_per_unit REAL, rpm_limit INTEGER DEFAULT 0, itpm_limit INTEGER DEFAULT 0, otpm_limit INTEGER DEFAULT 0, show_in_picker INTEGER DEFAULT 0, picker_eligible INTEGER DEFAULT 1, picker_group TEXT, features_json TEXT DEFAULT '{}', input_schema_json TEXT, supports_responses_api INTEGER DEFAULT 0, supports_parallel_tools INTEGER DEFAULT 1, supports_structured_output INTEGER DEFAULT 0, supports_prompt_cache INTEGER DEFAULT 0, supports_thinking INTEGER DEFAULT 0, requires_phase_param INTEGER DEFAULT 0, max_tool_calls_per_turn INTEGER DEFAULT 10
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `is_global` | `INTEGER` | 1 | `1` | 0 |
| 3 | `name` | `TEXT` | 1 | `None` | 0 |
| 4 | `role_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `description` | `TEXT` | 0 | `None` | 0 |
| 6 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 7 | `mode` | `TEXT` | 1 | `'orchestrator'` | 0 |
| 8 | `safety_level` | `TEXT` | 1 | `'strict'` | 0 |
| 9 | `tenant_scope` | `TEXT` | 1 | `'multi_tenant'` | 0 |
| 10 | `allowed_tenants_json` | `TEXT` | 0 | `'[]'` | 0 |
| 11 | `blocked_tenants_json` | `TEXT` | 0 | `'[]'` | 0 |
| 12 | `auth_strategy` | `TEXT` | 0 | `'zero_trust_plus_oauth'` | 0 |
| 13 | `required_roles_json` | `TEXT` | 0 | `'["super_admin"]'` | 0 |
| 14 | `requires_human_approval` | `INTEGER` | 1 | `1` | 0 |
| 15 | `approvals_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 16 | `integrations_json` | `TEXT` | 0 | `'{}'` | 0 |
| 17 | `mcp_services_json` | `TEXT` | 0 | `'[]'` | 0 |
| 18 | `tool_permissions_json` | `TEXT` | 0 | `'{}'` | 0 |
| 19 | `rate_limits_json` | `TEXT` | 0 | `'{}'` | 0 |
| 20 | `budgets_json` | `TEXT` | 0 | `'{}'` | 0 |
| 21 | `model_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 22 | `cost_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 23 | `pii_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 24 | `security_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 25 | `findings_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 26 | `notification_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 27 | `telemetry_enabled` | `INTEGER` | 1 | `1` | 0 |
| 28 | `telemetry_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 29 | `last_health_check` | `INTEGER` | 0 | `None` | 0 |
| 30 | `last_run_at` | `INTEGER` | 0 | `None` | 0 |
| 31 | `last_error` | `TEXT` | 0 | `None` | 0 |
| 32 | `config_version` | `INTEGER` | 1 | `1` | 0 |
| 33 | `config_hash` | `TEXT` | 0 | `None` | 0 |
| 34 | `notes` | `TEXT` | 0 | `None` | 0 |
| 35 | `user_email` | `TEXT` | 0 | `None` | 0 |
| 36 | `additional_alert_emails_json` | `TEXT` | 0 | `'[]'` | 0 |
| 37 | `owner_user_id` | `TEXT` | 0 | `None` | 0 |
| 38 | `backup_user_email` | `TEXT` | 0 | `None` | 0 |
| 39 | `alert_escalation_email` | `TEXT` | 0 | `None` | 0 |
| 40 | `memory_policy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 41 | `total_runs` | `INTEGER` | 0 | `0` | 0 |
| 42 | `total_cost_usd` | `REAL` | 0 | `0.0` | 0 |
| 43 | `avg_response_ms` | `INTEGER` | 0 | `0` | 0 |
| 44 | `success_rate` | `REAL` | 0 | `0.0` | 0 |
| 45 | `created_by` | `TEXT` | 1 | `'sam_primeaux'` | 0 |
| 46 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 47 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 48 | `system_prompt` | `TEXT` | 0 | `None` | 0 |
| 49 | `tool_invocation_style` | `TEXT` | 0 | `'balanced'` | 0 |
| 50 | `icon` | `TEXT` | 1 | `''` | 0 |
| 51 | `access_mode` | `TEXT` | 1 | `'read_write'` | 0 |
| 52 | `sort_order` | `INTEGER` | 1 | `0` | 0 |
| 53 | `context_max_tokens` | `INTEGER` | 0 | `1000000` | 0 |
| 54 | `output_max_tokens` | `INTEGER` | 0 | `64000` | 0 |
| 55 | `thinking_mode` | `TEXT` | 0 | `'adaptive'` | 0 |
| 56 | `effort` | `TEXT` | 0 | `'medium'` | 0 |
| 57 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 58 | `provider` | `TEXT` | 0 | `None` | 0 |
| 59 | `model_key` | `TEXT` | 0 | `None` | 0 |
| 60 | `api_platform` | `TEXT` | 0 | `'unknown'` | 0 |
| 61 | `secret_key_name` | `TEXT` | 0 | `None` | 0 |
| 62 | `size_class` | `TEXT` | 0 | `'medium'` | 0 |
| 63 | `billing_unit` | `TEXT` | 0 | `'tokens'` | 0 |
| 64 | `supports_cache` | `INTEGER` | 0 | `0` | 0 |
| 65 | `supports_tools` | `INTEGER` | 0 | `1` | 0 |
| 66 | `supports_vision` | `INTEGER` | 0 | `0` | 0 |
| 67 | `supports_web_search` | `INTEGER` | 0 | `0` | 0 |
| 68 | `supports_fast_mode` | `INTEGER` | 0 | `0` | 0 |
| 69 | `context_default_tokens` | `INTEGER` | 0 | `0` | 0 |
| 70 | `pricing_unit` | `TEXT` | 0 | `'usd_per_mtok'` | 0 |
| 71 | `pricing_source` | `TEXT` | 0 | `'manual'` | 0 |
| 72 | `input_rate_per_mtok` | `REAL` | 0 | `None` | 0 |
| 73 | `output_rate_per_mtok` | `REAL` | 0 | `None` | 0 |
| 74 | `cache_write_rate_per_mtok` | `REAL` | 0 | `None` | 0 |
| 75 | `cache_read_rate_per_mtok` | `REAL` | 0 | `None` | 0 |
| 76 | `web_search_per_1k_usd` | `REAL` | 0 | `0` | 0 |
| 77 | `neurons_usd_per_1k` | `REAL` | 0 | `0` | 0 |
| 78 | `cost_per_unit` | `REAL` | 0 | `None` | 0 |
| 79 | `rpm_limit` | `INTEGER` | 0 | `0` | 0 |
| 80 | `itpm_limit` | `INTEGER` | 0 | `0` | 0 |
| 81 | `otpm_limit` | `INTEGER` | 0 | `0` | 0 |
| 82 | `show_in_picker` | `INTEGER` | 0 | `0` | 0 |
| 83 | `picker_eligible` | `INTEGER` | 0 | `1` | 0 |
| 84 | `picker_group` | `TEXT` | 0 | `None` | 0 |
| 85 | `features_json` | `TEXT` | 0 | `'{}'` | 0 |
| 86 | `input_schema_json` | `TEXT` | 0 | `None` | 0 |
| 87 | `supports_responses_api` | `INTEGER` | 0 | `0` | 0 |
| 88 | `supports_parallel_tools` | `INTEGER` | 0 | `1` | 0 |
| 89 | `supports_structured_output` | `INTEGER` | 0 | `0` | 0 |
| 90 | `supports_prompt_cache` | `INTEGER` | 0 | `0` | 0 |
| 91 | `supports_thinking` | `INTEGER` | 0 | `0` | 0 |
| 92 | `requires_phase_param` | `INTEGER` | 0 | `0` | 0 |
| 93 | `max_tool_calls_per_turn` | `INTEGER` | 0 | `10` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `uix_agentsam_ai_provider_model_key` | 1 | `c` | 1 | `provider, model_key` |
| `sqlite_autoindex_agentsam_ai_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_ai (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  is_global INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  role_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  mode TEXT NOT NULL DEFAULT 'orchestrator',
  safety_level TEXT NOT NULL DEFAULT 'strict',
  tenant_scope TEXT NOT NULL DEFAULT 'multi_tenant',
  allowed_tenants_json TEXT DEFAULT '[]',
  blocked_tenants_json TEXT DEFAULT '[]',
  auth_strategy TEXT DEFAULT 'zero_trust_plus_oauth',
  required_roles_json TEXT DEFAULT '["super_admin"]',
  requires_human_approval INTEGER NOT NULL DEFAULT 1,
  approvals_policy_json TEXT DEFAULT '{}',
  integrations_json TEXT DEFAULT '{}',
  mcp_services_json TEXT DEFAULT '[]',
  tool_permissions_json TEXT DEFAULT '{}',
  rate_limits_json TEXT DEFAULT '{}',
  budgets_json TEXT DEFAULT '{}',
  model_policy_json TEXT DEFAULT '{}',
  cost_policy_json TEXT DEFAULT '{}',
  pii_policy_json TEXT DEFAULT '{}',
  security_policy_json TEXT DEFAULT '{}',
  findings_policy_json TEXT DEFAULT '{}',
  notification_policy_json TEXT DEFAULT '{}',
  telemetry_enabled INTEGER NOT NULL DEFAULT 1,
  telemetry_policy_json TEXT DEFAULT '{}',
  last_health_check INTEGER,
  last_run_at INTEGER,
  last_error TEXT,
  config_version INTEGER NOT NULL DEFAULT 1,
  config_hash TEXT,
  notes TEXT,
  user_email TEXT,
  additional_alert_emails_json TEXT DEFAULT '[]',
  owner_user_id TEXT,
  backup_user_email TEXT,
  alert_escalation_email TEXT,
  memory_policy_json TEXT DEFAULT '{}',
  total_runs INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0.0,
  avg_response_ms INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.0,
  created_by TEXT NOT NULL DEFAULT 'sam_primeaux',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, system_prompt TEXT, tool_invocation_style TEXT
  DEFAULT 'balanced'
  CHECK(tool_invocation_style IN ('aggressive', 'balanced', 'conservative')), icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), sort_order INTEGER NOT NULL DEFAULT 0, context_max_tokens INTEGER DEFAULT 1000000, output_max_tokens INTEGER DEFAULT 64000, thinking_mode TEXT DEFAULT 'adaptive', effort TEXT DEFAULT 'medium', person_uuid TEXT, provider       TEXT, model_key      TEXT, api_platform   TEXT DEFAULT 'unknown', secret_key_name TEXT, size_class     TEXT DEFAULT 'medium', billing_unit   TEXT DEFAULT 'tokens', supports_cache      INTEGER DEFAULT 0, supports_tools      INTEGER DEFAULT 1, supports_vision     INTEGER DEFAULT 0, supports_web_search INTEGER DEFAULT 0, supports_fast_mode  INTEGER DEFAULT 0, context_default_tokens INTEGER DEFAULT 0, pricing_unit            TEXT DEFAULT 'usd_per_mtok', pricing_source          TEXT DEFAULT 'manual', input_rate_per_mtok     REAL, output_rate_per_mtok    REAL, cache_write_rate_per_mtok REAL, cache_read_rate_per_mtok  REAL, web_search_per_1k_usd   REAL DEFAULT 0, neurons_usd_per_1k      REAL DEFAULT 0, cost_per_unit           REAL, rpm_limit  INTEGER DEFAULT 0, itpm_limit INTEGER DEFAULT 0, otpm_limit INTEGER DEFAULT 0, show_in_picker  INTEGER DEFAULT 0, picker_eligible INTEGER DEFAULT 1, picker_group    TEXT, features_json    TEXT DEFAULT '{}', input_schema_json TEXT, supports_responses_api INTEGER DEFAULT 0, supports_parallel_tools INTEGER DEFAULT 1, supports_structured_output INTEGER DEFAULT 0, supports_prompt_cache INTEGER DEFAULT 0, supports_thinking INTEGER DEFAULT 0, requires_phase_param INTEGER DEFAULT 0, max_tool_calls_per_turn INTEGER DEFAULT 10)
```

## Table: `agentsam_eval_cases`

Meta: `table=agentsam_eval_cases` `group=models-routing-evals` `rows=12` `tags=agentsam,d1,eval,models-routing-evals,schema`

### Purpose

Evaluation cases for model/tool/prompt quality testing.

### Relationship hints

- `agentsam_eval_runs`
- `agentsam_eval_suites`

### Compact columns

```txt
id TEXT PK DEFAULT 'evc_' || lower(hex(randomblob(8))), suite_id TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', input_prompt TEXT NOT NULL, expected_output TEXT, grading_criteria TEXT, tags TEXT DEFAULT '[]', is_edge_case INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 50, created_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'evc_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `suite_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 3 | `input_prompt` | `TEXT` | 1 | `None` | 0 |
| 4 | `expected_output` | `TEXT` | 0 | `None` | 0 |
| 5 | `grading_criteria` | `TEXT` | 0 | `None` | 0 |
| 6 | `tags` | `TEXT` | 0 | `'[]'` | 0 |
| 7 | `is_edge_case` | `INTEGER` | 0 | `0` | 0 |
| 8 | `sort_order` | `INTEGER` | 0 | `50` | 0 |
| 9 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_eval_cases_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_eval_cases (
  id TEXT PRIMARY KEY DEFAULT ('evc_' || lower(hex(randomblob(8)))),
  suite_id TEXT NOT NULL REFERENCES agentsam_eval_suites(id),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  input_prompt TEXT NOT NULL,
  expected_output TEXT,
  grading_criteria TEXT,
  tags TEXT DEFAULT '[]',
  is_edge_case INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## Table: `agentsam_eval_suites`

Meta: `table=agentsam_eval_suites` `group=models-routing-evals` `rows=8` `tags=agentsam,d1,eval,models-routing-evals,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, name, description, provider, mode, task_type, is_active.

### Relationship hints

- `agentsam_eval_cases`
- `agentsam_eval_runs`

### Compact columns

```txt
id TEXT PK DEFAULT 'evs_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', name TEXT NOT NULL, description TEXT, provider TEXT, mode TEXT DEFAULT 'auto', task_type TEXT, is_active INTEGER DEFAULT 1, run_count INTEGER DEFAULT 0, last_run_at TEXT, created_by TEXT DEFAULT 'sam_primeaux', created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'evs_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 2 | `name` | `TEXT` | 1 | `None` | 0 |
| 3 | `description` | `TEXT` | 0 | `None` | 0 |
| 4 | `provider` | `TEXT` | 0 | `None` | 0 |
| 5 | `mode` | `TEXT` | 0 | `'auto'` | 0 |
| 6 | `task_type` | `TEXT` | 0 | `None` | 0 |
| 7 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 8 | `run_count` | `INTEGER` | 0 | `0` | 0 |
| 9 | `last_run_at` | `TEXT` | 0 | `None` | 0 |
| 10 | `created_by` | `TEXT` | 0 | `'sam_primeaux'` | 0 |
| 11 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 12 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_eval_suites_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_eval_suites (
  id TEXT PRIMARY KEY DEFAULT ('evs_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  name TEXT NOT NULL,
  description TEXT,
  provider TEXT,
  mode TEXT CHECK(mode IN ('ask','plan','agent','debug','auto','ui_review','mcp','terminal','deploy','cost','context')) DEFAULT 'auto',
  task_type TEXT,
  is_active INTEGER DEFAULT 1,
  run_count INTEGER DEFAULT 0,
  last_run_at TEXT,
  created_by TEXT DEFAULT 'sam_primeaux',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

## Table: `agentsam_fetch_domain_allowlist`

Meta: `table=agentsam_fetch_domain_allowlist` `group=models-routing-evals` `rows=18` `tags=agentsam,d1,models-routing-evals,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, workspace_id, host, created_at, person_uuid.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT '', host TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `''` | 0 |
| 3 | `host` | `TEXT` | 1 | `None` | 0 |
| 4 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 5 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_fetch_domain_user` | 0 | `c` | 0 | `user_id, workspace_id` |
| `sqlite_autoindex_agentsam_fetch_domain_allowlist_2` | 1 | `u` | 0 | `user_id, workspace_id, host` |
| `sqlite_autoindex_agentsam_fetch_domain_allowlist_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_fetch_domain_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  UNIQUE (user_id, workspace_id, host)
)
```

## Table: `agentsam_guardrail_events`

Meta: `table=agentsam_guardrail_events` `group=models-routing-evals` `rows=0` `tags=agentsam,d1,guardrail,models-routing-evals,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, event_scope, tenant_id, workspace_id, user_id, identity_profile_id, session_id, conversation_id.

### Relationship hints

- `agentsam_guardrail_rulesets`
- `agentsam_guardrails`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, event_scope TEXT NOT NULL, tenant_id TEXT, workspace_id TEXT, user_id TEXT, identity_profile_id TEXT, session_id TEXT, conversation_id TEXT, request_id TEXT, run_group_id TEXT, guardrail_id TEXT, guardrail_key TEXT NOT NULL, ruleset_id TEXT, ruleset_key TEXT, category TEXT NOT NULL, severity TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_name TEXT, route_path TEXT, tool_name TEXT, model_key TEXT, decision TEXT NOT NULL, reason TEXT, input_preview TEXT, output_preview TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `event_scope` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `identity_profile_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `conversation_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `request_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `run_group_id` | `TEXT` | 0 | `None` | 0 |
| 10 | `guardrail_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `guardrail_key` | `TEXT` | 1 | `None` | 0 |
| 12 | `ruleset_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `ruleset_key` | `TEXT` | 0 | `None` | 0 |
| 14 | `category` | `TEXT` | 1 | `None` | 0 |
| 15 | `severity` | `TEXT` | 1 | `None` | 0 |
| 16 | `action` | `TEXT` | 1 | `None` | 0 |
| 17 | `target_type` | `TEXT` | 1 | `None` | 0 |
| 18 | `target_name` | `TEXT` | 0 | `None` | 0 |
| 19 | `route_path` | `TEXT` | 0 | `None` | 0 |
| 20 | `tool_name` | `TEXT` | 0 | `None` | 0 |
| 21 | `model_key` | `TEXT` | 0 | `None` | 0 |
| 22 | `decision` | `TEXT` | 1 | `None` | 0 |
| 23 | `reason` | `TEXT` | 0 | `None` | 0 |
| 24 | `input_preview` | `TEXT` | 0 | `None` | 0 |
| 25 | `output_preview` | `TEXT` | 0 | `None` | 0 |
| 26 | `metadata_json` | `TEXT` | 1 | `'{}'` | 0 |
| 27 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_guardrail_events_target` | 0 | `c` | 0 | `target_type, tool_name, route_path, created_at` |
| `idx_agentsam_guardrail_events_key` | 0 | `c` | 0 | `guardrail_key, decision, created_at` |
| `idx_agentsam_guardrail_events_request` | 0 | `c` | 0 | `request_id, created_at` |
| `idx_agentsam_guardrail_events_workspace` | 0 | `c` | 0 | `tenant_id, workspace_id, created_at` |
| `sqlite_autoindex_agentsam_guardrail_events_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_guardrail_events (
  id TEXT PRIMARY KEY,

  event_scope TEXT NOT NULL CHECK (
    event_scope IN ('global', 'tenant', 'workspace', 'user', 'session')
  ),

  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  identity_profile_id TEXT,

  session_id TEXT,
  conversation_id TEXT,
  request_id TEXT,
  run_group_id TEXT,

  guardrail_id TEXT,
  guardrail_key TEXT NOT NULL,
  ruleset_id TEXT,
  ruleset_key TEXT,

  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  action TEXT NOT NULL,

  target_type TEXT NOT NULL,
  target_name TEXT,
  route_path TEXT,
  tool_name TEXT,
  model_key TEXT,

  decision TEXT NOT NULL CHECK (
    decision IN ('allowed', 'warned', 'approval_required', 'blocked', 'logged')
  ),

  reason TEXT,
  input_preview TEXT,
  output_preview TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (guardrail_id) REFERENCES agentsam_guardrails(id),
  FOREIGN KEY (ruleset_id) REFERENCES agentsam_guardrail_rulesets(id),

  CHECK (
    (event_scope = 'global')
    OR
    (event_scope = 'tenant' AND tenant_id IS NOT NULL)
    OR
    (event_scope = 'workspace' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
    OR
    (event_scope = 'user' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL AND user_id IS NOT NULL)
    OR
    (event_scope = 'session' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
  )
)
```

## Table: `agentsam_guardrail_rulesets`

Meta: `table=agentsam_guardrail_rulesets` `group=models-routing-evals` `rows=2` `tags=agentsam,d1,guardrail,models-routing-evals,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, ruleset_key, title, description, scope, tenant_id, workspace_id, user_id.

### Relationship hints

- `agentsam_guardrail_events`
- `agentsam_guardrails`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, ruleset_key TEXT NOT NULL, title TEXT NOT NULL, description TEXT, scope TEXT NOT NULL, tenant_id TEXT, workspace_id TEXT, user_id TEXT, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', guardrail_keys_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}', is_enabled INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL DEFAULT 100, created_by TEXT, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `ruleset_key` | `TEXT` | 1 | `None` | 0 |
| 2 | `title` | `TEXT` | 1 | `None` | 0 |
| 3 | `description` | `TEXT` | 0 | `None` | 0 |
| 4 | `scope` | `TEXT` | 1 | `None` | 0 |
| 5 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `version` | `INTEGER` | 1 | `1` | 0 |
| 9 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 10 | `guardrail_keys_json` | `TEXT` | 1 | `'[]'` | 0 |
| 11 | `metadata_json` | `TEXT` | 1 | `'{}'` | 0 |
| 12 | `is_enabled` | `INTEGER` | 1 | `1` | 0 |
| 13 | `priority` | `INTEGER` | 1 | `100` | 0 |
| 14 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 15 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 16 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_guardrail_rulesets_scope_enabled` | 0 | `c` | 0 | `tenant_id, workspace_id, scope, status, is_enabled, priority` |
| `idx_agentsam_guardrail_rulesets_key` | 0 | `c` | 0 | `ruleset_key, status, is_enabled` |
| `idx_agentsam_guardrail_rulesets_scope` | 0 | `c` | 0 | `scope, tenant_id, workspace_id, user_id, is_enabled, priority` |
| `sqlite_autoindex_agentsam_guardrail_rulesets_2` | 1 | `u` | 0 | `scope, tenant_id, workspace_id, user_id, ruleset_key, version` |
| `sqlite_autoindex_agentsam_guardrail_rulesets_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_guardrail_rulesets (
  id TEXT PRIMARY KEY,
  ruleset_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  scope TEXT NOT NULL CHECK (
    scope IN ('global', 'tenant', 'workspace', 'user', 'session')
  ),

  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,

  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('draft', 'active', 'archived')
  ),

  guardrail_keys_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',

  is_enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  CHECK (
    (scope = 'global' AND tenant_id IS NULL AND workspace_id IS NULL)
    OR
    (scope = 'tenant' AND tenant_id IS NOT NULL)
    OR
    (scope = 'workspace' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
    OR
    (scope = 'user' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL AND user_id IS NOT NULL)
    OR
    (scope = 'session' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
  ),

  UNIQUE(scope, tenant_id, workspace_id, user_id, ruleset_key, version)
)
```

## Table: `agentsam_guardrails`

Meta: `table=agentsam_guardrails` `group=models-routing-evals` `rows=13` `tags=agentsam,d1,guardrail,models-routing-evals,schema`

### Purpose

Guardrail rule definitions for safety, governance, and tool/action blocking.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, scope TEXT NOT NULL, tenant_id TEXT, workspace_id TEXT, user_id TEXT, guardrail_key TEXT NOT NULL, title TEXT NOT NULL, description TEXT, category TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'medium', action TEXT NOT NULL DEFAULT 'warn', applies_to TEXT NOT NULL DEFAULT 'agent', matcher_json TEXT NOT NULL DEFAULT '{}', policy_json TEXT NOT NULL DEFAULT '{}', metadata_json TEXT NOT NULL DEFAULT '{}', is_enabled INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL DEFAULT 100, created_by TEXT, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), tags_json TEXT DEFAULT '[]', version INTEGER DEFAULT 1
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `scope` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `guardrail_key` | `TEXT` | 1 | `None` | 0 |
| 6 | `title` | `TEXT` | 1 | `None` | 0 |
| 7 | `description` | `TEXT` | 0 | `None` | 0 |
| 8 | `category` | `TEXT` | 1 | `None` | 0 |
| 9 | `severity` | `TEXT` | 1 | `'medium'` | 0 |
| 10 | `action` | `TEXT` | 1 | `'warn'` | 0 |
| 11 | `applies_to` | `TEXT` | 1 | `'agent'` | 0 |
| 12 | `matcher_json` | `TEXT` | 1 | `'{}'` | 0 |
| 13 | `policy_json` | `TEXT` | 1 | `'{}'` | 0 |
| 14 | `metadata_json` | `TEXT` | 1 | `'{}'` | 0 |
| 15 | `is_enabled` | `INTEGER` | 1 | `1` | 0 |
| 16 | `priority` | `INTEGER` | 1 | `100` | 0 |
| 17 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 18 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 19 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 20 | `tags_json` | `TEXT` | 0 | `'[]'` | 0 |
| 21 | `version` | `INTEGER` | 0 | `1` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_guardrails_key_enabled` | 0 | `c` | 0 | `guardrail_key, is_enabled` |
| `idx_agentsam_guardrails_scope_enabled` | 0 | `c` | 0 | `tenant_id, workspace_id, scope, is_enabled, priority` |
| `idx_agentsam_guardrails_category` | 0 | `c` | 0 | `category, applies_to, action, is_enabled` |
| `idx_agentsam_guardrails_key` | 0 | `c` | 0 | `guardrail_key, is_enabled` |
| `idx_agentsam_guardrails_scope_lookup` | 0 | `c` | 0 | `scope, tenant_id, workspace_id, is_enabled, priority` |
| `sqlite_autoindex_agentsam_guardrails_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_guardrails (
  id TEXT PRIMARY KEY,

  scope TEXT NOT NULL CHECK (
    scope IN ('global', 'tenant', 'workspace', 'user', 'session')
  ),

  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,

  guardrail_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  category TEXT NOT NULL CHECK (
    category IN (
      'tenant_isolation',
      'tool_permission',
      'secret_protection',
      'deploy_safety',
      'data_access',
      'model_routing',
      'rag_retrieval',
      'browser_terminal',
      'code_modification',
      'email_external_action',
      'cost_budget',
      'compliance',
      'general'
    )
  ),

  severity TEXT NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('info', 'low', 'medium', 'high', 'critical')
  ),

  action TEXT NOT NULL DEFAULT 'warn' CHECK (
    action IN ('allow', 'warn', 'require_approval', 'block', 'log_only')
  ),

  applies_to TEXT NOT NULL DEFAULT 'agent' CHECK (
    applies_to IN (
      'agent',
      'mcp_tool',
      'model',
      'route',
      'integration',
      'rag',
      'browser',
      'terminal',
      'deploy',
      'email',
      'storage',
      'all'
    )
  ),

  matcher_json TEXT NOT NULL DEFAULT '{}',
  policy_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',

  is_enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), tags_json TEXT DEFAULT '[]', version INTEGER DEFAULT 1,

  CHECK (
    (scope = 'global' AND tenant_id IS NULL AND workspace_id IS NULL)
    OR
    (scope = 'tenant' AND tenant_id IS NOT NULL)
    OR
    (scope = 'workspace' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
    OR
    (scope = 'user' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL AND user_id IS NOT NULL)
    OR
    (scope = 'session' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
  )
)
```

## Table: `agentsam_health_daily`

Meta: `table=agentsam_health_daily` `group=models-routing-evals` `rows=3` `tags=agentsam,d1,health,models-routing-evals,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, day, health_status, snapshot_count, green_count, yellow_count, red_count.

### Relationship hints

- `agentsam_deployment_health`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'ahd_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', day TEXT NOT NULL, health_status TEXT NOT NULL DEFAULT 'unknown', snapshot_count INTEGER NOT NULL DEFAULT 0, green_count INTEGER NOT NULL DEFAULT 0, yellow_count INTEGER NOT NULL DEFAULT 0, red_count INTEGER NOT NULL DEFAULT 0, avg_tools_degraded REAL DEFAULT 0, avg_rd_total REAL DEFAULT 0, avg_tel_cost_24h REAL DEFAULT 0, worst_status TEXT, health_notes TEXT, rolled_up_at TEXT NOT NULL DEFAULT datetime('now'), workspace_id TEXT, sla_breach_count INTEGER DEFAULT 0, timed_out_count INTEGER DEFAULT 0
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'ahd_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 2 | `day` | `TEXT` | 1 | `None` | 0 |
| 3 | `health_status` | `TEXT` | 1 | `'unknown'` | 0 |
| 4 | `snapshot_count` | `INTEGER` | 1 | `0` | 0 |
| 5 | `green_count` | `INTEGER` | 1 | `0` | 0 |
| 6 | `yellow_count` | `INTEGER` | 1 | `0` | 0 |
| 7 | `red_count` | `INTEGER` | 1 | `0` | 0 |
| 8 | `avg_tools_degraded` | `REAL` | 0 | `0` | 0 |
| 9 | `avg_rd_total` | `REAL` | 0 | `0` | 0 |
| 10 | `avg_tel_cost_24h` | `REAL` | 0 | `0` | 0 |
| 11 | `worst_status` | `TEXT` | 0 | `None` | 0 |
| 12 | `health_notes` | `TEXT` | 0 | `None` | 0 |
| 13 | `rolled_up_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 14 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 15 | `sla_breach_count` | `INTEGER` | 0 | `0` | 0 |
| 16 | `timed_out_count` | `INTEGER` | 0 | `0` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_health_daily_workspace` | 0 | `c` | 0 | `workspace_id, tenant_id, day` |
| `sqlite_autoindex_agentsam_health_daily_2` | 1 | `u` | 0 | `tenant_id, day` |
| `sqlite_autoindex_agentsam_health_daily_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_health_daily (
  id TEXT PRIMARY KEY DEFAULT ('ahd_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  day TEXT NOT NULL,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  green_count INTEGER NOT NULL DEFAULT 0,
  yellow_count INTEGER NOT NULL DEFAULT 0,
  red_count INTEGER NOT NULL DEFAULT 0,
  avg_tools_degraded REAL DEFAULT 0,
  avg_rd_total REAL DEFAULT 0,
  avg_tel_cost_24h REAL DEFAULT 0,
  worst_status TEXT,
  health_notes TEXT,
  rolled_up_at TEXT NOT NULL DEFAULT (datetime('now')), workspace_id TEXT, sla_breach_count INTEGER DEFAULT 0, timed_out_count INTEGER DEFAULT 0,
  UNIQUE(tenant_id, day)
)
```

## Table: `agentsam_model_drift_signals`

Meta: `table=agentsam_model_drift_signals` `group=models-routing-evals` `rows=3` `tags=agentsam,d1,model,models-routing-evals,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, model_key, provider, task_type, case_id, baseline_score, baseline_run_id, current_score.

### Relationship hints

- `agentsam_eval_cases`
- `agentsam_model_tier`

### Compact columns

```txt
id TEXT PK DEFAULT 'mds_' || lower(hex(randomblob(8))), model_key TEXT NOT NULL, provider TEXT NOT NULL, task_type TEXT NOT NULL, case_id TEXT NOT NULL, baseline_score REAL NOT NULL, baseline_run_id TEXT, current_score REAL NOT NULL, current_run_id TEXT, delta REAL NOT NULL, delta_pct REAL NOT NULL, detected_at INTEGER NOT NULL DEFAULT unixepoch(), severity TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0, acknowledged_by TEXT, acknowledged_at INTEGER, notes TEXT, ai_model_id TEXT, routing_arm_paused INTEGER DEFAULT 0, routing_arm_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'mds_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `model_key` | `TEXT` | 1 | `None` | 0 |
| 2 | `provider` | `TEXT` | 1 | `None` | 0 |
| 3 | `task_type` | `TEXT` | 1 | `None` | 0 |
| 4 | `case_id` | `TEXT` | 1 | `None` | 0 |
| 5 | `baseline_score` | `REAL` | 1 | `None` | 0 |
| 6 | `baseline_run_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `current_score` | `REAL` | 1 | `None` | 0 |
| 8 | `current_run_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `delta` | `REAL` | 1 | `None` | 0 |
| 10 | `delta_pct` | `REAL` | 1 | `None` | 0 |
| 11 | `detected_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 12 | `severity` | `TEXT` | 1 | `None` | 0 |
| 13 | `acknowledged` | `INTEGER` | 1 | `0` | 0 |
| 14 | `acknowledged_by` | `TEXT` | 0 | `None` | 0 |
| 15 | `acknowledged_at` | `INTEGER` | 0 | `None` | 0 |
| 16 | `notes` | `TEXT` | 0 | `None` | 0 |
| 17 | `ai_model_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `routing_arm_paused` | `INTEGER` | 0 | `0` | 0 |
| 19 | `routing_arm_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_mds_severity` | 0 | `c` | 0 | `severity, acknowledged, detected_at` |
| `sqlite_autoindex_agentsam_model_drift_signals_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_model_drift_signals (
  id TEXT PRIMARY KEY DEFAULT ('mds_' || lower(hex(randomblob(8)))),
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  task_type TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES agentsam_eval_cases(id),
  baseline_score REAL NOT NULL,
  baseline_run_id TEXT REFERENCES agentsam_eval_runs(id),
  current_score REAL NOT NULL,
  current_run_id TEXT REFERENCES agentsam_eval_runs(id),
  delta REAL NOT NULL,
  delta_pct REAL NOT NULL,
  detected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  severity TEXT NOT NULL CHECK(severity IN ('info','warn','regression','breaking')),
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at INTEGER,
  notes TEXT
, ai_model_id TEXT, routing_arm_paused INTEGER DEFAULT 0, routing_arm_id     TEXT)
```

## Table: `agentsam_model_tier`

Meta: `table=agentsam_model_tier` `group=models-routing-evals` `rows=5` `tags=agentsam,d1,model,models-routing-evals,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id, tier_level, tier_name, model_id, api_platform, role_description, escalate_if_confidence_below.

### Relationship hints

- `agentsam_ai`
- `agentsam_model_drift_signals`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'tier_' || lower(hex(randomblob(6))), workspace_id TEXT NOT NULL, tier_level INTEGER NOT NULL, tier_name TEXT NOT NULL, model_id TEXT, api_platform TEXT, role_description TEXT NOT NULL, escalate_if_confidence_below REAL DEFAULT 0.75, escalate_after_failures INTEGER DEFAULT 1, max_context_tokens INTEGER DEFAULT 4096, max_output_tokens INTEGER DEFAULT 1024, cost_tier TEXT DEFAULT 'free', is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), fallback_model_id TEXT, routing_arm_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'tier_' || lower(hex(randomblob(6)))` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tier_level` | `INTEGER` | 1 | `None` | 0 |
| 3 | `tier_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `model_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `api_platform` | `TEXT` | 0 | `None` | 0 |
| 6 | `role_description` | `TEXT` | 1 | `None` | 0 |
| 7 | `escalate_if_confidence_below` | `REAL` | 0 | `0.75` | 0 |
| 8 | `escalate_after_failures` | `INTEGER` | 0 | `1` | 0 |
| 9 | `max_context_tokens` | `INTEGER` | 0 | `4096` | 0 |
| 10 | `max_output_tokens` | `INTEGER` | 0 | `1024` | 0 |
| 11 | `cost_tier` | `TEXT` | 0 | `'free'` | 0 |
| 12 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 13 | `sort_order` | `INTEGER` | 1 | `0` | 0 |
| 14 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 15 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 16 | `fallback_model_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `routing_arm_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_model_tier_2` | 1 | `u` | 0 | `workspace_id, tier_level` |
| `sqlite_autoindex_agentsam_model_tier_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_model_tier" (
      id TEXT PRIMARY KEY DEFAULT ('tier_' || lower(hex(randomblob(6)))),
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      tier_level INTEGER NOT NULL CHECK(tier_level BETWEEN 0 AND 4),
      tier_name TEXT NOT NULL,
      model_id TEXT,
      api_platform TEXT,
      role_description TEXT NOT NULL,
      escalate_if_confidence_below REAL DEFAULT 0.75,
      escalate_after_failures INTEGER DEFAULT 1,
      max_context_tokens INTEGER DEFAULT 4096,
      max_output_tokens INTEGER DEFAULT 1024,
      cost_tier TEXT DEFAULT 'free' CHECK(cost_tier IN ('free','low','standard','high')),
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), fallback_model_id TEXT, routing_arm_id    TEXT,
      UNIQUE(workspace_id, tier_level)
    )
```

## Table: `agentsam_prompt_cache_keys`

Meta: `table=agentsam_prompt_cache_keys` `group=models-routing-evals` `rows=0` `tags=agentsam,d1,models-routing-evals,prompt,schema`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, provider, model_key, cache_key_hash, cache_type, token_count, write_cost_usd.

### Relationship hints

- `agentsam_prompt_versions`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'pck_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', provider TEXT NOT NULL, model_key TEXT NOT NULL, cache_key_hash TEXT NOT NULL, cache_type TEXT DEFAULT 'ephemeral', token_count INTEGER DEFAULT 0, write_cost_usd REAL DEFAULT 0, read_count INTEGER DEFAULT 0, total_read_savings_usd REAL DEFAULT 0, first_written_at TEXT NOT NULL DEFAULT datetime('now'), last_read_at TEXT, expires_at TEXT, source_type TEXT, source_id TEXT, workspace_id TEXT, agent_id TEXT, session_id TEXT, user_id TEXT, prompt_version_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'pck_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 2 | `provider` | `TEXT` | 1 | `None` | 0 |
| 3 | `model_key` | `TEXT` | 1 | `None` | 0 |
| 4 | `cache_key_hash` | `TEXT` | 1 | `None` | 0 |
| 5 | `cache_type` | `TEXT` | 0 | `'ephemeral'` | 0 |
| 6 | `token_count` | `INTEGER` | 0 | `0` | 0 |
| 7 | `write_cost_usd` | `REAL` | 0 | `0` | 0 |
| 8 | `read_count` | `INTEGER` | 0 | `0` | 0 |
| 9 | `total_read_savings_usd` | `REAL` | 0 | `0` | 0 |
| 10 | `first_written_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 11 | `last_read_at` | `TEXT` | 0 | `None` | 0 |
| 12 | `expires_at` | `TEXT` | 0 | `None` | 0 |
| 13 | `source_type` | `TEXT` | 0 | `None` | 0 |
| 14 | `source_id` | `TEXT` | 0 | `None` | 0 |
| 15 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `prompt_version_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_prompt_cache_workspace` | 0 | `c` | 0 | `workspace_id, agent_id` |
| `sqlite_autoindex_agentsam_prompt_cache_keys_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_prompt_cache_keys (
  id TEXT PRIMARY KEY DEFAULT ('pck_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  cache_key_hash TEXT NOT NULL,
  cache_type TEXT CHECK(cache_type IN ('5m','1h','ephemeral','auto')) DEFAULT 'ephemeral',
  token_count INTEGER DEFAULT 0,
  write_cost_usd REAL DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  total_read_savings_usd REAL DEFAULT 0,
  first_written_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_at TEXT,
  expires_at TEXT,
  source_type TEXT,
  source_id TEXT
, workspace_id TEXT, agent_id TEXT, session_id TEXT, user_id TEXT, prompt_version_id TEXT)
```

## Table: `agentsam_prompt_versions`

Meta: `table=agentsam_prompt_versions` `group=models-routing-evals` `rows=11` `tags=agentsam,d1,models-routing-evals,prompt,schema`

### Purpose

Versioned system/role/prompt records for rollback and prompt governance.

### Relationship hints

- `agentsam_prompt_cache_keys`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'pv_' || lower(hex(randomblob(8))), prompt_key TEXT NOT NULL, version INTEGER NOT NULL, prompt_hash TEXT NOT NULL, body TEXT NOT NULL, body_tokens INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 0, superseded_by TEXT, notes TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), tenant_id TEXT, workspace_id TEXT, agent_id TEXT, prompt_kind TEXT, status TEXT, user_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'pv_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `prompt_key` | `TEXT` | 1 | `None` | 0 |
| 2 | `version` | `INTEGER` | 1 | `None` | 0 |
| 3 | `prompt_hash` | `TEXT` | 1 | `None` | 0 |
| 4 | `body` | `TEXT` | 1 | `None` | 0 |
| 5 | `body_tokens` | `INTEGER` | 1 | `None` | 0 |
| 6 | `is_active` | `INTEGER` | 1 | `0` | 0 |
| 7 | `superseded_by` | `TEXT` | 0 | `None` | 0 |
| 8 | `notes` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 10 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `prompt_kind` | `TEXT` | 0 | `None` | 0 |
| 14 | `status` | `TEXT` | 0 | `None` | 0 |
| 15 | `user_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_pv_active` | 0 | `c` | 0 | `prompt_key, is_active` |
| `sqlite_autoindex_agentsam_prompt_versions_3` | 1 | `u` | 0 | `prompt_hash` |
| `sqlite_autoindex_agentsam_prompt_versions_2` | 1 | `u` | 0 | `prompt_key, version` |
| `sqlite_autoindex_agentsam_prompt_versions_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_prompt_versions (
  id TEXT PRIMARY KEY DEFAULT ('pv_' || lower(hex(randomblob(8)))),
  prompt_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_hash TEXT NOT NULL,
  body TEXT NOT NULL,
  body_tokens INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  superseded_by TEXT REFERENCES agentsam_prompt_versions(id),
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()), tenant_id TEXT, workspace_id TEXT, agent_id TEXT, prompt_kind TEXT, status TEXT, user_id TEXT,
  UNIQUE(prompt_key, version),
  UNIQUE(prompt_hash)
)
```

## Table: `agentsam_routing_arms`

Meta: `table=agentsam_routing_arms` `group=models-routing-evals` `rows=57` `tags=agentsam,d1,models-routing-evals,routing,schema`

### Purpose

Model routing state used for provider/model selection and performance tuning.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'ra_' || lower(hex(randomblob(8))), task_type TEXT NOT NULL, mode TEXT NOT NULL, model_key TEXT NOT NULL, provider TEXT NOT NULL, success_alpha REAL NOT NULL DEFAULT 1.0, success_beta REAL NOT NULL DEFAULT 1.0, cost_n INTEGER NOT NULL DEFAULT 0, cost_mean REAL NOT NULL DEFAULT 0, cost_m2 REAL NOT NULL DEFAULT 0, latency_n INTEGER NOT NULL DEFAULT 0, latency_mean REAL NOT NULL DEFAULT 0, latency_m2 REAL NOT NULL DEFAULT 0, decayed_score REAL NOT NULL DEFAULT 0, last_decay_at INTEGER NOT NULL DEFAULT unixepoch(), is_eligible INTEGER NOT NULL DEFAULT 1, is_paused INTEGER NOT NULL DEFAULT 0, pause_reason TEXT, updated_at INTEGER NOT NULL DEFAULT unixepoch(), ai_model_id TEXT, last_chain_id TEXT, last_plan_id TEXT, avg_quality_score REAL DEFAULT 0, quality_n INTEGER DEFAULT 0, max_cost_per_call_usd REAL, budget_exhausted INTEGER DEFAULT 0, drift_signal_id TEXT, intent_slug TEXT, total_executions INTEGER DEFAULT 0, workflow_agent TEXT, tools_json TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1, reasoning_effort TEXT DEFAULT 'medium', workspace_id TEXT DEFAULT 'ws_inneranimalmedia', fallback_model_key TEXT, supports_tools INTEGER DEFAULT 1, priority INTEGER DEFAULT 50
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'ra_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `task_type` | `TEXT` | 1 | `None` | 0 |
| 2 | `mode` | `TEXT` | 1 | `None` | 0 |
| 3 | `model_key` | `TEXT` | 1 | `None` | 0 |
| 4 | `provider` | `TEXT` | 1 | `None` | 0 |
| 5 | `success_alpha` | `REAL` | 1 | `1.0` | 0 |
| 6 | `success_beta` | `REAL` | 1 | `1.0` | 0 |
| 7 | `cost_n` | `INTEGER` | 1 | `0` | 0 |
| 8 | `cost_mean` | `REAL` | 1 | `0` | 0 |
| 9 | `cost_m2` | `REAL` | 1 | `0` | 0 |
| 10 | `latency_n` | `INTEGER` | 1 | `0` | 0 |
| 11 | `latency_mean` | `REAL` | 1 | `0` | 0 |
| 12 | `latency_m2` | `REAL` | 1 | `0` | 0 |
| 13 | `decayed_score` | `REAL` | 1 | `0` | 0 |
| 14 | `last_decay_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 15 | `is_eligible` | `INTEGER` | 1 | `1` | 0 |
| 16 | `is_paused` | `INTEGER` | 1 | `0` | 0 |
| 17 | `pause_reason` | `TEXT` | 0 | `None` | 0 |
| 18 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 19 | `ai_model_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `last_chain_id` | `TEXT` | 0 | `None` | 0 |
| 21 | `last_plan_id` | `TEXT` | 0 | `None` | 0 |
| 22 | `avg_quality_score` | `REAL` | 0 | `0` | 0 |
| 23 | `quality_n` | `INTEGER` | 0 | `0` | 0 |
| 24 | `max_cost_per_call_usd` | `REAL` | 0 | `None` | 0 |
| 25 | `budget_exhausted` | `INTEGER` | 0 | `0` | 0 |
| 26 | `drift_signal_id` | `TEXT` | 0 | `None` | 0 |
| 27 | `intent_slug` | `TEXT` | 0 | `None` | 0 |
| 28 | `total_executions` | `INTEGER` | 0 | `0` | 0 |
| 29 | `workflow_agent` | `TEXT` | 0 | `None` | 0 |
| 30 | `tools_json` | `TEXT` | 0 | `'[]'` | 0 |
| 31 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 32 | `reasoning_effort` | `TEXT` | 0 | `'medium'` | 0 |
| 33 | `workspace_id` | `TEXT` | 0 | `'ws_inneranimalmedia'` | 0 |
| 34 | `fallback_model_key` | `TEXT` | 0 | `None` | 0 |
| 35 | `supports_tools` | `INTEGER` | 0 | `1` | 0 |
| 36 | `priority` | `INTEGER` | 0 | `50` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_routing_arms_priority` | 0 | `c` | 0 | `task_type, mode, priority, is_active` |
| `idx_routing_arms_workspace_task` | 0 | `c` | 0 | `workspace_id, task_type, mode, is_active, is_eligible` |
| `idx_routing_arms_task_mode` | 0 | `c` | 0 | `task_type, mode, is_eligible` |
| `idx_routing_arms_intent_slug` | 0 | `c` | 0 | `intent_slug` |
| `idx_routing_arms_task_mode_eligible` | 0 | `c` | 0 | `task_type, mode, is_eligible, is_paused` |
| `idx_routing_arms_model` | 0 | `c` | 0 | `ai_model_id` |
| `idx_routing_arms_lookup` | 0 | `c` | 0 | `task_type, mode, is_eligible, is_paused, decayed_score` |
| `idx_arms_lookup` | 0 | `c` | 0 | `task_type, mode, is_eligible, is_paused` |
| `sqlite_autoindex_agentsam_routing_arms_2` | 1 | `u` | 0 | `task_type, mode, model_key` |
| `sqlite_autoindex_agentsam_routing_arms_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_routing_arms (
  id TEXT PRIMARY KEY DEFAULT ('ra_' || lower(hex(randomblob(8)))),
  task_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  success_alpha REAL NOT NULL DEFAULT 1.0,
  success_beta REAL NOT NULL DEFAULT 1.0,
  cost_n INTEGER NOT NULL DEFAULT 0,
  cost_mean REAL NOT NULL DEFAULT 0,
  cost_m2 REAL NOT NULL DEFAULT 0,
  latency_n INTEGER NOT NULL DEFAULT 0,
  latency_mean REAL NOT NULL DEFAULT 0,
  latency_m2 REAL NOT NULL DEFAULT 0,
  decayed_score REAL NOT NULL DEFAULT 0,
  last_decay_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_eligible INTEGER NOT NULL DEFAULT 1,
  is_paused INTEGER NOT NULL DEFAULT 0,
  pause_reason TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()), ai_model_id TEXT, last_chain_id   TEXT, last_plan_id    TEXT, avg_quality_score REAL DEFAULT 0, quality_n         INTEGER DEFAULT 0, max_cost_per_call_usd REAL, budget_exhausted      INTEGER DEFAULT 0, drift_signal_id TEXT, intent_slug TEXT, total_executions INTEGER DEFAULT 0, workflow_agent TEXT, tools_json TEXT DEFAULT '[]', is_active INTEGER DEFAULT 1, reasoning_effort TEXT DEFAULT 'medium', workspace_id TEXT DEFAULT 'ws_inneranimalmedia', fallback_model_key TEXT, supports_tools INTEGER DEFAULT 1, priority INTEGER DEFAULT 50,
  UNIQUE(task_type, mode, model_key)
)
```

## Table: `agentsam_usage_rollups_daily`

Meta: `table=agentsam_usage_rollups_daily` `group=models-routing-evals` `rows=26` `tags=agentsam,d1,models-routing-evals,schema,usage`

### Purpose

agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading columns: tenant_id, workspace_id, day, ai_calls, tokens_in, tokens_out, cost_usd, tool_calls.

### Relationship hints

- `agentsam_usage_events`
- `agentsam_workspace`

### Compact columns

```txt
tenant_id TEXT PK NOT NULL, workspace_id TEXT PK NOT NULL, day TEXT PK NOT NULL, ai_calls INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0, tool_successes INTEGER NOT NULL DEFAULT 0, tool_failures INTEGER NOT NULL DEFAULT 0, mcp_calls INTEGER NOT NULL DEFAULT 0, deployments INTEGER NOT NULL DEFAULT 0, webhook_events INTEGER NOT NULL DEFAULT 0, blocked_count INTEGER NOT NULL DEFAULT 0, error_count INTEGER NOT NULL DEFAULT 0, provider_breakdown_json TEXT DEFAULT '{}', top_tools_json TEXT DEFAULT '[]', rollup_source TEXT NOT NULL DEFAULT 'daily_cron', rolled_up_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `tenant_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 2 |
| 2 | `day` | `TEXT` | 1 | `None` | 3 |
| 3 | `ai_calls` | `INTEGER` | 1 | `0` | 0 |
| 4 | `tokens_in` | `INTEGER` | 1 | `0` | 0 |
| 5 | `tokens_out` | `INTEGER` | 1 | `0` | 0 |
| 6 | `cost_usd` | `REAL` | 1 | `0` | 0 |
| 7 | `tool_calls` | `INTEGER` | 1 | `0` | 0 |
| 8 | `tool_successes` | `INTEGER` | 1 | `0` | 0 |
| 9 | `tool_failures` | `INTEGER` | 1 | `0` | 0 |
| 10 | `mcp_calls` | `INTEGER` | 1 | `0` | 0 |
| 11 | `deployments` | `INTEGER` | 1 | `0` | 0 |
| 12 | `webhook_events` | `INTEGER` | 1 | `0` | 0 |
| 13 | `blocked_count` | `INTEGER` | 1 | `0` | 0 |
| 14 | `error_count` | `INTEGER` | 1 | `0` | 0 |
| 15 | `provider_breakdown_json` | `TEXT` | 0 | `'{}'` | 0 |
| 16 | `top_tools_json` | `TEXT` | 0 | `'[]'` | 0 |
| 17 | `rollup_source` | `TEXT` | 1 | `'daily_cron'` | 0 |
| 18 | `rolled_up_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_usage_rollups_daily_1` | 1 | `pk` | 0 | `tenant_id, workspace_id, day` |

### Create SQL

```sql
CREATE TABLE agentsam_usage_rollups_daily (
  tenant_id               TEXT NOT NULL,
  workspace_id            TEXT NOT NULL,
  day                     TEXT NOT NULL,
  ai_calls                INTEGER NOT NULL DEFAULT 0,
  tokens_in               INTEGER NOT NULL DEFAULT 0,
  tokens_out              INTEGER NOT NULL DEFAULT 0,
  cost_usd                REAL NOT NULL DEFAULT 0,
  tool_calls              INTEGER NOT NULL DEFAULT 0,
  tool_successes          INTEGER NOT NULL DEFAULT 0,
  tool_failures           INTEGER NOT NULL DEFAULT 0,
  mcp_calls               INTEGER NOT NULL DEFAULT 0,
  deployments             INTEGER NOT NULL DEFAULT 0,
  webhook_events          INTEGER NOT NULL DEFAULT 0,
  blocked_count           INTEGER NOT NULL DEFAULT 0,
  error_count             INTEGER NOT NULL DEFAULT 0,
  provider_breakdown_json TEXT DEFAULT '{}',
  top_tools_json          TEXT DEFAULT '[]',
  rollup_source           TEXT NOT NULL DEFAULT 'daily_cron',
  rolled_up_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tenant_id, workspace_id, day)
)
```

# Observability, Analytics, Health, and Errors

## Table: `agentsam_analytics`

Meta: `table=agentsam_analytics` `group=observability-analytics` `rows=3` `tags=agentsam,analytics,d1,observability-analytics,schema`

### Purpose

Analytics snapshot/rollup table for Agent Sam usage, costs, tools, and system health.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'aan_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, period TEXT NOT NULL, period_date TEXT, top_tool TEXT, top_tool_calls INTEGER DEFAULT 0, most_failed_tool TEXT, most_failed_tool_failure_rate REAL DEFAULT 0, total_tool_calls INTEGER DEFAULT 0, total_tool_successes INTEGER DEFAULT 0, total_tool_failures INTEGER DEFAULT 0, overall_tool_success_rate REAL DEFAULT 0, top_model TEXT, top_model_sessions INTEGER DEFAULT 0, top_provider TEXT, total_sessions INTEGER DEFAULT 0, total_input_tokens INTEGER DEFAULT 0, total_output_tokens INTEGER DEFAULT 0, total_cache_tokens INTEGER DEFAULT 0, total_cost_usd REAL DEFAULT 0, avg_cost_per_session REAL DEFAULT 0, avg_tokens_per_session REAL DEFAULT 0, cache_hit_rate REAL DEFAULT 0, cache_savings_usd REAL DEFAULT 0, tool_reliability_json TEXT DEFAULT '{}', model_breakdown_json TEXT DEFAULT '{}', broken_tools_json TEXT DEFAULT '[]', healthy_tools_json TEXT DEFAULT '[]', most_common_intent TEXT, avg_session_length_turns REAL DEFAULT 0, computed_at INTEGER NOT NULL DEFAULT unixepoch(), data_from INTEGER, data_to INTEGER, row_count_source INTEGER DEFAULT 0, notes TEXT, workspace_id TEXT, sla_breaches INTEGER DEFAULT 0, timed_out_calls INTEGER DEFAULT 0, time_tracked_seconds INTEGER DEFAULT 0
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'aan_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `period` | `TEXT` | 1 | `None` | 0 |
| 3 | `period_date` | `TEXT` | 0 | `None` | 0 |
| 4 | `top_tool` | `TEXT` | 0 | `None` | 0 |
| 5 | `top_tool_calls` | `INTEGER` | 0 | `0` | 0 |
| 6 | `most_failed_tool` | `TEXT` | 0 | `None` | 0 |
| 7 | `most_failed_tool_failure_rate` | `REAL` | 0 | `0` | 0 |
| 8 | `total_tool_calls` | `INTEGER` | 0 | `0` | 0 |
| 9 | `total_tool_successes` | `INTEGER` | 0 | `0` | 0 |
| 10 | `total_tool_failures` | `INTEGER` | 0 | `0` | 0 |
| 11 | `overall_tool_success_rate` | `REAL` | 0 | `0` | 0 |
| 12 | `top_model` | `TEXT` | 0 | `None` | 0 |
| 13 | `top_model_sessions` | `INTEGER` | 0 | `0` | 0 |
| 14 | `top_provider` | `TEXT` | 0 | `None` | 0 |
| 15 | `total_sessions` | `INTEGER` | 0 | `0` | 0 |
| 16 | `total_input_tokens` | `INTEGER` | 0 | `0` | 0 |
| 17 | `total_output_tokens` | `INTEGER` | 0 | `0` | 0 |
| 18 | `total_cache_tokens` | `INTEGER` | 0 | `0` | 0 |
| 19 | `total_cost_usd` | `REAL` | 0 | `0` | 0 |
| 20 | `avg_cost_per_session` | `REAL` | 0 | `0` | 0 |
| 21 | `avg_tokens_per_session` | `REAL` | 0 | `0` | 0 |
| 22 | `cache_hit_rate` | `REAL` | 0 | `0` | 0 |
| 23 | `cache_savings_usd` | `REAL` | 0 | `0` | 0 |
| 24 | `tool_reliability_json` | `TEXT` | 0 | `'{}'` | 0 |
| 25 | `model_breakdown_json` | `TEXT` | 0 | `'{}'` | 0 |
| 26 | `broken_tools_json` | `TEXT` | 0 | `'[]'` | 0 |
| 27 | `healthy_tools_json` | `TEXT` | 0 | `'[]'` | 0 |
| 28 | `most_common_intent` | `TEXT` | 0 | `None` | 0 |
| 29 | `avg_session_length_turns` | `REAL` | 0 | `0` | 0 |
| 30 | `computed_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 31 | `data_from` | `INTEGER` | 0 | `None` | 0 |
| 32 | `data_to` | `INTEGER` | 0 | `None` | 0 |
| 33 | `row_count_source` | `INTEGER` | 0 | `0` | 0 |
| 34 | `notes` | `TEXT` | 0 | `None` | 0 |
| 35 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 36 | `sla_breaches` | `INTEGER` | 0 | `0` | 0 |
| 37 | `timed_out_calls` | `INTEGER` | 0 | `0` | 0 |
| 38 | `time_tracked_seconds` | `INTEGER` | 0 | `0` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_analytics_workspace` | 0 | `c` | 0 | `workspace_id, tenant_id, period` |
| `idx_aan_tenant_period` | 0 | `c` | 0 | `tenant_id, period` |
| `idx_aan_period_date` | 0 | `c` | 0 | `period_date` |
| `idx_aan_computed` | 0 | `c` | 0 | `computed_at` |
| `sqlite_autoindex_agentsam_analytics_2` | 1 | `u` | 0 | `tenant_id, workspace_id, period, period_date` |
| `sqlite_autoindex_agentsam_analytics_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_analytics" (
  id                            TEXT    PRIMARY KEY DEFAULT ('aan_' || lower(hex(randomblob(8)))),
  tenant_id                     TEXT    NOT NULL,
  period                        TEXT    NOT NULL CHECK(period IN ('session','daily','weekly','monthly','alltime')),
  period_date                   TEXT,
  top_tool                      TEXT,
  top_tool_calls                INTEGER DEFAULT 0,
  most_failed_tool              TEXT,
  most_failed_tool_failure_rate REAL    DEFAULT 0,
  total_tool_calls              INTEGER DEFAULT 0,
  total_tool_successes          INTEGER DEFAULT 0,
  total_tool_failures           INTEGER DEFAULT 0,
  overall_tool_success_rate     REAL    DEFAULT 0,
  top_model                     TEXT,
  top_model_sessions            INTEGER DEFAULT 0,
  top_provider                  TEXT,
  total_sessions                INTEGER DEFAULT 0,
  total_input_tokens            INTEGER DEFAULT 0,
  total_output_tokens           INTEGER DEFAULT 0,
  total_cache_tokens            INTEGER DEFAULT 0,
  total_cost_usd                REAL    DEFAULT 0,
  avg_cost_per_session          REAL    DEFAULT 0,
  avg_tokens_per_session        REAL    DEFAULT 0,
  cache_hit_rate                REAL    DEFAULT 0,
  cache_savings_usd             REAL    DEFAULT 0,
  tool_reliability_json         TEXT    DEFAULT '{}',
  model_breakdown_json          TEXT    DEFAULT '{}',
  broken_tools_json             TEXT    DEFAULT '[]',
  healthy_tools_json            TEXT    DEFAULT '[]',
  most_common_intent            TEXT,
  avg_session_length_turns      REAL    DEFAULT 0,
  computed_at                   INTEGER NOT NULL DEFAULT (unixepoch()),
  data_from                     INTEGER,
  data_to                       INTEGER,
  row_count_source              INTEGER DEFAULT 0,
  notes                         TEXT,
  workspace_id                  TEXT,
  sla_breaches                  INTEGER DEFAULT 0,
  timed_out_calls               INTEGER DEFAULT 0,
  time_tracked_seconds          INTEGER DEFAULT 0,
  UNIQUE(tenant_id, workspace_id, period, period_date)
)
```

## Table: `agentsam_deployment_health`

Meta: `table=agentsam_deployment_health` `group=observability-analytics` `rows=7` `tags=agentsam,d1,health,observability-analytics,schema`

### Purpose

agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, deployment_id, worker_name, environment, check_type, check_url, status.

### Compact columns

```txt
id TEXT PK DEFAULT 'dhc_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux', deployment_id TEXT NOT NULL, worker_name TEXT NOT NULL, environment TEXT NOT NULL DEFAULT 'production', check_type TEXT NOT NULL, check_url TEXT, status TEXT NOT NULL DEFAULT 'pending', http_status_code INTEGER, response_time_ms INTEGER, error_message TEXT, metadata_json TEXT DEFAULT '{}', checked_by TEXT DEFAULT 'cron', checked_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'dhc_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'tenant_sam_primeaux'` | 0 |
| 2 | `deployment_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `worker_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `environment` | `TEXT` | 1 | `'production'` | 0 |
| 5 | `check_type` | `TEXT` | 1 | `None` | 0 |
| 6 | `check_url` | `TEXT` | 0 | `None` | 0 |
| 7 | `status` | `TEXT` | 1 | `'pending'` | 0 |
| 8 | `http_status_code` | `INTEGER` | 0 | `None` | 0 |
| 9 | `response_time_ms` | `INTEGER` | 0 | `None` | 0 |
| 10 | `error_message` | `TEXT` | 0 | `None` | 0 |
| 11 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 12 | `checked_by` | `TEXT` | 0 | `'cron'` | 0 |
| 13 | `checked_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_deployment_health_status` | 0 | `c` | 0 | `status, check_type, checked_at` |
| `idx_agentsam_deployment_health_scope` | 0 | `c` | 0 | `tenant_id, worker_name, environment, checked_at` |
| `idx_agentsam_deployment_health_deployment` | 0 | `c` | 0 | `deployment_id, checked_at` |
| `sqlite_autoindex_agentsam_deployment_health_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_deployment_health (
  id TEXT PRIMARY KEY DEFAULT ('dhc_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  deployment_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  check_type TEXT NOT NULL
    CHECK(check_type IN ('http_ping','api_response','d1_query','r2_read','benchmark','smoke_test','manual')),
  check_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','healthy','degraded','failed','timeout','skipped')),
  http_status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  metadata_json TEXT DEFAULT '{}',
  checked_by TEXT DEFAULT 'cron',
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (deployment_id) REFERENCES deployments(id)
)
```

## Table: `agentsam_error_log`

Meta: `table=agentsam_error_log` `group=observability-analytics` `rows=1` `tags=agentsam,d1,error,observability-analytics,schema`

### Purpose

agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id, tenant_id, session_id, error_code, error_type, error_message, source.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'err_' || lower(hex(randomblob(8))), workspace_id TEXT NOT NULL, tenant_id TEXT NOT NULL, session_id TEXT, error_code TEXT, error_type TEXT NOT NULL, error_message TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT, context_json TEXT DEFAULT '{}', stack_trace TEXT, resolved INTEGER DEFAULT 0, created_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'err_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `error_code` | `TEXT` | 0 | `None` | 0 |
| 5 | `error_type` | `TEXT` | 1 | `None` | 0 |
| 6 | `error_message` | `TEXT` | 1 | `None` | 0 |
| 7 | `source` | `TEXT` | 1 | `None` | 0 |
| 8 | `source_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `context_json` | `TEXT` | 0 | `'{}'` | 0 |
| 10 | `stack_trace` | `TEXT` | 0 | `None` | 0 |
| 11 | `resolved` | `INTEGER` | 0 | `0` | 0 |
| 12 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_error_log_type` | 0 | `c` | 0 | `error_type, created_at` |
| `idx_error_log_source` | 0 | `c` | 0 | `source, source_id` |
| `idx_error_log_workspace` | 0 | `c` | 0 | `workspace_id, tenant_id, created_at` |
| `sqlite_autoindex_agentsam_error_log_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_error_log (
  id TEXT PRIMARY KEY DEFAULT ('err_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  session_id TEXT,
  error_code TEXT,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  context_json TEXT DEFAULT '{}',
  stack_trace TEXT,
  resolved INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

## Table: `agentsam_task_slos`

Meta: `table=agentsam_task_slos` `group=observability-analytics` `rows=3` `tags=agentsam,d1,observability-analytics,schema`

### Purpose

agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leading columns: task_type, sla_p95_latency_ms, sla_avg_cost_usd, sla_min_quality, sla_min_schema_valid_rate, sla_min_tool_success_rate, alert_threshold_pct, notes.

### Relationship hints

- `agentsam_plan_tasks`

### Compact columns

```txt
task_type TEXT PK, sla_p95_latency_ms INTEGER NOT NULL, sla_avg_cost_usd REAL NOT NULL, sla_min_quality REAL NOT NULL, sla_min_schema_valid_rate REAL, sla_min_tool_success_rate REAL, alert_threshold_pct REAL NOT NULL DEFAULT 0.10, notes TEXT, updated_at INTEGER NOT NULL DEFAULT unixepoch(), pause_arm_on_breach INTEGER DEFAULT 0
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `task_type` | `TEXT` | 0 | `None` | 1 |
| 1 | `sla_p95_latency_ms` | `INTEGER` | 1 | `None` | 0 |
| 2 | `sla_avg_cost_usd` | `REAL` | 1 | `None` | 0 |
| 3 | `sla_min_quality` | `REAL` | 1 | `None` | 0 |
| 4 | `sla_min_schema_valid_rate` | `REAL` | 0 | `None` | 0 |
| 5 | `sla_min_tool_success_rate` | `REAL` | 0 | `None` | 0 |
| 6 | `alert_threshold_pct` | `REAL` | 1 | `0.10` | 0 |
| 7 | `notes` | `TEXT` | 0 | `None` | 0 |
| 8 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 9 | `pause_arm_on_breach` | `INTEGER` | 0 | `0` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_task_slos_1` | 1 | `pk` | 0 | `task_type` |

### Create SQL

```sql
CREATE TABLE agentsam_task_slos (
  task_type TEXT PRIMARY KEY,
  sla_p95_latency_ms INTEGER NOT NULL,
  sla_avg_cost_usd REAL NOT NULL,
  sla_min_quality REAL NOT NULL,
  sla_min_schema_valid_rate REAL,
  sla_min_tool_success_rate REAL,
  alert_threshold_pct REAL NOT NULL DEFAULT 0.10,
  notes TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, pause_arm_on_breach INTEGER DEFAULT 0)
```

## Table: `agentsam_usage_events`

Meta: `table=agentsam_usage_events` `group=observability-analytics` `rows=393` `tags=agentsam,d1,observability-analytics,schema,usage`

### Purpose

agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, user_id, session_id, agent_name, provider, model.

### Relationship hints

- `agentsam_usage_rollups_daily`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'ue_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia', user_id TEXT, session_id TEXT, agent_name TEXT NOT NULL DEFAULT 'agent-sam', provider TEXT NOT NULL, model TEXT NOT NULL, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok', tool_name TEXT, reason TEXT, ref_table TEXT, ref_id TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), ai_model_id TEXT, routing_arm_id TEXT, event_type TEXT, model_key TEXT, duration_ms INTEGER, total_tokens INTEGER
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'ue_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `'ws_inneranimalmedia'` | 0 |
| 3 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `agent_name` | `TEXT` | 1 | `'agent-sam'` | 0 |
| 6 | `provider` | `TEXT` | 1 | `None` | 0 |
| 7 | `model` | `TEXT` | 1 | `None` | 0 |
| 8 | `tokens_in` | `INTEGER` | 1 | `0` | 0 |
| 9 | `tokens_out` | `INTEGER` | 1 | `0` | 0 |
| 10 | `cost_usd` | `REAL` | 1 | `0` | 0 |
| 11 | `status` | `TEXT` | 1 | `'ok'` | 0 |
| 12 | `tool_name` | `TEXT` | 0 | `None` | 0 |
| 13 | `reason` | `TEXT` | 0 | `None` | 0 |
| 14 | `ref_table` | `TEXT` | 0 | `None` | 0 |
| 15 | `ref_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 17 | `ai_model_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `routing_arm_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `event_type` | `TEXT` | 0 | `None` | 0 |
| 20 | `model_key` | `TEXT` | 0 | `None` | 0 |
| 21 | `duration_ms` | `INTEGER` | 0 | `None` | 0 |
| 22 | `total_tokens` | `INTEGER` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_usage_events_workspace_tenant` | 0 | `c` | 0 | `workspace_id, tenant_id, created_at` |
| `idx_usage_events_model` | 0 | `c` | 0 | `ai_model_id, created_at` |
| `idx_aue_workspace` | 0 | `c` | 0 | `workspace_id, created_at` |
| `idx_aue_tenant_date` | 0 | `c` | 0 | `tenant_id, created_at` |
| `sqlite_autoindex_agentsam_usage_events_2` | 1 | `u` | 0 | `ref_table, ref_id` |
| `sqlite_autoindex_agentsam_usage_events_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_usage_events (
  id          TEXT PRIMARY KEY DEFAULT ('ue_' || lower(hex(randomblob(8)))),
  tenant_id   TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  user_id     TEXT,
  session_id  TEXT,
  agent_name  TEXT NOT NULL DEFAULT 'agent-sam',
  provider    TEXT NOT NULL,             -- anthropic, openai, google, cloudflare_workers_ai
  model       TEXT NOT NULL,             -- resolved model key, never hardcoded
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0,   -- REAL not INTEGER — preserves sub-cent precision
  status      TEXT NOT NULL DEFAULT 'ok'
    CHECK(status IN ('ok','blocked','error','timeout')),
  tool_name   TEXT,                      -- if this event was triggered by a tool call
  reason      TEXT,                      -- block reason / error message
  ref_table   TEXT,                      -- source table: ai_usage_log, agentsam_tool_call_log
  ref_id      TEXT,                      -- FK to source row for dedup
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()), ai_model_id TEXT, routing_arm_id TEXT, event_type TEXT, model_key TEXT, duration_ms INTEGER, total_tokens INTEGER,
  UNIQUE(ref_table, ref_id)              -- prevents duplicate ingestion
)
```

# Other agentsam_* Tables

## Table: `agentsam_artifacts`

Meta: `table=agentsam_artifacts` `group=other` `rows=3` `tags=agentsam,d1,other,schema`

### Purpose

agentsam table in the Other agentsam_* Tables domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, tenant_id, workspace_id, name, description, artifact_type, r2_key.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'art_' || lower(hex(randomblob(8))), user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, workspace_id TEXT, name TEXT NOT NULL, description TEXT, artifact_type TEXT NOT NULL DEFAULT 'html', r2_key TEXT NOT NULL, public_url TEXT, source TEXT NOT NULL, tags TEXT DEFAULT '[]', is_public INTEGER DEFAULT 0, file_size_bytes INTEGER, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'art_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `name` | `TEXT` | 1 | `None` | 0 |
| 5 | `description` | `TEXT` | 0 | `None` | 0 |
| 6 | `artifact_type` | `TEXT` | 1 | `'html'` | 0 |
| 7 | `r2_key` | `TEXT` | 1 | `None` | 0 |
| 8 | `public_url` | `TEXT` | 0 | `None` | 0 |
| 9 | `source` | `TEXT` | 1 | `None` | 0 |
| 10 | `tags` | `TEXT` | 0 | `'[]'` | 0 |
| 11 | `is_public` | `INTEGER` | 0 | `0` | 0 |
| 12 | `file_size_bytes` | `INTEGER` | 0 | `None` | 0 |
| 13 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 14 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_artifacts_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_artifacts" (
  id TEXT PRIMARY KEY DEFAULT ('art_' || lower(hex(randomblob(8)))),
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,       -- required, no default
  workspace_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  artifact_type TEXT NOT NULL DEFAULT 'html',
  r2_key TEXT NOT NULL,
  public_url TEXT,
  source TEXT NOT NULL,          -- required, no default
  tags TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 0,
  file_size_bytes INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)
```

# Security, Guardrails, Policy, and Approvals

## Table: `agentsam_approval_queue`

Meta: `table=agentsam_approval_queue` `group=security-governance` `rows=2` `tags=agentsam,approval,d1,schema,security-governance`

### Purpose

Human approval queue for risky or gated tool/command actions.

### Relationship hints

- `agentsam_mcp_tools`
- `agentsam_plans`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'appr_' || lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, workspace_id TEXT, user_id TEXT NOT NULL, session_id TEXT, plan_id TEXT, todo_id TEXT, workflow_run_id TEXT, command_run_id TEXT, tool_name TEXT NOT NULL, tool_id TEXT, tool_key TEXT, action_summary TEXT NOT NULL, input_json TEXT DEFAULT '{}', risk_level TEXT DEFAULT 'medium', approval_type TEXT DEFAULT 'tool', status TEXT DEFAULT 'pending', approved_by TEXT, decided_at INTEGER, expires_at INTEGER DEFAULT unixepoch() + 300, person_uuid TEXT, created_at INTEGER DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'appr_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `plan_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `todo_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `workflow_run_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `command_run_id` | `TEXT` | 0 | `None` | 0 |
| 9 | `tool_name` | `TEXT` | 1 | `None` | 0 |
| 10 | `tool_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `tool_key` | `TEXT` | 0 | `None` | 0 |
| 12 | `action_summary` | `TEXT` | 1 | `None` | 0 |
| 13 | `input_json` | `TEXT` | 0 | `'{}'` | 0 |
| 14 | `risk_level` | `TEXT` | 0 | `'medium'` | 0 |
| 15 | `approval_type` | `TEXT` | 0 | `'tool'` | 0 |
| 16 | `status` | `TEXT` | 0 | `'pending'` | 0 |
| 17 | `approved_by` | `TEXT` | 0 | `None` | 0 |
| 18 | `decided_at` | `INTEGER` | 0 | `None` | 0 |
| 19 | `expires_at` | `INTEGER` | 0 | `unixepoch() + 300` | 0 |
| 20 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 21 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_appr_user_status` | 0 | `c` | 0 | `user_id, status` |
| `idx_appr_tenant_status` | 0 | `c` | 0 | `tenant_id, status` |
| `idx_appr_command_run` | 0 | `c` | 0 | `command_run_id` |
| `idx_appr_workflow` | 0 | `c` | 0 | `workflow_run_id` |
| `idx_appr_plan` | 0 | `c` | 0 | `plan_id` |
| `idx_appr_todo` | 0 | `c` | 0 | `todo_id` |
| `idx_appr_status` | 0 | `c` | 0 | `status, expires_at` |
| `sqlite_autoindex_agentsam_approval_queue_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_approval_queue" (
  id              TEXT    PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8)))),
  tenant_id       TEXT    NOT NULL,
  workspace_id    TEXT,
  user_id         TEXT    NOT NULL,
  session_id      TEXT,

  -- Chain linkage — all three locked with FKs
  plan_id         TEXT    REFERENCES agentsam_plans(id)          ON DELETE SET NULL,
  todo_id         TEXT    REFERENCES agentsam_todo(id)            ON DELETE CASCADE,
  workflow_run_id TEXT    REFERENCES agentsam_workflow_runs(id)   ON DELETE SET NULL,
  command_run_id  TEXT    REFERENCES agentsam_command_run(id)     ON DELETE SET NULL,

  -- What needs approval
  tool_name       TEXT    NOT NULL,
  tool_id         TEXT,
  tool_key        TEXT,
  action_summary  TEXT    NOT NULL,
  input_json      TEXT    DEFAULT '{}',
  risk_level      TEXT    DEFAULT 'medium',
  approval_type   TEXT    DEFAULT 'tool',

  -- Resolution
  status          TEXT    DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','denied','expired')),
  approved_by     TEXT,
  decided_at      INTEGER,
  expires_at      INTEGER DEFAULT (unixepoch() + 300),

  -- Meta
  person_uuid     TEXT,
  created_at      INTEGER DEFAULT (unixepoch())
)
```

## Table: `agentsam_browser_trusted_origin`

Meta: `table=agentsam_browser_trusted_origin` `group=security-governance` `rows=10` `tags=agentsam,d1,schema,security-governance`

### Purpose

agentsam table in the Security, Guardrails, Policy, and Approvals domain. Use the actual columns listed here before writing API SQL. Leading columns: user_id, origin, cert_fingerprint_sha256, trust_scope, created_at, updated_at, person_uuid.

### Compact columns

```txt
user_id TEXT PK NOT NULL, origin TEXT PK NOT NULL, cert_fingerprint_sha256 TEXT, trust_scope TEXT NOT NULL DEFAULT 'persistent', created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `user_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `origin` | `TEXT` | 1 | `None` | 2 |
| 2 | `cert_fingerprint_sha256` | `TEXT` | 0 | `None` | 0 |
| 3 | `trust_scope` | `TEXT` | 1 | `'persistent'` | 0 |
| 4 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 5 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 6 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_browser_trusted_origin_1` | 1 | `pk` | 0 | `user_id, origin` |

### Create SQL

```sql
CREATE TABLE agentsam_browser_trusted_origin (
  user_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  cert_fingerprint_sha256 TEXT,
  trust_scope TEXT NOT NULL DEFAULT 'persistent',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  PRIMARY KEY (user_id, origin)
)
```

## Table: `agentsam_user_feature_override`

Meta: `table=agentsam_user_feature_override` `group=security-governance` `rows=0` `tags=agentsam,d1,feature,schema,security-governance`

### Purpose

agentsam table in the Security, Guardrails, Policy, and Approvals domain. Use the actual columns listed here before writing API SQL. Leading columns: user_id, flag_key, enabled, updated_at, person_uuid.

### Relationship hints

- `agentsam_user_policy`

### Compact columns

```txt
user_id TEXT PK NOT NULL, flag_key TEXT PK NOT NULL, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `user_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `flag_key` | `TEXT` | 1 | `None` | 2 |
| 2 | `enabled` | `INTEGER` | 1 | `None` | 0 |
| 3 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 4 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_user_feature_override_1` | 1 | `pk` | 0 | `user_id, flag_key` |

### Create SQL

```sql
CREATE TABLE agentsam_user_feature_override (
  user_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  PRIMARY KEY (user_id, flag_key),
  FOREIGN KEY (flag_key) REFERENCES agentsam_feature_flag(flag_key)
)
```

## Table: `agentsam_user_policy`

Meta: `table=agentsam_user_policy` `group=security-governance` `rows=4` `tags=agentsam,d1,policy,schema,security-governance`

### Purpose

agentsam table in the Security, Guardrails, Policy, and Approvals domain. Use the actual columns listed here before writing API SQL. Leading columns: user_id, workspace_id, auto_run_mode, browser_protection, mcp_tools_protection, file_deletion_protection, external_file_protection, default_agent_location.

### Relationship hints

- `agentsam_user_feature_override`
- `agentsam_workspace`

### Compact columns

```txt
user_id TEXT PK NOT NULL, workspace_id TEXT PK NOT NULL DEFAULT '', auto_run_mode TEXT NOT NULL DEFAULT 'allowlist', browser_protection INTEGER NOT NULL DEFAULT 0, mcp_tools_protection INTEGER NOT NULL DEFAULT 1, file_deletion_protection INTEGER NOT NULL DEFAULT 1, external_file_protection INTEGER NOT NULL DEFAULT 1, default_agent_location TEXT DEFAULT 'pane', text_size TEXT DEFAULT 'default', auto_clear_chat INTEGER NOT NULL DEFAULT 0, submit_with_mod_enter INTEGER NOT NULL DEFAULT 0, max_tab_count INTEGER NOT NULL DEFAULT 5, queue_messages_mode TEXT DEFAULT 'after_current', usage_summary_mode TEXT DEFAULT 'auto', agent_autocomplete INTEGER NOT NULL DEFAULT 1, web_search_enabled INTEGER NOT NULL DEFAULT 1, auto_accept_web_search INTEGER NOT NULL DEFAULT 0, web_fetch_enabled INTEGER NOT NULL DEFAULT 1, hierarchical_ignore INTEGER NOT NULL DEFAULT 0, ignore_symlinks INTEGER NOT NULL DEFAULT 0, inline_diffs INTEGER NOT NULL DEFAULT 1, jump_next_diff_on_accept INTEGER NOT NULL DEFAULT 1, auto_format_on_agent_finish INTEGER NOT NULL DEFAULT 0, legacy_terminal_tool INTEGER NOT NULL DEFAULT 1, toolbar_on_selection INTEGER NOT NULL DEFAULT 1, auto_parse_links INTEGER NOT NULL DEFAULT 0, themed_diff_backgrounds INTEGER NOT NULL DEFAULT 1, terminal_hint INTEGER NOT NULL DEFAULT 1, terminal_preview_box INTEGER NOT NULL DEFAULT 1, collapse_auto_run_commands INTEGER NOT NULL DEFAULT 1, voice_submit_keyword TEXT DEFAULT 'submit', commit_attribution INTEGER NOT NULL DEFAULT 1, pr_attribution INTEGER NOT NULL DEFAULT 1, settings_json TEXT, updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT, tenant_id TEXT DEFAULT '', superadmin_uuid TEXT, max_cost_per_session_usd REAL DEFAULT NULL, max_cost_per_call_usd REAL DEFAULT NULL, allowed_model_tier_max INTEGER DEFAULT 4, tool_risk_level_max TEXT DEFAULT 'high', require_allowlist_for_mcp INTEGER DEFAULT 1, allow_subagent_spawn INTEGER DEFAULT 0, max_spawn_depth INTEGER DEFAULT 1, max_tool_chain_depth INTEGER DEFAULT 8
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `user_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `''` | 2 |
| 2 | `auto_run_mode` | `TEXT` | 1 | `'allowlist'` | 0 |
| 3 | `browser_protection` | `INTEGER` | 1 | `0` | 0 |
| 4 | `mcp_tools_protection` | `INTEGER` | 1 | `1` | 0 |
| 5 | `file_deletion_protection` | `INTEGER` | 1 | `1` | 0 |
| 6 | `external_file_protection` | `INTEGER` | 1 | `1` | 0 |
| 7 | `default_agent_location` | `TEXT` | 0 | `'pane'` | 0 |
| 8 | `text_size` | `TEXT` | 0 | `'default'` | 0 |
| 9 | `auto_clear_chat` | `INTEGER` | 1 | `0` | 0 |
| 10 | `submit_with_mod_enter` | `INTEGER` | 1 | `0` | 0 |
| 11 | `max_tab_count` | `INTEGER` | 1 | `5` | 0 |
| 12 | `queue_messages_mode` | `TEXT` | 0 | `'after_current'` | 0 |
| 13 | `usage_summary_mode` | `TEXT` | 0 | `'auto'` | 0 |
| 14 | `agent_autocomplete` | `INTEGER` | 1 | `1` | 0 |
| 15 | `web_search_enabled` | `INTEGER` | 1 | `1` | 0 |
| 16 | `auto_accept_web_search` | `INTEGER` | 1 | `0` | 0 |
| 17 | `web_fetch_enabled` | `INTEGER` | 1 | `1` | 0 |
| 18 | `hierarchical_ignore` | `INTEGER` | 1 | `0` | 0 |
| 19 | `ignore_symlinks` | `INTEGER` | 1 | `0` | 0 |
| 20 | `inline_diffs` | `INTEGER` | 1 | `1` | 0 |
| 21 | `jump_next_diff_on_accept` | `INTEGER` | 1 | `1` | 0 |
| 22 | `auto_format_on_agent_finish` | `INTEGER` | 1 | `0` | 0 |
| 23 | `legacy_terminal_tool` | `INTEGER` | 1 | `1` | 0 |
| 24 | `toolbar_on_selection` | `INTEGER` | 1 | `1` | 0 |
| 25 | `auto_parse_links` | `INTEGER` | 1 | `0` | 0 |
| 26 | `themed_diff_backgrounds` | `INTEGER` | 1 | `1` | 0 |
| 27 | `terminal_hint` | `INTEGER` | 1 | `1` | 0 |
| 28 | `terminal_preview_box` | `INTEGER` | 1 | `1` | 0 |
| 29 | `collapse_auto_run_commands` | `INTEGER` | 1 | `1` | 0 |
| 30 | `voice_submit_keyword` | `TEXT` | 0 | `'submit'` | 0 |
| 31 | `commit_attribution` | `INTEGER` | 1 | `1` | 0 |
| 32 | `pr_attribution` | `INTEGER` | 1 | `1` | 0 |
| 33 | `settings_json` | `TEXT` | 0 | `None` | 0 |
| 34 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 35 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 36 | `tenant_id` | `TEXT` | 0 | `''` | 0 |
| 37 | `superadmin_uuid` | `TEXT` | 0 | `None` | 0 |
| 38 | `max_cost_per_session_usd` | `REAL` | 0 | `NULL` | 0 |
| 39 | `max_cost_per_call_usd` | `REAL` | 0 | `NULL` | 0 |
| 40 | `allowed_model_tier_max` | `INTEGER` | 0 | `4` | 0 |
| 41 | `tool_risk_level_max` | `TEXT` | 0 | `'high'` | 0 |
| 42 | `require_allowlist_for_mcp` | `INTEGER` | 0 | `1` | 0 |
| 43 | `allow_subagent_spawn` | `INTEGER` | 0 | `0` | 0 |
| 44 | `max_spawn_depth` | `INTEGER` | 0 | `1` | 0 |
| 45 | `max_tool_chain_depth` | `INTEGER` | 0 | `8` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_user_policy_user` | 0 | `c` | 0 | `user_id` |
| `sqlite_autoindex_agentsam_user_policy_1` | 1 | `pk` | 0 | `user_id, workspace_id` |

### Create SQL

```sql
CREATE TABLE agentsam_user_policy (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  auto_run_mode TEXT NOT NULL DEFAULT 'allowlist',
  browser_protection INTEGER NOT NULL DEFAULT 0,
  mcp_tools_protection INTEGER NOT NULL DEFAULT 1,
  file_deletion_protection INTEGER NOT NULL DEFAULT 1,
  external_file_protection INTEGER NOT NULL DEFAULT 1,
  default_agent_location TEXT DEFAULT 'pane',
  text_size TEXT DEFAULT 'default',
  auto_clear_chat INTEGER NOT NULL DEFAULT 0,
  submit_with_mod_enter INTEGER NOT NULL DEFAULT 0,
  max_tab_count INTEGER NOT NULL DEFAULT 5,
  queue_messages_mode TEXT DEFAULT 'after_current',
  usage_summary_mode TEXT DEFAULT 'auto',
  agent_autocomplete INTEGER NOT NULL DEFAULT 1,
  web_search_enabled INTEGER NOT NULL DEFAULT 1,
  auto_accept_web_search INTEGER NOT NULL DEFAULT 0,
  web_fetch_enabled INTEGER NOT NULL DEFAULT 1,
  hierarchical_ignore INTEGER NOT NULL DEFAULT 0,
  ignore_symlinks INTEGER NOT NULL DEFAULT 0,
  inline_diffs INTEGER NOT NULL DEFAULT 1,
  jump_next_diff_on_accept INTEGER NOT NULL DEFAULT 1,
  auto_format_on_agent_finish INTEGER NOT NULL DEFAULT 0,
  legacy_terminal_tool INTEGER NOT NULL DEFAULT 1,
  toolbar_on_selection INTEGER NOT NULL DEFAULT 1,
  auto_parse_links INTEGER NOT NULL DEFAULT 0,
  themed_diff_backgrounds INTEGER NOT NULL DEFAULT 1,
  terminal_hint INTEGER NOT NULL DEFAULT 1,
  terminal_preview_box INTEGER NOT NULL DEFAULT 1,
  collapse_auto_run_commands INTEGER NOT NULL DEFAULT 1,
  voice_submit_keyword TEXT DEFAULT 'submit',
  commit_attribution INTEGER NOT NULL DEFAULT 1,
  pr_attribution INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT, tenant_id TEXT DEFAULT '', superadmin_uuid TEXT, max_cost_per_session_usd  REAL DEFAULT NULL, max_cost_per_call_usd     REAL DEFAULT NULL, allowed_model_tier_max    INTEGER DEFAULT 4, tool_risk_level_max TEXT DEFAULT 'high'
  CHECK(tool_risk_level_max IN ('low','medium','high','critical')), require_allowlist_for_mcp INTEGER DEFAULT 1, allow_subagent_spawn  INTEGER DEFAULT 0, max_spawn_depth       INTEGER DEFAULT 1, max_tool_chain_depth  INTEGER DEFAULT 8,
  PRIMARY KEY (user_id, workspace_id)
)
```

# Settings, Feature Flags, and Jobs

## Table: `agentsam_cad_jobs`

Meta: `table=agentsam_cad_jobs` `group=settings-jobs` `rows=2` `tags=agentsam,d1,schema,settings-jobs`

### Purpose

agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, session_id, user_id, engine, prompt, mode, status, external_task_id.

### Compact columns

```txt
id TEXT PK, session_id TEXT, user_id TEXT NOT NULL, engine TEXT NOT NULL, prompt TEXT, mode TEXT DEFAULT 'text', status TEXT DEFAULT 'pending', external_task_id TEXT, result_url TEXT, r2_key TEXT, error TEXT, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `engine` | `TEXT` | 1 | `None` | 0 |
| 4 | `prompt` | `TEXT` | 0 | `None` | 0 |
| 5 | `mode` | `TEXT` | 0 | `'text'` | 0 |
| 6 | `status` | `TEXT` | 0 | `'pending'` | 0 |
| 7 | `external_task_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `result_url` | `TEXT` | 0 | `None` | 0 |
| 9 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 10 | `error` | `TEXT` | 0 | `None` | 0 |
| 11 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 12 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_cad_jobs_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_cad_jobs (id TEXT PRIMARY KEY, session_id TEXT, user_id TEXT NOT NULL, engine TEXT NOT NULL, prompt TEXT, mode TEXT DEFAULT 'text', status TEXT DEFAULT 'pending', external_task_id TEXT, result_url TEXT, r2_key TEXT, error TEXT, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))
```

## Table: `agentsam_code_index_job`

Meta: `table=agentsam_code_index_job` `group=settings-jobs` `rows=8` `tags=agentsam,d1,schema,settings-jobs`

### Purpose

agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, workspace_id, status, progress_percent, source_type, source_path, vector_backend.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle', progress_percent INTEGER DEFAULT 0, source_type TEXT DEFAULT 'r2', source_path TEXT, vector_backend TEXT DEFAULT 'supabase_pgvector', file_manifest TEXT DEFAULT '[]', symbol_summary TEXT DEFAULT '{}', dependency_summary TEXT DEFAULT '{}', languages TEXT DEFAULT '{}', file_count INTEGER DEFAULT 0, indexed_file_count INTEGER DEFAULT 0, failed_file_count INTEGER DEFAULT 0, total_size_bytes INTEGER DEFAULT 0, chunk_count INTEGER DEFAULT 0, symbol_count INTEGER DEFAULT 0, triggered_by TEXT DEFAULT 'manual', started_at TEXT, completed_at TEXT, last_sync_at TEXT, last_error TEXT, updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `status` | `TEXT` | 1 | `'idle'` | 0 |
| 4 | `progress_percent` | `INTEGER` | 0 | `0` | 0 |
| 5 | `source_type` | `TEXT` | 0 | `'r2'` | 0 |
| 6 | `source_path` | `TEXT` | 0 | `None` | 0 |
| 7 | `vector_backend` | `TEXT` | 0 | `'supabase_pgvector'` | 0 |
| 8 | `file_manifest` | `TEXT` | 0 | `'[]'` | 0 |
| 9 | `symbol_summary` | `TEXT` | 0 | `'{}'` | 0 |
| 10 | `dependency_summary` | `TEXT` | 0 | `'{}'` | 0 |
| 11 | `languages` | `TEXT` | 0 | `'{}'` | 0 |
| 12 | `file_count` | `INTEGER` | 0 | `0` | 0 |
| 13 | `indexed_file_count` | `INTEGER` | 0 | `0` | 0 |
| 14 | `failed_file_count` | `INTEGER` | 0 | `0` | 0 |
| 15 | `total_size_bytes` | `INTEGER` | 0 | `0` | 0 |
| 16 | `chunk_count` | `INTEGER` | 0 | `0` | 0 |
| 17 | `symbol_count` | `INTEGER` | 0 | `0` | 0 |
| 18 | `triggered_by` | `TEXT` | 0 | `'manual'` | 0 |
| 19 | `started_at` | `TEXT` | 0 | `None` | 0 |
| 20 | `completed_at` | `TEXT` | 0 | `None` | 0 |
| 21 | `last_sync_at` | `TEXT` | 0 | `None` | 0 |
| 22 | `last_error` | `TEXT` | 0 | `None` | 0 |
| 23 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 24 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_code_index_job_2` | 1 | `u` | 0 | `user_id, workspace_id` |
| `sqlite_autoindex_agentsam_code_index_job_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_code_index_job (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'idle',
  -- idle | queued | indexing | completed | failed | stale
  progress_percent INTEGER DEFAULT 0,

  -- Source config
  source_type TEXT DEFAULT 'r2',
  -- r2 | github | local
  source_path TEXT,
  -- R2 prefix or GitHub repo path
  vector_backend TEXT DEFAULT 'supabase_pgvector',
  -- supabase_pgvector | vectorize | d1_cosine

  -- File manifest — JSON array of objects:
  -- [{path, language, size_bytes, hash, status, chunk_count, symbol_count, last_indexed_at}]
  file_manifest TEXT DEFAULT '[]',

  -- Symbol summary — JSON:
  -- {total, by_type: {function: N, class: N, component: N, hook: N}, top_exports: [...]}
  symbol_summary TEXT DEFAULT '{}',

  -- Dependency graph — JSON:
  -- {edges: [{from, to, type}], orphans: [...], entry_points: [...]}
  dependency_summary TEXT DEFAULT '{}',

  -- Language breakdown — JSON: {js: N, jsx: N, ts: N, tsx: N, css: N}
  languages TEXT DEFAULT '{}',

  -- Counters
  file_count INTEGER DEFAULT 0,
  indexed_file_count INTEGER DEFAULT 0,
  failed_file_count INTEGER DEFAULT 0,
  total_size_bytes INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  symbol_count INTEGER DEFAULT 0,

  -- Trigger + timing
  triggered_by TEXT DEFAULT 'manual',
  -- manual | cron | git_push | webhook
  started_at TEXT,
  completed_at TEXT,
  last_sync_at TEXT,
  last_error TEXT,

  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,

  UNIQUE (user_id, workspace_id)
)
```

## Table: `agentsam_feature_flag`

Meta: `table=agentsam_feature_flag` `group=settings-jobs` `rows=13` `tags=agentsam,d1,feature,schema,settings-jobs`

### Purpose

agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns: flag_key, description, enabled_globally, config_json, updated_at, enabled_for_tenants, enabled_for_users, rollout_pct.

### Relationship hints

- `agentsam_user_feature_override`

### Compact columns

```txt
flag_key TEXT PK, description TEXT, enabled_globally INTEGER NOT NULL DEFAULT 0, config_json TEXT, updated_at TEXT NOT NULL DEFAULT datetime('now'), enabled_for_tenants TEXT DEFAULT '[]', enabled_for_users TEXT DEFAULT '[]', rollout_pct INTEGER DEFAULT 0, environment TEXT DEFAULT 'all', flag_type TEXT DEFAULT 'boolean', expires_at INTEGER, created_at TEXT, created_by TEXT DEFAULT 'sam_primeaux', is_archived INTEGER DEFAULT 0, tags TEXT DEFAULT '[]'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `flag_key` | `TEXT` | 0 | `None` | 1 |
| 1 | `description` | `TEXT` | 0 | `None` | 0 |
| 2 | `enabled_globally` | `INTEGER` | 1 | `0` | 0 |
| 3 | `config_json` | `TEXT` | 0 | `None` | 0 |
| 4 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 5 | `enabled_for_tenants` | `TEXT` | 0 | `'[]'` | 0 |
| 6 | `enabled_for_users` | `TEXT` | 0 | `'[]'` | 0 |
| 7 | `rollout_pct` | `INTEGER` | 0 | `0` | 0 |
| 8 | `environment` | `TEXT` | 0 | `'all'` | 0 |
| 9 | `flag_type` | `TEXT` | 0 | `'boolean'` | 0 |
| 10 | `expires_at` | `INTEGER` | 0 | `None` | 0 |
| 11 | `created_at` | `TEXT` | 0 | `None` | 0 |
| 12 | `created_by` | `TEXT` | 0 | `'sam_primeaux'` | 0 |
| 13 | `is_archived` | `INTEGER` | 0 | `0` | 0 |
| 14 | `tags` | `TEXT` | 0 | `'[]'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_feature_flag_1` | 1 | `pk` | 0 | `flag_key` |

### Create SQL

```sql
CREATE TABLE agentsam_feature_flag (
  flag_key TEXT PRIMARY KEY,
  description TEXT,
  enabled_globally INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, enabled_for_tenants TEXT DEFAULT '[]', enabled_for_users TEXT DEFAULT '[]', rollout_pct INTEGER DEFAULT 0, environment TEXT DEFAULT 'all', flag_type TEXT DEFAULT 'boolean', expires_at INTEGER, created_at TEXT, created_by TEXT DEFAULT 'sam_primeaux', is_archived INTEGER DEFAULT 0, tags TEXT DEFAULT '[]')
```

## Table: `agentsam_subscription_registry`

Meta: `table=agentsam_subscription_registry` `group=settings-jobs` `rows=16` `tags=agentsam,d1,schema,script,settings-jobs`

### Purpose

agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, name, provider, model_name, subscription_tier, linked_email, notes.

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, name TEXT NOT NULL, provider TEXT NOT NULL, model_name TEXT, subscription_tier TEXT, linked_email TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `name` | `TEXT` | 1 | `None` | 0 |
| 3 | `provider` | `TEXT` | 1 | `None` | 0 |
| 4 | `model_name` | `TEXT` | 0 | `None` | 0 |
| 5 | `subscription_tier` | `TEXT` | 0 | `None` | 0 |
| 6 | `linked_email` | `TEXT` | 0 | `None` | 0 |
| 7 | `notes` | `TEXT` | 0 | `None` | 0 |
| 8 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 9 | `created_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |
| 10 | `updated_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_agentsam_subscription_registry_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_subscription_registry (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  provider         TEXT NOT NULL,
  model_name       TEXT,
  subscription_tier TEXT,
  linked_email     TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','expired')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)
```

# Workflows, Plans, Tasks, and Todos

## Table: `agentsam_plan_tasks`

Meta: `table=agentsam_plan_tasks` `group=workflows-plans-tasks` `rows=75` `tags=agentsam,d1,plan,schema,workflows-plans-tasks`

### Purpose

agentsam table in the Workflows, Plans, Tasks, and Todos domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, plan_id, todo_id, command_run_id, agent_id, assigned_model.

### Relationship hints

- `agentsam_plans`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'task_' || lower(hex(randomblob(8))), tenant_id TEXT, workspace_id TEXT, plan_id TEXT NOT NULL, todo_id TEXT, command_run_id TEXT, agent_id TEXT, assigned_model TEXT, order_index INTEGER NOT NULL, title TEXT NOT NULL, description TEXT, priority TEXT NOT NULL DEFAULT 'P1', category TEXT DEFAULT 'backend', status TEXT NOT NULL DEFAULT 'todo', files_involved TEXT DEFAULT '[]', tables_involved TEXT DEFAULT '[]', routes_involved TEXT DEFAULT '[]', depends_on TEXT DEFAULT '[]', estimated_minutes INTEGER, actual_minutes INTEGER, blocked_reason TEXT, notes TEXT, output_summary TEXT, error_trace TEXT, tokens_used INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, started_at INTEGER, completed_at INTEGER, created_at INTEGER DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'task_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `plan_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `todo_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `command_run_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `assigned_model` | `TEXT` | 0 | `None` | 0 |
| 8 | `order_index` | `INTEGER` | 1 | `None` | 0 |
| 9 | `title` | `TEXT` | 1 | `None` | 0 |
| 10 | `description` | `TEXT` | 0 | `None` | 0 |
| 11 | `priority` | `TEXT` | 1 | `'P1'` | 0 |
| 12 | `category` | `TEXT` | 0 | `'backend'` | 0 |
| 13 | `status` | `TEXT` | 1 | `'todo'` | 0 |
| 14 | `files_involved` | `TEXT` | 0 | `'[]'` | 0 |
| 15 | `tables_involved` | `TEXT` | 0 | `'[]'` | 0 |
| 16 | `routes_involved` | `TEXT` | 0 | `'[]'` | 0 |
| 17 | `depends_on` | `TEXT` | 0 | `'[]'` | 0 |
| 18 | `estimated_minutes` | `INTEGER` | 0 | `None` | 0 |
| 19 | `actual_minutes` | `INTEGER` | 0 | `None` | 0 |
| 20 | `blocked_reason` | `TEXT` | 0 | `None` | 0 |
| 21 | `notes` | `TEXT` | 0 | `None` | 0 |
| 22 | `output_summary` | `TEXT` | 0 | `None` | 0 |
| 23 | `error_trace` | `TEXT` | 0 | `None` | 0 |
| 24 | `tokens_used` | `INTEGER` | 0 | `0` | 0 |
| 25 | `cost_usd` | `REAL` | 0 | `0` | 0 |
| 26 | `started_at` | `INTEGER` | 0 | `None` | 0 |
| 27 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 28 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_aptasks_priority` | 0 | `c` | 0 | `priority, status` |
| `idx_aptasks_command_run` | 0 | `c` | 0 | `command_run_id` |
| `idx_aptasks_todo` | 0 | `c` | 0 | `todo_id` |
| `idx_aptasks_status` | 0 | `c` | 0 | `status` |
| `idx_aptasks_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_aptasks_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_aptasks_plan` | 0 | `c` | 0 | `plan_id` |
| `sqlite_autoindex_agentsam_plan_tasks_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_plan_tasks" (
  id                TEXT    PRIMARY KEY DEFAULT ('task_' || lower(hex(randomblob(8)))),
  tenant_id         TEXT,
  workspace_id      TEXT,
  plan_id           TEXT    NOT NULL REFERENCES agentsam_plans(id)       ON DELETE CASCADE,
  todo_id           TEXT    REFERENCES agentsam_todo(id)                  ON DELETE SET NULL,
  command_run_id    TEXT    REFERENCES agentsam_command_run(id)           ON DELETE SET NULL,
  agent_id          TEXT,
  assigned_model    TEXT,
  order_index       INTEGER NOT NULL,
  title             TEXT    NOT NULL,
  description       TEXT,
  priority          TEXT    NOT NULL DEFAULT 'P1'
                            CHECK(priority IN ('P0','P1','P2','P3')),
  category          TEXT    DEFAULT 'backend'
                            CHECK(category IN ('frontend','backend','db','infra','ux','research','other')),
  status            TEXT    NOT NULL DEFAULT 'todo'
                            CHECK(status IN ('todo','in_progress','done','blocked','skipped','carried')),
  files_involved    TEXT    DEFAULT '[]',
  tables_involved   TEXT    DEFAULT '[]',
  routes_involved   TEXT    DEFAULT '[]',
  depends_on        TEXT    DEFAULT '[]',
  estimated_minutes INTEGER,
  actual_minutes    INTEGER,
  blocked_reason    TEXT,
  notes             TEXT,
  output_summary    TEXT,
  error_trace       TEXT,
  tokens_used       INTEGER DEFAULT 0,
  cost_usd          REAL    DEFAULT 0,
  started_at        INTEGER,
  completed_at      INTEGER,
  created_at        INTEGER DEFAULT (unixepoch())
)
```

## Table: `agentsam_plans`

Meta: `table=agentsam_plans` `group=workflows-plans-tasks` `rows=13` `tags=agentsam,d1,plan,schema,workflows-plans-tasks`

### Purpose

agentsam table in the Workflows, Plans, Tasks, and Todos domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, session_id, agent_id, client_id, client_name, plan_date.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, workspace_id TEXT, session_id TEXT, agent_id TEXT, client_id TEXT, client_name TEXT, plan_date TEXT NOT NULL, plan_type TEXT DEFAULT 'daily', title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', morning_brief TEXT, session_notes TEXT, eod_summary TEXT, available_providers TEXT DEFAULT '["anthropic","openai","google","workers_ai"]', blocked_providers TEXT DEFAULT '[]', budget_snapshot TEXT DEFAULT '{}', default_model TEXT, token_budget INTEGER DEFAULT NULL, tokens_used INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, carry_over_from TEXT, carry_over_count INTEGER DEFAULT 0, tasks_total INTEGER DEFAULT 0, tasks_done INTEGER DEFAULT 0, tasks_blocked INTEGER DEFAULT 0, linked_project_keys TEXT DEFAULT '[]', linked_todo_ids TEXT DEFAULT '[]', linked_context_ids TEXT DEFAULT '[]', created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `client_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `client_name` | `TEXT` | 0 | `None` | 0 |
| 7 | `plan_date` | `TEXT` | 1 | `None` | 0 |
| 8 | `plan_type` | `TEXT` | 0 | `'daily'` | 0 |
| 9 | `title` | `TEXT` | 1 | `None` | 0 |
| 10 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 11 | `morning_brief` | `TEXT` | 0 | `None` | 0 |
| 12 | `session_notes` | `TEXT` | 0 | `None` | 0 |
| 13 | `eod_summary` | `TEXT` | 0 | `None` | 0 |
| 14 | `available_providers` | `TEXT` | 0 | `'["anthropic","openai","google","workers_ai"]'` | 0 |
| 15 | `blocked_providers` | `TEXT` | 0 | `'[]'` | 0 |
| 16 | `budget_snapshot` | `TEXT` | 0 | `'{}'` | 0 |
| 17 | `default_model` | `TEXT` | 0 | `None` | 0 |
| 18 | `token_budget` | `INTEGER` | 0 | `NULL` | 0 |
| 19 | `tokens_used` | `INTEGER` | 1 | `0` | 0 |
| 20 | `cost_usd` | `REAL` | 1 | `0` | 0 |
| 21 | `carry_over_from` | `TEXT` | 0 | `None` | 0 |
| 22 | `carry_over_count` | `INTEGER` | 0 | `0` | 0 |
| 23 | `tasks_total` | `INTEGER` | 0 | `0` | 0 |
| 24 | `tasks_done` | `INTEGER` | 0 | `0` | 0 |
| 25 | `tasks_blocked` | `INTEGER` | 0 | `0` | 0 |
| 26 | `linked_project_keys` | `TEXT` | 0 | `'[]'` | 0 |
| 27 | `linked_todo_ids` | `TEXT` | 0 | `'[]'` | 0 |
| 28 | `linked_context_ids` | `TEXT` | 0 | `'[]'` | 0 |
| 29 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 30 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_aplans_type_status` | 0 | `c` | 0 | `plan_type, status` |
| `idx_aplans_workspace` | 0 | `c` | 0 | `workspace_id` |
| `idx_aplans_agent` | 0 | `c` | 0 | `agent_id` |
| `idx_aplans_date` | 0 | `c` | 0 | `plan_date` |
| `idx_aplans_tenant_date` | 0 | `c` | 0 | `tenant_id, plan_date` |
| `idx_aplans_tenant_status` | 0 | `c` | 0 | `tenant_id, status` |
| `sqlite_autoindex_agentsam_plans_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_plans" (
  id                   TEXT    PRIMARY KEY,
  tenant_id            TEXT    NOT NULL,
  workspace_id         TEXT,
  session_id           TEXT,
  agent_id             TEXT,
  client_id            TEXT,
  client_name          TEXT,
  plan_date            TEXT    NOT NULL,
  plan_type            TEXT    DEFAULT 'daily'
                               CHECK(plan_type IN ('daily','sprint','incident','feature','refactor')),
  title                TEXT    NOT NULL,
  status               TEXT    NOT NULL DEFAULT 'active'
                               CHECK(status IN ('draft','active','complete','abandoned')),
  morning_brief        TEXT,
  session_notes        TEXT,
  eod_summary          TEXT,
  available_providers  TEXT    DEFAULT '["anthropic","openai","google","workers_ai"]',
  blocked_providers    TEXT    DEFAULT '[]',
  budget_snapshot      TEXT    DEFAULT '{}',
  default_model        TEXT,
  token_budget         INTEGER DEFAULT NULL,
  tokens_used          INTEGER NOT NULL DEFAULT 0,
  cost_usd             REAL    NOT NULL DEFAULT 0,
  carry_over_from      TEXT,
  carry_over_count     INTEGER DEFAULT 0,
  tasks_total          INTEGER DEFAULT 0,
  tasks_done           INTEGER DEFAULT 0,
  tasks_blocked        INTEGER DEFAULT 0,
  linked_project_keys  TEXT    DEFAULT '[]',
  linked_todo_ids      TEXT    DEFAULT '[]',
  linked_context_ids   TEXT    DEFAULT '[]',
  created_at           INTEGER DEFAULT (unixepoch()),
  updated_at           INTEGER DEFAULT (unixepoch())
)
```

## Table: `agentsam_todo`

Meta: `table=agentsam_todo` `group=workflows-plans-tasks` `rows=75` `tags=agentsam,d1,schema,todo,workflows-plans-tasks`

### Purpose

agentsam table in the Workflows, Plans, Tasks, and Todos domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, workspace_id, title, description, status, priority, category.

### Relationship hints

- `agentsam_plans`
- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, workspace_id TEXT, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'medium', category TEXT, tags TEXT DEFAULT '[]', due_date TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), created_by TEXT NOT NULL DEFAULT 'agentsam', notes TEXT, linked_commit TEXT, linked_route TEXT, linked_table TEXT, sort_order INTEGER DEFAULT 50, plan_id TEXT, project_key TEXT, task_type TEXT NOT NULL DEFAULT 'execute', execution_status TEXT NOT NULL DEFAULT 'queued', assigned_to TEXT DEFAULT 'agentsam', depends_on TEXT DEFAULT '[]', retry_count INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 2, timeout_seconds INTEGER DEFAULT 300, context_snapshot TEXT DEFAULT '{}', output_summary TEXT, error_trace TEXT, token_budget INTEGER DEFAULT NULL, tokens_used INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, requires_approval INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at TEXT, started_at TEXT, kanban_task_id TEXT, kanban_board_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `title` | `TEXT` | 1 | `None` | 0 |
| 4 | `description` | `TEXT` | 0 | `None` | 0 |
| 5 | `status` | `TEXT` | 1 | `'open'` | 0 |
| 6 | `priority` | `TEXT` | 1 | `'medium'` | 0 |
| 7 | `category` | `TEXT` | 0 | `None` | 0 |
| 8 | `tags` | `TEXT` | 0 | `'[]'` | 0 |
| 9 | `due_date` | `TEXT` | 0 | `None` | 0 |
| 10 | `completed_at` | `TEXT` | 0 | `None` | 0 |
| 11 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 12 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 13 | `created_by` | `TEXT` | 1 | `'agentsam'` | 0 |
| 14 | `notes` | `TEXT` | 0 | `None` | 0 |
| 15 | `linked_commit` | `TEXT` | 0 | `None` | 0 |
| 16 | `linked_route` | `TEXT` | 0 | `None` | 0 |
| 17 | `linked_table` | `TEXT` | 0 | `None` | 0 |
| 18 | `sort_order` | `INTEGER` | 0 | `50` | 0 |
| 19 | `plan_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `project_key` | `TEXT` | 0 | `None` | 0 |
| 21 | `task_type` | `TEXT` | 1 | `'execute'` | 0 |
| 22 | `execution_status` | `TEXT` | 1 | `'queued'` | 0 |
| 23 | `assigned_to` | `TEXT` | 0 | `'agentsam'` | 0 |
| 24 | `depends_on` | `TEXT` | 0 | `'[]'` | 0 |
| 25 | `retry_count` | `INTEGER` | 1 | `0` | 0 |
| 26 | `max_retries` | `INTEGER` | 1 | `2` | 0 |
| 27 | `timeout_seconds` | `INTEGER` | 0 | `300` | 0 |
| 28 | `context_snapshot` | `TEXT` | 0 | `'{}'` | 0 |
| 29 | `output_summary` | `TEXT` | 0 | `None` | 0 |
| 30 | `error_trace` | `TEXT` | 0 | `None` | 0 |
| 31 | `token_budget` | `INTEGER` | 0 | `NULL` | 0 |
| 32 | `tokens_used` | `INTEGER` | 1 | `0` | 0 |
| 33 | `cost_usd` | `REAL` | 1 | `0` | 0 |
| 34 | `requires_approval` | `INTEGER` | 1 | `0` | 0 |
| 35 | `approved_by` | `TEXT` | 0 | `None` | 0 |
| 36 | `approved_at` | `TEXT` | 0 | `None` | 0 |
| 37 | `started_at` | `TEXT` | 0 | `None` | 0 |
| 38 | `kanban_task_id` | `TEXT` | 0 | `None` | 0 |
| 39 | `kanban_board_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_todo_requires_approval` | 0 | `c` | 0 | `requires_approval, status` |
| `idx_todo_execution_status` | 0 | `c` | 0 | `execution_status` |
| `idx_todo_plan` | 0 | `c` | 0 | `plan_id` |
| `idx_todo_workspace_status` | 0 | `c` | 0 | `workspace_id, status` |
| `idx_todo_tenant_status` | 0 | `c` | 0 | `tenant_id, status` |
| `sqlite_autoindex_agentsam_todo_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE "agentsam_todo" (
  id                TEXT    PRIMARY KEY,
  tenant_id         TEXT    NOT NULL,
  workspace_id      TEXT,
  title             TEXT    NOT NULL,
  description       TEXT,
  status            TEXT    NOT NULL DEFAULT 'open',
  priority          TEXT    NOT NULL DEFAULT 'medium',
  category          TEXT,
  tags              TEXT    DEFAULT '[]',
  due_date          TEXT,
  completed_at      TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT    NOT NULL DEFAULT 'agentsam',
  notes             TEXT,
  linked_commit     TEXT,
  linked_route      TEXT,
  linked_table      TEXT,
  sort_order        INTEGER DEFAULT 50,
  plan_id           TEXT,
  project_key       TEXT,
  task_type         TEXT    NOT NULL DEFAULT 'execute',
  execution_status  TEXT    NOT NULL DEFAULT 'queued',
  assigned_to       TEXT    DEFAULT 'agentsam',
  depends_on        TEXT    DEFAULT '[]',
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_retries       INTEGER NOT NULL DEFAULT 2,
  timeout_seconds   INTEGER DEFAULT 300,
  context_snapshot  TEXT    DEFAULT '{}',
  output_summary    TEXT,
  error_trace       TEXT,
  token_budget      INTEGER DEFAULT NULL,
  tokens_used       INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL    NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by       TEXT,
  approved_at       TEXT,
  started_at        TEXT
, kanban_task_id TEXT REFERENCES kanban_tasks(id) ON DELETE SET NULL, kanban_board_id TEXT REFERENCES kanban_boards(id) ON DELETE SET NULL)
```

# Workspaces, Projects, and Subagents

## Table: `agentsam_bootstrap`

Meta: `table=agentsam_bootstrap` `group=workspace-projects` `rows=12` `tags=agentsam,d1,schema,workspace-projects`

### Purpose

agentsam table in the Workspaces, Projects, and Subagents domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id, tenant_id, brand_id, user_id, session_id, email, role_slug.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK NOT NULL, workspace_id TEXT NOT NULL, tenant_id TEXT NOT NULL, brand_id TEXT, user_id TEXT, session_id TEXT, email TEXT, role_slug TEXT, display_name TEXT, workspace_slug TEXT, workspace_name TEXT, environment TEXT NOT NULL DEFAULT 'production', deploy_env TEXT, bootstrap_version TEXT DEFAULT '1.0.0', is_active INTEGER NOT NULL DEFAULT 1, capabilities_json TEXT NOT NULL DEFAULT '{}', governance_roles_json TEXT NOT NULL DEFAULT '[]', approval_required_json TEXT NOT NULL DEFAULT '[]', allowed_execution_modes_json TEXT NOT NULL DEFAULT '["pty"]', default_execution_mode TEXT NOT NULL DEFAULT 'pty', runtime_status_json TEXT NOT NULL DEFAULT '{}', backend_health_json TEXT NOT NULL DEFAULT '{}', feature_flags_json TEXT NOT NULL DEFAULT '{}', ui_preferences_json TEXT NOT NULL DEFAULT '{}', theme_slug TEXT, agent_session_id TEXT, terminal_session_id TEXT, resume_token TEXT, resume_expires_at TEXT, api_base_url TEXT DEFAULT '/api', terminal_ws_path TEXT, agent_api_path TEXT, mcp_api_path TEXT, cloud_api_path TEXT, source_of_truth TEXT DEFAULT 'worker', last_bootstrapped_at TEXT, last_validated_at TEXT, expires_at TEXT, created_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at TEXT NOT NULL DEFAULT strftime('%Y-%m-%dT%H:%M:%fZ','now'), person_uuid TEXT, repo_json TEXT NOT NULL DEFAULT '{}', scripts_json TEXT NOT NULL DEFAULT '[]'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 1 | `None` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `brand_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `session_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `email` | `TEXT` | 0 | `None` | 0 |
| 7 | `role_slug` | `TEXT` | 0 | `None` | 0 |
| 8 | `display_name` | `TEXT` | 0 | `None` | 0 |
| 9 | `workspace_slug` | `TEXT` | 0 | `None` | 0 |
| 10 | `workspace_name` | `TEXT` | 0 | `None` | 0 |
| 11 | `environment` | `TEXT` | 1 | `'production'` | 0 |
| 12 | `deploy_env` | `TEXT` | 0 | `None` | 0 |
| 13 | `bootstrap_version` | `TEXT` | 0 | `'1.0.0'` | 0 |
| 14 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 15 | `capabilities_json` | `TEXT` | 1 | `'{}'` | 0 |
| 16 | `governance_roles_json` | `TEXT` | 1 | `'[]'` | 0 |
| 17 | `approval_required_json` | `TEXT` | 1 | `'[]'` | 0 |
| 18 | `allowed_execution_modes_json` | `TEXT` | 1 | `'["pty"]'` | 0 |
| 19 | `default_execution_mode` | `TEXT` | 1 | `'pty'` | 0 |
| 20 | `runtime_status_json` | `TEXT` | 1 | `'{}'` | 0 |
| 21 | `backend_health_json` | `TEXT` | 1 | `'{}'` | 0 |
| 22 | `feature_flags_json` | `TEXT` | 1 | `'{}'` | 0 |
| 23 | `ui_preferences_json` | `TEXT` | 1 | `'{}'` | 0 |
| 24 | `theme_slug` | `TEXT` | 0 | `None` | 0 |
| 25 | `agent_session_id` | `TEXT` | 0 | `None` | 0 |
| 26 | `terminal_session_id` | `TEXT` | 0 | `None` | 0 |
| 27 | `resume_token` | `TEXT` | 0 | `None` | 0 |
| 28 | `resume_expires_at` | `TEXT` | 0 | `None` | 0 |
| 29 | `api_base_url` | `TEXT` | 0 | `'/api'` | 0 |
| 30 | `terminal_ws_path` | `TEXT` | 0 | `None` | 0 |
| 31 | `agent_api_path` | `TEXT` | 0 | `None` | 0 |
| 32 | `mcp_api_path` | `TEXT` | 0 | `None` | 0 |
| 33 | `cloud_api_path` | `TEXT` | 0 | `None` | 0 |
| 34 | `source_of_truth` | `TEXT` | 0 | `'worker'` | 0 |
| 35 | `last_bootstrapped_at` | `TEXT` | 0 | `None` | 0 |
| 36 | `last_validated_at` | `TEXT` | 0 | `None` | 0 |
| 37 | `expires_at` | `TEXT` | 0 | `None` | 0 |
| 38 | `created_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |
| 39 | `updated_at` | `TEXT` | 1 | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | 0 |
| 40 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 41 | `repo_json` | `TEXT` | 1 | `'{}'` | 0 |
| 42 | `scripts_json` | `TEXT` | 1 | `'[]'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_asb_workspace_env` | 0 | `c` | 0 | `workspace_id, environment` |
| `idx_asb_workspace_user` | 0 | `c` | 0 | `workspace_id, user_id` |
| `idx_asb_is_active` | 0 | `c` | 0 | `is_active` |
| `idx_asb_session_id` | 0 | `c` | 0 | `session_id` |
| `idx_asb_user_id` | 0 | `c` | 0 | `user_id` |
| `idx_asb_tenant_id` | 0 | `c` | 0 | `tenant_id` |
| `idx_asb_workspace_id` | 0 | `c` | 0 | `workspace_id` |
| `sqlite_autoindex_agentsam_bootstrap_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_bootstrap (
  id                           TEXT NOT NULL PRIMARY KEY,
  workspace_id                 TEXT NOT NULL,
  tenant_id                    TEXT NOT NULL,
  brand_id                     TEXT,
  user_id                      TEXT,
  session_id                   TEXT,
  email                        TEXT,
  role_slug                    TEXT,
  display_name                 TEXT,
  workspace_slug               TEXT,
  workspace_name               TEXT,
  environment                  TEXT NOT NULL DEFAULT 'production'
                                 CHECK (environment IN ('production','sandbox','staging','development')),
  deploy_env                   TEXT,
  bootstrap_version            TEXT DEFAULT '1.0.0',
  is_active                    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  capabilities_json            TEXT NOT NULL DEFAULT '{}',
  governance_roles_json        TEXT NOT NULL DEFAULT '[]',
  approval_required_json       TEXT NOT NULL DEFAULT '[]',
  allowed_execution_modes_json TEXT NOT NULL DEFAULT '["pty"]',
  default_execution_mode       TEXT NOT NULL DEFAULT 'pty',
  runtime_status_json          TEXT NOT NULL DEFAULT '{}',
  backend_health_json          TEXT NOT NULL DEFAULT '{}',
  feature_flags_json           TEXT NOT NULL DEFAULT '{}',
  ui_preferences_json          TEXT NOT NULL DEFAULT '{}',
  theme_slug                   TEXT,
  agent_session_id             TEXT,
  terminal_session_id          TEXT,
  resume_token                 TEXT,
  resume_expires_at            TEXT,
  api_base_url                 TEXT DEFAULT '/api',
  terminal_ws_path             TEXT,
  agent_api_path               TEXT,
  mcp_api_path                 TEXT,
  cloud_api_path               TEXT,
  source_of_truth              TEXT DEFAULT 'worker',
  last_bootstrapped_at         TEXT,
  last_validated_at            TEXT,
  expires_at                   TEXT,
  created_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
, person_uuid TEXT, repo_json TEXT NOT NULL DEFAULT '{}', scripts_json TEXT NOT NULL DEFAULT '[]')
```

## Table: `agentsam_subagent_profile`

Meta: `table=agentsam_subagent_profile` `group=workspace-projects` `rows=41` `tags=agentsam,d1,schema,workspace-projects`

### Purpose

agentsam table in the Workspaces, Projects, and Subagents domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_id, workspace_id, slug, display_name, instructions_markdown, allowed_tool_globs, default_model_id.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL, display_name TEXT NOT NULL, instructions_markdown TEXT, allowed_tool_globs TEXT, default_model_id TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now'), personality_tone TEXT DEFAULT 'professional', personality_traits TEXT, personality_rules TEXT, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write', run_in_background INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, agent_type TEXT DEFAULT 'custom', sandbox_mode TEXT DEFAULT 'workspace-write', model_reasoning_effort TEXT DEFAULT 'medium', nickname_candidates TEXT, can_spawn_subagents INTEGER DEFAULT 0, spawnable_agent_slugs TEXT, spawn_trigger_keywords TEXT, max_concurrent_threads INTEGER DEFAULT 6, max_spawn_depth INTEGER DEFAULT 1, job_timeout_seconds INTEGER DEFAULT 1800, mcp_servers_json TEXT, output_schema_json TEXT, is_parallelizable INTEGER DEFAULT 0, codex_compatible INTEGER DEFAULT 0, person_uuid TEXT, tenant_id TEXT, ai_model_id TEXT, is_platform_global INTEGER NOT NULL DEFAULT 0
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `''` | 0 |
| 3 | `slug` | `TEXT` | 1 | `None` | 0 |
| 4 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `instructions_markdown` | `TEXT` | 0 | `None` | 0 |
| 6 | `allowed_tool_globs` | `TEXT` | 0 | `None` | 0 |
| 7 | `default_model_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 9 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 10 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 11 | `personality_tone` | `TEXT` | 0 | `'professional'` | 0 |
| 12 | `personality_traits` | `TEXT` | 0 | `None` | 0 |
| 13 | `personality_rules` | `TEXT` | 0 | `None` | 0 |
| 14 | `description` | `TEXT` | 1 | `''` | 0 |
| 15 | `icon` | `TEXT` | 1 | `''` | 0 |
| 16 | `access_mode` | `TEXT` | 1 | `'read_write'` | 0 |
| 17 | `run_in_background` | `INTEGER` | 1 | `0` | 0 |
| 18 | `sort_order` | `INTEGER` | 1 | `0` | 0 |
| 19 | `agent_type` | `TEXT` | 0 | `'custom'` | 0 |
| 20 | `sandbox_mode` | `TEXT` | 0 | `'workspace-write'` | 0 |
| 21 | `model_reasoning_effort` | `TEXT` | 0 | `'medium'` | 0 |
| 22 | `nickname_candidates` | `TEXT` | 0 | `None` | 0 |
| 23 | `can_spawn_subagents` | `INTEGER` | 0 | `0` | 0 |
| 24 | `spawnable_agent_slugs` | `TEXT` | 0 | `None` | 0 |
| 25 | `spawn_trigger_keywords` | `TEXT` | 0 | `None` | 0 |
| 26 | `max_concurrent_threads` | `INTEGER` | 0 | `6` | 0 |
| 27 | `max_spawn_depth` | `INTEGER` | 0 | `1` | 0 |
| 28 | `job_timeout_seconds` | `INTEGER` | 0 | `1800` | 0 |
| 29 | `mcp_servers_json` | `TEXT` | 0 | `None` | 0 |
| 30 | `output_schema_json` | `TEXT` | 0 | `None` | 0 |
| 31 | `is_parallelizable` | `INTEGER` | 0 | `0` | 0 |
| 32 | `codex_compatible` | `INTEGER` | 0 | `0` | 0 |
| 33 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 34 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 35 | `ai_model_id` | `TEXT` | 0 | `None` | 0 |
| 36 | `is_platform_global` | `INTEGER` | 1 | `0` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_subagent_user` | 0 | `c` | 0 | `user_id` |
| `sqlite_autoindex_agentsam_subagent_profile_2` | 1 | `u` | 0 | `user_id, workspace_id, slug` |
| `sqlite_autoindex_agentsam_subagent_profile_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_subagent_profile (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  instructions_markdown TEXT,
  allowed_tool_globs TEXT,
  default_model_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), personality_tone TEXT DEFAULT 'professional', personality_traits TEXT, personality_rules TEXT, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')), run_in_background INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, agent_type TEXT DEFAULT 'custom', sandbox_mode TEXT DEFAULT 'workspace-write', model_reasoning_effort TEXT DEFAULT 'medium', nickname_candidates TEXT, can_spawn_subagents INTEGER DEFAULT 0, spawnable_agent_slugs TEXT, spawn_trigger_keywords TEXT, max_concurrent_threads INTEGER DEFAULT 6, max_spawn_depth INTEGER DEFAULT 1, job_timeout_seconds INTEGER DEFAULT 1800, mcp_servers_json TEXT, output_schema_json TEXT, is_parallelizable INTEGER DEFAULT 0, codex_compatible INTEGER DEFAULT 0, person_uuid TEXT, tenant_id TEXT, ai_model_id TEXT, is_platform_global INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, workspace_id, slug)
)
```

## Table: `agentsam_workspace`

Meta: `table=agentsam_workspace` `group=workspace-projects` `rows=24` `tags=agentsam,d1,schema,workspace,workspace-projects`

### Purpose

Workspace-level configuration for Agent Sam, including project/repo/R2/model/subagent context.

### Relationship hints

- `agentsam_workspace_state`

### Compact columns

```txt
id TEXT PK, workspace_slug TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT 'tenant_inneranimalmedia', project_id TEXT, project_slug TEXT, name TEXT NOT NULL, description TEXT, root_path TEXT, r2_bucket TEXT, status TEXT NOT NULL DEFAULT 'active', metadata_json TEXT DEFAULT '{}', created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch(), r2_prefix TEXT, github_repo TEXT, default_model_id TEXT, primary_subagent_id TEXT, display_name TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `workspace_slug` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 1 | `'tenant_inneranimalmedia'` | 0 |
| 3 | `project_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `project_slug` | `TEXT` | 0 | `None` | 0 |
| 5 | `name` | `TEXT` | 1 | `None` | 0 |
| 6 | `description` | `TEXT` | 0 | `None` | 0 |
| 7 | `root_path` | `TEXT` | 0 | `None` | 0 |
| 8 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 9 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 10 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 11 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 12 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 13 | `r2_prefix` | `TEXT` | 0 | `None` | 0 |
| 14 | `github_repo` | `TEXT` | 0 | `None` | 0 |
| 15 | `default_model_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `primary_subagent_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `display_name` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_agentsam_workspace_slug` | 0 | `c` | 0 | `workspace_slug` |
| `sqlite_autoindex_agentsam_workspace_2` | 1 | `u` | 0 | `workspace_slug` |
| `sqlite_autoindex_agentsam_workspace_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_workspace (
  id TEXT PRIMARY KEY,
  workspace_slug TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_inneranimalmedia',
  project_id TEXT,
  project_slug TEXT,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT,
  r2_bucket TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','archived','paused')),
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, r2_prefix TEXT, github_repo TEXT, default_model_id TEXT, primary_subagent_id TEXT, display_name TEXT)
```

## Table: `agentsam_workspace_state`

Meta: `table=agentsam_workspace_state` `group=workspace-projects` `rows=6` `tags=agentsam,d1,schema,workspace,workspace-projects`

### Purpose

agentsam table in the Workspaces, Projects, and Subagents domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id, conversation_id, workspace_type, active_file, files_open, state_json, locked_by.

### Relationship hints

- `agentsam_workspace`

### Compact columns

```txt
id TEXT PK DEFAULT 'wss_' || lower(hex(randomblob(8))), workspace_id TEXT NOT NULL, conversation_id TEXT, workspace_type TEXT NOT NULL DEFAULT 'ide', active_file TEXT, files_open TEXT NOT NULL DEFAULT '[]', state_json TEXT NOT NULL DEFAULT '{}', locked_by TEXT, lock_expires_at INTEGER, lock_reason TEXT, agent_session_id TEXT, current_task_id TEXT, last_agent_action TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch(), agent_id TEXT, checkpoint_label TEXT, checkpoint_sha TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'wss_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `conversation_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `workspace_type` | `TEXT` | 1 | `'ide'` | 0 |
| 4 | `active_file` | `TEXT` | 0 | `None` | 0 |
| 5 | `files_open` | `TEXT` | 1 | `'[]'` | 0 |
| 6 | `state_json` | `TEXT` | 1 | `'{}'` | 0 |
| 7 | `locked_by` | `TEXT` | 0 | `None` | 0 |
| 8 | `lock_expires_at` | `INTEGER` | 0 | `None` | 0 |
| 9 | `lock_reason` | `TEXT` | 0 | `None` | 0 |
| 10 | `agent_session_id` | `TEXT` | 0 | `None` | 0 |
| 11 | `current_task_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `last_agent_action` | `TEXT` | 0 | `None` | 0 |
| 13 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 14 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 15 | `agent_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `checkpoint_label` | `TEXT` | 0 | `None` | 0 |
| 17 | `checkpoint_sha` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `uidx_agentsam_workspace_state_workspace` | 1 | `c` | 0 | `workspace_id` |
| `idx_agentsam_workspace_state_conv` | 0 | `c` | 0 | `conversation_id` |
| `idx_agentsam_workspace_state_ws` | 0 | `c` | 0 | `workspace_id, updated_at` |
| `sqlite_autoindex_agentsam_workspace_state_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE agentsam_workspace_state (
  id                TEXT PRIMARY KEY DEFAULT ('wss_' || lower(hex(randomblob(8)))),
  workspace_id      TEXT NOT NULL REFERENCES agentsam_workspace(id) ON DELETE CASCADE,
  conversation_id   TEXT,
  workspace_type    TEXT NOT NULL DEFAULT 'ide',
  active_file       TEXT,
  files_open        TEXT NOT NULL DEFAULT '[]',
  state_json        TEXT NOT NULL DEFAULT '{}',
  locked_by         TEXT,
  lock_expires_at   INTEGER,
  lock_reason       TEXT,
  agent_session_id  TEXT,
  current_task_id   TEXT,
  last_agent_action TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
, agent_id TEXT, checkpoint_label TEXT, checkpoint_sha TEXT)
```

