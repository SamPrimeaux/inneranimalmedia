#!/usr/bin/env bash
# gcp-vm-self-heal.sh
# Runs ON iam-tunnel (not Mac) via root cron every 5 minutes.
# Keeps ExecOS, operator repo, and cloudflared tunnel healthy.
# Mac is never involved. deploy:full skips ExecOS sync unless IAM_SYNC_GCP_EXECOS=1.
#
# One-time install (from Mac):
#   ./scripts/setup-gcp-vm-self-heal-once.sh
#
# Manual install on VM:
#   sudo chmod +x /home/samprimeaux/inneranimalmedia/scripts/gcp-vm-self-heal.sh
#   ( sudo crontab -l 2>/dev/null | grep -v gcp-vm-self-heal; \
#     echo "*/5 * * * * /home/samprimeaux/inneranimalmedia/scripts/gcp-vm-self-heal.sh >> /var/log/iam-self-heal.log 2>&1" ) | sudo crontab -
set -euo pipefail

LOG_PREFIX="[self-heal $(date '+%H:%M:%S')]"
EXECOS_HOME="/home/samprimeaux/ExecOS"
OPERATOR_REPO="/home/samprimeaux/inneranimalmedia"
HEALTH_URL="https://terminal.inneranimalmedia.com/health"
AGENTSAM_USER="${AGENTSAM_USER:-agentsam}"
PM2_HOME_AGENTSAM="${PM2_HOME_AGENTSAM:-/var/lib/agentsam/.pm2}"

# Prefer shared helper when operator repo already has it (post-sync).
if [[ -f "${OPERATOR_REPO}/scripts/lib/gcp-vm-git-lock.sh" ]]; then
  # shellcheck source=/dev/null
  source "${OPERATOR_REPO}/scripts/lib/gcp-vm-git-lock.sh"
else
  iam_clear_stale_git_locks() {
    local repo="${1:-}"
    local stale_min="${2:-2}"
    [[ -n "$repo" && -d "${repo}/.git" ]] || return 0
    find "${repo}/.git" -name '*.lock' -type f -mmin "+${stale_min}" -delete 2>/dev/null || true
  }
  iam_with_repo_git_lock() {
    local repo="${1:-}"; shift || true
    [[ -n "$repo" && -d "${repo}/.git" ]] || return 1
    mkdir -p "${repo}/.git"
    if command -v flock >/dev/null 2>&1; then
      flock -w 60 "${repo}/.git/iam-sync.flock" "$@"
    else
      "$@"
    fi
  }
fi

# Operator repo on iam-tunnel is a disposable Agent workspace (not deploy SSOT).
# Dirty trees / wrong-user FETCH_HEAD ownership must not block sync forever.
agentsam_ensure_git_owner() {
  local dir="$1"
  [[ -d "${dir}/.git" ]] || return 0
  # Cron runs as root — reclaim .git if root/samprimeaux left FETCH_HEAD unwritable for agentsam.
  chown -R "${AGENTSAM_USER}:${AGENTSAM_USER}" "${dir}/.git" 2>/dev/null || true
}

agentsam_git_reset_hard_main() {
  local dir="$1"
  local label="$2"
  iam_clear_stale_git_locks "$dir"
  agentsam_ensure_git_owner "$dir"
  if iam_with_repo_git_lock "$dir" sudo -u "$AGENTSAM_USER" bash -c "
    set -euo pipefail
    cd '${dir}'
    git fetch origin -q
    # Do not checkout -B first — dirty tracked files abort checkout; reset --hard is the disposable policy.
    git reset --hard origin/main -q
    git clean -fd -q
    git checkout -B main origin/main -q 2>/dev/null || true
  "; then
    local head
    head="$(sudo -u "$AGENTSAM_USER" git -C "${dir}" rev-parse --short HEAD 2>/dev/null || echo '?')"
    echo "${LOG_PREFIX} ${label}: reset --hard origin/main @ ${head}"
    return 0
  fi
  echo "${LOG_PREFIX} ${label}: reset --hard FAILED — check ${AGENTSAM_USER} GitHub SSH / ownership"
  return 1
}

agentsam_git_pull() {
  local dir="$1"
  local label="$2"
  # disposable=1 → operator-repo policy: dirty or non-ff → hard reset (never stash junk)
  local disposable="${3:-0}"
  if [[ ! -d "${dir}/.git" ]]; then
    echo "${LOG_PREFIX} ${label}: not cloned — skipping pull"
    return 0
  fi
  if ! id "$AGENTSAM_USER" &>/dev/null; then
    echo "${LOG_PREFIX} ${label}: ${AGENTSAM_USER} missing — skipping pull"
    return 0
  fi
  iam_clear_stale_git_locks "$dir"
  agentsam_ensure_git_owner "$dir"

  local dirty=0
  if [[ -n "$(sudo -u "$AGENTSAM_USER" git -C "${dir}" status --porcelain 2>/dev/null || true)" ]]; then
    dirty=1
  fi

  if [[ "$disposable" == "1" && "$dirty" -eq 1 ]]; then
    echo "${LOG_PREFIX} ${label}: dirty disposable workspace — hard reset (not ff-only)"
    agentsam_git_reset_hard_main "$dir" "$label" || true
    return 0
  fi

  if iam_with_repo_git_lock "$dir" \
    sudo -u "$AGENTSAM_USER" git -C "${dir}" pull --ff-only -q 2>/dev/null; then
    echo "${LOG_PREFIX} ${label}: up to date"
    return 0
  fi

  # Retry ff-only after locks; then hard reset (ExecOS + disposable operator).
  iam_clear_stale_git_locks "$dir"
  agentsam_ensure_git_owner "$dir"
  if iam_with_repo_git_lock "$dir" \
    sudo -u "$AGENTSAM_USER" git -C "${dir}" pull --ff-only -q 2>/dev/null; then
    echo "${LOG_PREFIX} ${label}: up to date (retry)"
    return 0
  fi

  echo "${LOG_PREFIX} ${label}: ff-only failed — hard reset to origin/main"
  agentsam_git_reset_hard_main "$dir" "$label" || true
}

agentsam_pm2() {
  sudo -u "$AGENTSAM_USER" bash -lc "
    export PM2_HOME=${PM2_HOME_AGENTSAM}
    cd '${EXECOS_HOME}'
    $*
  "
}

echo "${LOG_PREFIX} starting"

# 0. Ship-lane guard — never allow hung Vite/dashboard builds on this ~1GB VM.
# A single vite build (~270MB+) thrashing swap causes ExecOS EADDRINUSE + tunnel degraded flaps.
if pgrep -f 'dashboard/node_modules/.bin/vite' >/dev/null 2>&1 \
  || pgrep -f 'npm --prefix dashboard run build' >/dev/null 2>&1; then
  echo "${LOG_PREFIX} killing hung dashboard Vite/build on iam-tunnel (ship-lane ban)"
  pkill -9 -f 'dashboard/node_modules/.bin/vite' 2>/dev/null || true
  pkill -9 -f 'npm --prefix dashboard run build' 2>/dev/null || true
  pkill -9 -f 'with-node-env-fallback.sh npm --prefix dashboard' 2>/dev/null || true
  pkill -9 -f 'sh -c vite build' 2>/dev/null || true
fi

# Health restarts live in gcp-execos-health-watchdog.sh (separate cron) so fail
# hysteresis is not double-counted when both jobs share the same */5 schedule.

# 1–2. Pull ExecOS + operator repo (agentsam owns .git and has GitHub SSH).
# Operator repo is disposable (3rd arg=1): dirty tree → reset --hard, never keep mass deletions.
agentsam_git_pull "${EXECOS_HOME}" "ExecOS" 0
agentsam_git_pull "${OPERATOR_REPO}" "operator repo" 1

# 3. Ensure pm2 execos process is running under agentsam (start only — no restart race)
if ! agentsam_pm2 "pm2 list 2>/dev/null" | grep -qE 'execos|agentsam'; then
  echo "${LOG_PREFIX} pm2 execos not running — starting under ${AGENTSAM_USER}"
  if [[ -f "${EXECOS_HOME}/server.js" ]]; then
    agentsam_pm2 "timeout 20 pm2 start '${EXECOS_HOME}/server.js' --name execos --update-env 2>/dev/null || timeout 20 pm2 start ecosystem.config.cjs --update-env 2>/dev/null || true"
    agentsam_pm2 "timeout 10 pm2 save 2>/dev/null || true"
  fi
else
  echo "${LOG_PREFIX} pm2 execos: running under ${AGENTSAM_USER}"
fi

# 4. Observability only — never restart here (watchdog owns restarts + orphan reclaim)
LOCAL_OK=0
curl -sf --max-time 5 http://127.0.0.1:3099/health >/dev/null 2>&1 && LOCAL_OK=1
HTTP_STATUS="$(curl -sf -o /dev/null -w '%{http_code}' --max-time 12 "${HEALTH_URL}" 2>/dev/null || echo '000')"
if [[ "$LOCAL_OK" -eq 1 && "$HTTP_STATUS" == "200" ]]; then
  echo "${LOG_PREFIX} health: OK (local+public ${HTTP_STATUS})"
elif [[ "$LOCAL_OK" -eq 1 ]]; then
  echo "${LOG_PREFIX} health: local OK, public=${HTTP_STATUS} (tunnel/CF — watchdog will not restart for public-only fail)"
else
  echo "${LOG_PREFIX} health: local FAIL public=${HTTP_STATUS} (watchdog cron owns restart)"
fi

# 5. Ensure cloudflared tunnel is running
if ! pgrep -x cloudflared >/dev/null 2>&1; then
  echo "${LOG_PREFIX} cloudflared: not running — attempting start via systemd"
  systemctl start cloudflared 2>/dev/null || \
    echo "${LOG_PREFIX} cloudflared: systemctl start failed — check: systemctl status cloudflared"
else
  echo "${LOG_PREFIX} cloudflared: running"
fi

# 6. ripgrep on system PATH — operator SSH (samprimeaux) + non-login shells.
# Prefer agentsam's newer binary; apt ripgrep is fallback only.
ensure_system_rg() {
  local dest=/usr/local/bin/rg
  local preferred=/var/lib/agentsam/.local/bin/rg
  if [[ -x "$preferred" ]]; then
    local cur
    cur="$(readlink -f "$dest" 2>/dev/null || true)"
    local want
    want="$(readlink -f "$preferred" 2>/dev/null || echo "$preferred")"
    if [[ "$cur" != "$want" ]]; then
      ln -sfn "$preferred" "$dest"
      echo "${LOG_PREFIX} rg: linked ${dest} -> ${preferred}"
    else
      echo "${LOG_PREFIX} rg: ok (agentsam binary via ${dest})"
    fi
    return 0
  fi
  if ! command -v rg >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ripgrep >/dev/null 2>&1 || true
    fi
  fi
  if command -v rg >/dev/null 2>&1; then
    if [[ ! -e "$dest" ]]; then
      ln -sfn "$(command -v rg)" "$dest"
      echo "${LOG_PREFIX} rg: linked ${dest} -> $(command -v rg)"
    else
      echo "${LOG_PREFIX} rg: ok ($(command -v rg))"
    fi
  else
    echo "${LOG_PREFIX} rg: missing — install agentsam ~/.local/bin/rg or apt ripgrep"
  fi
}
ensure_system_rg

echo "${LOG_PREFIX} done"
