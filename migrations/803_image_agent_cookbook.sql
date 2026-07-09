-- 803: Image generation agent cookbook + imgx tool schema (intent_slug, quality, size).
-- Remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/803_image_agent_cookbook.sql

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  trigger_type,
  trigger_condition_json,
  notes,
  source_stored
) VALUES (
  'rule_image_generation_agent_cookbook',
  '',
  '',
  'Image generation — agent cookbook',
  '## Image generation (agent-owned)

When the user asks for any image, sketch, floor plan, diagram, blueprint, or visual:

1. **Understand intent:** quick draft/sketch vs quality render vs presentation sheet vs edit reference.
2. **Quick draft (floor plan, wireframe, layout):** emit a complete inline ```svg code fence in your reply — labeled rooms, dimensions, north arrow when relevant. User edits SVG in-chat; no /draw hop.
3. **Quality render or presentation sheet:** construct a descriptive prompt from conversation + project context; call `imgx_generate_image` with:
   - `prompt` (constructed, not raw user chat text)
   - `intent_slug`: `image_blueprint_draft` | `image_render_quality` | `image_presentation_sheet` | `image_edit_reference`
   - `quality` and `size` when known (presentation sheet: high + 1536x1024)
4. Do not ask for clarification unless intent is genuinely ambiguous — propose and generate.
5. **3D massing only** → `illustration_create` with `intent: model_3d`, `engine: openscad|freecad`.
6. Never route 2D `floor_plan` / `blueprint` to OpenSCAD or CAD.
7. `/genmedia` brand loop only when user explicitly requests on-brand marketing assets.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'on_trigger',
  'workflow',
  'keyword',
  '{"keywords":["image","sketch","floor plan","blueprint","diagram","render","visual","imgx","presentation sheet","barndominium","architectural"],"match":"any","min_matches":1}',
  'Phase 1 image routing — agent-first, inline SVG drafts, imgx for quality tiers',
  'migrations/803_image_agent_cookbook.sql'
);

UPDATE agentsam_rules_document
SET
  body_markdown = '## Image generation (agent-owned)

When the user asks for any image, sketch, floor plan, diagram, blueprint, or visual:

1. **Understand intent:** quick draft/sketch vs quality render vs presentation sheet vs edit reference.
2. **Quick draft (floor plan, wireframe, layout):** emit a complete inline ```svg code fence in your reply — labeled rooms, dimensions, north arrow when relevant. User edits SVG in-chat; no /draw hop.
3. **Quality render or presentation sheet:** construct a descriptive prompt from conversation + project context; call `imgx_generate_image` with:
   - `prompt` (constructed, not raw user chat text)
   - `intent_slug`: `image_blueprint_draft` | `image_render_quality` | `image_presentation_sheet` | `image_edit_reference`
   - `quality` and `size` when known (presentation sheet: high + 1536x1024)
4. Do not ask for clarification unless intent is genuinely ambiguous — propose and generate.
5. **3D massing only** → `illustration_create` with `intent: model_3d`, `engine: openscad|freecad`.
6. Never route 2D `floor_plan` / `blueprint` to OpenSCAD or CAD.
7. `/genmedia` brand loop only when user explicitly requests on-brand marketing assets.',
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["image","sketch","floor plan","blueprint","diagram","render","visual","imgx","presentation sheet","barndominium","architectural"],"match":"any","min_matches":1}',
  is_active = 1,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_image_generation_agent_cookbook';

UPDATE agentsam_tools
SET
  description = 'Generate an image from a constructed prompt. Omit model to Thompson-pick by intent_slug. provider=openai|google|workers_ai.',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string","description":"Constructed image prompt from user intent and project context"},"intent_slug":{"type":"string","description":"image_blueprint_draft | image_render_quality | image_presentation_sheet | image_edit_reference"},"quality":{"type":"string","description":"low | medium | high | auto (OpenAI gpt-image-2)"},"size":{"type":"string","description":"e.g. 1024x1024, 1536x1024"},"provider":{"type":"string"},"model":{"type":"string"},"persist":{"type":"boolean"},"project_id":{"type":"string"}},"required":["prompt"],"additionalProperties":true}',
  updated_at = unixepoch()
WHERE tool_key = 'imgx_generate_image' AND is_active = 1;

UPDATE mcp_registered_tools
SET
  description = 'Generate an image from a constructed prompt. Thompson routing uses intent_slug when model omitted.',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string"},"intent_slug":{"type":"string"},"quality":{"type":"string"},"size":{"type":"string"},"provider":{"type":"string"},"model":{"type":"string"},"filename":{"type":"string"},"project_id":{"type":"string"}},"required":["prompt"],"additionalProperties":true}',
  updated_at = datetime('now')
WHERE tool_name = 'imgx_generate_image';
