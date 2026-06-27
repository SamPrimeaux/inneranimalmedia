#!/usr/bin/env bash
# Legacy: React 18 + Babel UMD for old cms-editor-core.js iframe path.
# Studio shell now loads dist/cms/cms-editor.js (Vite bundle). Skip when SKIP_CMS_VENDOR_COPY=1.
set -euo pipefail
if [[ "${SKIP_CMS_VENDOR_COPY:-0}" == "1" ]]; then
  echo "→ SKIP_CMS_VENDOR_COPY=1 — skipping legacy CMS Babel vendor copy"
  exit 0
fi
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DASH="$REPO_ROOT/dashboard"
OUT="$DASH/public/cms/vendor"
mkdir -p "$OUT"

if [[ ! -d "$DASH/node_modules/react/umd" ]]; then
  echo "→ Installing CMS iframe vendor deps (react@18, react-dom@18, @babel/standalone)…"
  (cd "$DASH" && npm install --no-save react@18.3.1 react-dom@18.3.1 @babel/standalone@7.26.9)
fi

cp "$DASH/node_modules/react/umd/react.production.min.js" "$OUT/"
cp "$DASH/node_modules/react-dom/umd/react-dom.production.min.js" "$OUT/"
cp "$DASH/node_modules/@babel/standalone/babel.min.js" "$OUT/"
echo "✓ CMS vendor copied to dashboard/public/cms/vendor"
