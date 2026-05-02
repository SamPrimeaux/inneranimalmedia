#!/usr/bin/env bash
# =============================================================================
# iam-model-test.sh — IAM AI Provider Live Test Suite
# Tests all enabled models through the worker's /api/agent/chat endpoint.
# Writes results to ai_api_test_runs, quality_runs, quality_results in D1.
#
# Usage:
#   ./scripts/iam-model-test.sh [options]
#
# Options:
#   --url <url>         Base URL (default: https://inneranimalmedia.com)
#   --sandbox           Shortcut for sandbox worker URL
#   --cookie <value>    Full Cookie header value (or set IAM_SESSION_COOKIE env)
#   --suite <name>      Test suite name (default: provider_smoke)
#   --models <ids>      Comma-separated model IDs to test (default: all enabled)
#   --no-stream         Force non-streaming for all models
#   --dry-run           Fetch models + print plan, do not send test requests
#
# Env vars (alternative to flags):
#   IAM_BASE_URL         Worker base URL
#   IAM_SESSION_COOKIE   Cookie header value (e.g. "session=abc123")
#   IAM_TEST_SUITE       Suite name
#
# Requirements: curl, jq, bc  (all available on macOS via Homebrew)
# =============================================================================
set -euo pipefail

# ── Version ────────────────────────────────────────────────────────────────────
SCRIPT_VERSION="1.1.0"

# ── Defaults ──────────────────────────────────────────────────────────────────
BASE_URL="${IAM_BASE_URL:-https://inneranimalmedia.com}"
SESSION_COOKIE="${IAM_SESSION_COOKIE:-}"
TEST_SUITE="${IAM_TEST_SUITE:-provider_smoke}"
MODELS_FILTER=""          # empty = all enabled
DRY_RUN=false
FORCE_NO_STREAM=false
TENANT_ID="tenant_sam_primeaux"
WORKSPACE_ID="ws_inneranimalmedia"
TEST_PROMPT="Reply with exactly one word: OK"
PROMPT_ID=""              # Link to agentsam_prompt
EXPERIMENT_ID=""          # For split testing tracking
MAX_TOKENS=16
TIMEOUT=45    # seconds per request

# ── Colors / Symbols ───────────────────────────────────────────────────────────
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_DIM='\033[2m'
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_BLUE='\033[0;34m'
C_CYAN='\033[0;36m'
C_WHITE='\033[1;37m'
C_MAGENTA='\033[0;35m'

SYM_PASS="✅"
SYM_FAIL="❌"
SYM_WARN="⚠️ "
SYM_RUN="🔄"
SYM_WAIT="⏳"
SYM_STREAM="📡"

# ── Global parallel arrays (declared at top level for bash 3.2 compat) ──────────
MODEL_IDS=()
MODEL_NAMES=()
PROVIDERS=()
STATUSES=()
HTTP_CODES=()
INPUT_TOKENS=()
OUTPUT_TOKENS=()
COSTS=()
LATENCIES=()
TTFTS=()
ERRORS=()
TEST_IDS=()

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --url)        BASE_URL="$2"; shift 2 ;;
    --sandbox)    BASE_URL="https://inneranimal-dashboard.meauxbility.workers.dev"; shift ;;
    --cookie)     SESSION_COOKIE="$2"; shift 2 ;;
    --suite)      TEST_SUITE="$2"; shift 2 ;;
    --models)     MODELS_FILTER="$2"; shift 2 ;;
    --prompt-id)  PROMPT_ID="$2"; shift 2 ;;
    --experiment-id) EXPERIMENT_ID="$2"; shift 2 ;;
    --no-stream)  FORCE_NO_STREAM=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    -h|--help)
      grep '^#' "$0" | grep -v '^#!/' | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Deps ──────────────────────────────────────────────────────────────────────
for cmd in curl jq bc; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${C_RED}Missing required tool: $cmd${C_RESET}" >&2
    echo "  macOS: brew install $cmd" >&2
    exit 1
  fi
done

# ── Auth helper ───────────────────────────────────────────────────────────────
_curl() {
  if [[ -n "$SESSION_COOKIE" ]]; then
    curl -s --max-time "$TIMEOUT" -H "Cookie: $SESSION_COOKIE" "$@"
  else
    curl -s --max-time "$TIMEOUT" "$@"
  fi
}

# ── IDs for this run ──────────────────────────────────────────────────────────
RUN_TS=$(date +%Y%m%d_%H%M%S)
RUN_GROUP_ID="rg_${RUN_TS}_$$"
QUALITY_RUN_ID="qrun_${RUN_TS}_$$"
RUN_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RUN_START_MS=$(date +%s%3N 2>/dev/null || echo "$(($(date +%s) * 1000))")

# ── Helpers ───────────────────────────────────────────────────────────────────
now_ms() {
  date +%s%3N 2>/dev/null || echo "$(($(date +%s) * 1000))"
}

uuid_gen() {
  if command -v uuidgen &>/dev/null; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    cat /proc/sys/kernel/random/uuid 2>/dev/null || \
      printf '%08x-%04x-%04x-%04x-%012x' \
        $RANDOM $RANDOM $RANDOM $RANDOM $((RANDOM * RANDOM * RANDOM))
  fi
}

safe_int() {
  local v="${1:-0}"
  echo "$v" | grep -oE '^-?[0-9]+' || echo "0"
}

safe_float() {
  local v="${1:-0}"
  printf "%.6f" "$(echo "$v" | grep -oE '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?' || echo "0")" 2>/dev/null || echo "0.000000"
}

# ── Print banner ──────────────────────────────────────────────────────────────
print_banner() {
  clear
  echo -e "${C_BOLD}${C_CYAN}"
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║       IAM AI Provider Live Test Suite  ·  v${SCRIPT_VERSION}                    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo -e "${C_RESET}"
  echo -e "  ${C_DIM}Target  :${C_RESET} ${C_WHITE}${BASE_URL}${C_RESET}"
  echo -e "  ${C_DIM}Suite   :${C_RESET} ${TEST_SUITE}"
  echo -e "  ${C_DIM}RunGroup:${C_RESET} ${RUN_GROUP_ID}"
  echo -e "  ${C_DIM}Started :${C_RESET} $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo -e "  ${C_DIM}Auth    :${C_RESET} $([ -n "$SESSION_COOKIE" ] && echo "Cookie set" || echo "${C_YELLOW}No cookie — unauthenticated${C_RESET}")"
  echo ""
}

# ── Fetch models ──────────────────────────────────────────────────────────────
fetch_models() {
  echo -e "${C_YELLOW}→ Fetching models from ${BASE_URL}/api/ai/models ...${C_RESET}"

  local raw
  raw=$(_curl "${BASE_URL}/api/ai/models" -H "Accept: application/json" 2>/dev/null) || {
    echo -e "${C_RED}curl failed — check URL and connectivity${C_RESET}"
    exit 1
  }

  if ! echo "$raw" | jq -e '.' &>/dev/null; then
    echo -e "${C_RED}Invalid JSON from /api/ai/models:${C_RESET}"
    echo "$raw" | head -5
    exit 1
  fi

  # Filter to enabled models, optionally by provided IDs
  # Worker returns { models: [...] } — unwrap to bare array first, fallback to raw if already array
  local arr
  arr=$(echo "$raw" | jq -c '
    if type == "array" then .
    elif .models and (.models | type) == "array" then .models
    elif .data and (.data | type) == "array" then .data
    elif .results and (.results | type) == "array" then .results
    else [.] end
  ')

  local filter_expr='.[] | select(.is_active == 1 or .is_active == true or .enabled == 1 or .enabled == true)'

  if [[ -n "$MODELS_FILTER" ]]; then
    local ids_json
    ids_json=$(echo "$MODELS_FILTER" | tr ',' '\n' | jq -R . | jq -sc .)
    filter_expr=".[] | select((.is_active == 1 or .is_active == true or .enabled == 1 or .enabled == true) and ((.model_key // .id) as \$mk | ${ids_json} | index(\$mk) != null))"
  fi

  echo "$arr" | jq -c "${filter_expr}"
}

# ── Table drawing ─────────────────────────────────────────────────────────────
# Column widths
COL_NUM=4; COL_PROV=12; COL_MODEL=28; COL_STATUS=10;
COL_HTTP=8; COL_IN=7; COL_OUT=7; COL_COST=11; COL_LAT=9; COL_TTFT=8

TABLE_LINE_FMT="%-${COL_NUM}s %-${COL_PROV}s %-${COL_MODEL}s %-${COL_STATUS}s %-${COL_HTTP}s %-${COL_IN}s %-${COL_OUT}s %-${COL_COST}s %-${COL_LAT}s %s"
SEP_LINE=$(printf '─%.0s' $(seq 1 108))

print_table_header() {
  echo -e "${C_BOLD}${C_WHITE}"
  printf "${TABLE_LINE_FMT}\n" \
    "#" "PROVIDER" "MODEL" "STATUS" "HTTP" "IN-TOK" "OUT-TOK" "COST(USD)" "LAT(ms)" "TTFT(ms)"
  echo -e "${C_DIM}${SEP_LINE}${C_RESET}"
}

status_color() {
  case "$1" in
    pending) echo -n "${C_DIM}" ;;
    running) echo -n "${C_YELLOW}" ;;
    pass)    echo -n "${C_GREEN}" ;;
    fail)    echo -n "${C_RED}" ;;
    warn)    echo -n "${C_YELLOW}" ;;
    *)       echo -n "${C_WHITE}" ;;
  esac
}

status_icon() {
  case "$1" in
    pending) echo -n "${SYM_WAIT}" ;;
    running) echo -n "${SYM_RUN}" ;;
    pass)    echo -n "${SYM_PASS}" ;;
    fail)    echo -n "${SYM_FAIL}" ;;
    warn)    echo -n "${SYM_WARN}" ;;
  esac
}

print_row_at() {
  # Moves cursor to absolute row $1, prints row for model index $2
  local row=$1
  local idx=$2
  tput cup "$row" 0 2>/dev/null
  local color; color=$(status_color "${STATUSES[$idx]}")
  local icon;  icon=$(status_icon "${STATUSES[$idx]}")
  local cost_fmt; cost_fmt=$(safe_float "${COSTS[$idx]}")
  local lat="${LATENCIES[$idx]:-—}"
  local ttft="${TTFTS[$idx]:-—}"
  printf "${color}${TABLE_LINE_FMT}${C_RESET}\n" \
    "$((idx+1))" \
    "${PROVIDERS[$idx]:0:${COL_PROV}}" \
    "${MODEL_NAMES[$idx]:0:${COL_MODEL}}" \
    "${STATUSES[$idx]} ${icon}" \
    "${HTTP_CODES[$idx]:-—}" \
    "${INPUT_TOKENS[$idx]}" \
    "${OUTPUT_TOKENS[$idx]}" \
    "\$${cost_fmt}" \
    "${lat}" \
    "${ttft}"
}

print_summary_at() {
  local row=$1
  tput cup "$row" 0 2>/dev/null
  printf "${C_DIM}${SEP_LINE}${C_RESET}\n"

  local pass_c=0 fail_c=0 warn_c=0 total_cost=0 total_in=0 total_out=0 total_lat=0 lat_c=0
  for i in "${!MODEL_IDS[@]}"; do
    case "${STATUSES[$i]}" in
      pass) ((pass_c++)) ;;
      fail) ((fail_c++)) ;;
      warn) ((warn_c++)) ;;
    esac
    total_cost=$(echo "${total_cost} + ${COSTS[$i]:-0}" | bc -l 2>/dev/null || echo "0")
    total_in=$(( total_in + $(safe_int "${INPUT_TOKENS[$i]}") ))
    total_out=$(( total_out + $(safe_int "${OUTPUT_TOKENS[$i]}") ))
    if [[ "${LATENCIES[$i]}" =~ ^[0-9]+$ ]]; then
      total_lat=$(( total_lat + LATENCIES[$i] ))
      ((lat_c++))
    fi
  done

  local avg_lat="—"
  [[ $lat_c -gt 0 ]] && avg_lat="$((total_lat / lat_c))"

  tput cup $((row+1)) 0 2>/dev/null
  printf "  ${C_BOLD}${C_GREEN}%d pass${C_RESET}  ${C_RED}%d fail${C_RESET}  ${C_YELLOW}%d warn${C_RESET}  |  " "$pass_c" "$fail_c" "$warn_c"
  printf "Tokens: %d in / %d out  |  " "$total_in" "$total_out"
  printf "Cost: ${C_CYAN}\$%s${C_RESET}  |  Avg lat: ${C_MAGENTA}%sms${C_RESET}\n" \
    "$(printf '%.6f' "$total_cost" 2>/dev/null || echo "$total_cost")" "$avg_lat"
}

# ── D1 query helper ───────────────────────────────────────────────────────────
d1_exec() {
  local sql="$1"; shift
  local params="${1:-[]}"
  _curl "${BASE_URL}/api/d1/query" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg s "$sql" --argjson p "$params" '{sql:$s,params:$p}')" \
    2>/dev/null || true
}

d1_insert_test_run() {
  local idx=$1
  local req_payload="$2"
  local resp_text="$3"
  local started_iso="$4"
  local completed_iso="$5"

  local http_int; http_int=$(safe_int "${HTTP_CODES[$idx]}")
  local success=0; [[ "${STATUSES[$idx]}" == "pass" ]] && success=1
  local lat; lat=$(safe_int "${LATENCIES[$idx]:-0}")
  local ttft; ttft=$(safe_int "${TTFTS[$idx]:-0}")
  local in_t; in_t=$(safe_int "${INPUT_TOKENS[$idx]}")
  local out_t; out_t=$(safe_int "${OUTPUT_TOKENS[$idx]}")
  local cost; cost=$(safe_float "${COSTS[$idx]}")

  local params
  params=$(jq -n \
    --arg id "${TEST_IDS[$idx]}" \
    --arg rg "$RUN_GROUP_ID" \
    --arg ts "$TEST_SUITE" \
    --arg tn "${PROVIDERS[$idx]}_${MODEL_IDS[$idx]}" \
    --arg prov "${PROVIDERS[$idx]}" \
    --arg model "${MODEL_IDS[$idx]}" \
    --arg status "${STATUSES[$idx]}" \
    --argjson http "$http_int" \
    --argjson succ "$success" \
    --arg errcode "${ERRORS[$idx]:-}" \
    --arg req "$req_payload" \
    --arg resp "$resp_text" \
    --arg pid "$PROMPT_ID" \
    --arg eid "$EXPERIMENT_ID" \
    --argjson in_t "$in_t" \
    --argjson out_t "$out_t" \
    --argjson total_t "$((in_t + out_t))" \
    --argjson cost "$cost" \
    --argjson lat "$lat" \
    --argjson ttft "$ttft" \
    --arg sa "$started_iso" \
    --arg ca "$completed_iso" \
    --arg ws "$WORKSPACE_ID" \
    --arg tid "$TENANT_ID" \
    '[$id,$rg,$ts,$tn,"normal",$prov,$model,$status,$http,$succ,
      $errcode,"",$resp,$req,$pid,$eid,
      $in_t,$out_t,$total_t,
      0,0,$cost,
      $lat,$ttft,$sa,$ca,$ws,$tid]')

  d1_exec "INSERT OR REPLACE INTO ai_api_test_runs (
    id, run_group_id, test_suite, test_name, mode, provider, model,
    status, http_status, success,
    error_code, error_message, response_text, request_payload_json,
    prompt_id, experiment_id,
    input_tokens, output_tokens, total_tokens,
    input_cost_usd, output_cost_usd, total_cost_usd,
    latency_ms, time_to_first_token_ms,
    started_at, completed_at, workspace_id, tenant_id
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)" "$params" &>/dev/null &
}

# ── SSE streaming test ────────────────────────────────────────────────────────
test_model_stream() {
  local idx=$1
  local model_id="${MODEL_IDS[$idx]}"
  local provider="${PROVIDERS[$idx]}"

  local payload
  payload=$(jq -n \
    --arg model "$model_id" \
    --arg content "$TEST_PROMPT" \
    --argjson max "$MAX_TOKENS" \
    '{model:$model,message:$content,stream:true,max_tokens:$max}')

  local t_start; t_start=$(now_ms)
  local started_iso; started_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local tmpfile; tmpfile=$(mktemp /tmp/iam_sse_XXXXXX)
  local ttft_ms=0 first_data_seen=false
  local t_first=0

  # Start curl in background writing to tmpfile
  _curl "${BASE_URL}/api/agent/chat" \
    -N -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -D "${tmpfile}.headers" \
    -o "${tmpfile}.body" \
    -d "$payload" \
    2>/dev/null &
  local curl_pid=$!

  # Poll for SSE data lines
  local deadline=$(( $(date +%s) + TIMEOUT ))
  while kill -0 $curl_pid 2>/dev/null; do
    if [[ -f "${tmpfile}.body" ]] && grep -q '^data:' "${tmpfile}.body" 2>/dev/null; then
      if [[ "$first_data_seen" == "false" ]]; then
        t_first=$(now_ms)
        ttft_ms=$(( t_first - t_start ))
        first_data_seen=true
      fi
    fi
    if grep -qE '^data:\s*\[DONE\]' "${tmpfile}.body" 2>/dev/null; then
      break
    fi
    if [[ $(date +%s) -gt $deadline ]]; then
      kill $curl_pid 2>/dev/null || true
      break
    fi
    sleep 0.05
  done
  wait $curl_pid 2>/dev/null || true

  local t_end; t_end=$(now_ms)
  local lat_ms=$(( t_end - t_start ))
  local completed_iso; completed_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local body=""
  [[ -f "${tmpfile}.body" ]] && body=$(cat "${tmpfile}.body")

  # http status from headers
  local http_code
  http_code=$(grep -oE 'HTTP/[0-9.]+ [0-9]+' "${tmpfile}.headers" 2>/dev/null | tail -1 | grep -oE '[0-9]+$' || echo "0")

  # Extract tokens from SSE done chunk: {"type":"done","input_tokens":N,"output_tokens":N,"cost_usd":N}
  local in_t out_t
  in_t=$(echo "$body" | grep -oE '"input_tokens":[0-9]+' | grep -oE '[0-9]+' | tail -1 || echo "0")
  out_t=$(echo "$body" | grep -oE '"output_tokens":[0-9]+' | grep -oE '[0-9]+' | tail -1 || echo "0")
  in_t=$(safe_int "${in_t:-0}")
  out_t=$(safe_int "${out_t:-0}")

  # Cost from SSE if present
  local cost
  cost=$(echo "$body" | grep -oE '"cost_usd"\s*:\s*[0-9]+(\.[0-9]+)?' | grep -oE '[0-9]+(\.[0-9]+)?' | tail -1 || echo "0")
  cost=$(safe_float "${cost:-0}")

  rm -f "$tmpfile" "${tmpfile}.body" "${tmpfile}.headers"

  # Determine pass/fail
  HTTP_CODES[$idx]="${http_code}+SSE"
  LATENCIES[$idx]="$lat_ms"
  TTFTS[$idx]="$ttft_ms"
  INPUT_TOKENS[$idx]="$in_t"
  OUTPUT_TOKENS[$idx]="$out_t"
  COSTS[$idx]="$cost"

  if [[ "$first_data_seen" == "true" ]]; then
    STATUSES[$idx]="pass"
  elif [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    STATUSES[$idx]="warn"
    ERRORS[$idx]="no_sse_data"
  else
    STATUSES[$idx]="fail"
    ERRORS[$idx]="http_${http_code}"
  fi

  d1_insert_test_run "$idx" "$payload" "$body" "$started_iso" "$completed_iso"
}

# ── Non-streaming test ────────────────────────────────────────────────────────
test_model_sync() {
  local idx=$1
  local model_id="${MODEL_IDS[$idx]}"

  local payload
  payload=$(jq -n \
    --arg model "$model_id" \
    --arg content "$TEST_PROMPT" \
    --argjson max "$MAX_TOKENS" \
    '{model:$model,message:$content,stream:false,max_tokens:$max}')

  local t_start; t_start=$(now_ms)
  local started_iso; started_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local raw
  raw=$(_curl "${BASE_URL}/api/agent/chat" \
    -X POST \
    -H "Content-Type: application/json" \
    -w "\n__STATUS__:%{http_code}" \
    -d "$payload" 2>/dev/null) || { raw=""; }

  local t_end; t_end=$(now_ms)
  local lat_ms=$(( t_end - t_start ))
  local completed_iso; completed_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local http_code
  http_code=$(echo "$raw" | grep -oE '__STATUS__:[0-9]+' | cut -d: -f2 || echo "0")
  local body
  body=$(echo "$raw" | sed 's/__STATUS__:[0-9]*//')

  # SSE done chunk: {"type":"done","input_tokens":N,"output_tokens":N,"cost_usd":N}
  local in_t; in_t=$(echo "$body" | grep -oE '"input_tokens":[0-9]+' | grep -oE '[0-9]+' | tail -1 || echo "0")
  local out_t; out_t=$(echo "$body" | grep -oE '"output_tokens":[0-9]+' | grep -oE '[0-9]+' | tail -1 || echo "0")
  local cost; cost=$(echo "$body" | grep -oE '"cost_usd":[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?' | grep -oE '[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?' | tail -1 || echo "0")
  local err_msg; err_msg=$(echo "$body" | jq -r '.error // .message // ""' 2>/dev/null | head -c 80 || echo "")

  HTTP_CODES[$idx]="${http_code:-0}"
  LATENCIES[$idx]="$lat_ms"
  TTFTS[$idx]="—"
  INPUT_TOKENS[$idx]=$(safe_int "${in_t:-0}")
  OUTPUT_TOKENS[$idx]=$(safe_int "${out_t:-0}")
  COSTS[$idx]=$(safe_float "${cost:-0}")

  if [[ "${http_code:-0}" -ge 200 && "${http_code:-0}" -lt 300 ]]; then
    STATUSES[$idx]="pass"
  else
    STATUSES[$idx]="fail"
    ERRORS[$idx]="${err_msg}"
  fi

  d1_insert_test_run "$idx" "$payload" "$body" "$started_iso" "$completed_iso"
}

# ── D1: insert quality_runs row ───────────────────────────────────────────────
insert_quality_run() {
  local status="$1" pass_c="$2" fail_c="$3" warn_c="$4"
  local end_ms; end_ms=$(now_ms)
  d1_exec "INSERT OR IGNORE INTO quality_runs
    (id, run_context, initiated_by, status, pass_count, fail_count, warn_count, started_at, completed_at)
    VALUES (?,?,?,?,?,?,?,?,?)" \
    "$(jq -n \
      --arg id "$QUALITY_RUN_ID" --arg ctx "production" --arg by "iam_model_test_script" \
      --arg st "$status" --argjson pc "$pass_c" --argjson fc "$fail_c" --argjson wc "$warn_c" \
      --argjson sa "$RUN_START_MS" --argjson ea "$end_ms" \
      '[$id,$ctx,$by,$st,$pc,$fc,$wc,$sa,$ea]')" \
    &>/dev/null &

  # Insert one quality_result per model
  for i in "${!MODEL_IDS[@]}"; do
    local res_status="pass"; [[ "${STATUSES[$i]}" == "fail" ]] && res_status="fail"
    local actual="${STATUSES[$i]}|lat=${LATENCIES[$i]:-0}ms|in=${INPUT_TOKENS[$i]}|out=${OUTPUT_TOKENS[$i]}"
    d1_exec "INSERT INTO quality_results (run_id, metric_key, check_name, actual_value, status)
      VALUES (?,?,?,?,?)" \
      "$(jq -n \
        --arg rid "$QUALITY_RUN_ID" \
        --arg mk "${PROVIDERS[$i]}_${MODEL_IDS[$i]}" \
        --arg cn "model_smoke_test" \
        --arg av "$actual" \
        --arg st "$res_status" \
        '[$rid,$mk,$cn,$av,$st]')" \
      &>/dev/null &
  done
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  print_banner

  # 1. Fetch models
  local models_raw
  models_raw=$(fetch_models)
  if [[ -z "$models_raw" ]]; then
    echo -e "${C_RED}No enabled models returned. Check auth/URL.${C_RESET}"
    exit 1
  fi

  # 2. Reset parallel arrays (declared globally above for bash 3.2 compat)
  MODEL_IDS=(); MODEL_NAMES=(); PROVIDERS=(); STATUSES=(); HTTP_CODES=()
  INPUT_TOKENS=(); OUTPUT_TOKENS=(); COSTS=(); LATENCIES=(); TTFTS=(); ERRORS=(); TEST_IDS=()

  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    MODEL_IDS+=( "$(echo "$row" | jq -r '.model_key // .id // "unknown"')" )
    MODEL_NAMES+=( "$(echo "$row" | jq -r '.display_name // .name // .model_key // .id // "unknown"')" )
    PROVIDERS+=( "$(echo "$row" | jq -r '.provider // "unknown"')" )
    STATUSES+=("pending")
    HTTP_CODES+=("—")
    INPUT_TOKENS+=("0")
    OUTPUT_TOKENS+=("0")
    COSTS+=("0")
    LATENCIES+=("—")
    TTFTS+=("—")
    ERRORS+=("")
    TEST_IDS+=( "$(uuid_gen)" )
  done <<< "$models_raw"

  local TOTAL=${#MODEL_IDS[@]}
  echo -e "${C_GREEN}  Found ${TOTAL} enabled model(s) to test${C_RESET}"
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${C_YELLOW}DRY RUN — models that would be tested:${C_RESET}"
    for i in "${!MODEL_IDS[@]}"; do
      printf "  %2d. %-12s %s\n" "$((i+1))" "${PROVIDERS[$i]}" "${MODEL_IDS[$i]}"
    done
    echo ""
    echo "Re-run without --dry-run to execute tests."
    exit 0
  fi

  # 3. Set up table at current cursor position
  # Capture current row as table start
  local TABLE_START_ROW
  TABLE_START_ROW=$(tput lines 2>/dev/null || echo 24)
  # We'll use fixed positions: banner = ~12 lines, then table
  TABLE_START_ROW=13

  tput cup $TABLE_START_ROW 0 2>/dev/null
  print_table_header
  local HEADER_ROWS=2  # header + separator

  # Print all rows as pending
  for i in "${!MODEL_IDS[@]}"; do
    print_row_at $((TABLE_START_ROW + HEADER_ROWS + i)) "$i"
  done

  local SUMMARY_ROW=$(( TABLE_START_ROW + HEADER_ROWS + TOTAL + 1 ))
  print_summary_at "$SUMMARY_ROW"

  # Hide cursor during live updates
  tput civis 2>/dev/null || true
  trap 'tput cnorm 2>/dev/null; echo ""' EXIT INT TERM

  # 4. Run tests
  for i in "${!MODEL_IDS[@]}"; do
    STATUSES[$i]="running"
    print_row_at $((TABLE_START_ROW + HEADER_ROWS + i)) "$i"
    print_summary_at "$SUMMARY_ROW"

    local provider="${PROVIDERS[$i]}"
    local use_stream=false
    if [[ "$FORCE_NO_STREAM" == "false" ]]; then
      [[ "$provider" == "anthropic" || "$provider" == "google" ]] && use_stream=true
    fi

    if [[ "$use_stream" == "true" ]]; then
      test_model_stream "$i"
    else
      test_model_sync "$i"
    fi

    print_row_at $((TABLE_START_ROW + HEADER_ROWS + i)) "$i"
    print_summary_at "$SUMMARY_ROW"
    sleep 0.3
  done

  # 5. Restore cursor
  tput cnorm 2>/dev/null || true
  tput cup $((SUMMARY_ROW + 3)) 0 2>/dev/null

  # 6. Final counts
  local pass_c=0 fail_c=0 warn_c=0
  for i in "${!MODEL_IDS[@]}"; do
    case "${STATUSES[$i]}" in
      pass) ((pass_c++)) ;;
      fail) ((fail_c++)) ;;
      warn) ((warn_c++)) ;;
    esac
  done

  local qrun_status="pass"
  [[ $warn_c -gt 0 ]] && qrun_status="warn"
  [[ $fail_c -gt 0 ]] && qrun_status="warn"
  [[ $fail_c -gt $((TOTAL / 2)) ]] && qrun_status="fail"

  # 7. Insert quality_run + quality_results to D1
  insert_quality_run "$qrun_status" "$pass_c" "$fail_c" "$warn_c"

  # 8. Final output block
  echo ""
  echo -e "${C_BOLD}${C_CYAN}═══════════════════════ COMPLETE ═══════════════════════${C_RESET}"
  echo -e "  Run group : ${C_WHITE}${RUN_GROUP_ID}${C_RESET}"
  echo -e "  Quality ID: ${C_WHITE}${QUALITY_RUN_ID}${C_RESET}"
  echo -e "  Result    : ${qrun_status}"
  echo ""

  # Show any failures with error detail
  local had_fail=false
  for i in "${!MODEL_IDS[@]}"; do
    if [[ "${STATUSES[$i]}" != "pass" ]]; then
      had_fail=true
      echo -e "  ${C_RED}✗${C_RESET} ${MODEL_NAMES[$i]} (${PROVIDERS[$i]}): ${ERRORS[$i]:-no detail}"
    fi
  done
  [[ "$had_fail" == "false" ]] && echo -e "  ${C_GREEN}All models passed ${SYM_PASS}${C_RESET}"

  echo ""
  echo -e "${C_DIM}  D1 review queries:${C_RESET}"
  echo -e "  ${C_CYAN}SELECT provider, model, status, input_tokens, output_tokens, latency_ms, time_to_first_token_ms, total_cost_usd"
  echo -e "  FROM ai_api_test_runs WHERE run_group_id='${RUN_GROUP_ID}' ORDER BY provider, model;${C_RESET}"
  echo ""
  echo -e "  ${C_CYAN}SELECT status, pass_count, fail_count FROM quality_runs WHERE id='${QUALITY_RUN_ID}';${C_RESET}"
  echo ""

  wait  # wait for background D1 inserts
}

main "$@"
