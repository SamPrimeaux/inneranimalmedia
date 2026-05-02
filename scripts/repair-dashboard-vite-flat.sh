#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/samprimeaux/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard"
OLD_APP="$ROOT/agent-dashboard/agent-dashboard"
NEW_APP="$ROOT/dashboard"

echo "== IAM dashboard flatten + Vite repair =="
echo "Root:    $ROOT"
echo "Old app: $OLD_APP"
echo "New app: $NEW_APP"

cd "$ROOT"

if [ ! -d "$OLD_APP" ]; then
  echo "ERROR: old Vite app not found at $OLD_APP"
  exit 1
fi

echo ""
echo "== Checkpoint current git state =="
git status --short || true

echo ""
echo "== Create flat dashboard directory =="
mkdir -p "$NEW_APP"

echo ""
echo "== Copy nested Vite app into flat dashboard/ =="
rsync -a \
  --exclude node_modules \
  --exclude dist \
  --exclude .vite \
  --exclude .turbo \
  "$OLD_APP"/ "$NEW_APP"/

echo ""
echo "== Ensure dashboard package has Vite dependencies =="
cd "$NEW_APP"

if [ ! -f package.json ]; then
  echo "ERROR: package.json missing in $NEW_APP"
  exit 1
fi

npm pkg set scripts.build="vite build"
npm pkg set scripts.dev="vite --host 0.0.0.0"
npm pkg set scripts.preview="vite preview --host 0.0.0.0"

npm pkg set devDependencies.vite="^6.3.5"
npm pkg set devDependencies.@vitejs/plugin-react="^4.4.1"
npm pkg set devDependencies.typescript="^5.8.3"

echo ""
echo "== Install flat dashboard deps =="
npm install

echo ""
echo "== Build flat dashboard =="
npm run build

echo ""
echo "== Update root package scripts to use flat dashboard =="
cd "$ROOT"

node <<'NODE'
const fs = require("fs");
const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.scripts = pkg.scripts || {};
pkg.scripts["build:vite-only"] = "npm --prefix dashboard run build";
pkg.scripts["dev:dashboard"] = "npm --prefix dashboard run dev";
pkg.scripts["preview:dashboard"] = "npm --prefix dashboard run preview";
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
NODE

echo ""
echo "== Build through root script =="
npm run build:vite-only

echo ""
echo "== Verify canonical ChatAssistant marker in flat build =="
if rg -n "agent-app-sse-v1|canonical mounted|data-chat-assistant-contract" "$NEW_APP/dist" >/tmp/iam-dashboard-marker.txt 2>/dev/null; then
  cat /tmp/iam-dashboard-marker.txt
else
  echo "WARNING: canonical marker not found in $NEW_APP/dist"
fi

echo ""
echo "== Optional: show build outputs =="
find "$NEW_APP/dist" -maxdepth 3 -type f | sort | sed -n '1,80p'

echo ""
echo "== Done. Review git diff next. =="
cd "$ROOT"
git status --short
