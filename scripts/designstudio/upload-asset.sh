#!/usr/bin/env bash
# Upload a file to R2 bucket inneranimalmedia with explicit key (docs or meshy prefix).
# Usage: upload-asset.sh <local-file> <r2-key> [content-type]
# Example: upload-asset.sh ./out.glb meshy/smoke/test.glb model/gltf-binary
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

[[ $# -ge 2 ]] || { echo "usage: $0 <local-file> <r2-key> [content-type]" >&2; exit 1; }
FILE="$1"
KEY="$2"
CT="${3:-application/octet-stream}"

[[ -f "$FILE" ]] || { echo "not found: $FILE" >&2; exit 1; }

case "$FILE" in
  *.md) CT="text/markdown; charset=utf-8" ;;
  *.glb) CT="model/gltf-binary" ;;
  *.stl) CT="model/stl" ;;
  *.json) CT="application/json" ;;
esac

echo "Put inneranimalmedia/$KEY ($CT)"
./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/${KEY}" \
  --file="$FILE" \
  --content-type="$CT" \
  --remote \
  -c wrangler.jsonc
