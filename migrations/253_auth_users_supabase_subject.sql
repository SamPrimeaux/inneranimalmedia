-- OAuth: resolve IAM login by Supabase JWT `sub` (see handleSupabaseOAuthCallback).
-- Run on prod D1 when deploying auth callback fix.

ALTER TABLE auth_users ADD COLUMN supabase_user_id TEXT;
ALTER TABLE auth_users ADD COLUMN status TEXT DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_supabase_user_id
  ON auth_users(supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;
