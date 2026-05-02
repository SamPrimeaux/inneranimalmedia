#!/usr/bin/env bash
# Upload full agent page and fragment to R2 (bucket inneranimalmedia).
# Worker serves /dashboard/agent from static/dashboard/agent.html (then dashboard/agent.html).
# Run from repo root. Loads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from ~/.zshrc if present.
# If wrangler returns 400, use Cloudflare Dashboard (see docs/AGENT_PAGE_DEBUG_SUMMARY.md).

set -e
cd "$(dirname "$0")/.."

# Load Cloudflare credentials from zsh config (usual place: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)
if [ -f "$HOME/.zshrc" ]; then
  set +e
  # shellcheck source=/dev/null
  source "$HOME/.zshrc" 2>/dev/null
  set -e
fi

CONFIG="${1:-wrangler.production.toml}"

echo "Uploading agent page to R2 (config: $CONFIG)..."
echo ""

FAILED=0

# Full page (primary key)
if npx wrangler r2 object put inneranimalmedia/dashboard/app/agent.html -f ./dashboard/agent.html --content-type=text/html --remote -c "$CONFIG" 2>&1; then
  echo "  OK dashboard/app/agent.html"
else
  echo "  FAIL dashboard/app/agent.html (wrangler often returns 400; use manual upload)"
  FAILED=1
fi
echo ""

# Fragment (for shell-injected flow)
if npx wrangler r2 object put inneranimalmedia/static/dashboard/pages/agent.html -f ./dashboard/pages/agent.html --content-type=text/html --remote -c "$CONFIG" 2>&1; then
  echo "  OK static/dashboard/pages/agent.html"
else
  echo "  FAIL static/dashboard/pages/agent.html"
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "Manual upload (Cloudflare Dashboard → R2 → bucket agent-sam):"
  echo "  1. Key: static/dashboard/agent.html     ← file: $(pwd)/dashboard/agent.html (Content-Type: text/html)"
  echo "  2. Key: static/dashboard/pages/agent.html ← file: $(pwd)/dashboard/pages/agent.html (Content-Type: text/html)"
  echo ""
fi

echo ""
echo "Verify: curl -sS 'https://inneranimalmedia.com/dashboard/agent' | grep -o 'agent-sam-root\\|agent-footer-chat' | head -3"
echo "See docs/AGENT_PAGE_DEBUG_SUMMARY.md for full deploy steps."
