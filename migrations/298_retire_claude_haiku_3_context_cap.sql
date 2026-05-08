-- 298: Retire Claude Haiku 3 model ids in agentsam_ai; cap Sonnet 4.x context_max_tokens to 200k (GA limit after context-1m beta retirement).
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/298_retire_claude_haiku_3_context_cap.sql
--
-- Haiku 4.5 may already exist on uix_agentsam_ai_provider_model_key; delete obsolete Haiku 3 rows first, then repoint any stragglers.

DELETE FROM agentsam_ai
WHERE rowid IN (
  SELECT obsolete.rowid
  FROM agentsam_ai AS obsolete
  WHERE obsolete.model_key IN ('claude-haiku-3', 'claude-3-haiku-20240307')
    AND EXISTS (
      SELECT 1
      FROM agentsam_ai AS canonical
      WHERE canonical.model_key = 'claude-haiku-4-5-20251001'
        AND COALESCE(canonical.provider, '') = COALESCE(obsolete.provider, '')
    )
);

UPDATE agentsam_ai
SET
  model_key = 'claude-haiku-4-5-20251001',
  updated_at = unixepoch()
WHERE model_key IN ('claude-haiku-3', 'claude-3-haiku-20240307');

UPDATE agentsam_ai
SET
  context_max_tokens = 200000,
  updated_at = unixepoch()
WHERE provider = 'anthropic'
  AND mode = 'model'
  AND model_key LIKE 'claude-sonnet-4%'
  AND (context_max_tokens IS NULL OR context_max_tokens > 200000);
