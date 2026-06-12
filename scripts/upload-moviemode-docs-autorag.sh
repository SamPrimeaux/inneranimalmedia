#!/usr/bin/env bash
# Upload MovieMode + VPC platform docs → inneranimalmedia-autorag for RAG indexing.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"
BUCKET="${AUTORAG_DOCS_BUCKET:-inneranimalmedia-autorag}"

upload() {
  local src="$1"
  local key="$2"
  if [[ ! -f "$src" ]]; then
    echo "skip (missing): $src" >&2
    return 0
  fi
  echo "PUT r2://${BUCKET}/${key}"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler r2 object put "${BUCKET}/${key}" \
    --file "$src" \
    --content-type "text/markdown; charset=utf-8" \
    --config "$CONFIG" \
    --remote
}

upload "$REPO_ROOT/docs/MOVIEMODE-INFRA-PLAN.md" "docs/platform/moviemode-infra-plan.md"
upload "$REPO_ROOT/docs/platform/workers-vpc-moviemode.md" "docs/platform/workers-vpc-moviemode.md"
upload "$REPO_ROOT/docs/MOVIEMODE.md" "docs/platform/moviemode-api-reference.md"

echo "Done. Index via docs-vectorize queue or agentsam ingest for AGENTSAM_VECTORIZE_DOCUMENTS lane."
