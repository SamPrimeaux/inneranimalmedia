#!/usr/bin/env bash
# Bootstrap iam-cms-pipeline Python Worker (uv + pywrangler).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="$REPO_ROOT/services/cms-pipeline-service"
TOML="$REPO_ROOT/wrangler.production.toml"

echo "→ IAM CMS Python pipeline setup"

if ! command -v uv >/dev/null 2>&1; then
  echo "✗ uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js required for pywrangler/wrangler" >&2
  exit 1
fi

# Sync SESSION_CACHE KV id from production wrangler when present
if [[ -f "$TOML" ]]; then
  KV_ID="$(python3 - <<'PY' "$TOML"
import re, sys
text = open(sys.argv[1]).read()
block = False
for line in text.splitlines():
    if 'binding = "SESSION_CACHE"' in line:
        block = True
        continue
    if block and line.strip().startswith("id ="):
        print(line.split("=", 1)[1].strip().strip('"'))
        break
PY
)"
  if [[ -n "${KV_ID:-}" ]]; then
    python3 - <<PY "$SERVICE/wrangler.jsonc" "$KV_ID"
import json, sys
path, kv_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    cfg = json.load(f)
for ns in cfg.get("kv_namespaces", []):
    if ns.get("binding") == "SESSION_CACHE":
        ns["id"] = kv_id
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print(f"✓ SESSION_CACHE KV id → {kv_id[:8]}…")
PY
  fi
fi

cd "$SERVICE"
echo "→ uv sync (workers-py + beautifulsoup4)…"
uv sync

echo "→ pywrangler version"
uv run pywrangler --version || uv run pywrangler --help | head -3

echo ""
echo "✓ Setup complete"
echo "  Dev:  cd services/cms-pipeline-service && uv run pywrangler dev --port 8788"
echo "  Docs: docs/cms/PYTHON_CMS_AGENTIC.md"
