---
doc_type: d1_schema_context
scope: learn-course-platform-cms-support
database: inneranimalmedia-business
generated_at: 2026-05-07T04:48:31.022295+00:00
date: 2026-05-07
consumer: cursor
autorag_ready: true
tags:
  - d1
  - schema
  - learn
  - course-platform
  - cms-support
---

# Learn/Course D1 Schema Context

## Cursor rules

- Use this file as the source of truth before writing `/api/learn/*` SQL.
- Do not invent columns like `e.tenant_id` unless the table below actually has that column.
- Do not add migrations just to satisfy guessed queries unless explicitly approved.
- Prefer patching API queries to match real schema.
- Keep `course_*` as learning domain data and `cms_*` as theme/assets/templates/activity support.

## Matched table patterns

- `courses`
- `course_%`
- `lesson_%`
- `lessons`
- `%enroll%`
- `%user%`
- `auth_users`
- `org_users`
- `cms_themes`
- `cms_theme_preferences`
- `cms_assets`
- `cms_collections`
- `cms_collection_assets`
- `cms_component_templates`
- `cms_pages`
- `cms_page_sections`
- `cms_section_components`
- `cms_activity_log`
- `cms_navigation_menus`
- `cms_global_settings`

## Table index

- `agentsam_user_feature_override` — rows: `0` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `agentsam_user_policy` — rows: `4` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `auth_user_identities` — rows: `4` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `auth_users` — rows: `10` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `cms_activity_log` — rows: `1` — tags: `activity-log, analytics, cms, cms-support, d1, inneranimalmedia, schema`
- `cms_assets` — rows: `100` — tags: `assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema`
- `cms_collection_assets` — rows: `0` — tags: `assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema`
- `cms_collections` — rows: `5` — tags: `assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema`
- `cms_component_templates` — rows: `24` — tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`
- `cms_global_settings` — rows: `5` — tags: `cms, cms-support, d1, inneranimalmedia, schema`
- `cms_navigation_menus` — rows: `3` — tags: `cms, cms-support, d1, inneranimalmedia, schema`
- `cms_page_sections` — rows: `41` — tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`
- `cms_pages` — rows: `17` — tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`
- `cms_section_components` — rows: `73` — tags: `cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates`
- `cms_theme_preferences` — rows: `4` — tags: `cms, cms-support, d1, inneranimalmedia, schema, theme, tokens`
- `cms_themes` — rows: `104` — tags: `cms, cms-support, d1, inneranimalmedia, schema, theme, tokens`
- `course_assignments` — rows: `43` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_exports` — rows: `7` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_grades` — rows: `1` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_lessons` — rows: `151` — tags: `course-content, course-domain, course-platform, d1, inneranimalmedia, learn, lessons, schema`
- `course_modules` — rows: `70` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_progress` — rows: `62` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_reviews` — rows: `0` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_roles` — rows: `3` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_submissions` — rows: `1` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `course_users` — rows: `3` — tags: `auth-context, course-domain, course-platform, d1, enrollment, inneranimalmedia, learn, schema, users`
- `courses` — rows: `14` — tags: `course-domain, course-platform, d1, inneranimalmedia, learn, schema`
- `enrollments` — rows: `5` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `iam_user_onboarding_step` — rows: `0` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `lesson_assets` — rows: `0` — tags: `course-content, d1, inneranimalmedia, lessons, schema`
- `lesson_progress` — rows: `0` — tags: `course-content, d1, inneranimalmedia, lessons, schema`
- `lesson_versions` — rows: `0` — tags: `course-content, d1, inneranimalmedia, lessons, schema`
- `lessons` — rows: `18` — tags: `course-content, d1, inneranimalmedia, lessons, schema`
- `org_users` — rows: `4` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_api_keys` — rows: `0` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_backup_codes` — rows: `10` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_connections` — rows: `2` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_goals` — rows: `5` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_governance_roles` — rows: `10` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_intake_profiles` — rows: `1` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_integrations` — rows: `15` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_oauth_tokens` — rows: `9` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_secrets` — rows: `1` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_settings` — rows: `4` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_storage_access_keys` — rows: `3` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `user_storage_preferences` — rows: `0` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`
- `users` — rows: `21` — tags: `auth-context, d1, enrollment, inneranimalmedia, schema, users`

## Table: `agentsam_user_feature_override`

Meta: `table=agentsam_user_feature_override` `rows=0` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

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

Meta: `table=agentsam_user_policy` `rows=4` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

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

## Table: `auth_user_identities`

Meta: `table=auth_user_identities` `rows=4` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK DEFAULT 'aui_' || lower(hex(randomblob(8))), auth_user_id TEXT NOT NULL, provider TEXT NOT NULL, provider_subject_id TEXT NOT NULL, email TEXT, metadata_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'aui_' || lower(hex(randomblob(8)))` | 1 |
| 1 | `auth_user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `provider` | `TEXT` | 1 | `None` | 0 |
| 3 | `provider_subject_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `email` | `TEXT` | 0 | `None` | 0 |
| 5 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 6 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 7 | `updated_at` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `auth_user_identities_email_idx` | 0 | `c` | 0 | `email` |
| `auth_user_identities_auth_user_id_idx` | 0 | `c` | 0 | `auth_user_id` |
| `sqlite_autoindex_auth_user_identities_2` | 1 | `u` | 0 | `provider, provider_subject_id` |
| `sqlite_autoindex_auth_user_identities_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `auth_users`

Meta: `table=auth_users` `rows=10` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, email TEXT NOT NULL, name TEXT, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now'), tenant_id TEXT, is_superadmin INTEGER DEFAULT 0, superadmin_group_id TEXT, is_verified INTEGER NOT NULL DEFAULT 0, verified_at INTEGER, superadmin_uuid TEXT, superadmin_identity_id TEXT, person_uuid TEXT, supabase_user_id TEXT, status TEXT DEFAULT 'active', active_tenant_id TEXT, active_workspace_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `email` | `TEXT` | 1 | `None` | 0 |
| 2 | `name` | `TEXT` | 0 | `None` | 0 |
| 3 | `password_hash` | `TEXT` | 1 | `None` | 0 |
| 4 | `salt` | `TEXT` | 1 | `None` | 0 |
| 5 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 6 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 7 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `is_superadmin` | `INTEGER` | 0 | `0` | 0 |
| 9 | `superadmin_group_id` | `TEXT` | 0 | `None` | 0 |
| 10 | `is_verified` | `INTEGER` | 1 | `0` | 0 |
| 11 | `verified_at` | `INTEGER` | 0 | `None` | 0 |
| 12 | `superadmin_uuid` | `TEXT` | 0 | `None` | 0 |
| 13 | `superadmin_identity_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 15 | `supabase_user_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `status` | `TEXT` | 0 | `'active'` | 0 |
| 17 | `active_tenant_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `active_workspace_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_auth_users_supabase_user_id` | 1 | `c` | 1 | `supabase_user_id` |
| `idx_auth_users_tenant_admin` | 0 | `c` | 0 | `tenant_id, is_superadmin` |
| `idx_auth_users_email` | 0 | `c` | 0 | `email` |
| `sqlite_autoindex_auth_users_2` | 1 | `u` | 0 | `email` |
| `sqlite_autoindex_auth_users_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_activity_log`

Meta: `table=cms_activity_log` `rows=1` `tags=activity-log,analytics,cms,cms-support,d1,inneranimalmedia,schema`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, details TEXT, ip_address TEXT, user_agent TEXT, created_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 3 | `action` | `TEXT` | 1 | `None` | 0 |
| 4 | `resource_type` | `TEXT` | 1 | `None` | 0 |
| 5 | `resource_id` | `TEXT` | 1 | `None` | 0 |
| 6 | `details` | `TEXT` | 0 | `None` | 0 |
| 7 | `ip_address` | `TEXT` | 0 | `None` | 0 |
| 8 | `user_agent` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_cms_activity_log_created` | 0 | `c` | 0 | `created_at` |
| `idx_cms_activity_log_tenant` | 0 | `c` | 0 | `tenant_id` |
| `sqlite_autoindex_cms_activity_log_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_assets`

Meta: `table=cms_assets` `rows=100` `tags=assets,cms,cms-support,d1,inneranimalmedia,r2-resources,schema`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, filename TEXT NOT NULL, original_filename TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL, mime_type TEXT NOT NULL, category TEXT NOT NULL, tags TEXT, cloudflare_image_id TEXT, r2_key TEXT NOT NULL, public_url TEXT NOT NULL, thumbnail_url TEXT, metadata TEXT, created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_live INTEGER NOT NULL DEFAULT 0, notes TEXT, builds TEXT, preferred_bg TEXT, r2_bucket TEXT, s3_endpoint TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `filename` | `TEXT` | 1 | `None` | 0 |
| 3 | `original_filename` | `TEXT` | 1 | `None` | 0 |
| 4 | `path` | `TEXT` | 1 | `None` | 0 |
| 5 | `size` | `INTEGER` | 1 | `None` | 0 |
| 6 | `mime_type` | `TEXT` | 1 | `None` | 0 |
| 7 | `category` | `TEXT` | 1 | `None` | 0 |
| 8 | `tags` | `TEXT` | 0 | `None` | 0 |
| 9 | `cloudflare_image_id` | `TEXT` | 0 | `None` | 0 |
| 10 | `r2_key` | `TEXT` | 1 | `None` | 0 |
| 11 | `public_url` | `TEXT` | 1 | `None` | 0 |
| 12 | `thumbnail_url` | `TEXT` | 0 | `None` | 0 |
| 13 | `metadata` | `TEXT` | 0 | `None` | 0 |
| 14 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 15 | `created_at` | `DATETIME` | 0 | `CURRENT_TIMESTAMP` | 0 |
| 16 | `updated_at` | `DATETIME` | 0 | `CURRENT_TIMESTAMP` | 0 |
| 17 | `is_live` | `INTEGER` | 1 | `0` | 0 |
| 18 | `notes` | `TEXT` | 0 | `None` | 0 |
| 19 | `builds` | `TEXT` | 0 | `None` | 0 |
| 20 | `preferred_bg` | `TEXT` | 0 | `None` | 0 |
| 21 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 22 | `s3_endpoint` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_cms_assets_is_live` | 0 | `c` | 0 | `is_live` |
| `idx_cms_assets_category` | 0 | `c` | 0 | `category` |
| `idx_cms_assets_tenant` | 0 | `c` | 0 | `tenant_id` |
| `sqlite_autoindex_cms_assets_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_collection_assets`

Meta: `table=cms_collection_assets` `rows=0` `tags=assets,cms,cms-support,d1,inneranimalmedia,r2-resources,schema`

### Compact columns

```txt
collection_id TEXT PK NOT NULL, asset_id TEXT PK NOT NULL, order_index INTEGER DEFAULT 0, added_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `collection_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `asset_id` | `TEXT` | 1 | `None` | 2 |
| 2 | `order_index` | `INTEGER` | 0 | `0` | 0 |
| 3 | `added_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_cms_collection_assets_1` | 1 | `pk` | 0 | `collection_id, asset_id` |

### Create SQL

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

## Table: `cms_collections`

Meta: `table=cms_collections` `rows=5` `tags=assets,cms,cms-support,d1,inneranimalmedia,r2-resources,schema`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, thumbnail_url TEXT, is_public INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `name` | `TEXT` | 1 | `None` | 0 |
| 3 | `description` | `TEXT` | 0 | `None` | 0 |
| 4 | `thumbnail_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `is_public` | `INTEGER` | 0 | `0` | 0 |
| 6 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 7 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 8 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_cms_collections_tenant` | 0 | `c` | 0 | `tenant_id` |
| `sqlite_autoindex_cms_collections_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_component_templates`

Meta: `table=cms_component_templates` `rows=24` `tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates`

### Compact columns

```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), template_name TEXT NOT NULL, template_type TEXT NOT NULL, category TEXT NOT NULL, preview_image_url TEXT, template_data TEXT NOT NULL, is_system INTEGER DEFAULT 1, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now'), r2_bucket TEXT, r2_key TEXT, s3_endpoint TEXT, tenant_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `template_name` | `TEXT` | 1 | `None` | 0 |
| 2 | `template_type` | `TEXT` | 1 | `None` | 0 |
| 3 | `category` | `TEXT` | 1 | `None` | 0 |
| 4 | `preview_image_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `template_data` | `TEXT` | 1 | `None` | 0 |
| 6 | `is_system` | `INTEGER` | 0 | `1` | 0 |
| 7 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 8 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 9 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 10 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 11 | `s3_endpoint` | `TEXT` | 0 | `None` | 0 |
| 12 | `tenant_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_cms_component_templates_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_global_settings`

Meta: `table=cms_global_settings` `rows=5` `tags=cms,cms-support,d1,inneranimalmedia,schema`

### Compact columns

```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), project_id INTEGER NOT NULL, site_name TEXT, site_logo_url TEXT, site_favicon_url TEXT, contact_email TEXT, contact_phone TEXT, social_links TEXT, footer_text TEXT, header_announcement TEXT, seo_defaults TEXT, scripts_head TEXT, scripts_body TEXT, analytics_id TEXT, settings_json TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `project_id` | `INTEGER` | 1 | `None` | 0 |
| 2 | `site_name` | `TEXT` | 0 | `None` | 0 |
| 3 | `site_logo_url` | `TEXT` | 0 | `None` | 0 |
| 4 | `site_favicon_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `contact_email` | `TEXT` | 0 | `None` | 0 |
| 6 | `contact_phone` | `TEXT` | 0 | `None` | 0 |
| 7 | `social_links` | `TEXT` | 0 | `None` | 0 |
| 8 | `footer_text` | `TEXT` | 0 | `None` | 0 |
| 9 | `header_announcement` | `TEXT` | 0 | `None` | 0 |
| 10 | `seo_defaults` | `TEXT` | 0 | `None` | 0 |
| 11 | `scripts_head` | `TEXT` | 0 | `None` | 0 |
| 12 | `scripts_body` | `TEXT` | 0 | `None` | 0 |
| 13 | `analytics_id` | `TEXT` | 0 | `None` | 0 |
| 14 | `settings_json` | `TEXT` | 0 | `None` | 0 |
| 15 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 16 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_cms_global_settings_2` | 1 | `u` | 0 | `project_id` |
| `sqlite_autoindex_cms_global_settings_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_navigation_menus`

Meta: `table=cms_navigation_menus` `rows=3` `tags=cms,cms-support,d1,inneranimalmedia,schema`

### Compact columns

```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), project_id TEXT NOT NULL, project_slug TEXT, tenant_id TEXT, menu_name TEXT NOT NULL, menu_type TEXT DEFAULT 'site', menu_items TEXT NOT NULL, is_active INTEGER DEFAULT 1, r2_bucket TEXT, r2_key TEXT, r2_url TEXT, s3_endpoint TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `project_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `project_slug` | `TEXT` | 0 | `None` | 0 |
| 3 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `menu_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `menu_type` | `TEXT` | 0 | `'site'` | 0 |
| 6 | `menu_items` | `TEXT` | 1 | `None` | 0 |
| 7 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 8 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 9 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 10 | `r2_url` | `TEXT` | 0 | `None` | 0 |
| 11 | `s3_endpoint` | `TEXT` | 0 | `None` | 0 |
| 12 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 13 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_cms_navigation_menus_2` | 1 | `u` | 0 | `project_id, menu_name` |
| `sqlite_autoindex_cms_navigation_menus_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_page_sections`

Meta: `table=cms_page_sections` `rows=41` `tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates`

### Compact columns

```txt
id TEXT PK, page_id TEXT NOT NULL, section_type TEXT NOT NULL, section_name TEXT NOT NULL, section_data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1, css_classes TEXT, custom_css TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `page_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `section_type` | `TEXT` | 1 | `None` | 0 |
| 3 | `section_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `section_data` | `TEXT` | 1 | `'{}'` | 0 |
| 5 | `sort_order` | `INTEGER` | 0 | `0` | 0 |
| 6 | `is_visible` | `INTEGER` | 0 | `1` | 0 |
| 7 | `css_classes` | `TEXT` | 0 | `None` | 0 |
| 8 | `custom_css` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 10 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_cms_page_sections_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_pages`

Meta: `table=cms_pages` `rows=17` `tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates`

### Compact columns

```txt
id TEXT PK, project_id TEXT NOT NULL, project_slug TEXT NOT NULL, tenant_id TEXT NOT NULL, workspace_id TEXT, worker_id TEXT, person_uuid TEXT, slug TEXT NOT NULL, path TEXT NOT NULL, route_path TEXT NOT NULL, page_type TEXT NOT NULL, title TEXT NOT NULL, meta_description TEXT, description TEXT, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT, canonical_url TEXT, robots TEXT DEFAULT 'index,follow', og_image_asset_id TEXT, r2_bucket TEXT, r2_key TEXT, r2_url TEXT, content_type TEXT DEFAULT 'text/html', content_size_bytes INTEGER DEFAULT 0, config_json TEXT DEFAULT '{}', seo_json TEXT DEFAULT '{}', analytics_json TEXT DEFAULT '{}', metadata_json TEXT DEFAULT '{}', is_homepage INTEGER DEFAULT 0, is_system_page INTEGER DEFAULT 0, requires_auth INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_by TEXT, updated_by TEXT, published_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER, archived_at INTEGER
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `project_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `project_slug` | `TEXT` | 1 | `None` | 0 |
| 3 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `worker_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 7 | `slug` | `TEXT` | 1 | `None` | 0 |
| 8 | `path` | `TEXT` | 1 | `None` | 0 |
| 9 | `route_path` | `TEXT` | 1 | `None` | 0 |
| 10 | `page_type` | `TEXT` | 1 | `None` | 0 |
| 11 | `title` | `TEXT` | 1 | `None` | 0 |
| 12 | `meta_description` | `TEXT` | 0 | `None` | 0 |
| 13 | `description` | `TEXT` | 0 | `None` | 0 |
| 14 | `status` | `TEXT` | 1 | `'draft'` | 0 |
| 15 | `seo_title` | `TEXT` | 0 | `None` | 0 |
| 16 | `canonical_url` | `TEXT` | 0 | `None` | 0 |
| 17 | `robots` | `TEXT` | 0 | `'index,follow'` | 0 |
| 18 | `og_image_asset_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 20 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 21 | `r2_url` | `TEXT` | 0 | `None` | 0 |
| 22 | `content_type` | `TEXT` | 0 | `'text/html'` | 0 |
| 23 | `content_size_bytes` | `INTEGER` | 0 | `0` | 0 |
| 24 | `config_json` | `TEXT` | 0 | `'{}'` | 0 |
| 25 | `seo_json` | `TEXT` | 0 | `'{}'` | 0 |
| 26 | `analytics_json` | `TEXT` | 0 | `'{}'` | 0 |
| 27 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 28 | `is_homepage` | `INTEGER` | 0 | `0` | 0 |
| 29 | `is_system_page` | `INTEGER` | 0 | `0` | 0 |
| 30 | `requires_auth` | `INTEGER` | 0 | `0` | 0 |
| 31 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 32 | `sort_order` | `INTEGER` | 0 | `0` | 0 |
| 33 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 34 | `updated_by` | `TEXT` | 0 | `None` | 0 |
| 35 | `published_by` | `TEXT` | 0 | `None` | 0 |
| 36 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 37 | `updated_at` | `INTEGER` | 1 | `None` | 0 |
| 38 | `published_at` | `INTEGER` | 0 | `None` | 0 |
| 39 | `archived_at` | `INTEGER` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_cms_pages_3` | 1 | `u` | 0 | `project_id, route_path` |
| `sqlite_autoindex_cms_pages_2` | 1 | `u` | 0 | `project_id, slug` |
| `sqlite_autoindex_cms_pages_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_section_components`

Meta: `table=cms_section_components` `rows=73` `tags=cms,cms-support,d1,inneranimalmedia,layout,schema,sections,templates`

### Compact columns

```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), section_id TEXT NOT NULL, component_type TEXT NOT NULL, component_data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1, tenant_id TEXT, project_id TEXT, created_at TEXT DEFAULT datetime('now'), updated_at TEXT DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `section_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `component_type` | `TEXT` | 1 | `None` | 0 |
| 3 | `component_data` | `TEXT` | 1 | `'{}'` | 0 |
| 4 | `sort_order` | `INTEGER` | 0 | `0` | 0 |
| 5 | `is_visible` | `INTEGER` | 0 | `1` | 0 |
| 6 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `project_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 9 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_cms_section_components_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_theme_preferences`

Meta: `table=cms_theme_preferences` `rows=4` `tags=cms,cms-support,d1,inneranimalmedia,schema,theme,tokens`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL DEFAULT 'default', user_id TEXT DEFAULT NULL, workspace_id TEXT DEFAULT NULL, project_id TEXT DEFAULT NULL, page_id TEXT DEFAULT NULL, theme_id TEXT NOT NULL, theme_slug TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'workspace', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT datetime('now'), updated_at TEXT NOT NULL DEFAULT datetime('now')
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'default'` | 0 |
| 2 | `user_id` | `TEXT` | 0 | `NULL` | 0 |
| 3 | `workspace_id` | `TEXT` | 0 | `NULL` | 0 |
| 4 | `project_id` | `TEXT` | 0 | `NULL` | 0 |
| 5 | `page_id` | `TEXT` | 0 | `NULL` | 0 |
| 6 | `theme_id` | `TEXT` | 1 | `None` | 0 |
| 7 | `theme_slug` | `TEXT` | 1 | `None` | 0 |
| 8 | `scope` | `TEXT` | 1 | `'workspace'` | 0 |
| 9 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 10 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 11 | `updated_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_cms_theme_preferences_theme_slug` | 0 | `c` | 0 | `theme_slug` |
| `idx_cms_theme_preferences_user` | 0 | `c` | 0 | `tenant_id, user_id, scope, is_active` |
| `idx_cms_theme_preferences_project` | 0 | `c` | 0 | `tenant_id, workspace_id, project_id, scope, is_active` |
| `idx_cms_theme_preferences_workspace` | 0 | `c` | 0 | `tenant_id, workspace_id, scope, is_active` |
| `sqlite_autoindex_cms_theme_preferences_2` | 1 | `u` | 0 | `tenant_id, user_id, workspace_id, project_id, page_id, scope` |
| `sqlite_autoindex_cms_theme_preferences_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `cms_themes`

Meta: `table=cms_themes` `rows=104` `tags=cms,cms-support,d1,inneranimalmedia,schema,theme,tokens`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT, name TEXT NOT NULL, slug TEXT NOT NULL, css_url TEXT, config TEXT NOT NULL, is_system BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, wcag_scores TEXT, contrast_flags TEXT, theme_family TEXT DEFAULT 'custom', sort_order INTEGER DEFAULT 100, workspace_id TEXT DEFAULT NULL, monaco_theme TEXT NOT NULL DEFAULT 'vs-dark', monaco_bg TEXT NOT NULL DEFAULT '#1e293b', monaco_theme_data TEXT, tokens_json TEXT NOT NULL DEFAULT '{}', css_vars_json TEXT NOT NULL DEFAULT '{}', brand_json TEXT NOT NULL DEFAULT '{}', layout_json TEXT NOT NULL DEFAULT '{}', typography_json TEXT NOT NULL DEFAULT '{}', components_json TEXT NOT NULL DEFAULT '{}', motion_json TEXT NOT NULL DEFAULT '{}', css_r2_key TEXT DEFAULT NULL, compiled_css_hash TEXT DEFAULT NULL, preview_image_url TEXT DEFAULT NULL, status TEXT NOT NULL DEFAULT 'active', updated_at TEXT DEFAULT NULL, visibility TEXT NOT NULL DEFAULT 'public', alias_of_theme_id TEXT DEFAULT NULL, css_r2_bucket TEXT DEFAULT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `name` | `TEXT` | 1 | `None` | 0 |
| 3 | `slug` | `TEXT` | 1 | `None` | 0 |
| 4 | `css_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `config` | `TEXT` | 1 | `None` | 0 |
| 6 | `is_system` | `BOOLEAN` | 0 | `0` | 0 |
| 7 | `created_at` | `DATETIME` | 0 | `CURRENT_TIMESTAMP` | 0 |
| 8 | `wcag_scores` | `TEXT` | 0 | `None` | 0 |
| 9 | `contrast_flags` | `TEXT` | 0 | `None` | 0 |
| 10 | `theme_family` | `TEXT` | 0 | `'custom'` | 0 |
| 11 | `sort_order` | `INTEGER` | 0 | `100` | 0 |
| 12 | `workspace_id` | `TEXT` | 0 | `NULL` | 0 |
| 13 | `monaco_theme` | `TEXT` | 1 | `'vs-dark'` | 0 |
| 14 | `monaco_bg` | `TEXT` | 1 | `'#1e293b'` | 0 |
| 15 | `monaco_theme_data` | `TEXT` | 0 | `None` | 0 |
| 16 | `tokens_json` | `TEXT` | 1 | `'{}'` | 0 |
| 17 | `css_vars_json` | `TEXT` | 1 | `'{}'` | 0 |
| 18 | `brand_json` | `TEXT` | 1 | `'{}'` | 0 |
| 19 | `layout_json` | `TEXT` | 1 | `'{}'` | 0 |
| 20 | `typography_json` | `TEXT` | 1 | `'{}'` | 0 |
| 21 | `components_json` | `TEXT` | 1 | `'{}'` | 0 |
| 22 | `motion_json` | `TEXT` | 1 | `'{}'` | 0 |
| 23 | `css_r2_key` | `TEXT` | 0 | `NULL` | 0 |
| 24 | `compiled_css_hash` | `TEXT` | 0 | `NULL` | 0 |
| 25 | `preview_image_url` | `TEXT` | 0 | `NULL` | 0 |
| 26 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 27 | `updated_at` | `TEXT` | 0 | `NULL` | 0 |
| 28 | `visibility` | `TEXT` | 1 | `'public'` | 0 |
| 29 | `alias_of_theme_id` | `TEXT` | 0 | `NULL` | 0 |
| 30 | `css_r2_bucket` | `TEXT` | 0 | `NULL` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_cms_themes_family_sort` | 0 | `c` | 0 | `theme_family, sort_order` |
| `sqlite_autoindex_cms_themes_2` | 1 | `u` | 0 | `tenant_id, slug` |
| `sqlite_autoindex_cms_themes_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_assignments`

Meta: `table=course_assignments` `rows=43` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, course_id TEXT NOT NULL, module_id TEXT NOT NULL, lesson_id TEXT, title TEXT NOT NULL, description TEXT, type TEXT DEFAULT 'deliverable', rubric TEXT, max_score INTEGER DEFAULT 100, required_evidence TEXT, due_offset_days INTEGER, is_graded INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `module_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `lesson_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `title` | `TEXT` | 1 | `None` | 0 |
| 5 | `description` | `TEXT` | 0 | `None` | 0 |
| 6 | `type` | `TEXT` | 0 | `'deliverable'` | 0 |
| 7 | `rubric` | `TEXT` | 0 | `None` | 0 |
| 8 | `max_score` | `INTEGER` | 0 | `100` | 0 |
| 9 | `required_evidence` | `TEXT` | 0 | `None` | 0 |
| 10 | `due_offset_days` | `INTEGER` | 0 | `None` | 0 |
| 11 | `is_graded` | `INTEGER` | 0 | `1` | 0 |
| 12 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 13 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_assignments_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_exports`

Meta: `table=course_exports` `rows=7` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, course_id TEXT NOT NULL, export_type TEXT DEFAULT 'template', file_url TEXT, r2_key TEXT, r2_bucket TEXT, file_size INTEGER, metadata TEXT, created_by TEXT, created_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `export_type` | `TEXT` | 0 | `'template'` | 0 |
| 3 | `file_url` | `TEXT` | 0 | `None` | 0 |
| 4 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 5 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 6 | `file_size` | `INTEGER` | 0 | `None` | 0 |
| 7 | `metadata` | `TEXT` | 0 | `None` | 0 |
| 8 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_exports_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_grades`

Meta: `table=course_grades` `rows=1` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, submission_id TEXT NOT NULL, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, enrollment_id TEXT NOT NULL, score INTEGER, max_score INTEGER DEFAULT 100, rubric_scores TEXT, time_score INTEGER, efficiency_score INTEGER, graded_by TEXT DEFAULT 'agent_sam', feedback TEXT, graded_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `submission_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `assignment_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `enrollment_id` | `TEXT` | 1 | `None` | 0 |
| 5 | `score` | `INTEGER` | 0 | `None` | 0 |
| 6 | `max_score` | `INTEGER` | 0 | `100` | 0 |
| 7 | `rubric_scores` | `TEXT` | 0 | `None` | 0 |
| 8 | `time_score` | `INTEGER` | 0 | `None` | 0 |
| 9 | `efficiency_score` | `INTEGER` | 0 | `None` | 0 |
| 10 | `graded_by` | `TEXT` | 0 | `'agent_sam'` | 0 |
| 11 | `feedback` | `TEXT` | 0 | `None` | 0 |
| 12 | `graded_at` | `INTEGER` | 0 | `None` | 0 |
| 13 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 14 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_grades_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_lessons`

Meta: `table=course_lessons` `rows=151` `tags=course-content,course-domain,course-platform,d1,inneranimalmedia,learn,lessons,schema`

### Compact columns

```txt
id TEXT PK, module_id TEXT NOT NULL, course_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT DEFAULT 'lesson', description TEXT, estimated_minutes INTEGER, order_index INTEGER NOT NULL, is_required INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, content TEXT, content_format TEXT NOT NULL DEFAULT 'markdown', has_content INTEGER NOT NULL DEFAULT 0, sandbox_query TEXT, sandbox_db TEXT DEFAULT 'd1'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `module_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `title` | `TEXT` | 1 | `None` | 0 |
| 4 | `type` | `TEXT` | 0 | `'lesson'` | 0 |
| 5 | `description` | `TEXT` | 0 | `None` | 0 |
| 6 | `estimated_minutes` | `INTEGER` | 0 | `None` | 0 |
| 7 | `order_index` | `INTEGER` | 1 | `None` | 0 |
| 8 | `is_required` | `INTEGER` | 0 | `1` | 0 |
| 9 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 10 | `updated_at` | `INTEGER` | 1 | `None` | 0 |
| 11 | `content` | `TEXT` | 0 | `None` | 0 |
| 12 | `content_format` | `TEXT` | 1 | `'markdown'` | 0 |
| 13 | `has_content` | `INTEGER` | 1 | `0` | 0 |
| 14 | `sandbox_query` | `TEXT` | 0 | `None` | 0 |
| 15 | `sandbox_db` | `TEXT` | 0 | `'d1'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_lessons_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_modules`

Meta: `table=course_modules` `rows=70` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, course_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, order_index INTEGER NOT NULL, is_required INTEGER DEFAULT 1, estimated_minutes INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `title` | `TEXT` | 1 | `None` | 0 |
| 3 | `description` | `TEXT` | 0 | `None` | 0 |
| 4 | `order_index` | `INTEGER` | 1 | `None` | 0 |
| 5 | `is_required` | `INTEGER` | 0 | `1` | 0 |
| 6 | `estimated_minutes` | `INTEGER` | 0 | `None` | 0 |
| 7 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 8 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_modules_course` | 0 | `c` | 0 | `course_id, order_index` |
| `sqlite_autoindex_course_modules_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_progress`

Meta: `table=course_progress` `rows=62` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, enrollment_id TEXT NOT NULL, user_id TEXT NOT NULL, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, module_id TEXT NOT NULL, status TEXT DEFAULT 'not_started', completed_at INTEGER, time_spent_minutes INTEGER DEFAULT 0, token_spend INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `enrollment_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `lesson_id` | `TEXT` | 1 | `None` | 0 |
| 5 | `module_id` | `TEXT` | 1 | `None` | 0 |
| 6 | `status` | `TEXT` | 0 | `'not_started'` | 0 |
| 7 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 8 | `time_spent_minutes` | `INTEGER` | 0 | `0` | 0 |
| 9 | `token_spend` | `INTEGER` | 0 | `0` | 0 |
| 10 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 11 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_progress_2` | 1 | `u` | 0 | `enrollment_id, lesson_id` |
| `sqlite_autoindex_course_progress_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_reviews`

Meta: `table=course_reviews` `rows=0` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, course_id TEXT NOT NULL, user_id TEXT NOT NULL, enrollment_id TEXT, rating INTEGER NOT NULL, title TEXT, review_text TEXT, is_verified INTEGER DEFAULT 0, is_public INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `enrollment_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `rating` | `INTEGER` | 1 | `None` | 0 |
| 5 | `title` | `TEXT` | 0 | `None` | 0 |
| 6 | `review_text` | `TEXT` | 0 | `None` | 0 |
| 7 | `is_verified` | `INTEGER` | 0 | `0` | 0 |
| 8 | `is_public` | `INTEGER` | 0 | `1` | 0 |
| 9 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 10 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_course_reviews_user` | 0 | `c` | 0 | `user_id` |
| `idx_course_reviews_course` | 0 | `c` | 0 | `course_id, rating` |
| `sqlite_autoindex_course_reviews_2` | 1 | `u` | 0 | `course_id, user_id` |
| `sqlite_autoindex_course_reviews_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_roles`

Meta: `table=course_roles` `rows=3` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, org_id TEXT, name TEXT NOT NULL, display_name TEXT NOT NULL, permissions TEXT NOT NULL, is_system INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `org_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `name` | `TEXT` | 1 | `None` | 0 |
| 3 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `permissions` | `TEXT` | 1 | `None` | 0 |
| 5 | `is_system` | `INTEGER` | 0 | `0` | 0 |
| 6 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 7 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_roles_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_submissions`

Meta: `table=course_submissions` `rows=1` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, assignment_id TEXT NOT NULL, enrollment_id TEXT NOT NULL, user_id TEXT NOT NULL, course_id TEXT NOT NULL, status TEXT DEFAULT 'draft', evidence TEXT, submitted_at INTEGER, time_spent_minutes INTEGER, token_spend INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `assignment_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `enrollment_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 5 | `status` | `TEXT` | 0 | `'draft'` | 0 |
| 6 | `evidence` | `TEXT` | 0 | `None` | 0 |
| 7 | `submitted_at` | `INTEGER` | 0 | `None` | 0 |
| 8 | `time_spent_minutes` | `INTEGER` | 0 | `None` | 0 |
| 9 | `token_spend` | `INTEGER` | 0 | `0` | 0 |
| 10 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 11 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_submissions_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `course_users`

Meta: `table=course_users` `rows=3` `tags=auth-context,course-domain,course-platform,d1,enrollment,inneranimalmedia,learn,schema,users`

### Compact columns

```txt
id TEXT PK, email TEXT NOT NULL, name TEXT, avatar_url TEXT, timezone TEXT DEFAULT 'UTC', language TEXT DEFAULT 'en', is_active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `email` | `TEXT` | 1 | `None` | 0 |
| 2 | `name` | `TEXT` | 0 | `None` | 0 |
| 3 | `avatar_url` | `TEXT` | 0 | `None` | 0 |
| 4 | `timezone` | `TEXT` | 0 | `'UTC'` | 0 |
| 5 | `language` | `TEXT` | 0 | `'en'` | 0 |
| 6 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 7 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 8 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_course_users_2` | 1 | `u` | 0 | `email` |
| `sqlite_autoindex_course_users_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `courses`

Meta: `table=courses` `rows=14` `tags=course-domain,course-platform,d1,inneranimalmedia,learn,schema`

### Compact columns

```txt
id TEXT PK, org_id TEXT, title TEXT NOT NULL, slug TEXT NOT NULL, description TEXT, long_description TEXT, thumbnail_url TEXT, category TEXT, level TEXT DEFAULT 'beginner', duration_hours INTEGER, price_cents INTEGER DEFAULT 0, currency TEXT DEFAULT 'usd', is_public INTEGER DEFAULT 0, is_featured INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', instructor_id TEXT, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `org_id` | `TEXT` | 0 | `None` | 0 |
| 2 | `title` | `TEXT` | 1 | `None` | 0 |
| 3 | `slug` | `TEXT` | 1 | `None` | 0 |
| 4 | `description` | `TEXT` | 0 | `None` | 0 |
| 5 | `long_description` | `TEXT` | 0 | `None` | 0 |
| 6 | `thumbnail_url` | `TEXT` | 0 | `None` | 0 |
| 7 | `category` | `TEXT` | 0 | `None` | 0 |
| 8 | `level` | `TEXT` | 0 | `'beginner'` | 0 |
| 9 | `duration_hours` | `INTEGER` | 0 | `None` | 0 |
| 10 | `price_cents` | `INTEGER` | 0 | `0` | 0 |
| 11 | `currency` | `TEXT` | 0 | `'usd'` | 0 |
| 12 | `is_public` | `INTEGER` | 0 | `0` | 0 |
| 13 | `is_featured` | `INTEGER` | 0 | `0` | 0 |
| 14 | `status` | `TEXT` | 0 | `'draft'` | 0 |
| 15 | `instructor_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `metadata` | `TEXT` | 0 | `None` | 0 |
| 17 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 18 | `updated_at` | `INTEGER` | 1 | `None` | 0 |
| 19 | `published_at` | `INTEGER` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_courses_public` | 0 | `c` | 0 | `is_public, status` |
| `idx_courses_slug` | 0 | `c` | 0 | `slug` |
| `idx_courses_org` | 0 | `c` | 0 | `org_id, status` |
| `sqlite_autoindex_courses_2` | 1 | `u` | 0 | `org_id, slug` |
| `sqlite_autoindex_courses_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `enrollments`

Meta: `table=enrollments` `rows=5` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, org_id TEXT NOT NULL, user_id TEXT NOT NULL, course_id TEXT NOT NULL, enrollment_type TEXT DEFAULT 'student', status TEXT DEFAULT 'active', progress_percent REAL DEFAULT 0, started_at INTEGER, completed_at INTEGER, expires_at INTEGER, metadata TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `org_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `enrollment_type` | `TEXT` | 0 | `'student'` | 0 |
| 5 | `status` | `TEXT` | 0 | `'active'` | 0 |
| 6 | `progress_percent` | `REAL` | 0 | `0` | 0 |
| 7 | `started_at` | `INTEGER` | 0 | `None` | 0 |
| 8 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 9 | `expires_at` | `INTEGER` | 0 | `None` | 0 |
| 10 | `metadata` | `TEXT` | 0 | `None` | 0 |
| 11 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 12 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_enrollments_course` | 0 | `c` | 0 | `course_id, status` |
| `idx_enrollments_user` | 0 | `c` | 0 | `user_id, status` |
| `sqlite_autoindex_enrollments_2` | 1 | `u` | 0 | `org_id, user_id, course_id` |
| `sqlite_autoindex_enrollments_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `iam_user_onboarding_step`

Meta: `table=iam_user_onboarding_step` `rows=0` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', data_json TEXT, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `step` | `TEXT` | 1 | `None` | 0 |
| 4 | `status` | `TEXT` | 1 | `'pending'` | 0 |
| 5 | `data_json` | `TEXT` | 0 | `None` | 0 |
| 6 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 7 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_iam_uos_step` | 0 | `c` | 0 | `step` |
| `idx_iam_uos_tenant_user` | 0 | `c` | 0 | `tenant_id, user_id` |
| `sqlite_autoindex_iam_user_onboarding_step_2` | 1 | `u` | 0 | `tenant_id, user_id, step` |
| `sqlite_autoindex_iam_user_onboarding_step_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `lesson_assets`

Meta: `table=lesson_assets` `rows=0` `tags=course-content,d1,inneranimalmedia,lessons,schema`

### Compact columns

```txt
id TEXT PK, lesson_id TEXT NOT NULL, asset_type TEXT NOT NULL, asset_url TEXT NOT NULL, r2_key TEXT, r2_bucket TEXT, file_name TEXT, file_size INTEGER, mime_type TEXT, order_index INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `lesson_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `asset_type` | `TEXT` | 1 | `None` | 0 |
| 3 | `asset_url` | `TEXT` | 1 | `None` | 0 |
| 4 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 5 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 6 | `file_name` | `TEXT` | 0 | `None` | 0 |
| 7 | `file_size` | `INTEGER` | 0 | `None` | 0 |
| 8 | `mime_type` | `TEXT` | 0 | `None` | 0 |
| 9 | `order_index` | `INTEGER` | 0 | `0` | 0 |
| 10 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 11 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_lesson_assets_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `lesson_progress`

Meta: `table=lesson_progress` `rows=0` `tags=course-content,d1,inneranimalmedia,lessons,schema`

### Compact columns

```txt
id TEXT PK, enrollment_id TEXT NOT NULL, user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, course_id TEXT NOT NULL, status TEXT DEFAULT 'not_started', progress_percent REAL DEFAULT 0, time_spent_seconds INTEGER DEFAULT 0, last_position INTEGER, completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `enrollment_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `lesson_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 5 | `status` | `TEXT` | 0 | `'not_started'` | 0 |
| 6 | `progress_percent` | `REAL` | 0 | `0` | 0 |
| 7 | `time_spent_seconds` | `INTEGER` | 0 | `0` | 0 |
| 8 | `last_position` | `INTEGER` | 0 | `None` | 0 |
| 9 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 10 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 11 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_lesson_progress_user` | 0 | `c` | 0 | `user_id, course_id` |
| `idx_lesson_progress_enrollment` | 0 | `c` | 0 | `enrollment_id, lesson_id` |
| `sqlite_autoindex_lesson_progress_2` | 1 | `u` | 0 | `enrollment_id, lesson_id` |
| `sqlite_autoindex_lesson_progress_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `lesson_versions`

Meta: `table=lesson_versions` `rows=0` `tags=course-content,d1,inneranimalmedia,lessons,schema`

### Compact columns

```txt
id TEXT PK, lesson_id TEXT NOT NULL, version_number INTEGER NOT NULL, content_text TEXT, content_url TEXT, status TEXT DEFAULT 'draft', change_summary TEXT, created_by TEXT, created_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `lesson_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `version_number` | `INTEGER` | 1 | `None` | 0 |
| 3 | `content_text` | `TEXT` | 0 | `None` | 0 |
| 4 | `content_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `status` | `TEXT` | 0 | `'draft'` | 0 |
| 6 | `change_summary` | `TEXT` | 0 | `None` | 0 |
| 7 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 8 | `created_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_lesson_versions_2` | 1 | `u` | 0 | `lesson_id, version_number` |
| `sqlite_autoindex_lesson_versions_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `lessons`

Meta: `table=lessons` `rows=18` `tags=course-content,d1,inneranimalmedia,lessons,schema`

### Compact columns

```txt
id TEXT PK, module_id TEXT NOT NULL, course_id TEXT NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL, description TEXT, content_type TEXT DEFAULT 'text', content_url TEXT, content_text TEXT, order_index INTEGER NOT NULL, estimated_minutes INTEGER, is_required INTEGER DEFAULT 1, is_published INTEGER DEFAULT 0, published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `module_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `course_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `title` | `TEXT` | 1 | `None` | 0 |
| 4 | `slug` | `TEXT` | 1 | `None` | 0 |
| 5 | `description` | `TEXT` | 0 | `None` | 0 |
| 6 | `content_type` | `TEXT` | 0 | `'text'` | 0 |
| 7 | `content_url` | `TEXT` | 0 | `None` | 0 |
| 8 | `content_text` | `TEXT` | 0 | `None` | 0 |
| 9 | `order_index` | `INTEGER` | 1 | `None` | 0 |
| 10 | `estimated_minutes` | `INTEGER` | 0 | `None` | 0 |
| 11 | `is_required` | `INTEGER` | 0 | `1` | 0 |
| 12 | `is_published` | `INTEGER` | 0 | `0` | 0 |
| 13 | `published_at` | `INTEGER` | 0 | `None` | 0 |
| 14 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 15 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_lessons_course` | 0 | `c` | 0 | `course_id, is_published` |
| `idx_lessons_module` | 0 | `c` | 0 | `module_id, order_index` |
| `sqlite_autoindex_lessons_2` | 1 | `u` | 0 | `course_id, slug` |
| `sqlite_autoindex_lessons_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `org_users`

Meta: `table=org_users` `rows=4` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, org_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', permissions TEXT, joined_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `org_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `role` | `TEXT` | 1 | `'student'` | 0 |
| 4 | `permissions` | `TEXT` | 0 | `None` | 0 |
| 5 | `joined_at` | `INTEGER` | 1 | `None` | 0 |
| 6 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 7 | `updated_at` | `INTEGER` | 1 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_org_users_user` | 0 | `c` | 0 | `user_id` |
| `idx_org_users_org` | 0 | `c` | 0 | `org_id, user_id` |
| `sqlite_autoindex_org_users_2` | 1 | `u` | 0 | `org_id, user_id` |
| `sqlite_autoindex_org_users_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_api_keys`

Meta: `table=user_api_keys` `rows=0` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK DEFAULT 'uak_'||lower(hex(randomblob(8))), tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, provider TEXT NOT NULL, key_name TEXT NOT NULL, key_preview TEXT, key_hash TEXT, is_active INTEGER DEFAULT 1, last_used_at TEXT, created_at TEXT DEFAULT datetime('now'), person_uuid TEXT, workspace_id TEXT DEFAULT NULL, encrypted_value TEXT DEFAULT NULL, allowed_models_json TEXT DEFAULT NULL, rate_limit_per_hour INTEGER DEFAULT 1000, use_count INTEGER DEFAULT 0, last_ip TEXT DEFAULT NULL, expires_at INTEGER DEFAULT NULL, scopes_json TEXT DEFAULT '["inference"]'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'uak_'||lower(hex(randomblob(8)))` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `provider` | `TEXT` | 1 | `None` | 0 |
| 4 | `key_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `key_preview` | `TEXT` | 0 | `None` | 0 |
| 6 | `key_hash` | `TEXT` | 0 | `None` | 0 |
| 7 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 8 | `last_used_at` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 10 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 11 | `workspace_id` | `TEXT` | 0 | `NULL` | 0 |
| 12 | `encrypted_value` | `TEXT` | 0 | `NULL` | 0 |
| 13 | `allowed_models_json` | `TEXT` | 0 | `NULL` | 0 |
| 14 | `rate_limit_per_hour` | `INTEGER` | 0 | `1000` | 0 |
| 15 | `use_count` | `INTEGER` | 0 | `0` | 0 |
| 16 | `last_ip` | `TEXT` | 0 | `NULL` | 0 |
| 17 | `expires_at` | `INTEGER` | 0 | `NULL` | 0 |
| 18 | `scopes_json` | `TEXT` | 0 | `'["inference"]'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_user_api_keys_hash` | 0 | `c` | 0 | `key_hash` |
| `idx_user_api_keys_tenant` | 0 | `c` | 0 | `tenant_id, is_active` |
| `idx_user_api_keys_user_provider` | 0 | `c` | 0 | `user_id, provider, is_active` |
| `idx_user_api_keys_tenant_user_provider` | 0 | `c` | 0 | `tenant_id, user_id, provider, is_active` |
| `sqlite_autoindex_user_api_keys_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_backup_codes`

Meta: `table=user_backup_codes` `rows=10` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER, created_at INTEGER, person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `code_hash` | `TEXT` | 1 | `None` | 0 |
| 3 | `used_at` | `INTEGER` | 0 | `None` | 0 |
| 4 | `created_at` | `INTEGER` | 0 | `None` | 0 |
| 5 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_user_backup_codes_hash` | 0 | `c` | 0 | `code_hash` |
| `idx_user_backup_codes_user` | 0 | `c` | 0 | `user_id` |
| `sqlite_autoindex_user_backup_codes_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE user_backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER
, person_uuid TEXT)
```

## Table: `user_connections`

Meta: `table=user_connections` `rows=2` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, connection_type TEXT NOT NULL, display_name TEXT NOT NULL, host TEXT, port INTEGER, database_name TEXT, username TEXT, password_secret_ref TEXT, ssl_mode TEXT DEFAULT 'require', is_active INTEGER DEFAULT 1, last_tested_at TEXT, last_test_status TEXT, metadata_json TEXT DEFAULT '{}', created_at TEXT DEFAULT datetime('now'), person_uuid TEXT, workspace_id TEXT, hyperdrive_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `connection_type` | `TEXT` | 1 | `None` | 0 |
| 4 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `host` | `TEXT` | 0 | `None` | 0 |
| 6 | `port` | `INTEGER` | 0 | `None` | 0 |
| 7 | `database_name` | `TEXT` | 0 | `None` | 0 |
| 8 | `username` | `TEXT` | 0 | `None` | 0 |
| 9 | `password_secret_ref` | `TEXT` | 0 | `None` | 0 |
| 10 | `ssl_mode` | `TEXT` | 0 | `'require'` | 0 |
| 11 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 12 | `last_tested_at` | `TEXT` | 0 | `None` | 0 |
| 13 | `last_test_status` | `TEXT` | 0 | `None` | 0 |
| 14 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 15 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 16 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 17 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `hyperdrive_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_user_connections_2` | 1 | `u` | 0 | `tenant_id, user_id, display_name` |
| `sqlite_autoindex_user_connections_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_goals`

Meta: `table=user_goals` `rows=5` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, goal_saved REAL NOT NULL DEFAULT 0, goal_paid_off REAL NOT NULL DEFAULT 0, goal_owed REAL NOT NULL DEFAULT 0, goal_monthly_payment REAL NOT NULL DEFAULT 0, goal_target_label TEXT, updated_at INTEGER NOT NULL DEFAULT unixepoch(), user_id TEXT, person_uuid TEXT, goal_type TEXT DEFAULT 'financial', title TEXT, description TEXT, priority INTEGER DEFAULT 1, status TEXT DEFAULT 'active', target_date INTEGER, completed_at INTEGER, workspace_id TEXT, tenant_id TEXT, metadata_json TEXT DEFAULT '{}'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `goal_saved` | `REAL` | 1 | `0` | 0 |
| 2 | `goal_paid_off` | `REAL` | 1 | `0` | 0 |
| 3 | `goal_owed` | `REAL` | 1 | `0` | 0 |
| 4 | `goal_monthly_payment` | `REAL` | 1 | `0` | 0 |
| 5 | `goal_target_label` | `TEXT` | 0 | `None` | 0 |
| 6 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 7 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 9 | `goal_type` | `TEXT` | 0 | `'financial'` | 0 |
| 10 | `title` | `TEXT` | 0 | `None` | 0 |
| 11 | `description` | `TEXT` | 0 | `None` | 0 |
| 12 | `priority` | `INTEGER` | 0 | `1` | 0 |
| 13 | `status` | `TEXT` | 0 | `'active'` | 0 |
| 14 | `target_date` | `INTEGER` | 0 | `None` | 0 |
| 15 | `completed_at` | `INTEGER` | 0 | `None` | 0 |
| 16 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_user_goals_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_governance_roles`

Meta: `table=user_governance_roles` `rows=10` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
user_id TEXT PK NOT NULL, role_id TEXT PK NOT NULL, workspace_id TEXT PK NOT NULL DEFAULT '', tenant_id TEXT PK NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT unixepoch()
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `user_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `role_id` | `TEXT` | 1 | `None` | 2 |
| 2 | `workspace_id` | `TEXT` | 1 | `''` | 3 |
| 3 | `tenant_id` | `TEXT` | 1 | `''` | 4 |
| 4 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_user_governance_roles_1` | 1 | `pk` | 0 | `user_id, role_id, workspace_id, tenant_id` |

### Create SQL

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

## Table: `user_intake_profiles`

Meta: `table=user_intake_profiles` `rows=1` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, auth_user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, skill_level TEXT, current_stack TEXT, favorite_tools TEXT, favorite_ai TEXT, favorite_platforms TEXT, aspirations TEXT, goals_json TEXT, published_work_json TEXT, github_username TEXT, portfolio_url TEXT, communication_pref TEXT DEFAULT 'email', timezone TEXT DEFAULT 'America/Chicago', intake_completed INTEGER DEFAULT 0, intake_completed_at INTEGER, intake_token TEXT, intake_token_expires_at INTEGER, agent_profile_built INTEGER DEFAULT 0, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch(), person_uuid TEXT, workspace_id TEXT, preferred_name TEXT, bio TEXT, avatar_url TEXT, linkedin_url TEXT, twitter_handle TEXT, cf_account_id TEXT, preferred_models_json TEXT, onboarding_step INTEGER DEFAULT 0, last_active_at INTEGER, bridge_key_hash TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `auth_user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `skill_level` | `TEXT` | 0 | `None` | 0 |
| 4 | `current_stack` | `TEXT` | 0 | `None` | 0 |
| 5 | `favorite_tools` | `TEXT` | 0 | `None` | 0 |
| 6 | `favorite_ai` | `TEXT` | 0 | `None` | 0 |
| 7 | `favorite_platforms` | `TEXT` | 0 | `None` | 0 |
| 8 | `aspirations` | `TEXT` | 0 | `None` | 0 |
| 9 | `goals_json` | `TEXT` | 0 | `None` | 0 |
| 10 | `published_work_json` | `TEXT` | 0 | `None` | 0 |
| 11 | `github_username` | `TEXT` | 0 | `None` | 0 |
| 12 | `portfolio_url` | `TEXT` | 0 | `None` | 0 |
| 13 | `communication_pref` | `TEXT` | 0 | `'email'` | 0 |
| 14 | `timezone` | `TEXT` | 0 | `'America/Chicago'` | 0 |
| 15 | `intake_completed` | `INTEGER` | 0 | `0` | 0 |
| 16 | `intake_completed_at` | `INTEGER` | 0 | `None` | 0 |
| 17 | `intake_token` | `TEXT` | 0 | `None` | 0 |
| 18 | `intake_token_expires_at` | `INTEGER` | 0 | `None` | 0 |
| 19 | `agent_profile_built` | `INTEGER` | 0 | `0` | 0 |
| 20 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 21 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 22 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 23 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 24 | `preferred_name` | `TEXT` | 0 | `None` | 0 |
| 25 | `bio` | `TEXT` | 0 | `None` | 0 |
| 26 | `avatar_url` | `TEXT` | 0 | `None` | 0 |
| 27 | `linkedin_url` | `TEXT` | 0 | `None` | 0 |
| 28 | `twitter_handle` | `TEXT` | 0 | `None` | 0 |
| 29 | `cf_account_id` | `TEXT` | 0 | `None` | 0 |
| 30 | `preferred_models_json` | `TEXT` | 0 | `None` | 0 |
| 31 | `onboarding_step` | `INTEGER` | 0 | `0` | 0 |
| 32 | `last_active_at` | `INTEGER` | 0 | `None` | 0 |
| 33 | `bridge_key_hash` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_uip_token` | 0 | `c` | 0 | `intake_token` |
| `idx_uip_auth_user` | 0 | `c` | 0 | `auth_user_id` |
| `sqlite_autoindex_user_intake_profiles_3` | 1 | `u` | 0 | `intake_token` |
| `sqlite_autoindex_user_intake_profiles_2` | 1 | `u` | 0 | `auth_user_id` |
| `sqlite_autoindex_user_intake_profiles_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_integrations`

Meta: `table=user_integrations` `rows=15` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK DEFAULT lower(hex(randomblob(16))), user_email TEXT NOT NULL, service_name TEXT NOT NULL, service_type TEXT NOT NULL, api_key TEXT, config TEXT, is_connected INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_used DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT, user_id TEXT, auth_method TEXT, key_preview TEXT, scopes TEXT, webhook_url TEXT, person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `user_email` | `TEXT` | 1 | `None` | 0 |
| 2 | `service_name` | `TEXT` | 1 | `None` | 0 |
| 3 | `service_type` | `TEXT` | 1 | `None` | 0 |
| 4 | `api_key` | `TEXT` | 0 | `None` | 0 |
| 5 | `config` | `TEXT` | 0 | `None` | 0 |
| 6 | `is_connected` | `INTEGER` | 0 | `0` | 0 |
| 7 | `status` | `TEXT` | 0 | `'active'` | 0 |
| 8 | `last_used` | `DATETIME` | 0 | `None` | 0 |
| 9 | `created_at` | `DATETIME` | 0 | `CURRENT_TIMESTAMP` | 0 |
| 10 | `updated_at` | `DATETIME` | 0 | `CURRENT_TIMESTAMP` | 0 |
| 11 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `user_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `auth_method` | `TEXT` | 0 | `None` | 0 |
| 14 | `key_preview` | `TEXT` | 0 | `None` | 0 |
| 15 | `scopes` | `TEXT` | 0 | `None` | 0 |
| 16 | `webhook_url` | `TEXT` | 0 | `None` | 0 |
| 17 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `sqlite_autoindex_user_integrations_2` | 1 | `u` | 0 | `user_email, service_name` |
| `sqlite_autoindex_user_integrations_1` | 1 | `pk` | 0 | `id` |

### Create SQL

```sql
CREATE TABLE user_integrations (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), user_email TEXT NOT NULL, service_name TEXT NOT NULL, service_type TEXT NOT NULL, api_key TEXT, config TEXT, is_connected INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_used DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT, user_id TEXT, auth_method TEXT CHECK(auth_method IN ('api_key','oauth','webhook','bridge','none')), key_preview TEXT, scopes TEXT, webhook_url TEXT, person_uuid TEXT, UNIQUE(user_email, service_name))
```

## Table: `user_oauth_tokens`

Meta: `table=user_oauth_tokens` `rows=9` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
user_id TEXT PK NOT NULL, provider TEXT PK NOT NULL, account_identifier TEXT PK NOT NULL DEFAULT '', access_token TEXT, refresh_token TEXT, expires_at INTEGER, scope TEXT, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch(), access_token_encrypted TEXT, refresh_token_encrypted TEXT, scopes TEXT, account_email TEXT, account_display TEXT, tenant_id TEXT, person_uuid TEXT, workspace_id TEXT, metadata_json TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `user_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `provider` | `TEXT` | 1 | `None` | 2 |
| 2 | `account_identifier` | `TEXT` | 1 | `''` | 3 |
| 3 | `access_token` | `TEXT` | 0 | `None` | 0 |
| 4 | `refresh_token` | `TEXT` | 0 | `None` | 0 |
| 5 | `expires_at` | `INTEGER` | 0 | `None` | 0 |
| 6 | `scope` | `TEXT` | 0 | `None` | 0 |
| 7 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 8 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 9 | `access_token_encrypted` | `TEXT` | 0 | `None` | 0 |
| 10 | `refresh_token_encrypted` | `TEXT` | 0 | `None` | 0 |
| 11 | `scopes` | `TEXT` | 0 | `None` | 0 |
| 12 | `account_email` | `TEXT` | 0 | `None` | 0 |
| 13 | `account_display` | `TEXT` | 0 | `None` | 0 |
| 14 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 15 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 16 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `metadata_json` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_user_oauth_tokens_user_provider` | 0 | `c` | 0 | `user_id, provider` |
| `sqlite_autoindex_user_oauth_tokens_1` | 1 | `pk` | 0 | `user_id, provider, account_identifier` |

### Create SQL

```sql
CREATE TABLE "user_oauth_tokens" ( user_id TEXT NOT NULL, provider TEXT NOT NULL, account_identifier TEXT NOT NULL DEFAULT '', access_token TEXT, refresh_token TEXT, expires_at INTEGER, scope TEXT, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), access_token_encrypted TEXT, refresh_token_encrypted TEXT, scopes TEXT, account_email TEXT, account_display TEXT, tenant_id TEXT, person_uuid TEXT, workspace_id TEXT, metadata_json TEXT, PRIMARY KEY (user_id, provider, account_identifier) )
```

## Table: `user_secrets`

Meta: `table=user_secrets` `rows=1` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT 'system', secret_name TEXT NOT NULL, secret_value_encrypted TEXT NOT NULL, secret_type TEXT DEFAULT 'api_key', description TEXT, service_name TEXT, is_active INTEGER DEFAULT 1, expires_at INTEGER, last_used_at INTEGER, usage_count INTEGER DEFAULT 0, scopes_json TEXT DEFAULT '[]', metadata_json TEXT DEFAULT '{}', tags TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch(), project_id TEXT, project_label TEXT, person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `tenant_id` | `TEXT` | 1 | `'system'` | 0 |
| 3 | `secret_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `secret_value_encrypted` | `TEXT` | 1 | `None` | 0 |
| 5 | `secret_type` | `TEXT` | 0 | `'api_key'` | 0 |
| 6 | `description` | `TEXT` | 0 | `None` | 0 |
| 7 | `service_name` | `TEXT` | 0 | `None` | 0 |
| 8 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 9 | `expires_at` | `INTEGER` | 0 | `None` | 0 |
| 10 | `last_used_at` | `INTEGER` | 0 | `None` | 0 |
| 11 | `usage_count` | `INTEGER` | 0 | `0` | 0 |
| 12 | `scopes_json` | `TEXT` | 0 | `'[]'` | 0 |
| 13 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 14 | `tags` | `TEXT` | 0 | `None` | 0 |
| 15 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 16 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 17 | `project_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `project_label` | `TEXT` | 0 | `None` | 0 |
| 19 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_user_secrets_project` | 0 | `c` | 0 | `project_label` |
| `idx_user_secrets_expires` | 0 | `c` | 1 | `expires_at, is_active` |
| `idx_user_secrets_tenant` | 0 | `c` | 0 | `tenant_id, secret_type` |
| `idx_user_secrets_service` | 0 | `c` | 0 | `service_name, is_active` |
| `idx_user_secrets_user` | 0 | `c` | 0 | `user_id, secret_type, is_active` |
| `sqlite_autoindex_user_secrets_2` | 1 | `u` | 0 | `user_id, secret_name, service_name` |
| `sqlite_autoindex_user_secrets_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_settings`

Meta: `table=user_settings` `rows=4` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, user_id TEXT NOT NULL, full_name TEXT, display_name TEXT, avatar_url TEXT, bio TEXT, primary_email TEXT, primary_email_verified INTEGER DEFAULT 0, backup_email TEXT, professional_emails TEXT, phone TEXT, phone_verified INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/Chicago', language TEXT DEFAULT 'en', theme TEXT DEFAULT 'meaux-glass-blue', compact_mode INTEGER DEFAULT 0, sidebar_collapsed INTEGER DEFAULT 0, font_size TEXT DEFAULT 'medium', high_contrast INTEGER DEFAULT 0, email_notifications INTEGER DEFAULT 1, notification_frequency TEXT DEFAULT 'instant', push_notifications INTEGER DEFAULT 0, marketing_emails INTEGER DEFAULT 0, security_alerts INTEGER DEFAULT 1, reduced_motion INTEGER DEFAULT 0, recovery_codes TEXT, totp_secret_encrypted TEXT, totp_verified_at INTEGER, created_at INTEGER DEFAULT unixepoch(), updated_at INTEGER DEFAULT unixepoch(), default_workspace_id TEXT, auth_id TEXT, tenant_id TEXT, person_uuid TEXT, settings_json TEXT DEFAULT '{}'
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `full_name` | `TEXT` | 0 | `None` | 0 |
| 3 | `display_name` | `TEXT` | 0 | `None` | 0 |
| 4 | `avatar_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `bio` | `TEXT` | 0 | `None` | 0 |
| 6 | `primary_email` | `TEXT` | 0 | `None` | 0 |
| 7 | `primary_email_verified` | `INTEGER` | 0 | `0` | 0 |
| 8 | `backup_email` | `TEXT` | 0 | `None` | 0 |
| 9 | `professional_emails` | `TEXT` | 0 | `None` | 0 |
| 10 | `phone` | `TEXT` | 0 | `None` | 0 |
| 11 | `phone_verified` | `INTEGER` | 0 | `0` | 0 |
| 12 | `timezone` | `TEXT` | 0 | `'America/Chicago'` | 0 |
| 13 | `language` | `TEXT` | 0 | `'en'` | 0 |
| 14 | `theme` | `TEXT` | 0 | `'meaux-glass-blue'` | 0 |
| 15 | `compact_mode` | `INTEGER` | 0 | `0` | 0 |
| 16 | `sidebar_collapsed` | `INTEGER` | 0 | `0` | 0 |
| 17 | `font_size` | `TEXT` | 0 | `'medium'` | 0 |
| 18 | `high_contrast` | `INTEGER` | 0 | `0` | 0 |
| 19 | `email_notifications` | `INTEGER` | 0 | `1` | 0 |
| 20 | `notification_frequency` | `TEXT` | 0 | `'instant'` | 0 |
| 21 | `push_notifications` | `INTEGER` | 0 | `0` | 0 |
| 22 | `marketing_emails` | `INTEGER` | 0 | `0` | 0 |
| 23 | `security_alerts` | `INTEGER` | 0 | `1` | 0 |
| 24 | `reduced_motion` | `INTEGER` | 0 | `0` | 0 |
| 25 | `recovery_codes` | `TEXT` | 0 | `None` | 0 |
| 26 | `totp_secret_encrypted` | `TEXT` | 0 | `None` | 0 |
| 27 | `totp_verified_at` | `INTEGER` | 0 | `None` | 0 |
| 28 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 29 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 30 | `default_workspace_id` | `TEXT` | 0 | `None` | 0 |
| 31 | `auth_id` | `TEXT` | 0 | `None` | 0 |
| 32 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 33 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 34 | `settings_json` | `TEXT` | 0 | `'{}'` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_user_settings_user_id` | 0 | `c` | 0 | `user_id` |
| `sqlite_autoindex_user_settings_2` | 1 | `u` | 0 | `user_id` |
| `sqlite_autoindex_user_settings_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_storage_access_keys`

Meta: `table=user_storage_access_keys` `rows=3` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, access_key_id TEXT NOT NULL, secret_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `user_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `access_key_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `secret_hash` | `TEXT` | 1 | `None` | 0 |
| 5 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 6 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 7 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_user_storage_access_keys_tenant_user` | 0 | `c` | 0 | `tenant_id, user_id` |
| `sqlite_autoindex_user_storage_access_keys_2` | 1 | `u` | 0 | `access_key_id` |
| `sqlite_autoindex_user_storage_access_keys_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

## Table: `user_storage_preferences`

Meta: `table=user_storage_preferences` `rows=0` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
tenant_id TEXT PK NOT NULL, user_id TEXT PK NOT NULL, prefs_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, theme TEXT DEFAULT 'system', language TEXT DEFAULT 'en', timezone TEXT DEFAULT 'America/Chicago', notifications_json TEXT DEFAULT '{}', privacy_json TEXT DEFAULT '{}', feature_flags_json TEXT DEFAULT '{}', layout_json TEXT DEFAULT '{}', default_workspace_id TEXT, default_model TEXT, created_at INTEGER, person_uuid TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `tenant_id` | `TEXT` | 1 | `None` | 1 |
| 1 | `user_id` | `TEXT` | 1 | `None` | 2 |
| 2 | `prefs_json` | `TEXT` | 1 | `'{}'` | 0 |
| 3 | `updated_at` | `INTEGER` | 1 | `None` | 0 |
| 4 | `theme` | `TEXT` | 0 | `'system'` | 0 |
| 5 | `language` | `TEXT` | 0 | `'en'` | 0 |
| 6 | `timezone` | `TEXT` | 0 | `'America/Chicago'` | 0 |
| 7 | `notifications_json` | `TEXT` | 0 | `'{}'` | 0 |
| 8 | `privacy_json` | `TEXT` | 0 | `'{}'` | 0 |
| 9 | `feature_flags_json` | `TEXT` | 0 | `'{}'` | 0 |
| 10 | `layout_json` | `TEXT` | 0 | `'{}'` | 0 |
| 11 | `default_workspace_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `default_model` | `TEXT` | 0 | `None` | 0 |
| 13 | `created_at` | `INTEGER` | 0 | `None` | 0 |
| 14 | `person_uuid` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_usp_workspace` | 0 | `c` | 0 | `default_workspace_id` |
| `idx_usp_tenant` | 0 | `c` | 0 | `tenant_id` |
| `idx_usp_user` | 0 | `c` | 0 | `user_id` |
| `sqlite_autoindex_user_storage_preferences_1` | 1 | `pk` | 0 | `tenant_id, user_id` |

### Create SQL

```sql
CREATE TABLE user_storage_preferences (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL, theme TEXT DEFAULT 'system', language TEXT DEFAULT 'en', timezone TEXT DEFAULT 'America/Chicago', notifications_json TEXT DEFAULT '{}', privacy_json TEXT DEFAULT '{}', feature_flags_json TEXT DEFAULT '{}', layout_json TEXT DEFAULT '{}', default_workspace_id TEXT, default_model TEXT, created_at INTEGER, person_uuid TEXT,
  PRIMARY KEY (tenant_id, user_id)
)
```

## Table: `users`

Meta: `table=users` `rows=21` `tags=auth-context,d1,enrollment,inneranimalmedia,schema,users`

### Compact columns

```txt
id TEXT PK DEFAULT 'usr_' || lower(hex(randomblob(12))), user_key TEXT, email TEXT NOT NULL, backup_email TEXT, phone TEXT, display_name TEXT, avatar_url TEXT, user_type TEXT NOT NULL DEFAULT 'human', role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', provider TEXT DEFAULT 'google', provider_id TEXT, tenant_id TEXT DEFAULT 'tenant_sam_primeaux', default_workspace_id TEXT DEFAULT 'ws_samprimeaux', stripe_customer_id TEXT, created_at INTEGER NOT NULL DEFAULT unixepoch(), updated_at INTEGER NOT NULL DEFAULT unixepoch(), last_login_at INTEGER, last_active_at INTEGER, auth_id TEXT, superadmin_uuid TEXT, person_uuid TEXT, supabase_user_id TEXT
```

### Columns

| order | name | type | not_null | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `'usr_' || lower(hex(randomblob(12)))` | 1 |
| 1 | `user_key` | `TEXT` | 0 | `None` | 0 |
| 2 | `email` | `TEXT` | 1 | `None` | 0 |
| 3 | `backup_email` | `TEXT` | 0 | `None` | 0 |
| 4 | `phone` | `TEXT` | 0 | `None` | 0 |
| 5 | `display_name` | `TEXT` | 0 | `None` | 0 |
| 6 | `avatar_url` | `TEXT` | 0 | `None` | 0 |
| 7 | `user_type` | `TEXT` | 1 | `'human'` | 0 |
| 8 | `role` | `TEXT` | 1 | `'user'` | 0 |
| 9 | `status` | `TEXT` | 1 | `'active'` | 0 |
| 10 | `provider` | `TEXT` | 0 | `'google'` | 0 |
| 11 | `provider_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `tenant_id` | `TEXT` | 0 | `'tenant_sam_primeaux'` | 0 |
| 13 | `default_workspace_id` | `TEXT` | 0 | `'ws_samprimeaux'` | 0 |
| 14 | `stripe_customer_id` | `TEXT` | 0 | `None` | 0 |
| 15 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 16 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 17 | `last_login_at` | `INTEGER` | 0 | `None` | 0 |
| 18 | `last_active_at` | `INTEGER` | 0 | `None` | 0 |
| 19 | `auth_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `superadmin_uuid` | `TEXT` | 0 | `None` | 0 |
| 21 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 22 | `supabase_user_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

| name | unique | origin | partial | columns |
|---|---:|---|---:|---|
| `idx_users_supabase_user_id` | 0 | `c` | 0 | `supabase_user_id` |
| `idx_users_tenant_status` | 0 | `c` | 0 | `tenant_id, status` |
| `idx_users_email` | 0 | `c` | 0 | `email` |
| `idx_users_auth_id` | 0 | `c` | 0 | `auth_id` |
| `sqlite_autoindex_users_3` | 1 | `u` | 0 | `email` |
| `sqlite_autoindex_users_2` | 1 | `u` | 0 | `user_key` |
| `sqlite_autoindex_users_1` | 1 | `pk` | 0 | `id` |

### Create SQL

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

