-- 449_terminal_targets_and_ai_prefs.sql
-- Additive terminal target routing + opt-in terminal AI prefs.
-- Does NOT drop/rebuild terminal runtime tables (431 already reset those).
-- Note: sprint spec referenced 432; that number is used by agentsam_notify_resend_email_schema.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/449_terminal_targets_and_ai_prefs.sql
--
-- Idempotent on first apply. Re-run: skip ALTERs if PRAGMA table_info shows columns present.

-- ── terminal_connections: target routing columns ─────────────────────────────
ALTER TABLE terminal_connections ADD COLUMN target_type TEXT NOT NULL DEFAULT 'platform_vm';
ALTER TABLE terminal_connections ADD COLUMN target_priority INTEGER NOT NULL DEFAULT 50;
ALTER TABLE terminal_connections ADD COLUMN self_service_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE terminal_connections ADD COLUMN last_health_status TEXT;
ALTER TABLE terminal_connections ADD COLUMN last_health_at INTEGER;
ALTER TABLE terminal_connections ADD COLUMN health_error TEXT;
ALTER TABLE terminal_connections ADD COLUMN cwd_strategy TEXT NOT NULL DEFAULT 'platform_workspace';

UPDATE terminal_connections
SET target_type = 'platform_vm'
WHERE target_type IS NULL OR trim(target_type) = '';

UPDATE terminal_connections
SET cwd_strategy = 'platform_workspace'
WHERE cwd_strategy IS NULL OR trim(cwd_strategy) = '';

-- ── terminal_sessions: per-session prefs ─────────────────────────────────────
ALTER TABLE terminal_sessions ADD COLUMN prefs_json TEXT NOT NULL DEFAULT '{}';

UPDATE terminal_sessions
SET prefs_json = '{}'
WHERE prefs_json IS NULL OR trim(prefs_json) = '';

-- ── agentsam_user_policy: opt-in terminal AI gate ────────────────────────────
ALTER TABLE agentsam_user_policy ADD COLUMN terminal_ai_enabled INTEGER NOT NULL DEFAULT 0;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_terminal_connections_target_select
  ON terminal_connections(workspace_id, tenant_id, user_id, target_type, is_active, is_default, target_priority);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user_workspace_status
  ON terminal_sessions(workspace_id, tenant_id, user_id, status, updated_at);

-- ── Terminal slash commands (agentsam_commands) ──────────────────────────────
INSERT OR IGNORE INTO agentsam_commands (
  id, workspace_id, tenant_id, slug, display_name, description, pattern, pattern_type,
  mapped_command, category, subcategory, risk_level, requires_confirmation,
  show_in_slash, show_in_palette, sort_order, is_active, is_global, execution_mode,
  router_type, tool_key, internal_seo, created_at, updated_at
) VALUES
(
  'cmd_terminal_agentsam',
  'platform',
  NULL,
  '/agentsam',
  'Terminal Agent Sam',
  'Enable or manage Agent Sam in the terminal (opt-in; shell-only by default).',
  '/agentsam',
  'exact',
  'terminal.agentsam',
  'terminal',
  'ai',
  'low',
  0,
  1,
  0,
  10,
  1,
  1,
  'agent',
  'terminal_builtin',
  'terminal.agentsam',
  'terminal_slash_agentsam',
  datetime('now'),
  datetime('now')
),
(
  'cmd_terminal_models',
  'platform',
  NULL,
  '/models',
  'Terminal models',
  'List or select a model for terminal AI assist (opt-in).',
  '/models',
  'exact',
  'terminal.models',
  'terminal',
  'ai',
  'low',
  0,
  1,
  0,
  11,
  1,
  1,
  'agent',
  'terminal_builtin',
  'terminal.models',
  'terminal_slash_models',
  datetime('now'),
  datetime('now')
),
(
  'cmd_terminal_ask',
  'platform',
  NULL,
  '/ask',
  'Terminal ask',
  'Ask Agent Sam a question in terminal context (opt-in; requires terminal AI enabled).',
  '/ask',
  'exact',
  'terminal.ask',
  'terminal',
  'ai',
  'low',
  0,
  1,
  0,
  12,
  1,
  1,
  'agent',
  'terminal_builtin',
  'terminal.ask',
  'terminal_slash_ask',
  datetime('now'),
  datetime('now')
);

UPDATE agentsam_commands
SET
  mapped_command = 'terminal.agentsam',
  category = 'terminal',
  subcategory = 'ai',
  router_type = 'terminal_builtin',
  tool_key = 'terminal.agentsam',
  is_global = 1,
  show_in_slash = 1,
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'cmd_terminal_agentsam';

UPDATE agentsam_commands
SET
  mapped_command = 'terminal.models',
  category = 'terminal',
  subcategory = 'ai',
  router_type = 'terminal_builtin',
  tool_key = 'terminal.models',
  is_global = 1,
  show_in_slash = 1,
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'cmd_terminal_models';

UPDATE agentsam_commands
SET
  mapped_command = 'terminal.ask',
  category = 'terminal',
  subcategory = 'ai',
  router_type = 'terminal_builtin',
  tool_key = 'terminal.ask',
  is_global = 1,
  show_in_slash = 1,
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'cmd_terminal_ask';
