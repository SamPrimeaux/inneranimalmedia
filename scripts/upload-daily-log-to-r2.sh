#!/usr/bin/env bash
# Upload today's daily log to R2 (iam-platform) at memory/daily/YYYY-MM-DD.md
# Run from repo root. Requires CLOUDFLARE_API_TOKEN for --remote.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
DATE="${1:-$(date +%Y-%m-%d)}"
FILE="$REPO_ROOT/docs/memory/daily/$DATE.md"

if [ ! -f "$FILE" ]; then
  echo "No daily log at $FILE. Create it or pass date: $0 2026-03-02"
  exit 1
fi

echo "Uploading $FILE to R2 iam-platform/memory/daily/$DATE.md"
wrangler r2 object put "iam-platform/memory/daily/$DATE.md" \
  --file "$FILE" \
  --content-type "text/markdown" \
  --config "$CONFIG" \
  --remote

echo "Done. GET /api/agent/bootstrap will return this as daily_log when date=$DATE."
