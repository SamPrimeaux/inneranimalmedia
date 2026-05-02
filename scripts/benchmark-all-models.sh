#!/bin/bash
TARGET=${1:-sandbox}
BASE="https://inneranimal-dashboard.meauxbility.workers.dev"
[ "$TARGET" = "prod" ] && BASE="https://inneranimalmedia.com"

PROMPT="Do THREE things concisely: 1) Write SQL to count rows in agent_sessions created today. 2) Write a 3-line JS debounce function. 3) One sentence: what is a Cloudflare Worker?"

run_test() {
  local model_id="$1" label="$2" mode="${3:-agent}"
  local START=$(python3 -c "import time; print(int(time.time()*1000))")
  local RESPONSE=$(curl -s -N -X POST "$BASE/api/agent/chat" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":$(echo "$PROMPT" | python3 -c "import sys,json;print(json.dumps(sys.stdin.read().strip()))")}],\"model_id\":\"$model_id\",\"mode\":\"$mode\",\"stream\":true}" \
    --max-time 60 2>/dev/null)
  local TOTAL=$(($(python3 -c "import time; print(int(time.time()*1000))") - START))
  local IN=$(echo "$RESPONSE" | grep -o '"input_tokens":[0-9]*' | tail -1 | grep -o '[0-9]*')
  local OUT=$(echo "$RESPONSE" | grep -o '"output_tokens":[0-9]*' | tail -1 | grep -o '[0-9]*')
  local COST=$(echo "$RESPONSE" | grep -o '"cost_usd":[0-9.e+-]*' | tail -1 | grep -o '[0-9.e+-]*')
  local CHUNKS=$(echo "$RESPONSE" | grep -c '"type":"text"')
  local ERROR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | head -1 | sed 's/"error":"//;s/"//')
  IN=${IN:-0}; OUT=${OUT:-0}; COST=${COST:-0}; CHUNKS=${CHUNKS:-0}
  if echo "$RESPONSE" | grep -q '"type":"error"' && [ "$CHUNKS" = "0" ]; then
    printf "  %-44s %s\n" "$label" "FAILED: $(echo $ERROR | cut -c1-50)"
  else
    printf "  %-44s %6sms  in:%-6s out:%-4s cost:\$%-12s chunks:%s\n" \
      "$label" "$TOTAL" "$IN" "$OUT" "$COST" "$CHUNKS"
  fi
}

echo ""
echo "=== FULL MODEL BENCHMARK === $(date '+%H:%M %Z')"
echo "  Target: $BASE"
echo ""
printf "  %-44s %6s  %-8s %-8s %-16s %s\n" "Model" "Total" "In" "Out" "Cost" "Chunks"
echo "  $(printf '%.0s─' {1..100})"

echo ""
echo "── WORKERS AI (FREE) ─────────────────────────────────────────────"
run_test "@cf/meta/llama-3.1-8b-instruct"            "Llama 3.1 8B           FREE"
run_test "@cf/meta/llama-3.3-70b-instruct-fp8-fast"  "Llama 3.3 70B Fast     FREE"
run_test "@cf/meta/llama-4-scout-17b-16e-instruct"   "Llama 4 Scout 17B      FREE"
run_test "@cf/moonshotai/kimi-k2.5"                  "Kimi K2.5 256k         FREE"
run_test "@cf/nvidia/nemotron-3-120b-a12b"           "Nemotron 3 120B        FREE"
run_test "@cf/zai-org/glm-4.7-flash"                 "GLM 4.7 Flash          FREE"

echo ""
echo "── GOOGLE ────────────────────────────────────────────────────────"
run_test "google_gemini_3_1_flash_lite"  "Gemini 3.1 Flash-Lite  \$0.01"
run_test "gemini-2.0-flash"             "Gemini 2.5 Flash       \$0.10"
run_test "gemini-3.1-flash"            "Gemini 3.1 Flash       \$0.10"
run_test "gemini-3.1-pro"              "Gemini 3.1 Pro         \$2.00"

echo ""
echo "── OPENAI NANO/MINI ──────────────────────────────────────────────"
run_test "gpt-4.1-nano"   "GPT-4.1 Nano           \$0.10"
run_test "gpt-4o-mini"    "GPT-4o Mini            \$0.15"
run_test "gpt-5-nano"     "GPT-5 Nano             \$0.15"
run_test "gpt-5.4-nano"   "GPT-5.4 Nano           \$0.20"
run_test "gpt-4.1-mini"   "GPT-4.1 Mini           \$0.40"
run_test "gpt-5.4-mini"   "GPT-5.4 Mini           \$0.75"

echo ""
echo "── OPENAI MID ────────────────────────────────────────────────────"
run_test "o4-mini"      "o4-mini                \$1.10"
run_test "gpt-5-mini"   "GPT-5 Mini             \$1.25"
run_test "gpt-5"        "GPT-5                  \$1.25"
run_test "gpt-4.1"      "GPT-4.1                \$2.00"
run_test "gpt-4o"       "GPT-4o                 \$2.50"
run_test "gpt-5.4"      "GPT-5.4                \$2.50"

echo ""
echo "── OPENAI HEAVY (use sparingly) ──────────────────────────────────"
run_test "o3"   "o3                     \$10.0"

echo ""
echo "── ANTHROPIC ─────────────────────────────────────────────────────"
run_test "claude-haiku-4-5-20251001"  "Haiku 4.5              \$1.00"
run_test "claude-sonnet-4-6"          "Sonnet 4.6             \$3.00"
run_test "claude-opus-4-6"            "Opus 4.6               \$5.00"

echo ""
echo "── ASK MODE (light context) ──────────────────────────────────────"
run_test "gpt-4.1-nano"               "GPT-4.1 Nano (ask)"   ask
run_test "gpt-4o-mini"                "GPT-4o Mini (ask)"    ask
run_test "claude-haiku-4-5-20251001"  "Haiku 4.5 (ask)"      ask
run_test "google_gemini_3_1_flash_lite" "Gemini Lite (ask)"  ask

echo ""
echo "=== DONE === ~\$0.10-0.15 total spend"
echo "NOTE: Workers AI (FREE) needs env.AI — run with 'prod' for WAI results"
