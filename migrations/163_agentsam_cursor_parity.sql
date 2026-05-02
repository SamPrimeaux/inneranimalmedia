-- =============================================================================
-- 163_agentsam_cursor_parity.sql — idempotent CREATE (inneranimalmedia-business)
-- =============================================================================
-- Production (cf87b717-d4e2-4cf8-bab0-a81268e32d49): applied before 2026-03-22 audit.
-- Safe to run on new/staging D1: all CREATE TABLE IF NOT EXISTS.
-- Original review copy: scripts/d1-cursor-parity-schema-review.sql (keep in sync).
-- =============================================================================
-- Purpose: Cursor-parity agentsam_* tables + optional theme INSERTs (commented).
--          On existing prod, creates are no-ops; uncomment Section K only if themes missing.
--
-- Already in this repo (migrations — you likely HAVE these):
--   agent_sessions, agent_messages, agent_configs, agent_execution_plans,
--   agent_request_queue, agent_command_proposals, agent_telemetry,
--   mcp_tool_calls, mcp_usage_log, mcp_workflows, terminal_sessions,
--   user_settings, user_workspace_settings, cms_themes, ai_compiled_context_cache,
--   governance_*, change_sets, playwright_jobs, cloudflare_deployments, ...
--
-- This file ADDS (or proposes) IAM / Agent Sam policy + indexing + runs + themes.
-- Naming prefix: agentsam_*  (and one agentsam_ table set from docs/AGENTSAM_IGNORE_AND_RULES.md)
--
-- After review: split into migrations/16x_*.sql and run with wrangler d1 execute.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION A — Optional: cms_themes picker metadata (uncomment if columns missing)
-- -----------------------------------------------------------------------------
-- PRAGMA table_info(cms_themes);
-- If theme_family / sort_order do not exist:

-- ALTER TABLE cms_themes ADD COLUMN theme_family TEXT DEFAULT 'custom';
--    -- suggested values: dark | light | high_contrast_dark | high_contrast_light | custom
-- ALTER TABLE cms_themes ADD COLUMN sort_order INTEGER DEFAULT 100;

-- CREATE INDEX IF NOT EXISTS idx_cms_themes_family_sort
--   ON cms_themes(theme_family, sort_order);


-- -----------------------------------------------------------------------------
-- SECTION B — Agent Sam user policy (Cursor “Agents” settings plane)
-- -----------------------------------------------------------------------------
-- workspace_id: use '' (empty string) for user-global default; non-empty = override for that workspace.

CREATE TABLE IF NOT EXISTS agentsam_user_policy (
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_user_policy_user
  ON agentsam_user_policy(user_id);


-- -----------------------------------------------------------------------------
-- SECTION C — Allowlists (terminal commands, MCP tool ids, fetch domains)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentsam_command_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  command TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, workspace_id, command)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_cmd_allow_user
  ON agentsam_command_allowlist(user_id, workspace_id);


CREATE TABLE IF NOT EXISTS agentsam_mcp_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  tool_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, workspace_id, tool_key)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_mcp_allow_user
  ON agentsam_mcp_allowlist(user_id, workspace_id);


CREATE TABLE IF NOT EXISTS agentsam_fetch_domain_allowlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, workspace_id, host)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_fetch_domain_user
  ON agentsam_fetch_domain_allowlist(user_id, workspace_id);


-- -----------------------------------------------------------------------------
-- SECTION D — Browser trust (popup / proxy / server-fetch gating)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentsam_browser_trusted_origin (
  user_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  cert_fingerprint_sha256 TEXT,
  trust_scope TEXT NOT NULL DEFAULT 'persistent',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, origin)
);


-- -----------------------------------------------------------------------------
-- SECTION E — Feature flags (platform-wide + optional per-user JSON override)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentsam_feature_flag (
  flag_key TEXT PRIMARY KEY,
  description TEXT,
  enabled_globally INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agentsam_user_feature_override (
  user_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, flag_key),
  FOREIGN KEY (flag_key) REFERENCES agentsam_feature_flag(flag_key)
);


-- -----------------------------------------------------------------------------
-- SECTION F — Agent run lifecycle (audit / Plan & Usage style — complements agent_request_queue)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentsam_agent_run (
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
);

CREATE INDEX IF NOT EXISTS idx_agentsam_run_user_created
  ON agentsam_agent_run(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_run_conversation
  ON agentsam_agent_run(conversation_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_run_idempotency
  ON agentsam_agent_run(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';


-- -----------------------------------------------------------------------------
-- SECTION G — Code index job metadata (Cursor “Indexing & Docs” plane — metadata only)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentsam_code_index_job (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  file_count INTEGER DEFAULT 0,
  progress_percent INTEGER DEFAULT 0,
  last_sync_at TEXT,
  last_error TEXT,
  vector_backend TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, workspace_id)
);


-- -----------------------------------------------------------------------------
-- SECTION H — Subagent / profile (Cursor “Subagents” plane)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentsam_subagent_profile (
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_subagent_user
  ON agentsam_subagent_profile(user_id);


-- -----------------------------------------------------------------------------
-- SECTION I — .agentsamignore / .agentsamrules (see docs/AGENTSAM_IGNORE_AND_RULES.md)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentsam_ignore_pattern (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  workspace_id TEXT,
  pattern TEXT NOT NULL,
  is_negation INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'db',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agentsam_ignore_ws
  ON agentsam_ignore_pattern(workspace_id, order_index);

CREATE INDEX IF NOT EXISTS idx_agentsam_ignore_user
  ON agentsam_ignore_pattern(user_id, order_index);


CREATE TABLE IF NOT EXISTS agentsam_rules_document (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  workspace_id TEXT,
  title TEXT NOT NULL DEFAULT 'default',
  body_markdown TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agentsam_rules_ws_active
  ON agentsam_rules_document(workspace_id, is_active);


CREATE TABLE IF NOT EXISTS agentsam_rules_revision (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (document_id) REFERENCES agentsam_rules_document(id)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_rules_rev_doc
  ON agentsam_rules_revision(document_id, version DESC);


-- -----------------------------------------------------------------------------
-- SECTION J — Optional seed feature flags (comment out if you prefer empty)
-- -----------------------------------------------------------------------------

INSERT OR IGNORE INTO agentsam_feature_flag (flag_key, description, enabled_globally) VALUES
  ('instant_grep_beta', 'Faster grep using local index metadata', 0),
  ('cloud_agent_handoff', 'Remote agent continuation (future)', 0),
  ('worker_theme_injection', 'Inject cms_themes.cssVars on dashboard boot', 1);


-- -----------------------------------------------------------------------------
-- SECTION K — Themes: Kimbie + Solarized (same as scripts/d1-insert-themes-kimbie-solarized-proposal.sql)
--          Uncomment ONLY after confirming cms_themes columns (id, name, slug, is_system, config).
-- -----------------------------------------------------------------------------

/*
INSERT OR REPLACE INTO cms_themes (id, name, slug, is_system, config) VALUES
(
  'theme-kimbie-dark',
  'Kimbie Dark',
  'kimbie-dark',
  1,
  '{"bg":"#221a0f","surface":"#362712","text":"#d3af86","textSecondary":"#84613d","border":"rgba(211,175,134,0.18)","primary":"#f06431","primaryHover":"#ff7a45","radius":"6px","cssVars":{"--bg-canvas":"#221a0f","--bg-surface":"#2a1f14","--bg-elevated":"#362712","--bg-panel":"#362712","--bg-nav":"rgba(240, 100, 49, 0.92)","--bg-input":"#51412c","--bg-status":"#423523","--color-text":"#d3af86","--text-primary":"#d3af86","--text-secondary":"#c3a67c","--text-muted":"#84613d","--color-border":"rgba(211, 175, 134, 0.18)","--border":"rgba(211, 175, 134, 0.18)","--color-primary":"#f06431","--color-primary-hover":"#ff7a45","--color-success":"#889b4a","--color-danger":"#dc322f","--radius":"6px","--popover-bg":"rgba(54, 39, 18, 0.94)","--popover-border":"rgba(211, 175, 134, 0.22)","--popover-row-hover":"rgba(136, 155, 74, 0.12)","--popover-row-active":"rgba(240, 100, 49, 0.18)"}}'
),
(
  'theme-solarized-dark',
  'Solarized Dark',
  'solarized-dark',
  1,
  '{"bg":"#002b36","surface":"#073642","text":"#839496","textSecondary":"#586e75","border":"rgba(88,110,117,0.35)","primary":"#268bd2","primaryHover":"#2aa198","radius":"6px","cssVars":{"--bg-canvas":"#002b36","--bg-surface":"#073642","--bg-elevated":"#073642","--bg-panel":"#073642","--bg-nav":"rgba(38, 139, 210, 0.9)","--bg-input":"#073642","--bg-status":"#073642","--color-text":"#839496","--text-primary":"#839496","--text-secondary":"#93a1a1","--text-muted":"#586e75","--color-border":"rgba(88, 110, 117, 0.35)","--border":"rgba(88, 110, 117, 0.35)","--color-primary":"#268bd2","--color-primary-hover":"#2aa198","--color-success":"#859900","--color-danger":"#dc322f","--radius":"6px","--popover-bg":"rgba(7, 54, 66, 0.96)","--popover-border":"rgba(88, 110, 117, 0.4)","--popover-row-hover":"rgba(42, 161, 152, 0.12)","--popover-row-active":"rgba(38, 139, 210, 0.2)"}}'
),
(
  'theme-solarized-light',
  'Solarized Light',
  'solarized-light',
  1,
  '{"bg":"#fdf6e3","surface":"#eee8d5","text":"#657b83","textSecondary":"#93a1a1","border":"rgba(88,110,117,0.25)","primary":"#268bd2","primaryHover":"#2075b5","radius":"6px","cssVars":{"--bg-canvas":"#fdf6e3","--bg-surface":"#eee8d5","--bg-elevated":"#eee8d5","--bg-panel":"#eee8d5","--bg-nav":"rgba(38, 139, 210, 0.88)","--bg-input":"#fdf6e3","--bg-status":"#eee8d5","--color-text":"#657b83","--text-primary":"#657b83","--text-secondary":"#586e75","--text-muted":"#93a1a1","--color-border":"rgba(88, 110, 117, 0.25)","--border":"rgba(88, 110, 117, 0.25)","--color-primary":"#268bd2","--color-primary-hover":"#2075b5","--color-success":"#859900","--color-danger":"#dc322f","--radius":"6px","--popover-bg":"rgba(253, 246, 227, 0.97)","--popover-border":"rgba(88, 110, 117, 0.3)","--popover-row-hover":"rgba(38, 139, 210, 0.1)","--popover-row-active":"rgba(38, 139, 210, 0.16)"}}'
);
*/


-- -----------------------------------------------------------------------------
-- SECTION L — Sanity queries (run after CREATE to compare counts / list tables)
-- -----------------------------------------------------------------------------

-- SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agentsam_%' ORDER BY name;
-- SELECT COUNT(*) FROM agentsam_user_policy;
-- SELECT id, name, slug FROM cms_themes WHERE slug IN ('kimbie-dark','solarized-dark','solarized-light');
