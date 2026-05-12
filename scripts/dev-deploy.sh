#!/bin/bash
# dev-deploy.sh — fast iterative deploy
# Usage:
#   ./scripts/dev-deploy.sh          # auto-detect what changed
#   ./scripts/dev-deploy.sh --worker # force worker-only (~30s)
#   ./scripts/dev-deploy.sh --front  # force frontend + R2 only
#   ./scripts/dev-deploy.sh --full   # full safe deploy

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }

MODE="${1:-auto}"

if [ "$MODE" = "--full" ]; then
  log "Full safe deploy..."
  npm run deploy:full:safe
  exit 0
fi

if [ "$MODE" = "--front" ]; then
  log "Frontend only — building Vite..."
  npm run build:vite-only
  log "Uploading to R2..."
  npx wrangler r2 object put inneranimalmedia-assets/static --recursive ./dist 2>/dev/null || true
  log "Frontend done."
  exit 0
fi

if [ "$MODE" = "--worker" ]; then
  log "Worker-only deploy..."
  npx wrangler deploy -c wrangler.production.toml
  log "Worker deployed."
  exit 0
fi

# Auto: detect changed files since last deploy
CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only)

WORKER_CHANGED=false
FRONT_CHANGED=false

echo "$CHANGED" | grep -qE "^src/|^wrangler" && WORKER_CHANGED=true
echo "$CHANGED" | grep -qE "^dashboard/" && FRONT_CHANGED=true

log "Changed: worker=$WORKER_CHANGED frontend=$FRONT_CHANGED"

if [ "$WORKER_CHANGED" = true ] && [ "$FRONT_CHANGED" = false ]; then
  log "Worker-only deploy (~30s)..."
  npx wrangler deploy -c wrangler.production.toml
  log "Done."
elif [ "$FRONT_CHANGED" = true ] && [ "$WORKER_CHANGED" = false ]; then
  log "Frontend-only deploy..."
  npm run build:vite-only
  log "Done."
else
  log "Both changed — running full:safe..."
  npm run deploy:full:safe
fi
