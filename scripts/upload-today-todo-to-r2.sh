#!/usr/bin/env bash
# Upload docs/memory/today-todo.md to R2 (iam-platform) at memory/today-todo.md
# Run from repo root. Requires CLOUDFLARE_API_TOKEN for --remote.
# After upload, run "Re-index memory" from Agent UI or POST /api/agent/rag/index-memory so RAG has it.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
FILE="$REPO_ROOT/docs/memory/today-todo.md"

if [ ! -f "$FILE" ]; then
  echo "No today-todo at $FILE. Create it first."
  exit 1
fi

echo "Uploading $FILE to R2 iam-platform/memory/today-todo.md"
wrangler r2 object put "iam-platform/memory/today-todo.md" \
  --file "$FILE" \
  --content-type "text/markdown" \
  --config "$CONFIG" \
  --remote

echo "Done. Re-index memory from Agent UI or: curl -X POST /api/agent/rag/index-memory"
