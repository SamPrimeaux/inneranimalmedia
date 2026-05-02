#!/usr/bin/env bash
# sync-scripts-to-r2.sh
# Uploads .sh files from scripts/ and scripts/lib/ to R2 bucket inneranimalmedia under scripts/.
# Run from repo root: ./scripts/sync-scripts-to-r2.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

echo "=== Syncing scripts/ to R2 (inneranimalmedia/scripts/) ==="
count=0

upload_one() {
  local f="$1"
  local rel="$2"
  echo "  Uploading ${rel}..."
  "${WRANGLER[@]}" r2 object put "inneranimalmedia/${rel}" \
    --file "$f" \
    --content-type "text/x-shellscript" \
    --remote -c wrangler.production.toml
  count=$((count + 1))
}

for f in "$SCRIPT_DIR"/*.sh; do
  [ -e "$f" ] || continue
  [ -f "$f" ] || continue
  upload_one "$f" "scripts/$(basename "$f")"
done

if [ -d "$SCRIPT_DIR/lib" ]; then
  for f in "$SCRIPT_DIR/lib"/*.sh; do
    [ -e "$f" ] || continue
    [ -f "$f" ] || continue
    upload_one "$f" "scripts/lib/$(basename "$f")"
  done
fi

echo "Done — ${count} scripts synced to R2 inneranimalmedia/scripts/"
