#!/usr/bin/env bash
# Upload Agent Sam Loading States Lab to R2 (iam-motion-system-v1).
# Canonical: cms/motion/iam-motion-system-v1/agent_sam_loading_states_lab.html
# Public:  https://assets.inneranimalmedia.com/cms/motion/iam-motion-system-v1/agent_sam_loading_states_lab.html
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
PREFIX="cms/motion/iam-motion-system-v1"
LAB_HTML="$REPO_ROOT/static/templates/ui/agent-sam-loading-states-lab/index.html"
MONOLITH_KEY="${PREFIX}/agent_sam_loading_states_lab.html"

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

if [ ! -f "$LAB_HTML" ]; then
  echo "Missing $LAB_HTML — build or copy your self-contained lab HTML there first."
  exit 1
fi

echo "→ Uploading Agent Sam Loading States Lab"
echo "   bucket=${BUCKET}"
echo "   key=${MONOLITH_KEY}"

"${WRANGLER[@]}" r2 object put "${BUCKET}/${MONOLITH_KEY}" \
  --file "$LAB_HTML" \
  --content-type "text/html; charset=utf-8" \
  --config "$CONFIG" \
  --remote

# Optional split assets (for fetch-based lab or tooling)
SPLIT_SRC="$REPO_ROOT/static/templates/ui/agent-sam-loading-states-lab"
if [ -f "$SPLIT_SRC/presence-icons.json" ]; then
  cp "$REPO_ROOT/dashboard/features/agent-presence/presenceIcons.css" "$SPLIT_SRC/presence-icons.css" 2>/dev/null || true
  for f in presence-icons.css presence-icons.json presence-lab-shell.css manifest.json; do
    if [ -f "$SPLIT_SRC/$f" ]; then
      ct="application/octet-stream"
      case "$f" in *.css) ct="text/css; charset=utf-8" ;; *.json) ct="application/json; charset=utf-8" ;; esac
      echo "  put ${PREFIX}/agent-sam-loading-states-lab/${f}"
      "${WRANGLER[@]}" r2 object put "${BUCKET}/${PREFIX}/agent-sam-loading-states-lab/${f}" \
        --file "$SPLIT_SRC/$f" --content-type "$ct" --config "$CONFIG" --remote
    fi
  done
fi

echo ""
echo "Done."
echo "Lab: https://assets.inneranimalmedia.com/${MONOLITH_KEY}"
