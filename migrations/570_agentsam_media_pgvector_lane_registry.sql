-- 570: Register Supabase pgvector lane for MovieMode media (gemini-embedding-2 @1536).
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/570_agentsam_media_pgvector_lane_registry.sql

INSERT OR IGNORE INTO agentsam_pgvector_lane_registry (
  id, schema_name, table_name, purpose, dimensions, metric, embedding_model,
  size_label, size_bytes, is_active, is_archive, description
) VALUES (
  'pgv_media_gemini2_1536',
  'agentsam',
  'agentsam_media_gemini2_1536',
  'media',
  1536,
  'cosine',
  'gemini-embedding-2',
  '0 B',
  0,
  1,
  0,
  'MovieMode multimodal media @1536 — pairs with AGENTSAM_VECTORIZE_MEDIA / agentsam-moviemode-gemini2-1536'
);

UPDATE agentsam_pgvector_lane_registry
SET table_name = 'agentsam_media_gemini2_1536',
    purpose = 'media',
    dimensions = 1536,
    metric = 'cosine',
    embedding_model = 'gemini-embedding-2',
    is_active = 1,
    description = 'MovieMode multimodal media @1536 — pairs with AGENTSAM_VECTORIZE_MEDIA / agentsam-moviemode-gemini2-1536',
    updated_at = datetime('now')
WHERE id = 'pgv_media_gemini2_1536';
