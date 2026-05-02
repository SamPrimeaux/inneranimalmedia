#!/usr/bin/env bash
# benchmark-providers.sh — compare response time + token cost across providers
# Usage: ./scripts/benchmark-providers.sh [sandbox|prod]
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

echo "=== PROVIDER BENCHMARK ==="
echo "  Target : $TARGET ($BASE_URL)"
echo "  Prompt : $PROMPT"
echo ""

run_test() {
  local MODEL_ID="$1"
  local LABEL="$2"
  local MODE="${3:-agent}"

  printf "  %-35s " "$LABEL"

  local START_MS
  START_MS=$(python3 -c "import time; print(int(time.time()*1000))")

  local RESULT
  RESULT=$(curl -sN "$BASE_URL/api/agent/chat" \
    -H "Content-Type: application/json" \
    -H "Cookie: session=$SESSION" \
    --max-time 30 \
    --data "{
      \"messages\": [{\"role\":\"user\",\"content\":$(echo "$PROMPT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}],
      \"model_id\": \"$MODEL_ID\",
      \"mode\": \"$MODE\",
      \"stream\": true
    }" | python3 -c "
import sys, json, time

chunks = 0
done_data = {}
start = time.time()
first_ms = None

for line in sys.stdin:
    line = line.strip()
    if not line or not line.startswith('data: '):
        continue
    try:
        d = json.loads(line[6:])
    except:
        continue
    t = d.get('type','')
    if t == 'text':
        chunks += 1
        if first_ms is None:
            first_ms = int((time.time()-start)*1000)
    elif t == 'done':
        done_data = d
    elif t == 'error':
        print(f'ERROR|0|0|0|0|{d.get(\"error\",\"?\")}')
        pass  # don't exit on error if chunks came in

elapsed = int((time.time()-start)*1000)
tok_in = done_data.get('input_tokens') or done_data.get('usage',{}).get('input_tokens',0) or 0
tok_out = done_data.get('output_tokens') or done_data.get('usage',{}).get('output_tokens',0) or 0
cost = done_data.get('cost_usd') or done_data.get('usage',{}).get('cost_usd',0) or 0
model_used = done_data.get('model_used','?')
print(f'{elapsed}|{first_ms or 0}|{tok_in}|{tok_out}|{cost}|{model_used}|{chunks}')
" 2>/dev/null || echo "TIMEOUT|0|0|0|0|?|0")

  if [[ "$RESULT" == ERROR* ]] || [[ "$RESULT" == TIMEOUT* ]]; then
    printf "FAILED (%s)\n" "${RESULT%%|*}"
    return
  fi

  IFS='|' read -r elapsed first_ms tok_in tok_out cost model_used chunks <<< "$RESULT"
  printf "%5sms  first:%4sms  in:%5s  out:%4s  cost:\$%-10s chunks:%s\n" \
    "$elapsed" "$first_ms" "$tok_in" "$tok_out" "$cost" "$chunks"
}

echo "  Model                               Total    First    Tokens In  Out   Cost          Chunks"
echo "  ──────────────────────────────────────────────────────────────────────────────────────────"

run_test "claude-haiku-4-5-20251001"        "Anthropic Haiku 4.5"         "agent"
run_test "gemini-2.0-flash"                 "Google Gemini 2.5 Flash"     "agent"
run_test "google_gemini_3_1_flash_lite"     "Google Gemini 3.1 Flash Lite" "agent"
run_test "gpt-4o-mini"                      "OpenAI GPT-4o Mini"          "agent"
run_test "gemini-2.0-flash"                 "Gemini 2.5 Flash (ask)"      "ask"
run_test "claude-haiku-4-5-20251001"        "Haiku (ask mode)"            "ask"

run_test "gpt-4o"           "OpenAI GPT-4o"        "agent"
run_test "gpt-4.1-nano"     "OpenAI GPT-4.1 Nano"  "agent"
run_test "gpt-4.1-mini"     "OpenAI GPT-4.1 Mini"  "agent"
run_test "gpt-5.4-nano"     "OpenAI GPT-5.4 Nano"  "agent"
run_test "gpt-5.4-mini"     "OpenAI GPT-5.4 Mini"  "agent"

echo ""
echo "=== BENCHMARK COMPLETE ==="
echo "Note: 'ask' mode uses fewer tools and less context — compare same prompt across modes"
