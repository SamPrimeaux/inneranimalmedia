#!/usr/bin/env bash
# Upload Spline CMS scenes: source .spline archives + runtime assets + embed pages.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TOML="wrangler.production.toml"
BUCKET="inneranimalmedia"
VBUMP="${VBUMP:-20260701a}"

upload_html() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    echo "✗ Missing file: $file" >&2
    exit 1
  fi
  echo "→ Uploading $file → $BUCKET/$key"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="text/html; charset=utf-8" \
    --remote \
    -c "$TOML"
}

upload_text() {
  local key="$1"
  local file="$2"
  local ctype="$3"
  if [[ ! -f "$file" ]]; then
    echo "✗ Missing file: $file" >&2
    exit 1
  fi
  echo "→ Uploading $file → $BUCKET/$key"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="$ctype" \
    --remote \
    -c "$TOML"
}

upload_binary() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    echo "✗ Missing file: $file" >&2
    exit 1
  fi
  echo "→ Uploading $file → $BUCKET/$key"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="application/octet-stream" \
    --remote \
    -c "$TOML"
}

# Source archives (editor project files — not runtime)
upload_binary "scenes/_source/boxes_hover.spline" "static/assets/scenes/_source/boxes_hover.spline"
upload_binary "scenes/_source/3_d_diagram.spline" "static/assets/scenes/_source/3_d_diagram.spline"
upload_text "scenes/manifest.json" "static/assets/scenes/manifest.json" "application/json; charset=utf-8"

# Shared runtime
upload_text "scenes/shared/spline-runtime.js" "static/assets/scenes/shared/spline-runtime.js" "text/javascript; charset=utf-8"
upload_text "scenes/shared/scene-shell.css" "static/assets/scenes/shared/scene-shell.css" "text/css; charset=utf-8"

# boxes-hover bundle
upload_text "scenes/boxes-hover/scene.css" "static/assets/scenes/boxes-hover/scene.css" "text/css; charset=utf-8"
upload_text "scenes/boxes-hover/spline.js" "static/assets/scenes/boxes-hover/spline.js" "text/javascript; charset=utf-8"
upload_html "pages/marketing/boxes-hover/index.html" "static/pages/marketing/boxes-hover/index.html"

# 3d-diagram bundle
upload_text "scenes/3d-diagram/scene.css" "static/assets/scenes/3d-diagram/scene.css" "text/css; charset=utf-8"
upload_text "scenes/3d-diagram/spline.js" "static/assets/scenes/3d-diagram/spline.js" "text/javascript; charset=utf-8"
upload_html "pages/marketing/3d-diagram/index.html" "static/pages/marketing/3d-diagram/index.html"

echo "✓ Spline scenes uploaded (vbump ${VBUMP})"
echo "  Preview embeds (after route wiring): /marketing/boxes-hover, /marketing/3d-diagram"
echo "  Next: apply migrations/745_cms_spline_scenes_boxes_diagram.sql, publish in Spline, set SCENE_URL"
