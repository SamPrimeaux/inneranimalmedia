-- 581: MCP dashboard — four experiment zones + agentsam_terminal_sandbox ready for real work.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/581_mcp_four_zones_terminal_sandbox.sql

-- ── 1. Four platform MCP zone profiles (soft persona, full tool catalog) ───────
INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active,
  is_platform_global, sort_order, agent_type, sandbox_mode, icon,
  can_spawn_subagents, spawnable_agent_slugs, access_mode, created_at, updated_at
) VALUES
(
  'mcp_zone_engineer',
  'platform', '', '',
  'engineer',
  'Engineer',
  'Implementation sandbox — code, debug, deploy experiments in an isolated zone directory.',
  'You are the Engineer MCP zone. Implement, debug, and ship code. You may use any tool in the catalog; zone tags are hints only. Prefer agentsam_terminal_sandbox for risky experiments (runs under .mcp-zones/engineer). Use agentsam_terminal_local for normal repo work. Pass zone_slug=engineer when calling agentsam_terminal_sandbox.',
  '[]',
  NULL, 1, 1, 1, 'mcp_zone', 'workspace-write', 'code-2',
  1, '["architect","cms","specialist"]', 'read_write', datetime('now'), datetime('now')
),
(
  'mcp_zone_architect',
  'platform', '', '',
  'architect',
  'Architect',
  'Planning sandbox — system design, tradeoffs, and cross-zone handoffs.',
  'You are the Architect MCP zone. Plan systems, document tradeoffs, and propose handoffs to other zones. Tools are not restricted by zone. Spawn or summarize work for engineer/cms/specialist when useful. Use agentsam_terminal_sandbox with zone_slug=architect for isolated diagram or scaffold experiments.',
  '[]',
  NULL, 1, 1, 2, 'mcp_zone', 'read_only', 'folder-search',
  1, '["engineer","cms","specialist"]', 'read_write', datetime('now'), datetime('now')
),
(
  'mcp_zone_cms',
  'platform', '', '',
  'cms',
  'CMS',
  'Content sandbox — pages, themes, sections, and publish-path experiments.',
  'You are the CMS MCP zone. Work on cms_* tables, themes, pages, and publish flows. All tools remain available; focus on content operations. Use agentsam_cms_* tools and d1_query for cms tables. agentsam_terminal_sandbox with zone_slug=cms for isolated content/script trials.',
  '[]',
  NULL, 1, 1, 3, 'mcp_zone', 'workspace-write', 'database',
  0, '[]', 'read_write', datetime('now'), datetime('now')
),
(
  'mcp_zone_specialist',
  'platform', '', '',
  'specialist',
  'Specialist',
  'Wildcard sandbox — deep dives, multi-agent collab tests, and odd experiments.',
  'You are the Specialist MCP zone — wildcard lab for collaboration tests, Antigravity sandbox arms, and unusual tool chains. No tool allowlist. You may spawn subagents across engineer/architect/cms. Use agentsam_terminal_sandbox with zone_slug=specialist for isolated runs.',
  '[]',
  NULL, 1, 1, 4, 'mcp_zone', 'workspace-write', 'terminal',
  1, '["engineer","architect","cms"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = excluded.is_active,
  is_platform_global = excluded.is_platform_global,
  sort_order = excluded.sort_order,
  agent_type = excluded.agent_type,
  sandbox_mode = excluded.sandbox_mode,
  icon = excluded.icon,
  can_spawn_subagents = excluded.can_spawn_subagents,
  spawnable_agent_slugs = excluded.spawnable_agent_slugs,
  access_mode = excluded.access_mode,
  updated_at = datetime('now');

-- Hide legacy multitask panel agents from MCP grid (still usable elsewhere).
UPDATE agentsam_subagent_profile
SET is_active = 0, updated_at = datetime('now')
WHERE slug IN (
  'docs-researcher', 'code-mapper', 'browser-debugger', 'ui-fixer',
  'deep-researcher', 'code-editor', 'deploy-validator'
)
AND is_platform_global = 1;

-- ── 2. agentsam_terminal_sandbox — canonical schema + handler ─────────────────
UPDATE agentsam_tools
SET
  description = 'Isolated MCP zone shell — runs under .mcp-zones/{zone_slug} in the caller workspace. Safe for experiments; does not mutate production paths outside the zone dir.',
  input_schema = '{"type":"object","properties":{"command":{"type":"string","description":"Shell command to run inside the zone sandbox directory."},"zone_slug":{"type":"string","description":"MCP zone slug (engineer, architect, cms, specialist). Defaults to specialist."},"language":{"type":"string","enum":["shell","python","node"],"default":"shell"},"path":{"type":"string","description":"Optional subpath inside the zone root."}},"required":["command"],"additionalProperties":false}',
  output_schema = '{"type":"object","properties":{"ok":{"type":"boolean"},"cwd":{"type":"string"},"cwd_source":{"type":"string"},"exit_code":{"type":"integer"},"stdout":{"type":"string"},"stderr":{"type":"string"},"output":{"type":"string"},"command":{"type":"string"},"zone_slug":{"type":"string"},"sandbox_root":{"type":"string"},"recovery_hints":{"type":"array"}},"additionalProperties":true}',
  handler_type = 'terminal',
  handler_config = '{"auth_source":"platform","target_type":"sandbox","zone_root_template":".mcp-zones/{zone_slug}","use_caller_workspace":true}',
  modes_json = '["agent","debug","multitask"]',
  tool_category = 'terminal',
  risk_level = 'high',
  requires_approval = 0,
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_terminal_sandbox';

-- Ensure mcp_panel route can reach terminal tools
UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["think","research","inspect","observe","develop","design","operate","integrate","admin","terminal"]',
  optional_capability_keys_json = '["mcp.tool.inspect","d1.read","logs.read","context.search","terminal.sandbox","terminal.local"]',
  max_tools = 32
WHERE route_key = 'mcp_panel';

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes)
VALUES
  ('atpk_mcp_panel_term_sandbox', 'agent_chat_essential', 'agentsam_terminal_sandbox', 45, 'mcp_panel zone sandbox'),
  ('atpk_mcp_panel_term_local', 'agent_chat_essential', 'agentsam_terminal_local', 46, 'mcp_panel zone local shell');

-- ── 3. ws_agentsandbox settings — zone metadata (fallback workspace) ─────────
UPDATE workspace_settings
SET settings_json = json_set(
      COALESCE(settings_json, '{}'),
      '$.mcp_zone_sandbox',
      json('{"zone_root_template":".mcp-zones/{zone_slug}","note":"Per-zone dirs under caller workspace_root; fallback workspace ws_agentsandbox"}')
    ),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_agentsandbox';
