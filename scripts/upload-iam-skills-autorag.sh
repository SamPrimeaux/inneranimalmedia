#!/usr/bin/env bash
# Upload repo skills/*/SKILL.md → inneranimalmedia-autorag/skills/
# Then (by default) embed into docs lane via ingest_repo_skills_rag.mjs so semantic
# discovery stays current — R2 alone only satisfies exact-slash hydrate.
#
# Usage:
#   ./scripts/upload-iam-skills-autorag.sh
#   ./scripts/upload-iam-skills-autorag.sh --only deploy,iam-ship-main
#   ./scripts/upload-iam-skills-autorag.sh --skip-ingest   # R2 only (full pipeline runs ingest later)
#   SKIP_SKILLS_RAG_INGEST=1 ./scripts/upload-iam-skills-autorag.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"
BUCKET="${AUTORAG_SKILLS_BUCKET:-inneranimalmedia-autorag}"
SKILLS_ROOT="${REPO_ROOT}/skills"

ONLY=""
SKIP_INGEST=0
if [[ "${SKIP_SKILLS_RAG_INGEST:-0}" == "1" ]]; then
  SKIP_INGEST=1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)
      shift
      ONLY="${1:-}"
      ;;
    --only=*)
      ONLY="${1#*=}"
      ;;
    --skip-ingest)
      SKIP_INGEST=1
      ;;
    --ingest)
      SKIP_INGEST=0
      ;;
    -h|--help)
      sed -n '1,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ! -d "$SKILLS_ROOT" ]]; then
  echo "Missing skills directory: $SKILLS_ROOT" >&2
  exit 1
fi

# Comma-list → ",slug," needle for membership (bash 3.2 compatible — no assoc arrays)
ONLY_NEEDLE=""
if [[ -n "$ONLY" ]]; then
  ONLY_NEEDLE=",$(echo "$ONLY" | tr -d ' '),"
fi

skill_allowed() {
  local skill_dir="$1"
  if [[ -z "$ONLY_NEEDLE" ]]; then
    return 0
  fi
  case "$ONLY_NEEDLE" in
    *",${skill_dir},"*) return 0 ;;
    *) return 1 ;;
  esac
}

count=0
uploaded_keys=""
while IFS= read -r -d '' file; do
  rel="${file#"${SKILLS_ROOT}/"}"
  skill_dir="${rel%%/*}"
  if ! skill_allowed "$skill_dir"; then
    continue
  fi
  key="skills/${rel}"
  echo "PUT r2://${BUCKET}/${key}"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "text/markdown; charset=utf-8" \
    --config "$CONFIG" \
    --remote
  count=$((count + 1))
  if [[ -z "$uploaded_keys" ]]; then
    uploaded_keys="$skill_dir"
  else
    case ",${uploaded_keys}," in
      *",${skill_dir},"*) ;;
      *) uploaded_keys="${uploaded_keys},${skill_dir}" ;;
    esac
  fi
done < <(find "$SKILLS_ROOT" -type f -name 'SKILL.md' ! -name '.DS_Store' -print0)

echo "✓ Uploaded ${count} SKILL.md file(s) to r2://${BUCKET}/skills/"

if [[ "$count" -eq 0 ]]; then
  echo "Nothing uploaded — skipping docs-lane ingest."
  exit 0
fi

if [[ "$SKIP_INGEST" -eq 1 ]]; then
  echo "⏭ Skipping docs-lane ingest (--skip-ingest / SKIP_SKILLS_RAG_INGEST=1)"
  exit 0
fi

ingest_only="${ONLY:-$uploaded_keys}"

echo ""
echo "→ Docs lane: ingest_repo_skills_rag.mjs (agentsam_documents_oai3large_1536 + Vectorize)"
if [[ -n "$ingest_only" ]]; then
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$REPO_ROOT/scripts/ingest_repo_skills_rag.mjs" --only "$ingest_only"
else
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$REPO_ROOT/scripts/ingest_repo_skills_rag.mjs"
fi
