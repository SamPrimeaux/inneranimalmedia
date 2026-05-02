#!/usr/bin/env bash
# Upload the agent plan to R2 (inneranimalmedia) so other agents can load it. Run from repo root.
# Usage: ./scripts/upload-plan-to-r2.sh

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${REPO_ROOT}/wrangler.production.toml"
PLAN_FILE="${REPO_ROOT}/docs/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md"
KEY="memory/plans/AGENT_SIDEDRAWER_FOOTER_MONACO_PLAN.md"

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "Plan file not found: $PLAN_FILE" >&2
  exit 1
fi

cd "$REPO_ROOT"
echo "Uploading plan to R2 inneranimalmedia/$KEY ..."
./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/${KEY}" \
  --file="$PLAN_FILE" \
  --content-type=text/markdown \
  --remote \
  -c "$CONFIG"
echo "Done. Plan is stored at inneranimalmedia/$KEY"
