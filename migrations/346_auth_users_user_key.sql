ALTER TABLE auth_users ADD COLUMN user_key TEXT;
ALTER TABLE auth_users ADD COLUMN default_workspace_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_user_key ON auth_users(user_key) WHERE user_key IS NOT NULL;
