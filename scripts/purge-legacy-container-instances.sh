#!/usr/bin/env bash
# Destroy legacy MY_CONTAINER DO names (meaux-pool, engineer, …) — keeps inneranimalmedia only.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
"${REPO_ROOT}/scripts/with-cloudflare-env.sh" bash -c '
curl -sS -m 120 -X POST "https://inneranimalmedia.com/api/internal/my-container/purge-legacy" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" \
  -d "{}"
echo ""
'
