-- Routing engine: catalog, route capability requirements, and aggregate memory for cold-start priors.
-- Safe to run on existing D1: CREATE IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS agentsam_model_catalog (
  id TEXT PRIMARY KEY DEFAULT ('mc_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT '',
  workspace_id TEXT NOT NULL DEFAULT '',
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_degraded INTEGER NOT NULL DEFAULT 0,
  budget_exhausted INTEGER NOT NULL DEFAULT 0,
  supports_tools INTEGER DEFAULT 0,
  supports_vision INTEGER DEFAULT 0,
  supports_structured_output INTEGER DEFAULT 0,
  cost_tier TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, workspace_id, model_key)
);

CREATE TABLE IF NOT EXISTS agentsam_route_requirements (
  route_key TEXT PRIMARY KEY,
  requires_tools INTEGER NOT NULL DEFAULT 0,
  requires_vision INTEGER NOT NULL DEFAULT 0,
  requires_json_mode INTEGER NOT NULL DEFAULT 0,
  max_cost_per_1k_in REAL,
  max_latency_p50_ms INTEGER,
  min_quality_score REAL,
  preferred_tier TEXT,
  blocked_providers TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS agentsam_model_routing_memory (
  id TEXT PRIMARY KEY DEFAULT ('mrm_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  model_key TEXT NOT NULL,
  success_rate REAL,
  avg_latency_ms REAL,
  avg_cost_usd REAL,
  code_pass_rate REAL,
  hallucination_rate REAL,
  sample_n INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(workspace_id, task_type, model_key)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_route_requirements_key ON agentsam_route_requirements(route_key);
CREATE INDEX IF NOT EXISTS idx_agentsam_model_routing_memory_lookup
  ON agentsam_model_routing_memory(workspace_id, task_type, model_key);
