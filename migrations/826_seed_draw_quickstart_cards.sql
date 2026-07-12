-- 826: Browser "Make something new" card seeds in agentsam_subagent_profile.
-- SSOT for card-flowchart / card-wireframe / card-blank-canvas (open_surface + intake seed).
-- UI strip labels stay in React; behavior resolves by slug from GET /api/agent/quickstart/templates.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/826_seed_draw_quickstart_cards.sql

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active,
  is_platform_global, sort_order, agent_type, output_schema_json, created_at, updated_at
) VALUES
(
  'qs_card_flowchart',
  'platform', '', '',
  'card-flowchart',
  'Flowchart',
  'Diagrams & maps on Excalidraw',
  'Quickstart: Flowchart. The Excalidraw Draw canvas is open. Before drawing anything, ask me 2–4 short questions about the diagram I want (what process or system, who it is for, how many main nodes, any must-have labels or swimlanes). Wait for my answers. Then build it on the canvas with illustration_create (intent wireframe or sketch, engine excalidraw) or excalidraw_open / excalidraw_add_elements — never ASCII art or a text box diagram.',
  '["illustration_create","excalidraw_open","excalidraw_add_elements","read"]',
  NULL, 1, 1, 210, 'design',
  '{"quickstart":{"task_type":"plan","route_key":"design_studio","model_hint":"auto","open_surface":"excalidraw","library_slugs":["lofi-wireframe","web-kit"]}}',
  datetime('now'), datetime('now')
),
(
  'qs_card_wireframe',
  'platform', '', '',
  'card-wireframe',
  'Product wireframe',
  'Lo-fi screens on Wireframe studio',
  'Quickstart: Product wireframe. The Wireframe studio (Figma-like UI canvas) is open on Draw. Before placing components, ask me 2–4 short questions: which screen(s), desktop/tablet/mobile, primary user goal, and any must-have blocks (nav, hero, form, table). Wait for my answers. Then guide me in Wireframe studio — do not output ASCII wireframes.',
  '["read"]',
  NULL, 1, 1, 220, 'design',
  '{"quickstart":{"task_type":"plan","route_key":"design_studio","model_hint":"auto","open_surface":"wireframe"}}',
  datetime('now'), datetime('now')
),
(
  'qs_card_blank_canvas',
  'platform', '', '',
  'card-blank-canvas',
  'Blank canvas',
  'Freeform Wireframe studio sketch',
  'Quickstart: Blank canvas. Wireframe studio is open for a freeform UI sketch. Ask what screen I want to design, then help me build it with the component palette.',
  '["read"]',
  NULL, 1, 1, 230, 'design',
  '{"quickstart":{"task_type":"plan","route_key":"design_studio","model_hint":"auto","open_surface":"wireframe"}}',
  datetime('now'), datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  instructions_markdown = excluded.instructions_markdown,
  output_schema_json = excluded.output_schema_json,
  description = excluded.description,
  display_name = excluded.display_name,
  is_active = 1,
  is_platform_global = 1,
  updated_at = datetime('now');
