#!/usr/bin/env bash
# Deploy iam-workflows Python Worker, then inneranimalmedia (IAM_WORKFLOWS binding).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="$REPO_ROOT/services/iam-workflows"
ENV_WRAPPER="$REPO_ROOT/scripts/with-cloudflare-env.sh"

chmod +x "$ENV_WRAPPER" "$REPO_ROOT/scripts/setup_iam_workflows.sh" 2>/dev/null || true

if [[ ! -x "$ENV_WRAPPER" ]]; then
  echo "✗ Missing $ENV_WRAPPER" >&2
  exit 1
fi

"$REPO_ROOT/scripts/setup_iam_workflows.sh"

echo "→ Deploy iam-workflows…"
cd "$SERVICE"
"$ENV_WRAPPER" uv run pywrangler deploy

echo "→ Deploy inneranimalmedia (IAM_WORKFLOWS service binding)…"
cd "$REPO_ROOT"
"$ENV_WRAPPER" npx wrangler deploy -c wrangler.production.toml

echo "✓ iam-workflows + platform deploy complete"
