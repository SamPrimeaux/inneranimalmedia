-- 532: DeepSeek V4 only — deepseek-v4-flash + deepseek-v4-pro (main worker AGENTSAM_DEEPSEEK).
-- Prod schema: model_key UNIQUE (no tenant_id), provider CHECK must include deepseek.
--
-- Verify:
--   SELECT model_key, provider, api_platform, openai_model_id, thinking_policy, is_active
--   FROM agentsam_model_catalog WHERE model_key LIKE 'deepseek-v4%' ORDER BY model_key;

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS agentsam_model_catalog__532 (
  id                    TEXT PRIMARY KEY DEFAULT ('mdl_' || lower(hex(randomblob(6)))),
  model_key             TEXT UNIQUE NOT NULL,
  display_name          TEXT NOT NULL,
  provider              TEXT NOT NULL CHECK(provider IN ('anthropic','openai','google','workers_ai','ollama','cursor','deepseek')),
  tier                  TEXT NOT NULL CHECK(tier IN ('micro','flash','standard','power','reasoning')),
  anthropic_model_id    TEXT DEFAULT NULL,
  openai_model_id       TEXT DEFAULT NULL,
  google_model_id       TEXT DEFAULT NULL,
  workers_ai_model_id   TEXT DEFAULT NULL,
  ollama_model_id       TEXT DEFAULT NULL,
  context_window        INTEGER NOT NULL,
  max_output_tokens     INTEGER NOT NULL,
  cost_per_1k_in        REAL NOT NULL DEFAULT 0,
  cost_per_1k_out       REAL NOT NULL DEFAULT 0,
  cost_per_tool_call    REAL NOT NULL DEFAULT 0,
  cost_notes            TEXT DEFAULT NULL,
  supports_tools        INTEGER NOT NULL DEFAULT 0,
  supports_vision       INTEGER NOT NULL DEFAULT 0,
  supports_streaming    INTEGER NOT NULL DEFAULT 1,
  supports_json_mode    INTEGER NOT NULL DEFAULT 0,
  supports_reasoning    INTEGER NOT NULL DEFAULT 0,
  reasoning_effort      TEXT DEFAULT NULL CHECK(reasoning_effort IN ('low','medium','high',NULL)),
  avg_latency_p50_ms    INTEGER DEFAULT NULL,
  avg_latency_p95_ms    INTEGER DEFAULT NULL,
  quality_score         REAL DEFAULT NULL,
  total_calls           INTEGER DEFAULT 0,
  total_failures        INTEGER DEFAULT 0,
  rate_limit_rpm        INTEGER DEFAULT NULL,
  rate_limit_tpd        INTEGER DEFAULT NULL,
  is_active             INTEGER NOT NULL DEFAULT 1,
  is_degraded           INTEGER NOT NULL DEFAULT 0,
  budget_exhausted      INTEGER NOT NULL DEFAULT 0,
  degraded_reason       TEXT DEFAULT NULL,
  created_at            INTEGER DEFAULT (unixepoch()),
  updated_at            INTEGER DEFAULT (unixepoch()),
  api_platform          TEXT,
  supports_code_execution INTEGER NOT NULL DEFAULT 0,
  supports_compaction   INTEGER NOT NULL DEFAULT 0,
  supports_effort_scaling INTEGER NOT NULL DEFAULT 0,
  thinking_policy       TEXT NOT NULL DEFAULT 'omitted',
  routing_lane          TEXT NOT NULL DEFAULT 'unknown',
  deprecated_after      TEXT,
  cost_per_1k_cached_in REAL NOT NULL DEFAULT 0,
  web_tool_mode         TEXT NOT NULL DEFAULT 'none' CHECK(web_tool_mode IN ('none','standard_metered_tokens','fixed_8k_block','preview_reasoning_metered_tokens','preview_nonreasoning_free_search_content')),
  supports_containers   INTEGER NOT NULL DEFAULT 0,
  container_execution_mode TEXT DEFAULT NULL CHECK(container_execution_mode IN (NULL,'external_sandbox','hosted_shell')),
  supports_adaptive_thinking INTEGER DEFAULT 0
);

INSERT INTO agentsam_model_catalog__532
SELECT * FROM agentsam_model_catalog;

DROP TABLE agentsam_model_catalog;
ALTER TABLE agentsam_model_catalog__532 RENAME TO agentsam_model_catalog;

PRAGMA foreign_keys = ON;

-- Retire any other DeepSeek API catalog rows (not Workers AI @cf/*).
UPDATE agentsam_model_catalog
SET is_active = 0,
    is_degraded = 1,
    degraded_reason = 'deepseek_v4_only',
    updated_at = unixepoch()
WHERE LOWER(TRIM(provider)) = 'deepseek'
  AND model_key NOT IN ('deepseek-v4-flash', 'deepseek-v4-pro');

UPDATE agentsam_ai
SET status = 'deprecated',
    show_in_picker = 0,
    picker_eligible = 0,
    updated_at = unixepoch()
WHERE LOWER(TRIM(provider)) = 'deepseek'
  AND model_key NOT IN ('deepseek-v4-flash', 'deepseek-v4-pro')
  AND mode = 'model';

INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier,
  openai_model_id, api_platform, thinking_policy,
  context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, cost_per_1k_cached_in,
  supports_tools, supports_vision, supports_streaming, supports_json_mode, supports_reasoning,
  reasoning_effort, is_active, is_degraded, budget_exhausted,
  cost_notes, updated_at
) VALUES
(
  'mdl_deepseek_v4_flash',
  'deepseek-v4-flash',
  'DeepSeek V4 Flash',
  'deepseek',
  'flash',
  'deepseek-v4-flash',
  'deepseek',
  'omitted',
  1000000,
  384000,
  0.00014,
  0.00028,
  0.0000028,
  1, 0, 1, 1, 1,
  'medium',
  1, 0, 0,
  'secret=AGENTSAM_DEEPSEEK;api_base=https://api.deepseek.com;cache_hit_in_per_mtok=0.0028;tools=1;thinking_policy=omitted',
  unixepoch()
),
(
  'mdl_deepseek_v4_pro',
  'deepseek-v4-pro',
  'DeepSeek V4 Pro',
  'deepseek',
  'power',
  'deepseek-v4-pro',
  'deepseek',
  'enabled',
  1000000,
  384000,
  0.000435,
  0.00087,
  0.000003625,
  1, 0, 1, 1, 1,
  'high',
  1, 0, 0,
  'secret=AGENTSAM_DEEPSEEK;api_base=https://api.deepseek.com;cache_hit_in_per_mtok=0.003625;tools=1;thinking_policy=enabled',
  unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  provider = excluded.provider,
  tier = excluded.tier,
  openai_model_id = excluded.openai_model_id,
  api_platform = excluded.api_platform,
  thinking_policy = excluded.thinking_policy,
  context_window = excluded.context_window,
  max_output_tokens = excluded.max_output_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  cost_per_1k_cached_in = excluded.cost_per_1k_cached_in,
  supports_tools = excluded.supports_tools,
  supports_vision = excluded.supports_vision,
  supports_streaming = excluded.supports_streaming,
  supports_json_mode = excluded.supports_json_mode,
  supports_reasoning = excluded.supports_reasoning,
  reasoning_effort = excluded.reasoning_effort,
  is_active = 1,
  is_degraded = 0,
  degraded_reason = NULL,
  cost_notes = excluded.cost_notes,
  updated_at = unixepoch();

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible,
  requires_human_approval, sort_order, picker_group, is_global,
  supports_prompt_cache, input_rate_per_mtok, output_rate_per_mtok, cache_read_rate_per_mtok,
  updated_at
)
SELECT
  'ai_deepseek_v4_flash',
  '',
  'DeepSeek V4 Flash',
  'deepseek_flash',
  'Cheap tool-capable synthesis — batch, docs, recall subagents.',
  'active',
  'model',
  'deepseek-v4-flash',
  'deepseek',
  'deepseek',
  'AGENTSAM_DEEPSEEK',
  1,
  1,
  0,
  82,
  'DEEPSEEK',
  1,
  1,
  0.14,
  0.28,
  0.0028,
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_ai WHERE model_key = 'deepseek-v4-flash' AND mode = 'model'
);

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible,
  requires_human_approval, sort_order, picker_group, is_global,
  supports_prompt_cache, input_rate_per_mtok, output_rate_per_mtok, cache_read_rate_per_mtok,
  updated_at
)
SELECT
  'ai_deepseek_v4_pro',
  '',
  'DeepSeek V4 Pro',
  'deepseek_pro',
  'Stronger DeepSeek tier — planning and synthesis with thinking mode.',
  'active',
  'model',
  'deepseek-v4-pro',
  'deepseek',
  'deepseek',
  'AGENTSAM_DEEPSEEK',
  1,
  1,
  0,
  83,
  'DEEPSEEK',
  1,
  1,
  0.435,
  0.87,
  0.003625,
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_ai WHERE model_key = 'deepseek-v4-pro' AND mode = 'model'
);

UPDATE agentsam_ai
SET status = 'active',
    show_in_picker = 1,
    picker_eligible = 1,
    provider = 'deepseek',
    api_platform = 'deepseek',
    secret_key_name = 'AGENTSAM_DEEPSEEK',
    supports_prompt_cache = 1,
    updated_at = unixepoch()
WHERE model_key IN ('deepseek-v4-flash', 'deepseek-v4-pro')
  AND mode = 'model';

UPDATE agentsam_ai
SET input_rate_per_mtok = 0.14,
    output_rate_per_mtok = 0.28,
    cache_read_rate_per_mtok = 0.0028,
    updated_at = unixepoch()
WHERE model_key = 'deepseek-v4-flash' AND mode = 'model';

UPDATE agentsam_ai
SET input_rate_per_mtok = 0.435,
    output_rate_per_mtok = 0.87,
    cache_read_rate_per_mtok = 0.003625,
    updated_at = unixepoch()
WHERE model_key = 'deepseek-v4-pro' AND mode = 'model';

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
  'deepseek:deepseek-v4-flash:standard',
  'deepseek', 'deepseek-v4-flash', 'standard', 'USD',
  0.14, 0.28, 0.0028, 0, 0, NULL, NULL, NULL, NULL,
  1, 0, 0,
  'https://api-docs.deepseek.com/quick_start/pricing',
  'DeepSeek API pricing',
  'V4 Flash. Disk context cache — cache hit input $0.0028/MTok.',
  1, datetime('now')
),
(
  'deepseek:deepseek-v4-pro:standard',
  'deepseek', 'deepseek-v4-pro', 'standard', 'USD',
  0.435, 0.87, 0.003625, 0, 0, NULL, NULL, NULL, NULL,
  1, 0, 0,
  'https://api-docs.deepseek.com/quick_start/pricing',
  'DeepSeek API pricing',
  'V4 Pro. Disk context cache — cache hit input $0.003625/MTok.',
  1, datetime('now')
);
