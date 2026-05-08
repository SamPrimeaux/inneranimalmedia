#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${1:-settings-api-vault-$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)}"
REPORT_DIR="iam-test-reports/deploy-checks/$RUN_ID"
mkdir -p "$REPORT_DIR"

echo "RUN_ID=$RUN_ID" | tee "$REPORT_DIR/run.env"
echo "GIT_SHA=$(git rev-parse HEAD)" | tee -a "$REPORT_DIR/run.env"
echo "GIT_BRANCH=$(git branch --show-current)" | tee -a "$REPORT_DIR/run.env"
echo "UTC_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$REPORT_DIR/run.env"

echo ""
echo "== Git state =="
git status --short | tee "$REPORT_DIR/git-status.txt"
git log --oneline -8 | tee "$REPORT_DIR/git-log.txt"

if [ -s "$REPORT_DIR/git-status.txt" ]; then
  echo ""
  echo "ERROR: working tree is not clean. Commit or discard changes before deployment check."
  exit 1
fi

echo ""
echo "== Verify settings files exist =="
ls -lah \
  src/api/settings.js \
  src/api/settings-api-keys.js \
  src/api/settings-workspace.js \
  dashboard/components/settings/sections/ApiKeysSection.tsx \
  dashboard/components/settings/SettingsPanel.tsx \
  dashboard/components/settings/hooks/useSettingsSections.tsx \
  dashboard/components/settings/settingsConstants.ts \
  | tee "$REPORT_DIR/files.txt"

echo ""
echo "== Safety grep checks =="
{
  echo "--- settings.js workspace inline route check ---"
  grep -RIn "workspace/members\|workspace/modules\|workspace/invites\|resolveStrictWorkspaceIdFromSession\|callerWorkspaceRole" src/api/settings.js || true

  echo "--- workspace_id body/query override check ---"
  grep -RIn "searchParams.get('workspace_id'\|body.*workspace_id\|workspace_id.*body\|workspace_id.*query" \
    src/api/settings-workspace.js src/api/settings-api-keys.js src/api/settings.js || true

  echo "--- vault_secret_id frontend/settings.js exposure check ---"
  grep -RIn "vault_secret_id" \
    dashboard src/components src/api/settings.js || true
} | tee "$REPORT_DIR/safety-grep.txt"

if grep -RIn "searchParams.get('workspace_id'\|body.*workspace_id\|workspace_id.*body\|workspace_id.*query" \
  src/api/settings-workspace.js src/api/settings-api-keys.js src/api/settings.js > "$REPORT_DIR/workspace-override-fail.txt"; then
  echo "ERROR: workspace_id body/query override pattern found."
  cat "$REPORT_DIR/workspace-override-fail.txt"
  exit 1
fi

if grep -RIn "vault_secret_id" dashboard src/components src/api/settings.js > "$REPORT_DIR/vault-exposure-fail.txt"; then
  echo "ERROR: vault_secret_id exposure found in frontend/settings dispatcher."
  cat "$REPORT_DIR/vault-exposure-fail.txt"
  exit 1
fi

echo ""
echo "== Build =="
npm run build 2>&1 | tee "$REPORT_DIR/npm-build.txt"

echo ""
echo "== Public route checks =="
{
  echo "--- /dashboard/settings ---"
  curl -I -sS https://inneranimalmedia.com/dashboard/settings

  echo ""
  echo "--- /dashboard/settings/api-keys ---"
  curl -I -sS https://inneranimalmedia.com/dashboard/settings/api-keys

  echo ""
  echo "--- /dashboard/settings/security ---"
  curl -I -sS https://inneranimalmedia.com/dashboard/settings/security
} | tee "$REPORT_DIR/public-curl-headers.txt"

echo ""
echo "== Local dashboard bundle references =="
{
  find dashboard/dist -maxdepth 3 -type f 2>/dev/null | sort | sed -n '1,80p'
  echo ""
  grep -RIn "ApiKeysSection\|API Keys\|api-keys" dashboard/dist dashboard/components 2>/dev/null || true
} | tee "$REPORT_DIR/dashboard-bundle-check.txt"

echo ""
echo "== Available npm deploy scripts =="
node - <<'NODE' | tee "$REPORT_DIR/npm-scripts.txt"
const p = require('./package.json');
for (const [k,v] of Object.entries(p.scripts || {})) {
  if (/deploy|publish|upload|r2|worker|wrangler|build/i.test(k + ' ' + v)) {
    console.log(`${k}: ${v}`);
  }
}
NODE

echo ""
echo "DONE: $RUN_ID"
echo "Report: $REPORT_DIR"
