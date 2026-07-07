-- 790: OAuth allowlist for official Gmail MCP tools (iam_mcp_inneranimalmedia).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/790_gmail_mcp_oauth_allowlist.sql

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, is_active) VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_search_threads', 'read', 201, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_get_thread', 'read', 202, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_list_drafts', 'read', 203, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_list_labels', 'read', 204, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_create_draft', 'write', 205, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_label_thread', 'write', 206, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_unlabel_thread', 'write', 207, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_label_message', 'write', 208, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_unlabel_message', 'write', 209, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_create_label', 'write', 210, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_apply_sensitive_thread_label', 'write', 211, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gmail_mcp_apply_sensitive_message_label', 'write', 212, 1);

UPDATE agentsam_tools
SET dispatch_target = 'both',
    updated_at = unixepoch()
WHERE tool_key LIKE 'agentsam_gmail_mcp_%'
  AND COALESCE(oauth_visible, 0) = 1
  AND COALESCE(dispatch_target, 'internal') = 'internal';
