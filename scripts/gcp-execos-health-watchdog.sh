#!/usr/bin/env bash
# Restart ExecOS if :3099 health fails. MUST run under agentsam PM2 only.
#
# Crontab (iam-tunnel, root):
#   */5 * * * * /home/samprimeaux/inneranimalmedia/scripts/gcp-execos-health-watchdog.sh >> /var/log/iam-watchdog.log 2>&1
# Legacy path still supported:
#   */5 * * * * /home/samprimeaux/ExecOS/deploy/gcp/health-watchdog.sh >> /var/log/iam-watchdog.log 2>&1
#
# Stability rules (2026-07):
# - Never block on `pm2 delete` / `pm2 kill` as samprimeaux (hung for days historically).
# - Prefer local 127.0.0.1 health; require 2 consecutive failures before restart.
# - Reclaim orphan ExecOS listeners on :3099 before restart (EADDRINUSE flap).
# - Kill hung Vite/dashboard builds on this 1GB VM (ship-lane ban).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXECOS_HOME="${EXECOS_HOME:-/home/samprimeaux/ExecOS}"
[[ -d "$EXECOS_HOME" ]] || EXECOS_HOME="$ROOT/../ExecOS"
[[ -d "$EXECOS_HOME" ]] || EXECOS_HOME="/home/samprimeaux/ExecOS"

AGENTSAM_USER="${AGENTSAM_USER:-agentsam}"
PM2_HOME_AGENTSAM="${PM2_HOME_AGENTSAM:-/var/lib/agentsam/.pm2}"
EXECOS_DEFAULT_CWD="${EXECOS_DEFAULT_CWD:-/home/samprimeaux/inneranimalmedia}"
STATE_DIR="${STATE_DIR:-/var/lib/agentsam/iam-watchdog}"
FAIL_FILE="${STATE_DIR}/local_health_fails"
COOLDOWN_FILE="${STATE_DIR}/last_restart_epoch"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"
RESTART_COOLDOWN_SEC="${RESTART_COOLDOWN_SEC:-180}"

mkdir -p "$STATE_DIR" 2>/dev/null || true

log() { echo "$(date -Is) $*"; }

health_ok() {
  curl -sf --max-time 5 http://127.0.0.1:3099/health >/dev/null
}

kill_vm_vite_builds() {
  # Never run Vite on iam-tunnel (~1GB). Hung builds starve ExecOS + cloudflared.
  pkill -9 -f 'dashboard/node_modules/.bin/vite' 2>/dev/null || true
  pkill -9 -f 'npm --prefix dashboard run build' 2>/dev/null || true
  pkill -9 -f 'with-node-env-fallback.sh npm --prefix dashboard' 2>/dev/null || true
  pkill -9 -f 'sh -c vite build' 2>/dev/null || true
}

stop_samprimeaux_pm2_nonblocking() {
  if ! id samprimeaux &>/dev/null; then
    return 0
  fi
  # Historical hang: `pm2 delete` under samprimeaux blocked for days.
  timeout 2 sudo -u samprimeaux pm2 kill >/dev/null 2>&1 || true
  pkill -9 -u samprimeaux -f 'PM2 v' 2>/dev/null || true
  pkill -9 -u samprimeaux -f 'pm2 delete' 2>/dev/null || true
  pkill -9 -u samprimeaux -f "${EXECOS_HOME}/server.js" 2>/dev/null || true
}

pm2_execos_pid() {
  sudo -u "$AGENTSAM_USER" bash -lc "
    export PM2_HOME=${PM2_HOME_AGENTSAM}
    pm2 pid execos 2>/dev/null
  " 2>/dev/null | tr -d '[:space:]' || true
}

reclaim_orphan_execos() {
  local keep
  keep="$(pm2_execos_pid)"
  local p cmd
  # Match real node processes via /proc cmdline — NEVER pkill -f a path that also
  # appears in the parent bash -c argv (that kills the SSH/cron shell).
  for p in $(ps -C node -o pid= 2>/dev/null || true); do
    p="$(echo "$p" | tr -d '[:space:]')"
    [[ -n "$p" ]] || continue
    cmd="$(tr '\0' ' ' <"/proc/${p}/cmdline" 2>/dev/null || true)"
    case "$cmd" in
      *ExecOS/server.js*)
        if [[ -n "$keep" && "$p" == "$keep" ]]; then
          continue
        fi
        log "killing orphan ExecOS pid=${p} (keep=${keep:-none})"
        kill -9 "$p" 2>/dev/null || true
        ;;
    esac
  done
  if ! health_ok; then
    for p in $(lsof -ti :3099 2>/dev/null || true); do
      if [[ -n "$keep" && "$p" == "$keep" ]]; then
        continue
      fi
      log "killing :3099 holder pid=${p}"
      kill -9 "$p" 2>/dev/null || true
    done
  fi
}

restart_execos_agentsam() {
  if ! id "$AGENTSAM_USER" &>/dev/null; then
    log "agentsam user missing — skip PM2 restart" >&2
    return 1
  fi
  stop_samprimeaux_pm2_nonblocking
  reclaim_orphan_execos
  sudo -u "$AGENTSAM_USER" bash -lc "
    export PM2_HOME=${PM2_HOME_AGENTSAM}
    export EXECOS_DEFAULT_CWD=${EXECOS_DEFAULT_CWD}
    cd '${EXECOS_HOME}'
    timeout 20 pm2 restart execos --update-env 2>/dev/null \
      || timeout 20 pm2 start ecosystem.config.cjs --update-env
    timeout 10 pm2 save >/dev/null 2>&1 || true
  "
  date +%s >"$COOLDOWN_FILE" 2>/dev/null || true
  echo 0 >"$FAIL_FILE" 2>/dev/null || true
}

# --- main ---
kill_vm_vite_builds
# Always reclaim stray ExecOS PIDs (PM2 restart often leaves the previous listener alive → EADDRINUSE).
reclaim_orphan_execos

if health_ok; then
  echo 0 >"$FAIL_FILE" 2>/dev/null || true
  exit 0
fi

fails=0
if [[ -f "$FAIL_FILE" ]]; then
  fails="$(tr -d '[:space:]' <"$FAIL_FILE" 2>/dev/null || echo 0)"
fi
fails=$(( ${fails:-0} + 1 ))
echo "$fails" >"$FAIL_FILE" 2>/dev/null || true

log "ExecOS local health FAIL count=${fails}/${FAIL_THRESHOLD}"

if (( fails < FAIL_THRESHOLD )); then
  log "below restart threshold — wait for next tick"
  exit 0
fi

now="$(date +%s)"
last=0
if [[ -f "$COOLDOWN_FILE" ]]; then
  last="$(tr -d '[:space:]' <"$COOLDOWN_FILE" 2>/dev/null || echo 0)"
fi
if (( now - ${last:-0} < RESTART_COOLDOWN_SEC )); then
  log "restart cooldown active — skip"
  exit 0
fi

log "ExecOS runtime unhealthy — restarting PM2 as ${AGENTSAM_USER}"
restart_execos_agentsam || true
sleep 2

if health_ok; then
  log "ExecOS runtime recovered (agentsam PM2)"
  exit 0
fi

log "ExecOS runtime still down after agentsam restart"
exit 1
