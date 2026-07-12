-- Align IAM custom GitHub tools (agentsam_github_*, no mcp) with real handlers.
-- Official GitHub MCP passthrough remains agentsam_github_mcp_* (unchanged allowlists).
-- Removes hardcoded SamPrimeaux/inneranimalmedia schema defaults; fixes descriptions;
-- wires agent/ask/debug/multitask/github prompt routes to the working custom set.

-- ── agentsam_github_read: single-file Contents API (not list/search) ──────────
UPDATE agentsam_tools
SET
  description = 'READ ONLY — fetch one file from a repo via GitHub Contents API. Pass owner/repo + exact path. For directories use agentsam_github_tree; for many files use agentsam_github_read_many; for code search use agentsam_github_search.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"path":{"type":"string","description":"Exact file path in repo (no globs, no directories)"},"ref":{"type":"string","description":"Branch, tag, or commit SHA (default: main)"},"branch":{"type":"string","description":"Alias for ref"},"repo":{"type":"string","description":"owner/repo for the connected GitHub account"}},"required":["path","repo"]}',
  notes = 'IAM custom. handler_config.operation=get_file → github_get_file',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_read';

-- ── agentsam_github_read_many: batch exact paths only ─────────────────────────
UPDATE agentsam_tools
SET
  description = 'READ ONLY — fetch up to 20 exact file paths from a repo in one call. No globs, no directories (use agentsam_github_tree first). Prefer this over many agentsam_github_read calls.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"files":{"type":"array","description":"Exact paths (strings) or {path, ref} objects","items":{"oneOf":[{"type":"string"},{"type":"object","properties":{"path":{"type":"string"},"ref":{"type":"string"},"branch":{"type":"string"}},"required":["path"],"additionalProperties":false}]}},"paths":{"type":"array","description":"Alias for files","items":{"type":"string"}},"repo":{"type":"string","description":"owner/repo"},"ref":{"type":"string","description":"Default ref when a file omits its own"},"branch":{"type":"string","description":"Alias for ref"}},"required":["repo"]}',
  notes = 'IAM custom. operation=batch_read → github_batch_read. Accepts paths alias.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_read_many';

-- ── agentsam_github_repo_list: list repos only ────────────────────────────────
UPDATE agentsam_tools
SET
  description = 'READ ONLY — list repositories for the connected GitHub account (affiliation owner/collaborator/org). Not a file reader — use agentsam_github_read / tree / search for contents.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"type":{"type":"string","enum":["all","owner","public","private","member"],"default":"all"},"sort":{"type":"string","enum":["created","updated","pushed","full_name"],"default":"updated"},"limit":{"type":"integer","default":30,"description":"Max repos to return (max 100)"}},"required":[]}',
  notes = 'IAM custom. operation=list_repos → github_repos',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_repo_list';

-- ── agentsam_github_search: scoped code search ────────────────────────────────
UPDATE agentsam_tools
SET
  description = 'READ ONLY — GitHub code search scoped to one repo (repo:owner/name is applied). Rate-limited (~10/min). Prefer agentsam_github_tree for browsing.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"q":{"type":"string","description":"Search query (GitHub code search syntax; repo qualifier added if missing)"},"repo":{"type":"string","description":"owner/repo to scope the search"}},"required":["q","repo"]}',
  notes = 'IAM custom. operation=search_code → github_search_code',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_search';

-- ── agentsam_github_tree ──────────────────────────────────────────────────────
UPDATE agentsam_tools
SET
  description = 'READ ONLY — recursive file tree for a branch (Git Trees API). Use before reading files so paths are exact. branch defaults to main.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"repo":{"type":"string","description":"owner/repo"},"branch":{"type":"string","default":"main","description":"Branch name"},"ref":{"type":"string","description":"Alias for branch"},"recursive":{"type":"boolean","default":true}},"required":["repo"]}',
  notes = 'IAM custom. operation=get_tree → github_get_tree',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_tree';

-- ── agentsam_github_write ─────────────────────────────────────────────────────
UPDATE agentsam_tools
SET
  description = 'Single text-file create/update via GitHub Contents API. Omit sha for new files. Not for multi-file scaffolds — use terminal git.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"path":{"type":"string","description":"File path in repo"},"content":{"type":"string","description":"Full file content"},"message":{"type":"string","description":"Commit message"},"sha":{"type":"string","description":"Optional — from a prior read when updating"},"branch":{"type":"string","default":"main"},"repo":{"type":"string","description":"owner/repo"},"operation":{"type":"string","enum":["create","update","upsert"],"default":"upsert"}},"required":["path","content","message","repo"]}',
  notes = 'IAM custom. operation=upsert_file → github_upsert_file',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_write';

-- ── agentsam_github_patch (handler now implemented) ───────────────────────────
UPDATE agentsam_tools
SET
  description = 'Find/replace against a file live content in one call (read sha → splice → upsert). Fails if find is missing or not unique unless replace_all=true.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"path":{"type":"string"},"find":{"type":"string"},"replace":{"type":"string"},"replace_all":{"type":"boolean","default":false},"message":{"type":"string","description":"Commit message (default: patch: <path>)"},"branch":{"type":"string","default":"main"},"repo":{"type":"string","description":"owner/repo"}},"required":["path","find","replace","repo"]}',
  handler_config = '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","repo_field":"workspace.github_repo","operation":"patch_file"}',
  notes = 'IAM custom. operation=patch_file → github_patch_file',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_patch';

-- ── agentsam_github_pr / issue / list_commits ─────────────────────────────────
UPDATE agentsam_tools
SET
  description = 'Open a pull request after the branch is pushed (prefer terminal git push first).',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"title":{"type":"string"},"body":{"type":"string"},"head":{"type":"string","description":"Branch with changes"},"base":{"type":"string","default":"main"},"repo":{"type":"string","description":"owner/repo"},"draft":{"type":"boolean","default":false}},"required":["title","head","repo"]}',
  notes = 'IAM custom. operation=create_pr → github_create_pr',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_pr';

UPDATE agentsam_tools
SET
  description = 'Create/get/list/close GitHub issues. Set operation to create|get|list|close|update.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"operation":{"type":"string","enum":["create","get","list","close","update"],"default":"create"},"title":{"type":"string"},"body":{"type":"string"},"labels":{"type":"array","items":{"type":"string"}},"issue_number":{"type":"integer"},"state":{"type":"string","enum":["open","closed","all"],"default":"open"},"repo":{"type":"string","description":"owner/repo"}},"required":["operation","repo"]}',
  notes = 'IAM custom. operation from args → create/get/list/close/update issue handlers',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_issue';

UPDATE agentsam_tools
SET
  description = 'READ ONLY — list recent commits for a branch/ref (Commits API).',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"repo":{"type":"string","description":"owner/repo"},"sha":{"type":"string","description":"Branch, tag, or commit SHA"},"ref":{"type":"string"},"branch":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":30}},"required":["repo"]}',
  handler_config = '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","repo_field":"workspace.github_repo","operation":"list_commits"}',
  notes = 'IAM custom. operation=list_commits → github_list_commits',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_list_commits';

-- Tag official MCP surface for clarity (no allowlist change)
UPDATE agentsam_tools
SET
  notes = COALESCE(notes, '') || CASE
    WHEN notes IS NULL OR notes = '' THEN 'Official GitHub remote MCP passthrough (api.githubcopilot.com/mcp/). Not IAM Contents API.'
    WHEN notes LIKE '%Official GitHub remote MCP%' THEN ''
    ELSE ' | Official GitHub remote MCP passthrough.'
  END,
  updated_at = unixepoch()
WHERE tool_key LIKE 'agentsam_github_mcp_%';

-- ── Prompt routes: custom IAM github set (not mcp_*) ──────────────────────────
UPDATE agentsam_prompt_routes
SET
  tool_keys = '["agentsam_d1_query","agentsam_d1_write","agentsam_supabase_query","fs_read_file","fs_search_files","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_repo_list","agentsam_github_list_commits","agentsam_github_write","agentsam_github_patch","agentsam_github_pr","agentsam_github_issue","agentsam_terminal_local","agentsam_memory_search","agentsam_memory_save","search_web","web_fetch"]',
  max_tools = 16,
  updated_at = unixepoch()
WHERE route_key IN ('agent', 'multitask');

UPDATE agentsam_prompt_routes
SET
  tool_keys = '["agentsam_d1_query","agentsam_supabase_query","fs_read_file","fs_search_files","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_repo_list","agentsam_github_list_commits","agentsam_memory_search","search_web","web_fetch","knowledge_search"]',
  max_tools = 12,
  updated_at = unixepoch()
WHERE route_key = 'ask';

UPDATE agentsam_prompt_routes
SET
  tool_keys = '["agentsam_d1_query","agentsam_d1_write","fs_read_file","fs_search_files","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_repo_list","agentsam_github_list_commits","agentsam_terminal_local","agentsam_recent_errors","agentsam_health_check","search_web","web_fetch"]',
  max_tools = 12,
  updated_at = unixepoch()
WHERE route_key = 'debug';

UPDATE agentsam_prompt_routes
SET
  tool_keys = '["agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_repo_list","agentsam_github_list_commits","agentsam_github_write","agentsam_github_patch","agentsam_github_pr","agentsam_github_issue"]',
  max_tools = 10,
  updated_at = unixepoch()
WHERE route_key = 'github';

-- Ticket progress
UPDATE agentsam_tickets
SET
  status = 'active',
  status_reason = 'Aligned custom github handlers + empty-envelope gate + allowlist sync; awaiting E2E retest',
  updated_at = unixepoch()
WHERE id = 'tkt_github_read_many_empty_envelope';
