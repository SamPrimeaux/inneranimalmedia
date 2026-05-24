-- =============================================================================
-- 300_accounts_invited_backfill.sql — invited auth_users → accounts (status=pending)
-- =============================================================================
-- Apply via: ./scripts/apply_migration_300_accounts_invited_backfill.sh
-- =============================================================================

INSERT OR IGNORE INTO accounts (
  id, type, email, display_name, password_hash, status, plan, timezone,
  meta_json, created_at, updated_at
)
SELECT
  au.id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = au.id AND wm.member_type = 'agent' LIMIT 1
    ) THEN 'agent'
    ELSE 'human'
  END,
  au.email,
  COALESCE(NULLIF(TRIM(au.display_name), ''), NULLIF(TRIM(au.name), ''), au.email),
  COALESCE(au.password_hash, 'oauth'),
  CASE
    WHEN LOWER(COALESCE(TRIM(au.status), '')) = 'invited' THEN 'pending'
    WHEN LOWER(COALESCE(TRIM(au.status), '')) IN ('active', 'suspended', 'deleted') THEN LOWER(TRIM(au.status))
    ELSE 'pending'
  END,
  'free',
  COALESCE(NULLIF(TRIM(au.timezone), ''), 'America/Chicago'),
  '{}',
  unixepoch(COALESCE(au.created_at, datetime('now'))),
  unixepoch(COALESCE(au.updated_at, datetime('now')))
FROM auth_users au
LEFT JOIN accounts a ON a.id = au.id
WHERE a.id IS NULL;
