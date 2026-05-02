#!/usr/bin/env bash
# benchmark-all-providers.sh — full provider + model comparison
# Usage: ./scripts/benchmark-all-providers.sh [sandbox|prod]
set -euo pipefail

TARGET="${1:-sandbox}"
if [ "$TARGET" = "prod" ]; then
  BASE_URL="https://inneranimalmedia.com"
  SESSION="d445ee8a-4a67-4d0c-aaae-6793922ad1a9"
else
  BASE_URL="https://inneranimal-dashboard.meauxbility.workers.dev"
  SESSION="77197ff3-e1f6-4ef1-a6ac-6353b037725d"
fi

PROMPT="${2:-Query my agent_sessions table and return the count of sessions created today. Show the SQL you used.}"

echo "=== FULL PROVIDER BENCHMARK ==="
echo "  Target : $TARGET"
echo "  Prompt : $PROMPT"
echo ""

run_test() {
  local MODEL_ID="$1"
  local LABEL="$2"
  local MODE="${3:-agent}"
  printf "  %-40s " "$LABEL"
  local START_MS
  START_MS=$(python3 -c "import time; print(int(time.time()*1000))")
  local RESULT
  RESULT=$(curl -sN "$BASE_URL/api/agent/chat" \
    -H "Content-Type: application/json" \
    -H "Cookie: session=$SESSION" \
    --max-time 45 \
    --data "{
      \"messages\": [{\"role\":\"user\",\"content\":$(echo "$PROMPT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}],
      \"model_id\": \"$MODEL_ID\",
      \"mode\": \"$MODE\",
      \"stream\": true
    }" | python3 -c "
import sys, json, time
chunks=0; done_data={}; start=time.time(); first_ms=None
for line in sys.stdin:
    line=line.strip()
    if not line or not line.startswith('data: '): continue
    try: d=json.loads(line[6:])
    except: continue
    t=d.get('type','')
    if t=='text':
        chunks+=1
        if first_ms is None: first_ms=int((time.time()-start)*1000)
    elif t=='done': done_data=d
    elif t=='error':
        print(f'ERROR|0|0|0|0|{d.get(\"error\",\"?\")[:30]}|0'); sys.exit(0)
elapsed=int((time.time()-start)*1000)
tok_in=done_data.get('input_tokens') or done_data.get('usage',{}).get('input_tokens',0) or 0
tok_out=done_data.get('output_tokens') or done_data.get('usage',{}).get('output_tokens',0) or 0
cost=done_data.get('cost_usd') or done_data.get('usage',{}).get('cost_usd',0) or 0
print(f'{elapsed}|{first_ms or 0}|{tok_in}|{tok_out}|{cost}|{chunks}')
" 2>/dev/null || echo "TIMEOUT|0|0|0|0|0")

  if [[ "$RESULT" == ERROR* ]] || [[ "$RESULT" == TIMEOUT* ]]; then
    printf "%-8s\n" "FAILED"
    return
  fi
  IFS='|' read -r elapsed first_ms tok_in tok_out cost chunks <<< "$RESULT"
  printf "%5sms  first:%4sms  in:%5s  out:%4s  \$%-12s chunks:%s\n" \
    "$elapsed" "$first_ms" "$tok_in" "$tok_out" "$cost" "$chunks"
}

echo "  ── ANTHROPIC ──────────────────────────────────────────────────────────"
run_test "claude-haiku-4-5-20251001"     "Haiku 4.5 (agent)"          "agent"
run_test "claude-haiku-4-5-20251001"     "Haiku 4.5 (ask)"            "ask"
run_test "claude-sonnet-4-6"             "Sonnet 4.6 (agent)"         "agent"
run_test "claude-sonnet-4-20250514"      "Sonnet 4 (agent)"           "agent"

echo ""
echo "  ── GOOGLE ─────────────────────────────────────────────────────────────"
run_test "gemini-2.0-flash"              "Gemini 2.5 Flash (agent)"   "agent"
run_test "gemini-2.0-flash"              "Gemini 2.5 Flash (ask)"     "ask"
run_test "gemini-3.1-flash"             "Gemini 3.1 Flash (agent)"   "agent"
run_test "google_gemini_3_1_flash_lite"  "Gemini 3.1 Lite (agent)"    "agent"

echo ""
echo "  ── OPENAI ─────────────────────────────────────────────────────────────"
run_test "gpt-4o-mini"                   "GPT-4o Mini (agent)"        "agent"
run_test "gpt-4o-mini"                   "GPT-4o Mini (ask)"          "ask"
run_test "gpt-4.1-nano"                  "GPT-4.1 Nano (agent)"       "agent"
run_test "gpt-4.1-mini"                  "GPT-4.1 Mini (agent)"       "agent"
run_test "gpt-4.1"                       "GPT-4.1 (agent)"            "agent"
run_test "gpt-4o"                        "GPT-4o (agent)"             "agent"

echo ""
echo "  ── CLOUDFLARE WORKERS AI ──────────────────────────────────────────────"
run_test "@cf/meta/llama-3.1-8b-instruct"      "Llama 3.1 8B"         "ask"
run_test "@cf/meta/llama-3.3-70b-instruct-fp8-fast" "Llama 3.3 70B"   "ask"
run_test "@cf/meta/llama-4-scout-17b-16e-instruct"  "Llama 4 Scout"   "ask"
run_test "@cf/zai-org/glm-4.7-flash"                  "GLM 4.7 Flash"     "ask"
run_test "@cf/moonshotai/kimi-k2.5"                   "Kimi K2.5 256k"    "ask"
run_test "@cf/nvidia/nemotron-3-120b-a12b"            "Nemotron 3 120B"   "ask"

echo ""
echo "=== BENCHMARK COMPLETE ==="
echo ""
echo "Cost comparison for this prompt:"
echo "  Cheapest: GPT-4o Mini or Workers AI"
echo "  Best streaming: OpenAI (token-by-token)"  
echo "  Best reasoning: Sonnet 4.6 or GPT-4.1"
echo "  Best cost/quality ratio: GPT-4o Mini or Gemini 3.1 Lite"
