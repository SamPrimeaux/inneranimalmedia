#!/usr/bin/env bash
# Time the deploy, then record it in D1 (deploy_time_seconds via post-deploy-record.sh).
# Usage: run from repo root. Expects CLOUDFLARE_* from .env.cloudflare (via with-cloudflare-env.sh).
#   ./scripts/deploy-with-record.sh
#
# MANDATORY: Dashboard SPA is built to dashboard/dist/ and synced by deploy-frontend.sh (npm run deploy:full).
# Do not commit legacy standalone dashboard/*.html shells — they are removed; Vite index.html is canonical.
# For agent-initiated deploys, set TRIGGERED_BY=agent and optionally DEPLOYMENT_NOTES before running:
#   TRIGGERED_BY=agent DEPLOYMENT_NOTES='AI Gateway + R2 upload' npm run deploy
# Or: DEPLOY_SECONDS=0 ./scripts/post-deploy-record.sh  (to only record, e.g. after manual deploy)
#
# Flags:
#   --skip-docs     Skip uploading docs/*.md to R2 (faster). Does not update .deploy-docs-baseline.
#   --worker-only   Skip agent.html ?v= bump, dashboard JS/CSS/HTML R2 uploads, and dashboard_versions D1 rows.
#                   Use when deploying worker-only (no frontend/dashboard changes).
# By default, only markdown under docs/ that differs since the last successful deploy is uploaded
# (git: commit in .deploy-docs-baseline vs current working tree). Delete that file to force a full doc sync.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_DOCS=0
WORKER_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-docs) SKIP_DOCS=1 ;;
    --worker-only) WORKER_ONLY=1 ;;
    -h|--help)
      echo "Usage: ./scripts/deploy-with-record.sh [--skip-docs] [--worker-only]"
      echo "  --skip-docs     Skip docs R2 uploads. Baseline is not updated for docs."
      echo "  --worker-only   Worker deploy only: no agent.html cache bust, no dashboard R2/D1."
      echo "  Default: incremental docs via .deploy-docs-baseline (git diff vs working tree)."
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done
cd "$REPO_ROOT"
DOCS_BASELINE="$REPO_ROOT/.deploy-docs-baseline"
CONFIG="$REPO_ROOT/wrangler.production.toml"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi
export TRIGGERED_BY
export DEPLOYMENT_NOTES
export DEPLOY_VERSION

if [[ "$WORKER_ONLY" -eq 1 ]]; then
  echo "Worker-only deploy: skipping dashboard R2 uploads and dashboard_versions D1"
else
  DASH_DIST="dashboard/dist"
  if [[ ! -f "${DASH_DIST}/index.html" ]]; then
    echo "Building dashboard (required before R2 upload)..."
    npm run build:vite-only
    node scripts/bump-cache.js
  fi

  # Upload canonical SPA assets to R2 (inneranimalmedia / static/dashboard/app/)
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/static/dashboard/app/dashboard.js --file "${DASH_DIST}/dashboard.js" --content-type "application/javascript" --config wrangler.production.toml --remote
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/static/dashboard/app/dashboard.css --file "${DASH_DIST}/dashboard.css" --content-type "text/css" --config wrangler.production.toml --remote
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/static/dashboard/app.html --file "${DASH_DIST}/index.html" --content-type "text/html" --config wrangler.production.toml --remote
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/static/dashboard/app/index.html --file "${DASH_DIST}/index.html" --content-type "text/html" --config wrangler.production.toml --remote

  CURRENT_V=$(grep -oE 'dashboard-v:[0-9]+' "${DASH_DIST}/index.html" 2>/dev/null | head -1 | cut -d: -f2 || echo "0")
  [[ -z "$CURRENT_V" ]] && CURRENT_V=$(grep -oE '\?v=[0-9]+' "${DASH_DIST}/index.html" 2>/dev/null | head -1 | grep -oE '[0-9]+' || echo "0")

  # Log agent dashboard R2 uploads to dashboard_versions (D1)
  JS_HASH=$(md5 -q "${DASH_DIST}/dashboard.js" 2>/dev/null || md5sum "${DASH_DIST}/dashboard.js" | awk '{print $1}')
  CSS_HASH=$(md5 -q "${DASH_DIST}/dashboard.css" 2>/dev/null || md5sum "${DASH_DIST}/dashboard.css" | awk '{print $1}')
  HTML_HASH=$(md5 -q "${DASH_DIST}/index.html" 2>/dev/null || md5sum "${DASH_DIST}/index.html" | awk '{print $1}')
  JS_SIZE=$(wc -c < "${DASH_DIST}/dashboard.js" | tr -d ' ')
  CSS_SIZE=$(wc -c < "${DASH_DIST}/dashboard.css" | tr -d ' ')
  HTML_SIZE=$(wc -c < "${DASH_DIST}/index.html" | tr -d ' ')
  DEPLOY_TS=$(date +%s)
  # Exclusive is_active: prior writers (sandbox vite) left multiple agent rows active.
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "UPDATE dashboard_versions SET is_active = 0 WHERE page_name IN ('agent','agent-css','agent-html') AND COALESCE(is_active, 0) = 1" || true
  D1_DASH_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, is_active, environment, git_commit, build_pipeline, created_at, deployed_at) VALUES ('agent-js-v${CURRENT_V}-${DEPLOY_TS}', 'agent', 'v${CURRENT_V}', '${JS_HASH}', ${JS_SIZE}, 'static/dashboard/app/dashboard.js', 'Auto-logged by deploy-with-record.sh', 1, 1, 1, 'production', '$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '')', 'deploy_with_record', unixepoch(), unixepoch()), ('agent-css-v${CURRENT_V}-${DEPLOY_TS}', 'agent-css', 'v${CURRENT_V}', '${CSS_HASH}', ${CSS_SIZE}, 'static/dashboard/app/dashboard.css', 'Auto-logged by deploy-with-record.sh', 1, 1, 1, 'production', '$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '')', 'deploy_with_record', unixepoch(), unixepoch()), ('agent-html-v${CURRENT_V}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/app.html', 'Auto-logged by deploy-with-record.sh', 1, 1, 1, 'production', '$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '')', 'deploy_with_record', unixepoch(), unixepoch())"
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "$D1_DASH_SQL"
  echo "Logged dashboard_versions for dashboard v${CURRENT_V} (js/css/html)"
fi

# Upload source files for AI indexing (Vectorize codebase search)
echo "Uploading source files for AI indexing..."
./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/static/source/src/index.js --file=src/index.js --content-type="application/javascript" --config wrangler.production.toml --remote
find dashboard -type f \( -name "*.tsx" -o -name "*.ts" \) ! -path 'dashboard/dist/*' | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/static/source/${file}" --file="${file}" --content-type="application/javascript" --config wrangler.production.toml --remote
done
find inneranimalmedia-mcp-server/src -type f -name "*.js" | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/static/source/${file}" --file="${file}" --content-type="application/javascript" --config wrangler.production.toml --remote
done
if [[ "$SKIP_DOCS" -eq 1 ]]; then
  echo "Skipping docs R2 upload (--skip-docs)"
elif [[ -d "$REPO_ROOT/.git" ]]; then
  OLD=""
  [[ -f "$DOCS_BASELINE" ]] && OLD=$(tr -d ' \n\r\t' < "$DOCS_BASELINE")
  if [[ -n "$OLD" ]] && git -C "$REPO_ROOT" rev-parse --verify "${OLD}^{commit}" >/dev/null 2>&1; then
    DOCS_CHANGED=0
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      [[ "$file" == *.md ]] || continue
      [[ -f "$REPO_ROOT/$file" ]] || continue
      ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/static/source/${file}" --file="${file}" --content-type="text/markdown" --config wrangler.production.toml --remote
      DOCS_CHANGED=$((DOCS_CHANGED + 1))
    done < <(git -C "$REPO_ROOT" diff --name-only "$OLD" -- docs/ 2>/dev/null || true)
    if [[ "$DOCS_CHANGED" -eq 0 ]]; then
      echo "No docs changed since last deploy; skipping doc uploads"
    else
      echo "Uploaded $DOCS_CHANGED doc(s) (incremental)"
    fi
  else
    if [[ -n "$OLD" ]]; then
      echo "Stale or invalid .deploy-docs-baseline; uploading all docs"
    else
      echo "No .deploy-docs-baseline; uploading all docs (first run or delete file to force full sync)"
    fi
    find docs -type f -name "*.md" 2>/dev/null | while read -r file; do
      ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/static/source/${file}" --file="${file}" --content-type="text/markdown" --config wrangler.production.toml --remote
    done
  fi
else
  echo "Not a git checkout; uploading all docs"
  find docs -type f -name "*.md" 2>/dev/null | while read -r file; do
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/static/source/${file}" --file="${file}" --content-type="text/markdown" --config wrangler.production.toml --remote
  done
fi
node scripts/generate-worker-function-index.mjs --upload --project inneranimalmedia
# Trigger async indexing (fire and forget)
curl -s -X POST https://inneranimalmedia.com/api/admin/reindex-codebase -H "Content-Type: application/json" -d '{"async":true}' > /dev/null 2>&1 || true
echo "Source files uploaded; reindex triggered"

DEPLOY_START=$(date +%s)
echo "Deploying worker..."
set -o pipefail
DEPLOY_LOG=$(mktemp)
DEPLOY_MSG="$(cat "$(dirname "$0")/../dashboard/.sandbox-deploy-version" 2>/dev/null | xargs printf 'v%s' || echo 'v?') | $(git rev-parse --short HEAD 2>/dev/null || echo unknown) | $(git log -1 --pretty=%s 2>/dev/null | cut -c1-60)"
if ! ./scripts/with-cloudflare-env.sh wrangler deploy --config "$CONFIG" --message "$DEPLOY_MSG" 2>&1 | tee "$DEPLOY_LOG"; then
  rm -f "$DEPLOY_LOG"
  set +o pipefail
  exit 1
fi
CLOUDFLARE_VERSION_ID=$(grep 'Current Version ID:' "$DEPLOY_LOG" | tail -1 | awk '{print $NF}')
export CLOUDFLARE_VERSION_ID
rm -f "$DEPLOY_LOG"
set +o pipefail
echo "Captured version ID: $CLOUDFLARE_VERSION_ID"
DEPLOY_END=$(date +%s)
DEPLOY_SECONDS=$((DEPLOY_END - DEPLOY_START))
export DEPLOY_SECONDS
echo "Deploy finished in ${DEPLOY_SECONDS}s. Recording in D1..."
./scripts/post-deploy-record.sh

if [[ "$SKIP_DOCS" -eq 0 ]] && [[ -d "$REPO_ROOT/.git" ]]; then
  git -C "$REPO_ROOT" rev-parse HEAD > "$DOCS_BASELINE"
  echo "Recorded docs baseline: $(tr -d ' \n\r\t' < "$DOCS_BASELINE") (.deploy-docs-baseline)"
fi
