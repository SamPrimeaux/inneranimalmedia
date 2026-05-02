#!/usr/bin/env bash
# Time the deploy, then record it in D1 (deploy_time_seconds via post-deploy-record.sh).
# Usage: run from repo root. Expects CLOUDFLARE_* from .env.cloudflare (via with-cloudflare-env.sh).
#   ./scripts/deploy-with-record.sh
#
# MANDATORY: If you changed any file under dashboard/ (e.g. cloud.html, agent.html), upload it to R2
# BEFORE running this script, or production will serve stale pages. See .cursor/rules/dashboard-r2-before-deploy.mdc.
# Example (always use --remote so upload goes to production; without it, uploads go to local only):
#   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/cloud.html --file=dashboard/cloud.html --content-type=text/html --remote -c wrangler.production.toml
#
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
[[ -f "$HOME/IAM_SECRETS.env" ]] && set -a && source "$HOME/IAM_SECRETS.env" && set +a
export TRIGGERED_BY
export DEPLOYMENT_NOTES
export DEPLOY_VERSION

if [[ "$WORKER_ONLY" -eq 1 ]]; then
  echo "Worker-only deploy: skipping agent.html cache bust, dashboard R2 uploads, and dashboard_versions D1"
else
  # Auto-increment ?v= in agent.html before R2 upload
  CURRENT_V=$(grep -o '?v=[0-9]*' dashboard/agent.html | head -1 | grep -o '[0-9]*')
  NEXT_V=$((CURRENT_V + 1))
  sed -i '' "s/?v=${CURRENT_V}/?v=${NEXT_V}/g" dashboard/agent.html
  echo "Cache bust: v${CURRENT_V} -> v${NEXT_V}"

  # Upload agent-dashboard assets to R2 (agent-sam)
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.js --file agent-dashboard/dist/agent-dashboard.js --content-type "application/javascript" --config wrangler.production.toml --remote
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.css --file agent-dashboard/dist/agent-dashboard.css --content-type "text/css" --config wrangler.production.toml --remote
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file dashboard/agent.html --content-type "text/html" --config wrangler.production.toml --remote

  # Log agent dashboard R2 uploads to dashboard_versions (D1)
  JS_HASH=$(md5 -q agent-dashboard/dist/agent-dashboard.js 2>/dev/null || md5sum agent-dashboard/dist/agent-dashboard.js | awk '{print $1}')
  CSS_HASH=$(md5 -q agent-dashboard/dist/agent-dashboard.css 2>/dev/null || md5sum agent-dashboard/dist/agent-dashboard.css | awk '{print $1}')
  HTML_HASH=$(md5 -q dashboard/agent.html 2>/dev/null || md5sum dashboard/agent.html | awk '{print $1}')
  JS_SIZE=$(wc -c < agent-dashboard/dist/agent-dashboard.js | tr -d ' ')
  CSS_SIZE=$(wc -c < agent-dashboard/dist/agent-dashboard.css | tr -d ' ')
  HTML_SIZE=$(wc -c < dashboard/agent.html | tr -d ' ')
  DEPLOY_TS=$(date +%s)
  D1_DASH_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ('agent-js-v${NEXT_V}-${DEPLOY_TS}', 'agent', 'v${NEXT_V}', '${JS_HASH}', ${JS_SIZE}, 'static/dashboard/agent/agent-dashboard.js', 'Auto-logged by deploy-with-record.sh', 1, 1, unixepoch()), ('agent-css-v${NEXT_V}-${DEPLOY_TS}', 'agent-css', 'v${NEXT_V}', '${CSS_HASH}', ${CSS_SIZE}, 'static/dashboard/agent/agent-dashboard.css', 'Auto-logged by deploy-with-record.sh', 1, 1, unixepoch()), ('agent-html-v${NEXT_V}-${DEPLOY_TS}', 'agent-html', 'v${NEXT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Auto-logged by deploy-with-record.sh', 1, 1, unixepoch())"
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "$D1_DASH_SQL"
  echo "Logged dashboard_versions for agent v${NEXT_V} (js/css/html)"
fi

# Upload source files for AI indexing (Vectorize codebase search)
echo "Uploading source files for AI indexing..."
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/source/worker.js --file=worker.js --content-type="application/javascript" --config wrangler.production.toml --remote
find agent-dashboard/src -type f \( -name "*.jsx" -o -name "*.js" \) | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="application/javascript" --config wrangler.production.toml --remote
done
find inneranimalmedia-mcp-server/src -type f -name "*.js" | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="application/javascript" --config wrangler.production.toml --remote
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
      ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="text/markdown" --config wrangler.production.toml --remote
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
      ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="text/markdown" --config wrangler.production.toml --remote
    done
  fi
else
  echo "Not a git checkout; uploading all docs"
  find docs -type f -name "*.md" 2>/dev/null | while read -r file; do
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="text/markdown" --config wrangler.production.toml --remote
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
if ! ./scripts/with-cloudflare-env.sh wrangler deploy --config "$CONFIG" 2>&1 | tee "$DEPLOY_LOG"; then
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
