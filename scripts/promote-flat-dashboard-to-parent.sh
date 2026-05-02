#!/usr/bin/env bash
set -euo pipefail

CHILD="/Users/samprimeaux/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard"
PARENT="/Users/samprimeaux/Downloads/inneranimalmedia"
SRC_DASH="$CHILD/dashboard"
DEST_DASH="$PARENT/dashboard"

echo "== Patch stale deploy-with-record HTML path =="
cd "$CHILD"

if [ -f scripts/deploy-with-record.sh ]; then
  python3 <<'PY'
from pathlib import Path
p = Path("scripts/deploy-with-record.sh")
s = p.read_text()
s = s.replace(
  '--file dashboard/dist/index.html --content-type "text/html"',
  '--file "${DASH_DIST}/index.html" --content-type "text/html"'
)
s = s.replace(
  '--file=dashboard/dist/index.html --content-type=text/html',
  '--file="${DASH_DIST}/index.html" --content-type=text/html'
)
p.write_text(s)
PY
fi

echo "== Build child flat dashboard first =="
npm run build:vite-only

echo "== Verify marker in child dashboard/dist =="
rg -n "agent-app-sse-v1|canonical mounted|data-chat-assistant-contract" "$SRC_DASH/dist/agent-dashboard.js"

echo "== Sync flat dashboard source into parent workspace =="
mkdir -p "$DEST_DASH"

rsync -a --delete \
  --exclude node_modules \
  --exclude .vite \
  --exclude .turbo \
  "$SRC_DASH"/ "$DEST_DASH"/

echo "== Install/build parent dashboard =="
cd "$DEST_DASH"
npm install --include=dev
npm run build

echo "== Verify marker in parent dashboard/dist =="
rg -n "agent-app-sse-v1|canonical mounted|data-chat-assistant-contract" "$DEST_DASH/dist/agent-dashboard.js"

echo "== Done. You are now ready to work from parent workspace =="
cd "$PARENT"
pwd
ls -la dashboard | sed -n '1,80p'
