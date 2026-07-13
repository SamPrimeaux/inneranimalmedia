-- 858: Mail lane SSOT — expanded profiles, compose/sweep bindings, gmail classifier keywords.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/858_mail_tool_profiles_lane.sql

-- ── Shared tool pins ─────────────────────────────────────────────────────────
-- mail / mail_triage: inbox triage + label ops
-- mail_compose: drafts + send
-- mail_sweep: bulk search + label/sensitive sweep

INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES
(
  'atprof_mail',
  'mail',
  'Mail (gmail classifier)',
  '["gmail_list_inbox","gmail_get_message","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread","agentsam_gmail_mcp_list_labels","agentsam_gmail_mcp_label_message","agentsam_gmail_mcp_unlabel_message"]',
  12,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_postgres_write":false}',
  'General gmail task_type — inbox read/triage + label ops',
  1,
  40,
  unixepoch()
),
(
  'atprof_mail_triage',
  'mail_triage',
  'Mail Triage',
  '["gmail_list_inbox","gmail_get_message","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread","agentsam_gmail_mcp_list_labels","agentsam_gmail_mcp_label_message","agentsam_gmail_mcp_unlabel_message"]',
  12,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_postgres_write":false}',
  'Collaborate Mail surface — pinned mail_triage route/task_type',
  1,
  41,
  unixepoch()
),
(
  'atprof_mail_compose',
  'mail_compose',
  'Mail Compose',
  '["gmail_send","agentsam_gmail_mcp_create_draft","agentsam_gmail_mcp_list_drafts","agentsam_gmail_mcp_get_thread"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_postgres_write":false}',
  'Draft replies and new mail — matches subagent slug mail_compose',
  1,
  42,
  unixepoch()
),
(
  'atprof_mail_sweep',
  'mail_sweep',
  'Mail Sweep',
  '["agentsam_gmail_mcp_search_threads","gmail_modify_message","agentsam_gmail_mcp_label_thread","agentsam_gmail_mcp_unlabel_thread","agentsam_gmail_mcp_apply_sensitive_thread_label"]',
  10,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_postgres_write":false}',
  'Bulk inbox cleanup — matches subagent slug mail_sweep',
  1,
  43,
  unixepoch()
);

-- ── task_type → profile bindings ─────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (id, task_type, profile_key, priority, notes, updated_at) VALUES
('atpb_gmail', 'gmail', 'mail', 10, 'Classifier gmail intent', unixepoch()),
('atpb_mail_triage', 'mail_triage', 'mail_triage', 10, 'Mail surface route pin', unixepoch()),
('atpb_mail_compose', 'mail_compose', 'mail_compose', 10, 'Draft/reply lane', unixepoch()),
('atpb_mail_sweep', 'mail_sweep', 'mail_sweep', 10, 'Bulk sweep lane', unixepoch());

-- ── chat_intent_* keywords (classifier Layer 1 — requires JS priority deploy) ─
INSERT OR IGNORE INTO agentsam_classification_keywords (id, purpose, pattern, label, active, notes) VALUES
('ck_ci_mc_1', 'chat_intent_mail_compose', 'reply to this email', 'agent', 1, 'mail compose lane'),
('ck_ci_mc_2', 'chat_intent_mail_compose', 'draft a reply', 'agent', 1, 'mail compose lane'),
('ck_ci_mc_3', 'chat_intent_mail_compose', 'draft a new email', 'agent', 1, 'mail compose lane'),
('ck_ci_mc_4', 'chat_intent_mail_compose', 'compose email', 'agent', 1, 'mail compose lane'),
('ck_ci_ms_1', 'chat_intent_mail_sweep', 'sweep my inbox', 'agent', 1, 'mail sweep lane'),
('ck_ci_ms_2', 'chat_intent_mail_sweep', 'bulk classify inbox', 'agent', 1, 'mail sweep lane'),
('ck_ci_gm_1', 'chat_intent_gmail', 'check my inbox', 'agent', 1, 'gmail classifier'),
('ck_ci_gm_2', 'chat_intent_gmail', 'check my email', 'agent', 1, 'gmail classifier'),
('ck_ci_gm_3', 'chat_intent_gmail', 'unread emails', 'agent', 1, 'gmail classifier'),
('ck_ci_gm_4', 'chat_intent_gmail', 'my inbox', 'agent', 1, 'gmail classifier'),
('ck_ci_gm_5', 'chat_intent_gmail', 'triage my inbox', 'agent', 1, 'gmail classifier');

-- Expand mail_triage prompt route tool pins (route compile path)
UPDATE agentsam_prompt_routes
SET
  tool_keys = '["gmail_list_inbox","gmail_get_message","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread","agentsam_gmail_mcp_list_labels","agentsam_gmail_mcp_label_message","agentsam_gmail_mcp_unlabel_message"]',
  max_tools = 12,
  is_active = 1,
  updated_at = unixepoch()
WHERE route_key = 'mail_triage' AND tenant_id IS NULL;
