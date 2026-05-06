#!/usr/bin/env zsh
set -e

npm run generate:route-map
npm run generate:d1-schema-doc
npm run build:vite-only

# Only ingest docs if route-map or schema changed vs last commit
if git diff HEAD~1 --name-only 2>/dev/null | grep -qE 'docs/route-map|docs/d1-agentic-schema'; then
  echo "[deploy] docs changed — running ingest:docs"
  npm run ingest:docs
else
  echo "[deploy] docs unchanged — skipping ingest:docs"
fi

# Only ingest D1 memory if migrations present in this commit
if git diff HEAD~1 --name-only 2>/dev/null | grep -qE 'migrations/'; then
  echo "[deploy] migrations found — running ingest:d1-memory"
  npm run ingest:d1-memory
else
  echo "[deploy] no migrations — skipping ingest:d1-memory"
fi

./scripts/deploy-frontend.sh
./scripts/post-deploy-memory-sync.sh
