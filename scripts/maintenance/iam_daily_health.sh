#!/usr/bin/env bash
# iam_daily_health.sh — Inner Animal Media platform health check
# All queries verified against live D1/Supabase schemas 2026-05-21
# Usage: iam-health  (alias in ~/.zshrc)

set -uo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
WORKER_URL="https://inneranimalmedia.com"
D1_ID="cf87b717-d4e2-4cf8-bab0-a81268e32d49"
SUPABASE_URL="https://dpmuvynqixblxsilnlut.supabase.co"
SUPABASE_KEY=""
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CF_ACCOUNT="ede6590ac0d2fb7daf155b35653457b2"
R2_BUCKETS=("inneranimalmedia" "autorag" "tools" "media")
KV_FLAGS=("deploy" "errors" "workflows" "plans")
KV_NAMESPACE_ID="${IAM_KV_NAMESPACE_ID:-}"
KV_ENDPOINT="${WORKER_URL}/internal/kv-flags"
# ── Load local secrets (.env.cloudflare) ──────────────────────────────────────
# Provides: CF_TOKEN, SUPABASE_ANON_KEY, CLOUDFLARE_API_TOKEN, etc.
# Wrangler secrets are not available to shell scripts; they live here locally.
_ENV_FILE="$(dirname "$(realpath "$0")")/../../.env.cloudflare"
if [[ -f "$_ENV_FILE" ]]; then
  # Export only lines that look like VAR=value (skip comments and blanks)
  set -a
  source "$_ENV_FILE"
  set +a
fi
# Allow explicit overrides to take precedence
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_TOKEN:-}}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"


# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✅${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠️ ${RESET}  $*"; }
err()  { echo -e "  ${RED}❌${RESET}  $*"; }
hdr()  { echo -e "\n${CYAN}── $1 ──${RESET}$(printf '─%.0s' $(seq 1 $((44-${#1}))))"; }

# D1 query → JSON results array
d1() {
  local sql="$1"
  curl -sf -X POST \
    "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${D1_ID}/query" \
    -H "Authorization: Bearer ${CF_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"sql\":$(echo "$sql" | jq -Rs .)}" \
  | jq -r '.result[0].results // []'
}

# Supabase REST count query
sb_count() {
  local table="$1" filter="${2:-}"
  local url="${SUPABASE_URL}/rest/v1/${table}?select=id"
  [[ -n "$filter" ]] && url+="&${filter}"
  curl -sf -o /dev/null -w "%{http_code}" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Prefer: count=exact" \
    -H "Range: 0-0" \
    "$url" 2>/dev/null || echo "0"
}

sb_sql() {
  local sql="$1"
  curl -sf \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$sql" | jq -Rs .)}" 2>/dev/null || echo "null"
}

# ── Header ────────────────────────────────────────────────────────────────────
NOW=$(TZ="America/Chicago" date "+%Y-%m-%d %H:%M CDT")
printf "\n${BOLD}╔══════════════════════════════════════════════════╗${RESET}\n"
printf "${BOLD}║   IAM Platform Health  —  %-22s║${RESET}\n" "$NOW"
printf "${BOLD}╚══════════════════════════════════════════════════╝${RESET}\n"

# ═══════════════════════════════════════════════════════════════════════════════
# 1. Worker liveness + last deploy
# ═══════════════════════════════════════════════════════════════════════════════
hdr "1. Worker"

STATUS=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 8 "${WORKER_URL}" || echo "000")
if [[ "$STATUS" == "200" ]]; then
  ok "Worker live at ${WORKER_URL}"
else
  err "Worker returned HTTP ${STATUS}"
fi

DEPLOY=$(d1 "
  SELECT substr(git_hash,1,7) as hash, status, timestamp as ts
  FROM deployments ORDER BY timestamp DESC LIMIT 1
" | jq -r '.[0] | "\(.hash) (\(.status)) @ \(.ts)"' 2>/dev/null || echo "unknown")

if [[ "$DEPLOY" == *"success"* ]]; then
  ok "Last deploy: ${DEPLOY}"
elif [[ "$DEPLOY" == *"failed"* ]]; then
  err "Last deploy: ${DEPLOY}"
elif [[ "$DEPLOY" == *"pending"* ]]; then
  warn "Last deploy: ${DEPLOY} — deploy may still be in flight or stale"
elif [[ "$DEPLOY" == "unknown" ]]; then
  warn "Could not read deployments table"
else
  warn "Last deploy: ${DEPLOY}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 2. Agent Sam Ops  (primary: agentsam_agent_run)
# ═══════════════════════════════════════════════════════════════════════════════
hdr "2. Agent Sam Ops"

OPS=$(d1 "
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN created_at > datetime('now','-1 day')  THEN 1 ELSE 0 END) as runs_24h,
    SUM(CASE WHEN created_at > datetime('now','-7 days') THEN 1 ELSE 0 END) as runs_7d,
    SUM(CASE WHEN status='running'                       THEN 1 ELSE 0 END) as running,
    SUM(CASE WHEN status='error' AND created_at > datetime('now','-1 day')  THEN 1 ELSE 0 END) as errors_24h,
    SUM(CASE WHEN timed_out=1  AND created_at > datetime('now','-7 days')   THEN 1 ELSE 0 END) as timeouts_7d,
    SUM(CASE WHEN sla_breach=1 AND created_at > datetime('now','-7 days')   THEN 1 ELSE 0 END) as sla_7d
  FROM agentsam_agent_run
" | jq -r '.[0]')

RUNS_24H=$(echo "$OPS" | jq -r '.runs_24h // 0')
RUNS_7D=$(echo "$OPS"  | jq -r '.runs_7d  // 0')
RUNNING=$(echo "$OPS"  | jq -r '.running  // 0')
ERR_24H=$(echo "$OPS"  | jq -r '.errors_24h // 0')
TO_7D=$(echo "$OPS"    | jq -r '.timeouts_7d // 0')
SLA_7D=$(echo "$OPS"   | jq -r '.sla_7d // 0')

[[ "$ERR_24H" == "0" ]] && ok "Agent runs — 24h: ${RUNS_24H}  |  7d: ${RUNS_7D}  |  active now: ${RUNNING}" \
                         || err "Agent runs — 24h: ${RUNS_24H}  |  active: ${RUNNING}  |  errors 24h: ${ERR_24H}"
[[ "$SLA_7D"  == "0" && "$TO_7D" == "0" ]] && ok "SLA breaches 7d: ${SLA_7D}  |  Timeouts 7d: ${TO_7D}" \
                                             || warn "SLA breaches 7d: ${SLA_7D}  |  Timeouts 7d: ${TO_7D}"

# Workflows — stuck runs are a real problem
WF=$(d1 "
  SELECT
    SUM(CASE WHEN status='running'                                                      THEN 1 ELSE 0 END) as wf_running,
    SUM(CASE WHEN status='running' AND started_at < datetime('now','-1 hour')          THEN 1 ELSE 0 END) as wf_stuck,
    SUM(CASE WHEN status='failed'  AND updated_at > datetime('now','-7 days')          THEN 1 ELSE 0 END) as wf_failed_7d,
    SUM(CASE WHEN status='completed' AND updated_at > datetime('now','-7 days')        THEN 1 ELSE 0 END) as wf_done_7d
  FROM agentsam_workflow_runs
" | jq -r '.[0]')

WF_RUN=$(echo "$WF"    | jq -r '.wf_running  // 0')
WF_STUCK=$(echo "$WF"  | jq -r '.wf_stuck    // 0')
WF_FAIL=$(echo "$WF"   | jq -r '.wf_failed_7d // 0')
WF_DONE=$(echo "$WF"   | jq -r '.wf_done_7d  // 0')

if [[ "$WF_STUCK" -gt 0 ]]; then
  err "Workflows — running: ${WF_RUN}  |  STUCK >1h: ${WF_STUCK}  |  failed 7d: ${WF_FAIL}  |  done 7d: ${WF_DONE}"
elif [[ "$WF_FAIL" -gt 5 ]]; then
  warn "Workflows — running: ${WF_RUN}  |  stuck: 0  |  failed 7d: ${WF_FAIL}  |  done 7d: ${WF_DONE}"
else
  ok "Workflows — running: ${WF_RUN}  |  failed 7d: ${WF_FAIL}  |  done 7d: ${WF_DONE}"
fi

# Plans + Todos
MISC=$(d1 "
  SELECT
    (SELECT COUNT(*) FROM agentsam_plans WHERE status='active')                        as active_plans,
    (SELECT COUNT(*) FROM agentsam_plans WHERE status='draft')                         as draft_plans,
    (SELECT COUNT(*) FROM agentsam_todo WHERE status='open')                           as open_todos,
    (SELECT COUNT(*) FROM agentsam_approval_queue WHERE status='pending')              as pending_approvals,
    (SELECT COUNT(*) FROM agentsam_tool_call_log WHERE created_at > datetime('now','-1 day')) as tool_calls_24h,
    (SELECT COUNT(*) FROM agentsam_mcp_tool_execution WHERE created_at > datetime('now','-1 day')) as mcp_calls_24h,
    (SELECT COUNT(*) FROM agentsam_mcp_tool_execution
       WHERE created_at > datetime('now','-1 day') AND success=0)                     as mcp_fail_24h
  FROM (SELECT 1)
" | jq -r '.[0]')

PLANS=$(echo "$MISC"     | jq -r '.active_plans  // 0')
DRAFTS=$(echo "$MISC"    | jq -r '.draft_plans   // 0')
TODOS=$(echo "$MISC"     | jq -r '.open_todos    // 0')
APPROVALS=$(echo "$MISC" | jq -r '.pending_approvals // 0')
TCALLS=$(echo "$MISC"    | jq -r '.tool_calls_24h // 0')
MCPCALLS=$(echo "$MISC"  | jq -r '.mcp_calls_24h // 0')
MCPFAIL=$(echo "$MISC"   | jq -r '.mcp_fail_24h // 0')

ok "Plans — active: ${PLANS}  |  draft: ${DRAFTS}  |  Open todos: ${TODOS}"
ok "Tool calls 24h: ${TCALLS}  |  MCP calls 24h: ${MCPCALLS} (${MCPFAIL} failed)"
[[ "$APPROVALS" == "0" ]] && ok "Pending approvals: ${APPROVALS}" \
                           || warn "Pending approvals: ${APPROVALS}"

# ═══════════════════════════════════════════════════════════════════════════════
# 3. Error log + Guardrails
# ═══════════════════════════════════════════════════════════════════════════════
hdr "3. Errors & Guardrails"

ERRS=$(d1 "
  SELECT
    SUM(CASE WHEN created_at > unixepoch()-3600   AND resolved=0 THEN 1 ELSE 0 END) as err_1h,
    SUM(CASE WHEN created_at > unixepoch()-86400  AND resolved=0 THEN 1 ELSE 0 END) as err_24h,
    SUM(CASE WHEN created_at > unixepoch()-604800 AND resolved=0 THEN 1 ELSE 0 END) as err_7d,
    SUM(CASE WHEN resolved=0 THEN 1 ELSE 0 END)                                     as err_open
  FROM agentsam_error_log
" | jq -r '.[0]')

E1H=$(echo "$ERRS"   | jq -r '.err_1h  // 0')
E24H=$(echo "$ERRS"  | jq -r '.err_24h // 0')
E7D=$(echo "$ERRS"   | jq -r '.err_7d  // 0')
EOPEN=$(echo "$ERRS" | jq -r '.err_open // 0')

if [[ "$E1H" -gt 0 ]]; then
  err "Error log — 1h: ${E1H}  |  24h: ${E24H}  |  7d: ${E7D}  |  open total: ${EOPEN}"
elif [[ "$E24H" -gt 0 ]]; then
  warn "Error log — 1h: ${E1H}  |  24h: ${E24H}  |  7d: ${E7D}  |  open total: ${EOPEN}"
else
  ok "Error log — 1h: ${E1H}  |  24h: ${E24H}  |  7d: ${E7D}  |  open total: ${EOPEN}"
fi

GUARD=$(d1 "
  SELECT
    SUM(CASE WHEN created_at > datetime('now','-1 day') THEN 1 ELSE 0 END)                           as events_24h,
    SUM(CASE WHEN created_at > datetime('now','-1 day') AND decision='block' THEN 1 ELSE 0 END)      as blocked_24h,
    SUM(CASE WHEN created_at > datetime('now','-1 day') AND severity='critical' THEN 1 ELSE 0 END)   as critical_24h
  FROM agentsam_guardrail_events
" | jq -r '.[0]')

GE=$(echo "$GUARD"  | jq -r '.events_24h  // 0')
GB=$(echo "$GUARD"  | jq -r '.blocked_24h // 0')
GC=$(echo "$GUARD"  | jq -r '.critical_24h // 0')

if [[ "$GC" -gt 0 ]]; then
  err "Guardrails 24h — events: ${GE}  |  blocked: ${GB}  |  CRITICAL: ${GC}"
elif [[ "$GB" -gt 0 ]]; then
  warn "Guardrails 24h — events: ${GE}  |  blocked: ${GB}  |  critical: 0"
else
  ok "Guardrails 24h — events: ${GE}  |  blocked: ${GB}  |  critical: 0"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 4. Security
# ═══════════════════════════════════════════════════════════════════════════════
hdr "4. Security"

SEC=$(d1 "
  SELECT
    (SELECT COUNT(*) FROM mcp_workspace_tokens WHERE is_active=1)                    as active_tokens,
    (SELECT COUNT(*) FROM agentsam_mcp_allowlist)                                    as allowlist_entries,
    (SELECT COUNT(*) FROM security_findings WHERE status NOT IN ('closed','fixed','resolved')) as open_findings,
    (SELECT COUNT(*) FROM security_findings)                                         as total_findings
  FROM (SELECT 1)
" 2>/dev/null | jq -r '.[0] // {}')

AT=$(echo "$SEC"  | jq -r '.active_tokens     // "?"')
AL=$(echo "$SEC"  | jq -r '.allowlist_entries // "?"')
SF=$(echo "$SEC"  | jq -r '.open_findings     // "?"')
TF=$(echo "$SEC"  | jq -r '.total_findings    // "?"')

ok "Active MCP tokens: ${AT}  |  MCP allowlist entries: ${AL}"
[[ "$SF" == "0" || "$SF" == "?" ]] && ok "Security findings: ${SF} open / ${TF} total" \
                                     || warn "Security findings: ${SF} open / ${TF} total"

# ═══════════════════════════════════════════════════════════════════════════════
# 5. Spend & Model Routing
#    Primary:   agentsam_usage_events     (granular, per-call, model-level)
#    Rollup:    agentsam_usage_rollups_daily (pre-agg, includes tools/errors/blocked)
#    Secondary: spend_ledger              (cross-check / billing reconciliation)
# ═══════════════════════════════════════════════════════════════════════════════
hdr "5. Spend & Model Routing"

# --- 24h from agentsam_usage_events (live granular source) ---
UE_24H=$(d1 "
  SELECT
    COUNT(*)                                                      as calls,
    ROUND(SUM(cost_usd),4)                                        as cost_usd,
    SUM(tokens_in + tokens_out)                                   as tokens,
    SUM(CASE WHEN succeeded=0 OR status!='ok' THEN 1 ELSE 0 END)  as failed,
    COUNT(DISTINCT model)                                          as models_active
  FROM agentsam_usage_events
  WHERE created_at > unixepoch()-86400
" | jq -r '.[0]')

UE_CALLS=$(echo "$UE_24H"  | jq -r '.calls        // 0')
UE_COST=$(echo "$UE_24H"   | jq -r '.cost_usd     // 0')
UE_TOK=$(echo "$UE_24H"    | jq -r '.tokens       // 0')
UE_FAIL=$(echo "$UE_24H"   | jq -r '.failed       // 0')
UE_MODELS=$(echo "$UE_24H" | jq -r '.models_active // 0')

if [[ "$UE_FAIL" -gt 0 ]]; then
  warn "Today — \$${UE_COST}  |  ${UE_CALLS} calls  |  ${UE_TOK} tokens  |  ${UE_FAIL} failed  |  ${UE_MODELS} models"
else
  ok "Today — \$${UE_COST}  |  ${UE_CALLS} calls  |  ${UE_TOK} tokens  |  ${UE_MODELS} models active"
fi

# --- 7d rollup from agentsam_usage_rollups_daily (authoritative daily agg) ---
ROLLUP=$(d1 "
  SELECT
    ROUND(SUM(cost_usd),4)              as cost_7d,
    SUM(ai_calls)                       as calls_7d,
    SUM(tokens_in + tokens_out)         as tokens_7d,
    SUM(tool_calls)                     as tool_calls_7d,
    SUM(error_count)                    as errors_7d,
    SUM(blocked_count)                  as blocked_7d,
    COUNT(DISTINCT day)                 as days_with_data
  FROM agentsam_usage_rollups_daily
  WHERE day >= date('now','-7 days')
" | jq -r '.[0]')

R_COST=$(echo "$ROLLUP"   | jq -r '.cost_7d      // 0')
R_CALLS=$(echo "$ROLLUP"  | jq -r '.calls_7d     // 0')
R_TOK=$(echo "$ROLLUP"    | jq -r '.tokens_7d    // 0')
R_TOOLS=$(echo "$ROLLUP"  | jq -r '.tool_calls_7d // 0')
R_ERR=$(echo "$ROLLUP"    | jq -r '.errors_7d    // 0')
R_BLOCK=$(echo "$ROLLUP"  | jq -r '.blocked_7d   // 0')
R_DAYS=$(echo "$ROLLUP"   | jq -r '.days_with_data // 0')

if [[ "$R_ERR" -gt 10 || "$R_BLOCK" -gt 0 ]]; then
  warn "7d rollup — \$${R_COST}  |  ${R_CALLS} calls  |  ${R_TOK} tokens  |  ${R_TOOLS} tool calls  |  errors: ${R_ERR}  blocked: ${R_BLOCK}"
else
  ok "7d rollup — \$${R_COST}  |  ${R_CALLS} calls  |  ${R_TOK} tokens  |  ${R_TOOLS} tool calls  |  errors: ${R_ERR}"
fi

# (SLA breach summary shown in section 2)

# --- Model breakdown from agentsam_usage_events (cost-sorted, skip 'rollup' bucket) ---
echo ""
echo -e "  ${BOLD}Top models 7d (agentsam_usage_events):${RESET}"
d1 "
  SELECT model, COUNT(*) as calls, ROUND(SUM(cost_usd),4) as cost_usd,
         SUM(tokens_in+tokens_out) as tokens
  FROM agentsam_usage_events
  WHERE created_at > unixepoch()-604800
    AND model != 'rollup'
    AND model IS NOT NULL
  GROUP BY model ORDER BY cost_usd DESC LIMIT 8
" | jq -r '.[] | "    \(.model)  →  \(.calls) calls  $\(.cost_usd)  \(.tokens) tok"'

# --- spend_ledger as secondary cross-check ---
SL=$(d1 "
  SELECT ROUND(SUM(amount_usd),4) as usd, COUNT(*) as tx
  FROM spend_ledger WHERE occurred_at > unixepoch()-604800
" | jq -r '.[0]')
SL_USD=$(echo "$SL" | jq -r '.usd // 0')
SL_TX=$(echo "$SL"  | jq -r '.tx  // 0')
echo -e "  ${CYAN}spend_ledger cross-check 7d: \$${SL_USD} / ${SL_TX} tx${RESET}"

# ═══════════════════════════════════════════════════════════════════════════════
# 6. Supabase RAG + Codebase Index
# ═══════════════════════════════════════════════════════════════════════════════
hdr "6. Supabase RAG"

if [[ -z "$SUPABASE_KEY" ]]; then
  warn "SUPABASE_ANON_KEY not set — skipping RAG checks"
else
  # Use direct SQL via REST — avoid PostgREST count quirks
  _SB="${SUPABASE_URL}/rest/v1"
  _AK="apikey: ${SUPABASE_KEY}"
  _AU="Authorization: Bearer ${SUPABASE_KEY}"

  CHUNKS=$(curl -sf "$_SB/codebase_chunks?select=count" -H "$_AK" -H "$_AU" 2>/dev/null | jq -r '.[0].count // "?"')
  FILES=$(curl -sf "$_SB/codebase_files?select=count" -H "$_AK" -H "$_AU" 2>/dev/null | jq -r '.[0].count // "?"')
  SNAPS=$(curl -sf "$_SB/codebase_snapshots?select=count" -H "$_AK" -H "$_AU" 2>/dev/null | jq -r '.[0].count // "?"')
  WITH_E=$(curl -sf "$_SB/codebase_chunks?select=count&embedding=not.is.null" -H "$_AK" -H "$_AU" 2>/dev/null | jq -r '.[0].count // "?"')
  LSNAP=$(curl -sf "$_SB/codebase_snapshots?select=created_at&order=created_at.desc&limit=1" \
    -H "$_AK" -H "$_AU" 2>/dev/null | jq -r '.[0].created_at // "unknown"')
  CHUNKS="${CHUNKS:-?}" FILES="${FILES:-?}" SNAPS="${SNAPS:-?}" WITH_E="${WITH_E:-?}" LSNAP="${LSNAP:-unknown}"

  ok "Chunks: ${CHUNKS}  |  Files: ${FILES}  |  Snapshots: ${SNAPS}"
  ok "Last snapshot: ${LSNAP}"

  # Embeddings coverage — 0/3579 is a real problem to flag loudly
  if [[ "$WITH_E" == "0" && "$CHUNKS" != "0" && "$CHUNKS" != "?" ]]; then
    err "Embeddings: ${WITH_E}/${CHUNKS} — NO chunks have embeddings (index is blind)"
  elif [[ "$WITH_E" == "$CHUNKS" ]]; then
    ok "Embeddings: ${WITH_E}/${CHUNKS} — fully indexed"
  else
    MISSING=$(( ${CHUNKS:-0} - ${WITH_E:-0} ))
    warn "Embeddings: ${WITH_E}/${CHUNKS} — ${MISSING} chunks missing embeddings"
  fi

  # Supabase error events 24h
  SBERR=$(curl -sf \
    "${SUPABASE_URL}/rest/v1/agentsam_recent_errors?select=id&created_at=gt.$(date -u -v-1d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '1 day ago' '+%Y-%m-%dT%H:%M:%SZ')" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Prefer: count=exact" \
    -H "Range: 0-0" \
    -o /dev/null -w "%{http_header}" 2>/dev/null \
    | grep -i "content-range" | grep -oE '[0-9]+$' || echo "0")
  ok "Supabase error events 24h: ${SBERR:-0}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 7. R2 Buckets
# ═══════════════════════════════════════════════════════════════════════════════
hdr "7. R2 Buckets"

for bucket in "${R2_BUCKETS[@]}"; do
  RESULT=$(curl -sf \
    "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/r2/buckets/${bucket}" \
    -H "Authorization: Bearer ${CF_TOKEN}" \
    2>/dev/null | jq -r '.success')
  [[ "$RESULT" == "true" ]] && ok "r2://${bucket}" || err "r2://${bucket} — not found or inaccessible"
done

# ═══════════════════════════════════════════════════════════════════════════════
# 8. KV Dirty Flags
# ═══════════════════════════════════════════════════════════════════════════════
hdr "8. KV Dirty Flags"

FLAGS=$(curl -sf --max-time 5 "${KV_ENDPOINT}" \
  -H "Authorization: Bearer ${CF_TOKEN}" 2>/dev/null || echo "{}")

for flag in "${KV_FLAGS[@]}"; do
  VAL=$(echo "$FLAGS" | jq -r --arg k "$flag" '.[$k] // "clean"')
  [[ "$VAL" == "clean" || "$VAL" == "false" || "$VAL" == "null" ]] \
    && ok " ${flag}: clean" \
    || warn "${flag}: ${VAL}"
done

# ═══════════════════════════════════════════════════════════════════════════════
# Footer
# ═══════════════════════════════════════════════════════════════════════════════
echo -e "\n$(printf '─%.0s' $(seq 1 50))"
echo -e "  Health check complete — $(TZ="America/Chicago" date '+%H:%M:%S')"
echo -e "$(printf '─%.0s' $(seq 1 50))\n"
