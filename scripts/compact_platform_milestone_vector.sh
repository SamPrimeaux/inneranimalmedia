#!/usr/bin/env bash
# Compact + vectorize the June 2026 platform milestone (docs + memory + code + golden archive).
#
# Lanes:
#   DOCUMENTS 1536 — manifest docs, platform snapshot, sprint plans, skill playbooks
#   MEMORY 1536    — D1 sprint memory routers
#   CODE 1536      — dashboard agent + create surfaces + ExecOS/CAD worker paths
#   DEEP_ARCHIVE 3072 — golden platform law (Supabase only)
#
# Usage:
#   ./scripts/compact_platform_milestone_vector.sh --dry-run
#   ./scripts/compact_platform_milestone_vector.sh
#   ./scripts/compact_platform_milestone_vector.sh --skip-code
#   ./scripts/compact_platform_milestone_vector.sh --docs-only
#
# Required env (via .env.cloudflare):
#   OPENAI_API_KEY, SUPABASE_DB_URL, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WRAPPER=(./scripts/with-cloudflare-env.sh)
DRY=0
SKIP_CODE=0
SKIP_MEMORY=0
SKIP_DEEP=0
SKIP_SKILLS=0
DOCS_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-code) SKIP_CODE=1 ;;
    --skip-memory) SKIP_MEMORY=1 ;;
    --skip-deep) SKIP_DEEP=1 ;;
    --skip-skills) SKIP_SKILLS=1 ;;
    --docs-only) DOCS_ONLY=1; SKIP_CODE=1; SKIP_MEMORY=1; SKIP_DEEP=1 ;;
    -h|--help)
      sed -n '1,22p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
  shift
done

DRY_FLAG=()
[[ "$DRY" -eq 1 ]] && DRY_FLAG=(--dry-run)

run_node() {
  if ((${#DRY_FLAG[@]})); then
    "${WRAPPER[@]}" node "$@" "${DRY_FLAG[@]}"
  else
    "${WRAPPER[@]}" node "$@"
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Platform milestone vector compact — $([[ "$DRY" -eq 1 ]] && echo DRY-RUN || echo LIVE)"
echo " git: $(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "→ Step 1: Milestone docs (identity, compaction map, Design Studio E2E, ExecOS fabric)"
run_node scripts/ingest_manifest_docs.mjs \
  --manifest docs/platform/platform-milestone-2026-06.manifest.json

echo ""
echo "→ Step 2: IAM platform snapshot docs (patterns + runtime architecture)"
run_node scripts/ingest_platform_snapshot.mjs

echo ""
echo "→ Step 3: Agentic Edge sprint plan + subdocs"
run_node scripts/ingest_agentic_edge_sprint_plan.mjs

echo ""
echo "→ Step 4: Design Studio sprint plan"
run_node scripts/ingest_designstudio_sprint_plan.mjs

if [[ "$SKIP_SKILLS" -eq 0 ]]; then
  echo ""
  echo "→ Step 5: Skill playbooks (chunked 400–600 tok → DOCUMENTS lane)"
  run_node scripts/ingest-skill-playbooks.mjs
fi

if [[ "$SKIP_MEMORY" -eq 0 ]]; then
  echo ""
  echo "→ Step 6: D1 memory routers → MEMORY lane (Supabase + Vectorize)"
  for script in \
    sync_platform_context_router_memory_vector \
    sync_designstudio_sprint_memory_vector \
    sync_agentic_edge_sprint_memory_vector \
    sync_byok_sprint_memory_vector; do
    echo "   • ${script}"
    run_node "scripts/${script}.mjs"
  done
fi

if [[ "$SKIP_CODE" -eq 0 ]]; then
  echo ""
  echo "→ Step 7a: Dashboard + agent codebase (CODE lane)"
  run_node scripts/reindex_codebase_dashboard_agent.mjs --no-prune

  echo ""
  echo "→ Step 7b: Create surfaces (Design Studio UI shell)"
  run_node scripts/reindex_codebase_dashboard_agent.mjs --create-surfaces-only

  echo ""
  echo "→ Step 7c: ExecOS / CAD / operator worker paths (CODE lane)"
  run_node scripts/reindex_codebase_dashboard_agent.mjs --milestone-worker-only
fi

if [[ "$SKIP_DEEP" -eq 0 && "$DOCS_ONLY" -eq 0 ]]; then
  echo ""
  echo "→ Step 8: Golden architecture docs → deep_archive (3072-d Supabase only)"
  if [[ "$DRY" -eq 1 ]]; then
    "${WRAPPER[@]}" node scripts/rag_ingest.mjs --dry-run --lane deep_archive
  else
    "${WRAPPER[@]}" node scripts/rag_ingest.mjs --lane deep_archive
  fi

  echo ""
  echo "→ Step 9: Re-sync Vectorize mirrors (documents + memory from Supabase)"
  if [[ "$DRY" -eq 1 ]]; then
    "${WRAPPER[@]}" node scripts/rag_ingest.mjs --dry-run --lane documents,memory
  else
    "${WRAPPER[@]}" node scripts/rag_ingest.mjs --lane documents,memory
  fi
fi

echo ""
echo "✓ Milestone compact complete"
echo "  Verify: ./scripts/with-cloudflare-env.sh node scripts/test/smoke-execos-chain.sh"
echo "  Manifest: docs/platform/platform-milestone-2026-06.manifest.json"
echo "  Map: docs/platform/context-embedding-compaction-map-2026-06.md"
