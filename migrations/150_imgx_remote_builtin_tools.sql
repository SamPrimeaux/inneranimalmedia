-- 150: Register remote IMGX-style image generation/edit MCP tools (builtin execution in worker)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/150_imgx_remote_builtin_tools.sql

INSERT OR IGNORE INTO mcp_services (
  id,
  service_name,
  service_type,
  endpoint_url,
  d1_databases,
  authentication_type,
  token_secret_name,
  requires_oauth,
  is_active,
  health_status,
  metadata,
  created_at,
  updated_at
) VALUES (
  'mcp_imgx_remote',
  'IMGX Remote Builtin',
  'mcp-server',
  'https://inneranimalmedia.com/api/mcp/imgx',
  '["cf87b717-d4e2-4cf8-bab0-a81268e32d49"]',
  'token',
  'OPENAI_API_KEY',
  0,
  1,
  'unverified',
  '{"purpose":"remote-image-generation-and-editing","execution":"worker-builtin","providers":["openai","gemini"],"tools":["imgx_generate_image","imgx_edit_image","imgx_list_providers"]}',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  cost_per_call_usd,
  created_at,
  updated_at
) VALUES
(
  'imgx_generate_image',
  'imgx_generate_image',
  'image',
  'BUILTIN',
  'Generate an image from text prompt using remote worker providers',
  '{"type":"object","properties":{"prompt":{"type":"string"},"provider":{"type":"string"},"model":{"type":"string"},"size":{"type":"string"},"filename":{"type":"string"}},"required":["prompt"],"additionalProperties":false}',
  0,
  1,
  0.000000,
  datetime('now'),
  datetime('now')
),
(
  'imgx_edit_image',
  'imgx_edit_image',
  'image',
  'BUILTIN',
  'Edit an image using text instructions and input URL',
  '{"type":"object","properties":{"prompt":{"type":"string"},"input_url":{"type":"string"},"provider":{"type":"string"},"model":{"type":"string"},"size":{"type":"string"},"filename":{"type":"string"}},"required":["prompt","input_url"],"additionalProperties":false}',
  0,
  1,
  0.000000,
  datetime('now'),
  datetime('now')
),
(
  'imgx_list_providers',
  'imgx_list_providers',
  'image',
  'BUILTIN',
  'List available remote image providers and model availability',
  '{"type":"object","properties":{},"additionalProperties":false}',
  0,
  1,
  0.000000,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO mcp_command_suggestions (
  label,
  description,
  example_prompt,
  intent_slug,
  routed_to_agent,
  icon,
  sort_order,
  usage_count,
  is_pinned
) VALUES
(
  'Generate image',
  'Create a new image from text',
  'generate an image of a clean SaaS dashboard hero illustration',
  'intent_imgx_generate',
  'mcp_agent_builder',
  'terminal',
  41,
  0,
  1
),
(
  'Edit image',
  'Edit an existing image with instructions',
  'edit image https://example.com/image.png to use warm sunset lighting',
  'intent_imgx_edit',
  'mcp_agent_builder',
  'terminal',
  42,
  0,
  0
),
(
  'List image providers',
  'Show available remote image providers',
  'list image providers',
  'intent_imgx_generate',
  'mcp_agent_tester',
  'terminal',
  43,
  0,
  0
);

INSERT OR IGNORE INTO agent_intent_patterns (
  intent_slug,
  display_name,
  description,
  triggers_json,
  workflow_agent,
  is_active,
  sort_order,
  created_at,
  updated_at
) VALUES
(
  'intent_imgx_generate',
  'Image Generation',
  'Generate new images using remote providers',
  '["generate image","create image","text to image","image generation","make an image"]',
  'mcp_agent_builder',
  1,
  41,
  datetime('now'),
  datetime('now')
),
(
  'intent_imgx_edit',
  'Image Editing',
  'Edit existing images using prompt instructions',
  '["edit image","modify image","change image","retouch image","update image style"]',
  'mcp_agent_builder',
  1,
  42,
  datetime('now'),
  datetime('now')
);
