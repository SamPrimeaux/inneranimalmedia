-- 340_agentsam_db_governance.sql
-- Close the NULL UNIQUE gap on agentsam_workflows / agentsam_mcp_workflows,
-- fix invalid node_type values, dedupe test artifacts, add skill dedup index.
--
-- PROBLEM: UNIQUE(workspace_id, workflow_key) does NOT prevent duplicates when
-- workspace_id IS NULL (SQLite: NULL != NULL). Platform-global and tenant-scoped
-- tiers need partial unique indexes.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file migrations/340_agentsam_db_governance.sql

-- ================================================================
-- 1. FIX NODE TYPE VALUES (invalid CHECK values from earlier SQL)
-- ================================================================
UPDATE agentsam_workflow_nodes
SET node_type  = 'mcp_tool',
    updated_at = datetime('now')
WHERE node_type = 'tool_call';

UPDATE agentsam_workflow_nodes
SET node_type  = 'eval',
    updated_at = datetime('now')
WHERE node_type = 'agent_eval';

-- ================================================================
-- 2. DEDUP — timestamp-suffixed test/matrix artifacts
-- ================================================================
UPDATE agentsam_workflows SET is_active = 0, updated_at = datetime('now')
WHERE workflow_key LIKE 'wf_ollama_local_pinstest_%'
  AND id NOT IN (
    SELECT id FROM agentsam_workflows
    WHERE workflow_key LIKE 'wf_ollama_local_pinstest_%'
    ORDER BY created_at DESC LIMIT 2
  );

UPDATE agentsam_workflows SET is_active = 0, updated_at = datetime('now')
WHERE workflow_key LIKE 'wf_visualizer_%'
  AND id NOT IN (
    SELECT id FROM agentsam_workflows
    WHERE workflow_key LIKE 'wf_visualizer_%'
    ORDER BY created_at DESC LIMIT 1
  );

UPDATE agentsam_workflows SET is_active = 0, updated_at = datetime('now')
WHERE workflow_key LIKE 'wf_matrix_%';

UPDATE agentsam_workflows SET is_active = 0, updated_at = datetime('now')
WHERE workflow_key LIKE 'wf_model_smoke_%'
  AND id NOT IN (
    SELECT id FROM agentsam_workflows
    WHERE workflow_key LIKE 'wf_model_smoke_%'
    ORDER BY created_at DESC LIMIT 1
  );

UPDATE agentsam_workflows SET is_active = 0, updated_at = datetime('now')
WHERE workflow_key LIKE 'wf_contract_graph_%'
  AND id NOT IN (
    SELECT id FROM agentsam_workflows
    WHERE workflow_key LIKE 'wf_contract_graph_%'
    ORDER BY created_at DESC LIMIT 1
  );

-- ================================================================
-- 3. DEDUP — platform-global / tenant-scoped duplicate workflow_key
-- (required before partial unique indexes can be created)
-- ================================================================
UPDATE agentsam_workflows
SET is_active = 0, updated_at = datetime('now')
WHERE tenant_id IS NULL AND workspace_id IS NULL
  AND id NOT IN (
    SELECT w2.id
    FROM agentsam_workflows w2
    INNER JOIN (
      SELECT workflow_key, MAX(COALESCE(created_at, updated_at, '')) AS keep_ts
      FROM agentsam_workflows
      WHERE tenant_id IS NULL AND workspace_id IS NULL
      GROUP BY workflow_key
    ) k ON k.workflow_key = w2.workflow_key
       AND k.keep_ts = COALESCE(w2.created_at, w2.updated_at, '')
  );

UPDATE agentsam_workflows
SET is_active = 0, updated_at = datetime('now')
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL
  AND id NOT IN (
    SELECT w2.id
    FROM agentsam_workflows w2
    INNER JOIN (
      SELECT tenant_id, workflow_key, MAX(COALESCE(created_at, updated_at, '')) AS keep_ts
      FROM agentsam_workflows
      WHERE workspace_id IS NULL AND tenant_id IS NOT NULL
      GROUP BY tenant_id, workflow_key
    ) k ON k.tenant_id = w2.tenant_id
       AND k.workflow_key = w2.workflow_key
       AND k.keep_ts = COALESCE(w2.created_at, w2.updated_at, '')
  );

UPDATE agentsam_mcp_workflows
SET is_active = 0, updated_at = datetime('now')
WHERE tenant_id IS NULL AND workspace_id IS NULL
  AND id NOT IN (
    SELECT w2.id
    FROM agentsam_mcp_workflows w2
    INNER JOIN (
      SELECT workflow_key, MAX(COALESCE(created_at, updated_at, '')) AS keep_ts
      FROM agentsam_mcp_workflows
      WHERE tenant_id IS NULL AND workspace_id IS NULL
      GROUP BY workflow_key
    ) k ON k.workflow_key = w2.workflow_key
       AND k.keep_ts = COALESCE(w2.created_at, w2.updated_at, '')
  );

UPDATE agentsam_mcp_workflows
SET is_active = 0, updated_at = datetime('now')
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL
  AND id NOT IN (
    SELECT w2.id
    FROM agentsam_mcp_workflows w2
    INNER JOIN (
      SELECT tenant_id, workflow_key, MAX(COALESCE(created_at, updated_at, '')) AS keep_ts
      FROM agentsam_mcp_workflows
      WHERE workspace_id IS NULL AND tenant_id IS NOT NULL
      GROUP BY tenant_id, workflow_key
    ) k ON k.tenant_id = w2.tenant_id
       AND k.workflow_key = w2.workflow_key
       AND k.keep_ts = COALESCE(w2.created_at, w2.updated_at, '')
  );

-- ================================================================
-- 4. PARTIAL UNIQUE INDEXES — agentsam_workflows
-- ================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_wf_global_key
ON agentsam_workflows(workflow_key)
WHERE workspace_id IS NULL AND tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_wf_tenant_key
ON agentsam_workflows(tenant_id, workflow_key)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

-- ================================================================
-- 5. PARTIAL UNIQUE INDEXES — agentsam_mcp_workflows
-- ================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_mcpwf_global_key
ON agentsam_mcp_workflows(workflow_key)
WHERE workspace_id IS NULL AND tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_mcpwf_tenant_key
ON agentsam_mcp_workflows(tenant_id, workflow_key)
WHERE workspace_id IS NULL AND tenant_id IS NOT NULL;

-- ================================================================
-- 6. SKILL DEDUP (active rows only)
-- ================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_skill_scope_name
ON agentsam_skill(scope, workspace_id, name)
WHERE is_active = 1;

-- Verify (manual):
-- SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'uq_agentsam_%';
-- SELECT DISTINCT node_type FROM agentsam_workflow_nodes;
-- SELECT COUNT(*) FROM agentsam_workflows WHERE is_active=1;
