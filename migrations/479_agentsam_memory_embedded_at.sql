-- 479: Track D1 → agentsam_memory_oai3large_1536 vector sync on agentsam_memory.
-- Apply D1:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/479_agentsam_memory_embedded_at.sql

ALTER TABLE agentsam_memory ADD COLUMN embedded_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_embed_pending
  ON agentsam_memory(workspace_id, updated_at DESC)
  WHERE is_archived = 0 AND embedded_at IS NULL;
