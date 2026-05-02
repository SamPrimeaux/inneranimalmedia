-- User intake + onboarding step tracking (Connor / external intake pipeline).
-- Run: PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/236_user_intake_profiles.sql

CREATE TABLE IF NOT EXISTS user_intake_profiles (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  skill_level TEXT CHECK(skill_level IN ('beginner','intermediate','advanced','expert')),
  current_stack TEXT,
  favorite_tools TEXT,
  favorite_ai TEXT,
  favorite_platforms TEXT,
  aspirations TEXT,
  goals_json TEXT,
  published_work_json TEXT,
  github_username TEXT,
  portfolio_url TEXT,
  communication_pref TEXT DEFAULT 'email',
  timezone TEXT DEFAULT 'America/Chicago',
  intake_completed INTEGER DEFAULT 0,
  intake_completed_at INTEGER,
  intake_token TEXT UNIQUE,
  intake_token_expires_at INTEGER,
  agent_profile_built INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_uip_auth_user ON user_intake_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_uip_token ON user_intake_profiles(intake_token);

-- Per-user onboarding steps (separate from legacy `onboarding_state` LMS table).
CREATE TABLE IF NOT EXISTS iam_user_onboarding_step (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  data_json TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(tenant_id, user_id, step)
);

CREATE INDEX IF NOT EXISTS idx_iam_uos_tenant_user ON iam_user_onboarding_step(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_iam_uos_step ON iam_user_onboarding_step(step);
