-- Conservative ai_models normalization (review audit output first).
-- Does NOT drop tables or touch agent_model_registry pricing for OpenAI/Anthropic (manual review).
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./scripts/repair-model-catalog-safe.sql

-- Cloudflare Workers AI model keys
UPDATE ai_models
SET provider = 'cloudflare',
    api_platform = 'workers_ai',
    updated_at = unixepoch()
WHERE model_key LIKE '@cf/%'
  AND (
    COALESCE(provider, '') != 'cloudflare'
    OR COALESCE(api_platform, '') != 'workers_ai'
  );

-- Gemini API catalog rows (not Vertex)
UPDATE ai_models
SET provider = 'google',
    api_platform = 'gemini_api',
    updated_at = unixepoch()
WHERE COALESCE(api_platform, '') NOT IN ('vertex_ai', 'vertex')
  AND (
    COALESCE(provider, '') = 'gemini'
    OR (
      COALESCE(provider, '') = 'google'
      AND LOWER(model_key) LIKE 'gemini%'
    )
  );

-- Granite micro: fallback-only visibility and routing flags
UPDATE ai_models
SET show_in_picker = 0,
    picker_eligible = 0,
    supports_tools = 0,
    sort_order = 999,
    metadata_json = json_patch(COALESCE(metadata_json, '{}'), '{"fallback_only":true,"normal_agent_routing":false}'),
    updated_at = unixepoch()
WHERE LOWER(model_key) LIKE '%granite%';
