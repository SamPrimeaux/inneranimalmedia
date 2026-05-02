#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/samprimeaux/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard"
cd "$ROOT"

echo "== Patch production dashboard deploy paths to flat dashboard/dist =="

python3 <<'PY'
from pathlib import Path

files = [
  "scripts/deploy-cf-builds-prod.sh",
  "scripts/deploy-cf-builds.sh",
  "scripts/promote-to-prod.sh",
  "scripts/deploy-gate.sh",
  "scripts/deploy-with-record.sh",
  "scripts/promote-agent-dashboard-to-production.sh",
  "scripts/upload-agent-dashboard-r2.sh",
  "scripts/deploy-frontend.sh",
  "scripts/deploy-sandbox.sh",
  "scripts/e2e-overnight.sh",
  "scripts/upload-repo-to-r2-sandbox.sh",
  "scripts/deploy-test-promote.sh",
]

repls = {
  "dashboard/dist": "dashboard/dist",
  "${REPO_ROOT}/dashboard/dist": "${REPO_ROOT}/dashboard/dist",
  "$REPO_ROOT/dashboard/dist": "$REPO_ROOT/dashboard/dist",
  "dashboard/dist": "dashboard/dist",
  "${REPO_ROOT}/dashboard/dist": "${REPO_ROOT}/dashboard/dist",
  "$REPO_ROOT/dashboard/dist": "$REPO_ROOT/dashboard/dist",
  "npm ci --include=dev && npm run build:vite-only && node scripts/bump-cache.js": "npm ci --include=dev && npm run build:vite-only && node scripts/bump-cache.js",
  "npm run build:vite-only": "npm run build:vite-only",
  "(cd \"${REPO_ROOT}/agent-dashboard\" && npm run build:vite-only)": "(cd \"${REPO_ROOT}\" && npm run build:vite-only)",
  "(cd agent-dashboard && npm run build)": "npm run build:vite-only",
  "cd agent-dashboard/agent-dashboard && npm run build && cd ../..": "npm run build:vite-only",
  "npm run build --workspace=agent-dashboard": "npm --prefix dashboard run build",
}

changed = []
for f in files:
    p = Path(f)
    if not p.exists():
        continue
    s = p.read_text()
    orig = s
    for a, b in repls.items():
        s = s.replace(a, b)
    if s != orig:
        p.write_text(s)
        changed.append(f)

print("Changed:")
for f in changed:
    print(" -", f)
PY

echo ""
echo "== Remaining high-risk stale references =="
grep -RIn \
"dashboard/dist\|dashboard/dist\|cd agent-dashboard && npm run build:vite-only\|cd agent-dashboard && npm ci\|npm run build --workspace=agent-dashboard" \
scripts package.json wrangler*.toml wrangler*.jsonc worker.js src 2>/dev/null || true

echo ""
echo "== Build flat dashboard =="
npm run build:vite-only

echo ""
echo "== Verify built marker =="
rg -n "agent-app-sse-v1|canonical mounted|data-chat-assistant-contract" dashboard/dist/agent-dashboard.js

echo ""
echo "== Deploy gate check if available =="
if [ -x scripts/deploy-gate.sh ]; then
  bash scripts/deploy-gate.sh || true
fi

echo ""
echo "== Git status =="
git status --short
