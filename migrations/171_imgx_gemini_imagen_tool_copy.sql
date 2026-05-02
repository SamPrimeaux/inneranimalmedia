-- 171: Refresh imgx_generate_image tool copy for OpenAI + Gemini/Imagen (generate); imgx_edit_image remains OpenAI-only.
-- Run after approval: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/171_imgx_gemini_imagen_tool_copy.sql

UPDATE mcp_registered_tools SET
  description = 'Generate an image from a text prompt. provider=openai uses OpenAI Images (gpt-image-1); provider=gemini uses Google Imagen (imagen-3.0-generate-002) with GOOGLE_AI_API_KEY. If provider is omitted, OpenAI is preferred when configured, otherwise Gemini.',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string"},"provider":{"type":"string","description":"openai or gemini (Imagen generate only); omit to auto-pick by available API keys."},"model":{"type":"string"},"size":{"type":"string"},"filename":{"type":"string"}},"required":["prompt"],"additionalProperties":false}',
  updated_at = datetime('now')
WHERE tool_name = 'imgx_generate_image';

UPDATE mcp_registered_tools SET
  description = 'Edit an image from a URL using text instructions. OpenAI Images API only (provider=openai or omit). Gemini/Imagen does not support this tool.',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string"},"input_url":{"type":"string"},"provider":{"type":"string","description":"Must be openai or omitted."},"model":{"type":"string"},"size":{"type":"string"},"filename":{"type":"string"}},"required":["prompt","input_url"],"additionalProperties":false}',
  updated_at = datetime('now')
WHERE tool_name = 'imgx_edit_image';
