#!/usr/bin/env bash
# Upload schema-and-records memory to R2 (iam-platform) at memory/schema-and-records.md
# So Agent Sam and GET /api/agent/bootstrap get it. Run from repo root. Requires CLOUDFLARE_API_TOKEN for --remote.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
FILE="$REPO_ROOT/docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md"

if [ ! -f "$FILE" ]; then
  echo "No file at $FILE"
  exit 1
fi

echo "Uploading $FILE to R2 iam-platform/memory/schema-and-records.md"
wrangler r2 object put "iam-platform/memory/schema-and-records.md" \
  --file "$FILE" \
  --content-type "text/markdown" \
  --config "$CONFIG" \
  --remote

echo "Done. Agent Sam chat and GET /api/agent/bootstrap will use this for schema/backfill/D1 workflow."
