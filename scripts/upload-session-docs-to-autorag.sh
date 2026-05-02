#!/usr/bin/env bash
# Upload RAG-friendly session/deploy docs to the autorag R2 bucket (prod binding).
# Does not replace the full docs/cursor-session-log.md in repo — uploads a trimmed snapshot for retrieval.
#
# Usage (from repo root):
#   ./scripts/upload-session-docs-to-autorag.sh
#   RECENT_LINES=500 ./scripts/upload-session-docs-to-autorag.sh
#
# Requires: ./scripts/with-cloudflare-env.sh, wrangler, wrangler.production.toml
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROD_CFG="${PROD_CFG:-wrangler.production.toml}"
WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)
BUCKET="${AUTORAG_BUCKET_NAME:-autorag}"
RECENT_LINES="${RECENT_LINES:-400}"

KNOWLEDGE_SRC="${REPO_ROOT}/docs/knowledge/workflows/IAM_DEPLOY_PROMOTE_AND_SESSION_LOG_RAG.md"
SESSION_LOG="${REPO_ROOT}/docs/cursor-session-log.md"
TMP_RECENT="$(mktemp)"
trap 'rm -f "$TMP_RECENT"' EXIT

if [ ! -f "$KNOWLEDGE_SRC" ]; then
  echo "ERROR: Missing $KNOWLEDGE_SRC"
  exit 1
fi

echo "=== upload-session-docs-to-autorag → ${BUCKET} ==="

echo "  Putting knowledge/workflows/iam-deploy-promote-and-session-log-rag.md ..."
"${WRANGLER[@]}" r2 object put "${BUCKET}/knowledge/workflows/iam-deploy-promote-and-session-log-rag.md" \
  --file="$KNOWLEDGE_SRC" \
  --content-type="text/markdown; charset=utf-8" \
  --remote -c "$PROD_CFG"

if [ -f "$SESSION_LOG" ]; then
  {
    echo "---"
    echo "title: Cursor session log (recent tail)"
    echo "category: context"
    echo "updated: $(date -u +%Y-%m-%d)"
    echo "importance: medium"
    echo "note: Rolling tail of docs/cursor-session-log.md for RAG; full history stays in git."
    echo "---"
    echo ""
    tail -n "$RECENT_LINES" "$SESSION_LOG"
  } > "$TMP_RECENT"
  echo "  Putting context/cursor-session-log-recent.md (last ${RECENT_LINES} lines) ..."
  "${WRANGLER[@]}" r2 object put "${BUCKET}/context/cursor-session-log-recent.md" \
    --file="$TMP_RECENT" \
    --content-type="text/markdown; charset=utf-8" \
    --remote -c "$PROD_CFG"
else
  echo "  WARN: $SESSION_LOG missing — skip recent snapshot"
fi

echo "Done. Keys:"
echo "  - ${BUCKET}/knowledge/workflows/iam-deploy-promote-and-session-log-rag.md"
echo "  - ${BUCKET}/context/cursor-session-log-recent.md (if session log present)"
echo "Next: trigger RAG ingest for these object_key values if your pipeline uses D1 autorag manifest."
