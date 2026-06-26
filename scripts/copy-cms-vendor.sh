#!/usr/bin/env bash
# Copy React 18 + Babel standalone UMD into dashboard/public/cms/vendor for AgentSam CMS iframe.
set -euo pipefail
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
