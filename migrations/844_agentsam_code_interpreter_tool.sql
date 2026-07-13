-- 844: agentsam_code_interpreter — ad-hoc Python crunch (second step after data tools).
-- Not a skill. Not repo engineering. Math/stats/plot on data already in the turn.
-- Handler: existing python_execute (PTY). Aliases: code_execution, code_interpreter, python_execute.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/844_agentsam_code_interpreter_tool.sql

INSERT OR REPLACE INTO agentsam_tools (
  id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  handler_type,
  handler_key,
  capability_key,
  description,
  input_schema,
  risk_level,
  requires_approval,
  requires_confirmation,
  is_active,
  is_global,
  oauth_visible,
  dispatch_target,
  sort_priority,
  notes,
  modes_json,
  created_at,
  updated_at
) VALUES (
  'ast_code_interpreter',
  'agentsam_code_interpreter',
  'agentsam_code_interpreter',
  'Code interpreter (Python crunch)',
  'terminal',
  'terminal',
  'python_execute',
  'python.execute',
  'Run short Python for math, stats, transforms, and plots on data ALREADY retrieved this turn (after agentsam_d1_query or fs_read_file). Second step only — never first tool for fetching data; never for repo edits, deploys, or shell (use fs_*/agentsam_github_*/agentsam_terminal_sandbox). In-app catalog mirror of provider sandboxes (Gemini code_execution / OpenAI code_interpreter): scratch Python, not your repo filesystem.',
  '{"type":"object","properties":{"script":{"type":"string","description":"Python source. Prefer one structured script. Inline D1/fs payloads as literals — this tool cannot see D1 or the repo by itself."},"pip_install":{"type":"array","items":{"type":"string"},"description":"Optional pip packages before run (e.g. pandas, numpy)."},"working_dir":{"type":"string","description":"Optional cwd on the exec host."},"timeout_seconds":{"type":"number","description":"Reserved; may be ignored by current exec backend."}},"required":["script"],"additionalProperties":false}',
  'low',
  0,
  0,
  1,
  1,
  0,
  'both',
  55,
  '844: data→crunch second step; aliases code_execution/code_interpreter/python_execute; no skill until chaining fails live',
  '["auto","agent","ask","debug","plan"]',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_tool_profiles
SET tool_keys_json = '["fs_read_file","fs_search_files","agentsam_github_read","agentsam_github_tree","agentsam_github_read_many","agentsam_github_search","agentsam_github_list_commits","agentsam_d1_query","agentsam_memory_manager","agentsam_autorag","agentsam_code_interpreter"]',
    max_tools = 12,
    notes = 'Phase 1 SSOT + 844 code_interpreter second-step crunch',
    updated_at = unixepoch()
WHERE profile_key = 'inspect' AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tool_profiles
SET tool_keys_json = '["agentsam_d1_query","agentsam_cf_d1_list","agentsam_memory_manager","agentsam_code_interpreter"]',
    max_tools = 6,
    notes = 'd1_query task_type + 844 code_interpreter after d1_query',
    updated_at = unixepoch()
WHERE profile_key = 'd1_read' AND COALESCE(is_active, 1) = 1;
