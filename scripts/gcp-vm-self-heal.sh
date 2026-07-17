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

agentsam_git_pull() {
  local dir="$1"
  local label="$2"
  if [[ ! -d "${dir}/.git" ]]; then
    echo "${LOG_PREFIX} ${label}: not cloned — skipping pull"
    return 0
  fi
  if ! id "$AGENTSAM_USER" &>/dev/null; then
    echo "${LOG_PREFIX} ${label}: ${AGENTSAM_USER} missing — skipping pull"
    return 0
  fi
  iam_clear_stale_git_locks "$dir"
  if iam_with_repo_git_lock "$dir" \
    sudo -u "$AGENTSAM_USER" git -C "${dir}" pull --ff-only -q 2>/dev/null; then
    echo "${LOG_PREFIX} ${label}: up to date"
  else
    # One retry after clearing locks (post-deploy sync race).
    iam_clear_stale_git_locks "$dir"
    if iam_with_repo_git_lock "$dir" \
      sudo -u "$AGENTSAM_USER" git -C "${dir}" pull --ff-only -q 2>/dev/null; then
      echo "${LOG_PREFIX} ${label}: up to date (retry)"
    else
      echo "${LOG_PREFIX} ${label}: pull warning (kept last good — check ${AGENTSAM_USER} GitHub SSH / locks)"
    fi
  fi
}

agentsam_pm2() {
  sudo -u "$AGENTSAM_USER" bash -lc "
    export PM2_HOME=${PM2_HOME_AGENTSAM}
    cd '${EXECOS_HOME}'
    $*
  "
}

echo "${LOG_PREFIX} starting"

# 1–2. Pull ExecOS + operator repo (agentsam owns .git and has GitHub SSH)
agentsam_git_pull "${EXECOS_HOME}" "ExecOS"
agentsam_git_pull "${OPERATOR_REPO}" "operator repo"

# 3. Ensure pm2 execos process is running under agentsam
if ! agentsam_pm2 "pm2 list 2>/dev/null" | grep -qE 'execos|agentsam'; then
  echo "${LOG_PREFIX} pm2 execos not running — starting under ${AGENTSAM_USER}"
  if [[ -f "${EXECOS_HOME}/server.js" ]]; then
    agentsam_pm2 "pm2 start '${EXECOS_HOME}/server.js' --name execos --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --update-env 2>/dev/null || true"
    agentsam_pm2 "pm2 save 2>/dev/null || true"
  fi
else
  echo "${LOG_PREFIX} pm2 execos: running under ${AGENTSAM_USER}"
fi

# 4. Health check — restart agentsam pm2 if public endpoint is down
HTTP_STATUS="$(curl -sf -o /dev/null -w '%{http_code}' "${HEALTH_URL}" 2>/dev/null || echo '000')"
if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "${LOG_PREFIX} health: OK (${HTTP_STATUS})"
else
  echo "${LOG_PREFIX} health: FAIL (${HTTP_STATUS}) — restarting pm2 execos"
  agentsam_pm2 "pm2 restart execos --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --update-env 2>/dev/null || true"
  agentsam_pm2 "pm2 save 2>/dev/null || true"
fi

# 5. Ensure cloudflared tunnel is running
if ! pgrep -x cloudflared >/dev/null 2>&1; then
  echo "${LOG_PREFIX} cloudflared: not running — attempting start via systemd"
  systemctl start cloudflared 2>/dev/null || \
    echo "${LOG_PREFIX} cloudflared: systemctl start failed — check: systemctl status cloudflared"
else
  echo "${LOG_PREFIX} cloudflared: running"
fi

echo "${LOG_PREFIX} done"
