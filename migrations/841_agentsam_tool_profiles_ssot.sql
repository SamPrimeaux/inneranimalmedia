-- 841: D1-owned tool profiles — Phase 1 ROUTING-TOOL-SSOT
-- SSOT for pinned tool sets; JS *-tool-profile.js modules are cold-start fallback only.
-- Apply: npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/841_agentsam_tool_profiles_ssot.sql

CREATE TABLE IF NOT EXISTS agentsam_tool_profiles (
  id TEXT PRIMARY KEY,
  profile_key TEXT NOT NULL UNIQUE,
  display_name TEXT,
  tool_keys_json TEXT NOT NULL DEFAULT '[]',
  max_tools INTEGER DEFAULT 12,
  default_deny_oauth INTEGER NOT NULL DEFAULT 1,
  write_policy_json TEXT DEFAULT '{}',
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 50,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_profiles_active
  ON agentsam_tool_profiles(is_active, sort_order);

-- inspect — read-only repo + D1 evidence (replaces inspect-tool-profile.js hot path)
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_inspect',
  'inspect',
  'Inspect / project question (read-only)',
  '["fs_read_file","fs_search_files","agentsam_github_read","agentsam_github_tree","agentsam_github_read_many","agentsam_github_search","agentsam_d1_query","agentsam_memory_manager","agentsam_autorag"]',
  12,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false}',
  'Phase 1 SSOT — project_question, repo inspect asks; never oauth dump',
  1,
  10,
  unixepoch()
);

-- code_develop — repo mutation + PTY
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_code_develop',
  'code_develop',
  'Code develop / terminal / write',
  '["fs_read_file","fs_write_file","fs_search_files","fs_edit_file","agentsam_terminal_sandbox","agentsam_d1_query","agentsam_memory_manager","agentsam_github_read","agentsam_github_tree","agentsam_github_read_many","agentsam_github_patch","agentsam_github_search","agentsam_github_write","pty_git_status"]',
  20,
  1,
  '{"can_edit_files":true,"can_terminal":true,"can_d1_write":false,"can_deploy":true}',
  'Phase 1 SSOT — code/terminal/deploy tasks',
  1,
  20,
  unixepoch()
);

-- ask — minimal read evidence
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_ask',
  'ask',
  'Ask mode read evidence',
  '["fs_read_file","fs_search_files","agentsam_github_read","agentsam_d1_query","agentsam_memory_manager","agentsam_autorag"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false}',
  'Ask lane — read-only grounding',
  1,
  30,
  unixepoch()
);

-- d1_read — D1 schema/table questions
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_d1_read',
  'd1_read',
  'D1 read / schema discovery',
  '["agentsam_d1_query","agentsam_cf_d1_list","agentsam_memory_manager"]',
  6,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false}',
  'd1_query task_type — must invoke agentsam_d1_query',
  1,
  35,
  unixepoch()
);

-- mail — triage surface (narrow; gmail schemas stay off general agent path)
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_mail',
  'mail',
  'Mail triage',
  '["gmail_list_inbox","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread"]',
  8,
  1,
  '{}',
  'mail_triage route only — not general agent fallback',
  1,
  40,
  unixepoch()
);

-- default_route — route-scoped compile when no TaskSpec profile (NOT oauth dump)
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_default_route',
  'default_route',
  'Default route-scoped (deny oauth dump)',
  '[]',
  16,
  1,
  '{}',
  'Empty tool_keys → compile via agentsam_route_requirements only',
  1,
  90,
  unixepoch()
);
