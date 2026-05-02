#!/usr/bin/env bash
# CF Builds PROD — Cloudflare build "Deploy command" should be:
#   bash scripts/deploy-cf-builds-prod.sh
#
# Trigger: push to branch `production` (configure in CF Workers Builds).
# Flow: wrangler deploy -c wrangler.jsonc → D1 health/deploy rows → Vite build in agent-dashboard/
#       → sync dist/* to R2 bucket inneranimalmedia with keys dashboard/app/<basename>
#       → upload dist/index.html as dashboard/app/agent.html → post-upload prune under dashboard/app/assets/
#       → deploy manifest JSON + prune old manifests (keep last 10).
# R2: BUCKET=inneranimalmedia, prefix dashboard/app (DASHBOARD binding points at this bucket).
#
# Do not confuse with: ./scripts/deploy-sandbox.sh or promote-to-prod.sh (different pipelines).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DIST_DIR="dashboard/dist"
BUCKET="inneranimalmedia"
R2_PREFIX="dashboard/app"

echo "=== CF Builds PROD: worker deploy ==="
npx wrangler deploy -c wrangler.jsonc

if [ -n "${INTERNAL_API_SECRET:-}" ]; then
  echo "=== CF Builds PROD: deploy-complete email notify ==="
  curl -sS -X POST "https://inneranimalmedia.com/api/notify/deploy-complete" \
    -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" \
    -H "Content-Type: application/json" \
    -d '{}' || true
else
  echo "=== CF Builds PROD: skip notify (INTERNAL_API_SECRET unset) ==="
fi

echo "=== CF Builds PROD: record health snapshot ==="
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "unknown")
npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.jsonc \
  --command="INSERT OR REPLACE INTO iam_system_health (id, component, status, last_checked_at, last_healthy_at, error_message, metadata_json, check_source) VALUES ('health_worker_prod', 'worker:production', 'healthy', datetime('now'), datetime('now'), NULL, '{\"entry\":\"src/index.js\",\"commit\":\"${COMMIT_SHA}\",\"message\":\"${COMMIT_MSG}\"}', 'cf_builds');
INSERT INTO iam_deploy_log (repo, branch, commit_sha, commit_message, entry_point, config_file, environment, status) VALUES ('inneranimalmedia-agentsam-dashboard', 'production', '${COMMIT_SHA}', '${COMMIT_MSG}', 'src/index.js', 'wrangler.jsonc', 'production', 'success');" 2>/dev/null || true


echo "=== CF Builds PROD: record deploy to D1 ==="
DEPLOY_TS=$(date -u +"%Y-%m-%d %H:%M:%S")
npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.jsonc \
  --command="INSERT INTO deployments (id, worker_name, environment, status, timestamp, notes) VALUES ('deploy-'||hex(randomblob(8)), 'inneranimalmedia', 'production', 'success', '${DEPLOY_TS}', 'CF Builds auto-deploy')" 2>/dev/null || true

echo "=== CF Builds PROD: Vite build ==="
npm ci --include=dev && npm run build:vite-only && node scripts/bump-cache.js

echo "=== CF Builds PROD: R2 asset sync ==="
MAX_JOBS=8
job_count=0
get_content_type() {
  case "${1##*.}" in
    js)   echo "application/javascript" ;;
    css)  echo "text/css" ;;
    html) echo "text/html" ;;
    json) echo "application/json" ;;
    png)  echo "image/png" ;;
    svg)  echo "image/svg+xml" ;;
    woff2)echo "font/woff2" ;;
    *)    echo "application/octet-stream" ;;
  esac
}
if [ -d "$DIST_DIR" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    key="${R2_PREFIX}/$(basename "$file")"
    CT=$(get_content_type "$file")
    npx wrangler r2 object put "${BUCKET}/${key}" \
      --file "$file" \
      --content-type "$CT" \
      --remote \
      -c wrangler.jsonc &
    job_count=$((job_count + 1))
    if [ "$job_count" -ge "$MAX_JOBS" ]; then wait; job_count=0; fi
  done < <(find "$DIST_DIR" -type f ! -name '._*' ! -name '.DS_Store')
  wait
fi

if [ -f "$DIST_DIR/index.html" ]; then
  npx wrangler r2 object put "${BUCKET}/dashboard/app/agent.html" \
    --file "$DIST_DIR/index.html" \
    --content-type "text/html" \
    --remote \
    -c wrangler.jsonc
  echo "  agent.html uploaded to prod R2 (dashboard/app/agent.html)."

  _SAFE_TS=$(date -u +%Y%m%d%H%M%S)
  _NEW_KEYS="/tmp/iam_new_${_SAFE_TS}.txt"
  _OLD_KEYS="/tmp/iam_old_${_SAFE_TS}.txt"
  _PRUNE_LIST="/tmp/iam_prune_${_SAFE_TS}.txt"

  echo "=== Pruning stale R2 assets ==="

  find "${DIST_DIR}/assets" -type f -name "*" 2>/dev/null \
    | while IFS= read -r f; do echo "dashboard/app/assets/$(basename "$f")"; done \
    | sort > "$_NEW_KEYS"

  npx wrangler r2 object list "${BUCKET}" \
    --prefix "dashboard/app/assets/" \
    --remote -c wrangler.jsonc 2>/dev/null \
    | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    objects = data if isinstance(data, list) else data.get('objects', data.get('result', []))
    for o in objects:
        k = o.get('key','') if isinstance(o, dict) else ''
        if k: print(k)
except:
    pass
" | sort > "$_OLD_KEYS"

  comm -23 "$_OLD_KEYS" "$_NEW_KEYS" > "$_PRUNE_LIST"

  _PRUNE_COUNT=$(wc -l < "$_PRUNE_LIST" 2>/dev/null | tr -d ' ')
  [ -z "${_PRUNE_COUNT}" ] && _PRUNE_COUNT=0
  echo "  Stale assets to delete: ${_PRUNE_COUNT}"

  if [ "${_PRUNE_COUNT}" -gt 0 ]; then
    while IFS= read -r _stale; do
      [ -z "${_stale}" ] && continue
      npx wrangler r2 object delete "${BUCKET}/${_stale}" \
        --remote -c wrangler.jsonc 2>/dev/null \
        && echo "  Deleted: ${_stale}" \
        || echo "  WARN: delete failed (non-fatal): ${_stale}"
    done < "$_PRUNE_LIST"
  fi

  rm -f "$_NEW_KEYS" "$_OLD_KEYS" "$_PRUNE_LIST"
  echo "=== Prune complete (${_PRUNE_COUNT} stale files removed) ==="

  _MANIFEST_KEY="dashboard/deploys/manifest-${_SAFE_TS}.json"
  _MANIFEST_FILE="/tmp/iam_manifest_${_SAFE_TS}.json"

  MANIFEST_DIST="$DIST_DIR" MANIFEST_TS="$_SAFE_TS" python3 -c "
import json, os
dist = os.environ['MANIFEST_DIST']
ts = os.environ['MANIFEST_TS']
keys = []
for root, dirs, files in os.walk(dist):
    for f in files:
        keys.append('dashboard/app/' + os.path.basename(os.path.join(root, f)))
print(json.dumps({'deploy_ts': ts, 'key_count': len(keys), 'keys': sorted(keys)}, indent=2))
" > "$_MANIFEST_FILE" 2>/dev/null || echo '{"deploy_ts":"'"${_SAFE_TS}"'","keys":[]}' > "$_MANIFEST_FILE"

  npx wrangler r2 object put "${BUCKET}/${_MANIFEST_KEY}" \
    --file "$_MANIFEST_FILE" \
    --content-type "application/json" \
    --remote -c wrangler.jsonc 2>/dev/null \
    && echo "Manifest saved: ${_MANIFEST_KEY}" \
    || echo "WARN: manifest write failed (non-fatal)"

  rm -f "$_MANIFEST_FILE"

  echo "=== Pruning old manifests (keep last 10) ==="
  npx wrangler r2 object list "${BUCKET}" \
    --prefix "dashboard/deploys/manifest-" \
    --remote -c wrangler.jsonc 2>/dev/null \
    | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    objects = data if isinstance(data, list) else data.get('objects', data.get('result', []))
    keys = sorted([o.get('key','') for o in objects if isinstance(o,dict) and o.get('key','')])
    for k in keys[:-10]:
        print(k)
except:
    pass
" | while IFS= read -r _old_manifest; do
      [ -z "${_old_manifest}" ] && continue
      npx wrangler r2 object delete "${BUCKET}/${_old_manifest}" \
        --remote -c wrangler.jsonc 2>/dev/null \
        && echo "  Deleted old manifest: ${_old_manifest}" \
        || true
    done
  echo "=== Manifest prune complete ==="
fi

echo "=== CF Builds PROD Deploy Complete ==="
