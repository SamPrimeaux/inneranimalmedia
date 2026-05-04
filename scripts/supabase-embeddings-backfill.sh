#!/usr/bin/env bash
# Call Supabase Edge Function `backfill-embeddings` for each table that the function
# supports (see TABLE_CONTENT_MAP in the function). Fills NULL `embedding` rows via
# Workers AI + service role.
#
# Requires SUPABASE_WEBHOOK_SECRET (must match the function's WEBHOOK_SECRET).
# Optional: SUPABASE_FUNCTIONS_URL (default: project functions URL),
#            SUPABASE_EMBEDDINGS_BATCH_SIZE (default 25, max 50 in function),
#            SUPABASE_EMBEDDINGS_BACKFILL_TABLES (space-separated override).
#
# Does not fail the shell on HTTP errors so deploy can continue; prints responses.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/.env.cloudflare" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi

SECRET="${SUPABASE_WEBHOOK_SECRET:-}"
if [ -z "$SECRET" ]; then
  echo "[supabase-embeddings-backfill] SUPABASE_WEBHOOK_SECRET unset — skipping." >&2
  exit 0
fi

BASE="${SUPABASE_FUNCTIONS_URL:-https://dpmuvynqixblxsilnlut.supabase.co/functions/v1}"
BATCH="${SUPABASE_EMBEDDINGS_BATCH_SIZE:-25}"
# Order: smaller / agent-context tables first; session_summaries last (often largest).
TABLES_DEFAULT="agent_context_snapshots agent_decisions agent_memory documents session_summaries"
TABLES="${SUPABASE_EMBEDDINGS_BACKFILL_TABLES:-$TABLES_DEFAULT}"

echo "[supabase-embeddings-backfill] POST ${BASE}/backfill-embeddings (batch_size=${BATCH})"

for t in $TABLES; do
  echo "  → table=${t}"
  RESP="$(curl -sS --max-time 300 -X POST "${BASE}/backfill-embeddings" \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"${SECRET}\",\"table\":\"${t}\",\"batch_size\":${BATCH}}" || printf '{"curl_error":true}')"
  if command -v jq >/dev/null 2>&1; then
    echo "$RESP" | jq . 2>/dev/null || echo "$RESP"
  else
    echo "$RESP"
  fi
done
