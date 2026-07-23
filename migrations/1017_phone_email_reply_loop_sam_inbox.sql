-- 1017: Phone-email Agent loop — enable sam@ inbound + fix email_reply hook.
-- Inbox: sam@inneranimalmedia.com (rse_sam_iam) only — do NOT mint agent@.
-- Agent turns run as au_871d920d1233cbd1 (info@inneranimals.com login); mail lands on sam@.

UPDATE resend_emails
SET can_receive = 1,
    updated_at = unixepoch()
WHERE id = 'rse_sam_iam'
  AND lower(trim(address)) = 'sam@inneranimalmedia.com';

UPDATE agentsam_hook
SET provider = 'resend',
    external_id = NULL,
    handler_type = 'agent_turn',
    target_id = 'ws_inneranimalmedia',
    user_id = 'au_871d920d1233cbd1',
    workspace_id = 'ws_inneranimalmedia',
    command = 'agent:email_reply',
    handler_config = json_object(
      'handler', 'email_agent_bridge',
      'workspace_id', 'ws_inneranimalmedia',
      'user_id', 'au_871d920d1233cbd1',
      'inbox', 'sam@inneranimalmedia.com',
      'allowlist_note', 'resolved in code — not external_id'
    ),
    metadata = json_object(
      'purpose', 'Inbound reply on sam@ → Agent Sam turn (phone IDE loop)',
      'risk_level', 'high',
      'category', 'inbound_message'
    ),
    updated_at = datetime('now')
WHERE id = 'hook_email_reply_log';
