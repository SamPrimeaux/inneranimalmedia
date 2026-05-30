-- ============================================================
-- PART 1: Fix agentsam_spawn_session (was dropped, needs rebuild)
-- ============================================================
CREATE TABLE IF NOT EXISTS agentsam_spawn_session (
  id                TEXT PRIMARY KEY DEFAULT ('spawn_' || lower(hex(randomblob(8)))),
  workspace_id      TEXT NOT NULL,
  tenant_id         TEXT NOT NULL,
  parent_run_id     TEXT NOT NULL,
  child_run_id      TEXT,
  parent_session_id TEXT NOT NULL,
  child_session_id  TEXT NOT NULL,
  root_session_id   TEXT NOT NULL,
  fallback_model_key TEXT NOT NULL,
  reason            TEXT NOT NULL CHECK(reason IN ('budget','context')),
  urgency           TEXT NOT NULL CHECK(urgency IN ('low','medium','high')),
  depth             INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','expired')),
  accepted_at       INTEGER,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_spawn_child_session  ON agentsam_spawn_session(child_session_id, status);
CREATE INDEX idx_spawn_parent_session ON agentsam_spawn_session(parent_session_id);
CREATE INDEX idx_spawn_root_session   ON agentsam_spawn_session(root_session_id);
CREATE INDEX idx_spawn_workspace      ON agentsam_spawn_session(workspace_id, created_at);

-- ============================================================
-- PART 2: Add missing handoff columns to agentsam_context_digest
-- (parent_run_id already landed, session_id and next_session_id didn't)
-- ============================================================
ALTER TABLE agentsam_context_digest ADD COLUMN session_id      TEXT;
ALTER TABLE agentsam_context_digest ADD COLUMN next_session_id TEXT;

CREATE INDEX idx_digest_session_handoff ON agentsam_context_digest(session_id, digest_type);

-- ============================================================
-- PART 3: Fallback chains for every active code-capable arm
-- Chains follow cost order from agentsam_model_catalog:
--
-- micro tier (nano/haiku/flash-lite) → no fallback, they ARE the fallback
-- standard tier → micro fallback
-- power tier    → standard fallback
-- reasoning tier → power fallback
--
-- Code-capable routing lanes: codex, standard, reasoning
-- ============================================================

-- gpt-5.4-nano (micro, $0.0002/1k) → no fallback, terminal
-- gpt-4.1-nano (micro, $0.0001/1k) → no fallback, terminal
-- claude-haiku-4-5 (standard, $0.001/1k) → gpt-5.4-nano fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4-nano',
    max_cost_per_call_usd = 0.15
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'claude-haiku-4-5-20251001'
  AND is_active = 1;

-- gpt-5.4-mini (standard, $0.00075/1k) → gpt-5.4-nano fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4-nano',
    max_cost_per_call_usd = 0.20
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'gpt-5.4-mini'
  AND is_active = 1;

-- gemini-3.5-flash (standard, $0.0015/1k) → gpt-5.4-nano fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4-nano',
    max_cost_per_call_usd = 0.20
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'gemini-3.5-flash'
  AND is_active = 1;

-- gemini-3.1-pro-preview (power, $0.000125/1k) → gpt-5.4-nano fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4-nano',
    max_cost_per_call_usd = 0.20
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key IN ('gemini-3.1-pro-preview','gemini-3.1-pro-preview-customtools')
  AND is_active = 1;

-- claude-sonnet-4-6 (power, $0.003/1k) → claude-haiku fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'claude-haiku-4-5-20251001',
    max_cost_per_call_usd = 0.60
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'claude-sonnet-4-6'
  AND is_active = 1;

-- gpt-5.4 (power, $0.0025/1k) → gpt-5.4-mini fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4-mini',
    max_cost_per_call_usd = 0.75
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'gpt-5.4'
  AND is_active = 1;

-- gpt-5.1-codex-mini (codex flash, $0.00025/1k) → gpt-5.4-nano fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4-nano',
    max_cost_per_call_usd = 0.20
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'gpt-5.1-codex-mini'
  AND is_active = 1;

-- gpt-5.1-codex / gpt-5.2-codex / gpt-5.3-codex (codex power) → gpt-5.1-codex-mini fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.1-codex-mini',
    max_cost_per_call_usd = 0.80
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key IN ('gpt-5.1-codex','gpt-5.2-codex','gpt-5.3-codex','gpt-5.1-codex-max','gpt-5-codex')
  AND is_active = 1;

-- composer-2.5 (codex power, $0.0005/1k) → gpt-5.1-codex-mini fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.1-codex-mini',
    max_cost_per_call_usd = 0.30
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'composer-2.5'
  AND is_active = 1;

-- claude-opus-4-6 / 4-7 / 4-8 (reasoning, $0.005/1k) → claude-sonnet fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'claude-sonnet-4-6',
    max_cost_per_call_usd = 1.50
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key IN ('claude-opus-4-6','claude-opus-4-7','claude-opus-4-8')
  AND is_active = 1;

-- gpt-5 (reasoning, $0.015/1k) → gpt-5.4 fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4',
    max_cost_per_call_usd = 2.00
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'gpt-5'
  AND is_active = 1;

-- o3 (reasoning, $0.02/1k) → gpt-5.4 fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4',
    max_cost_per_call_usd = 2.00
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'o3'
  AND is_active = 1;

-- o4-mini (reasoning, $0.0011/1k) → gpt-5.4-mini fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gpt-5.4-mini',
    max_cost_per_call_usd = 0.30
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'o4-mini'
  AND is_active = 1;

-- gemini-3-pro / gemini-3-flash (reasoning/standard) → gemini-3.5-flash fallback
UPDATE agentsam_routing_arms
SET fallback_model_key = 'gemini-3.5-flash',
    max_cost_per_call_usd = 0.50
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key IN ('gemini-3-pro-preview','gemini-3-flash-preview','gemini-pro-latest','gemini-flash-latest')
  AND is_active = 1;
