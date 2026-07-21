#!/usr/bin/env bash
# End-to-end embedding pipeline: R2 skills (runtime) + golden docs (3072) + repo skills (1536 Vectorize)
#
# What goes where:
#   R2 inneranimalmedia-autorag/skills/*/SKILL.md     → Agent Sam runtime (D1 retrieval_strategy=r2)
#   Supabase agentsam_deep_archive_oai3large_3072     → Golden platform architecture (H2, full 3072-d)
#   Supabase agentsam_documents_oai3large_1536          → Repo skills + R2 knowledge (1536-d)
#   CF Vectorize agentsam-documents-oai3large-1536      → Fast docs_knowledge_search mirror
#   Supabase agentsam_schema_oai3large_1536             → Large D1-only skills (ingest_skills_to_vectorize.py)
#
# Usage:
#   ./scripts/embed-golden-and-skills.sh --dry-run
#   ./scripts/embed-golden-and-skills.sh
#   ./scripts/embed-golden-and-skills.sh --skip-r2 --only-skills mcp-oauth-field-guide
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DRY=0
SKIP_R2=0
SKIP_DEEP=0
SKIP_REPO_SKILLS=0
SKIP_D1_SKILLS=0
SKIP_VECTORIZE_SYNC=0
ONLY_SKILLS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-r2) SKIP_R2=1 ;;
    --skip-deep) SKIP_DEEP=1 ;;
    --skip-repo-skills) SKIP_REPO_SKILLS=1 ;;
    --skip-d1-skills) SKIP_D1_SKILLS=1 ;;
    --skip-vectorize-sync) SKIP_VECTORIZE_SYNC=1 ;;
    --only-skills)
      shift
      ONLY_SKILLS="${1:-}"
      ;;
    --only-skills=*)
      ONLY_SKILLS="${1#*=}"
      ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
  shift
done

WRAPPER=(./scripts/with-cloudflare-env.sh)
DRY_FLAG=()
[[ "$DRY" -eq 1 ]] && DRY_FLAG=(--dry-run)

run_rag_ingest() {
  if ((${#DRY_FLAG[@]})); then
    "${WRAPPER[@]}" node scripts/rag_ingest.mjs "${DRY_FLAG[@]}" "$@"
  else
    "${WRAPPER[@]}" node scripts/rag_ingest.mjs "$@"
  fi
}

run_repo_skills() {
  local -a extra=()
  if [[ -n "$ONLY_SKILLS" ]]; then
    extra=(--only "$ONLY_SKILLS")
  fi
  if ((${#DRY_FLAG[@]})); then
    if ((${#extra[@]})); then
      "${WRAPPER[@]}" node scripts/ingest_repo_skills_rag.mjs "${DRY_FLAG[@]}" "${extra[@]}"
    else
      "${WRAPPER[@]}" node scripts/ingest_repo_skills_rag.mjs "${DRY_FLAG[@]}"
    fi
  elif ((${#extra[@]})); then
    "${WRAPPER[@]}" node scripts/ingest_repo_skills_rag.mjs "${extra[@]}"
  else
    "${WRAPPER[@]}" node scripts/ingest_repo_skills_rag.mjs
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " IAM embedding pipeline — $([[ "$DRY" -eq 1 ]] && echo DRY-RUN || echo LIVE)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "$SKIP_R2" -eq 0 ]]; then
  echo ""
  echo "→ Step 1: R2 skills (runtime hydrate via agentsam_skill + retrieval_strategy=r2)"
  if [[ "$DRY" -eq 1 ]]; then
    find "$REPO_ROOT/skills" -name 'SKILL.md' | wc -l | xargs echo "  would upload SKILL.md count:"
  else
    # Skip ingest here — Step 3 runs ingest_repo_skills_rag (avoids double embed).
    "$REPO_ROOT/scripts/upload-iam-skills-autorag.sh" --skip-ingest
  fi
fi

if [[ "$SKIP_DEEP" -eq 0 ]]; then
  echo ""
  echo "→ Step 2: Golden architecture docs → deep_archive (3072-d Supabase only)"
  echo "  includes: browserview-mybrowser-wiring, platform-baseline, iam-runtime-architecture, …"
  run_rag_ingest --lane deep_archive
fi

if [[ "$SKIP_REPO_SKILLS" -eq 0 ]]; then
  echo ""
  echo "→ Step 3: Repo skills/*/SKILL.md → documents lane (1536 Supabase + Vectorize upsert)"
  run_repo_skills
fi

if [[ "$SKIP_D1_SKILLS" -eq 0 ]]; then
  echo ""
  echo "→ Step 4: Large D1 agentsam_skill rows (retrieval_strategy=db, >4k chars) → schema lane"
  if [[ "$DRY" -eq 1 ]]; then
    "${WRAPPER[@]}" python3 scripts/ingest_skills_to_vectorize.py --dry-run
  else
    "${WRAPPER[@]}" python3 scripts/ingest_skills_to_vectorize.py
  fi
fi

if [[ "$SKIP_VECTORIZE_SYNC" -eq 0 && "$DRY" -eq 0 ]]; then
  echo ""
  echo "→ Step 5: Re-sync Vectorize mirrors for documents/memory/schema/code from Supabase"
  run_rag_ingest --lane documents,memory,schema,code
fi

echo ""
echo "✓ Pipeline complete"
echo "  Runtime skills: R2 skills/* + D1 agentsam_skill"
echo "  Semantic search: deep_archive (3072) + documents Vectorize (1536)"
echo "  See docs/platform/embedding-pipeline-2026-06.md"
