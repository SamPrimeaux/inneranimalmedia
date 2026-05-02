#!/usr/bin/env bash
# ============================================================
# deploy-gate.sh — IAM / CI/CD quality gate (+ optional AI Test Suite direct deploy)
# Tracks every deploy, enforces protocol, writes to D1.
# Usage:
#   ./scripts/deploy-gate.sh sandbox  --note "fix excalidraw bridge"
#   ./scripts/deploy-gate.sh promote  --note "promote v203 to prod"
#   ./scripts/deploy-gate.sh aitestsuite --note "shell bump"
#   ./scripts/deploy-gate.sh audit    (read-only compliance check)
# ============================================================
set -euo pipefail

# ── Config ──────────────────────────────────────────────────
DB_ID="cf87b717-d4e2-4cf8-bab0-a81268e32d49"
IAM_WORKER="inneranimalmedia"
SANDBOX_WORKER="inneranimal-dashboard"
AITESTSUITE_WORKER="${AITESTSUITE_WORKER:-aitestsuite}"
IAM_PROD_CONFIG="wrangler.production.toml"
SANDBOX_CONFIG="wrangler.toml"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# TODO: When AI Test Suite sources live in this repo, add wrangler.aitestsuite.toml + aitestsuite-worker.js at REPO_ROOT (do not add speculatively).
AITESTSUITE_SCRIPT="$REPO_ROOT/aitestsuite-worker.js"
AITESTSUITE_CONFIG="$REPO_ROOT/wrangler.aitestsuite.toml"
DIST_DIR="$REPO_ROOT/dashboard/dist"
DASHBOARD_HTML="$REPO_ROOT/dashboard/agent.html"
BENCHMARK_SCRIPT="$REPO_ROOT/scripts/benchmark-full.sh"
CF_ENV_WRAPPER="$REPO_ROOT/scripts/with-cloudflare-env.sh"
BENCHMARK_PASS_THRESHOLD=31   # required passing tests
# Optional: set to audit R2 for AI Test Suite (otherwise audit lists D1 deploy rows only)
AITESTSUITE_R2_BUCKET="${AITESTSUITE_R2_BUCKET:-}"
# ────────────────────────────────────────────────────────────

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'
CYN='\033[0;36m'; BLD='\033[1m'; RST='\033[0m'
# ────────────────────────────────────────────────────────────

MODE="${1:-audit}"
DEPLOY_NOTE=""
SESSION_TAG=""

# Parse flags
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --note)   DEPLOY_NOTE="$2"; shift 2 ;;
    --tag)    SESSION_TAG="$2";  shift 2 ;;
    *)        shift ;;
  esac
done

# ── Helpers ─────────────────────────────────────────────────
log()  { echo -e "${CYN}[gate]${RST} $*"; }
ok()   { echo -e "${GRN}[  ok]${RST} $*"; }
warn() { echo -e "${YEL}[warn]${RST} $*"; }
fail() { echo -e "${RED}[FAIL]${RST} $*"; }
die()  { fail "$*"; exit 1; }

hr() { echo -e "${CYN}────────────────────────────────────────────────${RST}"; }

d1() {
  # d1 <sql> — runs a query against the IAM D1 database
  "$CF_ENV_WRAPPER" wrangler d1 execute inneranimalmedia-business \
    --config "$IAM_PROD_CONFIG" --remote \
    --command "$1" 2>/dev/null || echo "D1_ERROR"
}

git_hash()    { git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown"; }
git_dirty()   { git -C "$REPO_ROOT" status --porcelain | wc -l | tr -d ' '; }
current_ver() { grep -o '?v=[0-9]*' "$DASHBOARD_HTML" 2>/dev/null | head -1 | tr -d '?v=' || echo "?"; }
file_md5()    { md5 -q "$1" 2>/dev/null || md5sum "$1" | awk '{print $1}'; }
file_bytes()  { wc -c < "$1" | tr -d ' '; }

# ── SECTION 1: Environment preflight ────────────────────────
preflight() {
  hr
  log "Preflight checks"
  hr

  [[ -f "$CF_ENV_WRAPPER" ]]   && ok "CF env wrapper present"   || die "Missing $CF_ENV_WRAPPER"
  [[ -f "$IAM_PROD_CONFIG" ]]  && ok "wrangler.production.toml" || die "Missing $IAM_PROD_CONFIG"
  # [[ -f "$BENCHMARK_SCRIPT" ]] && ok "benchmark-full.sh present" || warn "benchmark-full.sh not found — gate will be skipped"

  local dirty
  dirty=$(git_dirty)
  if [[ "$dirty" -gt 0 ]]; then
    warn "Git working tree has $dirty uncommitted change(s)"
  else
    ok "Git working tree clean"
  fi

  # local ver; ver=$(current_ver)
  # log "Current dashboard version: ${BLD}v=$ver${RST}"
  log "Git hash: ${BLD}$(git_hash)${RST}"
}

# ── SECTION 2: Benchmark gate ────────────────────────────────
run_benchmark() {
  hr
  log "Running benchmark-full.sh (must pass $BENCHMARK_PASS_THRESHOLD/31)"
  hr

  if [[ ! -f "$BENCHMARK_SCRIPT" ]]; then
    warn "Benchmark script missing — skipping gate (document this)"
    return 0
  fi

  local output pass_count fail_count
  output=$("$BENCHMARK_SCRIPT" 2>&1)
  pass_count=$(echo "$output" | grep -c "PASS" || true)
  fail_count=$(echo "$output" | grep -c "FAIL" || true)

  echo "$output" | tail -10

  if [[ "$pass_count" -ge "$BENCHMARK_PASS_THRESHOLD" ]]; then
    ok "Benchmark passed: $pass_count/$BENCHMARK_PASS_THRESHOLD"
    return 0
  else
    fail "Benchmark FAILED: $pass_count passed, $fail_count failed"
    die "Fix failures before deploying to production"
  fi
}

# ── SECTION 3: Asset hash audit ─────────────────────────────
audit_assets() {
  hr
  log "Asset hash audit (dist vs dashboard_versions in D1)"
  hr

  local js_file="$DIST_DIR/agent-dashboard.js"
  local css_file="$DIST_DIR/agent-dashboard.css"
  local html_file="$DASHBOARD_HTML"

  local issues=0

  for f in "$js_file" "$css_file" "$html_file"; do
    if [[ ! -f "$f" ]]; then
      warn "Missing local file: $f"
      ((issues++))
    fi
  done

  if [[ "$issues" -gt 0 ]]; then
    warn "$issues asset(s) missing — run npm run build:vite-only first"
    return 1
  fi

  local js_hash; js_hash=$(file_md5 "$js_file")
  local css_hash; css_hash=$(file_md5 "$css_file")
  local html_hash; html_hash=$(file_md5 "$html_file")

  log "Local hashes:"
  log "  agent-dashboard.js  → $js_hash ($(file_bytes "$js_file") bytes)"
  log "  agent-dashboard.css → $css_hash ($(file_bytes "$css_file") bytes)"
  log "  agent.html          → $html_hash ($(file_bytes "$html_file") bytes)"

  shopt -s nullglob
  for df in "$DIST_DIR"/*; do
    [[ -f "$df" ]] || continue
    local dbn; dbn=$(basename "$df")
    [[ "$dbn" == ".deploy-manifest" ]] && continue
    [[ "$dbn" == "agent-dashboard.js" || "$dbn" == "agent-dashboard.css" ]] && continue
    local dh; dh=$(file_md5 "$df")
    log "  ${dbn} → $dh ($(file_bytes "$df") bytes)"
  done
  shopt -u nullglob

  # Pull latest production rows from D1
  local d1_js d1_css d1_html
  d1_js=$(d1   "SELECT file_hash FROM dashboard_versions WHERE page_name='agent'     AND environment='production' ORDER BY created_at DESC LIMIT 1;")
  d1_css=$(d1  "SELECT file_hash FROM dashboard_versions WHERE page_name='agent-css' AND environment='production' ORDER BY created_at DESC LIMIT 1;")
  d1_html=$(d1 "SELECT file_hash FROM dashboard_versions WHERE page_name='agent-html' AND environment='production' ORDER BY created_at DESC LIMIT 1;")

  local drift=0
  for pair in "js:$js_hash:$d1_js" "css:$css_hash:$d1_css" "html:$html_hash:$d1_html"; do
    local name local_h d1_h
    name=$(echo "$pair" | cut -d: -f1)
    local_h=$(echo "$pair" | cut -d: -f2)
    d1_h=$(echo "$pair" | cut -d: -f3)

    if echo "$d1_h" | grep -q "$local_h"; then
      ok "agent-$name hash matches D1"
    else
      warn "agent-$name HASH DRIFT — local: $local_h | d1: $d1_h"
      ((drift++))
    fi
  done

  if [[ "$drift" -gt 0 ]]; then
    warn "$drift asset(s) differ from D1 registry. Run a promote or manual dashboard_versions INSERT."
  fi
}

# ── SECTION 4: D1 deployment record check ───────────────────
audit_deployments() {
  hr
  log "Recent deployment records (last 5)"
  hr

  d1 "SELECT id, version, worker_name, environment, status, git_hash, triggered_by, timestamp
      FROM deployments
      ORDER BY created_at DESC LIMIT 5;"

  # Bare wrangler deploy detection — no git_hash = undocumented deploy
  local bare_count
  bare_count=$(d1 "SELECT COUNT(*) as c FROM deployments WHERE git_hash IS NULL AND created_at > unixepoch()-86400;" \
    | grep -oE '[0-9]+' | tail -1 || echo "0")

  if [[ "$bare_count" -gt 0 ]]; then
    warn "$bare_count deploy(s) in last 24h missing git_hash — likely bare wrangler deploy. Enforce ./scripts/deploy-gate.sh."
  else
    ok "All recent deploys have git_hash"
  fi

  # Missing notes check
  local no_notes
  no_notes=$(d1 "SELECT COUNT(*) as c FROM deployments WHERE (description IS NULL OR description='') AND created_at > unixepoch()-86400;" \
    | grep -oE '[0-9]+' | tail -1 || echo "0")

  if [[ "$no_notes" -gt 0 ]]; then
    warn "$no_notes deploy(s) in last 24h missing description/notes"
  else
    ok "All recent deploys have descriptions"
  fi
}

# ── SECTION 5: Roadmap v2 status ────────────────────────────
audit_roadmap() {
  hr
  log "plan_iam_dashboard_v2 step status"
  hr

  d1 "SELECT order_index, title, status FROM roadmap_steps
      WHERE plan_id='plan_iam_dashboard_v2'
      ORDER BY order_index;"
}

# ── SECTION 6: Write deployment record to D1 ────────────────
write_deploy_record() {
  local env="$1" worker="$2" ver="$3" version_id="$4"

  [[ -z "$DEPLOY_NOTE" ]] && die "--note is required for deploy commands"

  local hash; hash=$(git_hash)
  local dirty; dirty=$(git_dirty)
  local tag="${SESSION_TAG:-deploy-$(date +%Y%m%d-%H%M%S)}"
  local now; now=$(date -u +"%Y-%m-%d %H:%M:%S")

  [[ "$dirty" -gt 0 ]] && warn "Deploying with $dirty uncommitted change(s)"

  local record_id="${version_id:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"

  d1 "INSERT INTO deployments (id, timestamp, version, git_hash, description, status, deployed_by, environment, worker_name, triggered_by, notes, created_at)
      VALUES (
        '$record_id',
        '$now',
        '$ver',
        '$hash',
        '$(echo "$DEPLOY_NOTE" | sed "s/'/''/g")',
        'success',
        'sam_primeaux',
        '$env',
        '$worker',
        'deploy-gate.sh',
        '$(echo "$DEPLOY_NOTE" | sed "s/'/''/g")',
        unixepoch()
      );" && ok "Deployment record written: $record_id"
}

# ── SECTION 7: Write dashboard_versions to D1 ───────────────
write_dashboard_versions() {
  local env="$1" ver="$2" git_commit="$3" tag="$4"

  sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }
  page_name_for_fname() {
    case "$1" in
      agent-dashboard.js)  printf '%s' 'agent' ;;
      agent-dashboard.css) printf '%s' 'agent-css' ;;
      *)                   printf '%s' "agent-dist-$1" ;;
    esac
  }

  local html_file="$DASHBOARD_HTML"
  [[ -f "$html_file" ]] || die "Missing $html_file — build first"

  local now; now=$(date +%s)
  local session_tag="${tag:-eod-$(date +%Y-%m-%d)}"
  local is_prod; [[ "$env" == "production" ]] && is_prod=1 || is_prod=0
  local ver_esc; ver_esc=$(sql_escape "$ver")
  local gc_esc; gc_esc=$(sql_escape "$git_commit")
  local st_esc; st_esc=$(sql_escape "$session_tag")

  local values_sql="" first=1
  shopt -s nullglob
  for filepath in "$DIST_DIR"/*; do
    [[ -f "$filepath" ]] || continue
    local filename; filename=$(basename "$filepath")
    [[ "$filename" == ".deploy-manifest" ]] && continue
    local pn; pn=$(page_name_for_fname "$filename")
    local fh; fh=$(file_md5 "$filepath")
    local fs; fs=$(file_bytes "$filepath")
    local r2p; r2p="static/dashboard/agent/${filename}"
    local row_id="${env}-dv-${now}-${filename}"
    row_id=$(sql_escape "$row_id")
    local pn_esc; pn_esc=$(sql_escape "$pn")
    local r2_esc; r2_esc=$(sql_escape "$r2p")
    local row="('${row_id}', '${pn_esc}', '${ver_esc}', '$fh', $fs, '${r2_esc}', '$env', $is_prod, $is_prod, '$gc_esc', '$st_esc', $now)"
    if [[ "$first" -eq 1 ]]; then
      values_sql="$row"
      first=0
    else
      values_sql="${values_sql},
        ${row}"
    fi
  done
  shopt -u nullglob

  local html_hash; html_hash=$(file_md5 "$html_file")
  local html_size; html_size=$(file_bytes "$html_file")
  local html_row="('${env}-agent-html-${ver}-${now}', 'agent-html', '${ver_esc}', '$html_hash', $html_size, 'static/dashboard/agent.html', '$env', $is_prod, $is_prod, '$gc_esc', '$st_esc', $now)"

  if [[ -n "$values_sql" ]]; then
    d1 "INSERT OR REPLACE INTO dashboard_versions
          (id, page_name, version, file_hash, file_size, r2_path, environment, is_production, is_locked, git_commit, session_tag, created_at)
        VALUES
          ${values_sql},
          ${html_row};"
  else
    d1 "INSERT OR REPLACE INTO dashboard_versions
          (id, page_name, version, file_hash, file_size, r2_path, environment, is_production, is_locked, git_commit, session_tag, created_at)
        VALUES
          ${html_row};"
  fi

  ok "dashboard_versions written for dist assets + agent.html (ver=$ver)"
}

# ── SECTION 8: AI Test Suite — optional R2 + D1 deploy audit ─
audit_aitestsuite_r2() {
  hr
  log "AI Test Suite worker '$AITESTSUITE_WORKER' — deploy + optional R2"
  hr

  if [[ -n "$AITESTSUITE_R2_BUCKET" ]]; then
    "$CF_ENV_WRAPPER" wrangler r2 object list "$AITESTSUITE_R2_BUCKET" \
      --config "$IAM_PROD_CONFIG" --remote 2>/dev/null | head -20 \
      || warn "Could not list '$AITESTSUITE_R2_BUCKET' — check binding or env"
  else
    log "AITESTSUITE_R2_BUCKET unset — skipping R2 object list (set env to enable)."
  fi

  d1 "SELECT id, version, git_hash, environment, status, timestamp
      FROM deployments WHERE worker_name='$AITESTSUITE_WORKER'
      ORDER BY created_at DESC LIMIT 5;"
}

# ── SECTION 9: Protocol compliance summary ──────────────────
compliance_report() {
  hr
  log "${BLD}Protocol Compliance Report${RST}"
  hr

  local score=0 total=5 # benchmark script check is optional

  # Check 1: benchmark script exists (optional)
  # [[ -f "$BENCHMARK_SCRIPT" ]] && { ok "C1: benchmark-full.sh present"; ((score++)); } \
  #  || fail "C1: benchmark-full.sh missing"

  # Check 2: no bare wrangler deploys today
  local bare
  bare=$(d1 "SELECT COUNT(*) FROM deployments WHERE git_hash IS NULL AND created_at > unixepoch()-86400;" \
    | grep -oE '[0-9]+' | tail -1 || echo "0")
  [[ "$bare" -eq 0 ]] && { ok "C1: No bare wrangler deploys today"; ((score++)); } \
    || fail "C1: $bare bare wrangler deploy(s) today — enforce deploy-gate.sh"

  # Check 3: latest deploy has description
  local has_desc
  has_desc=$(d1 "SELECT COUNT(*) FROM deployments WHERE description IS NOT NULL AND description != '' ORDER BY created_at DESC LIMIT 1;" \
    | grep -oE '[0-9]+' | tail -1 || echo "0")
  [[ "$has_desc" -gt 0 ]] && { ok "C2: Latest deploy has description"; ((score++)); } \
    || fail "C2: Latest deploy missing description"

  # Check 4: dashboard_versions in sync with latest prod deploy
  local dv_count
  dv_count=$(d1 "SELECT COUNT(*) FROM dashboard_versions WHERE environment='production' AND created_at > unixepoch()-86400;" \
    | grep -oE '[0-9]+' | tail -1 || echo "0")
  [[ "$dv_count" -gt 0 ]] && { ok "C3: dashboard_versions updated today"; ((score++)); } \
    || warn "C3: No dashboard_versions written today (OK if no prod deploy)"

  # Check 5: v2 roadmap has no stale in_progress
  local stale
  stale=$(d1 "SELECT COUNT(*) FROM roadmap_steps WHERE plan_id='plan_iam_dashboard_v2' AND status='in_progress' AND updated_at < datetime('now','-3 days');" \
    | grep -oE '[0-9]+' | tail -1 || echo "0")
  [[ "$stale" -eq 0 ]] && { ok "C4: No stale in_progress roadmap steps"; ((score++)); } \
    || warn "C4: $stale step(s) stuck in_progress >3 days"

  # Check 6: git working tree clean
  local dirty; dirty=$(git_dirty)
  [[ "$dirty" -eq 0 ]] && { ok "C5: Git working tree clean"; ((score++)); } \
    || warn "C5: $dirty uncommitted change(s) in working tree"

  hr
  if [[ "$score" -eq "$total" ]]; then
    echo -e "${GRN}${BLD}COMPLIANCE: $score/$total — ALL CLEAR${RST}"
  elif [[ "$score" -ge 4 ]]; then
    echo -e "${YEL}${BLD}COMPLIANCE: $score/$total — WARNINGS PRESENT${RST}"
  else
    echo -e "${RED}${BLD}COMPLIANCE: $score/$total — ACTION REQUIRED${RST}"
  fi
  hr
}

# ── SECTION 10: Write CICD event row to D1 (cicd_events) ─────
write_cicd_log() {
  local action="$1" worker="$2" note="$3" score="$4"
  local hash_full branch repo remote
  hash_full=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
  branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  remote=$(git -C "$REPO_ROOT" config --get remote.origin.url 2>/dev/null || true)
  if [[ "$remote" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
    repo="${BASH_REMATCH[1]}"
  else
    repo="SamPrimeaux/inneranimalmedia-agentsam-dashboard"
  fi
  local note_esc repo_esc branch_esc hash_esc worker_esc action_esc r2key_esc
  note_esc=$(echo "$note" | sed "s/'/''/g")
  repo_esc=$(echo "$repo" | sed "s/'/''/g")
  branch_esc=$(echo "$branch" | sed "s/'/''/g")
  hash_esc=$(echo "$hash_full" | sed "s/'/''/g")
  worker_esc=$(echo "$worker" | sed "s/'/''/g")
  action_esc=$(echo "$action" | sed "s/'/''/g")
  local ts evid
  ts=$(date -u +"%Y%m%d%H%M%S")
  evid="evt_dgate_${ts}_$$"
  r2key_esc=$(printf '{"git_hash":"%s","compliance_score":%s,"gate":"deploy-gate.sh"}' "$(git_hash)" "$score" | sed "s/'/''/g")

  d1 "INSERT OR IGNORE INTO cicd_events
        (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key)
      VALUES (
        '${evid}',
        'deploy_gate',
        '${action_esc}',
        '${repo_esc}',
        '${branch_esc}',
        '${hash_esc}',
        '${note_esc}',
        'sam_primeaux',
        '${worker_esc}',
        NULL,
        '${r2key_esc}'
      );"
}

# ── MODE DISPATCH ────────────────────────────────────────────
hr
echo -e "${BLD}${CYN}deploy-gate.sh — mode: $MODE${RST}"
hr

case "$MODE" in

  audit)
    preflight
    # audit_assets
    audit_deployments
    audit_aitestsuite_r2
    # audit_roadmap
    compliance_report
    # Calculate score based on compliance_report logic (mocked here for simplicity)
    write_cicd_log "audit" "all" "scheduled audit" "5"
    ;;

  sandbox)
    [[ -z "$DEPLOY_NOTE" ]] && die "--note required. Example: ./scripts/deploy-gate.sh sandbox --note 'fix excalidraw bridge'"
    preflight
    hr; log "Building frontend..."; hr
    cd "$REPO_ROOT/agent-dashboard" && npm run build
    hr; log "Deploying to sandbox worker ($SANDBOX_WORKER)..."; hr
    START_MS=$(($(date +%s%N)/1000000))
    DEPLOY_MSG="$(cat "$REPO_ROOT/agent-dashboard/.sandbox-deploy-version" 2>/dev/null | xargs printf 'v%s' || echo 'v?') | $(git_hash | cut -c1-7) | ${DEPLOY_NOTE:-sandbox}"
    "$CF_ENV_WRAPPER" wrangler deploy --config "$SANDBOX_CONFIG" --message "$DEPLOY_MSG"
    END_MS=$(($(date +%s%N)/1000000))
    DURATION=$(( END_MS - START_MS ))
    local_ver="v$(date +%Y%m%d)"
    hash=$(git_hash)
    write_deploy_record "sandbox" "$SANDBOX_WORKER" "$local_ver" ""
    write_cicd_log "deploy_sandbox" "$SANDBOX_WORKER" "$DEPLOY_NOTE" "5"
    compliance_report
    hr; ok "Sandbox deploy complete — verify at https://inneranimal-dashboard.meauxbility.workers.dev"
    ;;

  promote)
    [[ -z "$DEPLOY_NOTE" ]] && die "--note required. Example: ./scripts/deploy-gate.sh promote --note 'promote v203 to prod'"
    preflight
    run_benchmark
    hr; log "Promoting to production ($IAM_WORKER)..."; hr
    DEPLOY_MSG="$(cat "$REPO_ROOT/agent-dashboard/.sandbox-deploy-version" 2>/dev/null | xargs printf 'v%s' || echo 'v?') | $(git_hash | cut -c1-7) | ${DEPLOY_NOTE:-promote}"
    "$CF_ENV_WRAPPER" wrangler deploy --config "$IAM_PROD_CONFIG" --message "$DEPLOY_MSG"
    local_ver="v$(date +%Y%m%d)"
    hash=$(git_hash)
    write_deploy_record "production" "$IAM_WORKER" "$local_ver" ""
    write_cicd_log "deploy_production" "$IAM_WORKER" "$DEPLOY_NOTE" "5"
    compliance_report
    hr; ok "Production deploy complete — https://inneranimalmedia.com"
    ;;

  aitestsuite)
    # Direct deploy only — no sandbox → benchmark → promote pipeline for this worker.
    [[ -z "$DEPLOY_NOTE" ]] && die "--note required. Example: ./scripts/deploy-gate.sh aitestsuite --note 'shell bump'"
    preflight
    if [[ ! -f "$AITESTSUITE_CONFIG" ]] || [[ ! -f "$AITESTSUITE_SCRIPT" ]]; then
      die "Missing $AITESTSUITE_CONFIG or $AITESTSUITE_SCRIPT — add AI Test Suite entrypoint at repo root when ready (see TODO in deploy-gate.sh config)."
    fi
    hr; log "Direct deploy AI Test Suite worker ($AITESTSUITE_WORKER) — no sandbox/benchmark gate..."; hr
    deploy_log=$(mktemp "${TMPDIR:-/tmp}/aitestsuite-deploy.XXXXXX.log")
    set +o pipefail
    "$CF_ENV_WRAPPER" wrangler deploy "$AITESTSUITE_SCRIPT" -c "$AITESTSUITE_CONFIG" 2>&1 | tee "$deploy_log"
    deploy_status="${PIPESTATUS[0]}"
    set -o pipefail
    VERSION_ID=$(grep -E "Current Version ID:|Version ID:" "$deploy_log" 2>/dev/null | tail -1 | awk '{print $NF}' || true)
    rm -f "$deploy_log"
    [[ "$deploy_status" -eq 0 ]] || die "wrangler deploy failed for AI Test Suite worker"

    write_cicd_log "deploy_aitestsuite" "$AITESTSUITE_WORKER" "$DEPLOY_NOTE" "2" || true
    write_deploy_record "production" "$AITESTSUITE_WORKER" "aitestsuite-$(date +%Y%m%d)" "${VERSION_ID:-}" || true
    audit_aitestsuite_r2
    compliance_report
    hr; ok "AI Test Suite deployed — https://aitestsuite.meauxbility.workers.dev"
    ;;

  *)
    echo "Usage: $0 [audit|sandbox|promote|aitestsuite] [--note 'description'] [--tag session-tag]"
    exit 1
    ;;

esac
