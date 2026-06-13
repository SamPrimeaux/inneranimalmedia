#!/usr/bin/env bash
# Smoke POST /api/internal/my-container/exec (loads INTERNAL_API_SECRET from .env.cloudflare).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export SMOKE_CONTAINER_CMD="${1:-echo hello from sandbox-v2}"

exec "$ROOT/scripts/with-cloudflare-env.sh" bash -c '
  curl -s -X POST https://inneranimalmedia.com/api/internal/my-container/exec \
    -H "Content-Type: application/json" \
    -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" \
    -d "{\"command\":\"${SMOKE_CONTAINER_CMD}\"}"
'
