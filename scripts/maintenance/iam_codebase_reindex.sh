#!/bin/bash
# ============================================================
# IAM Codebase Reindex
# Wipes stale codebase_chunks from Supabase and triggers
# a fresh index of the current repo state via Worker API.
# Usage: source .env.cloudflare && bash scripts/maintenance/iam_codebase_reindex.sh
# Or via alias: iam-reindex
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

OK="✅"
WARN="⚠️ "
FAIL="❌"
SPIN=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

WORKER_URL="https://inneranimalmedia.com"
SUPABASE_URL="${SUPABASE_URL:-https://dpmuvynqixblxsilnlut.supabase.co}"
WORKSPACE_ID="ws_inneranimalmedia"

# ── Pre-flight ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║     IAM Codebase Reindex                         ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

for v in INTERNAL_API_SECRET SUPABASE_SERVICE_ROLE_KEY; do
  val="${!v:-}"
  if [[ -z "$val" ]]; then
    echo -e "  ${FAIL} ${v} not set — source .env.cloudflare first"
    exit 1
  fi
done

echo -e "  ${OK} Secrets loaded"
echo -e "  ${WARN} This will DELETE all codebase_chunks for ${WORKSPACE_ID}"
echo ""
read -r -p "  Continue? [y/N] " confirm
if [[ "${confirm,,}" != "y" ]]; then
  echo "  Aborted."
  exit 0
fi

echo ""

# ── Step 1: Count existing chunks ────────────────────────────
echo -e "${BOLD}── Step 1: Current State ──────────────────────────${RESET}"

existing=$(curl -sf \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact" \
  "${SUPABASE_URL}/rest/v1/codebase_chunks?select=id&workspace_id=eq.${WORKSPACE_ID}&limit=1" \
  -I 2>/dev/null | grep -i content-range | grep -oE '[0-9]+$' || echo "0")

echo -e "  ${OK} Existing chunks: ${existing}"

snap_count=$(curl -sf \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact" \
  "${SUPABASE_URL}/rest/v1/codebase_snapshots?select=snapshot_id&workspace_id=eq.${WORKSPACE_ID}&limit=1" \
  -I 2>/dev/null | grep -i content-range | grep -oE '[0-9]+$' || echo "0")

echo -e "  ${OK} Existing snapshots: ${snap_count}"
echo ""

# ── Step 2: Wipe stale data ───────────────────────────────────
echo -e "${BOLD}── Step 2: Wipe Stale Chunks + Snapshots ──────────${RESET}"

# Delete chunks
del_chunks=$(curl -sf -X DELETE \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: return=minimal" \
  "${SUPABASE_URL}/rest/v1/codebase_chunks?workspace_id=eq.${WORKSPACE_ID}" \
  -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")

if [[ "$del_chunks" == "204" || "$del_chunks" == "200" ]]; then
  echo -e "  ${OK} Deleted all codebase_chunks for ${WORKSPACE_ID}"
else
  echo -e "  ${WARN} Chunk delete returned HTTP ${del_chunks} — may need manual cleanup"
fi

# Delete files
del_files=$(curl -sf -X DELETE \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: return=minimal" \
  "${SUPABASE_URL}/rest/v1/codebase_files?workspace_id=eq.${WORKSPACE_ID}" \
  -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")
echo -e "  ${OK} Cleared codebase_files (HTTP ${del_files})"

# Delete symbols
del_syms=$(curl -sf -X DELETE \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: return=minimal" \
  "${SUPABASE_URL}/rest/v1/codebase_symbols?workspace_id=eq.${WORKSPACE_ID}" \
  -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")
echo -e "  ${OK} Cleared codebase_symbols (HTTP ${del_syms})"

# Delete snapshots last (FK dependency)
del_snaps=$(curl -sf -X DELETE \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: return=minimal" \
  "${SUPABASE_URL}/rest/v1/codebase_snapshots?workspace_id=eq.${WORKSPACE_ID}" \
  -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")
echo -e "  ${OK} Cleared codebase_snapshots (HTTP ${del_snaps})"

echo ""

# ── Step 3: Trigger fresh index ───────────────────────────────
echo -e "${BOLD}── Step 3: Trigger Fresh Index ─────────────────────${RESET}"

index_result=$(curl -sf -X POST \
  -H "Authorization: Bearer ${INTERNAL_API_SECRET}" \
  -H "Content-Type: application/json" \
  "${WORKER_URL}/api/internal/codebase-reindex" \
  -d "{\"workspace_id\": \"${WORKSPACE_ID}\", \"full_reindex\": true}" \
  2>/dev/null || echo '{"error":"endpoint not responding"}')

if echo "$index_result" | grep -q '"ok":true\|"queued":true\|"started":true'; then
  echo -e "  ${OK} Reindex job triggered"
  job_id=$(echo "$index_result" | python3 -c "
import json,sys
try:
  d = json.load(sys.stdin)
  print(d.get('job_id', d.get('snapshot_id', 'unknown')))
except: print('unknown')
")
  echo -e "  ${OK} Job ID: ${job_id}"
elif echo "$index_result" | grep -q '"error"'; then
  echo -e "  ${WARN} Reindex endpoint not available — trigger manually from dashboard"
  echo -e "       Or run: Agent Sam → /codebase-reindex in chat"
else
  echo -e "  ${WARN} Unexpected response: ${index_result}"
fi

echo ""

# ── Step 4: Monitor progress ──────────────────────────────────
echo -e "${BOLD}── Step 4: Monitor Progress ─────────────────────────${RESET}"
echo -e "  Checking every 15s for up to 5 minutes..."
echo ""

MAX_CHECKS=20
DELAY=15
prev_count=0
spin_idx=0

for i in $(seq 1 $MAX_CHECKS); do
  sleep $DELAY

  current=$(curl -sf \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Prefer: count=exact" \
    "${SUPABASE_URL}/rest/v1/codebase_chunks?select=id&workspace_id=eq.${WORKSPACE_ID}&limit=1" \
    -I 2>/dev/null | grep -i content-range | grep -oE '[0-9]+$' || echo "0")

  null_embed=$(curl -sf \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Prefer: count=exact" \
    "${SUPABASE_URL}/rest/v1/codebase_chunks?select=id&workspace_id=eq.${WORKSPACE_ID}&embedding=is.null&limit=1" \
    -I 2>/dev/null | grep -i content-range | grep -oE '[0-9]+$' || echo "?")

  spin="${SPIN[$spin_idx]}"
  spin_idx=$(( (spin_idx + 1) % ${#SPIN[@]} ))

  delta=""
  if [[ "$current" =~ ^[0-9]+$ && "$prev_count" =~ ^[0-9]+$ ]]; then
    diff=$(( current - prev_count ))
    if [[ $diff -gt 0 ]]; then
      delta=" (+${diff})"
    fi
  fi

  echo -e "  ${spin} Check ${i}/${MAX_CHECKS} — chunks: ${current}${delta}  |  null embeddings: ${null_embed}  [$(date '+%H:%M:%S')]"

  prev_count=$current

  # Done condition: has chunks and null_embed is 0
  if [[ "$current" =~ ^[0-9]+$ && "$current" -gt 100 && "$null_embed" == "0" ]]; then
    echo ""
    echo -e "  ${OK} ${BOLD}Reindex complete!${RESET} ${current} chunks, all embedded."
    break
  fi
done

echo ""

# ── Final state ───────────────────────────────────────────────
echo -e "${BOLD}── Final State ──────────────────────────────────────${RESET}"

final_chunks=$(curl -sf \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact" \
  "${SUPABASE_URL}/rest/v1/codebase_chunks?select=id&workspace_id=eq.${WORKSPACE_ID}&limit=1" \
  -I 2>/dev/null | grep -i content-range | grep -oE '[0-9]+$' || echo "0")

final_null=$(curl -sf \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact" \
  "${SUPABASE_URL}/rest/v1/codebase_chunks?select=id&workspace_id=eq.${WORKSPACE_ID}&embedding=is.null&limit=1" \
  -I 2>/dev/null | grep -i content-range | grep -oE '[0-9]+$' || echo "?")

echo -e "  ${OK} Total chunks: ${final_chunks}"
if [[ "$final_null" == "0" ]]; then
  echo -e "  ${OK} All chunks embedded"
else
  echo -e "  ${WARN} Chunks missing embeddings: ${final_null}"
  echo -e "       Run: curl -X POST ${WORKER_URL}/api/internal/embed-codebase-chunks-backfill \\"
  echo -e "              -H 'Authorization: Bearer \$INTERNAL_API_SECRET' \\"
  echo -e "              -H 'Content-Type: application/json' \\"
  echo -e "              -d '{\"limit\": 100, \"batch_size\": 10, \"delay_ms\": 300}'"
fi

echo ""
echo -e "${BOLD}${CYAN}──────────────────────────────────────────────────${RESET}"
echo -e "${BOLD}  Reindex done — $(date '+%H:%M:%S')${RESET}"
echo -e "${CYAN}──────────────────────────────────────────────────${RESET}"
echo ""
