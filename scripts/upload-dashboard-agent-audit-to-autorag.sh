#!/usr/bin/env bash
# Upload docs/dashboard-agent-audit/*.md to R2 bucket inneranimalmedia-autorag
# under knowledge/agentsam/dashboard-agent-audit/
#
# Usage (repo root):
#   ./scripts/upload-dashboard-agent-audit-to-autorag.sh
#
# Requires Cloudflare API token with R2 write on inneranimalmedia-autorag.
# Prefer: ./scripts/with-cloudflare-env.sh ./scripts/upload-dashboard-agent-audit-to-autorag.sh
# Fallback: export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (see wrangler.production.toml)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/docs/dashboard-agent-audit"
BUCKET="inneranimalmedia-autorag"
PREFIX="knowledge/agentsam/dashboard-agent-audit"
cd "$REPO_ROOT"

if [[ -x "$SCRIPT_DIR/with-cloudflare-env.sh" ]] && command -v zsh >/dev/null 2>&1; then
  WRANGLER=("$SCRIPT_DIR/with-cloudflare-env.sh" npx wrangler)
else
  WRANGLER=(npx wrangler)
fi

count=0
for f in "$SRC_DIR"/*.md; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  key="${PREFIX}/${base}"
  echo "Put ${BUCKET}/${key} ..."
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${key}" \
    --file "$f" \
    --content-type "text/markdown; charset=utf-8" \
    --remote \
    -c wrangler.production.toml
  count=$((count + 1))
done

echo "Done — ${count} markdown files uploaded to ${BUCKET}/${PREFIX}/"
