-- Extend routing arms identity: (workspace_id, task_type, mode, model_key, agent_slug).
-- agent_slug = agentsam_subagent_profile.id (e.g. asp_agent_sam); '' = workspace-global arm.
-- Rebuild table so UNIQUE includes agent_slug (column may already exist without unique scope).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/374_agentsam_routing_arms_agent_slug_unique.sql

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS agentsam_routing_arms__agent_slug_swap (
  id                    TEXT PRIMARY KEY,
  task_type             TEXT NOT NULL,
  mode                  TEXT NOT NULL,
  model_key             TEXT NOT NULL,
  provider              TEXT NOT NULL,
  success_alpha         REAL NOT NULL DEFAULT 1.0,
  success_beta          REAL NOT NULL DEFAULT 1.0,
  cost_n                INTEGER NOT NULL DEFAULT 0,
  cost_mean             REAL NOT NULL DEFAULT 0,
  cost_m2               REAL NOT NULL DEFAULT 0,
  latency_n             INTEGER NOT NULL DEFAULT 0,
  latency_mean          REAL NOT NULL DEFAULT 0,
  latency_m2            REAL NOT NULL DEFAULT 0,
  decayed_score         REAL NOT NULL DEFAULT 0,
  last_decay_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  is_eligible           INTEGER NOT NULL DEFAULT 1,
  is_paused             INTEGER NOT NULL DEFAULT 0,
  pause_reason          TEXT,
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  ai_model_id           TEXT,
  last_chain_id         TEXT,
  last_plan_id          TEXT,
  avg_quality_score     REAL DEFAULT 0,
  quality_n             INTEGER DEFAULT 0,
  max_cost_per_call_usd REAL,
  budget_exhausted      INTEGER DEFAULT 0,
  drift_signal_id       TEXT,
  intent_slug           TEXT,
  total_executions      INTEGER DEFAULT 0,
  workflow_agent        TEXT,
  tools_json            TEXT DEFAULT '[]',
  is_active             INTEGER DEFAULT 1,
  reasoning_effort      TEXT DEFAULT 'medium',
  workspace_id          TEXT NOT NULL,
  fallback_model_key    TEXT,
  supports_tools        INTEGER DEFAULT 1,
  priority              INTEGER DEFAULT 50,
  model_catalog_id      TEXT,
  agent_slug            TEXT NOT NULL DEFAULT '' REFERENCES agentsam_subagent_profile(id),
  UNIQUE(workspace_id, task_type, mode, model_key, agent_slug)
);

INSERT OR IGNORE INTO agentsam_routing_arms__agent_slug_swap (
  id, task_type, mode, model_key, provider,
  success_alpha, success_beta, cost_n, cost_mean, cost_m2,
  latency_n, latency_mean, latency_m2, decayed_score, last_decay_at,
  is_eligible, is_paused, pause_reason, updated_at,
  ai_model_id, last_chain_id, last_plan_id, avg_quality_score, quality_n,
  max_cost_per_call_usd, budget_exhausted, drift_signal_id, intent_slug,
  total_executions, workflow_agent, tools_json, is_active, reasoning_effort,
  workspace_id, fallback_model_key, supports_tools, priority, model_catalog_id,
  agent_slug
)
SELECT
  id, task_type, mode, model_key, provider,
  success_alpha, success_beta, cost_n, cost_mean, cost_m2,
  latency_n, latency_mean, latency_m2, decayed_score, last_decay_at,
  is_eligible, is_paused, pause_reason, updated_at,
  ai_model_id, last_chain_id, last_plan_id, avg_quality_score, quality_n,
  max_cost_per_call_usd, budget_exhausted, drift_signal_id, intent_slug,
  total_executions, workflow_agent, tools_json, is_active, reasoning_effort,
  workspace_id, fallback_model_key, supports_tools, priority, model_catalog_id,
  COALESCE(NULLIF(trim(agent_slug), ''), '')
FROM agentsam_routing_arms;

DROP TABLE agentsam_routing_arms;
ALTER TABLE agentsam_routing_arms__agent_slug_swap RENAME TO agentsam_routing_arms;

CREATE INDEX IF NOT EXISTS idx_arms_lookup
  ON agentsam_routing_arms(task_type, mode, is_eligible, is_paused);
CREATE INDEX IF NOT EXISTS idx_routing_arms_intent_slug
  ON agentsam_routing_arms(intent_slug);
CREATE INDEX IF NOT EXISTS idx_routing_arms_lookup
  ON agentsam_routing_arms(task_type, mode, is_eligible, is_paused, decayed_score DESC);
CREATE INDEX IF NOT EXISTS idx_routing_arms_model
  ON agentsam_routing_arms(ai_model_id);
CREATE INDEX IF NOT EXISTS idx_routing_arms_priority
  ON agentsam_routing_arms(task_type, mode, priority, is_active);
CREATE INDEX IF NOT EXISTS idx_routing_arms_task_mode
  ON agentsam_routing_arms(task_type, mode, is_eligible);
CREATE INDEX IF NOT EXISTS idx_routing_arms_task_mode_eligible
  ON agentsam_routing_arms(task_type, mode, is_eligible, is_paused);
CREATE INDEX IF NOT EXISTS idx_routing_arms_workspace_task
  ON agentsam_routing_arms(workspace_id, task_type, mode, is_active, is_eligible);
CREATE INDEX IF NOT EXISTS idx_routing_arms_agent_slug
  ON agentsam_routing_arms(agent_slug, task_type, mode, workspace_id);

PRAGMA foreign_keys=ON;
