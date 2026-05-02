-- User workspace settings: Brand, Plans, Budget, Time per workspace slot (Sam Primeaux, InnerAnimal, Meauxbility, InnerAutodidact).
-- Database: inneranimalmedia-business (D1)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/141_user_workspace_settings.sql

CREATE TABLE IF NOT EXISTS user_workspace_settings (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand TEXT,
  plans TEXT,
  budget TEXT,
  time TEXT,
  updated_at INTEGER,
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_user_workspace_settings_user ON user_workspace_settings (user_id);
