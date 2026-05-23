-- 335: Global scope for platform builtin MCP/tools catalog (multi-tenant visibility).
-- Pattern: user_id='', person_uuid=NULL, tenant_id/workspace_id NULL, workspace_scope='["*"]'
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/335_fs_tools_catalog.sql

-- A) Globalize builtin rows in agentsam_mcp_tools (platform catalog only)
UPDATE agentsam_mcp_tools
SET
  user_id = '',
  person_uuid = NULL,
  tenant_id = NULL,
  workspace_id = NULL,
  agent_id = NULL,
  workspace_scope = '["*"]',
  enabled = 1,
  is_active = 1,
  updated_at = datetime('now')
WHERE handler_type = 'builtin'
  AND (
    user_id = 'au_871d920d1233cbd1'
    OR workspace_scope = '["ws_inneranimalmedia"]'
  );

-- B) Globalize platform handler rows in agentsam_tools
UPDATE agentsam_tools
SET
  workspace_scope = '["*"]',
  updated_at = unixepoch()
WHERE handler_type IN ('builtin', 'mcp', 'r2', 'github', 'terminal')
  AND workspace_scope = '["ws_inneranimalmedia"]';

-- C) fs_write_file family: schema + approval (from src/tools/builtin/fs.js writeFileImpl)
UPDATE agentsam_mcp_tools
SET
  handler_type = 'builtin',
  requires_approval = 1,
  risk_level = 'high',
  description = 'Propose a file write by source (r2/github/drive/local). Remote sources stage a pending change_set requiring Accept before any write occurs. Local files return proposed_content only.',
  input_schema = '{"type":"object","required":["content"],"properties":{"source":{"type":"string","enum":["local","github","r2","drive","buffer"],"description":"Active file source from editor envelope"},"content":{"type":"string","description":"Full file content to write"},"proposed_content":{"type":"string","description":"Alias for content"},"r2Bucket":{"type":"string"},"r2_bucket":{"type":"string"},"r2Key":{"type":"string"},"r2_key":{"type":"string"},"githubRepo":{"type":"string"},"github_repo":{"type":"string"},"githubPath":{"type":"string"},"github_path":{"type":"string"},"githubBranch":{"type":"string"},"github_branch":{"type":"string"},"driveFileId":{"type":"string"},"drive_file_id":{"type":"string"},"workspacePath":{"type":"string"},"workspace_path":{"type":"string"},"path":{"type":"string","description":"Legacy path alias"},"active_file_source":{"type":"string"},"activeFileSource":{"type":"string"},"active_file_r2_bucket":{"type":"string"},"active_file_r2_key":{"type":"string"},"active_file_github_repo":{"type":"string"},"active_file_github_path":{"type":"string"},"active_file_github_branch":{"type":"string"},"active_file_drive_id":{"type":"string"},"active_file_workspace_path":{"type":"string"}}}',
  user_id = '',
  person_uuid = NULL,
  tenant_id = NULL,
  workspace_id = NULL,
  workspace_scope = '["*"]',
  enabled = 1,
  is_active = 1,
  updated_at = datetime('now')
WHERE (
    tool_key IN ('fs_write_file', 'fs_edit_file', 'write_file')
    OR tool_name IN ('fs_write_file', 'fs_edit_file', 'write_file')
  )
  AND (
    user_id = 'au_871d920d1233cbd1'
    OR workspace_scope = '["ws_inneranimalmedia"]'
  );

-- D) apply_change_set global builtin (agentsam_mcp_tools)
INSERT OR REPLACE INTO agentsam_mcp_tools (
  id,
  user_id,
  person_uuid,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  handler_type,
  description,
  input_schema,
  output_schema,
  requires_approval,
  risk_level,
  is_active,
  enabled,
  workspace_scope,
  modes_json,
  intent_tags,
  created_at,
  updated_at
) VALUES (
  'mcp_apply_change_set_global',
  '',
  NULL,
  'apply_change_set',
  'apply_change_set',
  'Apply Change Set',
  'file',
  'builtin',
  'Accept or reject a pending file write staged by write_file. Accept executes the write to R2/GitHub/Drive. Reject discards it.',
  '{"type":"object","required":["change_set_id","action"],"properties":{"change_set_id":{"type":"string","description":"ID of the pending change_set (cs_*)."},"action":{"type":"string","enum":["accept","reject"]}}}',
  '{"type":"object","properties":{"status":{"type":"string"},"source":{"type":"string"}}}',
  0,
  'low',
  1,
  1,
  '["*"]',
  '["auto","build","chat"]',
  '["file","change_set","accept","reject"]',
  datetime('now'),
  datetime('now')
);

-- E) Canonical agentsam_tools rows (global, no per-user scope)
INSERT OR REPLACE INTO agentsam_tools (
  id,
  tool_name,
  display_name,
  tool_category,
  handler_type,
  description,
  input_schema,
  risk_level,
  requires_approval,
  is_active,
  workspace_scope,
  modes_json,
  intent_tags,
  updated_at
) VALUES
(
  'ast_fs_write_file_global',
  'fs_write_file',
  'Write File',
  'file',
  'builtin',
  'Propose a file write by source (r2/github/drive/local). Remote sources stage a pending change_set requiring Accept before any write occurs. Local files return proposed_content only.',
  '{"type":"object","required":["content"],"properties":{"source":{"type":"string","enum":["local","github","r2","drive","buffer"],"description":"Active file source from editor envelope"},"content":{"type":"string","description":"Full file content to write"},"proposed_content":{"type":"string","description":"Alias for content"},"r2Bucket":{"type":"string"},"r2_bucket":{"type":"string"},"r2Key":{"type":"string"},"r2_key":{"type":"string"},"githubRepo":{"type":"string"},"github_repo":{"type":"string"},"githubPath":{"type":"string"},"github_path":{"type":"string"},"githubBranch":{"type":"string"},"github_branch":{"type":"string"},"driveFileId":{"type":"string"},"drive_file_id":{"type":"string"},"workspacePath":{"type":"string"},"workspace_path":{"type":"string"},"path":{"type":"string","description":"Legacy path alias"},"active_file_source":{"type":"string"},"activeFileSource":{"type":"string"},"active_file_r2_bucket":{"type":"string"},"active_file_r2_key":{"type":"string"},"active_file_github_repo":{"type":"string"},"active_file_github_path":{"type":"string"},"active_file_github_branch":{"type":"string"},"active_file_drive_id":{"type":"string"},"active_file_workspace_path":{"type":"string"}}}',
  'high',
  1,
  1,
  '["*"]',
  '["auto","build","chat"]',
  '["file","write","change_set"]',
  unixepoch()
),
(
  'ast_apply_change_set_global',
  'apply_change_set',
  'Apply Change Set',
  'file',
  'builtin',
  'Accept or reject a pending file write staged by write_file. Accept executes the write to R2/GitHub/Drive. Reject discards it.',
  '{"type":"object","required":["change_set_id","action"],"properties":{"change_set_id":{"type":"string","description":"ID of the pending change_set (cs_*)."},"action":{"type":"string","enum":["accept","reject"]}}}',
  'low',
  0,
  1,
  '["*"]',
  '["auto","build","chat"]',
  '["file","change_set","accept","reject"]',
  unixepoch()
);
