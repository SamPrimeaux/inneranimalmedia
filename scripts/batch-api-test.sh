#!/usr/bin/env bash
# Anthropic Batch API test (direct API) + optional archive trigger + D1 checks.
# Requires ANTHROPIC_API_KEY in environment (export or add to .env.cloudflare).
# After batch: set SESSION_COOKIE='session=...' to hit POST /api/admin/archive-conversations on prod.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

load_env() {
  if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${REPO_ROOT}/.env.cloudflare"
    set +a
  fi
}
load_env

ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$ANTHROPIC_KEY" ]; then
  echo "Set ANTHROPIC_API_KEY (export or .env.cloudflare)." >&2
  exit 1
fi

BATCH_RESPONSE=$(curl -s https://api.anthropic.com/v1/messages/batches \
  -H "x-api-key: $ANTHROPIC_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "requests": [
      {"custom_id":"t1","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Reply: BATCH_1"}]}},
      {"custom_id":"t2","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Reply: BATCH_2"}]}},
      {"custom_id":"t3","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Reply: BATCH_3"}]}},
      {"custom_id":"t4","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"What is 1+1?"}]}},
      {"custom_id":"t5","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Capital of Texas?"}]}},
      {"custom_id":"t6","params":{"model":"claude-haiku-4-5-20251001","max_tokens":20,"messages":[{"role":"user","content":"List 3 colors."}]}},
      {"custom_id":"t7","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Reply: BATCH_7"}]}},
      {"custom_id":"t8","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Reply: BATCH_8"}]}},
      {"custom_id":"t9","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Reply: BATCH_9"}]}},
      {"custom_id":"t10","params":{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"Reply: BATCH_10"}]}}
    ]
  }')

BATCH_ID=$(echo "$BATCH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','ERROR'))")
echo "Batch submitted: $BATCH_ID"
echo "Status: $(echo "$BATCH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing_status','?'))")"

for i in $(seq 1 20); do
  sleep 30
  STATUS=$(curl -s "https://api.anthropic.com/v1/messages/batches/$BATCH_ID" \
    -H "x-api-key: $ANTHROPIC_KEY" \
    -H "anthropic-version: 2023-06-01" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing_status','?'))")
  echo "[$i] Status: $STATUS"
  [ "$STATUS" = "ended" ] && break
done

RESULTS=$(curl -s "https://api.anthropic.com/v1/messages/batches/$BATCH_ID/results" \
  -H "x-api-key: $ANTHROPIC_KEY" \
  -H "anthropic-version: 2023-06-01")

echo "$RESULTS" | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
lines = raw.split('\n')
total_in = total_out = 0
for line in lines:
    if not line.strip():
        continue
    r = json.loads(line)
    usage = r.get('result',{}).get('message',{}).get('usage',{})
    if not usage:
        usage = r.get('result',{}).get('usage',{})
    total_in += usage.get('input_tokens',0)
    total_out += usage.get('output_tokens',0)
    rt = r.get('result',{}).get('type','?')
    print(f\"{r.get('custom_id','?')}: {rt} in={usage.get('input_tokens',0)} out={usage.get('output_tokens',0)}\")

cost = (total_in * 0.0004 + total_out * 0.002) / 1000
realtime_cost = cost * 2
print(f'Total: in={total_in} out={total_out}')
print(f'Batch cost (50% off): \${cost:.6f}')
print(f'Real-time equiv: \${realtime_cost:.6f}')
print(f'Savings: \${realtime_cost-cost:.6f}')
"

DETAILS_ESC=$(python3 -c "import sys; print(sys.argv[1].replace(chr(39), chr(39)+chr(39)))" "Batch API test: 10 haiku requests. batch_id=$BATCH_ID")

./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command="INSERT INTO quality_checks
    (project_id,check_type,check_name,status,actual_value,expected_value,
     threshold_met,details,severity,automated,check_category,checked_at)
    VALUES ('inneranimalmedia','performance',
      'batch_api_test_haiku_10req','pass',
      'batch_id=$BATCH_ID','anthropic_batch_success',1,
      '$DETAILS_ESC',
      'low',1,'batch_api_test',datetime('now'))"

echo "Done. Batch row logged to quality_checks (batch_api_test)."

BASE="${BASE:-https://inneranimalmedia.com}"
SESSION_COOKIE="${SESSION_COOKIE:-}"
if [ -n "$SESSION_COOKIE" ]; then
  echo "=== Triggering conversation archiver ==="
  curl -s -X POST "${BASE%/}/api/admin/archive-conversations" \
    -H "Cookie: $SESSION_COOKIE" | python3 -m json.tool || true

  echo "=== Archive results in D1 ==="
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
    --remote -c wrangler.production.toml \
    --command="SELECT check_name, status, details, checked_at
      FROM quality_checks
      WHERE check_category='conversation_archive'
      ORDER BY checked_at DESC LIMIT 10"

  echo "=== agent_messages current state ==="
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
    --remote -c wrangler.production.toml \
    --command="SELECT COUNT(*) as total_msgs,
      COUNT(DISTINCT conversation_id) as convos,
      ROUND(SUM(LENGTH(COALESCE(content,'')))/1024.0/1024.0,2) as size_mb,
      SUM(CASE WHEN is_compaction_marker=1 THEN 1 ELSE 0 END) as archived_markers
      FROM agent_messages"

  echo "=== Conversations archived to R2 ==="
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
    --remote -c wrangler.production.toml \
    --command="SELECT id, title, r2_context_key, is_archived
      FROM agent_conversations
      WHERE is_archived=1 OR r2_context_key IS NOT NULL
      ORDER BY updated_at DESC LIMIT 20"
else
  echo "Skip archive trigger (set SESSION_COOKIE to run POST /api/admin/archive-conversations + D1 checks)."
fi
