-- 383: Set auth_source inside agentsam_tools.handler_config JSON (no new columns).
-- Idempotent: json_patch merges auth_source + routing fields per handler_type.

-- GitHub → user OAuth
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"user_oauth_tokens","provider":"github"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type = 'github';

-- Google Drive proxies → user OAuth
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"user_oauth_tokens","provider":"google_drive"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key IN ('gdrive_fetch', 'gdrive_list');

-- D1 lane → platform binding DB
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{"binding":"DB"}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","binding":"DB"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type = 'd1';

-- R2 → platform (Worker R2 bindings)
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{"binding":"ASSETS"}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","binding":"ASSETS"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type = 'r2';

-- Workers AI / Vectorize
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","binding":"AI"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type = 'ai'
  AND tool_key NOT IN ('vectorize_query', 'vectorize_upsert', 'workspace_search_semantic');

UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","binding":"AGENTSAMVECTORIZE"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key IN ('vectorize_query', 'vectorize_upsert');

UPDATE agentsam_tools
SET handler_config = json_patch(
  handler_config,
  '{"auth_source":"platform","binding":"AGENTSAMVECTORIZE"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key = 'workspace_search_semantic';

-- Supabase / Hyperdrive lane
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{"binding":"HYPERDRIVE"}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","binding":"HYPERDRIVE"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type IN ('supabase', 'hyperdrive');

-- PTY / terminal → platform PTY_AUTH_TOKEN
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","env_key":"PTY_AUTH_TOKEN"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type IN ('terminal', 'filesystem')
  AND (
    tool_key LIKE 'pty_%'
    OR tool_key IN ('terminal_run', 'terminal_execute', 'terminal_wrangler')
  );

-- Cloudflare API (platform infra)
UPDATE agentsam_tools
SET handler_config = json_patch(
  handler_config,
  '{"auth_source":"platform","env_key":"CLOUDFLARE_API_TOKEN"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key = 'cloudflare_command_registry';

-- Resend system broadcast → platform; workspace email → platform_scoped
UPDATE agentsam_tools
SET handler_config = json_patch(
  handler_config,
  '{"auth_source":"platform","env_key":"RESEND_API_KEY"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key = 'resend_send_broadcast';

UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"platform_scoped","env_key":"RESEND_API_KEY"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key = 'resend_send_email';

-- Internal Worker / MCP / browser / workspace tools (same worker — no user credential)
UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","binding":"internal"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND handler_type IN ('mcp', 'browser_agentic', 'proxy', 'workspace.reader')
  AND (json_extract(handler_config, '$.auth_source') IS NULL);

UPDATE agentsam_tools
SET handler_config = json_patch(
  CASE
    WHEN handler_config IS NULL OR trim(handler_config) = '' OR handler_config = '{}' THEN '{}'
    ELSE handler_config
  END,
  '{"auth_source":"platform","binding":"internal"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key IN (
    'http_fetch',
    'excalidraw_open',
    'agent_memory_search',
    'agent_memory_write',
    'generate_execution_plan',
    'workflow_run_pipeline',
    'moviemode_export',
    'imgx_edit_image',
    'imgx_generate_image',
    'imgx_list_providers',
    'meshyai_image_to_3d',
    'meshyai_text_to_3d',
    'social_card_generate',
    'veo_generate_video',
    'knowledge_search',
    'rag_ingest',
    'rag_status'
  )
  AND (json_extract(handler_config, '$.auth_source') IS NULL);

-- Workspace filesystem via MCP (not PTY)
UPDATE agentsam_tools
SET handler_config = json_patch(
  handler_config,
  '{"auth_source":"platform","binding":"internal"}'
),
updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND tool_key IN (
    'fs_read_file',
    'fs_write_file',
    'fs_edit_file',
    'workspace_apply_patch',
    'workspace_list_files',
    'workspace_read_file',
    'workspace_search',
    'workspace_write_file'
  )
  AND (json_extract(handler_config, '$.auth_source') IS NULL);
