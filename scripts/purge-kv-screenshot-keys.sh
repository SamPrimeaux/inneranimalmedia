#!/usr/bin/env bash
# Delete legacy screenshot blobs wrongly stored in MCP_TOKENS (env.KV binding).
# Screenshots must live on R2 only (reports/quality-report/, screenshots/browser/, screenshots/agent/).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"
BINDING="${KV_BINDING:-KV}"
PREFIX="${KV_SCREENSHOT_PREFIX:-screenshots/}"
DRY_RUN="${DRY_RUN:-0}"

cd "$REPO_ROOT"

echo "Listing KV keys (binding=${BINDING}, prefix=${PREFIX})..."
keys="$("$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler kv key list \
  --binding "$BINDING" \
  --prefix "$PREFIX" \
  --config "$CONFIG" \
  --remote 2>/dev/null || true)"

if [ -z "$keys" ] || [ "$keys" = "[]" ]; then
  echo "No keys under prefix ${PREFIX}"
  exit 0
fi

count="$(echo "$keys" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo 0)"
echo "Found ${count} key(s) to delete."

if [ "$DRY_RUN" = "1" ]; then
  echo "$keys" | python3 -c "import sys,json; [print(x.get('name','')) for x in json.load(sys.stdin)]" 2>/dev/null || true
  echo "DRY_RUN=1 — no deletes."
  exit 0
fi

echo "$keys" | python3 -c "
import json, subprocess, sys, os
keys = json.load(sys.stdin)
repo = os.environ.get('REPO_ROOT', '.')
config = os.environ.get('CONFIG', 'wrangler.production.toml')
binding = os.environ.get('BINDING', 'KV')
with_cf = os.path.join(repo, 'scripts/with-cloudflare-env.sh')
deleted = 0
for row in keys:
    name = row.get('name') if isinstance(row, dict) else row
    if not name:
        continue
    subprocess.run(
        [with_cf, 'npx', 'wrangler', 'kv', 'key', 'delete', name,
         '--binding', binding, '--config', config, '--remote'],
        check=True,
        cwd=repo,
    )
    deleted += 1
    print('deleted', name)
print('Done.', deleted, 'keys removed.')
" REPO_ROOT="$REPO_ROOT" CONFIG="$CONFIG" BINDING="$BINDING"
