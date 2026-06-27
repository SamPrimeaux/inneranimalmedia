#!/usr/bin/env bash
# Bootstrap iam-cms-pipeline (standalone product repo).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="$REPO_ROOT/services/cms-pipeline-service"

echo "→ inneranimalmedia-cms pipeline setup"

if ! command -v uv >/dev/null 2>&1; then
  echo "✗ uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js required for pywrangler/wrangler" >&2
  exit 1
fi

cd "$SERVICE"
echo "→ uv sync (workers-py + beautifulsoup4)…"
uv sync

echo "→ pywrangler version"
uv run pywrangler --version || true

echo ""
echo "✓ Setup complete"
echo "  Dev:  cd services/cms-pipeline-service && uv run pywrangler dev --port 8788"
echo "  Docs: docs/PYTHON_CMS_AGENTIC.md"
