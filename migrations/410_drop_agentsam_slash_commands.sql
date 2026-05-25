-- 410: Retire agentsam_slash_commands — canonical slash/Cmd+K registry is agentsam_commands.
-- Runtime: src/core/agentsam-command-catalog.js, /api/agent/commands, executeCommand (no slash table reads).
-- Idempotent: backfill by (workspace_id, slug) then DROP.

INSERT OR IGNORE INTO agentsam_commands (
  id,
  workspace_id,
  tenant_id,
  slug,
  display_name,
  description,
  pattern,
  pattern_type,
  mapped_command,
  category,
  risk_level,
  requires_confirmation,
  requires_approval,
  show_in_slash,
  show_in_allowlist,
  show_in_palette,
  modes_json,
  sort_order,
  use_count,
  last_used_at,
  is_active,
  is_global,
  execution_mode,
  router_type,
  tool_key,
  internal_seo,
  created_at,
  updated_at
)
SELECT
  'cmd_' || substr(s.id, 4),
  'platform',
  NULL,
  s.slug,
  s.display_name,
  s.description,
  COALESCE(NULLIF(trim(s.usage_hint), ''), s.slug),
  'exact',
  COALESCE(
    NULLIF(trim(s.handler_ref), ''),
    NULLIF(trim(s.handler_sql), ''),
    s.slug
  ),
  'legacy_slash',
  CASE lower(trim(COALESCE(s.risk_level, 'low')))
    WHEN 'none' THEN 'low'
    WHEN 'high' THEN 'high'
    ELSE 'low'
  END,
  COALESCE(s.requires_confirmation, 0),
  COALESCE(s.requires_confirmation, 0),
  1,
  1,
  1,
  COALESCE(s.modes_json, '["agent","auto","debug"]'),
  COALESCE(s.sort_order, 50),
  COALESCE(s.call_count, 0),
  s.last_called_at,
  COALESCE(s.is_active, 1),
  1,
  CASE lower(trim(s.handler_type))
    WHEN 'subagent_spawn' THEN 'agent'
    ELSE 'tool'
  END,
  CASE lower(trim(s.handler_type))
    WHEN 'db_query' THEN 'tool'
    WHEN 'subagent_spawn' THEN 'agent'
    WHEN 'tool_invoke' THEN 'tool'
    WHEN 'ollama_local' THEN 'tool'
    ELSE 'tool'
  END,
  NULLIF(trim(s.handler_ref), ''),
  'migrated_from_agentsam_slash_commands',
  COALESCE(s.created_at, datetime('now')),
  datetime('now')
FROM agentsam_slash_commands s
WHERE trim(COALESCE(s.slug, '')) != '';

DROP TABLE IF EXISTS agentsam_slash_commands;
