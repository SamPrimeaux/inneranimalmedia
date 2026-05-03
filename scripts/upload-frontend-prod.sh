#!/usr/bin/env bash
# Upload dashboard/dist to production R2 (inneranimalmedia bucket). Run after build.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DIST="dashboard/dist"
BUCKET="inneranimalmedia"
PREFIX="dashboard/app"
TOML="wrangler.production.toml"

echo "Building frontend..."
(cd dashboard && npm run build)

echo "Running pre-deploy secret scan..."
SCAN_HITS=$( (grep -rE \
  --exclude='*.map' \
  'sk_live_[a-zA-Z0-9]{24,}|cfut_[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9\-]{80,}|iam-bridge-[a-zA-Z0-9]{20,}|re_[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}|sk-proj-[a-zA-Z0-9\-_]{40,}' \
  "$DIST" 2>/dev/null || true) | wc -l | tr -d ' ')

if [ "$SCAN_HITS" -gt "0" ]; then
  echo "SECURITY ABORT: $SCAN_HITS potential secret(s) detected in bundle."
  echo "Run: grep -rE 'sk_live_|cfut_|sk-ant-|iam-bridge-' $DIST"
  echo "Deploy aborted. Fix exposures before uploading."
  exit 1
fi
echo "Bundle scan clean. Proceeding with upload."

echo "Syncing dist to R2 $BUCKET/$PREFIX ..."
find "$DIST" -type f | while read -r file; do
  key="$PREFIX/${file#$DIST/}"
  case "$file" in
    *.js)   ct="application/javascript" ;;
    *.css)  ct="text/css" ;;
    *.html) ct="text/html" ;;
    *.map)  ct="application/json" ;;
    *.svg)  ct="image/svg+xml" ;;
    *)      ct="application/octet-stream" ;;
  esac
  echo "  PUT $key"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "$BUCKET/$key" \
    --file "$file" --content-type "$ct" -c "$TOML" --remote
done

echo "Done."

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
GIT_MSG="$(git log -1 --pretty=%s 2>/dev/null || echo 'frontend deploy')"
GIT_MSG_ESC="$(printf '%s' "$GIT_MSG" | tr '\n' ' ' | sed "s/'/''/g")"
DEPLOY_ID="fe_$(date -u +%Y%m%d%H%M%S)_${GIT_SHA}"
FILE_COUNT="$(find "$DIST" -type f ! -name '.DS_Store' | wc -l | tr -d ' ')"

echo "Writing deploy record to D1..."
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c "$TOML" \
  --command "
      INSERT OR IGNORE INTO deployments
        (id, timestamp, version, git_hash, changed_files, description,
         status, deployed_by, environment, deploy_duration_ms, deploy_time_seconds,
         worker_name, triggered_by, notes, created_at)
      VALUES (
        '${DEPLOY_ID}', datetime('now'),
        '${GIT_SHA}', '${GIT_SHA}', NULL,
        '${GIT_MSG_ESC}',
        'success', 'sam_primeaux', 'production', NULL, NULL,
        'inneranimalmedia', 'frontend_upload', NULL, datetime('now')
      );
      UPDATE agentsam_memory SET
        value = json_object(
          'git_hash','${GIT_SHA}',
          'deployed_at',datetime('now'),
          'worker','inneranimalmedia',
          'files',${FILE_COUNT}
        ),
        decay_score = 1.0, confidence = 1.0,
        updated_at = unixepoch()
      WHERE key = 'last_deploy_inneranimalmedia'
        AND user_id = 'sam_primeaux';
      UPDATE agentsam_plan_tasks
        SET status='done', completed_at=unixepoch()
        WHERE plan_id='plan_20260503_iam_platform_sprint'
          AND order_index=1 AND status != 'done';
    " || echo "WARN: D1 record write failed — deploy still succeeded"

echo "Deploy ID: ${DEPLOY_ID} | Files: ${FILE_COUNT} | Git: ${GIT_SHA}"
