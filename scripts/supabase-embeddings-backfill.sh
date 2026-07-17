#!/usr/bin/env bash
# Opt-in caller for Supabase Edge Function `backfill-embeddings`.
# Aligns with supabase/functions/backfill-embeddings (agentsam schema, JWT/service auth).
#
# Body: { "table": "...", "limit": N, "dimensions"?: 1536|3072 }
# Auth: Authorization + apikey = SUPABASE_SERVICE_ROLE_KEY (verify_jwt).
#
# Default tables (1536):
#   agentsam_memory_oai3large_1536
#   agentsam_documents_oai3large_1536
#   agentsam_database_schema_oai3large_1536
# Optional archive (3072): set SUPABASE_EMBEDDINGS_BACKFILL_INCLUDE_ARCHIVE=1
#   agentsam_deep_archive_oai3large_3072
#
# Do NOT backfill agentsam_codebase_* here — use agentsam_codebase_reindex.mjs / rag_ingest --lane code.
#
# Env:
#   RUN_SUPABASE_EMBEDDINGS_BACKFILL=1          required to POST (otherwise prints skip + exits 0)
#   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY    required when RUN=1
#   SUPABASE_FUNCTIONS_URL                      optional override (…/functions/v1)
#   SUPABASE_EMBEDDINGS_LIMIT                   default 10 (function clamps 1..40)
#   SUPABASE_EMBEDDINGS_BATCH_SIZE              legacy alias for LIMIT
#   SUPABASE_EMBEDDINGS_BACKFILL_TABLES         space-separated override (table or table:3072)
#   SUPABASE_EMBEDDINGS_BACKFILL_INCLUDE_ARCHIVE=1
#
# Non-fatal: always exits 0 (deploy continues). Prints clear FAIL lines for missing tables / HTTP errors.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/.env.cloudflare" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi

RUN="${RUN_SUPABASE_EMBEDDINGS_BACKFILL:-0}"
if [[ "$RUN" != "1" ]]; then
  echo "[deploy] Supabase embeddings backfill skipped. Set RUN_SUPABASE_EMBEDDINGS_BACKFILL=1 to run."
  exit 0
fi

SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
SUPABASE_URL_RAW="${SUPABASE_URL:-}"
if [ -z "$SERVICE_KEY" ] || [ -z "$SUPABASE_URL_RAW" ]; then
  echo "[supabase-embeddings-backfill] FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required when RUN_SUPABASE_EMBEDDINGS_BACKFILL=1 — skipping." >&2
  exit 0
fi

DEFAULT_FUNCTIONS_BASE="${SUPABASE_URL_RAW%/}/functions/v1"
# Ignore known stale/test project refs if they linger in .env.cloudflare.
for stale in 'tcczxkatmodtxfuulvsr' 'sexdnwlyuhkyvseunqlx'; do
  case "${SUPABASE_FUNCTIONS_URL:-}" in
    *"${stale}"*)
      echo "[supabase-embeddings-backfill] Clearing stale SUPABASE_FUNCTIONS_URL (contains ${stale}); using ${DEFAULT_FUNCTIONS_BASE}" >&2
      SUPABASE_FUNCTIONS_URL=''
      break
      ;;
  esac
done

BASE="${SUPABASE_FUNCTIONS_URL:-$DEFAULT_FUNCTIONS_BASE}"
LIMIT="${SUPABASE_EMBEDDINGS_LIMIT:-${SUPABASE_EMBEDDINGS_BATCH_SIZE:-10}}"

TABLES_DEFAULT="agentsam_memory_oai3large_1536 agentsam_documents_oai3large_1536 agentsam_database_schema_oai3large_1536"
if [[ "${SUPABASE_EMBEDDINGS_BACKFILL_INCLUDE_ARCHIVE:-0}" == "1" ]]; then
  TABLES_DEFAULT="${TABLES_DEFAULT} agentsam_deep_archive_oai3large_3072"
fi
TABLES="${SUPABASE_EMBEDDINGS_BACKFILL_TABLES:-$TABLES_DEFAULT}"

REST_BASE="${SUPABASE_URL_RAW%/}/rest/v1"

# Resolve dimensions for a table token (table or table:3072).
dims_for_table() {
  local token="$1"
  local table="${token%%:*}"
  local override=""
  if [[ "$token" == *:* ]]; then
    override="${token##*:}"
  fi
  if [[ "$override" == "3072" || "$override" == "1536" ]]; then
    echo "$override"
    return
  fi
  case "$table" in
    *3072*|agentsam_deep_archive*) echo "3072" ;;
    *) echo "1536" ;;
  esac
}

table_name() {
  local token="$1"
  echo "${token%%:*}"
}

# PostgREST probe — agentsam schema. Returns 0 if table is reachable, 1 if missing.
table_exists() {
  local table="$1"
  local code
  code="$(curl -sS --max-time 30 -o /tmp/iam-embed-probe-$$.json -w '%{http_code}' \
    "${REST_BASE}/${table}?select=id&limit=0" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Accept-Profile: agentsam" \
    -H "Content-Profile: agentsam" || printf '000')"
  if [[ "$code" == "200" || "$code" == "206" ]]; then
    rm -f "/tmp/iam-embed-probe-$$.json" 2>/dev/null || true
    return 0
  fi
  local body=""
  body="$(cat "/tmp/iam-embed-probe-$$.json" 2>/dev/null || true)"
  rm -f "/tmp/iam-embed-probe-$$.json" 2>/dev/null || true
  echo "[supabase-embeddings-backfill] FAIL: table agentsam.${table} not reachable (HTTP ${code}). ${body}" >&2
  return 1
}

echo "[supabase-embeddings-backfill] POST ${BASE}/backfill-embeddings (limit=${LIMIT})"
echo "[supabase-embeddings-backfill] tables: ${TABLES}"

FAILS=0
for token in $TABLES; do
  t="$(table_name "$token")"
  dims="$(dims_for_table "$token")"
  echo "  → table=${t} dimensions=${dims}"

  if [[ "$t" == agentsam_codebase_* ]]; then
    echo "[supabase-embeddings-backfill] SKIP: ${t} — use agentsam_codebase_reindex.mjs / rag_ingest --lane code" >&2
    continue
  fi

  if ! table_exists "$t"; then
    FAILS=$((FAILS + 1))
    continue
  fi

  RESP="$(curl -sS --max-time 300 -w '\n%{http_code}' -X POST "${BASE}/backfill-embeddings" \
    -H "Content-Type: application/json" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -d "{\"table\":\"${t}\",\"limit\":${LIMIT},\"dimensions\":${dims}}" || printf '\n000')"
  HTTP_CODE="$(printf '%s' "$RESP" | tail -n1)"
  BODY="$(printf '%s' "$RESP" | sed '$d')"

  if command -v jq >/dev/null 2>&1; then
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  else
    echo "$BODY"
  fi

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "[supabase-embeddings-backfill] FAIL: ${t} HTTP ${HTTP_CODE}" >&2
    FAILS=$((FAILS + 1))
    continue
  fi
  if command -v jq >/dev/null 2>&1; then
    ERR="$(echo "$BODY" | jq -r '.error // empty' 2>/dev/null || true)"
    if [[ -n "$ERR" ]]; then
      echo "[supabase-embeddings-backfill] FAIL: ${t} — ${ERR}" >&2
      FAILS=$((FAILS + 1))
    fi
  fi
done

if [[ "$FAILS" -gt 0 ]]; then
  echo "[supabase-embeddings-backfill] completed with ${FAILS} failure(s) (non-fatal)." >&2
else
  echo "[supabase-embeddings-backfill] done."
fi
exit 0
