-- table: agentsam_user_feature_override
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE agentsam_user_feature_override (
  user_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), person_uuid TEXT,
  PRIMARY KEY (user_id, flag_key),
  FOREIGN KEY (flag_key) REFERENCES agentsam_feature_flag(flag_key)
);

-- table: agentsam_user_policy
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
);

-- table: auth_user_identities
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
);

-- table: auth_users
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, tenant_id TEXT, is_superadmin INTEGER DEFAULT 0, superadmin_group_id TEXT, is_verified INTEGER NOT NULL DEFAULT 0, verified_at INTEGER, superadmin_uuid TEXT, superadmin_identity_id TEXT, person_uuid TEXT, supabase_user_id TEXT, status TEXT DEFAULT 'active', active_tenant_id TEXT, active_workspace_id TEXT);

-- table: cms_activity_log
-- tags: activity-log, analytics, cms, cms-support, d1, inneranimalmedia, schema
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
);

-- table: cms_assets
-- tags: assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema
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
);

-- table: cms_collection_assets
-- tags: assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema
CREATE TABLE cms_collection_assets (
    collection_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (collection_id, asset_id),
    FOREIGN KEY (collection_id) REFERENCES cms_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES cms_assets(id) ON DELETE CASCADE
);

-- table: cms_collections
-- tags: assets, cms, cms-support, d1, inneranimalmedia, r2-resources, schema
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
);

-- table: cms_component_templates
-- tags: cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates
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
, r2_bucket TEXT, r2_key TEXT, s3_endpoint TEXT, tenant_id TEXT);

-- table: cms_global_settings
-- tags: cms, cms-support, d1, inneranimalmedia, schema
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
);

-- table: cms_navigation_menus
-- tags: cms, cms-support, d1, inneranimalmedia, schema
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
);

-- table: cms_page_sections
-- tags: cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates
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
);

-- table: cms_pages
-- tags: cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates
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
);

-- table: cms_section_components
-- tags: cms, cms-support, d1, inneranimalmedia, layout, schema, sections, templates
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
);

-- table: cms_theme_preferences
-- tags: cms, cms-support, d1, inneranimalmedia, schema, theme, tokens
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
);

-- table: cms_themes
-- tags: cms, cms-support, d1, inneranimalmedia, schema, theme, tokens
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
);

-- table: course_assignments
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: course_exports
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: course_grades
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: course_lessons
-- tags: course-content, course-domain, course-platform, d1, inneranimalmedia, learn, lessons, schema
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
, content TEXT, content_format TEXT NOT NULL DEFAULT 'markdown', has_content INTEGER NOT NULL DEFAULT 0, sandbox_query TEXT, sandbox_db TEXT DEFAULT 'd1');

-- table: course_modules
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: course_progress
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: course_reviews
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: course_roles
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
CREATE TABLE course_roles (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  permissions TEXT NOT NULL,
  is_system INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- table: course_submissions
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: course_users
-- tags: auth-context, course-domain, course-platform, d1, enrollment, inneranimalmedia, learn, schema, users
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
);

-- table: courses
-- tags: course-domain, course-platform, d1, inneranimalmedia, learn, schema
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
);

-- table: enrollments
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
);

-- table: iam_user_onboarding_step
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
);

-- table: lesson_assets
-- tags: course-content, d1, inneranimalmedia, lessons, schema
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
);

-- table: lesson_progress
-- tags: course-content, d1, inneranimalmedia, lessons, schema
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
);

-- table: lesson_versions
-- tags: course-content, d1, inneranimalmedia, lessons, schema
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
);

-- table: lessons
-- tags: course-content, d1, inneranimalmedia, lessons, schema
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
);

-- table: org_users
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
);

-- table: user_api_keys
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
, person_uuid TEXT, workspace_id TEXT DEFAULT NULL, encrypted_value TEXT DEFAULT NULL, allowed_models_json TEXT DEFAULT NULL, rate_limit_per_hour INTEGER DEFAULT 1000, use_count INTEGER DEFAULT 0, last_ip TEXT DEFAULT NULL, expires_at INTEGER DEFAULT NULL, scopes_json TEXT DEFAULT '["inference"]');

-- table: user_backup_codes
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE user_backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER
, person_uuid TEXT);

-- table: user_connections
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
          );

-- table: user_goals
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE user_goals (
  id TEXT PRIMARY KEY,
  goal_saved REAL NOT NULL DEFAULT 0,
  goal_paid_off REAL NOT NULL DEFAULT 0,
  goal_owed REAL NOT NULL DEFAULT 0,
  goal_monthly_payment REAL NOT NULL DEFAULT 0,
  goal_target_label TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, user_id TEXT, person_uuid TEXT, goal_type TEXT DEFAULT 'financial' CHECK(goal_type IN ('financial','project','learning','client','platform','personal')), title TEXT, description TEXT, priority INTEGER DEFAULT 1, status TEXT DEFAULT 'active', target_date INTEGER, completed_at INTEGER, workspace_id TEXT, tenant_id TEXT, metadata_json TEXT DEFAULT '{}');

-- table: user_governance_roles
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE user_governance_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  tenant_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, role_id, workspace_id, tenant_id)
);

-- table: user_intake_profiles
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
, person_uuid TEXT, workspace_id TEXT, preferred_name TEXT, bio TEXT, avatar_url TEXT, linkedin_url TEXT, twitter_handle TEXT, cf_account_id TEXT, preferred_models_json TEXT, onboarding_step INTEGER DEFAULT 0, last_active_at INTEGER, bridge_key_hash TEXT);

-- table: user_integrations
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE user_integrations (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), user_email TEXT NOT NULL, service_name TEXT NOT NULL, service_type TEXT NOT NULL, api_key TEXT, config TEXT, is_connected INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_used DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT, user_id TEXT, auth_method TEXT CHECK(auth_method IN ('api_key','oauth','webhook','bridge','none')), key_preview TEXT, scopes TEXT, webhook_url TEXT, person_uuid TEXT, UNIQUE(user_email, service_name));

-- table: user_oauth_tokens
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE "user_oauth_tokens" ( user_id TEXT NOT NULL, provider TEXT NOT NULL, account_identifier TEXT NOT NULL DEFAULT '', access_token TEXT, refresh_token TEXT, expires_at INTEGER, scope TEXT, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), access_token_encrypted TEXT, refresh_token_encrypted TEXT, scopes TEXT, account_email TEXT, account_display TEXT, tenant_id TEXT, person_uuid TEXT, workspace_id TEXT, metadata_json TEXT, PRIMARY KEY (user_id, provider, account_identifier) );

-- table: user_secrets
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
);

-- table: user_settings
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
, default_workspace_id TEXT, auth_id TEXT, tenant_id TEXT, person_uuid TEXT, settings_json TEXT DEFAULT '{}');

-- table: user_storage_access_keys
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE user_storage_access_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_key_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
, person_uuid TEXT);

-- table: user_storage_preferences
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
CREATE TABLE user_storage_preferences (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL, theme TEXT DEFAULT 'system', language TEXT DEFAULT 'en', timezone TEXT DEFAULT 'America/Chicago', notifications_json TEXT DEFAULT '{}', privacy_json TEXT DEFAULT '{}', feature_flags_json TEXT DEFAULT '{}', layout_json TEXT DEFAULT '{}', default_workspace_id TEXT, default_model TEXT, created_at INTEGER, person_uuid TEXT,
  PRIMARY KEY (tenant_id, user_id)
);

-- table: users
-- tags: auth-context, d1, enrollment, inneranimalmedia, schema, users
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
, auth_id TEXT, superadmin_uuid TEXT, person_uuid TEXT, supabase_user_id TEXT);
