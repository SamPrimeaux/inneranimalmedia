-- 842: task_type → profile_key bindings (D1 SSOT) + apply write_policy path
-- New task_type support = INSERT row here — not a Worker deploy.
-- Apply: npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/842_tool_profile_task_bindings.sql

CREATE TABLE IF NOT EXISTS agentsam_tool_profile_bindings (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (task_type)
);

CREATE INDEX IF NOT EXISTS idx_atpb_task_active
  ON agentsam_tool_profile_bindings(task_type, is_active);

-- Inspect / read-only repo (incl. classifier labels that used to fall through to oauth_parity)
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (id, task_type, profile_key, priority, notes, updated_at) VALUES
  ('atpb_project_question', 'project_question', 'inspect', 10, 'repo Q&A', unixepoch()),
  ('atpb_readonly_repo_audit', 'readonly_repo_audit', 'inspect', 10, NULL, unixepoch()),
  ('atpb_summary', 'summary', 'inspect', 20, NULL, unixepoch()),
  ('atpb_research', 'research', 'inspect', 20, NULL, unixepoch()),
  ('atpb_review', 'review', 'inspect', 20, NULL, unixepoch()),
  ('atpb_github', 'github', 'inspect', 10, 'classifier github → inspect, never oauth dump', unixepoch()),
  ('atpb_browser', 'browser', 'inspect', 10, 'classifier browser mislabel → inspect until browser profile exists', unixepoch()),
  ('atpb_git', 'git', 'inspect', 10, NULL, unixepoch()),
  ('atpb_search_code', 'search_code', 'inspect', 15, NULL, unixepoch()),
  ('atpb_vectorize', 'vectorize', 'inspect', 15, NULL, unixepoch()),
  ('atpb_plan', 'plan', 'inspect', 20, NULL, unixepoch());

-- Ask / chat
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (id, task_type, profile_key, priority, notes, updated_at) VALUES
  ('atpb_ask', 'ask', 'ask', 10, NULL, unixepoch()),
  ('atpb_chat', 'chat', 'ask', 20, NULL, unixepoch()),
  ('atpb_simple_ask', 'simple_ask_greeting', 'ask', 10, NULL, unixepoch()),
  ('atpb_project_qna', 'project_qna_fast', 'ask', 10, NULL, unixepoch());

-- Code develop
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (id, task_type, profile_key, priority, notes, updated_at) VALUES
  ('atpb_code', 'code', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_code_impl', 'code_implementation', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_implementation', 'implementation', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_feature', 'feature', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_refactor', 'refactor', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_cms_edit', 'cms_edit', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_tool_use', 'tool_use', 'code_develop', 20, NULL, unixepoch()),
  ('atpb_debug', 'debug', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_terminal', 'terminal_execution', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_deploy', 'deploy', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_d1_write', 'd1_write', 'code_develop', 10, NULL, unixepoch()),
  ('atpb_sql_d1', 'sql_d1_generation', 'code_develop', 10, NULL, unixepoch());

-- D1 read
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (id, task_type, profile_key, priority, notes, updated_at) VALUES
  ('atpb_d1_query', 'd1_query', 'd1_read', 10, NULL, unixepoch());

-- Mail
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (id, task_type, profile_key, priority, notes, updated_at) VALUES
  ('atpb_mail_triage', 'mail_triage', 'mail', 10, NULL, unixepoch()),
  ('atpb_gmail', 'gmail', 'mail', 10, NULL, unixepoch());

-- Enrich inspect pins for commit audits (D1 edit, no JS)
UPDATE agentsam_tool_profiles
SET tool_keys_json = '["fs_read_file","fs_search_files","agentsam_github_read","agentsam_github_tree","agentsam_github_read_many","agentsam_github_search","agentsam_github_list_commits","agentsam_d1_query","agentsam_memory_manager","agentsam_autorag"]',
    max_tools = 12,
    updated_at = unixepoch()
WHERE profile_key = 'inspect';

-- Fix d1_read pins to live catalog keys only (gate G-tool-profiles)
UPDATE agentsam_tool_profiles
SET tool_keys_json = '["agentsam_d1_query","agentsam_cf_d1_list","agentsam_memory_manager"]',
    updated_at = unixepoch()
WHERE profile_key = 'd1_read';
