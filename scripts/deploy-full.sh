#!/usr/bin/env zsh
# Full production deploy: ledger (Supabase), R2, Worker, optional reingest, codebase index, smoke eval.
# Optional/required deploy env → DB tables: docs/DEPLOY_ENV_SUPABASE_MAPPING.md
#
# ── Fast paths (use most of the time; full pipeline only for releases) ─────────
#   Worker only (~1 min):     npm run deploy
#   Frontend + R2 + Worker:   npm run deploy:frontend   (runs Vite unless SKIP_VITE_BUILD=1)
#   Everything below + ledger/eval/prune/smoke (~several min):  npm run deploy:full:safe
#
# ── Skips (content-hash vs last run, stored in .deploy-*-hash files; gitignored) ─
#   Override reingest:        FORCE_SUPABASE_REINGEST=1 npm run deploy:full
#   Override D1 memory:       FORCE_D1_MEMORY_INGEST=1 npm run deploy:full
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

export DEPLOY_PHASE=build_codebase_priority
node "$REPO_ROOT/scripts/build-index-priority-files.mjs" || true

export DEPLOY_PHASE=vite_build
BUILD_START_EPOCH=$(date +%s)
npm run build:vite-only
BUILD_END_EPOCH=$(date +%s)
BUILD_MS=$(( (BUILD_END_EPOCH - BUILD_START_EPOCH) * 1000 ))
node -e "const fs=require('fs');const p='${REPO_ROOT}/.deploy-pipeline-stats.json';let o={};try{if(fs.existsSync(p))o=JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){}o.build_ms=${BUILD_MS};fs.writeFileSync(p,JSON.stringify(o));"

# Docs/context → Supabase documents (hash of docs/ + manifest — not git diff HEAD~1, which misfires when
# docs ship in the same commit as unrelated code)
DOCS_HASH_FILE="$REPO_ROOT/.deploy-supabase-docs-hash"
DOCS_HASH=$(node "$REPO_ROOT/scripts/compute-deploy-input-hash.mjs" supabase-docs)
LAST_DOCS_HASH=""
[[ -f "$DOCS_HASH_FILE" ]] && LAST_DOCS_HASH="$(<"$DOCS_HASH_FILE")"
if [[ "${FORCE_SUPABASE_REINGEST:-0}" == "1" ]] || [[ -z "$LAST_DOCS_HASH" ]] || [[ "$DOCS_HASH" != "$LAST_DOCS_HASH" ]]; then
  echo "[deploy-full] Supabase document inputs changed (sha256) — reingest (was: git-diff HEAD~1; now content-hash)"
  export DEPLOY_PHASE=reingest_supabase_documents
  npm run reingest:supabase-documents:apply
  echo "$DOCS_HASH" >"$DOCS_HASH_FILE"
else
  echo "[deploy-full] Supabase document inputs unchanged — skipping reingest:supabase-documents"
fi

MIG_HASH_FILE="$REPO_ROOT/.deploy-migrations-hash"
MIG_HASH=$(node "$REPO_ROOT/scripts/compute-deploy-input-hash.mjs" migrations)
LAST_MIG_HASH=""
[[ -f "$MIG_HASH_FILE" ]] && LAST_MIG_HASH="$(<"$MIG_HASH_FILE")"
if [[ "${FORCE_D1_MEMORY_INGEST:-0}" == "1" ]] || [[ -z "$LAST_MIG_HASH" ]] || [[ "$MIG_HASH" != "$LAST_MIG_HASH" ]]; then
  echo "[deploy-full] migrations tree changed (sha256) — ingest:d1-memory"
  export DEPLOY_PHASE=ingest_d1_memory
  npm run ingest:d1-memory
  echo "$MIG_HASH" >"$MIG_HASH_FILE"
else
  echo "[deploy-full] migrations unchanged — skipping ingest:d1-memory"
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
