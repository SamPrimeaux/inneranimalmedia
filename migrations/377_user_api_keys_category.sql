-- Unified keys: provider vs personal vs internal (Security + API Keys consolidation)
ALTER TABLE user_api_keys ADD COLUMN category TEXT NOT NULL DEFAULT 'provider'
  CHECK (category IN ('provider', 'personal', 'internal'));

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_category
  ON user_api_keys(user_id, category, is_active);
