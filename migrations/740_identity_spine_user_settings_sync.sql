-- 740: Align user_settings.default_workspace_id with auth_users.active_workspace_id (identity SSOT).
-- Stale default_workspace_id was overriding client cache and confusing workspace switchers.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/740_identity_spine_user_settings_sync.sql

UPDATE user_settings
SET default_workspace_id = (
      SELECT trim(COALESCE(au.active_workspace_id, ''))
      FROM auth_users au
      WHERE au.id = user_settings.user_id
        AND trim(COALESCE(au.active_workspace_id, '')) != ''
      LIMIT 1
    ),
    updated_at = unixepoch()
WHERE EXISTS (
  SELECT 1
  FROM auth_users au
  WHERE au.id = user_settings.user_id
    AND trim(COALESCE(au.active_workspace_id, '')) != ''
    AND trim(COALESCE(au.active_workspace_id, '')) != trim(COALESCE(user_settings.default_workspace_id, ''))
);

-- Operator lane: force platform workspace when active is already IAM.
UPDATE user_settings
SET default_workspace_id = 'ws_inneranimalmedia',
    updated_at = unixepoch()
WHERE user_id IN (
  'au_871d920d1233cbd1',
  'au_8a5b76b737a9f14c',
  'au_cccac6ec2360ac75',
  'au_cd1d8f5ccce9e15a',
  'au_32844a43aecdea33'
)
AND trim(COALESCE(default_workspace_id, '')) != 'ws_inneranimalmedia';

UPDATE auth_sessions
SET workspace_id = 'ws_inneranimalmedia',
    last_active_at = CAST(unixepoch() * 1000 AS INTEGER)
WHERE user_id IN (
  'au_871d920d1233cbd1',
  'au_8a5b76b737a9f14c',
  'au_cccac6ec2360ac75',
  'au_cd1d8f5ccce9e15a',
  'au_32844a43aecdea33'
)
AND trim(COALESCE(workspace_id, '')) = 'ws_pelicanpeptides';
