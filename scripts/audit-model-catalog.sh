#!/usr/bin/env bash
# Remote D1 audit: ai_models vs agent_model_registry (enrichment only).
# Requires ./scripts/with-cloudflare-env.sh + wrangler auth.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

WRAPPER=(./scripts/with-cloudflare-env.sh)
EXEC=(npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml)

run_q () {
  local title="$1"
  local sql="$2"
  echo ""
  echo "=== ${title} ==="
  "${WRAPPER[@]}" "${EXEC[@]}" --command="$sql"
}

echo "=== Model catalog audit (remote D1: inneranimalmedia-business) ==="

run_q "1. Counts by provider + api_platform (ai_models)" \
"SELECT provider, COALESCE(api_platform,'') AS api_platform, COUNT(*) AS n FROM ai_models GROUP BY provider, api_platform ORDER BY provider, api_platform;"

run_q "2. Active picker models (show_in_picker)" \
"SELECT id, model_key, provider, api_platform, show_in_picker, picker_eligible, sort_order FROM ai_models WHERE COALESCE(is_active,0)=1 AND COALESCE(show_in_picker,0)=1 ORDER BY sort_order, display_name;"

run_q "3. Active models with missing api_platform" \
"SELECT id, model_key, provider, display_name FROM ai_models WHERE COALESCE(is_active,0)=1 AND (api_platform IS NULL OR TRIM(api_platform)='');"

run_q "4. Active models with missing pricing (rates null)" \
"SELECT id, model_key, provider, api_platform, input_rate_per_mtok, output_rate_per_mtok FROM ai_models WHERE COALESCE(is_active,0)=1 AND (input_rate_per_mtok IS NULL OR output_rate_per_mtok IS NULL);"

run_q "5a. Active models with supports_tools null" \
"SELECT id, model_key, provider, api_platform, supports_tools FROM ai_models WHERE COALESCE(is_active,0)=1 AND supports_tools IS NULL;"

run_q "5b. Active Workers AI with supports_tools=1 (verify tool calling)" \
"SELECT id, model_key, display_name, supports_tools FROM ai_models WHERE COALESCE(is_active,0)=1 AND LOWER(COALESCE(api_platform,''))='workers_ai' AND COALESCE(supports_tools,0)=1 ORDER BY model_key;"

run_q "6. Workers AI models visible in picker" \
"SELECT id, model_key, display_name, api_platform, show_in_picker, picker_eligible FROM ai_models WHERE COALESCE(is_active,0)=1 AND COALESCE(show_in_picker,0)=1 AND LOWER(COALESCE(api_platform,''))='workers_ai' ORDER BY sort_order;"

run_q "7. Granite row(s)" \
"SELECT id, model_key, provider, api_platform, show_in_picker, picker_eligible, supports_tools, sort_order, metadata_json FROM ai_models WHERE LOWER(model_key) LIKE '%granite%' OR LOWER(display_name) LIKE '%granite%';"

run_q "8. Duplicate model_key in ai_models (should be unique)" \
"SELECT model_key, COUNT(*) AS n FROM ai_models GROUP BY model_key HAVING COUNT(*) > 1 ORDER BY n DESC;"

run_q "9a. Overlap join (same provider + model_key): pricing deltas (manual review)" \
"SELECT m.provider, m.model_key, m.input_rate_per_mtok AS ai_in, m.output_rate_per_mtok AS ai_out, r.input_cost_per_1m AS reg_in, r.output_cost_per_1m AS reg_out FROM ai_models m INNER JOIN agent_model_registry r ON r.provider = m.provider AND r.model_key = m.model_key WHERE ABS(COALESCE(m.input_rate_per_mtok,0) - COALESCE(r.input_cost_per_1m,0)) > 0.0001 OR ABS(COALESCE(m.output_rate_per_mtok,0) - COALESCE(r.output_cost_per_1m,0)) > 0.0001 ORDER BY m.provider, m.model_key;"

run_q "9b. Registry-only keys (enrichment candidates)" \
"SELECT r.provider, r.model_key FROM agent_model_registry r WHERE NOT EXISTS (SELECT 1 FROM ai_models m WHERE m.provider = r.provider AND m.model_key = r.model_key) ORDER BY r.provider, r.model_key LIMIT 80;"

run_q "9c. ai_models-only keys (not in registry)" \
"SELECT m.provider, m.model_key, m.display_name FROM ai_models m WHERE NOT EXISTS (SELECT 1 FROM agent_model_registry r WHERE r.provider = m.provider AND r.model_key = m.model_key) ORDER BY m.provider, m.model_key LIMIT 80;"

echo ""
echo "=== Done ==="
