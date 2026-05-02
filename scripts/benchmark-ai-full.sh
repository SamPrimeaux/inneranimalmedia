#!/bin/bash
# =============================================================================
# benchmark-ai-full.sh — Comprehensive AI provider benchmark for Agent Sam
# Usage: ./benchmark-ai-full.sh [sandbox|prod] [--quick]
# Requires: SESSION env var (browser cookie), NEW env var (INGEST_SECRET)
# =============================================================================

ENV="${1:-prod}"
QUICK_MODE=false
[[ "${2:-}" == "--quick" ]] && QUICK_MODE=true

if [ "$ENV" = "sandbox" ]; then
  BASE_URL="https://inneranimal-dashboard.meauxbility.workers.dev"
else
  BASE_URL="https://inneranimalmedia.com"
fi

if [ -z "$SESSION" ]; then
  echo "ERROR: SESSION env var not set. Export your browser session cookie first."
  echo "  export SESSION=your-cookie-value"
  exit 1
fi

if [ -z "$NEW" ]; then
  echo "ERROR: NEW env var not set. Export your INGEST_SECRET first."
  echo "  export NEW=your-ingest-secret"
  exit 1
fi

# =============================================================================
# MODELS TO TEST
# =============================================================================
if [ "$QUICK_MODE" = true ]; then
  MODELS=(
    "claude-haiku-4-5-20251001|anthropic"
    "gemini-2.5-flash|google"
    "gpt-4.1-nano|openai"
    "@cf/meta/llama-4-scout-17b-16e-instruct|workers_ai"
    "auto|auto"
  )
else
  MODELS=(
    "claude-haiku-4-5-20251001|anthropic"
    "claude-sonnet-4-6|anthropic"
    "claude-opus-4-6|anthropic"
    "gemini-3-flash-preview|google"
    "gemini-2.5-flash|google"
    "gpt-4.1-nano|openai"
    "gpt-4.1-mini|openai"
    "gpt-5.4-nano|openai"
    "gpt-5.4|openai"
    "o4-mini|openai"
    "@cf/meta/llama-4-scout-17b-16e-instruct|workers_ai"
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast|workers_ai"
    "@cf/moonshotai/kimi-k2.5|workers_ai"
    "auto|auto"
  )
fi

# =============================================================================
# TEST PROMPTS — one per intent category
# =============================================================================
declare -A PROMPTS
PROMPTS[question]="What is a Cloudflare Durable Object and when should you use one?"
PROMPTS[sql]="Write a SQL query to find the top 5 most expensive AI model calls in the last 7 days from a spend_ledger table with columns: id, model_key, provider, input_tokens, output_tokens, cost_usd, created_at"
PROMPTS[shell]="Write a bash one-liner to find all .js files modified in the last 24 hours and count lines in each"
PROMPTS[code]="Write a Cloudflare Worker handler in JavaScript that accepts a POST request, validates a Bearer token against an env secret, and proxies the request to an upstream URL stored in env"
PROMPTS[mixed]="Review this deployment strategy and suggest improvements: we build with Vite, upload to R2, deploy worker, then run benchmarks before promoting to prod"
PROMPTS[summarize]="Summarize the key differences between Cloudflare Workers, Pages, and Durable Objects in 3 bullet points"

# =============================================================================
# RESULTS STORAGE
# =============================================================================
declare -A RESULTS_STATUS
declare -A RESULTS_LATENCY
declare -A RESULTS_TOKENS
declare -A RESULTS_INTENT
declare -A RESULTS_ROUTING
declare -A RESULTS_ERROR

PASS=0
FAIL=0
TOTAL=0

# =============================================================================
# HELPERS
# =============================================================================
timestamp() { date +%s%3N; }

run_test() {
  local model="$1"
  local intent="$2"
  local prompt="${PROMPTS[$intent]}"
  local key="${model}::${intent}"

  TOTAL=$((TOTAL + 1))

  local start=$(timestamp)
  local response
  response=$(curl -s -w "\n__HTTP_CODE__:%{http_code}__TOTAL_TIME__:%{time_total}" \
    -X POST "${BASE_URL}/api/agent/chat" \
    -H "Content-Type: application/json" \
    -H "Cookie: session=${SESSION}" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"${prompt//\"/\\\"}\"}],\"model\":\"${model}\",\"stream\":false}" \
    --max-time 45)
  local end=$(timestamp)

  local latency=$((end - start))
  local http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  local time_total=$(echo "$response" | grep -o '__TOTAL_TIME__:[0-9.]*' | cut -d: -f2)
  local body=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*__TOTAL_TIME__:[0-9.]*$//')

  # Parse response
  local has_error=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'error' in d else 'no')" 2>/dev/null || echo "parse_fail")
  local reply=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','') or d.get('content','') or d.get('response','')[:100])" 2>/dev/null | head -c 80)
  local input_tok=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('input_tokens',d.get('usage',{}).get('input_tokens','?')))" 2>/dev/null || echo "?")
  local output_tok=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output_tokens',d.get('usage',{}).get('output_tokens','?')))" 2>/dev/null || echo "?")
  local auto_model=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('auto_model',''))" 2>/dev/null || echo "")
  local routing=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('routing_rule',''))" 2>/dev/null || echo "")

  if [ "$has_error" = "no" ] && [ -n "$reply" ]; then
    RESULTS_STATUS[$key]="PASS"
    RESULTS_LATENCY[$key]="$latency"
    RESULTS_TOKENS[$key]="${input_tok}/${output_tok}"
    RESULTS_ROUTING[$key]="${auto_model}${routing}"
    PASS=$((PASS + 1))
    echo "  ✅ PASS ${latency}ms | tokens: ${input_tok}in/${output_tok}out | ${reply:0:60}..."
  else
    local err=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null || echo "$body" | head -c 100)
    RESULTS_STATUS[$key]="FAIL"
    RESULTS_LATENCY[$key]="$latency"
    RESULTS_ERROR[$key]="$err"
    FAIL=$((FAIL + 1))
    echo "  ❌ FAIL ${latency}ms | http:${http_code} | ${err:0:80}"
  fi
}

# =============================================================================
# INFRASTRUCTURE TESTS (no session needed)
# =============================================================================
echo ""
echo "============================================================"
echo "  AGENT SAM — FULL AI BENCHMARK"
echo "  Target: $BASE_URL"
echo "  Mode: $([ "$QUICK_MODE" = true ] && echo 'QUICK' || echo 'FULL')"
echo "  Time: $(date)"
echo "============================================================"

echo ""
echo "── INFRASTRUCTURE CHECKS ───────────────────────────────────"

# Health check
start=$(timestamp)
health=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/dashboard/agent" --max-time 10)
end=$(timestamp)
echo "  Dashboard:     HTTP $health | $((end-start))ms"

# RAG query
start=$(timestamp)
rag=$(curl -s -X POST "${BASE_URL}/api/rag/query" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Secret: $NEW" \
  -d '{"query":"what is Agent Sam","top_k":3}' --max-time 15)
end=$(timestamp)
rag_ok=$(echo "$rag" | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d.get('ok') else 'FAIL')" 2>/dev/null || echo "FAIL")
rag_score=$(echo "$rag" | python3 -c "import sys,json; d=json.load(sys.stdin); print(round(d.get('top_score',0),3))" 2>/dev/null || echo "?")
rag_chunks=$(echo "$rag" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('chunks_injected',0))" 2>/dev/null || echo "?")
echo "  RAG query:     $rag_ok | $((end-start))ms | top_score:$rag_score | chunks:$rag_chunks"

# Vertex test
start=$(timestamp)
vertex=$(curl -s -X POST "${BASE_URL}/api/agent/vertex-test" \
  -H "X-Ingest-Secret: $NEW" --max-time 15)
end=$(timestamp)
vertex_ok=$(echo "$vertex" | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d.get('ok') else 'FAIL')" 2>/dev/null || echo "FAIL")
echo "  Vertex JWT:    $vertex_ok | $((end-start))ms"

# Browse test
start=$(timestamp)
browse=$(curl -s -X POST "${BASE_URL}/api/agent/browse" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Secret: $NEW" \
  -d '{"url":"https://inneranimalmedia.com","action":"title"}' --max-time 20)
end=$(timestamp)
browse_ok=$(echo "$browse" | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d.get('ok') else 'FAIL')" 2>/dev/null || echo "FAIL")
browse_title=$(echo "$browse" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content','')[:50])" 2>/dev/null || echo "?")
echo "  Browse:        $browse_ok | $((end-start))ms | \"$browse_title\""

# =============================================================================
# AI MODEL TESTS
# =============================================================================
echo ""
echo "── AI MODEL TESTS ──────────────────────────────────────────"

if [ "$QUICK_MODE" = true ]; then
  TEST_INTENTS=("question" "sql" "code")
else
  TEST_INTENTS=("question" "sql" "shell" "code" "mixed" "summarize")
fi

for model_entry in "${MODELS[@]}"; do
  model=$(echo "$model_entry" | cut -d'|' -f1)
  provider=$(echo "$model_entry" | cut -d'|' -f2)

  echo ""
  echo "  ▸ $model ($provider)"

  for intent in "${TEST_INTENTS[@]}"; do
    echo -n "    [$intent] "
    run_test "$model" "$intent"
    sleep 0.5  # avoid rate limiting
  done
done

# =============================================================================
# AUTO ROUTING VERIFICATION
# =============================================================================
echo ""
echo "── AUTO ROUTING VERIFICATION ───────────────────────────────"

declare -A ROUTING_TESTS
ROUTING_TESTS[question]="What is Agent Sam"
ROUTING_TESTS[sql]="write a SQL query to count rows"
ROUTING_TESTS[shell]="run bash command to list files"
ROUTING_TESTS[code]="write a javascript function to debounce"
ROUTING_TESTS[summarize]="tldr this: Cloudflare Workers run at the edge"
ROUTING_TESTS[image]="draw a logo for Inner Animal Media"

for intent in "${!ROUTING_TESTS[@]}"; do
  prompt="${ROUTING_TESTS[$intent]}"
  echo -n "  [auto→$intent] "
  start=$(timestamp)
  response=$(curl -s -X POST "${BASE_URL}/api/agent/chat" \
    -H "Content-Type: application/json" \
    -H "Cookie: session=${SESSION}" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"${prompt}\"}],\"model\":\"auto\",\"stream\":false}" \
    --max-time 30)
  end=$(timestamp)
  latency=$((end - start))
  has_error=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'error' in d else 'no')" 2>/dev/null || echo "yes")
  auto_model=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('auto_model','?'))" 2>/dev/null || echo "?")

  if [ "$has_error" = "no" ]; then
    echo "✅ ${latency}ms → routed to: $auto_model"
  else
    err=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','?'))" 2>/dev/null || echo "?")
    echo "❌ ${latency}ms | $err"
  fi
  sleep 0.3
done

# =============================================================================
# RESULTS SUMMARY
# =============================================================================
echo ""
echo "============================================================"
echo "  RESULTS SUMMARY"
echo "============================================================"
echo ""
printf "  %-40s %-8s %-10s %-15s\n" "MODEL::INTENT" "STATUS" "LATENCY" "TOKENS(in/out)"
printf "  %-40s %-8s %-10s %-15s\n" "─────────────────────────────────────────" "────────" "──────────" "───────────────"

for key in $(echo "${!RESULTS_STATUS[@]}" | tr ' ' '\n' | sort); do
  status="${RESULTS_STATUS[$key]}"
  latency="${RESULTS_LATENCY[$key]}ms"
  tokens="${RESULTS_TOKENS[$key]:-N/A}"
  error="${RESULTS_ERROR[$key]:-}"

  if [ "$status" = "PASS" ]; then
    printf "  %-40s ✅ %-6s %-10s %-15s\n" "$key" "$status" "$latency" "$tokens"
  else
    printf "  %-40s ❌ %-6s %-10s %s\n" "$key" "$status" "$latency" "${error:0:40}"
  fi
done

echo ""
echo "  ─────────────────────────────────────"
echo "  PASS: $PASS / $TOTAL"
echo "  FAIL: $FAIL / $TOTAL"
echo "  Score: $(echo "scale=1; $PASS * 100 / $TOTAL" | bc)%"
echo ""

# Latency stats
if [ ${#RESULTS_LATENCY[@]} -gt 0 ]; then
  latencies=$(for k in "${!RESULTS_LATENCY[@]}"; do echo "${RESULTS_LATENCY[$k]}"; done)
  avg_latency=$(echo "$latencies" | awk '{sum+=$1; count++} END {printf "%.0f", sum/count}')
  max_latency=$(echo "$latencies" | sort -n | tail -1)
  min_latency=$(echo "$latencies" | sort -n | head -1)
  echo "  Latency — min: ${min_latency}ms | avg: ${avg_latency}ms | max: ${max_latency}ms"
fi

echo ""
echo "  Completed: $(date)"
echo "============================================================"

# Exit code based on results
[ $FAIL -eq 0 ] && exit 0 || exit 1
