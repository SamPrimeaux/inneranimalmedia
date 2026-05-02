#!/usr/bin/env bash
# Tracked deployment: run wrangler deploy then log to /api/deployments/log (deployments table).
# Usage: ./scripts/deploy.sh "VERSION_TAG" "Description of what changed"
# Example: ./scripts/deploy.sh "v44-deploy-tracking-test" "Testing deployment tracking system"
#
# Requires DEPLOY_TRACKING_TOKEN in env (same value as WORKER_SECRET or a dedicated secret).
# Source before running: source ~/IAM_SECRETS.env   or add to .env.cloudflare
# Get WORKER_SECRET from: Cloudflare Dashboard > Workers > inneranimalmedia > Settings > Variables > Secrets

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
CONFIG="${PROJECT_DIR}/wrangler.production.toml"

# Load token: IAM_SECRETS.env then .env.cloudflare
if [[ -f "$HOME/IAM_SECRETS.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$HOME/IAM_SECRETS.env"
  set +a
fi
if [[ -f "$PROJECT_DIR/.env.cloudflare" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_DIR/.env.cloudflare"
  set +a
fi

VERSION="${1:-unknown}"
DESCRIPTION="${2:-}"

echo "Starting tracked deployment..."
echo "Git context:"
echo "  Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'n/a')"
echo "  Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
echo "Version: $VERSION"
echo "Description: $DESCRIPTION"
echo ""

DEPLOY_START=$(date +%s)
echo "Running wrangler deploy..."
if ! ./scripts/with-cloudflare-env.sh wrangler deploy --config "$CONFIG"; then
  echo "Deployment failed."
  exit 1
fi
DEPLOY_END=$(date +%s)
DEPLOY_SECONDS=$((DEPLOY_END - DEPLOY_START))
echo "Deployment successful in ${DEPLOY_SECONDS}s."
echo ""

if [[ -z "$DEPLOY_TRACKING_TOKEN" ]]; then
  echo "Warning: DEPLOY_TRACKING_TOKEN not set. Skipping deployment log. Set it in ~/IAM_SECRETS.env or .env.cloudflare."
  echo "Deployment complete."
  exit 0
fi

echo "Logging deployment to tracking system..."
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Escape double quotes for JSON
DESC_ESC="${DESCRIPTION//\"/\\\"}"
VER_ESC="${VERSION//\"/\\\"}"
RESP=$(curl -s -w "\n%{http_code}" -X POST "https://inneranimalmedia.com/api/deployments/log" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEPLOY_TRACKING_TOKEN" \
  -d "{\"version\":\"$VER_ESC\",\"description\":\"$DESC_ESC\",\"git_hash\":\"$GIT_HASH\",\"timestamp\":\"$TIMESTAMP\",\"status\":\"success\",\"deployed_by\":\"deploy.sh\",\"environment\":\"production\",\"duration_seconds\":$DEPLOY_SECONDS}")
HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "Deployment logged successfully."
else
  echo "Warning: Log request returned HTTP $HTTP_CODE: $HTTP_BODY"
fi
echo "Deployment complete."
