#!/usr/bin/env bash
# Upload IAM Scroll FX library to R2 motion prefix.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
PREFIX="cms/motion/iam-scroll-fx-v1"
SRC="$REPO_ROOT/static/templates/ui/iam-scroll-fx"

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

put_file() {
  local key="$1"
  local file="$2"
  local ct="${3:-application/octet-stream}"
  echo "→ put ${BUCKET}/${key}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${key}" \
    --file "$file" --content-type "$ct" --config "$CONFIG" --remote
}

content_type_for() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.md)   echo "text/markdown; charset=utf-8" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

echo "Uploading Scroll FX → ${BUCKET}/${PREFIX}/…"

# Live demo at prefix root (relative ./css ./js paths)
put_file "${PREFIX}/index.html" "$SRC/demo/index.html" "text/html; charset=utf-8"
put_file "${PREFIX}/README.md" "$SRC/README.md" "text/markdown; charset=utf-8"

for f in "$SRC"/demo/css/*; do
  base="$(basename "$f")"
  put_file "${PREFIX}/css/${base}" "$f" "$(content_type_for "$base")"
done

for f in "$SRC"/demo/js/*; do
  base="$(basename "$f")"
  put_file "${PREFIX}/js/${base}" "$f" "$(content_type_for "$base")"
done

# Drop-in components (zero showcase deps)
for f in "$SRC"/components/*; do
  base="$(basename "$f")"
  put_file "${PREFIX}/components/${base}" "$f" "$(content_type_for "$base")"
done

echo "Done."
echo "Live: https://assets.inneranimalmedia.com/${PREFIX}/index.html"
echo "CMS:  /dashboard/cms/templates?site=inneranimalmedia (Scroll FX)"
