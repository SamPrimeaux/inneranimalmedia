-- Guardrail definitions, rulesets, and audit events (multi-tenant scoped).
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Apply (remote example):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/294_agentsam_guardrails.sql
--
-- FK order: guardrails → rulesets → events (events reference both).

CREATE TABLE IF NOT EXISTS agentsam_guardrails (
  id TEXT PRIMARY KEY,

  scope TEXT NOT NULL CHECK (
    scope IN ('global', 'tenant', 'workspace', 'user', 'session')
  ),

  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,

  guardrail_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  category TEXT NOT NULL CHECK (
    category IN (
      'tenant_isolation',
      'tool_permission',
      'secret_protection',
      'deploy_safety',
      'data_access',
      'model_routing',
      'rag_retrieval',
      'browser_terminal',
      'code_modification',
      'email_external_action',
      'cost_budget',
      'compliance',
      'general'
    )
  ),

  severity TEXT NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('info', 'low', 'medium', 'high', 'critical')
  ),

  action TEXT NOT NULL DEFAULT 'warn' CHECK (
    action IN ('allow', 'warn', 'require_approval', 'block', 'log_only')
  ),

  applies_to TEXT NOT NULL DEFAULT 'agent' CHECK (
    applies_to IN (
      'agent',
      'mcp_tool',
      'model',
      'route',
      'integration',
      'rag',
      'browser',
      'terminal',
      'deploy',
      'email',
      'storage',
      'all'
    )
  ),

  matcher_json TEXT NOT NULL DEFAULT '{}',
  policy_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',

  is_enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  tags_json TEXT DEFAULT '[]',
  version INTEGER DEFAULT 1,

  CHECK (
    (scope = 'global' AND tenant_id IS NULL AND workspace_id IS NULL)
    OR
    (scope = 'tenant' AND tenant_id IS NOT NULL)
    OR
    (scope = 'workspace' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
    OR
    (scope = 'user' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL AND user_id IS NOT NULL)
    OR
    (scope = 'session' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS agentsam_guardrail_rulesets (
  id TEXT PRIMARY KEY,
  ruleset_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  scope TEXT NOT NULL CHECK (
    scope IN ('global', 'tenant', 'workspace', 'user', 'session')
  ),

  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,

  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('draft', 'active', 'archived')
  ),

  guardrail_keys_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',

  is_enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  CHECK (
    (scope = 'global' AND tenant_id IS NULL AND workspace_id IS NULL)
    OR
    (scope = 'tenant' AND tenant_id IS NOT NULL)
    OR
    (scope = 'workspace' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
    OR
    (scope = 'user' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL AND user_id IS NOT NULL)
    OR
    (scope = 'session' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
  ),

  UNIQUE(scope, tenant_id, workspace_id, user_id, ruleset_key, version)
);

CREATE TABLE IF NOT EXISTS agentsam_guardrail_events (
  id TEXT PRIMARY KEY,

  event_scope TEXT NOT NULL CHECK (
    event_scope IN ('global', 'tenant', 'workspace', 'user', 'session')
  ),

  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  identity_profile_id TEXT,

  session_id TEXT,
  conversation_id TEXT,
  request_id TEXT,
  run_group_id TEXT,

  guardrail_id TEXT,
  guardrail_key TEXT NOT NULL,
  ruleset_id TEXT,
  ruleset_key TEXT,

  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  action TEXT NOT NULL,

  target_type TEXT NOT NULL,
  target_name TEXT,
  route_path TEXT,
  tool_name TEXT,
  model_key TEXT,

  decision TEXT NOT NULL CHECK (
    decision IN ('allowed', 'warned', 'approval_required', 'blocked', 'logged')
  ),

  reason TEXT,
  input_preview TEXT,
  output_preview TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (guardrail_id) REFERENCES agentsam_guardrails(id),
  FOREIGN KEY (ruleset_id) REFERENCES agentsam_guardrail_rulesets(id),

  CHECK (
    (event_scope = 'global')
    OR
    (event_scope = 'tenant' AND tenant_id IS NOT NULL)
    OR
    (event_scope = 'workspace' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
    OR
    (event_scope = 'user' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL AND user_id IS NOT NULL)
    OR
    (event_scope = 'session' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL)
  )
);

-- Resolution / listing (tenant + workspace + priority ordering)
CREATE INDEX IF NOT EXISTS idx_agentsam_guardrails_scope_tenant_ws
  ON agentsam_guardrails(scope, tenant_id, workspace_id, is_enabled, priority DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrails_guardrail_key
  ON agentsam_guardrails(guardrail_key);

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrails_applies
  ON agentsam_guardrails(applies_to, is_enabled, priority DESC);

-- Rulesets: active bundles per scope (status + priority)
CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_rulesets_scope_tenant_ws
  ON agentsam_guardrail_rulesets(scope, tenant_id, workspace_id, status, is_enabled, priority DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_rulesets_key
  ON agentsam_guardrail_rulesets(ruleset_key);

-- Events: audit timelines and tracing
CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_events_tenant_ws_created
  ON agentsam_guardrail_events(tenant_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_events_guardrail_key_created
  ON agentsam_guardrail_events(guardrail_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_events_decision_created
  ON agentsam_guardrail_events(decision, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_events_session_created
  ON agentsam_guardrail_events(session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_events_request
  ON agentsam_guardrail_events(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_events_guardrail_id
  ON agentsam_guardrail_events(guardrail_id)
  WHERE guardrail_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_guardrail_events_ruleset_id
  ON agentsam_guardrail_events(ruleset_id)
  WHERE ruleset_id IS NOT NULL;
