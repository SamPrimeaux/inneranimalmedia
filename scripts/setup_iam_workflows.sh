#!/usr/bin/env bash
# Bootstrap iam-workflows (Python Workflows + uv/pywrangler).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="$REPO_ROOT/services/iam-workflows"

echo "→ IAM Workflows setup (services/iam-workflows)"

if [[ ! -d "$SERVICE" ]]; then
  echo "✗ Missing $SERVICE" >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "✗ uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js required for pywrangler/wrangler" >&2
  exit 1
fi

cd "$SERVICE"
echo "→ uv sync…"
uv sync

echo ""
echo "✓ Setup complete"
echo "  Dev:  cd services/iam-workflows && uv run pywrangler dev --port 8789"
echo "  Deploy: ./scripts/deploy_iam_workflows.sh"
