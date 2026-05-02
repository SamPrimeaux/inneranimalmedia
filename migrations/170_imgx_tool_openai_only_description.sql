-- 170: Document imgx_generate_image / imgx_edit_image as OpenAI-only in mcp_registered_tools (avoid gemini from chat model).
-- Run after approval: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/170_imgx_tool_openai_only_description.sql

UPDATE mcp_registered_tools SET
  description = 'Generate an image from a text prompt via OpenAI Images API only. Use provider openai or omit provider; do not pass gemini (not supported for this tool).',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string"},"provider":{"type":"string","description":"Must be openai or omitted; gemini is not supported."},"model":{"type":"string"},"size":{"type":"string"},"filename":{"type":"string"}},"required":["prompt"],"additionalProperties":false}',
  updated_at = datetime('now')
WHERE tool_name = 'imgx_generate_image';

UPDATE mcp_registered_tools SET
  description = 'Edit an image from a URL using text instructions via OpenAI Images API only. Use provider openai or omit provider; do not pass gemini.',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string"},"input_url":{"type":"string"},"provider":{"type":"string","description":"Must be openai or omitted; gemini is not supported."},"model":{"type":"string"},"size":{"type":"string"},"filename":{"type":"string"}},"required":["prompt","input_url"],"additionalProperties":false}',
  updated_at = datetime('now')
WHERE tool_name = 'imgx_edit_image';
