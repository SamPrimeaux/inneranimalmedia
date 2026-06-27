#!/usr/bin/env bash
# Upload cms/templates/** and cms/instructions/** → R2 bucket `cms` (CMS_BUCKET).
#
# Keys match cms/instructions/r2-key-conventions.md:
#   templates/manifest.json
#   templates/{slug}/index.html
#   instructions/manifest.json
#   instructions/*.md
#
# Usage:
#   ./scripts/upload-cms-bucket-assets.sh
#   ./scripts/upload-cms-bucket-assets.sh --dry-run
#   ./scripts/upload-cms-bucket-assets.sh --verify
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_CMS_R2_BUCKET:-cms}"
DRY_RUN=0
VERIFY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --verify) VERIFY=1 ;;
  esac
done

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

content_type_for() {
  local file="$1"
  case "${file##*.}" in
    html|htm) echo "text/html; charset=utf-8" ;;
    md) echo "text/markdown; charset=utf-8" ;;
    json) echo "application/json; charset=utf-8" ;;
    css) echo "text/css; charset=utf-8" ;;
    js|mjs) echo "application/javascript; charset=utf-8" ;;
    *) echo "application/octet-stream" ;;
  esac
}

put_file() {
  local key="$1"
  local file="$2"
  local ct
  ct="$(content_type_for "$file")"
  if (( DRY_RUN )); then
    echo "[dry-run] put ${BUCKET}/${key} ← ${file#"$REPO_ROOT"/} (${ct})"
    return 0
  fi
  echo "→ put ${BUCKET}/${key}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "$ct" \
    --config "$CONFIG" \
    --remote
}

upload_tree() {
  local src_root="$1"
  local key_prefix="$2"
  if [[ ! -d "$src_root" ]]; then
    echo "Skip missing directory: $src_root" >&2
    return 0
  fi
  while IFS= read -r -d '' file; do
    local rel="${file#"$src_root"/}"
    [[ -n "$rel" ]] || continue
    put_file "${key_prefix}/${rel}" "$file"
  done < <(find "$src_root" -type f ! -name '.DS_Store' -print0 | sort -z)
}

echo "CMS bucket asset upload (bucket=${BUCKET})"

upload_tree "$REPO_ROOT/cms/templates" "templates"
upload_tree "$REPO_ROOT/cms/instructions" "instructions"

if (( DRY_RUN )); then
  echo "Done (dry-run)."
  exit 0
fi

if (( VERIFY )); then
  echo ""
  echo "→ verify objects in ${BUCKET}"
  for key in \
    templates/manifest.json \
    templates/blank-canvas/index.html \
    templates/starter-page/index.html \
    instructions/manifest.json \
    instructions/RUNTIME_CONTRACT.md \
    instructions/agent-tools.md; do
    if "${WRANGLER[@]}" r2 object get "${BUCKET}/${key}" --config "$CONFIG" --remote --pipe >/dev/null 2>&1; then
      echo "  ✓ ${key}"
    else
      echo "  ✗ missing ${key}" >&2
      exit 1
    fi
  done
fi

echo "Done. Public origin: https://cms.inneranimalmedia.com (templates/, instructions/)"
