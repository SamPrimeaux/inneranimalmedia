#!/usr/bin/env bash
# Production /api/agent/chat smoke tests; logs quality_checks via D1.
# Auth: set INGEST_SECRET (same as Worker secret) in .env.cloudflare OR SESSION_COOKIE='session=...'
# Rate limits: SMOKE_DELAY_SECONDS between requests (default 6). SMOKE_FULL=1 runs full matrix; else minimal (5 calls).

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ -f "${REPO_ROOT}/.env.cloudflare" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

BASE="${BASE:-https://inneranimalmedia.com}"
SESSION_COOKIE="${SESSION_COOKIE:-}"
INGEST_SECRET="${INGEST_SECRET:-}"
SMOKE_DELAY_SECONDS="${SMOKE_DELAY_SECONDS:-6}"
SMOKE_FULL="${SMOKE_FULL:-0}"

if [ -z "$SESSION_COOKIE" ] && [ -z "$INGEST_SECRET" ]; then
  echo "Set INGEST_SECRET in .env.cloudflare (X-Ingest-Secret) or SESSION_COOKIE='session=...'" >&2
  exit 1
fi

LOG_FILE="/tmp/smoke-test-$(date +%Y%m%d-%H%M%S).json"
echo "[]" > "$LOG_FILE"

run_test() {
  local model=$1
  local provider=$2
  local test_type=$3
  local prompt=$4
  local expect=$5
  local start_ms end_ms duration_ms response has_content status met

  start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
  response=$(INGEST_SECRET="${INGEST_SECRET}" SESSION_COOKIE="${SESSION_COOKIE}" BASE="$BASE" MODEL="$model" PROMPT="$prompt" python3 <<'PY'
import json, os, sys, urllib.request
base = os.environ["BASE"].rstrip("/")
model = os.environ["MODEL"]
prompt = os.environ["PROMPT"]
ingest = os.environ.get("INGEST_SECRET") or ""
cookie = os.environ.get("SESSION_COOKIE") or ""
payload = {
    "model_id": model,
    "messages": [{"role": "user", "content": prompt}],
    "mode": "ask",
    "stream": False,
}
data = json.dumps(payload).encode("utf-8")
headers = {"Content-Type": "application/json"}
if ingest:
    headers["X-Ingest-Secret"] = ingest
elif cookie:
    headers["Cookie"] = cookie
else:
    sys.stdout.write(json.dumps({"error": "no auth"}))
    sys.exit(0)
req = urllib.request.Request(base + "/api/agent/chat", data=data, headers=headers, method="POST")
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        sys.stdout.buffer.write(r.read())
except Exception as e:
    sys.stdout.write(json.dumps({"error": str(e)}))
PY
)
  end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
  duration_ms=$((end_ms - start_ms))

  if echo "$response" | grep -q '"text"'; then
    has_content=1
    status="pass"
  else
    has_content=0
    status="fail"
  fi

  met=0
  if [ "$duration_ms" -lt 120000 ]; then met=1; fi

  echo "[$model/$test_type] $status -- ${duration_ms}ms"

  details_sql="Model: $model | Provider: $provider | Duration: ${duration_ms}ms | Has content: $has_content | Expect: $expect"
  safe_check=$(python3 -c "import re,sys; print(re.sub(r'[^a-zA-Z0-9_-]+','_',sys.argv[1])[:120])" "${model}_${test_type}")
  details_esc=$(python3 -c 'import sys; print(sys.argv[1].replace(chr(39), chr(39)+chr(39)))' "$details_sql")

  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
    --remote -c wrangler.production.toml \
    --command="INSERT INTO quality_checks
      (project_id,check_type,check_name,status,actual_value,expected_value,
       threshold_met,details,severity,automated,check_category,checked_at)
      VALUES ('inneranimalmedia','performance',
        'smoke_${safe_check}',
        '$status','${duration_ms}ms','<120000ms',
        $met,
        '$details_esc',
        'medium',1,'model_smoke_test',datetime('now'))" 2>/dev/null || true

  sleep "${SMOKE_DELAY_SECONDS}"
}

echo "=== SMOKE TEST $(date) BASE=$BASE delay=${SMOKE_DELAY_SECONDS}s full=${SMOKE_FULL} ==="

if [ "$SMOKE_FULL" = "1" ]; then
  echo "--- Anthropic ---"
  run_test "claude-haiku-4-5-20251001" "anthropic" "basic" "Reply with exactly: HAIKU_OK" "HAIKU_OK"
  run_test "claude-haiku-4-5-20251001" "anthropic" "tool_stream" "What is 2+2? Answer in one word." "four"
  run_test "claude-haiku-4-5-20251001" "anthropic" "json" "Reply with valid JSON: {\"status\":\"ok\"}" '{"status":"ok"}'
  run_test "claude-sonnet-4-20250514" "anthropic" "basic" "Reply with exactly: SONNET_OK" "SONNET_OK"
  run_test "claude-opus-4-6" "anthropic" "basic" "Reply with exactly: OPUS_OK" "OPUS_OK"
  echo "--- OpenAI ---"
  run_test "gpt-4o-mini" "openai" "basic" "Reply with exactly: MINI_OK" "MINI_OK"
  run_test "gpt-4o-mini" "openai" "stream_check" "Count from 1 to 3, one number per line." "1..3"
  run_test "gpt-4.1-nano" "openai" "basic" "Reply with exactly: NANO_OK" "NANO_OK"
  run_test "gpt-4o" "openai" "basic" "Reply with exactly: GPT4O_OK" "GPT4O_OK"
  run_test "o4-mini" "openai" "reasoning" "60mph for 2 hours distance? One sentence." "120 miles"
  echo "--- Google ---"
  run_test "gemini-2.5-flash" "google" "basic" "Reply with exactly: FLASH_OK" "FLASH_OK"
  run_test "gemini-2.5-flash" "google" "token_check" "Capital of France? One word." "Paris"
  run_test "gemini-3-flash-preview" "google" "basic" "Reply with exactly: FLASH3_OK" "FLASH3_OK"
  echo "--- Workers AI ---"
  run_test "@cf/meta/llama-3.1-8b-instruct" "workers_ai" "basic" "Reply with exactly: LLAMA_OK" "LLAMA_OK"
  run_test "@cf/meta/llama-4-scout-17b-16e-instruct" "workers_ai" "basic" "Reply with exactly: SCOUT_OK" "SCOUT_OK"
  run_test "@cf/meta/llama-3.3-70b-instruct-fp8-fast" "workers_ai" "basic" "Reply with exactly: LLAMA70_OK" "LLAMA70_OK"
else
  echo "--- Minimal smoke (5 calls, rate-limited) ---"
  run_test "claude-haiku-4-5-20251001" "anthropic" "basic" "Reply with exactly: HAIKU_OK" "HAIKU_OK"
  run_test "gpt-4.1-nano" "openai" "basic" "Reply with exactly: NANO_OK" "NANO_OK"
  run_test "gemini-3-flash-preview" "google" "basic" "Reply with exactly: FLASH3_OK" "FLASH3_OK"
  run_test "@cf/meta/llama-4-scout-17b-16e-instruct" "workers_ai" "basic" "Reply with exactly: SCOUT_OK" "SCOUT_OK"
  run_test "o4-mini" "openai" "reasoning_mini" "1+1=? One character." "2"
fi

echo "=== DONE ==="
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command="SELECT check_name, status, actual_value, details FROM quality_checks
    WHERE check_category='model_smoke_test'
    ORDER BY checked_at DESC LIMIT 25"
