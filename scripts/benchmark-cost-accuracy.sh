#!/usr/bin/env bash
# benchmark-cost-accuracy.sh — Per-model cost: API vs agent_telemetry vs ai_models rates
# Usage: ./scripts/benchmark-cost-accuracy.sh [sandbox|prod]
# Requires: IAM_SESSION_COOKIE (uuid or session=uuid), CLOUDFLARE_API_TOKEN (via .env.cloudflare or env)
# Read-only D1 queries; POST /api/agent/chat only.

set -euo pipefail

TARGET="${1:-sandbox}"
if [[ "$TARGET" == "prod" ]]; then
  BASE_URL="https://inneranimalmedia.com"
else
  BASE_URL="https://inneranimal-dashboard.meauxbility.workers.dev"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WRANGLER_CONFIG="${REPO_ROOT}/wrangler.production.toml"
WRANGLER_BIN="${REPO_ROOT}/scripts/with-cloudflare-env.sh"

FIXED_PROMPT="Reply with exactly: 'Cost tracking test OK.' Nothing else."
DELAY_AFTER_CALL="${BENCHMARK_COST_DELAY:-3}"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SESSION_COOKIE_RAW="${IAM_SESSION_COOKIE:-}"
# Trim spaces (e.g. pasted production cookie)
SESSION_COOKIE_RAW="${SESSION_COOKIE_RAW#"${SESSION_COOKIE_RAW%%[![:space:]]*}"}"
SESSION_COOKIE_RAW="${SESSION_COOKIE_RAW%"${SESSION_COOKIE_RAW##*[![:space:]]}"}"
if [[ -z "$SESSION_COOKIE_RAW" ]]; then
  echo "ERROR: IAM_SESSION_COOKIE not set. Export it before running." >&2
  echo "  Example (sandbox): export IAM_SESSION_COOKIE=\"<uuid>\"" >&2
  exit 1
fi
# Accept raw uuid or full session=... cookie fragment
if [[ "$SESSION_COOKIE_RAW" != session=* ]]; then
  COOKIE_HEADER="session=${SESSION_COOKIE_RAW}"
else
  COOKIE_HEADER="$SESSION_COOKIE_RAW"
fi

SUMMARY_ROWS=$(mktemp)
trap 'rm -f "$SUMMARY_ROWS"' EXIT

print_header() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║  AGENT SAM — COST ACCURACY BENCHMARK                            ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}"
  echo -e "  Target : $BASE_URL"
  echo -e "  Time   : $(date '+%Y-%m-%d %H:%M:%S')"
  echo -e "  Prompt : \"$FIXED_PROMPT\""
  echo ""
  printf "  %-40s %-10s %-12s %-12s %-12s %-10s %s\n" \
    "MODEL" "STATUS" "BENCH \$" "TELEM \$" "EXPECTED \$" "DRIFT" "NOTE"
  echo "  $(printf '─%.0s' {1..110})"
}

# $1=model_key $2=provider
run_model_test() {
  local MODEL_KEY="$1"
  local PROVIDER="$2"
  local DISPLAY="${MODEL_KEY:0:38}"

  # Slight lead so server created_at is not below window if clocks differ
  local START_TS
  START_TS=$(($(date +%s) - 5))

  local JSON_BODY
  JSON_BODY="$(
    FIXED_PROMPT="$FIXED_PROMPT" MODEL_KEY="$MODEL_KEY" python3 - <<'PY'
import json, os
print(json.dumps({
  "messages": [{"role": "user", "content": os.environ["FIXED_PROMPT"]}],
  "model_id": os.environ["MODEL_KEY"],
  "stream": True,
}))
PY
  )"

  local RESPONSE
  RESPONSE=$(
    curl -sS --max-time 120 -X POST "${BASE_URL}/api/agent/chat" \
      -H "Content-Type: application/json" \
      -H "Cookie: ${COOKIE_HEADER}" \
      -d "$JSON_BODY" 2>/dev/null || echo '{"error":"curl_failed"}'
  )

  local HTTP_STATUS="ok"
  if echo "$RESPONSE" | grep -q '"type":"error"'; then
    HTTP_STATUS="error"
  fi
  if echo "$RESPONSE" | grep -q '"error"'; then
    if ! echo "$RESPONSE" | grep -q '"type":"text"'; then
      HTTP_STATUS="error"
    fi
  fi

  # SSE / JSON: last cost_usd in stream (same idea as benchmark-full.sh)
  local BENCH_COST
  BENCH_COST=$(
    echo "$RESPONSE" | grep -oE '"cost_usd":[0-9.eE+-]+' | tail -1 | cut -d: -f2 || true
  )
  if [[ -z "${BENCH_COST:-}" ]]; then
    BENCH_COST=$(
      echo "$RESPONSE" | python3 -c "
import sys, re
last = '0'
for m in re.finditer(r'\"cost_usd\"\s*:\s*([0-9.eE+-]+)', sys.stdin.read()):
    last = m.group(1)
print(last)
" 2>/dev/null || echo "0"
    )
  fi
  [[ -z "${BENCH_COST:-}" ]] && BENCH_COST="0"

  sleep "$DELAY_AFTER_CALL"

  local TELEM_ROW
  TELEM_ROW=$(
    "$WRANGLER_BIN" npx wrangler d1 execute inneranimalmedia-business --remote \
      --config "$WRANGLER_CONFIG" \
      --json \
      --command="SELECT input_tokens, output_tokens, computed_cost_usd, provider
                 FROM agent_telemetry
                 WHERE model_used = '${MODEL_KEY//\'/\'\'}'
                   AND created_at >= ${START_TS}
                 ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | \
      python3 -c "
import sys, json
try:
  data = json.load(sys.stdin)
  rows = data[0].get('results', []) if data else []
  if rows:
    r = rows[0]
    print(r.get('input_tokens',0), r.get('output_tokens',0), r.get('computed_cost_usd',0))
  else:
    print('0 0 0')
except Exception:
  print('0 0 0')
" 2>/dev/null || echo "0 0 0"
  )

  read -r TELEM_IN TELEM_OUT TELEM_COST <<< "$TELEM_ROW"

  local RATE_ROW
  RATE_ROW=$(
    "$WRANGLER_BIN" npx wrangler d1 execute inneranimalmedia-business --remote \
      --config "$WRANGLER_CONFIG" \
      --json \
      --command="SELECT input_rate_per_mtok, output_rate_per_mtok, COALESCE(billing_unit,'tokens') AS billing_unit, COALESCE(neurons_usd_per_1k,0) AS neurons_usd_per_1k
                 FROM ai_models WHERE model_key = '${MODEL_KEY//\'/\'\'}' LIMIT 1;" 2>/dev/null | \
      python3 -c "
import sys, json
try:
  data = json.load(sys.stdin)
  rows = data[0].get('results', []) if data else []
  if rows:
    r = rows[0]
    print(r.get('input_rate_per_mtok',0), r.get('output_rate_per_mtok',0),
          r.get('billing_unit','tokens'), r.get('neurons_usd_per_1k',0))
  else:
    print('0 0 tokens 0')
except Exception:
  print('0 0 tokens 0')
" 2>/dev/null || echo "0 0 tokens 0"
  )

  read -r IN_RATE OUT_RATE BILLING NEURON_RATE <<< "$RATE_ROW"

  local EXPECTED_COST
  EXPECTED_COST=$(
    python3 -c "
in_tok=${TELEM_IN:-0}
out_tok=${TELEM_OUT:-0}
in_rate=float('${IN_RATE:-0}')
out_rate=float('${OUT_RATE:-0}')
billing='${BILLING:-tokens}'
neuron=float('${NEURON_RATE:-0}')
if billing == 'tokens':
    cost = (in_tok / 1_000_000) * in_rate + (out_tok / 1_000_000) * out_rate
elif 'neuron' in billing.lower():
    cost = ((in_tok + out_tok) / 1000.0) * neuron
else:
    cost = 0.0
print(round(cost, 8))
" 2>/dev/null || echo "0"
  )

  local DRIFT_PCT="n/a"
  local STATUS_ICON="ok"
  local DRIFT_FLAG=""

  if [[ "$PROVIDER" == "workers_ai" ]]; then
    STATUS_ICON="FREE"
    DRIFT_FLAG="FREE tier (expect \$0)"
  elif [[ "$HTTP_STATUS" == "error" ]]; then
    STATUS_ICON="ERR"
    DRIFT_FLAG="request failed"
  elif python3 -c "import sys; sys.exit(0 if float('${TELEM_COST:-0}') == 0 else 1)" 2>/dev/null; then
    if [[ "$MODEL_KEY" == "gemini-2.5-flash" ]]; then
      STATUS_ICON="PARTIAL"
      DRIFT_FLAG="known partial tracking (~23% zero rows / 24h audit)"
    else
      STATUS_ICON="MISS"
      DRIFT_FLAG="not tracked (telem \$0)"
    fi
  else
    DRIFT_PCT=$(python3 -c "
t=float('${TELEM_COST:-0}'); e=float('${EXPECTED_COST:-0}')
if e > 0:
    pct = ((t - e) / e) * 100
    print(f'{pct:+.1f}%')
else:
    print('n/a')
" 2>/dev/null || echo "n/a")

    if [[ "$MODEL_KEY" == "claude-opus-4-6" ]]; then
      DRIFT_FLAG="STALE RATE (DB \$5/\$25 vs real \$15/\$75)"
    fi

    local ABS_DRIFT
    ABS_DRIFT=$(python3 -c "
t=float('${TELEM_COST:-0}'); e=float('${EXPECTED_COST:-0}')
print(abs(((t-e)/e)*100) if e > 0 else 0)
" 2>/dev/null || echo "0")
    if python3 -c "exit(0 if float('${ABS_DRIFT:-0}') > 15 else 1)" 2>/dev/null; then
      STATUS_ICON="DRIFT"
    else
      STATUS_ICON="OK"
    fi
  fi

  local ZERO_MISS=0
  if python3 -c "import sys; sys.exit(0 if float('${TELEM_COST:-0}') == 0 and '${PROVIDER}' != 'workers_ai' else 1)" 2>/dev/null; then
    ZERO_MISS=1
  fi

  printf "  %-40s %-10s %-12s %-12s %-12s %-10s %s\n" \
    "$DISPLAY" \
    "$STATUS_ICON" \
    "$(printf '\$%.6f' "${BENCH_COST:-0}")" \
    "$(printf '\$%.6f' "${TELEM_COST:-0}")" \
    "$(printf '\$%.6f' "${EXPECTED_COST:-0}")" \
    "$DRIFT_PCT" \
    "$DRIFT_FLAG"

  # provider|bench|telem|exp|zero_miss (for summary)
  echo "${PROVIDER} ${BENCH_COST} ${TELEM_COST} ${EXPECTED_COST} ${ZERO_MISS}" >> "$SUMMARY_ROWS"
}

print_provider_section() {
  echo ""
  echo -e "${CYAN}── $1 ──────────────────────────────────────────────────────────────${RESET}"
}

print_summary() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║  TRACKING ACCURACY SUMMARY BY PROVIDER                          ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  printf "  %-16s %-6s %-14s %-14s %-14s %-10s %-8s %-24s\n" \
    "PROVIDER" "CALLS" "BENCH TOTAL" "TELEM TOTAL" "EXPECTED TOTAL" "DRIFT %" "ZEROS" "VERDICT"
  echo "  $(printf '─%.0s' {1..110})"

  SUMMARY_ROWS="$SUMMARY_ROWS" python3 <<'PY'
import os
from collections import defaultdict

path = os.environ["SUMMARY_ROWS"]
acc = defaultdict(lambda: {"calls": 0, "bench": 0.0, "telem": 0.0, "exp": 0.0, "zeros": 0})

with open(path) as f:
    for line in f:
        parts = line.split()
        if len(parts) < 5:
            continue
        prov = parts[0]
        bench, telem, exp, zm = float(parts[1]), float(parts[2]), float(parts[3]), int(parts[4])
        a = acc[prov]
        a["calls"] += 1
        a["bench"] += bench
        a["telem"] += telem
        a["exp"] += exp
        a["zeros"] += zm

order = ["anthropic", "openai", "google", "workers_ai"]
for prov in order:
    if prov not in acc:
        continue
    a = acc[prov]
    calls = a["calls"]
    tb, tt, te = a["bench"], a["telem"], a["exp"]
    zeros = int(a["zeros"])
    if prov == "workers_ai":
        drift_s = "n/a"
        verdict = "FREE TIER (expect $0 telem)"
    else:
        if te > 0:
            drift_pct = ((tt - te) / te) * 100
            drift_s = f"{drift_pct:+.1f}%"
        else:
            drift_s = "n/a"
        abs_d = abs((tt - te) / te * 100) if te > 0 else 0.0
        verdict = "ACCURATE"
        if zeros >= calls and calls > 0:
            verdict = "NOT TRACKED (all telem $0)"
        elif abs_d > 15 and te > 0:
            verdict = "DRIFT (telem vs expected >15%)"
        elif zeros > 0:
            verdict = f"PARTIAL ({zeros} zero-cost miss(es))"
    print(
        f"{prov:16} {calls:6} ${tb:12.6f} ${tt:12.6f} ${te:12.6f} {drift_s:10} {zeros:8} {verdict}"
    )
PY

  echo ""
  echo -e "${BOLD}── KNOWN ISSUES (D1 / product audit) ─────────────────────────────────${RESET}"
  echo "  - workers_ai: computed_cost_usd = 0 in telemetry is expected (FREE tier). OK."
  echo "  - gemini-2.5-flash: ~23% zero-cost rows in last 24h in some audits — watch PARTIAL / MISS."
  echo "  - claude-opus-4-6: ai_models may still show \$5/\$25 per MTok while API billing is \$15/\$75 — stale rate row."
  echo "  - Any non-workers_ai model with telem \$0: NOT TRACKED (write path or cost pipeline)."
  echo ""
  echo -e "${BOLD}── NEXT STEPS ──────────────────────────────────────────────────────────${RESET}"
  echo "  Fix claude-opus-4-6 rates in D1 (after approval):"
  echo "    $WRANGLER_BIN npx wrangler d1 execute inneranimalmedia-business --remote \\"
  echo "      --config wrangler.production.toml \\"
  echo "      --command=\"UPDATE ai_models SET input_rate_per_mtok=15, output_rate_per_mtok=75 WHERE model_key='claude-opus-4-6';\""
  echo ""
  echo "  Retired tables (should stay flat after cost cleanup):"
  echo "    $WRANGLER_BIN npx wrangler d1 execute inneranimalmedia-business --remote \\"
  echo "      --config wrangler.production.toml \\"
  echo "      --command=\"SELECT (SELECT COUNT(*) FROM agent_costs) ac, (SELECT COUNT(*) FROM ai_usage_log) aul;\""
  echo ""
}

# ── MAIN ────────────────────────────────────────────────────────────────────

print_header

print_provider_section "ANTHROPIC"
run_model_test "claude-haiku-4-5-20251001" "anthropic"
run_model_test "claude-sonnet-4-6" "anthropic"
run_model_test "claude-opus-4-6" "anthropic"

print_provider_section "OPENAI"
run_model_test "gpt-4.1-nano" "openai"
run_model_test "gpt-4.1-mini" "openai"
run_model_test "gpt-4.1" "openai"
run_model_test "gpt-5.4-nano" "openai"
run_model_test "gpt-5.4" "openai"
run_model_test "o4-mini" "openai"

print_provider_section "GOOGLE"
run_model_test "gemini-2.5-flash" "google"
run_model_test "gemini-3.1-flash-lite-preview" "google"
run_model_test "gemini-3-flash-preview" "google"

print_provider_section "WORKERS AI (free tier — expect \$0)"
run_model_test "@cf/meta/llama-4-scout-17b-16e-instruct" "workers_ai"
run_model_test "@cf/meta/llama-3.3-70b-instruct-fp8-fast" "workers_ai"

print_summary
