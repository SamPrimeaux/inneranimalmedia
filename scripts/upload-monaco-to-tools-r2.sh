#!/usr/bin/env bash
# Upload monaco-editor/min/vs to TOOLS R2 at code/monaco/vs/ (for pages served from tools.inneranimalmedia.com).
# Prereq: cd agent-dashboard && npm install
# Usage: ./scripts/upload-monaco-to-tools-r2.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VS_DIR="${REPO_ROOT}/agent-dashboard/node_modules/monaco-editor/min/vs"
BUCKET="tools"
R2_PREFIX="code/monaco/vs"

if [[ ! -d "$VS_DIR" ]]; then
  echo "Missing ${VS_DIR}. Run: cd agent-dashboard && npm install" >&2
  exit 1
fi

if [[ -f "${REPO_ROOT}/scripts/with-cloudflare-env.sh" ]] && [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  # shellcheck source=/dev/null
  source <(grep -v '^#' "${REPO_ROOT}/.env.cloudflare" 2>/dev/null | grep -v '^\s*$' | sed 's/^/export /' || true)
fi

ctype_for() {
  case "${1##*.}" in
    js)   echo "application/javascript" ;;
    css)  echo "text/css" ;;
    map)  echo "application/json" ;;
    json) echo "application/json" ;;
    woff) echo "font/woff" ;;
    woff2) echo "font/woff2" ;;
    ttf)  echo "font/ttf" ;;
    svg)  echo "image/svg+xml" ;;
    *)    echo "application/octet-stream" ;;
  esac
}

echo "Uploading ${VS_DIR} -> ${BUCKET}/${R2_PREFIX}/ ..."
n=0
while IFS= read -r -d '' f; do
  rel="${f#${VS_DIR}/}"
  key="${R2_PREFIX}/${rel}"
  ct="$(ctype_for "$f")"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$f" \
    --content-type="$ct" \
    --remote \
    -c wrangler.production.toml
  n=$((n + 1))
  if (( n % 50 == 0 )); then echo "  ... ${n} files"; fi
done < <(find "$VS_DIR" -type f -print0)

echo "Done. ${n} objects. Check: https://tools.inneranimalmedia.com/code/monaco/vs/loader.js"
