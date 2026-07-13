-- 848: visual_canvas Excalidraw catalog alignment (steps 1–3)
-- Re-catalog useful model-facing builtins; retire dead pins; supersede open alias.
-- Do NOT catalog excalidraw_clear / excalidraw_add_elements (private adapter ops).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/848_visual_canvas_excalidraw_catalog_align.sql

-- ── Catalog: export / library / plan_map ──────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval, requires_confirmation,
  is_active, is_global, oauth_visible, dispatch_target, sort_priority, notes, modes_json,
  domain, task_type, created_at, updated_at
) VALUES
(
  'ast_excalidraw_export',
  'excalidraw_export',
  'excalidraw_export',
  'Excalidraw export',
  'design',
  'canvas',
  'excalidraw_export',
  'excalidraw.export',
  'Export the active Excalidraw Draw canvas (PNG/scene). Use after illustration_create or when the user asks to download/share the diagram.',
  '{"type":"object","properties":{"format":{"type":"string","enum":["png","json","svg"],"default":"png"},"scene":{"type":"object","description":"Optional scene payload when exporting server-side"}},"additionalProperties":true}',
  'low', 0, 0, 1, 1, 0, 'internal', 48,
  '848: model-facing Draw export — handler media.js excalidraw_export',
  '["auto","agent","ask","plan"]',
  'design', 'visual_canvas', unixepoch(), unixepoch()
),
(
  'ast_excalidraw_load_library',
  'excalidraw_load_library',
  'excalidraw_load_library',
  'Excalidraw load library',
  'design',
  'canvas',
  'excalidraw_load_library',
  'excalidraw.load_library',
  'Load an Excalidraw shape library onto /dashboard/draw by slug (e.g. lofi-wireframe, web-kit, universal-ui-kit).',
  '{"type":"object","properties":{"slug":{"type":"string","description":"Library slug"}},"required":["slug"],"additionalProperties":false}',
  'low', 0, 0, 1, 1, 0, 'internal', 47,
  '848: model-facing Draw libraries — handler media.js excalidraw_load_library',
  '["auto","agent","ask","plan"]',
  'design', 'visual_canvas', unixepoch(), unixepoch()
),
(
  'ast_excalidraw_plan_map_create',
  'excalidraw_plan_map_create',
  'excalidraw_plan_map_create',
  'Excalidraw plan map',
  'design',
  'canvas',
  'excalidraw_plan_map_create',
  'excalidraw.plan_map',
  'Generate an Excalidraw plan map from agentsam_plans + plan tasks (R2 artifact + canvas). Use for multi-task plans — not general freeform drawing (prefer illustration_create).',
  '{"type":"object","properties":{"plan_id":{"type":"string"},"open_after_create":{"type":"boolean","default":true}},"required":["plan_id"],"additionalProperties":false}',
  'low', 0, 0, 1, 1, 0, 'internal', 46,
  '848: plan-map only — pin on plan route, not default visual_canvas',
  '["auto","agent","plan"]',
  'design', 'plan', unixepoch(), unixepoch()
);

-- ── visual_canvas profile + route (no plan_map, no CAD/Meshy) ─────────────
UPDATE agentsam_tool_profiles
SET tool_keys_json = '["agentsam_excalidraw","illustration_create","excalidraw_export","excalidraw_load_library","agentsam_memory_manager"]',
    max_tools = 8,
    notes = '848: Draw lane — open + generate bridge + export/library + memory. plan_map stays on plan route. clear/add_elements remain private handlers.',
    updated_at = unixepoch()
WHERE profile_key = 'visual_canvas';

UPDATE agentsam_prompt_routes
SET tool_keys = '["agentsam_excalidraw","illustration_create","excalidraw_export","excalidraw_load_library","agentsam_memory_manager"]',
    max_tools = 8,
    preferred_model = 'gpt-5.6-terra',
    fallback_model = 'gpt-5.6-luna',
    updated_at = unixepoch()
WHERE route_key = 'visual_canvas';

-- ── plan route: replace dead pins; include plan_map ───────────────────────
UPDATE agentsam_prompt_routes
SET tool_keys = '["agentsam_autorag","agentsam_d1_query","generate_execution_plan","agentsam_excalidraw","illustration_create","excalidraw_load_library","excalidraw_plan_map_create","agentsam_memory_manager"]',
    updated_at = unixepoch()
WHERE route_key = 'plan';

-- ── Capability aliases: open → canonical catalog key ──────────────────────
UPDATE agentsam_capability_aliases
SET match_value = 'agentsam_excalidraw',
    rationale = COALESCE(rationale, '') || ' | 848: supersede excalidraw_open → agentsam_excalidraw'
WHERE match_value = 'excalidraw_open';

-- ── Quickstart allowed_tool_globs / copy (qs_card_* Draw cards) ───────────
UPDATE agentsam_subagent_profile
SET allowed_tool_globs = '["illustration_create","agentsam_excalidraw","excalidraw_load_library","read"]',
    instructions_markdown = REPLACE(
      REPLACE(instructions_markdown, 'excalidraw_open / excalidraw_add_elements', 'agentsam_excalidraw + illustration_create'),
      'excalidraw_open',
      'agentsam_excalidraw'
    ),
    updated_at = datetime('now')
WHERE id IN ('qs_card_flowchart', 'qs_card_wireframe', 'qs_card_blank_canvas');

-- Wireframe rule copy (if present)
UPDATE agentsam_rules_document
SET body_markdown = REPLACE(
      REPLACE(body_markdown, 'excalidraw_open + excalidraw_add_elements', 'agentsam_excalidraw + illustration_create'),
      'excalidraw_add_elements',
      'illustration_create'
    ),
    updated_at_epoch = unixepoch()
WHERE id = 'rule_excalidraw_wireframe_deliverable'
   OR rule_key = 'rule_excalidraw_wireframe_deliverable';
