-- Register agentsam_video_embed tool for Gemini media lane indexing.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/616_agentsam_video_embed_tool.sql

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, handler_key, risk_level, requires_approval, modes_json
) VALUES (
  'ast_agentsam_video_embed',
  'agentsam_video_embed',
  'Video Embed (Gemini media lane)',
  'media',
  'media',
  'Index a media_assets row into AGENTSAM_VECTORIZE_MEDIA via gemini-embedding-2 @1536.',
  1,
  'agentsam_video_embed',
  'agentsam_video_embed',
  'low',
  0,
  '["agent","multitask"]'
);

UPDATE agentsam_tools
SET handler_key = 'agentsam_video_embed',
    handler_type = 'media',
    is_active = 1,
    description = 'Index a media_assets row into AGENTSAM_VECTORIZE_MEDIA via gemini-embedding-2 @1536.',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_video_embed';
