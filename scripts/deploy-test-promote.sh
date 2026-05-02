#!/bin/bash
# deploy-test-promote.sh
# Usage:
#   ./scripts/deploy-test-promote.sh           → sandbox deploy + test only
#   ./scripts/deploy-test-promote.sh --promote → sandbox + test + promote to prod + push GitHub
#   ./scripts/deploy-test-promote.sh --worker-only → skip React build
#
# Requirements: GITHUB_TOKEN in env or ~/.zshrc, wrangler authed

set -e
cd /Users/samprimeaux/Downloads/march1st-inneranimalmedia

PROMOTE=false
WORKER_ONLY=false
SANDBOX_URL="https://inneranimal-dashboard.meauxbility.workers.dev"
PROD_URL="https://inneranimalmedia.com"
PASS=0
FAIL=0
GITHUB_REPO="SamPrimeaux/inneranimalmedia-agentsam-dashboard"
GITHUB_BRANCH="main"

for arg in "$@"; do
  case $arg in
    --promote) PROMOTE=true ;;
    --worker-only) WORKER_ONLY=true ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $1"; }
pass() { echo "  ✅ PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ FAIL  $1"; FAIL=$((FAIL+1)); }

test_model() {
  local base="$1" model="$2" prompt="$3" label="$4"
  local chunks
  chunks=$(curl -s -X POST "$base/api/agent/chat" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}],\"model_id\":\"$model\",\"stream\":true}" \
    --max-time 30 | grep -c '"type":"text"' || true)
  if [ "$chunks" -gt "0" ]; then
    pass "$label ($chunks chunks)"
  else
    fail "$label — 0 chunks"
  fi
}

test_tool() {
  local base="$1" model="$2" prompt="$3" label="$4"
  local result
  result=$(curl -s -X POST "$base/api/agent/chat" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}],\"model_id\":\"$model\",\"stream\":true}" \
    --max-time 45 | grep '"type":"text"' | grep -v '""' | wc -l | tr -d ' ')
  if [ "$result" -gt "0" ]; then
    pass "$label (tool returned data)"
  else
    fail "$label — no tool result"
  fi
}

# ─── STEP 1: BUILD ───────────────────────────────────────────────────────────
log "=== STEP 1: BUILD ==="
if [ "$WORKER_ONLY" = false ]; then
  log "Building React bundle..."
  npm run build:vite-only
  log "React build complete."
else
  log "Skipping React build (--worker-only)"
fi

# ─── STEP 2: SANDBOX DEPLOY ──────────────────────────────────────────────────
log "=== STEP 2: SANDBOX DEPLOY ==="
./scripts/deploy-sandbox.sh
log "Sandbox deployed."
sleep 3  # let worker propagate

# ─── STEP 3: SMOKE TEST ──────────────────────────────────────────────────────
log "=== STEP 3: SMOKE TEST (sandbox) ==="
echo ""
echo "── CORE MODELS ──────────────────────────────────────────────────"
test_model "$SANDBOX_URL" "gpt-4.1-nano"              "say hi" "GPT-4.1 Nano"
test_model "$SANDBOX_URL" "gpt-4.1-mini"              "say hi" "GPT-4.1 Mini"
test_model "$SANDBOX_URL" "gpt-5.4-nano"              "say hi" "GPT-5.4 Nano"
test_model "$SANDBOX_URL" "claude-haiku-4-5-20251001" "say hi" "Haiku 4.5"
test_model "$SANDBOX_URL" "claude-sonnet-4-6"         "say hi" "Sonnet 4.6"
test_model "$SANDBOX_URL" "gemini-2.5-flash"          "say hi" "Gemini 2.5 Flash"
test_model "$SANDBOX_URL" "google_gemini_3_1_flash_lite" "say hi" "Gemini 3.1 Flash-Lite"

echo ""
echo "── TOOL USE ─────────────────────────────────────────────────────"
test_tool "$SANDBOX_URL" "gpt-4.1-nano"              "Query the ai_models table for a count of all active models" "SQL tool (GPT-4.1-nano)"
test_tool "$SANDBOX_URL" "gpt-5.4-nano"              "Query the ai_models table for a count of all active models" "SQL tool (GPT-5.4-nano)"
test_tool "$SANDBOX_URL" "claude-haiku-4-5-20251001" "Query the ai_models table for a count of all active models" "SQL tool (Haiku)"

echo ""
echo "── HEALTH CHECK ─────────────────────────────────────────────────"
health=$(curl -s -o /dev/null -w "%{http_code}" "$SANDBOX_URL/api/health" --max-time 10)
if [ "$health" = "200" ]; then
  pass "/api/health → 200"
else
  fail "/api/health → $health"
fi

echo ""
echo "=== SANDBOX RESULTS: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt "0" ]; then
  echo ""
  echo "❌ $FAIL test(s) failed — aborting. Fix issues before promoting."
  exit 1
fi

if [ "$PROMOTE" = false ]; then
  echo ""
  echo "✅ All tests passed. Run with --promote to push to prod + GitHub."
  exit 0
fi

# ─── STEP 4: PROMOTE TO PROD ─────────────────────────────────────────────────
log "=== STEP 4: PROMOTE TO PRODUCTION ==="
./scripts/promote-to-prod.sh
log "Production deploy complete."
sleep 3

# ─── STEP 5: PROD SMOKE TEST (quick) ─────────────────────────────────────────
log "=== STEP 5: PROD SMOKE TEST ==="
PASS=0; FAIL=0
test_model "$PROD_URL" "gpt-4.1-nano"              "say hi" "Prod GPT-4.1 Nano"
test_model "$PROD_URL" "claude-haiku-4-5-20251001" "say hi" "Prod Haiku 4.5"
test_model "$PROD_URL" "gemini-2.5-flash"          "say hi" "Prod Gemini 2.5 Flash"
test_tool  "$PROD_URL" "gpt-4.1-nano" "Query the ai_models table for a count of all active models" "Prod SQL tool"

echo ""
echo "=== PROD RESULTS: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt "0" ]; then
  echo "⚠️  Prod test failures detected. Check logs immediately."
  echo "   wrangler tail: ./scripts/with-cloudflare-env.sh npx wrangler tail inneranimalmedia --config wrangler.production.toml --format pretty"
  exit 1
fi

# ─── STEP 6: PUSH TO GITHUB ──────────────────────────────────────────────────
log "=== STEP 6: PUSH TO GITHUB ($GITHUB_BRANCH) ==="
git add -A
DEPLOY_MSG="deploy: v$(date '+%Y%m%d-%H%M') — sandbox+prod pass, $((PASS))/$((PASS+FAIL)) tests"
git commit -m "$DEPLOY_MSG" || log "Nothing new to commit."
git push origin "$GITHUB_BRANCH"
log "GitHub push complete → $GITHUB_REPO @ $GITHUB_BRANCH"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ FULL DEPLOY COMPLETE                             ║"
echo "║  Sandbox: v=latest @ meauxbility.workers.dev        ║"
echo "║  Prod:    live @ inneranimalmedia.com                ║"
echo "║  GitHub:  pushed → agentsam-clean                   ║"
echo "╚══════════════════════════════════════════════════════╝"
