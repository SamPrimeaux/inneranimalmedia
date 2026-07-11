-- 813: Image Thompson — unpause gpt-image-2; draft cost/tier; user thumbs feedback.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/813_image_thompson_feedback_cost_tier.sql

-- Third lane back in the live Thompson pool
UPDATE agentsam_routing_arms
SET is_paused = 0,
    pause_reason = NULL,
    updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND task_type = 'image_generation'
  AND model_key = 'gpt-image-2'
  AND is_paused = 1;

UPDATE agentsam_routing_arms
SET is_paused = 0,
    pause_reason = NULL,
    updated_at = unixepoch()
WHERE id IN ('ra_img_openai_gpt2_ws', 'ra_7d90fdbf31ab3c7b')
  AND is_paused = 1;

-- Generation-time attributes for cost + content-type learning
ALTER TABLE image_generation_drafts ADD COLUMN content_tier TEXT;
ALTER TABLE image_generation_drafts ADD COLUMN cost_usd REAL;
ALTER TABLE image_generation_drafts ADD COLUMN routing_arm_id TEXT;
ALTER TABLE image_generation_drafts ADD COLUMN user_rating INTEGER;
ALTER TABLE image_generation_drafts ADD COLUMN rated_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_image_generation_drafts_tier_model
  ON image_generation_drafts(content_tier, model, created_at);

-- Append-only thumbs trail (one row per rating event; draft.user_rating holds latest)
CREATE TABLE IF NOT EXISTS image_generation_feedback (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  rating INTEGER NOT NULL,
  content_tier TEXT,
  model_key TEXT,
  provider TEXT,
  routing_arm_id TEXT,
  cost_usd REAL,
  created_at INTEGER NOT NULL,
  CHECK (rating IN (-1, 1))
);

CREATE INDEX IF NOT EXISTS idx_image_generation_feedback_gen
  ON image_generation_feedback(generation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_image_generation_feedback_tier
  ON image_generation_feedback(content_tier, model_key, created_at);
