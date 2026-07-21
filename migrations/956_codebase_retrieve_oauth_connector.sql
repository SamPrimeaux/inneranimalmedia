-- 956: Expose agentsam_codebase_retrieve on MCP OAuth + ChatGPT/Claude connector allowlist.
-- Cursor/full OAuth list: oauth_visible=1.
-- ChatGPT/Claude curated surface: expose_on_connector=1 on iam_mcp_inneranimalmedia.
-- Execution: MCP → IAM_MAIN POST /api/internal/codebase/retrieve (not local agent module).

UPDATE agentsam_tools
SET
  is_active = 1,
  oauth_visible = 1,
  handler_type = 'agent',
  handler_key = 'agentsam_codebase_retrieve',
  dispatch_target = 'internal',
  sort_priority = 22,
  description = 'Graph RAG over the IAM codebase: symbol ANN (pgvector) → D1 dependency expand → chunk hydrate by node_id. Prefer before code edits. Routes to main worker via IAM_MAIN.',
  display_name = 'Codebase AST Retrieve',
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.module', 'codebase-ast-retrieve',
    '$.export', 'retrieveCodebaseAstContext',
    '$.operation', 'codebase_ast_retrieve',
    '$.route', 'iam_main'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_codebase_retrieve';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 22,
  access_class = 'read',
  runtime_contract_key = 'agentsam_codebase_retrieve',
  notes = 'AST Graph RAG retrieve via IAM_MAIN',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_codebase_retrieve';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id,
  tool_key,
  is_active,
  expose_on_connector,
  connector_priority,
  access_class,
  runtime_contract_key,
  notes,
  updated_at
)
SELECT
  'iam_mcp_inneranimalmedia',
  'agentsam_codebase_retrieve',
  1,
  1,
  22,
  'read',
  'agentsam_codebase_retrieve',
  'AST Graph RAG retrieve via IAM_MAIN',
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia'
    AND tool_key = 'agentsam_codebase_retrieve'
);
