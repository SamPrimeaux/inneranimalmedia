-- 640: MiniMax M3 Workers AI lane — catalog + Agent Sam picker row.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/640_minimax_m3_workers_ai_catalog.sql

INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier,
  workers_ai_model_id, api_platform, routing_lane,
  context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out,
  supports_tools, supports_vision, supports_streaming, supports_json_mode, supports_reasoning,
  is_active, is_degraded, budget_exhausted, cost_notes, updated_at
) VALUES (
  'mdl_wai_minimax_m3',
  'wai-minimax-m3',
  'MiniMax M3',
  'workers_ai',
  'standard',
  '@cf/minimax/m3',
  'workers_ai',
  'general',
  256000,
  8192,
  0.000350,
  0.001100,
  1, 0, 1, 1, 1,
  1, 0, 0,
  'role=execos_demo_primary;binding=AGENTSAM_WAI;workers_ai_catalog=minimax/m3;verify CF catalog enrollment.',
  unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  workers_ai_model_id = excluded.workers_ai_model_id,
  api_platform = excluded.api_platform,
  routing_lane = excluded.routing_lane,
  is_active = 1,
  is_degraded = 0,
  degraded_reason = NULL,
  cost_notes = excluded.cost_notes,
  updated_at = unixepoch();

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT
  'ai_wai_minimax_m3',
  '',
  'MiniMax M3',
  'minimax_m3',
  'Workers AI MiniMax M3 via AGENTSAM_WAI — ExecOS demo + /agentsam /models lane.',
  'active',
  'model',
  'wai-minimax-m3',
  'workers_ai',
  'workers_ai',
  NULL,
  1,
  1,
  0,
  380,
  'Workers AI / MiniMax',
  1,
  1,
  0.35,
  1.10,
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_ai WHERE model_key = 'wai-minimax-m3' AND mode = 'model'
);

-- Retire deprecated llama 3.1 WAI rows from active picker (May 2026 CF deprecation).
UPDATE agentsam_model_catalog
SET is_active = 0,
    is_degraded = 1,
    degraded_reason = 'cf_deprecated_2026-05-30_use_wai-minimax-m3_or_glm',
    updated_at = unixepoch()
WHERE workers_ai_model_id IN (
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  '@cf/meta/llama-3-8b-instruct'
)
  AND model_key NOT IN ('wai-minimax-m3');

UPDATE agentsam_ai
SET status = 'deprecated',
    show_in_picker = 0,
    picker_eligible = 0,
    updated_at = unixepoch()
WHERE provider = 'workers_ai'
  AND model_key IN (
    SELECT model_key FROM agentsam_model_catalog
    WHERE workers_ai_model_id IN (
      '@cf/meta/llama-3.1-8b-instruct',
      '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
      '@cf/meta/llama-3-8b-instruct'
    )
  )
  AND model_key != 'wai-minimax-m3';
