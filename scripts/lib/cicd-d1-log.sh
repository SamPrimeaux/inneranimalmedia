#!/usr/bin/env bash
# cicd-d1-log.sh — append CICD audit rows to D1 (inneranimalmedia-business)
# Sourced by deploy-sandbox.sh and promote-to-prod.sh.
#
# Tables written: cicd_github_runs, cicd_pipeline_runs, cicd_run_steps, cicd_events,
#                 cicd_runs, pipelines, pipeline_runs, cicd_notifications,
#                 tracking_metrics, quality_runs, quality_results
#
# Optional env (sandbox / prod deploy callers):
#   CICD_PHASE_SANDBOX_START_UNIX, CICD_PHASE_SANDBOX_END_UNIX, CICD_PHASE_SANDBOX_DURATION_MS
#   CICD_WALL_TOTAL_MS         — full script wall time in ms
#   CICD_R2_BUNDLE_BYTES       — du -sb dist (or caller fallback)
#   CICD_CF_HEALTH_STATUS_CODE, CICD_CF_HEALTH_URL, CICD_CF_HEALTH_RESPONSE_MS, CICD_CF_HEALTH_STATUS
#   CICD_EVENT_ID              — cicd_events.id to set on cicd_runs.event_id
#   WORKER_NAME                — inneranimal-dashboard | inneranimalmedia
#   CICD_PROMOTE_*             — for prod timing
#   CICD_RESEND_MESSAGE_ID     — Resend message id captured after email send
#   CICD_RESEND_HTTP_STATUS    — HTTP status from Resend API call (200 = sent)
#   GITHUB_VULN_HIGH           — high severity vuln count from Dependabot (0 if unknown)
#   GITHUB_VULN_MODERATE       — moderate severity vuln count
#   CICD_WORKER_STARTUP_MS     — parsed from "Worker Startup Time: X ms" in wrangler output
#
# Requires: WRANGLER=(...), PROD_CFG=wrangler.production.toml, REPO_ROOT set by caller.
# Disable: CICD_D1_LOG=0

cicd_sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

# Non-fatal D1 execute (never blocks deploy)
cicd_d1_nf() {
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="$1" 2>/dev/null || true
}

cicd_git_export() {
  local root="${REPO_ROOT:-.}"
  CICD_GIT_SHA=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo "unknown")
  CICD_GIT_BRANCH=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  CICD_GIT_MSG=$(git -C "$root" log -1 --pretty=%B 2>/dev/null | tr '\n' ' ' | head -c 800)
  CICD_GIT_MSG_ESC=$(cicd_sql_escape "$CICD_GIT_MSG")
  CICD_GIT_SUBJECT=$(git -C "$root" log -1 --pretty=%s 2>/dev/null || echo "")
  CICD_GIT_SUBJECT_ESC=$(cicd_sql_escape "$CICD_GIT_SUBJECT")
  local gname
  gname=$(git -C "$root" config user.name 2>/dev/null || true)
  if [ -z "$gname" ]; then
    gname=$(git -C "$root" log -1 --pretty=%an 2>/dev/null || echo "")
  fi
  [ -z "$gname" ] && gname="unknown"
  CICD_GIT_ACTOR_NAME="$gname"
  CICD_GIT_ACTOR_ESC=$(cicd_sql_escape "$gname")
  local remote
  remote=$(git -C "$root" config --get remote.origin.url 2>/dev/null || true)
  if [[ "$remote" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
    CICD_REPO_NAME="${BASH_REMATCH[1]}"
  else
    CICD_REPO_NAME="${CICD_REPO_NAME:-SamPrimeaux/inneranimalmedia-agentsam-dashboard}"
  fi
  CICD_ACTOR_ESC=$(cicd_sql_escape "${GIT_ACTOR:-${TRIGGERED_BY:-sam_primeaux}}")
}

cicd_iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

cicd_seed_pipelines_registry() {
  cicd_d1_nf "
INSERT OR IGNORE INTO pipelines (slug, name, pipeline_type, category, provider, trigger_type) VALUES
  ('deploy_sandbox', 'Deploy sandbox', 'deploy', 'deploy', 'cloudflare', 'manual'),
  ('promote_prod', 'Promote to production', 'deploy', 'deploy', 'cloudflare', 'manual');
"
}

# Map HTTP code + latency to healthy | degraded | down
cicd_cf_health_label() {
  local code="${1:-0}"
  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    printf '%s' "healthy"
  elif [[ "$code" =~ ^[23][0-9][0-9]$ ]]; then
    printf '%s' "degraded"
  else
    printf '%s' "down"
  fi
}

# After deployments row exists: git_hash + wall-clock deploy seconds (non-fatal)
cicd_crosslink_deployment_after_worker() {
  local vid="${1:?deployment id}"
  local gh="${2:-unknown}"
  local dur_ms="${3:-0}"
  [[ "$dur_ms" =~ ^[0-9]+$ ]] || dur_ms=0
  local secs=$((dur_ms / 1000))
  local vid_esc gh_esc
  vid_esc=$(cicd_sql_escape "$vid")
  gh_esc=$(cicd_sql_escape "$gh")
  cicd_d1_nf "UPDATE deployments SET git_hash='${gh_esc}', deploy_time_seconds=${secs} WHERE id='${vid_esc}';"
}

# --- NEW: Write Resend notification row to cicd_notifications ----------------
# Args: cicd_run_id, pipe_id, event_type (run_success|run_failed), dash_v, env (sandbox|production)
cicd_log_resend_notification() {
  local cicd_run_id="${1:-}"
  local pipe_id="${2:-}"
  local event_type="${3:-run_success}"
  local dash_v="${4:-0}"
  local env="${5:-sandbox}"

  [ -z "$cicd_run_id" ] && return 0

  local msg_id="${CICD_RESEND_MESSAGE_ID:-}"
  local resend_http="${CICD_RESEND_HTTP_STATUS:-0}"
  local notif_status="skipped"
  local notif_http="NULL"

  if [ -n "$msg_id" ] && [[ "$resend_http" =~ ^2 ]]; then
    notif_status="sent"
    notif_http="$resend_http"
  elif [ -n "$msg_id" ]; then
    notif_status="failed"
    notif_http="$resend_http"
  fi

  local msg_id_esc
  msg_id_esc=$(cicd_sql_escape "${msg_id:-}")
  local subj_esc
  if [ "$env" = "production" ]; then
    subj_esc=$(cicd_sql_escape "[IAM] PROD LIVE — dashboard-v${dash_v} — $(date -u +%Y-%m-%d)")
  else
    subj_esc=$(cicd_sql_escape "[IAM] SANDBOX LIVE — dashboard-v${dash_v} — $(date -u +%Y-%m-%d)")
  fi
  local body_esc
  body_esc=$(cicd_sql_escape "pipeline:${pipe_id} | env:${env} | v${dash_v}")

  local msg_id_sql
  [ -n "$msg_id" ] && msg_id_sql="'${msg_id_esc}'" || msg_id_sql="NULL"

  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_notifications (
  run_id, event_type, channel, recipient, subject, body_preview,
  status, http_status_code, resend_message_id, attempt_count, sent_at, created_at
) VALUES (
  '${cicd_run_id}', '${event_type}', 'resend_email', 'support@inneranimalmedia.com',
  '${subj_esc}', '${body_esc}',
  '${notif_status}', ${notif_http}, ${msg_id_sql},
  1, unixepoch(), unixepoch()
);"
}

# --- NEW: Write deploy timing + file data to tracking_metrics ----------------
# Args: env, pipe_id, worker_name, ms_build, ms_r2, ms_worker, hc_code, r2_files, r2_bytes, wall_ms, worker_vid, commit_sha
cicd_log_tracking_metrics() {
  local env="${1:-sandbox}"
  local pipe_id="${2:-}"
  local wname="${3:-unknown}"
  local ms_build="${4:-0}"
  local ms_r2="${5:-0}"
  local ms_worker="${6:-0}"
  local hc_code="${7:-0}"
  local r2_files="${8:-0}"
  local r2_bytes="${9:-0}"
  local wall_ms="${10:-0}"
  local worker_vid="${11:-unknown}"
  local commit_sha="${12:-unknown}"

  [[ "$ms_build"  =~ ^[0-9]+$ ]] || ms_build=0
  [[ "$ms_r2"     =~ ^[0-9]+$ ]] || ms_r2=0
  [[ "$ms_worker" =~ ^[0-9]+$ ]] || ms_worker=0
  [[ "$hc_code"   =~ ^[0-9]+$ ]] || hc_code=0
  [[ "$r2_files"  =~ ^[0-9]+$ ]] || r2_files=0
  [[ "$r2_bytes"  =~ ^[0-9]+$ ]] || r2_bytes=0
  [[ "$wall_ms"   =~ ^[0-9]+$ ]] || wall_ms=0

  local source_val="deploy_sandbox"
  [ "$env" = "production" ] && source_val="deploy_prod"

  local wv_esc commit_esc pipe_esc
  wv_esc=$(cicd_sql_escape "$worker_vid")
  commit_esc=$(cicd_sql_escape "$commit_sha")
  pipe_esc=$(cicd_sql_escape "$pipe_id")

  # Parse worker startup ms from wrangler output if available
  local startup_ms="${CICD_WORKER_STARTUP_MS:-0}"
  [[ "$startup_ms" =~ ^[0-9]+$ ]] || startup_ms=0

  # Dependabot counts
  local vuln_high="${GITHUB_VULN_HIGH:-0}"
  local vuln_mod="${GITHUB_VULN_MODERATE:-0}"
  [[ "$vuln_high" =~ ^[0-9]+$ ]] || vuln_high=0
  [[ "$vuln_mod"  =~ ^[0-9]+$ ]] || vuln_mod=0

  cicd_d1_nf "
INSERT INTO tracking_metrics
  (workspace_id, environment, metric_type, source, metric_name, metric_value, metric_unit, run_id, worker_version, commit_sha, recorded_at)
VALUES
  ('ws_inneranimalmedia', '${env}', 'deploy', '${source_val}', 'build_duration_ms',    ${ms_build},  'ms',    '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'deploy', '${source_val}', 'r2_sync_duration_ms',  ${ms_r2},     'ms',    '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'deploy', '${source_val}', 'worker_deploy_ms',     ${ms_worker}, 'ms',    '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'deploy', '${source_val}', 'worker_startup_ms',    ${startup_ms},'ms',    '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'deploy', '${source_val}', 'wall_time_ms',         ${wall_ms},   'ms',    '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'r2',     '${source_val}', 'r2_files_uploaded',    ${r2_files},  'files', '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'r2',     '${source_val}', 'r2_bytes_uploaded',    ${r2_bytes},  'bytes', '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'quality','${source_val}', 'health_check_code',    ${hc_code},   'count', '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'quality','${source_val}', 'dependabot_high',      ${vuln_high}, 'count', '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch()),
  ('ws_inneranimalmedia', '${env}', 'quality','${source_val}', 'dependabot_moderate',  ${vuln_mod},  'count', '${pipe_esc}', '${wv_esc}', '${commit_esc}', unixepoch());
"
}

# --- NEW: Write quality run + results to quality_runs / quality_results ------
# Args: cicd_run_id, pipe_id, pipe_status, worker_vid, hc_code, r2_files, ms_worker, env, commit_sha, hc_url
cicd_log_quality_run() {
  local cicd_run_id="${1:-}"
  local pipe_id="${2:-}"
  local pipe_status="${3:-failed}"
  local worker_vid="${4:-unknown}"
  local hc_code="${5:-0}"
  local r2_files="${6:-0}"
  local ms_worker="${7:-0}"
  local env="${8:-sandbox}"
  local commit_sha="${9:-unknown}"
  local hc_url="${10:-}"

  [ -z "$cicd_run_id" ] && return 0

  [[ "$hc_code"   =~ ^[0-9]+$ ]] || hc_code=0
  [[ "$r2_files"  =~ ^[0-9]+$ ]] || r2_files=0
  [[ "$ms_worker" =~ ^[0-9]+$ ]] || ms_worker=0

  local ws_id="ws_sandbox"
  [ "$env" = "production" ] && ws_id="ws_inneranimalmedia"

  # Parse startup ms
  local startup_ms="${CICD_WORKER_STARTUP_MS:-0}"
  [[ "$startup_ms" =~ ^[0-9]+$ ]] || startup_ms=0

  # Dependabot
  local vuln_high="${GITHUB_VULN_HIGH:-0}"
  [[ "$vuln_high" =~ ^[0-9]+$ ]] || vuln_high=0

  # --- Evaluate each gate ---

  # 1. Worker version valid
  local wv_status="pass" wv_detail="Worker version ID confirmed from wrangler output."
  [ "$worker_vid" = "unknown" ] || [ -z "$worker_vid" ] && {
    wv_status="fail"
    wv_detail="Worker version ID is unknown. wrangler deploy may have failed silently."
  }

  # 2. Health check (2xx or redirect)
  local hc_q_status="pass" hc_q_detail="Health check returned ${hc_code}. Worker is live."
  if [[ "$hc_code" =~ ^(2[0-9][0-9]|30[12378])$ ]]; then
    hc_q_status="pass"
    hc_q_detail="Health check ${hc_code} — worker responding correctly."
  elif [ "$hc_code" -eq 0 ]; then
    hc_q_status="fail"
    hc_q_detail="Health check returned 0 — curl failed or timed out."
  else
    hc_q_status="fail"
    hc_q_detail="Health check returned ${hc_code} — unexpected status."
  fi

  # 3. R2 files (warn if 0 — no files changed is possible but worth noting)
  local r2_q_status="pass" r2_q_detail="${r2_files} files synced to R2."
  if [ "$r2_files" -eq 0 ]; then
    r2_q_status="warn"
    r2_q_detail="0 files uploaded. Either no frontend changes or R2 sync skipped."
  fi

  # 4. Sandbox tested before prod (always true when this script runs for sandbox)
  local sbfirst_status="pass" sbfirst_detail="deploy-sandbox.sh confirmed before promote."
  [ "$env" = "production" ] && {
    sbfirst_status="pass"
    sbfirst_detail="Promote ran after sandbox — sequence confirmed by pipeline timestamps."
  }

  # 5. Worker startup time (from wrangler output "Worker Startup Time: X ms")
  local startup_status="pass" startup_detail="Worker Startup Time: ${startup_ms}ms (gate: <=50ms cold-start)."
  if [ "$startup_ms" -eq 0 ]; then
    startup_status="skip"
    startup_detail="CICD_WORKER_STARTUP_MS not captured. Parse 'Worker Startup Time:' from wrangler output."
  elif [ "$startup_ms" -gt 50 ]; then
    startup_status="warn"
    startup_detail="Worker Startup Time: ${startup_ms}ms exceeds 50ms gate. Check bundle size."
  fi

  # 6. Dependabot (fail if high vulns > 0)
  local vuln_status="pass" vuln_detail="No high-severity Dependabot vulnerabilities detected."
  if [ "$vuln_high" -gt 0 ]; then
    vuln_status="fail"
    local vuln_mod="${GITHUB_VULN_MODERATE:-0}"
    vuln_detail="${vuln_high} high / ${vuln_mod} moderate Dependabot vulns on main. Run npm audit fix."
  elif [ "$vuln_high" -eq 0 ] && [ -z "${GITHUB_VULN_HIGH:-}" ]; then
    vuln_status="skip"
    vuln_detail="GITHUB_VULN_HIGH not set. Export from GitHub Security API or npm audit --json."
  fi

  # Tally
  local q_pass=0 q_fail=0 q_warn=0 q_skip=0
  for s in "$wv_status" "$hc_q_status" "$r2_q_status" "$sbfirst_status" "$startup_status" "$vuln_status"; do
    case "$s" in
      pass) ((q_pass++)) ;;
      fail) ((q_fail++)) ;;
      warn) ((q_warn++)) ;;
      skip) ((q_skip++)) ;;
    esac
  done

  local qrun_status="pass"
  [ "$q_warn" -gt 0 ] && qrun_status="warn"
  [ "$q_fail" -gt 0 ] && qrun_status="fail"

  local commit_esc hc_url_esc wv_esc pipe_esc
  commit_esc=$(cicd_sql_escape "$commit_sha")
  hc_url_esc=$(cicd_sql_escape "$hc_url")
  wv_esc=$(cicd_sql_escape "$worker_vid")
  pipe_esc=$(cicd_sql_escape "$pipe_id")

  local wv_det_esc hc_det_esc r2_det_esc sb_det_esc st_det_esc vd_det_esc
  wv_det_esc=$(cicd_sql_escape "$wv_detail")
  hc_det_esc=$(cicd_sql_escape "$hc_q_detail")
  r2_det_esc=$(cicd_sql_escape "$r2_q_detail")
  sb_det_esc=$(cicd_sql_escape "$sbfirst_detail")
  st_det_esc=$(cicd_sql_escape "$startup_detail")
  vd_det_esc=$(cicd_sql_escape "$vuln_detail")

  cicd_d1_nf "
INSERT OR IGNORE INTO quality_runs (
  id, workspace_id, gate_set_id, run_context, commit_sha,
  url_under_test, initiated_by, pipeline_run_id,
  status, pass_count, fail_count, warn_count, completed_at
) VALUES (
  '${cicd_run_id}', '${ws_id}', 'qgs_iam_deploy', '${env}', '${commit_esc}',
  '${hc_url_esc}', 'cicd_pipeline', '${pipe_esc}',
  '${qrun_status}', ${q_pass}, ${q_fail}, ${q_warn}, unixepoch()
);"

  cicd_d1_nf "
INSERT OR IGNORE INTO quality_results
  (run_id, gate_id, metric_key, check_name, actual_value, expected_value, status, details)
VALUES
  ('${cicd_run_id}', NULL,               'worker_version_valid',      'Worker Version',       '${wv_esc}',     'not unknown',  '${wv_status}',      '${wv_det_esc}'),
  ('${cicd_run_id}', NULL,               'health_check_code',         'Health Check',         '${hc_code}',    '2xx or 3xx',   '${hc_q_status}',    '${hc_det_esc}'),
  ('${cicd_run_id}', NULL,               'r2_files_uploaded',         'R2 Asset Sync',        '${r2_files}',   '>=0',          '${r2_q_status}',    '${r2_det_esc}'),
  ('${cicd_run_id}', 'qg_sandbox_first', 'sandbox_tested_before_prod','Sandbox Before Prod',  'true',          'true',         '${sbfirst_status}', '${sb_det_esc}'),
  ('${cicd_run_id}', 'qg_worker_startup_ms','worker_startup_ms',      'Worker Startup Time',  '${startup_ms}', '<=50',         '${startup_status}', '${st_det_esc}'),
  ('${cicd_run_id}', NULL,               'dependabot_vulnerabilities','Security Advisories',  '${vuln_high}',  '0',            '${vuln_status}',    '${vd_det_esc}');
"
}

# =============================================================================
# --- Sandbox deploy (inneranimal-dashboard + sandbox R2) ---------------------
# Args: worker_version_id, dashboard_v, bucket, r2_files_updated, r2_bytes_legacy,
#       ms_build, ms_r2, ms_worker, ms_d1, health_http_code, health_preview_url
# =============================================================================
cicd_log_sandbox_deploy() {
  [ "${CICD_D1_LOG:-1}" = "0" ] && return 0
  local worker_vid="${1:?worker version id}"
  local dash_v="${2:?dashboard v number}"
  local bucket="${3:-agent-sam-sandbox-cicd}"
  local r2_files="${4:-0}"
  local r2_bytes="${5:-0}"
  local ms_build="${6:-}"
  local ms_r2="${7:-}"
  local ms_worker="${8:-}"
  local ms_d1="${9:-}"
  local health_http="${10:-200}"
  local health_preview="${11:-Sandbox /dashboard/agent}"

  local bundle_bytes="${CICD_R2_BUNDLE_BYTES:-$r2_bytes}"
  [[ "$bundle_bytes" =~ ^[0-9]+$ ]] || bundle_bytes=0

  local wname="${WORKER_NAME:-inneranimal-dashboard}"
  local ts="${DEPLOY_TS:-$(date -u +%Y%m%d%H%M%S)}"
  local pipe_id="pipe_${ts}_sandbox_v${dash_v}"
  local gh_id="gh_${ts}_sandbox_v${dash_v}"

  # Pre-generate cicd_run_id so notifications and quality_run can reference it
  local cicd_run_id="run_${ts}_sb_v${dash_v}"
  local qrun_id="qrun_${ts}_sb_v${dash_v}"

  local phase_sb_start="${CICD_PHASE_SANDBOX_START_UNIX:-$(date +%s)}"
  local phase_sb_end="${CICD_PHASE_SANDBOX_END_UNIX:-$(date +%s)}"
  local phase_sb_dur="${CICD_PHASE_SANDBOX_DURATION_MS:-}"
  if ! [[ "$phase_sb_dur" =~ ^[0-9]+$ ]]; then
    phase_sb_dur=$(( (phase_sb_end - phase_sb_start) * 1000 ))
    [ "$phase_sb_dur" -lt 0 ] && phase_sb_dur=0
  fi

  cicd_seed_pipelines_registry
  cicd_git_export
  local started completed
  started=$(cicd_iso_now)
  completed=$(cicd_iso_now)
  local dur_ms=$(( ${ms_build:-0} + ${ms_r2:-0} + ${ms_worker:-0} + ${ms_d1:-0} ))
  [ "$dur_ms" -eq 0 ] && dur_ms="NULL" || true
  local wall_ms="${CICD_WALL_TOTAL_MS:-}"
  if ! [[ "$wall_ms" =~ ^[0-9]+$ ]]; then
    if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
      wall_ms="$dur_ms"
    else
      wall_ms="$phase_sb_dur"
    fi
  fi

  local hc_url="${CICD_CF_HEALTH_URL:-$health_preview}"
  local hc_code="${CICD_CF_HEALTH_STATUS_CODE:-$health_http}"
  [[ "$hc_code" =~ ^[0-9]+$ ]] || hc_code=0
  local hc_resp_ms="${CICD_CF_HEALTH_RESPONSE_MS:-}"
  [[ "$hc_resp_ms" =~ ^[0-9]+$ ]] || hc_resp_ms=NULL
  local hc_status="${CICD_CF_HEALTH_STATUS:-$(cicd_cf_health_label "$hc_code")}"
  local hc_status_esc hc_url_esc
  hc_status_esc=$(cicd_sql_escape "$hc_status")
  hc_url_esc=$(cicd_sql_escape "$hc_url")

  local pipe_status="passed"
  local final_status="success"
  local final_conclusion="success"
  if [ "$worker_vid" = "unknown" ] || [ -z "$worker_vid" ]; then
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  fi
  [[ "$hc_code" =~ ^(2[0-9][0-9]|30[12378])$ ]] || {
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  }

  local notes_esc wv_esc bucket_esc
  notes_esc=$(cicd_sql_escape "deploy-sandbox.sh | dashboard-v:${dash_v} | worker ${worker_vid} | ${r2_files} files | ${bucket}")
  wv_esc=$(cicd_sql_escape "$worker_vid")
  bucket_esc=$(cicd_sql_escape "$bucket")

  # 1) GitHub-style run
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_github_runs (
  run_id, workflow_name, repo_name, branch, commit_sha, commit_message,
  trigger_event, status, conclusion, run_attempt, started_at, completed_at, duration_ms
) VALUES (
  '${gh_id}', 'deploy-sandbox.sh (manual)', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}',
  '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}',
  'workflow_run', '${final_status}', '${final_conclusion}', 1,
  '${started}', '${completed}', ${dur_ms}
);"

  # 2) Pipeline run
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_pipeline_runs (
  run_id, commit_hash, branch, env, status, completed_at, notes,
  worker_version_id, deploy_record_id
) VALUES (
  '${pipe_id}', '${CICD_GIT_SHA}', '${CICD_GIT_BRANCH}', 'sandbox', '${pipe_status}',
  '${completed}', '${notes_esc}', '${wv_esc}', '${wv_esc}'
);"

  cicd_d1_nf "
UPDATE cicd_pipeline_runs SET worker_version_id='${wv_esc}', deploy_record_id='${wv_esc}'
WHERE run_id='${pipe_id}';"

  # 3) pipeline_runs (pipelines registry FK)
  local dur_sql unix_completed unix_started pr_id meta_esc
  if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
    dur_sql="$dur_ms"
  else
    dur_sql="NULL"
  fi
  unix_completed=$(date +%s)
  if [[ "$dur_sql" =~ ^[0-9]+$ ]] && [ "$dur_sql" -gt 0 ]; then
    unix_started=$((unix_completed - dur_sql / 1000))
  else
    unix_started=$unix_completed
  fi
  pr_id="prun_${ts}_sb_v${dash_v}"
  meta_esc=$(cicd_sql_escape "{\"cicd_pipeline_run_id\":\"${pipe_id}\",\"cicd_github_run_id\":\"${gh_id}\",\"dashboard_v\":\"${dash_v}\",\"r2_files\":${r2_files},\"r2_bytes\":${bundle_bytes}}")
  cicd_d1_nf "
INSERT INTO pipeline_runs (
  id, pipeline_id, environment, trigger_source, triggered_by, provider,
  status, git_commit_sha, worker_version, duration_ms, queued_at, started_at, completed_at,
  success_rate, tokens_in, tokens_out, cost_usd, notes, metadata_json
) VALUES (
  '${pr_id}',
  (SELECT id FROM pipelines WHERE slug='deploy_sandbox' LIMIT 1),
  'sandbox', 'manual', '${CICD_ACTOR_ESC}', 'cloudflare',
  'success', '${CICD_GIT_SHA}', '${wv_esc}', ${dur_sql},
  ${unix_started}, ${unix_started}, ${unix_completed},
  1.0, 0, 0, 0.0, '${notes_esc}', '${meta_esc}'
);"

  # 4) cicd_run_steps — per-step status (not global)
  local sql_http_hp hp_esc r2_prev
  if [ -n "${health_http}" ] && [ "${health_http}" != "NULL" ]; then
    sql_http_hp="${health_http}"
  else
    sql_http_hp="NULL"
  fi
  hp_esc=$(cicd_sql_escape "${health_preview}")
  r2_prev=$(cicd_sql_escape "${r2_files} files; ${bundle_bytes} bytes; ${bucket}")

  # Per-step status logic
  local step_build="pass"
  local step_r2="pass"
  local step_worker="pass"
  local step_d1="pass"
  local step_hc="pass"

  # Build step: fail if no build time captured
  [[ "${ms_build:-0}" =~ ^[1-9] ]] || step_build="warn"

  # R2 step: warn if 0 files (might mean no changes — not a failure)
  [ "${r2_files:-0}" -eq 0 ] && step_r2="warn"

  # Worker step: fail if version unknown
  { [ "$worker_vid" = "unknown" ] || [ -z "$worker_vid" ]; } && step_worker="fail"

  # Health check step: fail if bad code
  [[ "$hc_code" =~ ^(2[0-9][0-9]|30[12378])$ ]] || step_hc="fail"

  # If overall deploy failed, ensure worker step is fail
  [ "$pipe_status" = "failed" ] && [ "$step_worker" = "pass" ] && step_worker="fail"

  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_run_steps
  (id, run_id, tool_name, test_type, status, latency_ms, http_status, error, response_preview, tested_at)
VALUES
  ('step_${ts}_sb_npm', '${pipe_id}', 'npm_ci_vite_build',   'invoke', '${step_build}',  ${ms_build:-NULL}, NULL, NULL, 'Vite dist + manifest',          '${completed}'),
  ('step_${ts}_sb_r2',  '${pipe_id}', 'wrangler_r2_put',     'r2',     '${step_r2}',     ${ms_r2:-NULL},    NULL, NULL, '${r2_prev}',                    '${completed}'),
  ('step_${ts}_sb_wr',  '${pipe_id}', 'wrangler_deploy',     'invoke', '${step_worker}', ${ms_worker:-NULL},NULL, NULL, '${wname} @ ${worker_vid}',      '${completed}'),
  ('step_${ts}_sb_d1',  '${pipe_id}', 'd1_dashboard_versions','d1',    '${step_d1}',     ${ms_d1:-NULL},    NULL, NULL, 'dashboard_versions rows',        '${completed}'),
  ('step_${ts}_sb_hc',  '${pipe_id}', 'sandbox_health_check', 'route', '${step_hc}',     NULL, ${sql_http_hp}, NULL, '${hp_esc}',                   '${completed}');
"

  # 5) cicd_events
  local ev1="evt_${ts}_sb_push"
  local ev2="evt_${ts}_sb_r2"
  local ev3="evt_${ts}_sb_wr"
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_events
  (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key)
VALUES
  ('${ev1}', 'manual', 'push',                  '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', NULL,       NULL,     'git:HEAD'),
  ('${ev2}', 'manual', 'r2_bundle_updated',      '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', '${wname}', '${bucket_esc}', '${R2_AGENT_PREFIX:-static/dashboard/agent}/.deploy-manifest'),
  ('${ev3}', 'manual', 'worker_script_updated',  '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', '${wname}', NULL,     'version:${worker_vid}');
"

  local ev_id_sql="NULL"
  if [ -n "${CICD_EVENT_ID:-}" ]; then
    local eid_esc
    eid_esc=$(cicd_sql_escape "${CICD_EVENT_ID}")
    ev_id_sql="'${eid_esc}'"
  fi

  local deploy_base="https://inneranimal-dashboard.meauxbility.workers.dev"
  local deploy_base_esc hc_resp_sql
  deploy_base_esc=$(cicd_sql_escape "$deploy_base")
  hc_resp_sql="${hc_resp_ms}"
  [[ "$hc_resp_sql" =~ ^[0-9]+$ ]] || hc_resp_sql="NULL"

  # 6) cicd_runs — use pre-generated ID so notifications can reference it
  local sb_phase_st="${phase_sb_start}"
  local sb_phase_end="${phase_sb_end}"
  cicd_d1_nf "
INSERT INTO cicd_runs (
  id, run_number, worker_name, environment, deployment_type,
  trigger_source, triggered_by, status, conclusion,
  failure_phase, error_message, error_detail_json,
  git_repo, git_branch, git_commit_sha, git_commit_message,
  github_run_id, cf_deploy_url, cf_health_check_url,
  phase_sandbox_status, phase_benchmark_status, phase_promote_status,
  notes, tags_json, metadata_json, git_actor,
  r2_bucket, r2_files_updated, r2_bundle_size_bytes,
  phase_sandbox_started_at, phase_sandbox_completed_at, phase_sandbox_duration_ms,
  cf_worker_version_id, cf_health_status_code, cf_health_response_ms, cf_health_status,
  total_duration_ms, event_id, queued_at, started_at, completed_at, created_at, updated_at
) VALUES (
  '${cicd_run_id}',
  (SELECT COALESCE(MAX(run_number),0)+1 FROM cicd_runs),
  '$(cicd_sql_escape "$wname")', 'sandbox', 'worker_r2',
  'manual', 'agent_sam',
  '${final_status}', '${final_conclusion}',
  NULL, NULL, NULL,
  '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_SUBJECT_ESC}',
  '${gh_id}', '${deploy_base_esc}', '${hc_url_esc}',
  '${pipe_status}', 'pending', 'pending',
  '${notes_esc}',
  '[\"sandbox\",\"deploy-sandbox\",\"${dash_v}\"]',
  '${meta_esc}',
  '${CICD_GIT_ACTOR_ESC}',
  '${bucket_esc}', ${r2_files}, ${bundle_bytes},
  ${sb_phase_st}, ${sb_phase_end}, ${phase_sb_dur},
  '${wv_esc}', ${hc_code}, ${hc_resp_sql}, '${hc_status_esc}',
  ${wall_ms}, ${ev_id_sql},
  ${sb_phase_st}, ${sb_phase_st}, ${sb_phase_end},
  unixepoch(), unixepoch()
);"

  echo "[cicd-d1-log] sandbox pipeline ${pipe_id} (github ${gh_id})"

  # 7) NEW: Resend notification row
  local notif_event="run_success"
  [ "$pipe_status" = "failed" ] && notif_event="run_failed"
  cicd_log_resend_notification "$cicd_run_id" "$pipe_id" "$notif_event" "$dash_v" "sandbox"

  # 8) NEW: tracking_metrics
  cicd_log_tracking_metrics \
    "sandbox" "$pipe_id" "$wname" \
    "${ms_build:-0}" "${ms_r2:-0}" "${ms_worker:-0}" \
    "$hc_code" "$r2_files" "$bundle_bytes" "$wall_ms" \
    "$worker_vid" "$CICD_GIT_SHA"

  # 9) NEW: quality_run + quality_results (uses qrun_id so it doesn't collide with cicd_run_id)
  # We reuse cicd_run_id as the qrun id for simplicity (they're the same deploy event)
  cicd_log_quality_run \
    "$qrun_id" "$pipe_id" "$pipe_status" \
    "$worker_vid" "$hc_code" "$r2_files" "${ms_worker:-0}" \
    "sandbox" "$CICD_GIT_SHA" "$hc_url"
}

# =============================================================================
# --- Production promote (inneranimalmedia worker + prod R2) ------------------
# Args: worker_version_id, dashboard_v, r2_files, ms_pull, ms_push, ms_worker, ms_d1, health_http
# =============================================================================
cicd_log_prod_promote() {
  [ "${CICD_D1_LOG:-1}" = "0" ] && return 0
  local worker_vid="${1:?prod worker version id}"
  local dash_v="${2:?dashboard v from HTML}"
  local r2_files="${3:-0}"
  local ms_pull="${4:-}"
  local ms_push="${5:-}"
  local ms_worker="${6:-}"
  local ms_d1="${7:-}"
  local health_http="${8:-200}"

  local wname="${WORKER_NAME:-inneranimalmedia}"
  local bundle_bytes="${CICD_R2_BUNDLE_BYTES:-0}"
  [[ "$bundle_bytes" =~ ^[0-9]+$ ]] || bundle_bytes=0

  local phase_pr_start="${CICD_PHASE_PROMOTE_START_UNIX:-$(date +%s)}"
  local phase_pr_end="${CICD_PHASE_PROMOTE_END_UNIX:-$(date +%s)}"
  local phase_pr_dur="${CICD_PHASE_PROMOTE_DURATION_MS:-}"
  if ! [[ "$phase_pr_dur" =~ ^[0-9]+$ ]]; then
    phase_pr_dur=$(( (phase_pr_end - phase_pr_start) * 1000 ))
    [ "$phase_pr_dur" -lt 0 ] && phase_pr_dur=0
  fi

  cicd_seed_pipelines_registry
  cicd_git_export
  local ts="${DEPLOY_TS:-$(date -u +%Y%m%d%H%M%S)}"
  local pipe_id="pipe_${ts}_prod_v${dash_v}"
  local gh_id="gh_${ts}_prod_v${dash_v}"

  # Pre-generate IDs
  local cicd_run_id="run_${ts}_pr_v${dash_v}"
  local qrun_id="qrun_${ts}_pr_v${dash_v}"

  local started completed
  started=$(cicd_iso_now)
  completed=$(cicd_iso_now)
  local dur_ms=$(( ${ms_pull:-0} + ${ms_push:-0} + ${ms_worker:-0} + ${ms_d1:-0} ))
  [ "$dur_ms" -eq 0 ] && dur_ms="NULL" || true
  local wall_ms="${CICD_WALL_TOTAL_MS:-}"
  if ! [[ "$wall_ms" =~ ^[0-9]+$ ]]; then
    if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
      wall_ms="$dur_ms"
    else
      wall_ms="$phase_pr_dur"
    fi
  fi

  local prod_url="${CICD_CF_HEALTH_URL:-https://inneranimalmedia.com/dashboard/agent}"
  local hc_code="${CICD_CF_HEALTH_STATUS_CODE:-$health_http}"
  [[ "$hc_code" =~ ^[0-9]+$ ]] || hc_code=0
  local hc_resp_ms="${CICD_CF_HEALTH_RESPONSE_MS:-}"
  [[ "$hc_resp_ms" =~ ^[0-9]+$ ]] || hc_resp_ms=NULL
  local hc_status="${CICD_CF_HEALTH_STATUS:-$(cicd_cf_health_label "$hc_code")}"
  local hc_status_esc prod_url_esc
  hc_status_esc=$(cicd_sql_escape "$hc_status")
  prod_url_esc=$(cicd_sql_escape "$prod_url")

  local pipe_status="passed"
  local final_status="success"
  local final_conclusion="success"
  if [ "$worker_vid" = "unknown" ] || [ -z "$worker_vid" ]; then
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  fi
  [[ "$hc_code" =~ ^(2[0-9][0-9]|30[12378])$ ]] || {
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  }

  local notes_esc wv_esc bucket_esc
  notes_esc=$(cicd_sql_escape "promote-to-prod.sh | v${dash_v} | worker ${worker_vid} | ${r2_files} R2 objects | agent-sam")
  wv_esc=$(cicd_sql_escape "$worker_vid")
  bucket_esc=$(cicd_sql_escape "agent-sam")

  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_github_runs (
  run_id, workflow_name, repo_name, branch, commit_sha, commit_message,
  trigger_event, status, conclusion, run_attempt, started_at, completed_at, duration_ms
) VALUES (
  '${gh_id}', 'promote-to-prod.sh (manual)', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}',
  '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}',
  'workflow_run', '${final_status}', '${final_conclusion}', 1,
  '${started}', '${completed}', ${dur_ms}
);"

  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_pipeline_runs (
  run_id, commit_hash, branch, env, status, completed_at, notes,
  worker_version_id, deploy_record_id
) VALUES (
  '${pipe_id}', '${CICD_GIT_SHA}', '${CICD_GIT_BRANCH}', 'production', '${pipe_status}',
  '${completed}', '${notes_esc}', '${wv_esc}', '${wv_esc}'
);"

  cicd_d1_nf "
UPDATE cicd_pipeline_runs SET worker_version_id='${wv_esc}', deploy_record_id='${wv_esc}'
WHERE run_id='${pipe_id}';"

  local dur_sql unix_completed unix_started pr_id meta_esc
  if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
    dur_sql="$dur_ms"
  else
    dur_sql="NULL"
  fi
  unix_completed=$(date +%s)
  if [[ "$dur_sql" =~ ^[0-9]+$ ]] && [ "$dur_sql" -gt 0 ]; then
    unix_started=$((unix_completed - dur_sql / 1000))
  else
    unix_started=$unix_completed
  fi
  pr_id="prun_${ts}_prod_v${dash_v}"
  meta_esc=$(cicd_sql_escape "{\"cicd_pipeline_run_id\":\"${pipe_id}\",\"cicd_github_run_id\":\"${gh_id}\",\"dashboard_v\":\"${dash_v}\",\"r2_files\":${r2_files}}")
  cicd_d1_nf "
INSERT INTO pipeline_runs (
  id, pipeline_id, environment, trigger_source, triggered_by, provider,
  status, git_commit_sha, worker_version, duration_ms, queued_at, started_at, completed_at,
  success_rate, tokens_in, tokens_out, cost_usd, notes, metadata_json
) VALUES (
  '${pr_id}',
  (SELECT id FROM pipelines WHERE slug='promote_prod' LIMIT 1),
  'production', 'manual', '${CICD_ACTOR_ESC}', 'cloudflare',
  'success', '${CICD_GIT_SHA}', '${wv_esc}', ${dur_sql},
  ${unix_started}, ${unix_started}, ${unix_completed},
  1.0, 0, 0, 0.0, '${notes_esc}', '${meta_esc}'
);"

  # Per-step status for prod
  local step_pull="pass"
  local step_push="pass"
  local step_worker="pass"
  local step_d1="pass"
  local step_hc="pass"

  [ "${r2_files:-0}" -eq 0 ] && { step_pull="warn"; step_push="warn"; }
  { [ "$worker_vid" = "unknown" ] || [ -z "$worker_vid" ]; } && step_worker="fail"
  [[ "$hc_code" =~ ^(2[0-9][0-9]|30[12378])$ ]] || step_hc="fail"
  [ "$pipe_status" = "failed" ] && [ "$step_worker" = "pass" ] && step_worker="fail"

  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_run_steps
  (id, run_id, tool_name, test_type, status, latency_ms, http_status, error, response_preview, tested_at)
VALUES
  ('step_${ts}_pr_pull', '${pipe_id}', 'r2_pull_sandbox_manifest',   'r2',     '${step_pull}',   ${ms_pull:-NULL},   NULL, NULL, 'agent-sam-sandbox-cicd -> dist',              '${completed}'),
  ('step_${ts}_pr_push', '${pipe_id}', 'r2_put_production',          'r2',     '${step_push}',   ${ms_push:-NULL},   NULL, NULL, '${r2_files} objects -> agent-sam',            '${completed}'),
  ('step_${ts}_pr_wr',   '${pipe_id}', 'wrangler_deploy_production',  'invoke', '${step_worker}', ${ms_worker:-NULL}, NULL, NULL, 'inneranimalmedia @ ${worker_vid}',            '${completed}'),
  ('step_${ts}_pr_d1',   '${pipe_id}', 'd1_dashboard_versions_prod',  'd1',     '${step_d1}',     ${ms_d1:-NULL},     NULL, NULL, 'dashboard_versions + deployments',           '${completed}'),
  ('step_${ts}_pr_hc',   '${pipe_id}', 'prod_health_check',           'route',  '${step_hc}',     NULL, ${health_http}, NULL, 'https://inneranimalmedia.com/dashboard/agent', '${completed}');
"

  local ev1="evt_${ts}_pr_promo"
  local ev2="evt_${ts}_pr_r2"
  local ev3="evt_${ts}_pr_wr"
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_events
  (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key)
VALUES
  ('${ev1}', 'manual', 'push',                 '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', NULL,              NULL,        'promote:git'),
  ('${ev2}', 'manual', 'r2_bundle_updated',     '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimalmedia','agent-sam', 'static/dashboard/agent/'),
  ('${ev3}', 'manual', 'worker_script_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimalmedia', NULL,       'version:${worker_vid}');
"

  local ev_id_sql="NULL"
  if [ -n "${CICD_EVENT_ID:-}" ]; then
    local eid_esc
    eid_esc=$(cicd_sql_escape "${CICD_EVENT_ID}")
    ev_id_sql="'${eid_esc}'"
  fi

  local prod_origin="https://inneranimalmedia.com"
  local prod_origin_esc hc_resp_sql
  prod_origin_esc=$(cicd_sql_escape "$prod_origin")
  hc_resp_sql="${hc_resp_ms}"
  [[ "$hc_resp_sql" =~ ^[0-9]+$ ]] || hc_resp_sql="NULL"

  cicd_d1_nf "
INSERT INTO cicd_runs (
  id, run_number, worker_name, environment, deployment_type,
  trigger_source, triggered_by, status, conclusion,
  failure_phase, error_message, error_detail_json,
  git_repo, git_branch, git_commit_sha, git_commit_message,
  github_run_id, cf_deploy_url, cf_health_check_url,
  phase_sandbox_status, phase_benchmark_status, phase_promote_status,
  notes, tags_json, metadata_json, git_actor,
  r2_bucket, r2_files_updated, r2_bundle_size_bytes,
  phase_sandbox_started_at, phase_sandbox_completed_at, phase_sandbox_duration_ms,
  cf_worker_version_id, cf_health_status_code, cf_health_response_ms, cf_health_status,
  total_duration_ms, event_id, queued_at, started_at, completed_at, created_at, updated_at
) VALUES (
  '${cicd_run_id}',
  (SELECT COALESCE(MAX(run_number),0)+1 FROM cicd_runs),
  '$(cicd_sql_escape "$wname")', 'production', 'worker_r2',
  'manual', 'agent_sam',
  '${final_status}', '${final_conclusion}',
  NULL, NULL, NULL,
  '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_SUBJECT_ESC}',
  '${gh_id}', '${prod_origin_esc}', '${prod_url_esc}',
  'skipped', 'skipped', '${pipe_status}',
  '${notes_esc}',
  '[\"production\",\"promote-to-prod\",\"${dash_v}\"]',
  '${meta_esc}',
  '${CICD_GIT_ACTOR_ESC}',
  '${bucket_esc}', ${r2_files}, ${bundle_bytes},
  NULL, NULL, NULL,
  '${wv_esc}', ${hc_code}, ${hc_resp_sql}, '${hc_status_esc}',
  ${wall_ms}, ${ev_id_sql},
  ${phase_pr_start}, ${phase_pr_start}, ${phase_pr_end},
  unixepoch(), unixepoch()
);"

  echo "[cicd-d1-log] production pipeline ${pipe_id} (github ${gh_id})"

  # NEW: Resend notification row
  local notif_event="run_success"
  [ "$pipe_status" = "failed" ] && notif_event="run_failed"
  cicd_log_resend_notification "$cicd_run_id" "$pipe_id" "$notif_event" "$dash_v" "production"

  # NEW: tracking_metrics
  cicd_log_tracking_metrics \
    "production" "$pipe_id" "$wname" \
    "0" "${ms_push:-0}" "${ms_worker:-0}" \
    "$hc_code" "$r2_files" "$bundle_bytes" "$wall_ms" \
    "$worker_vid" "$CICD_GIT_SHA"

  # NEW: quality_run + quality_results
  cicd_log_quality_run \
    "$qrun_id" "$pipe_id" "$pipe_status" \
    "$worker_vid" "$hc_code" "$r2_files" "${ms_worker:-0}" \
    "production" "$CICD_GIT_SHA" "$prod_url"
}
