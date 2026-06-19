#!/usr/bin/env bash
# Smoke ExecOS dispatcher → terminal /run chain (requires EXECOS_KEY in .env.cloudflare).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

exec "$ROOT/scripts/with-cloudflare-env.sh" bash -c '
set -euo pipefail
: "${EXECOS_KEY:?Set EXECOS_KEY in .env.cloudflare}"

echo "== execos health =="
health="$(curl -sS https://execos.inneranimalmedia.com/health)"
echo "$health" | jq -e ".status == \"ok\" and .key_set == true" >/dev/null

echo "== execos → gcp /run =="
run="$(curl -sS -X POST https://execos.inneranimalmedia.com/run \
  -H "Content-Type: application/json" \
  -H "X-ExecOS-Key: ${EXECOS_KEY}" \
  -d "{\"command\":\"hostname && pwd\",\"target\":\"gcp\"}")"
echo "$run" | jq .

echo "== execos demo models (gate 1937) =="
demo="$(curl -sS https://execos.inneranimalmedia.com/api/demo/models \
  -H "X-Demo-Access-Key: 1937")"
echo "$demo" | jq "{active_model_id, workers_ai: (.workers_ai | length)}"

echo "OK smoke-execos-chain"
'
