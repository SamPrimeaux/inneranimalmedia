#!/usr/bin/env bash
# Upload Loading Screens template bundle to R2 + motion system monoliths.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
MOTION_PREFIX="cms/motion/iam-motion-system-v1"
STATIC_PREFIX="static/templates/ui"

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

put_file() {
  local key="$1"
  local file="$2"
  local ct="${3:-text/html; charset=utf-8}"
  echo "→ put ${BUCKET}/${key}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${key}" \
    --file "$file" --content-type "$ct" --config "$CONFIG" --remote
}

echo "Uploading Loading Screens templates…"

# Monolith labs (motion system)
if [ -f "$REPO_ROOT/docs/sprints/agent_sam_loading_states_lab.html" ]; then
  put_file "${MOTION_PREFIX}/agent_sam_loading_states_lab.html" \
    "$REPO_ROOT/docs/sprints/agent_sam_loading_states_lab.html"
fi
if [ -f "$REPO_ROOT/static/templates/ui/agent-sam-loading-states-clean-lab/index.html" ]; then
  put_file "${MOTION_PREFIX}/agent_sam_loading_states_clean_lab.html" \
    "$REPO_ROOT/static/templates/ui/agent-sam-loading-states-clean-lab/index.html"
fi

# Static template paths (legacy ASSETS bucket — loading screens / motion stay on ASSETS).
# Section HTML catalog belongs in CMS_BUCKET (`cms`) under templates/sections/ — see
# scripts/seed-wet-dog-fundraising-sections.mjs and ./scripts/upload-cms-bucket-assets.sh.
for dir in agent-sam-loading-states-lab agent-sam-loading-states-clean-lab iam-offline-runner; do
  src="$REPO_ROOT/static/templates/ui/$dir/index.html"
  if [ -f "$src" ]; then
    put_file "${STATIC_PREFIX}/$dir/index.html" "$src"
  fi
done

# Split presence assets for lab
LAB_SPLIT="$REPO_ROOT/static/templates/ui/agent-sam-loading-states-lab"
if [ -d "$LAB_SPLIT" ]; then
  cp "$REPO_ROOT/dashboard/features/agent-presence/presenceIcons.css" "$LAB_SPLIT/presence-icons.css" 2>/dev/null || true
  for f in presence-icons.css presence-icons.json presence-lab-shell.css manifest.json; do
    if [ -f "$LAB_SPLIT/$f" ]; then
      ct="application/octet-stream"
      case "$f" in *.css) ct="text/css; charset=utf-8" ;; *.json) ct="application/json; charset=utf-8" ;; esac
      put_file "${MOTION_PREFIX}/agent-sam-loading-states-lab/${f}" "$LAB_SPLIT/$f" "$ct"
    fi
  done
fi

echo "Done. CMS category: Loading Screens (filter category=Loading Screens in /dashboard/cms/templates)"
