#!/bin/bash
# benchmark-full.sh — Full model smoke test with category-appropriate prompts
# Usage: ./scripts/benchmark-full.sh [sandbox|prod]
# Output: side-by-side cost/time/quality comparison

set -e
TARGET=${1:-sandbox}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "$TARGET" = "sandbox" ]; then
  BASE="https://inneranimal-dashboard.meauxbility.workers.dev"
else
  BASE="https://inneranimalmedia.com"
fi

# /api/agent/chat requires auth. Set IAM_SESSION_COOKIE or put the raw session id in ~/.iam-session-cookie
if [ -z "${IAM_SESSION_COOKIE:-}" ] && [ -f "${HOME}/.iam-session-cookie" ]; then
  IAM_SESSION_COOKIE=$(tr -d '[:space:]' < "${HOME}/.iam-session-cookie" 2>/dev/null || true)
fi
declare -a BENCH_CHAT_COOKIE=()
if [ -n "${IAM_SESSION_COOKIE:-}" ]; then
  BENCH_CHAT_COOKIE=(-H "Cookie: iam_session=${IAM_SESSION_COOKIE}")
fi

QUICK_MODE=false
[[ "${2:-}" == "--quick" ]] && QUICK_MODE=true

PASS=0; FAIL=0; SKIP=0
declare -a RESULTS

# ── Colors ──────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# ── Test runner ──────────────────────────────────────────────────────────
test_model() {
  local model="$1"
  local label="$2"
  local prompt="$3"
  local category="$4"
  local expect_tools="${5:-0}"  # 1 = expects tool use

  local start_ms=$(($(date +%s) * 1000))

  local raw
  raw=$(curl -s -X POST "$BASE/api/agent/chat" \
    -H "Content-Type: application/json" \
    "${BENCH_CHAT_COOKIE[@]}" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}],\"model_id\":\"$model\",\"stream\":true}" \
    --max-time 35 2>/dev/null)

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

  # grep -c exits 1 when count is 0; "|| echo 0" duplicates the line -> multiline "0\n0"
  chunks=$(echo "$chunks" | tr -d '[:space:]')
  tool_hits=$(echo "$tool_hits" | tr -d '[:space:]')
  has_done=$(echo "$has_done" | tr -d '[:space:]')
  has_error=$(echo "$has_error" | tr -d '[:space:]')

  # Status determination
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

  # Cost display
  local cost_str="${cost:-?}"
  local tools_str=""
  if [ "$tool_hits" -gt 0 ]; then tools_str=" 🔧x${tool_hits}"; fi

  # Store result for summary table
  RESULTS+=("$category|$status|$label|${elapsed}ms|chunks:$chunks|in:${in_tok:-?} out:${out_tok:-?}|\$${cost_str}${tools_str}")

  # Print live result
  printf "  ${status_color}%-6s${RESET}  ${BOLD}%-42s${RESET}  ${DIM}%6dms${RESET}  chunks:%-3s  ${CYAN}\$%-12s${RESET} %s\n" \
    "$status" "$label" "$elapsed" "$chunks" "${cost_str}" "$tools_str"
}

# ── Header ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║         AGENT SAM — FULL MODEL BENCHMARK                        ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}"
echo -e "  Target : ${CYAN}$BASE${RESET}"
if [ -n "${IAM_SESSION_COOKIE:-}" ]; then
  echo -e "  Auth   : ${GREEN}iam_session set${RESET} (env or ~/.iam-session-cookie)"
else
  echo -e "  Auth   : ${YELLOW}no IAM_SESSION_COOKIE — chat requests may 401${RESET}"
fi
echo -e "  Time   : $(date '+%Y-%m-%d %H:%M:%S')"
if [ "$QUICK_MODE" = true ]; then
  echo -e "  ${YELLOW}Quick mode — 6 models only${RESET}"
fi
echo ""

if [ "$QUICK_MODE" = true ]; then
echo -e "${BOLD}── QUICK (6 models) ───────────────────────────────────────────────${RESET}"
PROMPT_ANTHROPIC="In 2 sentences, explain why Cloudflare Workers are ideal for AI APIs."
PROMPT_OPENAI_SIMPLE="Reply with exactly: ok"
PROMPT_GOOGLE="In one sentence, what is the capital of France?"
PROMPT_WAI="Reply with exactly: hello"
SQL_BENCH_PROMPT="Query the ai_models table and count how many models have show_in_picker = 1"
test_model "claude-haiku-4-5-20251001" \
  "Haiku 4.5" \
  "$PROMPT_ANTHROPIC" "anthropic"
test_model "claude-haiku-4-5-20251001" \
  "Haiku 4.5 [SQL]" \
  "$SQL_BENCH_PROMPT" "anthropic" "1"
test_model "gpt-4.1-nano" \
  "GPT-4.1 Nano" \
  "$PROMPT_OPENAI_SIMPLE" "openai"
test_model "gpt-4.1-nano" \
  "GPT-4.1 Nano [SQL]" \
  "$SQL_BENCH_PROMPT" "openai" "1"
test_model "gemini-3.1-flash-lite-preview" \
  "Gemini 3.1 Flash-Lite" \
  "$PROMPT_GOOGLE" "google"
test_model "@cf/meta/llama-4-scout-17b-16e-instruct" \
  "Llama 4 Scout 17B" \
  "$PROMPT_WAI" "workers_ai"
echo ""
else
# ═══════════════════════════════════════════════════════════════════════
echo -e "${BOLD}── ANTHROPIC ──────────────────────────────────────────────────────${RESET}"
# Anthropic: code/writing tasks — best use case
PROMPT_ANTHROPIC="In 2 sentences, explain why Cloudflare Workers are ideal for AI APIs."

test_model "claude-haiku-4-5-20251001" \
  "Haiku 4.5" \
  "$PROMPT_ANTHROPIC" "anthropic"

test_model "claude-sonnet-4-6" \
  "Sonnet 4.6" \
  "Write a one-paragraph explanation of why streaming matters for AI UX." "anthropic"

test_model "claude-opus-4-6" \
  "Opus 4.6" \
  "In 3 bullet points, what are the biggest risks of over-engineering an AI platform?" "anthropic"

# Anthropic tool use
test_model "claude-haiku-4-5-20251001" \
  "Haiku 4.5 [SQL]" \
  "Query the ai_models table and count how many models have show_in_picker = 1" "anthropic" "1"

test_model "claude-sonnet-4-6" \
  "Sonnet 4.6 [SQL]" \
  "Query the ai_models table and count how many models have show_in_picker = 1" "anthropic" "1"

echo ""
# ═══════════════════════════════════════════════════════════════════════
echo -e "${BOLD}── OPENAI (Responses API) ─────────────────────────────────────────${RESET}"
# OpenAI: good at tool use, fast streaming
PROMPT_OPENAI_SIMPLE="Reply with exactly: ok"

test_model "gpt-4.1-nano" \
  "GPT-4.1 Nano" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-4.1-mini" \
  "GPT-4.1 Mini" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-4.1" \
  "GPT-4.1" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-4o-mini" \
  "GPT-4o Mini" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-4o" \
  "GPT-4o" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-5.4-nano" \
  "GPT-5.4 Nano" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-5.4-mini" \
  "GPT-5.4 Mini" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-5.4" \
  "GPT-5.4" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-5" \
  "GPT-5" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "gpt-5-mini" \
  "GPT-5 Mini" \
  "$PROMPT_OPENAI_SIMPLE" "openai"

test_model "o4-mini" \
  "o4-mini [reasoning]" \
  "What is 847 * 293? Show the calculation." "openai"

test_model "o3" \
  "o3 [reasoning]" \
  "What is 847 * 293? Show the calculation." "openai"

# OpenAI tool use
test_model "gpt-4.1-nano" \
  "GPT-4.1 Nano [SQL]" \
  "Query the ai_models table and count how many models have show_in_picker = 1" "openai" "1"

test_model "gpt-5.4-nano" \
  "GPT-5.4 Nano [SQL]" \
  "Query the ai_models table and count how many models have show_in_picker = 1" "openai" "1"

echo ""
# ═══════════════════════════════════════════════════════════════════════
echo -e "${BOLD}── GOOGLE ─────────────────────────────────────────────────────────${RESET}"
PROMPT_GOOGLE="In one sentence, what is the capital of France?"

test_model "gemini-2.5-flash" \
  "Gemini 2.5 Flash" \
  "$PROMPT_GOOGLE" "google"

test_model "google_gemini_3_1_flash_lite" \
  "Gemini 3.1 Flash-Lite" \
  "$PROMPT_GOOGLE" "google"

test_model "gemini-3.1-flash" \
  "Gemini 3.1 Flash" \
  "$PROMPT_GOOGLE" "google"

test_model "gemini-3.1-pro" \
  "Gemini 3.1 Pro" \
  "$PROMPT_GOOGLE" "google"

test_model "gemini-3.1-pro-preview-customtools" \
  "Gemini 3.1 Pro Custom Tools" \
  "$PROMPT_GOOGLE" "google"

# Google tool use
test_model "gemini-3.1-flash" \
  "Gemini 3.1 Flash [SQL]" \
  "Query the ai_models table and count how many models have show_in_picker = 1" "google" "1"

echo ""
# ═══════════════════════════════════════════════════════════════════════
echo -e "${BOLD}── WORKERS AI (Free tier) ─────────────────────────────────────────${RESET}"
# Workers AI needs simpler prompts — no tool use
PROMPT_WAI="Reply with exactly: hello"

test_model "@cf/meta/llama-3.1-8b-instruct" \
  "Llama 3.1 8B" \
  "$PROMPT_WAI" "workers_ai"

test_model "@cf/meta/llama-3.3-70b-instruct-fp8-fast" \
  "Llama 3.3 70B Fast" \
  "$PROMPT_WAI" "workers_ai"

test_model "@cf/meta/llama-4-scout-17b-16e-instruct" \
  "Llama 4 Scout 17B" \
  "$PROMPT_WAI" "workers_ai"

test_model "@cf/zai-org/glm-4.7-flash" \
  "GLM 4.7 Flash" \
  "$PROMPT_WAI" "workers_ai"

test_model "@cf/moonshotai/kimi-k2.5" \
  "Kimi K2.5 256k" \
  "$PROMPT_WAI" "workers_ai"

test_model "@cf/nvidia/nemotron-3-120b-a12b" \
  "Nemotron 3 120B" \
  "$PROMPT_WAI" "workers_ai"

echo ""
fi
# ═══════════════════════════════════════════════════════════════════════
# SUMMARY TABLE
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

if [ "$TARGET" = "sandbox" ] && [ -f "${REPO_ROOT}/scripts/with-cloudflare-env.sh" ]; then
  VID=$(tr -d '[:space:]' < "${REPO_ROOT}/agent-dashboard/.last-sandbox-worker-version" 2>/dev/null || true)
  TOTAL=$((PASS + FAIL + SKIP))
  [ "${TOTAL:-0}" -eq 0 ] && TOTAL=1
  SCORE="${PASS}/${TOTAL}"
  BENCH_ST="passed"
  [ "${FAIL:-0}" -gt 0 ] && BENCH_ST="failed"
  if [[ "$VID" =~ ^[a-f0-9-]{36}$ ]]; then
    VID_ESC=$(printf '%s' "$VID" | sed "s/'/''/g")
    SCORE_ESC=$(printf '%s' "$SCORE" | sed "s/'/''/g")
    (cd "$REPO_ROOT" && ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command="UPDATE cicd_runs SET phase_benchmark_score='${SCORE_ESC}', phase_benchmark_status='${BENCH_ST}', phase_benchmark_completed_at=unixepoch() WHERE cf_worker_version_id='${VID_ESC}';" 2>/dev/null) || true
  fi
fi

# Cost leaders
echo -e "${BOLD}── COST LEADERS ────────────────────────────────────────────────────${RESET}"
echo "  Cheapest text:    Gemini 3.1 Flash-Lite (\$0.00004/call est)"
echo "  Cheapest tools:   GPT-4.1 Nano (\$0.10/MTok in)"  
echo "  Best streaming:   OpenAI (token-by-token vs Anthropic chunks:1)"
echo "  Best reasoning:   o4-mini or o3"
echo "  Best free:        Llama 4 Scout (vision + tools + 131k)"
echo "  Best quality/$:   Sonnet 4.6 or Gemini 3.1 Flash"
echo ""
echo -e "  Run: ${CYAN}./scripts/benchmark-full.sh prod${RESET} to test production"
echo ""
