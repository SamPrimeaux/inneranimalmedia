DROP TABLE IF EXISTS agentsam_capability_index;

CREATE TABLE agentsam_capability_index (
  id TEXT PRIMARY KEY DEFAULT ('cap_' || lower(hex(randomblob(8)))),

  tenant_id TEXT,
  workspace_id TEXT,

  -- Human-readable abstract capability used by route requirements.
  -- Examples: code.search, d1.read, d1.write, worker.preview, worker.deploy
  capability_key TEXT NOT NULL,

  -- Concrete source backing this capability.
  source_kind TEXT NOT NULL CHECK(source_kind IN (
    'command',
    'mcp_tool',
    'script',
    'workflow',
    'mcp_workflow',
    'hook',
    'builtin_tool'
  )),
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,

  display_name TEXT NOT NULL,
  description TEXT,

  -- Normalized taxonomy for routing/search/UI.
  domain TEXT NOT NULL DEFAULT 'general',
  subdomain TEXT,
  action TEXT NOT NULL DEFAULT 'run',
  resource_type TEXT,

  -- Concrete execution identifiers.
  tool_key TEXT,
  handler_key TEXT,
  workflow_key TEXT,
  command_key TEXT,
  script_key TEXT,
  hook_key TEXT,

  -- Route/task hints, not hard ownership.
  route_key TEXT,
  task_type TEXT DEFAULT 'tool_use',

  -- Search/retrieval helpers.
  intent_tags_json TEXT NOT NULL DEFAULT '[]',
  internal_seo TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',

  -- Runtime compatibility.
  modes_json TEXT NOT NULL DEFAULT '["agent","auto","debug"]',

  -- Safety.
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK(risk_level IN ('none','low','medium','high','critical')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approval_type TEXT DEFAULT NULL
    CHECK(approval_type IN (
      'tool',
      'workflow',
      'command',
      'script',
      'deploy',
      'db_write',
      'r2_write',
      'github_write',
      'terminal',
      'hook',
      NULL
    )),

  -- Cost/performance hints.
  timeout_ms INTEGER DEFAULT 120000,
  estimated_cost_usd REAL DEFAULT 0,
  max_tokens INTEGER DEFAULT 8000,

  priority INTEGER NOT NULL DEFAULT 50,

  capability_tier TEXT NOT NULL DEFAULT 'common'
    CHECK(capability_tier IN ('core','common','specialized','dangerous','archived')),

  is_active INTEGER NOT NULL DEFAULT 1,
  is_global INTEGER NOT NULL DEFAULT 1,

  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_latency_ms REAL,
  last_used_at TEXT,

  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Option B:
  -- one capability can have many concrete sources.
  UNIQUE(workspace_id, capability_key, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_capability_index_capability
ON agentsam_capability_index(capability_key, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_agentsam_capability_index_tool_key
ON agentsam_capability_index(tool_key, is_active);

CREATE INDEX IF NOT EXISTS idx_agentsam_capability_index_route
ON agentsam_capability_index(route_key, task_type, is_active);

CREATE INDEX IF NOT EXISTS idx_agentsam_capability_index_domain
ON agentsam_capability_index(domain, subdomain, action, is_active);

CREATE INDEX IF NOT EXISTS idx_agentsam_capability_index_risk
ON agentsam_capability_index(risk_level, requires_approval, is_active);

CREATE INDEX IF NOT EXISTS idx_agentsam_capability_index_source
ON agentsam_capability_index(source_kind, source_table, source_id);
