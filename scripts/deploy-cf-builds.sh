#!/usr/bin/env bash
# Cloudflare Workers Builds: deploy worker + sync Vite dist and shell CSS to sandbox R2.
# Run from repo root (CF Dashboard Deploy command: bash scripts/deploy-cf-builds.sh).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DIST_DIR="dashboard/dist"
BUCKET="${SANDBOX_BUCKET:-inneranimalmedia-sandbox-cicd}"
R2_PREFIX="static/dashboard/agent"

echo "=== CF Builds: worker deploy ==="
npx wrangler deploy ./src/index.js -c wrangler.jsonc

# Increment version
CUR_V=$(cat agent-dashboard/.sandbox-deploy-version 2>/dev/null || echo 99)
NEXT_V=$((CUR_V + 1))
echo "$NEXT_V" > agent-dashboard/.sandbox-deploy-version
export VITE_SHELL_VERSION=v${NEXT_V}
echo "=== CF Builds: Vite build ==="
npm ci --include=dev && npm run build:vite-only && node scripts/bump-cache.js
echo "=== CF Builds: R2 asset sync ==="
MAX_JOBS=8
job_count=0

if [ -d "$DIST_DIR" ]; then
  echo "=== [cf-builds] Uploading all assets from $DIST_DIR to ${BUCKET}/${R2_PREFIX}/ ==="
  # Upload items in the root of DIST_DIR (js, css, woff2, etc)
  # filter out index.html (handled separately) and maps (optional)
  find "$DIST_DIR" -maxdepth 1 -type f ! -name 'index.html' ! -name '._*' ! -name '.DS_Store' | while read -r file; do
    fname=$(basename "$file")
    key="${R2_PREFIX}/${fname}"
    # Detect content type
    ctype="application/octet-stream"
    [[ "$fname" == *.js ]] && ctype="application/javascript"
    [[ "$fname" == *.css ]] && ctype="text/css"
    [[ "$fname" == *.woff2 ]] && ctype="font/woff2"

    npx wrangler r2 object put "${BUCKET}/${key}" \
      --file "$file" \
      --content-type "$ctype" \
      --remote \
      -c wrangler.jsonc &
    
    job_count=$((job_count + 1))
    if [ "$job_count" -ge "$MAX_JOBS" ]; then
      wait
      job_count=0
    fi
  done
  
  # Also handle dist/assets if it ever exists (future proofing)
  if [ -d "$DIST_DIR/assets" ]; then
    find "$DIST_DIR/assets" -type f ! -name '._*' ! -name '.DS_Store' | while read -r file; do
      rel_path=$(echo "$file" | sed "s|^$DIST_DIR/||")
      key="${R2_PREFIX}/${rel_path}"
      npx wrangler r2 object put "${BUCKET}/${key}" \
        --file "$file" \
        --remote \
        -c wrangler.jsonc &
      
      job_count=$((job_count + 1))
      if [ "$job_count" -ge "$MAX_JOBS" ]; then
        wait
        job_count=0
      fi
    done
  fi
  wait
else
  echo "[cf-builds] err: $DIST_DIR not found"
  exit 1
fi

if [ -f "$DIST_DIR/index.html" ]; then
  # Upload to BOTH locations used by worker: root index.html (fallback) and static/dashboard/agent.html
  npx wrangler r2 object put "${BUCKET}/static/dashboard/agent.html" \
    --file "$DIST_DIR/index.html" \
    --content-type "text/html" \
    --remote \
    -c wrangler.jsonc
  
  # Some worker paths fallback to objectKey index.html
  npx wrangler r2 object put "${BUCKET}/index.html" \
    --file "$DIST_DIR/index.html" \
    --content-type "text/html" \
    --remote \
    -c wrangler.jsonc
  echo "[cf-builds] index.html uploaded"
fi

SHELL_CSS=""
if [ -f "./static/dashboard/shell.css" ]; then
  SHELL_CSS="./static/dashboard/shell.css"
elif [ -f "./dashboard/shell.css" ]; then
  SHELL_CSS="./dashboard/shell.css"
fi
if [ -n "$SHELL_CSS" ]; then
  npx wrangler r2 object put "${BUCKET}/static/dashboard/shell.css" \
    --file "$SHELL_CSS" \
    --content-type "text/css" \
    --remote \
    -c wrangler.jsonc
  echo "[cf-builds] shell.css uploaded"
fi

echo "=== CF Builds Deploy Complete ==="
