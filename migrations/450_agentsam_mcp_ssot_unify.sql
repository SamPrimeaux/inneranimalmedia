-- 450: MCP SSOT — agentsam_tools is canonical; agentsam_mcp_tools is a deprecating mirror.
-- Policy baselines (allowlist exemptions, cache denylist) move to agentsam_tool_policy_keys.
-- Workflow handlers using executor_kind=mcp_tool migrate to catalog_tool (D1-driven dispatch).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/450_agentsam_mcp_ssot_unify.sql

-- ── 1. D1-driven tool policy keys (replaces hardcoded Sets in Worker) ─────────
CREATE TABLE IF NOT EXISTS agentsam_tool_policy_keys (
  id TEXT PRIMARY KEY,
  policy_kind TEXT NOT NULL CHECK (
    policy_kind IN (
      'builtin_safe_allowlist',
      'agent_chat_essential',
      'non_cacheable',
      'mcp_panel_denylist'
    )
  ),
  tool_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 50,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (policy_kind, tool_key)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_policy_keys_kind
  ON agentsam_tool_policy_keys (policy_kind, is_active, sort_order);

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes) VALUES
  ('atpk_builtin_d1_query', 'builtin_safe_allowlist', 'd1_query', 10, 'Read-only D1 when strict MCP allowlist'),
  ('atpk_builtin_platform_info', 'builtin_safe_allowlist', 'platform_info', 20, NULL),
  ('atpk_builtin_telemetry_health', 'builtin_safe_allowlist', 'telemetry_health', 30, NULL),
  ('atpk_builtin_knowledge_search', 'builtin_safe_allowlist', 'knowledge_search', 40, NULL),
  ('atpk_builtin_rag_search', 'builtin_safe_allowlist', 'rag_search', 50, NULL);

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes) VALUES
  ('atpk_chat_d1_query', 'agent_chat_essential', 'd1_query', 10, NULL),
  ('atpk_chat_github_file', 'agent_chat_essential', 'github_file', 20, NULL),
  ('atpk_chat_terminal_run', 'agent_chat_essential', 'terminal_run', 30, NULL),
  ('atpk_chat_r2_read', 'agent_chat_essential', 'r2_read', 40, NULL),
  ('atpk_chat_r2_write', 'agent_chat_essential', 'r2_write', 50, NULL),
  ('atpk_chat_cdt_screenshot', 'agent_chat_essential', 'cdt_take_screenshot', 60, NULL);

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes) VALUES
  ('atpk_nc_terminal_execute', 'non_cacheable', 'terminal_execute', 10, NULL),
  ('atpk_nc_deploy', 'non_cacheable', 'deploy', 20, NULL),
  ('atpk_nc_r2_delete', 'non_cacheable', 'r2_delete', 30, NULL),
  ('atpk_nc_d1_write', 'non_cacheable', 'd1_write', 40, NULL),
  ('atpk_nc_excalidraw_plan', 'non_cacheable', 'excalidraw_plan_map_create', 50, NULL);

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes) VALUES
  ('atpk_deny_recall', 'mcp_panel_denylist', 'recall', 10, NULL),
  ('atpk_deny_toolbox', 'mcp_panel_denylist', 'toolbox', 20, NULL),
  ('atpk_deny_tester', 'mcp_panel_denylist', 'tester', 30, NULL),
  ('atpk_deny_codex_default', 'mcp_panel_denylist', 'codex-default', 40, NULL),
  ('atpk_deny_codex_worker', 'mcp_panel_denylist', 'codex-worker', 50, NULL),
  ('atpk_deny_codex_explorer', 'mcp_panel_denylist', 'codex-explorer', 60, NULL),
  ('atpk_deny_pr_explorer', 'mcp_panel_denylist', 'pr-explorer', 70, NULL),
  ('atpk_deny_batch_processor', 'mcp_panel_denylist', 'batch-processor', 80, NULL),
  ('atpk_deny_course_users', 'mcp_panel_denylist', 'course_users', 90, NULL),
  ('atpk_deny_code_check', 'mcp_panel_denylist', 'code-check', 100, NULL),
  ('atpk_deny_ollama_boilerplate', 'mcp_panel_denylist', 'ollama-boilerplate', 110, NULL),
  ('atpk_deny_ollama_analyst', 'mcp_panel_denylist', 'ollama-analyst', 120, NULL),
  ('atpk_deny_ollama_agent', 'mcp_panel_denylist', 'ollama-agent', 130, NULL),
  ('atpk_deny_cadcreator', 'mcp_panel_denylist', 'cadcreator', 140, NULL),
  ('atpk_deny_cadvalidator', 'mcp_panel_denylist', 'cadvalidator', 150, NULL),
  ('atpk_deny_assetpublisher', 'mcp_panel_denylist', 'assetpublisher', 160, NULL),
  ('atpk_deny_excalidrawplanner', 'mcp_panel_denylist', 'excalidrawplanner', 170, NULL),
  ('atpk_deny_meauxcad_operator', 'mcp_panel_denylist', 'meauxcad-operator', 180, NULL),
  ('atpk_deny_wai_t1', 'mcp_panel_denylist', 'wai-tier1-agentic', 190, NULL),
  ('atpk_deny_wai_t2', 'mcp_panel_denylist', 'wai-tier2-limited', 200, NULL),
  ('atpk_deny_wai_t3', 'mcp_panel_denylist', 'wai-tier3-textonly', 210, NULL);

-- ── 2. Mirror agentsam_mcp_tools ← agentsam_tools (parity for legacy UI reads) ─
UPDATE agentsam_mcp_tools AS m
SET
  agentsam_tools_id = COALESCE(
    m.agentsam_tools_id,
    (SELECT t.id FROM agentsam_tools t WHERE t.tool_key = m.tool_key LIMIT 1)
  ),
  handler_type = COALESCE(
    (SELECT t.handler_type FROM agentsam_tools t WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1 LIMIT 1),
    m.handler_type
  ),
  handler_config = COALESCE(
    (SELECT t.handler_config FROM agentsam_tools t WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1 LIMIT 1),
    m.handler_config
  ),
  input_schema = COALESCE(
    (SELECT t.input_schema FROM agentsam_tools t WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1 LIMIT 1),
    m.input_schema
  ),
  description = COALESCE(
    (SELECT t.description FROM agentsam_tools t WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1 LIMIT 1),
    m.description
  ),
  risk_level = COALESCE(
    (SELECT t.risk_level FROM agentsam_tools t WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1 LIMIT 1),
    m.risk_level
  ),
  requires_approval = COALESCE(
    (SELECT t.requires_approval FROM agentsam_tools t WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1 LIMIT 1),
    m.requires_approval
  ),
  modes_json = COALESCE(
    (SELECT t.modes_json FROM agentsam_tools t WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1 LIMIT 1),
    m.modes_json
  ),
  mcp_service_url = COALESCE(
    NULLIF(trim((SELECT t.mcp_service_url FROM agentsam_tools t WHERE t.tool_key = m.tool_key LIMIT 1)), ''),
    m.mcp_service_url
  ),
  updated_at = unixepoch()
WHERE EXISTS (
  SELECT 1 FROM agentsam_tools t
  WHERE t.tool_key = m.tool_key AND COALESCE(t.is_active, 1) = 1
);

-- Backfill mirror rows for active catalog tools missing from agentsam_mcp_tools (platform user_id from existing row).
INSERT OR IGNORE INTO agentsam_mcp_tools (
  id,
  user_id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  handler_type,
  handler_config,
  modes_json,
  risk_level,
  requires_approval,
  enabled,
  is_active,
  workspace_scope,
  routing_scope,
  agentsam_tools_id,
  updated_at
)
SELECT
  'amt_' || t.tool_key,
  (SELECT user_id FROM agentsam_mcp_tools WHERE trim(COALESCE(user_id, '')) != '' LIMIT 1),
  t.tool_key,
  COALESCE(NULLIF(trim(t.tool_name), ''), t.tool_key),
  COALESCE(NULLIF(trim(t.display_name), ''), t.tool_key),
  COALESCE(NULLIF(trim(t.tool_category), ''), 'agent'),
  COALESCE(t.mcp_service_url, 'https://mcp.inneranimalmedia.com/mcp'),
  COALESCE(t.description, ''),
  COALESCE(t.input_schema, '{}'),
  COALESCE(t.handler_type, 'builtin'),
  COALESCE(t.handler_config, '{}'),
  COALESCE(t.modes_json, '["auto","agent","debug"]'),
  COALESCE(t.risk_level, 'low'),
  COALESCE(t.requires_approval, 0),
  1,
  COALESCE(t.is_active, 1),
  COALESCE(t.workspace_scope, '["*"]'),
  'workspace',
  t.id,
  unixepoch()
FROM agentsam_tools t
WHERE COALESCE(t.is_active, 1) = 1
  AND COALESCE(t.is_degraded, 0) = 0
  AND trim(COALESCE(t.tool_key, '')) != ''
  AND (SELECT user_id FROM agentsam_mcp_tools WHERE trim(COALESCE(user_id, '')) != '' LIMIT 1) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agentsam_mcp_tools m
    WHERE m.tool_key = t.tool_key
      AND m.user_id = (SELECT user_id FROM agentsam_mcp_tools WHERE trim(COALESCE(user_id, '')) != '' LIMIT 1)
  );

-- ── 3. Workflow: mcp_tool → catalog_tool (same D1 tool_key, no Worker branch) ─
UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'catalog_tool',
  handler_config_json = CASE
    WHEN trim(COALESCE(handler_config_json, '')) = '' OR handler_config_json = '{}'
      THEN json_object('tool_key', trim(handler_key))
    WHEN json_extract(handler_config_json, '$.tool_key') IS NOT NULL
      AND trim(json_extract(handler_config_json, '$.tool_key')) != ''
      THEN handler_config_json
    ELSE json_patch(handler_config_json, json_object('tool_key', trim(handler_key)))
  END,
  updated_at = unixepoch()
WHERE lower(trim(executor_kind)) = 'mcp_tool'
  AND trim(COALESCE(handler_key, '')) != '';
