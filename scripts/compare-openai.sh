#!/bin/bash
# compare-openai.sh — OpenAI model quality comparison via Agent Sam worker
# Usage: ./scripts/compare-openai.sh [sandbox|prod] [chat|code|sql|reason|codex]

set -e
TARGET=${1:-sandbox}
TEST_TYPE=${2:-code}

if [ "$TARGET" = "sandbox" ]; then
  BASE="https://inneranimal-dashboard.meauxbility.workers.dev"
else
  BASE="https://inneranimalmedia.com"
fi

PASS=0; FAIL=0
declare -a RESULTS

# ── Colors ───────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# ── Test runner (mirrors benchmark-full.sh exactly) ───────────────────────
test_model() {
  local model="$1"
  local label="$2"
  local prompt="$3"
  local category="$4"
  local expect_tools="${5:-0}"

  local start_ms=$(($(date +%s) * 1000))

  local raw
  raw=$(curl -s -X POST "$BASE/api/agent/chat" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}],\"model_id\":\"$model\",\"stream\":true}" \
    --max-time 45 2>/dev/null)

  local end_ms=$(($(date +%s) * 1000))
  local elapsed=$((end_ms - start_ms))

  local chunks
  chunks=$(echo "$raw" | grep -c '"type":"text"' 2>/dev/null || echo 0)
  local tool_hits
  tool_hits=$(echo "$raw" | grep -c '"type":"tool_start"' 2>/dev/null || echo 0)
  local cost
  cost=$(echo "$raw" | grep -o '"cost_usd":[0-9.e+-]*' | head -1 | cut -d: -f2)
  local in_tok
  in_tok=$(echo "$raw" | grep -o '"input_tokens":[0-9]*' | head -1 | cut -d: -f2)
  local out_tok
  out_tok=$(echo "$raw" | grep -o '"output_tokens":[0-9]*' | head -1 | cut -d: -f2)
  local has_done
  has_done=$(echo "$raw" | grep -c '"type":"done"' 2>/dev/null || echo 0)
  local has_error
  has_error=$(echo "$raw" | grep -c '"type":"error"' 2>/dev/null || echo 0)

  local status="PASS"
  local status_color="$GREEN"

  if [ "$chunks" -eq 0 ] && [ "$has_done" -eq 0 ]; then
    status="FAIL"; status_color="$RED"; FAIL=$((FAIL+1))
  elif [ "$has_error" -gt 0 ] && [ "$chunks" -eq 0 ]; then
    status="ERROR"; status_color="$RED"; FAIL=$((FAIL+1))
  elif [ "$expect_tools" = "1" ] && [ "$tool_hits" -eq 0 ] && [ "$chunks" -gt 0 ]; then
    status="NOTOOL"; status_color="$YELLOW"; PASS=$((PASS+1))
  else
    PASS=$((PASS+1))
  fi

  local cost_str="${cost:-?}"
  local tools_str=""
  if [ "$tool_hits" -gt 0 ]; then tools_str=" 🔧x${tool_hits}"; fi

  RESULTS+=("$category|$status|$label|${elapsed}ms|chunks:$chunks|in:${in_tok:-?} out:${out_tok:-?}|\$${cost_str}${tools_str}")

  printf "  ${status_color}%-6s${RESET}  ${BOLD}%-42s${RESET}  ${DIM}%6dms${RESET}  chunks:%-3s  ${CYAN}\$%-12s${RESET} %s\n" \
    "$status" "$label" "$elapsed" "$chunks" "${cost_str}" "$tools_str"
}

# ── Prompt sets ───────────────────────────────────────────────────────────
case "$TEST_TYPE" in
  chat)
    TEST_LABEL="CHAT QUALITY"
    P_NANO="Reply with exactly: ok"
    P_MINI="In 2 sentences, explain why Cloudflare Workers are ideal for AI APIs."
    P_STD="Write a one-paragraph explanation of why streaming matters for AI UX."
    P_PRO="In 3 bullet points, what are the biggest risks of over-engineering an AI platform?"
    P_REASON="In 3 bullet points, what are the biggest risks of over-engineering an AI platform?"
    P_CODEX="In 2 sentences, explain why Cloudflare Workers are ideal for AI APIs."
    ;;
  code)
    TEST_LABEL="CODE GEN"
    P_NANO="Write a JS one-liner that removes duplicates from an array."
    P_MINI="Write a TypeScript function that debounces a callback with a configurable delay. Types only, no comments."
    P_STD='Write a TypeScript function called classifyIntent that accepts a string and returns one of: "sql_query"|"file_op"|"chat"|"code_gen"|"system_cmd" using keyword matching. Export it. Code only.'
    P_PRO="Write a production-ready TypeScript Cloudflare Worker fetch handler that rate-limits requests by IP using KV, returns 429 with Retry-After on limit exceeded, and allows 100 req/min. Code only."
    P_REASON='Write a TypeScript function called classifyIntent that accepts a string and returns one of: "sql_query"|"file_op"|"chat"|"code_gen"|"system_cmd" using keyword matching. Export it. Code only.'
    P_CODEX="Write a production-ready TypeScript Cloudflare Worker fetch handler that rate-limits requests by IP using KV, returns 429 with Retry-After on limit exceeded, and allows 100 req/min. Code only."
    ;;
  sql)
    TEST_LABEL="SQL / TOOL USE"
    P_NANO="Query the ai_models table and count how many models have show_in_picker = 1"
    P_MINI="Query the ai_models table and count how many models have show_in_picker = 1"
    P_STD="Query the cloudflare_deployments table for the 5 most recent successful deploys"
    P_PRO="Query the cloudflare_deployments table for the 5 most recent successful deploys"
    P_REASON="Query the cloudflare_deployments table for the 5 most recent successful deploys"
    P_CODEX="Query the ai_models table and count how many models have show_in_picker = 1"
    EXPECT_TOOLS=1
    ;;
  reason)
    TEST_LABEL="REASONING / MATH"
    P_NANO="What is 847 * 293? Show the calculation."
    P_MINI="What is 847 * 293? Show the calculation."
    P_STD="A Cloudflare Worker handles 10000 requests per day at \$0.002 per request. If 60% route to a \$0.0003 model instead, what is the monthly cost reduction? Show arithmetic."
    P_PRO="A Cloudflare Worker handles 10000 requests per day at \$0.002 per request. If 60% route to a \$0.0003 model instead, what is the monthly cost reduction? Show arithmetic."
    P_REASON="A Cloudflare Worker handles 10000 requests per day at \$0.002 per request. If 60% route to a \$0.0003 model instead, what is the monthly cost reduction? Show arithmetic."
    P_CODEX="What is 847 * 293? Show the calculation."
    ;;
  codex)
    TEST_LABEL="AGENTIC CODEX"
    P_NANO="Write a bash one-liner that checks if port 3099 is in use."
    P_MINI="Write a bash function that accepts a worker name and prints PASS or FAIL based on whether a curl to the Cloudflare API returns 200. Under 15 lines."
    P_STD="Write a bash function called verify_deploy that curls the Cloudflare workers API using CF_ACCOUNT_ID and CF_API_TOKEN, checks the HTTP code, and prints PASS or FAIL with the worker name. Under 20 lines. Code only."
    P_PRO="Write a bash function called verify_deploy that curls the Cloudflare workers API using CF_ACCOUNT_ID and CF_API_TOKEN, checks the HTTP code, and prints PASS or FAIL with the worker name. Under 20 lines. Code only."
    P_REASON="Write a bash function called verify_deploy that curls the Cloudflare workers API using CF_ACCOUNT_ID and CF_API_TOKEN, checks the HTTP code, and prints PASS or FAIL with the worker name. Under 20 lines. Code only."
    P_CODEX="Write a bash function called verify_deploy that curls the Cloudflare workers API using CF_ACCOUNT_ID and CF_API_TOKEN, checks the HTTP code, and prints PASS or FAIL with the worker name. Under 20 lines. Code only."
    ;;
  *)
    echo "Unknown test: $TEST_TYPE. Use: chat | code | sql | reason | codex"
    exit 1
    ;;
esac

EXPECT_TOOLS="${EXPECT_TOOLS:-0}"

# ── Header ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║         AGENT SAM — OPENAI MODEL COMPARISON                     ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}"
echo -e "  Target : ${CYAN}$BASE${RESET}"
echo -e "  Test   : ${CYAN}$TEST_LABEL${RESET}"
echo -e "  Time   : $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ── NANO TIER ─────────────────────────────────────────────────────────────
echo -e "${BOLD}── NANO TIER ──────────────────────────────────────────────────────${RESET}"
test_model "gpt-4.1-nano"  "GPT-4.1 Nano"  "$P_NANO"  "nano"  "$EXPECT_TOOLS"
test_model "gpt-5.4-nano"  "GPT-5.4 Nano"  "$P_NANO"  "nano"  "$EXPECT_TOOLS"

echo ""
# ── MINI TIER ─────────────────────────────────────────────────────────────
echo -e "${BOLD}── MINI TIER ──────────────────────────────────────────────────────${RESET}"
test_model "gpt-4.1-mini"  "GPT-4.1 Mini"  "$P_MINI"  "mini"  "$EXPECT_TOOLS"
test_model "gpt-5.4-mini"  "GPT-5.4 Mini"  "$P_MINI"  "mini"  "$EXPECT_TOOLS"
test_model "gpt-5-mini"    "GPT-5 Mini"    "$P_MINI"  "mini"  "$EXPECT_TOOLS"

echo ""
# ── STANDARD TIER ─────────────────────────────────────────────────────────
echo -e "${BOLD}── STANDARD TIER ──────────────────────────────────────────────────${RESET}"
test_model "gpt-5"    "GPT-5"    "$P_STD"  "standard"  "$EXPECT_TOOLS"
test_model "gpt-5.4"  "GPT-5.4"  "$P_STD"  "standard"  "$EXPECT_TOOLS"

echo ""
# ── PRO TIER ──────────────────────────────────────────────────────────────
echo -e "${BOLD}── PRO TIER ───────────────────────────────────────────────────────${RESET}"
test_model "gpt-5.4-pro"  "GPT-5.4 Pro"  "$P_PRO"  "pro"  "$EXPECT_TOOLS"

echo ""
# ── REASONING ─────────────────────────────────────────────────────────────
echo -e "${BOLD}── REASONING ──────────────────────────────────────────────────────${RESET}"
test_model "o4-mini"  "o4-mini [reasoning]"  "$P_REASON"  "reasoning"  "0"
test_model "o3"       "o3 [reasoning]"       "$P_REASON"  "reasoning"  "0"

echo ""
# ── CODEX / AGENTIC ───────────────────────────────────────────────────────
echo -e "${BOLD}── CODEX / AGENTIC ────────────────────────────────────────────────${RESET}"
test_model "gpt-5-codex"          "GPT-5 Codex"          "$P_CODEX"  "codex"  "0"
test_model "gpt-5.1-codex-mini"   "GPT-5.1 Codex Mini"   "$P_CODEX"  "codex"  "0"
test_model "gpt-5.1-codex-max"    "GPT-5.1 Codex Max"    "$P_CODEX"  "codex"  "0"
test_model "gpt-5.2-codex"        "GPT-5.2 Codex"        "$P_CODEX"  "codex"  "0"
test_model "gpt-5.3-codex"        "GPT-5.3 Codex"        "$P_CODEX"  "codex"  "0"

echo ""
# ── RESULTS SUMMARY ───────────────────────────────────────────────────────
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  RESULTS SUMMARY                                                 ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}"
echo ""

current_cat=""
for result in "${RESULTS[@]}"; do
  IFS='|' read -r cat status label timing chunks tokens cost <<< "$result"
  if [ "$cat" != "$current_cat" ]; then
    echo -e "  ${BOLD}${CYAN}$cat${RESET}"
    current_cat="$cat"
  fi

  if [ "$status" = "PASS" ]; then
    color="$GREEN"
  elif [ "$status" = "NOTOOL" ]; then
    color="$YELLOW"
  else
    color="$RED"
  fi

  printf "    ${color}%-6s${RESET}  %-42s  %-10s  %-20s  %s\n" \
    "$status" "$label" "$timing" "$chunks" "$cost"
done

echo ""
echo -e "  ${GREEN}✅ PASS: $PASS${RESET}  ${RED}❌ FAIL/ERROR: $FAIL${RESET}"
echo ""
echo -e "${BOLD}── RERUN ────────────────────────────────────────────────────────────${RESET}"
echo -e "  ${CYAN}./scripts/compare-openai.sh $TARGET chat${RESET}"
echo -e "  ${CYAN}./scripts/compare-openai.sh $TARGET sql${RESET}"
echo -e "  ${CYAN}./scripts/compare-openai.sh $TARGET reason${RESET}"
echo -e "  ${CYAN}./scripts/compare-openai.sh $TARGET codex${RESET}"
echo -e "  ${CYAN}./scripts/benchmark-full.sh $TARGET${RESET}  (full provider benchmark)"
echo ""
