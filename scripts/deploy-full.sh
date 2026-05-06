#!/usr/bin/env zsh
# Full production deploy: ledger (Supabase), R2, Worker, optional reingest, codebase index, smoke eval.
# Optional/required deploy env → DB tables: docs/DEPLOY_ENV_SUPABASE_MAPPING.md
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
set -a
if [[ -f "$REPO_ROOT/.env.cloudflare" ]]; then
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
fi
set +a

export RUN_GROUP_ID="${RUN_GROUP_ID:-rg_$(date +%s)_$(git rev-parse --short HEAD)}"

rm -f "$REPO_ROOT/.deploy-tool-events.jsonl"
rm -f "$REPO_ROOT/.deploy-eval-results.json"

echo "[deploy-full] RUN_GROUP_ID=$RUN_GROUP_ID"

node "$REPO_ROOT/scripts/record-supabase-deploy-start.mjs"

deploy_full_err() {
  local ec=$?
  node "$REPO_ROOT/scripts/record-supabase-deploy-failure.mjs" \
    --reason "deploy_pipeline_failed" \
    --exit-code "$ec" 2>/dev/null || true
  exit "$ec"
}
trap deploy_full_err ERR

npm run generate:route-map
npm run build:vite-only

# Docs/context → Supabase documents (canonical writer — no ingest:docs duplicate here)
if git diff HEAD~1 --name-only 2>/dev/null | grep -qE 'docs/route-map|docs/d1-agentic-schema|scripts/supabase-documents-selected-manifest\.json'; then
  echo "[deploy-full] docs/context manifest paths changed — reingest Supabase documents"
  npm run reingest:supabase-documents:apply
else
  echo "[deploy-full] docs/context unchanged — skipping reingest:supabase-documents"
fi

if git diff HEAD~1 --name-only 2>/dev/null | grep -qE 'migrations/'; then
  echo "[deploy-full] migrations found — running ingest:d1-memory"
  npm run ingest:d1-memory
else
  echo "[deploy-full] no migrations — skipping ingest:d1-memory"
fi

SKIP_VITE_BUILD=1 "$REPO_ROOT/scripts/deploy-frontend.sh"

node "$REPO_ROOT/scripts/index-codebase-snapshot.mjs" --apply

node "$REPO_ROOT/scripts/run-deploy-eval.mjs"

trap - ERR

node "$REPO_ROOT/scripts/record-supabase-deploy-complete.mjs"

"$REPO_ROOT/scripts/post-deploy-memory-sync.sh"
