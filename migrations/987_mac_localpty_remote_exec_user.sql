-- Mac localpty ExecOS requires X-IAM-Exec-Identity === OS login.
-- Missing remote_exec_user omitted the header → 403 → sandbox fallback.
UPDATE terminal_connections
SET
  remote_exec_user = 'samprimeaux',
  username = COALESCE(NULLIF(TRIM(username), ''), 'samprimeaux'),
  updated_at = unixepoch()
WHERE target_type = 'user_hosted_tunnel'
  AND lower(COALESCE(platform, '')) IN ('macos', 'darwin')
  AND is_active = 1
  AND (remote_exec_user IS NULL OR TRIM(remote_exec_user) = '');
