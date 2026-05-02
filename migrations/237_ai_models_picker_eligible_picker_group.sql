-- 237: DB-driven agent model picker — picker_eligible + picker_group on ai_models.
-- Removes reliance on hardcoded api_platform / size_class lists in GET /api/agent/models.
--
-- Apply remote (example):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/237_ai_models_picker_eligible_picker_group.sql

ALTER TABLE ai_models ADD COLUMN picker_eligible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ai_models ADD COLUMN picker_group TEXT;

-- Section header for grouped pickers (Settings UI shows this verbatim; seed from provider).
UPDATE ai_models
SET picker_group = COALESCE(NULLIF(TRIM(picker_group), ''), NULLIF(TRIM(provider), ''), 'Other')
WHERE picker_group IS NULL OR TRIM(picker_group) = '';

-- Non-chat catalog rows stay out of customer pickers unless you set picker_eligible = 1 explicitly.
UPDATE ai_models
SET picker_eligible = 0
WHERE LOWER(COALESCE(size_class, '')) IN ('image', 'audio', 'embedding');
