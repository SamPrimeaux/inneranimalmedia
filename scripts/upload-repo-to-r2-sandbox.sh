#!/usr/bin/env bash
# Upload dashboard MPA + agent bundle + worker snapshot to R2 sandbox bucket.
# Keys mirror production agent-sam layout (static/dashboard/...) so URLs stay predictable.
#
# Usage:
#   ./scripts/upload-repo-to-r2-sandbox.sh
# Env:
#   SANDBOX_BUCKET=agent-sam-sandbox-cicd   (default)
#
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
BUCKET="${SANDBOX_BUCKET:-agent-sam-sandbox-cicd}"
CONFIG="wrangler.production.toml"
WRAP=(./scripts/with-cloudflare-env.sh npx wrangler r2 object put)

content_type() {
  case "${1##*.}" in
    html|htm) echo "text/html; charset=utf-8" ;;
    js|mjs|cjs) echo "application/javascript; charset=utf-8" ;;
    jsx) echo "application/javascript; charset=utf-8" ;;
    css) echo "text/css; charset=utf-8" ;;
    json) echo "application/json; charset=utf-8" ;;
    svg) echo "image/svg+xml" ;;
    png) echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    woff2) echo "font/woff2" ;;
    txt|md) echo "text/plain; charset=utf-8" ;;
    *) echo "application/octet-stream" ;;
  esac
}

put_file() {
  local file="$1" key="$2"
  if [[ ! -f "$file" ]]; then
    echo "SKIP missing: $file" >&2
    return 0
  fi
  local ct
  ct="$(content_type "$file")"
  echo "PUT s3://$BUCKET/$key <= $file"
  "${WRAP[@]}" "${BUCKET}/${key}" --file="$file" --content-type="$ct" --remote -c "$CONFIG"
}

echo "=== Sandbox bucket: $BUCKET (production-parity keys under static/) ==="

# --- 0) Manifest (plain text for easy read in dashboard)
MANIFEST="$(mktemp)"
{
  echo "agent-sam-sandbox-cicd — mirror of production R2 key layout (agent-sam)"
  echo "Same paths as prod: /dashboard/<page> -> static/dashboard/<page>.html"
  echo "Agent app: static/dashboard/agent.html + static/dashboard/agent/agent-dashboard.{js,css}"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "Repo: march1st-inneranimalmedia"
} >"$MANIFEST"
put_file "$MANIFEST" "_sandbox/MANIFEST.txt"
rm -f "$MANIFEST"

# --- 1) Legacy / build tree under agent-sam/static (page fragments, shell-v2, etc.)
# R2 key = path after agent-sam/  (e.g. static/dashboard/pages/mail.html)
if [[ -d agent-sam/static ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#agent-sam/}"
    put_file "$file" "$rel"
  done < <(find agent-sam/static -type f ! -name '.DS_Store' -print0 2>/dev/null)
fi

# --- 2) Repo static/dashboard (mcp-workflows-panel.js, draw, glb-viewer, etc.)
# R2 key must include static/ prefix (same as production agent-sam)
if [[ -d static/dashboard ]]; then
  while IFS= read -r -d '' file; do
    put_file "$file" "$file"
  done < <(find static/dashboard -type f ! -name '.DS_Store' -print0 2>/dev/null)
fi

# --- 3) Dashboard HTML shells (MPA)
if [[ -d dashboard ]]; then
  for file in dashboard/*.html; do
    [[ -f "$file" ]] || continue
    # Auth shell lives only at static/auth-signin.html (worker route); skip duplicate under static/dashboard/
    [[ "$(basename "$file")" == "auth-signin.html" ]] && continue
    put_file "$file" "static/dashboard/$(basename "$file")"
  done
  if [[ -d dashboard/pages ]]; then
    for file in dashboard/pages/*.html; do
      [[ -f "$file" ]] || continue
      put_file "$file" "static/dashboard/pages/$(basename "$file")"
    done
  fi
  # JSX pages referenced from dashboard shell / worker fallbacks
  for file in dashboard/*.jsx; do
    [[ -f "$file" ]] || continue
    put_file "$file" "static/dashboard/$(basename "$file")"
  done
fi

# --- 4) Auth route (prod uses static/auth-signin.html, not under dashboard/)
put_file "dashboard/auth-signin.html" "static/auth-signin.html"

# --- 4b) Overview page Vite output (overview.html loads /static/dashboard/overview/overview-dashboard.js + chunks)
if [[ -d overview-dashboard/dist ]]; then
  while IFS= read -r -d '' file; do
    put_file "$file" "static/dashboard/overview/$(basename "$file")"
  done < <(find overview-dashboard/dist -type f ! -name '.DS_Store' -print0 2>/dev/null)
fi

# --- 4c) Finance MPA (dashboard/finance.html loads /static/dashboard/Finance.js; Vite chunks must sit beside it)
# Without this, sandbox /dashboard/finance shows shell only. Production agent-sam uses same keys.
if [[ -d overview-dashboard/dist ]]; then
  for file in overview-dashboard/dist/Finance.js overview-dashboard/dist/overview-dashboard-*.js; do
    [[ -f "$file" ]] || continue
    put_file "$file" "static/dashboard/$(basename "$file")"
  done
fi

# --- 5) Agent Vite bundle LAST (must match live /dashboard/agent)
put_file "dashboard/dist/agent-dashboard.js" "static/dashboard/agent/agent-dashboard.js"
put_file "dashboard/dist/agent-dashboard.css" "static/dashboard/agent/agent-dashboard.css"

# --- 6) Worker snapshot (reference only; not served from R2 in prod)
put_file "worker.js" "source/worker.js"

echo "=== Done. Agent keys: static/dashboard/agent.html, static/dashboard/agent/agent-dashboard.{js,css} ==="
