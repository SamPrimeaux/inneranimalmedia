-- 1019: Phone-loop sender allowlist is D1-driven (auth_user_emails + platform_operator).
-- No hardcoded email lists in Worker code.
-- meauxbility@gmail.com → auth_user_emails → au_cccac6ec2360ac75 (platform_operator=1).

UPDATE agentsam_hook
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.allowlist_source', 'auth_user_emails+agentsam_user_policy.platform_operator',
      '$.allowlist_note', 'D1: login-enabled auth_user_emails whose user has platform_operator=1; plus resend_emails can_receive inbox'
    ),
    metadata = json_set(
      COALESCE(metadata, '{}'),
      '$.allowlist', 'd1_platform_operator_emails'
    ),
    updated_at = datetime('now')
WHERE id = 'hook_email_reply_log';

UPDATE agentsam_user_policy
SET platform_operator = 1,
    updated_at = datetime('now')
WHERE user_id = 'au_cccac6ec2360ac75'
  AND workspace_id = 'ws_inneranimalmedia'
  AND COALESCE(platform_operator, 0) = 0;
