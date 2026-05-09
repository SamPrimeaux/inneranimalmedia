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

if [[ "${ALLOW_UNSAFE_R2_RECONCILE:-0}" != "1" && "${SKIP_R2_DEPLOY_RECONCILE:-0}" != "1" ]]; then
  echo "[deploy-full] Refusing to run unsafe R2 reconcile path."
  echo "[deploy-full] Use: npm run deploy:full:safe"
  echo "[deploy-full] Or set ALLOW_UNSAFE_R2_RECONCILE=1 only after R2 batching/timeouts are fixed."
  exit 1
fi

export RUN_GROUP_ID="${RUN_GROUP_ID:-rg_$(date +%s)_$(git rev-parse --short HEAD)}"

rm -f "$REPO_ROOT/.deploy-tool-events.jsonl"
rm -f "$REPO_ROOT/.deploy-eval-results.json"
rm -f "$REPO_ROOT/.deploy-pipeline-stats.json"
rm -f "$REPO_ROOT/.deploy-route-stats.json"
rm -f "$REPO_ROOT/.deploy-codebase-index-stats.json"

echo "[deploy-full] RUN_GROUP_ID=$RUN_GROUP_ID"

"$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$REPO_ROOT/scripts/finalize-stale-deploy-events.mjs" \
  --mode=startup --older-than-minutes=30 --apply || true

node "$REPO_ROOT/scripts/record-supabase-deploy-start.mjs"

node "$REPO_ROOT/scripts/record-d1-deploy-start.mjs"

deploy_full_err() {
  local ec=$?
  node "$REPO_ROOT/scripts/record-supabase-deploy-failure.mjs" \
    --reason "deploy_pipeline_failed" \
    --exit-code "$ec" \
    --failed-step "${DEPLOY_PHASE:-unknown}" \
    --error-key "deploy_pipeline_failed" 2>/dev/null || true
  node "$REPO_ROOT/scripts/record-d1-deploy-failure.mjs" \
    --reason "deploy_pipeline_failed" \
    --exit-code "$ec" \
    --failed-step "${DEPLOY_PHASE:-unknown}" \
    --error-key "deploy_pipeline_failed" 2>/dev/null || true
  exit "$ec"
}
trap deploy_full_err ERR

export DEPLOY_PHASE=generate_route_map
npm run generate:route-map

export DEPLOY_PHASE=vite_build
BUILD_START_EPOCH=$(date +%s)
npm run build:vite-only
BUILD_END_EPOCH=$(date +%s)
BUILD_MS=$(( (BUILD_END_EPOCH - BUILD_START_EPOCH) * 1000 ))
node -e "const fs=require('fs');const p='${REPO_ROOT}/.deploy-pipeline-stats.json';let o={};try{if(fs.existsSync(p))o=JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){}o.build_ms=${BUILD_MS};fs.writeFileSync(p,JSON.stringify(o));"

# Docs/context → Supabase documents (canonical writer — no ingest:docs duplicate here)
if git diff HEAD~1 --name-only 2>/dev/null | grep -qE 'docs/route-map|docs/d1-agentic-schema|scripts/supabase-documents-selected-manifest\.json'; then
  echo "[deploy-full] docs/context manifest paths changed — reingest Supabase documents"
  export DEPLOY_PHASE=reingest_supabase_documents
  npm run reingest:supabase-documents:apply
else
  echo "[deploy-full] docs/context unchanged — skipping reingest:supabase-documents"
fi

if git diff HEAD~1 --name-only 2>/dev/null | grep -qE 'migrations/'; then
  echo "[deploy-full] migrations found — running ingest:d1-memory"
  export DEPLOY_PHASE=ingest_d1_memory
  npm run ingest:d1-memory
else
  echo "[deploy-full] no migrations — skipping ingest:d1-memory"
fi

export DEPLOY_PHASE=deploy_frontend
SKIP_VITE_BUILD=1 "$REPO_ROOT/scripts/deploy-frontend.sh"

export DEPLOY_PHASE=index_codebase
node "$REPO_ROOT/scripts/index-codebase-snapshot.mjs" --apply

export DEPLOY_PHASE=deploy_eval
node "$REPO_ROOT/scripts/run-deploy-eval.mjs"

trap - ERR

node "$REPO_ROOT/scripts/record-supabase-deploy-complete.mjs"

node "$REPO_ROOT/scripts/record-d1-deploy-complete.mjs"

"$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$REPO_ROOT/scripts/finalize-stale-deploy-events.mjs" \
  --mode=post-deploy --older-than-minutes=15 --apply || true

"$REPO_ROOT/scripts/post-deploy-memory-sync.sh"

# R2 orphan prune + agentsam_script_runs telemetry (script_connor_r2_prune). Non-fatal if prune fails.
echo "[deploy-full] r2:prune (D1 telemetry + prune-r2-orphans)"
export DEPLOY_PHASE=r2_prune
export TRIGGER_SOURCE="${TRIGGER_SOURCE:-cicd}"
npm run r2:prune || echo "[deploy-full] warning: r2:prune non-zero exit (non-fatal)"

# Read-only / auth smoke (non-fatal; does not run E2E dry_run:false)
"$REPO_ROOT/scripts/post-deploy-smoke.sh" || echo "[deploy-full] warning: post-deploy-smoke non-zero (non-fatal)"
