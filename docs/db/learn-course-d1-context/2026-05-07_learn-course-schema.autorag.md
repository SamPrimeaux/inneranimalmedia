---
doc_type: autorag_schema_context
scope: learn-course-platform-cms-support
database: inneranimalmedia-business
generated_at: 2026-05-07T04:48:31.022295+00:00
date: 2026-05-07
chunking_strategy: one-table-per-section
tags: [d1, schema, learn, course-platform, cms-support, cursor-context]
---

# AutoRAG Schema Context: Learn/Course Platform

This document is optimized for retrieval. Each table section repeats scope, tags, table name, row count, compact columns, and CREATE SQL.

<!-- chunk:table name=agentsam_user_feature_override scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.agentsam_user_feature_override

table_name: `agentsam_user_feature_override`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `agentsam_user_feature_override` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
user_id TEXT PK NOT NULL, flag_key TEXT PK NOT NULL, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT
```

create_sql:
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

columns_json:
```json
[
  {
    "cid": 0,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "flag_key",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 2
  },
  {
    "cid": 2,
    "name": "enabled",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 4,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=agentsam_user_policy scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.agentsam_user_policy

table_name: `agentsam_user_policy`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `4`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `agentsam_user_policy` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
user_id TEXT PK NOT NULL, workspace_id TEXT PK NOT NULL DEFAULT '', auto_run_mode TEXT NOT NULL DEFAULT 'allowlist', browser_protection INTEGER NOT NULL DEFAULT 0, mcp_tools_protection INTEGER NOT NULL DEFAULT 1, file_deletion_protection INTEGER NOT NULL DEFAULT 1, external_file_protection INTEGER NOT NULL DEFAULT 1, default_agent_location TEXT DEFAULT 'pane', text_size TEXT DEFAULT 'default', auto_clear_chat INTEGER NOT NULL DEFAULT 0, submit_with_mod_enter INTEGER NOT NULL DEFAULT 0, max_tab_count INTEGER NOT NULL DEFAULT 5, queue_messages_mode TEXT DEFAULT 'after_current', usage_summary_mode TEXT DEFAULT 'auto', agent_autocomplete INTEGER NOT NULL DEFAULT 1, web_search_enabled INTEGER NOT NULL DEFAULT 1, auto_accept_web_search INTEGER NOT NULL DEFAULT 0, web_fetch_enabled INTEGER NOT NULL DEFAULT 1, hierarchical_ignore INTEGER NOT NULL DEFAULT 0, ignore_symlinks INTEGER NOT NULL DEFAULT 0, inline_diffs INTEGER NOT NULL DEFAULT 1, jump_next_diff_on_accept INTEGER NOT NULL DEFAULT 1, auto_format_on_agent_finish INTEGER NOT NULL DEFAULT 0, legacy_terminal_tool INTEGER NOT NULL DEFAULT 1, toolbar_on_selection INTEGER NOT NULL DEFAULT 1, auto_parse_links INTEGER NOT NULL DEFAULT 0, themed_diff_backgrounds INTEGER NOT NULL DEFAULT 1, terminal_hint INTEGER NOT NULL DEFAULT 1, terminal_preview_box INTEGER NOT NULL DEFAULT 1, collapse_auto_run_commands INTEGER NOT NULL DEFAULT 1, voice_submit_keyword TEXT DEFAULT 'submit', commit_attribution INTEGER NOT NULL DEFAULT 1, pr_attribution INTEGER NOT NULL DEFAULT 1, settings_json TEXT, updated_at TEXT NOT NULL DEFAULT datetime('now'), person_uuid TEXT, tenant_id TEXT DEFAULT '', superadmin_uuid TEXT, max_cost_per_session_usd REAL DEFAULT NULL, max_cost_per_call_usd REAL DEFAULT NULL, allowed_model_tier_max INTEGER DEFAULT 4, tool_risk_level_max TEXT DEFAULT 'high', require_allowlist_for_mcp INTEGER DEFAULT 1, allow_subagent_spawn INTEGER DEFAULT 0, max_spawn_depth INTEGER DEFAULT 1, max_tool_chain_depth INTEGER DEFAULT 8
```

create_sql:
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

columns_json:
```json
[
  {
    "cid": 0,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 2
  },
  {
    "cid": 2,
    "name": "auto_run_mode",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'allowlist'",
    "pk": 0
  },
  {
    "cid": 3,
    "name": "browser_protection",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 4,
    "name": "mcp_tools_protection",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "file_deletion_protection",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "external_file_protection",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "default_agent_location",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'pane'",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "text_size",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'default'",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "auto_clear_chat",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "submit_with_mod_enter",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "max_tab_count",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "5",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "queue_messages_mode",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'after_current'",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "usage_summary_mode",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'auto'",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "agent_autocomplete",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "web_search_enabled",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "auto_accept_web_search",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "web_fetch_enabled",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 18,
    "name": "hierarchical_ignore",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 19,
    "name": "ignore_symlinks",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 20,
    "name": "inline_diffs",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 21,
    "name": "jump_next_diff_on_accept",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 22,
    "name": "auto_format_on_agent_finish",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 23,
    "name": "legacy_terminal_tool",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 24,
    "name": "toolbar_on_selection",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 25,
    "name": "auto_parse_links",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 26,
    "name": "themed_diff_backgrounds",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 27,
    "name": "terminal_hint",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 28,
    "name": "terminal_preview_box",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 29,
    "name": "collapse_auto_run_commands",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 30,
    "name": "voice_submit_keyword",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'submit'",
    "pk": 0
  },
  {
    "cid": 31,
    "name": "commit_attribution",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 32,
    "name": "pr_attribution",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 33,
    "name": "settings_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 34,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 35,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 36,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "''",
    "pk": 0
  },
  {
    "cid": 37,
    "name": "superadmin_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 38,
    "name": "max_cost_per_session_usd",
    "type": "REAL",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 39,
    "name": "max_cost_per_call_usd",
    "type": "REAL",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 40,
    "name": "allowed_model_tier_max",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "4",
    "pk": 0
  },
  {
    "cid": 41,
    "name": "tool_risk_level_max",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'high'",
    "pk": 0
  },
  {
    "cid": 42,
    "name": "require_allowlist_for_mcp",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 43,
    "name": "allow_subagent_spawn",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 44,
    "name": "max_spawn_depth",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 45,
    "name": "max_tool_chain_depth",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "8",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=auth_user_identities scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.auth_user_identities

table_name: `auth_user_identities`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `4`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `auth_user_identities` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT 'aui_' || lower(hex(randomblob(8))), auth_user_id TEXT NOT NULL, provider TEXT NOT NULL, provider_subject_id TEXT NOT NULL, email TEXT, metadata_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT
```

create_sql:
```sql
CREATE TABLE auth_user_identities (
  id TEXT PRIMARY KEY DEFAULT ('aui_' || lower(hex(randomblob(8)))),
  auth_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject_id TEXT NOT NULL,
  email TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(provider, provider_subject_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'aui_' || lower(hex(randomblob(8)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "auth_user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "provider",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "provider_subject_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "email",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "metadata_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=auth_users scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.auth_users

table_name: `auth_users`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `10`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `auth_users` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, email TEXT NOT NULL, name TEXT, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now'), tenant_id TEXT, is_superadmin INTEGER DEFAULT 0, superadmin_group_id TEXT, is_verified INTEGER NOT NULL DEFAULT 0, verified_at INTEGER, superadmin_uuid TEXT, superadmin_identity_id TEXT, person_uuid TEXT, supabase_user_id TEXT, status TEXT DEFAULT 'active', active_tenant_id TEXT, active_workspace_id TEXT
```

create_sql:
```sql
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, tenant_id TEXT, is_superadmin INTEGER DEFAULT 0, superadmin_group_id TEXT, is_verified INTEGER NOT NULL DEFAULT 0, verified_at INTEGER, superadmin_uuid TEXT, superadmin_identity_id TEXT, person_uuid TEXT, supabase_user_id TEXT, status TEXT DEFAULT 'active', active_tenant_id TEXT, active_workspace_id TEXT)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "email",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "password_hash",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "salt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "is_superadmin",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "superadmin_group_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "is_verified",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "verified_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "superadmin_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "superadmin_identity_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "supabase_user_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 16,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'active'",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "active_tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 18,
    "name": "active_workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_activity_log scope=learn-course-platform-cms-support tags=activity-log,analytics,cms,cms-support,d1,inneranimalmedia,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_activity_log

table_name: `cms_activity_log`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `1`
tags: `activity-log, analytics, cms, cms-support, d1, inneranimalmedia, schema`

retrieval_summary:
- Use table `cms_activity_log` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, details TEXT, ip_address TEXT, user_agent TEXT, created_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE cms_activity_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES cms_tenants(id) ON DELETE CASCADE
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "action",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "resource_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "resource_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "details",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "ip_address",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "user_agent",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_assets scope=learn-course-platform-cms-support tags=assets,cms,cms-support,d1,inneranimalmedia,r2-resources,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_assets

table_name: `cms_assets`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `100`
tags: `assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema`

retrieval_summary:
- Use table `cms_assets` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT NOT NULL, filename TEXT NOT NULL, original_filename TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL, mime_type TEXT NOT NULL, category TEXT NOT NULL, tags TEXT, cloudflare_image_id TEXT, r2_key TEXT NOT NULL, public_url TEXT NOT NULL, thumbnail_url TEXT, metadata TEXT, created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_live INTEGER NOT NULL DEFAULT 0, notes TEXT, builds TEXT, preferred_bg TEXT, r2_bucket TEXT, s3_endpoint TEXT
```

create_sql:
```sql
CREATE TABLE cms_assets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    category TEXT NOT NULL,
    tags TEXT,
    cloudflare_image_id TEXT,
    r2_key TEXT NOT NULL,
    public_url TEXT NOT NULL,
    thumbnail_url TEXT,
    metadata TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_live INTEGER NOT NULL DEFAULT 0, notes TEXT, builds TEXT, preferred_bg TEXT, r2_bucket TEXT, s3_endpoint TEXT,
    FOREIGN KEY (tenant_id) REFERENCES cms_tenants(id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "filename",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "original_filename",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "path",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "size",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "mime_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "category",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "tags",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "cloudflare_image_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "r2_key",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "public_url",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "thumbnail_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "metadata",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "created_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "created_at",
    "type": "DATETIME",
    "notnull": 0,
    "dflt_value": "CURRENT_TIMESTAMP",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "updated_at",
    "type": "DATETIME",
    "notnull": 0,
    "dflt_value": "CURRENT_TIMESTAMP",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "is_live",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 18,
    "name": "notes",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 19,
    "name": "builds",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 20,
    "name": "preferred_bg",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 21,
    "name": "r2_bucket",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 22,
    "name": "s3_endpoint",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_collection_assets scope=learn-course-platform-cms-support tags=assets,cms,cms-support,d1,inneranimalmedia,r2-resources,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_collection_assets

table_name: `cms_collection_assets`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema`

retrieval_summary:
- Use table `cms_collection_assets` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
collection_id TEXT PK NOT NULL, asset_id TEXT PK NOT NULL, order_index INTEGER DEFAULT 0, added_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE cms_collection_assets (
    collection_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (collection_id, asset_id),
    FOREIGN KEY (collection_id) REFERENCES cms_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES cms_assets(id) ON DELETE CASCADE
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "collection_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "asset_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 2
  },
  {
    "cid": 2,
    "name": "order_index",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 3,
    "name": "added_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_collections scope=learn-course-platform-cms-support tags=assets,cms,cms-support,d1,inneranimalmedia,r2-resources,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_collections

table_name: `cms_collections`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `5`
tags: `assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema`

retrieval_summary:
- Use table `cms_collections` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, thumbnail_url TEXT, is_public INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE cms_collections (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    is_public INTEGER DEFAULT 0,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES cms_tenants(id) ON DELETE CASCADE
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "thumbnail_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "is_public",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "created_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_component_templates scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_component_templates

table_name: `cms_component_templates`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `24`
tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`

retrieval_summary:
- Use table `cms_component_templates` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), template_name TEXT NOT NULL, template_type TEXT NOT NULL, category TEXT NOT NULL, preview_image_url TEXT, template_data TEXT NOT NULL, is_system INTEGER DEFAULT 1, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now'), r2_bucket TEXT, r2_key TEXT, s3_endpoint TEXT, tenant_id TEXT
```

create_sql:
```sql
CREATE TABLE cms_component_templates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL, 
  category TEXT NOT NULL, 
  preview_image_url TEXT,
  template_data TEXT NOT NULL, 
  is_system INTEGER DEFAULT 1, 
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, r2_bucket TEXT, r2_key TEXT, s3_endpoint TEXT, tenant_id TEXT)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "lower(hex(randomblob(16)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "template_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "template_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "category",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "preview_image_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "template_data",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "is_system",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "r2_bucket",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "r2_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "s3_endpoint",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_global_settings scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_global_settings

table_name: `cms_global_settings`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `5`
tags: `cms, cms-support, d1, inneranimalmedia, schema`

retrieval_summary:
- Use table `cms_global_settings` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), project_id INTEGER NOT NULL, site_name TEXT, site_logo_url TEXT, site_favicon_url TEXT, contact_email TEXT, contact_phone TEXT, social_links TEXT, footer_text TEXT, header_announcement TEXT, seo_defaults TEXT, scripts_head TEXT, scripts_body TEXT, analytics_id TEXT, settings_json TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

create_sql:
```sql
CREATE TABLE cms_global_settings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id INTEGER NOT NULL UNIQUE,
  site_name TEXT,
  site_logo_url TEXT,
  site_favicon_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  social_links TEXT, 
  footer_text TEXT,
  header_announcement TEXT,
  seo_defaults TEXT, 
  scripts_head TEXT, 
  scripts_body TEXT, 
  analytics_id TEXT,
  settings_json TEXT, 
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "lower(hex(randomblob(16)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "project_id",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "site_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "site_logo_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "site_favicon_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "contact_email",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "contact_phone",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "social_links",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "footer_text",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "header_announcement",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "seo_defaults",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "scripts_head",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "scripts_body",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "analytics_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "settings_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_navigation_menus scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_navigation_menus

table_name: `cms_navigation_menus`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `3`
tags: `cms, cms-support, d1, inneranimalmedia, schema`

retrieval_summary:
- Use table `cms_navigation_menus` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), project_id TEXT NOT NULL, project_slug TEXT, tenant_id TEXT, menu_name TEXT NOT NULL, menu_type TEXT DEFAULT 'site', menu_items TEXT NOT NULL, is_active INTEGER DEFAULT 1, r2_bucket TEXT, r2_key TEXT, r2_url TEXT, s3_endpoint TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

create_sql:
```sql
CREATE TABLE cms_navigation_menus (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  project_id TEXT NOT NULL,
  project_slug TEXT,
  tenant_id TEXT,

  menu_name TEXT NOT NULL,
  menu_type TEXT DEFAULT 'site',
  menu_items TEXT NOT NULL,

  is_active INTEGER DEFAULT 1,

  r2_bucket TEXT,
  r2_key TEXT,
  r2_url TEXT,
  s3_endpoint TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(project_id, menu_name)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "lower(hex(randomblob(16)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "project_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "project_slug",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "menu_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "menu_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'site'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "menu_items",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "is_active",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "r2_bucket",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "r2_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "r2_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "s3_endpoint",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_page_sections scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_page_sections

table_name: `cms_page_sections`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `41`
tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`

retrieval_summary:
- Use table `cms_page_sections` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, page_id TEXT NOT NULL, section_type TEXT NOT NULL, section_name TEXT NOT NULL, section_data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1, css_classes TEXT, custom_css TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

create_sql:
```sql
CREATE TABLE cms_page_sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  section_type TEXT NOT NULL,
  section_name TEXT NOT NULL,
  section_data TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  css_classes TEXT,
  custom_css TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (page_id)
    REFERENCES cms_pages(id)
    ON DELETE CASCADE
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "page_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "section_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "section_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "section_data",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "sort_order",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "is_visible",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "css_classes",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "custom_css",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_pages scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_pages

table_name: `cms_pages`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `17`
tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`

retrieval_summary:
- Use table `cms_pages` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, project_id TEXT NOT NULL, project_slug TEXT NOT NULL, tenant_id TEXT NOT NULL, workspace_id TEXT, worker_id TEXT, person_uuid TEXT, slug TEXT NOT NULL, path TEXT NOT NULL, route_path TEXT NOT NULL, page_type TEXT NOT NULL, title TEXT NOT NULL, meta_description TEXT, description TEXT, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT, canonical_url TEXT, robots TEXT DEFAULT 'index,follow', og_image_asset_id TEXT, r2_bucket TEXT, r2_key TEXT, r2_url TEXT, content_type TEXT DEFAULT 'text/html', content_size_bytes INTEGER DEFAULT 0, config_json TEXT DEFAULT '{}', seo_json TEXT DEFAULT '{}', analytics_json TEXT DEFAULT '{}', metadata_json TEXT DEFAULT '{}', is_homepage INTEGER DEFAULT 0, is_system_page INTEGER DEFAULT 0, requires_auth INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_by TEXT, updated_by TEXT, published_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER, archived_at INTEGER
```

create_sql:
```sql
CREATE TABLE cms_pages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  worker_id TEXT,
  person_uuid TEXT,

  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  route_path TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN (
    'home','about','services','work','case_study','contact','pricing',
    'privacy','terms','faq','product','collection','blog','post',
    'landing','portal','dashboard','auth','sitemap','custom'
  )),

  title TEXT NOT NULL,
  meta_description TEXT,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','published','archived','scheduled')),

  seo_title TEXT,
  canonical_url TEXT,
  robots TEXT DEFAULT 'index,follow',
  og_image_asset_id TEXT,

  r2_bucket TEXT,
  r2_key TEXT,
  r2_url TEXT,
  content_type TEXT DEFAULT 'text/html',
  content_size_bytes INTEGER DEFAULT 0,

  config_json TEXT DEFAULT '{}',
  seo_json TEXT DEFAULT '{}',
  analytics_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',

  is_homepage INTEGER DEFAULT 0,
  is_system_page INTEGER DEFAULT 0,
  requires_auth INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,

  created_by TEXT,
  updated_by TEXT,
  published_by TEXT,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  archived_at INTEGER,

  UNIQUE(project_id, slug),
  UNIQUE(project_id, route_path)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "project_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "project_slug",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "worker_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "slug",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "path",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "route_path",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "page_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "title",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "meta_description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "status",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'draft'",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "seo_title",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 16,
    "name": "canonical_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 17,
    "name": "robots",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'index,follow'",
    "pk": 0
  },
  {
    "cid": 18,
    "name": "og_image_asset_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 19,
    "name": "r2_bucket",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 20,
    "name": "r2_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 21,
    "name": "r2_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 22,
    "name": "content_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'text/html'",
    "pk": 0
  },
  {
    "cid": 23,
    "name": "content_size_bytes",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 24,
    "name": "config_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 25,
    "name": "seo_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 26,
    "name": "analytics_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 27,
    "name": "metadata_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 28,
    "name": "is_homepage",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 29,
    "name": "is_system_page",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 30,
    "name": "requires_auth",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 31,
    "name": "is_active",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 32,
    "name": "sort_order",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 33,
    "name": "created_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 34,
    "name": "updated_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 35,
    "name": "published_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 36,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 37,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 38,
    "name": "published_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 39,
    "name": "archived_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_section_components scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_section_components

table_name: `cms_section_components`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `73`
tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`

retrieval_summary:
- Use table `cms_section_components` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), section_id TEXT NOT NULL, component_type TEXT NOT NULL, component_data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1, tenant_id TEXT, project_id TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

create_sql:
```sql
CREATE TABLE cms_section_components (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  section_id TEXT NOT NULL,
  component_type TEXT NOT NULL,
  component_data TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  tenant_id TEXT,
  project_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (section_id) REFERENCES cms_page_sections(id) ON DELETE CASCADE
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "lower(hex(randomblob(16)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "section_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "component_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "component_data",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 4,
    "name": "sort_order",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "is_visible",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "project_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_theme_preferences scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,schema,theme,tokens generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_theme_preferences

table_name: `cms_theme_preferences`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `4`
tags: `cms, cms-support, d1, inneranimalmedia, schema, theme, tokens`

retrieval_summary:
- Use table `cms_theme_preferences` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT NOT NULL DEFAULT 'default', user_id TEXT DEFAULT NULL, workspace_id TEXT DEFAULT NULL, project_id TEXT DEFAULT NULL, page_id TEXT DEFAULT NULL, theme_id TEXT NOT NULL, theme_slug TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'workspace', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now')
```

create_sql:
```sql
CREATE TABLE cms_theme_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  user_id TEXT DEFAULT NULL,
  workspace_id TEXT DEFAULT NULL,
  project_id TEXT DEFAULT NULL,
  page_id TEXT DEFAULT NULL,
  theme_id TEXT NOT NULL,
  theme_slug TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'workspace'
    CHECK (scope IN ('user_global','tenant','workspace','project','page')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, user_id, workspace_id, project_id, page_id, scope)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'default'",
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 3,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 4,
    "name": "project_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "page_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "theme_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "theme_slug",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "scope",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'workspace'",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "is_active",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "datetime('now')",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=cms_themes scope=learn-course-platform-cms-support tags=cms,cms-support,d1,inneranimalmedia,schema,theme,tokens generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.cms_themes

table_name: `cms_themes`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `104`
tags: `cms, cms-support, d1, inneranimalmedia, schema, theme, tokens`

retrieval_summary:
- Use table `cms_themes` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT, name TEXT NOT NULL, slug TEXT NOT NULL, css_url TEXT, config TEXT NOT NULL, is_system BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, wcag_scores TEXT, contrast_flags TEXT, theme_family TEXT DEFAULT 'custom', sort_order INTEGER DEFAULT 100, workspace_id TEXT DEFAULT NULL, monaco_theme TEXT NOT NULL DEFAULT 'vs-dark', monaco_bg TEXT NOT NULL DEFAULT '#1e293b', monaco_theme_data TEXT, tokens_json TEXT NOT NULL DEFAULT '{}', css_vars_json TEXT NOT NULL DEFAULT '{}', brand_json TEXT NOT NULL DEFAULT '{}', layout_json TEXT NOT NULL DEFAULT '{}', typography_json TEXT NOT NULL DEFAULT '{}', components_json TEXT NOT NULL DEFAULT '{}', motion_json TEXT NOT NULL DEFAULT '{}', css_r2_key TEXT DEFAULT NULL, compiled_css_hash TEXT DEFAULT NULL, preview_image_url TEXT DEFAULT NULL, status TEXT NOT NULL DEFAULT 'active', updated_at TEXT DEFAULT NULL, visibility TEXT NOT NULL DEFAULT 'public', alias_of_theme_id TEXT DEFAULT NULL, css_r2_bucket TEXT DEFAULT NULL
```

create_sql:
```sql
CREATE TABLE cms_themes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    css_url TEXT,
    config TEXT NOT NULL,
    is_system BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, wcag_scores TEXT, contrast_flags TEXT, theme_family TEXT DEFAULT 'custom', sort_order INTEGER DEFAULT 100, workspace_id TEXT DEFAULT NULL, monaco_theme TEXT NOT NULL DEFAULT 'vs-dark', monaco_bg TEXT NOT NULL DEFAULT '#1e293b', monaco_theme_data TEXT, tokens_json TEXT NOT NULL DEFAULT '{}', css_vars_json TEXT NOT NULL DEFAULT '{}', brand_json TEXT NOT NULL DEFAULT '{}', layout_json TEXT NOT NULL DEFAULT '{}', typography_json TEXT NOT NULL DEFAULT '{}', components_json TEXT NOT NULL DEFAULT '{}', motion_json TEXT NOT NULL DEFAULT '{}', css_r2_key TEXT DEFAULT NULL, compiled_css_hash TEXT DEFAULT NULL, preview_image_url TEXT DEFAULT NULL, status TEXT NOT NULL DEFAULT 'active', updated_at TEXT DEFAULT NULL, visibility TEXT NOT NULL DEFAULT 'public', alias_of_theme_id TEXT DEFAULT NULL, css_r2_bucket TEXT DEFAULT NULL,
    UNIQUE(tenant_id, slug)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "slug",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "css_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "config",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "is_system",
    "type": "BOOLEAN",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "created_at",
    "type": "DATETIME",
    "notnull": 0,
    "dflt_value": "CURRENT_TIMESTAMP",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "wcag_scores",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "contrast_flags",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "theme_family",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'custom'",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "sort_order",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "100",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "monaco_theme",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'vs-dark'",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "monaco_bg",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'#1e293b'",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "monaco_theme_data",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 16,
    "name": "tokens_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "css_vars_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 18,
    "name": "brand_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 19,
    "name": "layout_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 20,
    "name": "typography_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 21,
    "name": "components_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 22,
    "name": "motion_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 23,
    "name": "css_r2_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 24,
    "name": "compiled_css_hash",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 25,
    "name": "preview_image_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 26,
    "name": "status",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'active'",
    "pk": 0
  },
  {
    "cid": 27,
    "name": "updated_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 28,
    "name": "visibility",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'public'",
    "pk": 0
  },
  {
    "cid": 29,
    "name": "alias_of_theme_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 30,
    "name": "css_r2_bucket",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_assignments scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_assignments

table_name: `course_assignments`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `43`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_assignments` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, course_id TEXT NOT NULL, module_id TEXT NOT NULL, lesson_id TEXT, title TEXT NOT NULL, description TEXT, type TEXT DEFAULT 'deliverable', rubric TEXT, max_score INTEGER DEFAULT 100, required_evidence TEXT, due_offset_days INTEGER, is_graded INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  lesson_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'deliverable',
  rubric TEXT,
  max_score INTEGER DEFAULT 100,
  required_evidence TEXT,
  due_offset_days INTEGER,
  is_graded INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "module_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "lesson_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "title",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'deliverable'",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "rubric",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "max_score",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "100",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "required_evidence",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "due_offset_days",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "is_graded",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_exports scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_exports

table_name: `course_exports`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `7`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_exports` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, course_id TEXT NOT NULL, export_type TEXT DEFAULT 'template', file_url TEXT, r2_key TEXT, r2_bucket TEXT, file_size INTEGER, metadata TEXT, created_by TEXT, created_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_exports (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  export_type TEXT DEFAULT 'template',
  file_url TEXT,
  r2_key TEXT,
  r2_bucket TEXT,
  file_size INTEGER,
  metadata TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "export_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'template'",
    "pk": 0
  },
  {
    "cid": 3,
    "name": "file_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "r2_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "r2_bucket",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "file_size",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "metadata",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "created_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_grades scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_grades

table_name: `course_grades`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `1`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_grades` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, submission_id TEXT NOT NULL, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, enrollment_id TEXT NOT NULL, score INTEGER, max_score INTEGER DEFAULT 100, rubric_scores TEXT, time_score INTEGER, efficiency_score INTEGER, graded_by TEXT DEFAULT 'agent_sam', feedback TEXT, graded_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_grades (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL,
  score INTEGER,
  max_score INTEGER DEFAULT 100,
  rubric_scores TEXT,
  time_score INTEGER,
  efficiency_score INTEGER,
  graded_by TEXT DEFAULT 'agent_sam',
  feedback TEXT,
  graded_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "submission_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "assignment_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "enrollment_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "score",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "max_score",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "100",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "rubric_scores",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "time_score",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "efficiency_score",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "graded_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'agent_sam'",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "feedback",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "graded_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_lessons scope=learn-course-platform-cms-support tags=course-content,course-domain,course-platform,d1,inneranimalmedia,learn,lessons,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_lessons

table_name: `course_lessons`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `151`
tags: `course-content, course-domain, course-platform, d1, inneranimalmedia, learn, lessons, schema`

retrieval_summary:
- Use table `course_lessons` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, module_id TEXT NOT NULL, course_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT DEFAULT 'lesson', description TEXT, estimated_minutes INTEGER, order_index INTEGER NOT NULL, is_required INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, content TEXT, content_format TEXT NOT NULL DEFAULT 'markdown', has_content INTEGER NOT NULL DEFAULT 0, sandbox_query TEXT, sandbox_db TEXT DEFAULT 'd1'
```

create_sql:
```sql
CREATE TABLE course_lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'lesson',
  description TEXT,
  estimated_minutes INTEGER,
  order_index INTEGER NOT NULL,
  is_required INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, content TEXT, content_format TEXT NOT NULL DEFAULT 'markdown', has_content INTEGER NOT NULL DEFAULT 0, sandbox_query TEXT, sandbox_db TEXT DEFAULT 'd1')
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "module_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "title",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'lesson'",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "estimated_minutes",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "order_index",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "is_required",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "content",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "content_format",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'markdown'",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "has_content",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "sandbox_query",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "sandbox_db",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'d1'",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_modules scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_modules

table_name: `course_modules`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `70`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_modules` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, course_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, order_index INTEGER NOT NULL, is_required INTEGER DEFAULT 1, estimated_minutes INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  is_required INTEGER DEFAULT 1,
  estimated_minutes INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "title",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "order_index",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "is_required",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "estimated_minutes",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_progress scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_progress

table_name: `course_progress`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `62`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_progress` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, enrollment_id TEXT NOT NULL, user_id TEXT NOT NULL, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, module_id TEXT NOT NULL, status TEXT DEFAULT 'not_started', completed_at INTEGER, time_spent_minutes INTEGER DEFAULT 0, token_spend INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_progress (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT DEFAULT 'not_started',
  completed_at INTEGER,
  time_spent_minutes INTEGER DEFAULT 0,
  token_spend INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(enrollment_id, lesson_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "enrollment_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "lesson_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "module_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'not_started'",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "completed_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "time_spent_minutes",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "token_spend",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_reviews scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_reviews

table_name: `course_reviews`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_reviews` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, course_id TEXT NOT NULL, user_id TEXT NOT NULL, enrollment_id TEXT, rating INTEGER NOT NULL, title TEXT, review_text TEXT, is_verified INTEGER DEFAULT 0, is_public INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_reviews (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  enrollment_id TEXT,
  rating INTEGER NOT NULL,
  title TEXT,
  review_text TEXT,
  is_verified INTEGER DEFAULT 0,
  is_public INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(course_id, user_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "enrollment_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "rating",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "title",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "review_text",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "is_verified",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "is_public",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_roles scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_roles

table_name: `course_roles`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `3`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_roles` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, org_id TEXT, name TEXT NOT NULL, display_name TEXT NOT NULL, permissions TEXT NOT NULL, is_system INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_roles (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  permissions TEXT NOT NULL,
  is_system INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "org_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "display_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "permissions",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "is_system",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_submissions scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_submissions

table_name: `course_submissions`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `1`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `course_submissions` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, assignment_id TEXT NOT NULL, enrollment_id TEXT NOT NULL, user_id TEXT NOT NULL, course_id TEXT NOT NULL, status TEXT DEFAULT 'draft', evidence TEXT, submitted_at INTEGER, time_spent_minutes INTEGER, token_spend INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  evidence TEXT,
  submitted_at INTEGER,
  time_spent_minutes INTEGER,
  token_spend INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "assignment_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "enrollment_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'draft'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "evidence",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "submitted_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "time_spent_minutes",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "token_spend",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=course_users scope=learn-course-platform-cms-support tags=auth-context,course-domain,course-platform,d1,enrollment,inneranimalmedia,learn,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.course_users

table_name: `course_users`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `3`
tags: `auth-context, course-domain, course-platform, d1, enrollment, inneranimalmedia, learn, schema, users`

retrieval_summary:
- Use table `course_users` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, email TEXT NOT NULL, name TEXT, avatar_url TEXT, timezone TEXT DEFAULT 'UTC', language TEXT DEFAULT 'en', is_active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE course_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  language TEXT DEFAULT 'en',
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(email)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "email",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "avatar_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "timezone",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'UTC'",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "language",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'en'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "is_active",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=courses scope=learn-course-platform-cms-support tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.courses

table_name: `courses`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `14`
tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`

retrieval_summary:
- Use table `courses` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, org_id TEXT, title TEXT NOT NULL, slug TEXT NOT NULL, description TEXT, long_description TEXT, thumbnail_url TEXT, category TEXT, level TEXT DEFAULT 'beginner', duration_hours INTEGER, price_cents INTEGER DEFAULT 0, currency TEXT DEFAULT 'usd', is_public INTEGER DEFAULT 0, is_featured INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', instructor_id TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER
```

create_sql:
```sql
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  thumbnail_url TEXT,
  category TEXT,
  level TEXT DEFAULT 'beginner',
  duration_hours INTEGER,
  price_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'usd',
  is_public INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  instructor_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  UNIQUE(org_id, slug)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "org_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "title",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "slug",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "long_description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "thumbnail_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "category",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "level",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'beginner'",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "duration_hours",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "price_cents",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "currency",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'usd'",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "is_public",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "is_featured",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'draft'",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "instructor_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 16,
    "name": "metadata",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 17,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 18,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 19,
    "name": "published_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=enrollments scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.enrollments

table_name: `enrollments`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `5`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `enrollments` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, org_id TEXT NOT NULL, user_id TEXT NOT NULL, course_id TEXT NOT NULL, enrollment_type TEXT DEFAULT 'student', status TEXT DEFAULT 'active', progress_percent REAL DEFAULT 0, started_at INTEGER, completed_at INTEGER, expires_at INTEGER, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE enrollments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  enrollment_type TEXT DEFAULT 'student',
  status TEXT DEFAULT 'active',
  progress_percent REAL DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  expires_at INTEGER,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(org_id, user_id, course_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "org_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "enrollment_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'student'",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'active'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "progress_percent",
    "type": "REAL",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "started_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "completed_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "expires_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "metadata",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=iam_user_onboarding_step scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.iam_user_onboarding_step

table_name: `iam_user_onboarding_step`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `iam_user_onboarding_step` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', data_json TEXT, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch()
```

create_sql:
```sql
CREATE TABLE iam_user_onboarding_step (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  data_json TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(tenant_id, user_id, step)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "step",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "status",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'pending'",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "data_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=lesson_assets scope=learn-course-platform-cms-support tags=course-content,d1,inneranimalmedia,lessons,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.lesson_assets

table_name: `lesson_assets`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `course-content, d1, inneranimalmedia, lessons, schema`

retrieval_summary:
- Use table `lesson_assets` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, lesson_id TEXT NOT NULL, asset_type TEXT NOT NULL, asset_url TEXT NOT NULL, r2_key TEXT, r2_bucket TEXT, file_name TEXT, file_size INTEGER, mime_type TEXT, order_index INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE lesson_assets (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  r2_key TEXT,
  r2_bucket TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  order_index INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "lesson_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "asset_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "asset_url",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "r2_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "r2_bucket",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "file_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "file_size",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "mime_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "order_index",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=lesson_progress scope=learn-course-platform-cms-support tags=course-content,d1,inneranimalmedia,lessons,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.lesson_progress

table_name: `lesson_progress`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `course-content, d1, inneranimalmedia, lessons, schema`

retrieval_summary:
- Use table `lesson_progress` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, enrollment_id TEXT NOT NULL, user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, course_id TEXT NOT NULL, status TEXT DEFAULT 'not_started', progress_percent REAL DEFAULT 0, time_spent_seconds INTEGER DEFAULT 0, last_position INTEGER, completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE lesson_progress (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  status TEXT DEFAULT 'not_started',
  progress_percent REAL DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  last_position INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(enrollment_id, lesson_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "enrollment_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "lesson_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'not_started'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "progress_percent",
    "type": "REAL",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "time_spent_seconds",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "last_position",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "completed_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=lesson_versions scope=learn-course-platform-cms-support tags=course-content,d1,inneranimalmedia,lessons,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.lesson_versions

table_name: `lesson_versions`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `course-content, d1, inneranimalmedia, lessons, schema`

retrieval_summary:
- Use table `lesson_versions` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, lesson_id TEXT NOT NULL, version_number INTEGER NOT NULL, content_text TEXT, content_url TEXT, status TEXT DEFAULT 'draft', change_summary TEXT, created_by TEXT, created_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE lesson_versions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content_text TEXT,
  content_url TEXT,
  status TEXT DEFAULT 'draft',
  change_summary TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(lesson_id, version_number)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "lesson_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "version_number",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "content_text",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "content_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'draft'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "change_summary",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "created_by",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=lessons scope=learn-course-platform-cms-support tags=course-content,d1,inneranimalmedia,lessons,schema generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.lessons

table_name: `lessons`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `18`
tags: `course-content, d1, inneranimalmedia, lessons, schema`

retrieval_summary:
- Use table `lessons` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, module_id TEXT NOT NULL, course_id TEXT NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL, description TEXT, content_type TEXT DEFAULT 'text', content_url TEXT, content_text TEXT, order_index INTEGER NOT NULL, estimated_minutes INTEGER, is_required INTEGER DEFAULT 1, is_published INTEGER DEFAULT 0, published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  content_type TEXT DEFAULT 'text',
  content_url TEXT,
  content_text TEXT,
  order_index INTEGER NOT NULL,
  estimated_minutes INTEGER,
  is_required INTEGER DEFAULT 1,
  is_published INTEGER DEFAULT 0,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(course_id, slug)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "module_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "course_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "title",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "slug",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "content_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'text'",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "content_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "content_text",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "order_index",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "estimated_minutes",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "is_required",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "is_published",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "published_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=org_users scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.org_users

table_name: `org_users`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `4`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `org_users` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, org_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', permissions TEXT, joined_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

create_sql:
```sql
CREATE TABLE org_users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  permissions TEXT,
  joined_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(org_id, user_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "org_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "role",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'student'",
    "pk": 0
  },
  {
    "cid": 4,
    "name": "permissions",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "joined_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_api_keys scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_api_keys

table_name: `user_api_keys`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_api_keys` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT 'uak_'||lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, provider TEXT NOT NULL, key_name TEXT NOT NULL, key_preview TEXT, key_hash TEXT, is_active INTEGER DEFAULT 1, last_used_at TEXT, created_at TEXT DEFAULT datetime('now'), person_uuid TEXT, workspace_id TEXT DEFAULT NULL, encrypted_value TEXT DEFAULT NULL, allowed_models_json TEXT DEFAULT NULL, rate_limit_per_hour INTEGER DEFAULT 1000, use_count INTEGER DEFAULT 0, last_ip TEXT DEFAULT NULL, expires_at INTEGER DEFAULT NULL, scopes_json TEXT DEFAULT '["inference"]'
```

create_sql:
```sql
CREATE TABLE user_api_keys (
  id TEXT PRIMARY KEY DEFAULT ('uak_'||lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  key_preview TEXT,
  key_hash TEXT,
  is_active INTEGER DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
, person_uuid TEXT, workspace_id TEXT DEFAULT NULL, encrypted_value TEXT DEFAULT NULL, allowed_models_json TEXT DEFAULT NULL, rate_limit_per_hour INTEGER DEFAULT 1000, use_count INTEGER DEFAULT 0, last_ip TEXT DEFAULT NULL, expires_at INTEGER DEFAULT NULL, scopes_json TEXT DEFAULT '["inference"]')
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'uak_'||lower(hex(randomblob(8)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "provider",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "key_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "key_preview",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "key_hash",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "is_active",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "last_used_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "encrypted_value",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "allowed_models_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "rate_limit_per_hour",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1000",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "use_count",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "last_ip",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "expires_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "NULL",
    "pk": 0
  },
  {
    "cid": 18,
    "name": "scopes_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'[\"inference\"]'",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_backup_codes scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_backup_codes

table_name: `user_backup_codes`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `10`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_backup_codes` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, user_id TEXT NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER, created_at INTEGER, person_uuid TEXT
```

create_sql:
```sql
CREATE TABLE user_backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER
, person_uuid TEXT)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "code_hash",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "used_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_connections scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_connections

table_name: `user_connections`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `2`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_connections` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, connection_type TEXT NOT NULL, display_name TEXT NOT NULL, host TEXT, port INTEGER, database_name TEXT, username TEXT, password_secret_ref TEXT, ssl_mode TEXT DEFAULT 'require', is_active INTEGER DEFAULT 1, last_tested_at TEXT, last_test_status TEXT, metadata_json TEXT DEFAULT '{}', created_at TEXT DEFAULT datetime('now'), person_uuid TEXT, workspace_id TEXT, hyperdrive_id TEXT
```

create_sql:
```sql
CREATE TABLE user_connections (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            connection_type TEXT NOT NULL CHECK(connection_type IN (
              'supabase','postgres','mysql','sqlite','d1','planetscale','neon','turso'
            )),
            display_name TEXT NOT NULL,
            host TEXT,
            port INTEGER,
            database_name TEXT,
            username TEXT,
            password_secret_ref TEXT,
            ssl_mode TEXT DEFAULT 'require',
            is_active INTEGER DEFAULT 1,
            last_tested_at TEXT,
            last_test_status TEXT CHECK(last_test_status IN ('ok','error','timeout',NULL)),
            metadata_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')), person_uuid TEXT, workspace_id TEXT, hyperdrive_id TEXT,
            UNIQUE(tenant_id, user_id, display_name)
          )
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "connection_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "display_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "host",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "port",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "database_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "username",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "password_secret_ref",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "ssl_mode",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'require'",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "is_active",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "last_tested_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "last_test_status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "metadata_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "created_at",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "datetime('now')",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 17,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 18,
    "name": "hyperdrive_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_goals scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_goals

table_name: `user_goals`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `5`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_goals` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, goal_saved REAL NOT NULL DEFAULT 0, goal_paid_off REAL NOT NULL DEFAULT 0, goal_owed REAL NOT NULL DEFAULT 0, goal_monthly_payment REAL NOT NULL DEFAULT 0, goal_target_label TEXT, updated_at INTEGER NOT NULL DEFAULT unixepoch(), user_id TEXT, person_uuid TEXT, goal_type TEXT DEFAULT 'financial', title TEXT, description TEXT, priority INTEGER DEFAULT 1, status TEXT DEFAULT 'active', target_date INTEGER, completed_at INTEGER, workspace_id TEXT, tenant_id TEXT, metadata_json TEXT DEFAULT '{}'
```

create_sql:
```sql
CREATE TABLE user_goals (
  id TEXT PRIMARY KEY,
  goal_saved REAL NOT NULL DEFAULT 0,
  goal_paid_off REAL NOT NULL DEFAULT 0,
  goal_owed REAL NOT NULL DEFAULT 0,
  goal_monthly_payment REAL NOT NULL DEFAULT 0,
  goal_target_label TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, user_id TEXT, person_uuid TEXT, goal_type TEXT DEFAULT 'financial' CHECK(goal_type IN ('financial','project','learning','client','platform','personal')), title TEXT, description TEXT, priority INTEGER DEFAULT 1, status TEXT DEFAULT 'active', target_date INTEGER, completed_at INTEGER, workspace_id TEXT, tenant_id TEXT, metadata_json TEXT DEFAULT '{}')
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "goal_saved",
    "type": "REAL",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 2,
    "name": "goal_paid_off",
    "type": "REAL",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 3,
    "name": "goal_owed",
    "type": "REAL",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 4,
    "name": "goal_monthly_payment",
    "type": "REAL",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "goal_target_label",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "goal_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'financial'",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "title",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "priority",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'active'",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "target_date",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "completed_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 16,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 17,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 18,
    "name": "metadata_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_governance_roles scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_governance_roles

table_name: `user_governance_roles`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `10`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_governance_roles` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
user_id TEXT PK NOT NULL, role_id TEXT PK NOT NULL, workspace_id TEXT PK NOT NULL DEFAULT '', tenant_id TEXT PK NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT unixepoch()
```

create_sql:
```sql
CREATE TABLE user_governance_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  tenant_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, role_id, workspace_id, tenant_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "role_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 2
  },
  {
    "cid": 2,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 3
  },
  {
    "cid": 3,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 4
  },
  {
    "cid": 4,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "unixepoch()",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_intake_profiles scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_intake_profiles

table_name: `user_intake_profiles`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `1`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_intake_profiles` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, auth_user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, skill_level TEXT, current_stack TEXT, favorite_tools TEXT, favorite_ai TEXT, favorite_platforms TEXT, aspirations TEXT, goals_json TEXT, published_work_json TEXT, github_username TEXT, portfolio_url TEXT, communication_pref TEXT DEFAULT 'email', timezone TEXT DEFAULT 'America/Chicago', intake_completed INTEGER DEFAULT 0, intake_completed_at INTEGER, intake_token TEXT, intake_token_expires_at INTEGER, agent_profile_built INTEGER DEFAULT 0, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch(), person_uuid TEXT, workspace_id TEXT, preferred_name TEXT, bio TEXT, avatar_url TEXT, linkedin_url TEXT, twitter_handle TEXT, cf_account_id TEXT, preferred_models_json TEXT, onboarding_step INTEGER DEFAULT 0, last_active_at INTEGER, bridge_key_hash TEXT
```

create_sql:
```sql
CREATE TABLE user_intake_profiles (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  skill_level TEXT CHECK(skill_level IN ('beginner','intermediate','advanced','expert')),
  current_stack TEXT,
  favorite_tools TEXT,
  favorite_ai TEXT,
  favorite_platforms TEXT,
  aspirations TEXT,
  goals_json TEXT,
  published_work_json TEXT,
  github_username TEXT,
  portfolio_url TEXT,
  communication_pref TEXT DEFAULT 'email',
  timezone TEXT DEFAULT 'America/Chicago',
  intake_completed INTEGER DEFAULT 0,
  intake_completed_at INTEGER,
  intake_token TEXT UNIQUE,
  intake_token_expires_at INTEGER,
  agent_profile_built INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
, person_uuid TEXT, workspace_id TEXT, preferred_name TEXT, bio TEXT, avatar_url TEXT, linkedin_url TEXT, twitter_handle TEXT, cf_account_id TEXT, preferred_models_json TEXT, onboarding_step INTEGER DEFAULT 0, last_active_at INTEGER, bridge_key_hash TEXT)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "auth_user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "skill_level",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "current_stack",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "favorite_tools",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "favorite_ai",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "favorite_platforms",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "aspirations",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "goals_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "published_work_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "github_username",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "portfolio_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "communication_pref",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'email'",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "timezone",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'America/Chicago'",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "intake_completed",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "intake_completed_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 17,
    "name": "intake_token",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 18,
    "name": "intake_token_expires_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 19,
    "name": "agent_profile_built",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 20,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 21,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 22,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 23,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 24,
    "name": "preferred_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 25,
    "name": "bio",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 26,
    "name": "avatar_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 27,
    "name": "linkedin_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 28,
    "name": "twitter_handle",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 29,
    "name": "cf_account_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 30,
    "name": "preferred_models_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 31,
    "name": "onboarding_step",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 32,
    "name": "last_active_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 33,
    "name": "bridge_key_hash",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_integrations scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_integrations

table_name: `user_integrations`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `15`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_integrations` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), user_email TEXT NOT NULL, service_name TEXT NOT NULL, service_type TEXT NOT NULL, api_key TEXT, config TEXT, is_connected INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_used DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT, user_id TEXT, auth_method TEXT, key_preview TEXT, scopes TEXT, webhook_url TEXT, person_uuid TEXT
```

create_sql:
```sql
CREATE TABLE user_integrations (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), user_email TEXT NOT NULL, service_name TEXT NOT NULL, service_type TEXT NOT NULL, api_key TEXT, config TEXT, is_connected INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_used DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT, user_id TEXT, auth_method TEXT CHECK(auth_method IN ('api_key','oauth','webhook','bridge','none')), key_preview TEXT, scopes TEXT, webhook_url TEXT, person_uuid TEXT, UNIQUE(user_email, service_name))
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "lower(hex(randomblob(16)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "user_email",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "service_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "service_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "api_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "config",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "is_connected",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "status",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'active'",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "last_used",
    "type": "DATETIME",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "created_at",
    "type": "DATETIME",
    "notnull": 0,
    "dflt_value": "CURRENT_TIMESTAMP",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "updated_at",
    "type": "DATETIME",
    "notnull": 0,
    "dflt_value": "CURRENT_TIMESTAMP",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "auth_method",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "key_preview",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "scopes",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 16,
    "name": "webhook_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 17,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_oauth_tokens scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_oauth_tokens

table_name: `user_oauth_tokens`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `9`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_oauth_tokens` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
user_id TEXT PK NOT NULL, provider TEXT PK NOT NULL, account_identifier TEXT PK NOT NULL DEFAULT '', access_token TEXT, refresh_token TEXT, expires_at INTEGER, scope TEXT, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch(), access_token_encrypted TEXT, refresh_token_encrypted TEXT, scopes TEXT, account_email TEXT, account_display TEXT, tenant_id TEXT, person_uuid TEXT, workspace_id TEXT, metadata_json TEXT
```

create_sql:
```sql
CREATE TABLE "user_oauth_tokens" ( user_id TEXT NOT NULL, provider TEXT NOT NULL, account_identifier TEXT NOT NULL DEFAULT '', access_token TEXT, refresh_token TEXT, expires_at INTEGER, scope TEXT, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), access_token_encrypted TEXT, refresh_token_encrypted TEXT, scopes TEXT, account_email TEXT, account_display TEXT, tenant_id TEXT, person_uuid TEXT, workspace_id TEXT, metadata_json TEXT, PRIMARY KEY (user_id, provider, account_identifier) )
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "provider",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 2
  },
  {
    "cid": 2,
    "name": "account_identifier",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 3
  },
  {
    "cid": 3,
    "name": "access_token",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "refresh_token",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "expires_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "scope",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "access_token_encrypted",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "refresh_token_encrypted",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "scopes",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "account_email",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "account_display",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 16,
    "name": "workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 17,
    "name": "metadata_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_secrets scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_secrets

table_name: `user_secrets`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `1`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_secrets` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT 'system', secret_name TEXT NOT NULL, secret_value_encrypted TEXT NOT NULL, secret_type TEXT DEFAULT 'api_key', description TEXT, service_name TEXT, is_active INTEGER DEFAULT 1, expires_at INTEGER, last_used_at INTEGER, usage_count INTEGER DEFAULT 0, scopes_json TEXT DEFAULT '[]', metadata_json TEXT DEFAULT '{}', tags TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch(), project_id TEXT, project_label TEXT, person_uuid TEXT
```

create_sql:
```sql
CREATE TABLE user_secrets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    secret_name TEXT NOT NULL,
    secret_value_encrypted TEXT NOT NULL, -- Encrypted secret value
    secret_type TEXT DEFAULT 'api_key' CHECK (secret_type IN ('api_key', 'password', 'token', 'credential', 'certificate', 'custom')),
    description TEXT,
    service_name TEXT, -- 'github', 'openai', 'stripe', etc.
    is_active INTEGER DEFAULT 1,
    expires_at INTEGER, -- Expiration timestamp
    last_used_at INTEGER,
    usage_count INTEGER DEFAULT 0,
    scopes_json TEXT DEFAULT '[]', -- JSON array of scopes/permissions
    metadata_json TEXT DEFAULT '{}', -- JSON: additional metadata (non-sensitive)
    tags TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()), project_id TEXT, project_label TEXT, person_uuid TEXT,
    UNIQUE(user_id, secret_name, service_name)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'system'",
    "pk": 0
  },
  {
    "cid": 3,
    "name": "secret_name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "secret_value_encrypted",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "secret_type",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'api_key'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "description",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "service_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 8,
    "name": "is_active",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "expires_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "last_used_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "usage_count",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "scopes_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'[]'",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "metadata_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "tags",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "project_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 18,
    "name": "project_label",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 19,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_settings scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_settings

table_name: `user_settings`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `4`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_settings` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, user_id TEXT NOT NULL, full_name TEXT, display_name TEXT, avatar_url TEXT, bio TEXT, primary_email TEXT, primary_email_verified INTEGER DEFAULT 0, backup_email TEXT, professional_emails TEXT, phone TEXT, phone_verified INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/Chicago', language TEXT DEFAULT 'en', theme TEXT DEFAULT 'meaux-glass-blue', compact_mode INTEGER DEFAULT 0, sidebar_collapsed INTEGER DEFAULT 0, font_size TEXT DEFAULT 'medium', high_contrast INTEGER DEFAULT 0, email_notifications INTEGER DEFAULT 1, notification_frequency TEXT DEFAULT 'instant', push_notifications INTEGER DEFAULT 0, marketing_emails INTEGER DEFAULT 0, security_alerts INTEGER DEFAULT 1, reduced_motion INTEGER DEFAULT 0, recovery_codes TEXT, totp_secret_encrypted TEXT, totp_verified_at INTEGER, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch(), default_workspace_id TEXT, auth_id TEXT, tenant_id TEXT, person_uuid TEXT, settings_json TEXT DEFAULT '{}'
```

create_sql:
```sql
CREATE TABLE user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  full_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  primary_email TEXT,
  primary_email_verified INTEGER DEFAULT 0,
  backup_email TEXT,
  professional_emails TEXT,
  phone TEXT,
  phone_verified INTEGER DEFAULT 0,
  timezone TEXT DEFAULT 'America/Chicago',
  language TEXT DEFAULT 'en',
  theme TEXT DEFAULT 'meaux-glass-blue',
  compact_mode INTEGER DEFAULT 0,
  sidebar_collapsed INTEGER DEFAULT 0,
  font_size TEXT DEFAULT 'medium',
  high_contrast INTEGER DEFAULT 0,
  email_notifications INTEGER DEFAULT 1,
  notification_frequency TEXT DEFAULT 'instant',
  push_notifications INTEGER DEFAULT 0,
  marketing_emails INTEGER DEFAULT 0,
  security_alerts INTEGER DEFAULT 1,
  reduced_motion INTEGER DEFAULT 0,
  recovery_codes TEXT,
  totp_secret_encrypted TEXT,
  totp_verified_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
, default_workspace_id TEXT, auth_id TEXT, tenant_id TEXT, person_uuid TEXT, settings_json TEXT DEFAULT '{}')
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "full_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "display_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "avatar_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "bio",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "primary_email",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "primary_email_verified",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "backup_email",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 9,
    "name": "professional_emails",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 10,
    "name": "phone",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 11,
    "name": "phone_verified",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 12,
    "name": "timezone",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'America/Chicago'",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "language",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'en'",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "theme",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'meaux-glass-blue'",
    "pk": 0
  },
  {
    "cid": 15,
    "name": "compact_mode",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "sidebar_collapsed",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "font_size",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'medium'",
    "pk": 0
  },
  {
    "cid": 18,
    "name": "high_contrast",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 19,
    "name": "email_notifications",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 20,
    "name": "notification_frequency",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'instant'",
    "pk": 0
  },
  {
    "cid": 21,
    "name": "push_notifications",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 22,
    "name": "marketing_emails",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 23,
    "name": "security_alerts",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "1",
    "pk": 0
  },
  {
    "cid": 24,
    "name": "reduced_motion",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "0",
    "pk": 0
  },
  {
    "cid": 25,
    "name": "recovery_codes",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 26,
    "name": "totp_secret_encrypted",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 27,
    "name": "totp_verified_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 28,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 29,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 30,
    "name": "default_workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 31,
    "name": "auth_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 32,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 33,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 34,
    "name": "settings_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_storage_access_keys scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_storage_access_keys

table_name: `user_storage_access_keys`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `3`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_storage_access_keys` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, access_key_id TEXT NOT NULL, secret_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, person_uuid TEXT
```

create_sql:
```sql
CREATE TABLE user_storage_access_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_key_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
, person_uuid TEXT)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "access_key_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "secret_hash",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "status",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'active'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=user_storage_preferences scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.user_storage_preferences

table_name: `user_storage_preferences`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `0`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `user_storage_preferences` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
tenant_id TEXT PK NOT NULL, user_id TEXT PK NOT NULL, prefs_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, theme TEXT DEFAULT 'system', language TEXT DEFAULT 'en', timezone TEXT DEFAULT 'America/Chicago', notifications_json TEXT DEFAULT '{}', privacy_json TEXT DEFAULT '{}', feature_flags_json TEXT DEFAULT '{}', layout_json TEXT DEFAULT '{}', default_workspace_id TEXT, default_model TEXT, created_at INTEGER, person_uuid TEXT
```

create_sql:
```sql
CREATE TABLE user_storage_preferences (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL, theme TEXT DEFAULT 'system', language TEXT DEFAULT 'en', timezone TEXT DEFAULT 'America/Chicago', notifications_json TEXT DEFAULT '{}', privacy_json TEXT DEFAULT '{}', feature_flags_json TEXT DEFAULT '{}', layout_json TEXT DEFAULT '{}', default_workspace_id TEXT, default_model TEXT, created_at INTEGER, person_uuid TEXT,
  PRIMARY KEY (tenant_id, user_id)
)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1
  },
  {
    "cid": 1,
    "name": "user_id",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 2
  },
  {
    "cid": 2,
    "name": "prefs_json",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 3,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "theme",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'system'",
    "pk": 0
  },
  {
    "cid": 5,
    "name": "language",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'en'",
    "pk": 0
  },
  {
    "cid": 6,
    "name": "timezone",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'America/Chicago'",
    "pk": 0
  },
  {
    "cid": 7,
    "name": "notifications_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "privacy_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "feature_flags_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "layout_json",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'{}'",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "default_workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "default_model",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 13,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 14,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

<!-- chunk:table name=users scope=learn-course-platform-cms-support tags=auth-context,d1,enrollment,inneranimalmedia,schema,users generated_at=2026-05-07T04:48:31.022295+00:00 -->

## schema.table.users

table_name: `users`
database: `inneranimalmedia-business`
scope: `learn-course-platform-cms-support`
row_count: `21`
tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

retrieval_summary:
- Use table `users` only with the columns listed below.
- Do not guess tenant/workspace/org columns unless they appear here.
- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.

compact_columns:
```txt
id TEXT PK DEFAULT 'usr_' || lower(hex(randomblob(12))), user_key TEXT, email TEXT NOT NULL, backup_email TEXT, phone TEXT, display_name TEXT, avatar_url TEXT, user_type TEXT NOT NULL DEFAULT 'human', role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', provider TEXT DEFAULT 'google', provider_id TEXT, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', default_workspace_id TEXT DEFAULT 'ws_samprimeaux', stripe_customer_id TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch(), last_login_at INTEGER, last_active_at INTEGER, auth_id TEXT, superadmin_uuid TEXT, person_uuid TEXT, supabase_user_id TEXT
```

create_sql:
```sql
CREATE TABLE "users" (
  id TEXT PRIMARY KEY DEFAULT ('usr_' || lower(hex(randomblob(12)))),
  user_key TEXT UNIQUE,              -- 'sam_primeaux' stable readable key
  email TEXT UNIQUE NOT NULL,
  backup_email TEXT,
  phone TEXT,
  display_name TEXT,
  avatar_url TEXT,
  user_type TEXT NOT NULL DEFAULT 'human'
    CHECK (user_type IN ('human','agent','system','service')),
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('superadmin','admin','user','agent')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','pending','deleted')),
  provider TEXT DEFAULT 'google',
  provider_id TEXT,
  tenant_id TEXT DEFAULT 'tenant_sam_primeaux',
  default_workspace_id TEXT DEFAULT 'ws_samprimeaux',
  stripe_customer_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER,
  last_active_at INTEGER
, auth_id TEXT, superadmin_uuid TEXT, person_uuid TEXT, supabase_user_id TEXT)
```

columns_json:
```json
[
  {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'usr_' || lower(hex(randomblob(12)))",
    "pk": 1
  },
  {
    "cid": 1,
    "name": "user_key",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 2,
    "name": "email",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 3,
    "name": "backup_email",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 4,
    "name": "phone",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 5,
    "name": "display_name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 6,
    "name": "avatar_url",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 7,
    "name": "user_type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'human'",
    "pk": 0
  },
  {
    "cid": 8,
    "name": "role",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'user'",
    "pk": 0
  },
  {
    "cid": 9,
    "name": "status",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'active'",
    "pk": 0
  },
  {
    "cid": 10,
    "name": "provider",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'google'",
    "pk": 0
  },
  {
    "cid": 11,
    "name": "provider_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 12,
    "name": "tenant_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'tenant_sam_primeaux'",
    "pk": 0
  },
  {
    "cid": 13,
    "name": "default_workspace_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": "'ws_samprimeaux'",
    "pk": 0
  },
  {
    "cid": 14,
    "name": "stripe_customer_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 15,
    "name": "created_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 16,
    "name": "updated_at",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "unixepoch()",
    "pk": 0
  },
  {
    "cid": 17,
    "name": "last_login_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 18,
    "name": "last_active_at",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 19,
    "name": "auth_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 20,
    "name": "superadmin_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 21,
    "name": "person_uuid",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  },
  {
    "cid": 22,
    "name": "supabase_user_id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0
  }
]
```

<!-- /chunk:table -->

