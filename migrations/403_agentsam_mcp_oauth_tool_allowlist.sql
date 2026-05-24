-- 403: Curated MCP tools for external OAuth clients (Claude, ChatGPT, Cursor OAuth path).
-- Registry remains agentsam_mcp_tools; this table is the allowlist for client_id iam_mcp_inneranimalmedia.
-- MCP server filters tools/list + tools/call when token_type = oauth (see migration apply + Worker).

CREATE TABLE IF NOT EXISTS agentsam_mcp_oauth_tool_allowlist (
  client_id TEXT NOT NULL,
  tool_key TEXT NOT NULL,
  access_class TEXT NOT NULL DEFAULT 'read'
    CHECK (access_class IN ('read', 'write')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (client_id, tool_key)
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tool_allowlist_client_active
  ON agentsam_mcp_oauth_tool_allowlist (client_id, is_active, sort_order);

-- ── Read tools (safe for external discovery) ─────────────────────────────────
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, notes) VALUES
  ('iam_mcp_inneranimalmedia', 'd1_query', 'read', 10, 'SELECT on workspace D1'),
  ('iam_mcp_inneranimalmedia', 'd1_explain', 'read', 11, 'Explain query plans'),
  ('iam_mcp_inneranimalmedia', 'd1_schema_introspect', 'read', 12, 'Table/column metadata'),
  ('iam_mcp_inneranimalmedia', 'r2_read', 'read', 20, 'Read R2 object'),
  ('iam_mcp_inneranimalmedia', 'r2_list', 'read', 21, 'List R2 prefix'),
  ('iam_mcp_inneranimalmedia', 'r2_search', 'read', 22, 'Search R2 keys'),
  ('iam_mcp_inneranimalmedia', 'r2_bucket_summary', 'read', 23, 'Bucket stats'),
  ('iam_mcp_inneranimalmedia', 'github_repos', 'read', 30, 'List repos'),
  ('iam_mcp_inneranimalmedia', 'github_file', 'read', 31, 'Read file contents'),
  ('iam_mcp_inneranimalmedia', 'github_list_directory', 'read', 32, 'Directory listing'),
  ('iam_mcp_inneranimalmedia', 'github_get_tree', 'read', 33, 'Git tree'),
  ('iam_mcp_inneranimalmedia', 'github_list_issues', 'read', 34, 'Issues'),
  ('iam_mcp_inneranimalmedia', 'github_get_issue', 'read', 35, 'Single issue'),
  ('iam_mcp_inneranimalmedia', 'github_compare_refs', 'read', 36, 'Diff refs'),
  ('iam_mcp_inneranimalmedia', 'github_list_branches', 'read', 37, 'Branches'),
  ('iam_mcp_inneranimalmedia', 'web_fetch', 'read', 40, 'Fetch public URL (allowlist)'),
  ('iam_mcp_inneranimalmedia', 'knowledge_search', 'read', 50, 'RAG / knowledge'),
  ('iam_mcp_inneranimalmedia', 'rag_search', 'read', 51, 'Vector RAG search'),
  ('iam_mcp_inneranimalmedia', 'context_search', 'read', 52, 'Context index search'),
  ('iam_mcp_inneranimalmedia', 'agent_memory_search', 'read', 53, 'Semantic memory read'),
  ('iam_mcp_inneranimalmedia', 'agentsam_list_agents', 'read', 60, 'List agents'),
  ('iam_mcp_inneranimalmedia', 'agentsam_get_agent', 'read', 61, 'Agent metadata'),
  ('iam_mcp_inneranimalmedia', 'workspace_search', 'read', 62, 'Workspace search'),
  ('iam_mcp_inneranimalmedia', 'human_context_list', 'read', 63, 'Human context entries'),
  ('iam_mcp_inneranimalmedia', 'ai_embed', 'read', 70, 'Embeddings only');

-- ── Write tools (Sam / Connor — Claude & ChatGPT; no terminal, no d1_write) ───
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, notes) VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_run_agent', 'write', 100, 'Run Agent Sam (approval in registry)'),
  ('iam_mcp_inneranimalmedia', 'agentsam_plan_create', 'write', 101, 'Create plan'),
  ('iam_mcp_inneranimalmedia', 'agentsam_todo_create', 'write', 102, 'Create todo'),
  ('iam_mcp_inneranimalmedia', 'agentsam_todo_update', 'write', 103, 'Update todo'),
  ('iam_mcp_inneranimalmedia', 'agent_memory_write', 'write', 104, 'Write memory row'),
  ('iam_mcp_inneranimalmedia', 'github_create_file', 'write', 110, 'Create/update file in repo'),
  ('iam_mcp_inneranimalmedia', 'github_create_branch', 'write', 111, 'New branch'),
  ('iam_mcp_inneranimalmedia', 'github_create_pr', 'write', 112, 'Open PR'),
  ('iam_mcp_inneranimalmedia', 'r2_write', 'write', 120, 'Write R2 object'),
  ('iam_mcp_inneranimalmedia', 'ai_complete', 'write', 130, 'LLM completion');

-- Backfill OAuth workspace tokens so tools/call enforcement matches tools/list.
UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT tool_key
    FROM agentsam_mcp_oauth_tool_allowlist
    WHERE client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(is_active, 1) = 1
    ORDER BY sort_order ASC, tool_key ASC
  )
)
WHERE token_type = 'oauth'
  AND COALESCE(is_active, 1) = 1
  AND (allowed_tools IS NULL OR trim(allowed_tools) IN ('', '[]', 'null'));

CREATE INDEX IF NOT EXISTS idx_agentsam_mcp_tools_scope_list
  ON agentsam_mcp_tools (tool_key, workspace_id, tenant_id, user_id);
