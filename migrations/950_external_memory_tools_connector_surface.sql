-- 950: External MCP memory discovery + connector routing
-- Expose canonical commit/save/search; demote legacy manager as compatibility-only;
-- Prefer connector allowlist surface for ChatGPT/Claude (wired in mcp-tools-discovery.js).

-- Catalog: oauth_visible + descriptions + schemas
UPDATE agentsam_tools
   SET oauth_visible = 1,
       is_active = 1,
       handler_type = 'memory',
       sort_priority = 12,
       description = 'Canonical Agent Sam memory commit (D1 SSOT + projection outbox). Returns memory_id, revision, content_hash, semantic_ready, and projection receipts. Use dry_run to validate. Prefer this over agentsam_memory_manager.',
       display_name = 'Memory Commit',
       input_schema = '{"type":"object","additionalProperties":false,"properties":{"raw_text":{"type":"string"},"memory_type":{"type":"string","enum":["fact","preference","decision","policy","state","procedure","event","error"]},"memory_key":{"type":"string"},"title":{"type":"string"},"content":{"type":"string"},"summary":{"type":"string"},"importance":{"type":"integer","minimum":1,"maximum":10},"is_pinned":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}},"sensitivity":{"type":"string","enum":["normal","internal","confidential","secret"]},"scope_type":{"type":"string","enum":["user","workspace","platform","tenant"]},"scope_id":{"type":"string"},"active_project_workspace_key":{"type":"string","description":"Semantic ws_* project — never ws_inneranimalmedia_mcp"},"workspace_id":{"type":"string"},"source_client":{"type":"string"},"dry_run":{"type":"boolean"},"eager":{"type":"boolean","default":true},"idempotency_key":{"type":"string"}},"anyOf":[{"required":["raw_text"]},{"required":["content"]},{"required":["memory_key","content"]}]}',
       handler_config = json_set(COALESCE(handler_config,'{}'), '$.operation', 'memory.commit', '$.route', 'iam_main', '$.pipeline_version', 'agentsam_memory_v1'),
       updated_at = unixepoch()
 WHERE tool_key = 'agentsam_memory_commit';

UPDATE agentsam_tools
   SET oauth_visible = 1,
       is_active = 1,
       handler_type = 'memory',
       sort_priority = 13,
       description = 'Hybrid semantic memory search via IAM_MAIN (exact → Vectorize → pgvector → lexical → D1 hydrate). Returns memory_id/revision/content_hash and suppresses low-score noise. Prefer this for recall.',
       display_name = 'Memory Search',
       input_schema = '{"type":"object","additionalProperties":false,"properties":{"query":{"type":"string"},"memory_key":{"type":"string"},"top_k":{"type":"integer","default":5,"maximum":20},"limit":{"type":"integer","maximum":20},"memory_type":{"type":"string"},"active_project_workspace_key":{"type":"string"},"min_semantic_score":{"type":"number"}}}',
       handler_config = json_set(COALESCE(handler_config,'{}'), '$.operation', 'memory_search', '$.route', 'iam_main', '$.pipeline_version', 'agentsam_memory_v1'),
       updated_at = unixepoch()
 WHERE tool_key = 'agentsam_memory_search';

UPDATE agentsam_tools
   SET oauth_visible = 1,
       is_active = 1,
       handler_type = 'memory',
       sort_priority = 14,
       description = 'Canonical memory save (same commit path as agentsam_memory_commit with eager=false). Still enqueues outbox; projections retry on hourly cron.',
       display_name = 'Memory Save',
       handler_config = json_set(COALESCE(handler_config,'{}'), '$.operation', 'memory.commit', '$.eager_default', json('false'), '$.route', 'iam_main', '$.pipeline_version', 'agentsam_memory_v1'),
       updated_at = unixepoch()
 WHERE tool_key = 'agentsam_memory_save';

UPDATE agentsam_tools
   SET description = 'COMPATIBILITY adapter only. Prefer agentsam_memory_commit / agentsam_memory_search. Operations search|write|upsert|list|delete route through IAM_MAIN canonical hybrid/commit — not the legacy standalone Supabase vector lane.',
       display_name = 'Memory Manager (compat)',
       sort_priority = 90,
       handler_config = json_set(COALESCE(handler_config,'{}'), '$.route', 'iam_main', '$.pipeline_version', 'agentsam_memory_v1', '$.compatibility', json('true')),
       updated_at = unixepoch()
 WHERE tool_key = 'agentsam_memory_manager';

-- Connector allowlist: ensure commit/save/search are exposed early; demote manager
UPDATE agentsam_mcp_oauth_tool_allowlist
   SET is_active = 1,
       expose_on_connector = 1,
       connector_priority = 12,
       access_class = 'write',
       runtime_contract_key = 'agentsam_memory_commit'
 WHERE tool_key = 'agentsam_memory_commit'
   AND client_id = 'iam_mcp_inneranimalmedia';

UPDATE agentsam_mcp_oauth_tool_allowlist
   SET is_active = 1,
       expose_on_connector = 1,
       connector_priority = 13,
       access_class = 'read',
       runtime_contract_key = 'agentsam_memory_search'
 WHERE tool_key = 'agentsam_memory_search'
   AND client_id = 'iam_mcp_inneranimalmedia';

UPDATE agentsam_mcp_oauth_tool_allowlist
   SET is_active = 1,
       expose_on_connector = 1,
       connector_priority = 14,
       access_class = 'write',
       runtime_contract_key = 'agentsam_memory_save'
 WHERE tool_key = 'agentsam_memory_save'
   AND client_id = 'iam_mcp_inneranimalmedia';

-- Keep manager discoverable but late / optional for connectors still calling it
UPDATE agentsam_mcp_oauth_tool_allowlist
   SET is_active = 1,
       expose_on_connector = 1,
       connector_priority = 35,
       access_class = 'write',
       runtime_contract_key = 'agentsam_memory_manager'
 WHERE tool_key = 'agentsam_memory_manager'
   AND client_id = 'iam_mcp_inneranimalmedia';

-- Insert allowlist rows if missing (idempotent via NOT EXISTS)
INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority, access_class, runtime_contract_key
)
SELECT 'iam_mcp_inneranimalmedia', 'agentsam_memory_search', 1, 1, 13, 'read', 'agentsam_memory_search'
 WHERE NOT EXISTS (
   SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
    WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_memory_search'
 );

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, is_active, expose_on_connector, connector_priority, access_class, runtime_contract_key
)
SELECT 'iam_mcp_inneranimalmedia', 'agentsam_memory_save', 1, 1, 14, 'write', 'agentsam_memory_save'
 WHERE NOT EXISTS (
   SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
    WHERE client_id = 'iam_mcp_inneranimalmedia' AND tool_key = 'agentsam_memory_save'
 );

-- Archive bridge-scoped canary (not valid convergence proof)
UPDATE agentsam_memory
   SET status = 'archived',
       is_archived = 1,
       projection_status = COALESCE(projection_status, 'ready'),
       updated_at = unixepoch()
 WHERE memory_id = 'mem_1607fc69dbd449ef'
   AND workspace_id = 'ws_inneranimalmedia_mcp'
   AND status = 'active';
