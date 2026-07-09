-- 804: Image routing — prompt-only tool contract (no intent_slug at call site).
-- Remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/804_image_tier_from_prompt.sql

UPDATE agentsam_rules_document
SET
  body_markdown = '## Image generation (agent-owned prompt, tool-owned routing)

When the user asks for any image, sketch, floor plan, diagram, blueprint, or visual:

1. **Understand intent** from the conversation — draft/sketch vs quality render vs presentation sheet.
2. **Quick draft (floor plan, wireframe, layout):** emit a complete inline ```svg code fence in your reply — labeled rooms, dimensions, north arrow when relevant. User edits SVG in-chat; no /draw hop.
3. **Quality render or presentation sheet:** construct a descriptive **prompt** from conversation + project context; call `imgx_generate_image` with **prompt only** (optional quality/size). The tool classifies tier from prompt text and picks the model — do not pass routing slugs or tier tokens.
4. Do not ask for clarification unless intent is genuinely ambiguous — propose and generate.
5. **3D massing only** → `illustration_create` with `intent: model_3d`, `engine: openscad|freecad`.
6. Never route 2D `floor_plan` / `blueprint` to OpenSCAD or CAD.
7. `/genmedia` brand loop only when user explicitly requests on-brand marketing assets.',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_image_generation_agent_cookbook';

UPDATE agentsam_tools
SET
  description = 'Generate an image from a constructed prompt. Pass prompt only — tool infers tier and Thompson-picks model. provider=openai|google|workers_ai.',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string","description":"Constructed image prompt from user intent and project context"},"quality":{"type":"string","description":"Optional — tool sets from prompt tier if omitted"},"size":{"type":"string","description":"Optional — e.g. 1024x1024, 1536x1024"},"provider":{"type":"string"},"model":{"type":"string","description":"Optional override — omit for auto tier routing"},"persist":{"type":"boolean"},"project_id":{"type":"string"}},"required":["prompt"],"additionalProperties":true}',
  updated_at = unixepoch()
WHERE tool_key = 'imgx_generate_image' AND is_active = 1;
