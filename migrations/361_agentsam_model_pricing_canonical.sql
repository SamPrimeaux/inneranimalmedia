-- 361: agentsam_model_pricing (IF NOT EXISTS) + canonical Anthropic keys + arm migration.
-- Does NOT drop agentsam_model_pricing if already created manually.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/361_agentsam_model_pricing_canonical.sql

CREATE TABLE IF NOT EXISTS agentsam_model_pricing (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  pricing_kind TEXT NOT NULL DEFAULT 'standard',
  currency TEXT NOT NULL DEFAULT 'USD',
  input_rate_per_mtok REAL NOT NULL DEFAULT 0,
  output_rate_per_mtok REAL NOT NULL DEFAULT 0,
  cache_read_rate_per_mtok REAL NOT NULL DEFAULT 0,
  cache_write_5m_rate_per_mtok REAL NOT NULL DEFAULT 0,
  cache_write_1h_rate_per_mtok REAL NOT NULL DEFAULT 0,
  batch_input_rate_per_mtok REAL NOT NULL DEFAULT 0,
  batch_output_rate_per_mtok REAL NOT NULL DEFAULT 0,
  fast_mode_input_rate_per_mtok REAL,
  fast_mode_output_rate_per_mtok REAL,
  supports_prompt_cache INTEGER NOT NULL DEFAULT 0,
  supports_batch INTEGER NOT NULL DEFAULT 0,
  supports_fast_mode INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_url TEXT,
  source_label TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, model_key, pricing_kind, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_model_pricing_lookup
ON agentsam_model_pricing(provider, model_key, pricing_kind, is_active);

CREATE INDEX IF NOT EXISTS idx_agentsam_model_pricing_active
ON agentsam_model_pricing(is_active, provider, model_key);

INSERT OR REPLACE INTO agentsam_model_pricing (
  id, provider, model_key, pricing_kind, currency,
  input_rate_per_mtok, output_rate_per_mtok,
  cache_read_rate_per_mtok, cache_write_5m_rate_per_mtok, cache_write_1h_rate_per_mtok,
  batch_input_rate_per_mtok, batch_output_rate_per_mtok,
  fast_mode_input_rate_per_mtok, fast_mode_output_rate_per_mtok,
  supports_prompt_cache, supports_batch, supports_fast_mode,
  source_url, source_label, notes, is_active, updated_at
) VALUES
(
  'anthropic:claude-haiku-4-5-20251001:standard',
  'anthropic', 'claude-haiku-4-5-20251001', 'standard', 'USD',
  1.00, 5.00, 0.10, 1.25, 2.00, 0.50, 2.50, NULL, NULL,
  1, 1, 0,
  'https://platform.claude.com/docs/en/about-claude/pricing',
  'Anthropic Claude API pricing',
  'Claude Haiku 4.5. Cache read = 0.1x input. 5m cache write = 1.25x input. 1h cache write = 2x input. Batch = 50% discount.',
  1, datetime('now')
),
(
  'anthropic:claude-sonnet-4-6:standard',
  'anthropic', 'claude-sonnet-4-6', 'standard', 'USD',
  3.00, 15.00, 0.30, 3.75, 6.00, 1.50, 7.50, NULL, NULL,
  1, 1, 0,
  'https://platform.claude.com/docs/en/about-claude/pricing',
  'Anthropic Claude API pricing',
  'Claude Sonnet 4.6. Default Anthropic workhorse.',
  1, datetime('now')
),
(
  'anthropic:claude-opus-4-6:standard',
  'anthropic', 'claude-opus-4-6', 'standard', 'USD',
  5.00, 25.00, 0.50, 6.25, 10.00, 2.50, 12.50, NULL, NULL,
  1, 1, 0,
  'https://platform.claude.com/docs/en/about-claude/pricing',
  'Anthropic Claude API pricing',
  'Claude Opus 4.6 legacy/fallback.',
  1, datetime('now')
),
(
  'anthropic:claude-opus-4-7:standard',
  'anthropic', 'claude-opus-4-7', 'standard', 'USD',
  5.00, 25.00, 0.50, 6.25, 10.00, 2.50, 12.50, 30.00, 150.00,
  1, 1, 1,
  'https://platform.claude.com/docs/en/about-claude/pricing',
  'Anthropic Claude API pricing',
  'Claude Opus 4.7. Fast mode rates stored; routing disabled until owner approval.',
  1, datetime('now')
);

-- Canonical catalog rows (model_key = API id)
UPDATE agentsam_model_catalog SET
  provider = 'anthropic',
  anthropic_model_id = 'claude-haiku-4-5-20251001',
  api_platform = 'anthropic',
  cost_per_1k_in = 0.001,
  cost_per_1k_out = 0.005,
  context_window = 200000,
  max_output_tokens = 64000,
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE model_key = 'claude-haiku-4-5-20251001';

UPDATE agentsam_model_catalog SET
  provider = 'anthropic',
  anthropic_model_id = 'claude-sonnet-4-6',
  api_platform = 'anthropic',
  cost_per_1k_in = 0.003,
  cost_per_1k_out = 0.015,
  context_window = 1000000,
  max_output_tokens = 128000,
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE model_key = 'claude-sonnet-4-6';

UPDATE agentsam_model_catalog SET
  provider = 'anthropic',
  anthropic_model_id = 'claude-opus-4-6',
  api_platform = 'anthropic',
  cost_per_1k_in = 0.005,
  cost_per_1k_out = 0.025,
  context_window = 1000000,
  max_output_tokens = 128000,
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-6';

UPDATE agentsam_model_catalog SET
  provider = 'anthropic',
  anthropic_model_id = 'claude-opus-4-7',
  api_platform = 'anthropic',
  cost_per_1k_in = 0.005,
  cost_per_1k_out = 0.025,
  context_window = 1000000,
  max_output_tokens = 128000,
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-7';

-- Deprecate alias catalog rows (keep rows for FK/audit)
UPDATE agentsam_model_catalog SET
  is_active = 0,
  is_degraded = 1,
  degraded_reason = 'deprecated_alias_use_api_model_id',
  updated_at = unixepoch()
WHERE model_key IN (
  'anthropic_haiku_4_5',
  'anthropic_sonnet_4_6',
  'anthropic_opus_4_7',
  'claude-haiku-4-5',
  'anthropic/claude-opus-4.7',
  'wai-claude-opus-4-7'
);

-- Deprecate Workers AI Claude proxy rows
UPDATE agentsam_model_catalog SET
  is_active = 0,
  is_degraded = 1,
  degraded_reason = 'deprecated_workers_ai_claude_proxy',
  updated_at = unixepoch()
WHERE model_key LIKE 'wai-claude%';

UPDATE agentsam_ai SET status = 'deprecated', updated_at = unixepoch()
WHERE mode = 'model'
  AND model_key IN (
    'anthropic_haiku_4_5',
    'anthropic_sonnet_4_6',
    'anthropic_opus_4_7',
    'claude-haiku-4-5',
    'anthropic/claude-opus-4.7',
    'wai-claude-opus-4-7'
  );

-- Thompson routing arms → canonical model_key (delete alias when canonical slot already taken)
DELETE FROM agentsam_routing_arms
WHERE model_key = 'anthropic_haiku_4_5'
  AND EXISTS (
    SELECT 1 FROM agentsam_routing_arms c
    WHERE c.workspace_id = agentsam_routing_arms.workspace_id
      AND c.task_type = agentsam_routing_arms.task_type
      AND c.mode = agentsam_routing_arms.mode
      AND c.model_key = 'claude-haiku-4-5-20251001'
  );

DELETE FROM agentsam_routing_arms
WHERE model_key = 'anthropic_sonnet_4_6'
  AND EXISTS (
    SELECT 1 FROM agentsam_routing_arms c
    WHERE c.workspace_id = agentsam_routing_arms.workspace_id
      AND c.task_type = agentsam_routing_arms.task_type
      AND c.mode = agentsam_routing_arms.mode
      AND c.model_key = 'claude-sonnet-4-6'
  );

DELETE FROM agentsam_routing_arms
WHERE model_key = 'anthropic_opus_4_7'
  AND EXISTS (
    SELECT 1 FROM agentsam_routing_arms c
    WHERE c.workspace_id = agentsam_routing_arms.workspace_id
      AND c.task_type = agentsam_routing_arms.task_type
      AND c.mode = agentsam_routing_arms.mode
      AND c.model_key IN ('claude-opus-4-7', 'claude-opus-4-6')
  );

UPDATE agentsam_routing_arms SET model_key = 'claude-haiku-4-5-20251001', updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5';

UPDATE agentsam_routing_arms SET model_key = 'claude-sonnet-4-6', updated_at = unixepoch()
WHERE model_key = 'anthropic_sonnet_4_6';

UPDATE agentsam_routing_arms SET model_key = 'claude-opus-4-7', updated_at = unixepoch()
WHERE model_key = 'anthropic_opus_4_7';

UPDATE agentsam_prompt_routes SET preferred_model = 'claude-haiku-4-5-20251001', updated_at = unixepoch()
WHERE preferred_model = 'anthropic_haiku_4_5';

UPDATE agentsam_subagent_profile
SET output_schema_json = replace(
  replace(COALESCE(output_schema_json, '{}'), 'anthropic_haiku_4_5', 'claude-haiku-4-5-20251001'),
  'anthropic_sonnet_4_6', 'claude-sonnet-4-6'
),
updated_at = datetime('now')
WHERE output_schema_json LIKE '%anthropic_haiku_4_5%' OR output_schema_json LIKE '%anthropic_sonnet_4_6%';

-- Canonical agentsam_ai rows (API model id = model_key)
UPDATE agentsam_ai SET
  provider = 'anthropic',
  input_rate_per_mtok = 1,
  output_rate_per_mtok = 5,
  cache_read_rate_per_mtok = 0.10,
  cache_write_rate_per_mtok = 1.25,
  thinking_mode = 'adaptive',
  effort = NULL,
  status = 'active',
  updated_at = unixepoch()
WHERE model_key = 'claude-haiku-4-5-20251001' AND mode = 'model';

UPDATE agentsam_ai SET
  provider = 'anthropic',
  input_rate_per_mtok = 3,
  output_rate_per_mtok = 15,
  cache_read_rate_per_mtok = 0.30,
  cache_write_rate_per_mtok = 3.75,
  thinking_mode = 'adaptive',
  effort = 'medium',
  status = 'active',
  updated_at = unixepoch()
WHERE model_key = 'claude-sonnet-4-6' AND mode = 'model';

UPDATE agentsam_ai SET
  provider = 'anthropic',
  input_rate_per_mtok = 5,
  output_rate_per_mtok = 25,
  cache_read_rate_per_mtok = 0.50,
  cache_write_rate_per_mtok = 6.25,
  thinking_mode = 'adaptive',
  effort = 'medium',
  status = 'active',
  updated_at = unixepoch()
WHERE model_key IN ('claude-opus-4-6', 'claude-opus-4-7') AND mode = 'model';
