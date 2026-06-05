-- 568: MovieMode multimodal Vectorize lane + media_assets embed columns.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/568_moviemode_multimodal_vectorize.sql
--
-- Prerequisite (once per account):
--   ./scripts/with-cloudflare-env.sh npx wrangler vectorize create agentsam-moviemode-gemini2-1536 --dimensions=1536 --metric=cosine -c wrangler.production.toml
--
-- embed columns applied on production 2026-06-05 before ledger entry.
-- D1 SQLite has no ADD COLUMN IF NOT EXISTS. Fresh DBs: if PRAGMA table_info lacks
-- vectorize_id / embed_model / embedded_at, run once:
--   ALTER TABLE media_assets ADD COLUMN vectorize_id TEXT;
--   ALTER TABLE media_assets ADD COLUMN embed_model TEXT;
--   ALTER TABLE media_assets ADD COLUMN embedded_at TEXT;

CREATE INDEX IF NOT EXISTS idx_media_assets_vectorize ON media_assets(workspace_id, vectorize_id);

INSERT OR IGNORE INTO vectorize_index_registry (
  id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active,
  description, use_cases, created_at, updated_at
) VALUES (
  'vidx_agentsam_media',
  'AGENTSAM_VECTORIZE_MEDIA',
  'agentsam-moviemode-gemini2-1536',
  'MovieMode media (Gemini 1536)',
  'manual',
  1536,
  'cosine',
  0,
  1,
  'Multimodal asset search — gemini-embedding-2 @1536. Image/audio/video/PDF bytes + caption. Never mix OpenAI vectors.',
  '["moviemode","media","video","audio","image","pdf","semantic_search"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry
SET binding_name = 'AGENTSAM_VECTORIZE_MEDIA',
    index_name = 'agentsam-moviemode-gemini2-1536',
    display_name = 'MovieMode media (Gemini 1536)',
    dimensions = 1536,
    metric = 'cosine',
    is_active = 1,
    description = 'Multimodal asset search — gemini-embedding-2 @1536. Image/audio/video/PDF bytes + caption. Never mix OpenAI vectors.',
    use_cases = '["moviemode","media","video","audio","image","pdf","semantic_search"]',
    updated_at = datetime('now')
WHERE id = 'vidx_agentsam_media';

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES (
  'ra_media_semantic_search_ws', 'media_semantic_search', 'auto', 'models/gemini-embedding-2', 'google', 'ws_inneranimalmedia',
  1.5, 1.0, 0.60, 1, 0, 1, 0, 0, 88, 0,
  '[]', 'recall', 'low', unixepoch(), unixepoch()
);
