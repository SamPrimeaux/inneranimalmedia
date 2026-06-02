-- 518: OAuth allowlist ↔ catalog alignment (tri-surface repair).
-- Supersession matrix: docs/platform/agentsam-tools-cleanup-2026-06.md chunks 1–4.
-- Audit: REMOTE=1 node scripts/audit/oauth-allowlist-catalog-alignment.mjs
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/518_oauth_allowlist_catalog_alignment.sql

-- ── 1. Deactivate dead OAuth allowlist keys (successors already on allowlist) ──
UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 0,
    notes = COALESCE(notes, '') || ' | 518: superseded — see agentsam-tool-supersession.js',
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    'code_semantic_search',
    'deep_archive_search',
    'fs_read_file',
    'fs_search_files',
    'http_fetch',
    'hyperdrive_schema_inspect',
    'schema_semantic_search'
  )
  AND COALESCE(is_active, 1) = 1;

-- ── 2. oauth_visible for active canonical tools on OAuth allowlist ─────────────
UPDATE agentsam_tools
SET oauth_visible = 1,
    updated_at = unixepoch()
WHERE tool_key IN (
  'browser_content',
  'search_web',
  'web_fetch',
  'agentsam_excalidraw',
  'agentsam_workspace_search',
  'agentsam_gdrive'
)
AND COALESCE(is_active, 1) = 1
AND COALESCE(is_degraded, 0) = 0
AND COALESCE(oauth_visible, 0) = 0;

-- ── 3. Chunk 1 soft-deprecate — D1 / platform DB aliases ─────────────────────
UPDATE agentsam_tools
SET is_active = 0,
    is_degraded = 1,
    tool_category = 'deprecated.' || COALESCE(NULLIF(trim(tool_category), ''), 'unknown'),
    updated_at = unixepoch()
WHERE tool_key IN (
  'd1_query',
  'd1_schema',
  'd1_write',
  'd1_explain',
  'd1_migrations_draft',
  'agentsam_db_query',
  'agentsam_db_schema',
  'agentsam_db_write'
)
AND (COALESCE(is_active, 1) = 1 OR COALESCE(is_degraded, 0) = 0);

-- ── 4. capability_aliases — retire legacy match_value rows, seed canonical targets ─
UPDATE agentsam_capability_aliases
SET is_active = 0,
    rationale = COALESCE(rationale, '') || ' | 518: legacy match_value retired',
    updated_at = datetime('now')
WHERE is_active = 1
  AND match_kind = 'tool_key'
  AND match_value IN (
    'd1_query', 'd1_schema', 'd1_schema_introspect', 'd1_explain', 'd1_write', 'd1_migrations_draft',
    'agentsam_db_query', 'agentsam_db_schema', 'agentsam_db_write',
    'r2_read', 'r2_write', 'r2_list', 'r2_search', 'r2_delete',
    'agentsam_r2_read', 'agentsam_r2_write', 'agentsam_r2_upload', 'agentsam_r2_list',
    'supabase_query', 'supabase_write', 'supabase_schema', 'supabase_vector',
    'hyperdrive_readonly_query', 'hyperdrive_schema_inspect', 'platform_hyperdrive_agentsam_query',
    'github_repos', 'github_file', 'github_create_file', 'github_update_file', 'github_create_branch',
    'github_create_pr', 'github_merge_pr', 'agentsam_github_pr_create',
    'fs_read_file', 'fs_search_files', 'fs_write_file', 'fs_edit_file',
    'workspace_read_file', 'workspace_write_file', 'workspace_list_files', 'workspace_apply_patch',
    'workspace_search_semantic', 'pty_fs_read', 'pty_fs_write',
    'http_fetch', 'code_semantic_search', 'deep_archive_search', 'schema_semantic_search', 'knowledge_search',
    'memory_semantic_search', 'agentsam_memory_search', 'agentsam_memory_save', 'agentsam_memory_write', 'agentsam_memory_query',
    'terminal_execute', 'terminal_run', 'terminal_wrangler',
    'worker_deploy', 'deploy_status', 'agentsam_deploy_status', 'list_workers', 'get_worker_services', 'get_deploy_command',
    'agentsam_notify', 'resend_send_email', 'resend_send_broadcast', 'gdrive_list', 'gdrive_fetch'
  );

INSERT OR IGNORE INTO agentsam_capability_aliases (
  abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active
)
VALUES
  ('d1.read', 'tool_key', 'agentsam_d1_query', 'develop', 10, 0, 0, '518: canonical D1 read', 1),
  ('database.query', 'tool_key', 'agentsam_d1_query', 'develop', 10, 0, 0, '518: canonical D1 read', 1),
  ('schema.inspect', 'tool_key', 'agentsam_d1_query', 'develop', 10, 0, 0, '518: canonical D1 schema', 1),
  ('d1.write', 'tool_key', 'agentsam_d1_write', 'develop', 10, 1, 1, '518: canonical D1 write', 1),
  ('database.write', 'tool_key', 'agentsam_d1_write', 'develop', 10, 1, 1, '518: canonical D1 write', 1),
  ('file.read', 'tool_key', 'agentsam_workspace_search', 'develop', 10, 0, 0, '518: workspace read', 1),
  ('file.write', 'tool_key', 'agentsam_workspace_search', 'develop', 10, 1, 1, '518: workspace write', 1),
  ('file.write', 'tool_key', 'agentsam_github_write', 'develop', 40, 1, 1, '518: github write', 1),
  ('code.search', 'tool_key', 'agentsam_workspace_search', 'develop', 10, 0, 0, '518: workspace search', 1),
  ('code.search', 'tool_key', 'agentsam_github_read', 'develop', 20, 0, 0, '518: github read', 1),
  ('worker.preview', 'tool_key', 'agentsam_worker_deploy', 'develop', 10, 0, 0, '518: deploy preview', 1),
  ('worker.deploy', 'tool_key', 'agentsam_worker_deploy', 'develop', 10, 1, 1, '518: worker deploy', 1),
  ('terminal.execute', 'tool_key', 'agentsam_terminal_remote', 'develop', 10, 1, 1, '518: terminal remote', 1),
  ('knowledge.search', 'tool_key', 'agentsam_autorag', 'research', 10, 0, 0, '518: autorag', 1),
  ('memory.search', 'tool_key', 'agentsam_memory_manager', 'memory', 10, 0, 0, '518: memory manager', 1);

-- ── 5. Identity aliases — legacy tool_key as abstract_capability ───────────────
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('d1_query', 'tool_key', 'agentsam_d1_query', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('d1_write', 'tool_key', 'agentsam_d1_write', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('agentsam_db_query', 'tool_key', 'agentsam_d1_query', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('agentsam_db_write', 'tool_key', 'agentsam_d1_write', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('r2_read', 'tool_key', 'agentsam_r2_get', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('r2_write', 'tool_key', 'agentsam_r2_put', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('github_file', 'tool_key', 'agentsam_github_read', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('github_create_file', 'tool_key', 'agentsam_github_write', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('fs_read_file', 'tool_key', 'agentsam_workspace_search', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);
INSERT OR IGNORE INTO agentsam_capability_aliases (abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active) VALUES ('http_fetch', 'tool_key', 'web_fetch', 'develop', 15, 0, 0, '518: legacy tool_key alias', 1);

-- ── 6. Rebuild OAuth token snapshots from active allowlist ∩ canonical catalog ─
UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT a.tool_key
    FROM agentsam_mcp_oauth_tool_allowlist a
    INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
    WHERE a.client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(a.is_active, 1) = 1
      AND COALESCE(t.is_active, 1) = 1
      AND COALESCE(t.is_degraded, 0) = 0
    ORDER BY a.sort_order ASC, a.tool_key ASC
  )
),
allowed_domains_json = json_set(
  COALESCE(allowed_domains_json, '{}'),
  '$.oauth_tool_access',
  COALESCE(
    (
      SELECT json_group_object(
        a.tool_key,
        CASE WHEN lower(a.access_class) = 'write' THEN 'write' ELSE 'read' END
      )
      FROM agentsam_mcp_oauth_tool_allowlist a
      INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
      WHERE a.client_id = 'iam_mcp_inneranimalmedia'
        AND COALESCE(a.is_active, 1) = 1
        AND COALESCE(t.is_active, 1) = 1
        AND COALESCE(t.is_degraded, 0) = 0
    ),
    '{}'
  )
)
WHERE lower(COALESCE(token_type, '')) = 'oauth'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(revoked_at, 0) = 0;
