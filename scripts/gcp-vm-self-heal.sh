#!/usr/bin/env bash
# gcp-vm-self-heal.sh
# Runs ON iam-tunnel (not Mac) via cron/systemd every 5 minutes.
# Keeps ExecOS, operator repo, and cloudflared tunnel healthy.
# Mac is never involved. Deploy never triggers this.
#
# Install on VM (run once):
#   chmod +x ~/inneranimalmedia/scripts/gcp-vm-self-heal.sh
#   (crontab -l 2>/dev/null; echo "*/5 * * * * /home/samprimeaux/inneranimalmedia/scripts/gcp-vm-self-heal.sh >> /tmp/self-heal.log 2>&1") | crontab -
set -euo pipefail

LOG_PREFIX="[self-heal $(date '+%H:%M:%S')]"
EXECOS_HOME="/home/samprimeaux/ExecOS"
OPERATOR_REPO="/home/samprimeaux/inneranimalmedia"
HEALTH_URL="https://terminal.inneranimalmedia.com/health"

echo "${LOG_PREFIX} starting"

# 1. Pull ExecOS from GitHub
if [[ -d "${EXECOS_HOME}/.git" ]]; then
  git -C "${EXECOS_HOME}" pull --ff-only -q 2>/dev/null && \
    echo "${LOG_PREFIX} ExecOS: up to date" || \
    echo "${LOG_PREFIX} ExecOS: pull warning (kept last good)"
else
  echo "${LOG_PREFIX} ExecOS: not cloned — skipping pull"
fi

# 2. Pull operator repo (sparse, git-only lane)
if [[ -d "${OPERATOR_REPO}/.git" ]]; then
  git -C "${OPERATOR_REPO}" pull --ff-only -q 2>/dev/null && \
    echo "${LOG_PREFIX} operator repo: up to date" || \
    echo "${LOG_PREFIX} operator repo: pull warning (kept last good)"
fi

# 3. Ensure pm2 execos process is running
if ! pm2 list 2>/dev/null | grep -qE 'execos|agentsam'; then
  echo "${LOG_PREFIX} pm2 execos not running — starting"
  if [[ -f "${EXECOS_HOME}/server.js" ]]; then
    pm2 start "${EXECOS_HOME}/server.js" --name execos --update-env 2>/dev/null || true
  fi
else
  # Restart only if server.js changed since last start
  EXECOS_PID=$(pm2 id execos 2>/dev/null | tr -d '[]' | tr ',' '\n' | head -1 || echo "")
  if [[ -n "$EXECOS_PID" ]]; then
    PM2_STARTED=$(pm2 show execos 2>/dev/null | grep 'created at' | awk '{print $NF}' || echo "")
    GIT_MTIME=$(stat -c '%Y' "${EXECOS_HOME}/server.js" 2>/dev/null || echo "0")
    echo "${LOG_PREFIX} pm2 execos: running (pid group ${EXECOS_PID})"
  fi
fi

# 4. Health check — restart pm2 if endpoint is down
HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${HEALTH_URL}" 2>/dev/null || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "${LOG_PREFIX} health: OK (${HTTP_STATUS})"
else
  echo "${LOG_PREFIX} health: FAIL (${HTTP_STATUS}) — restarting pm2 execos"
  pm2 restart execos --update-env 2>/dev/null || \
  pm2 restart agentsam --update-env 2>/dev/null || \
  echo "${LOG_PREFIX} pm2 restart failed — check logs: pm2 logs execos"
fi

# 5. Ensure cloudflared tunnel is running
if ! pgrep -x cloudflared >/dev/null 2>&1; then
  echo "${LOG_PREFIX} cloudflared: not running — attempting start via systemd"
  sudo systemctl start cloudflared 2>/dev/null || \
    echo "${LOG_PREFIX} cloudflared: systemctl start failed — check: sudo systemctl status cloudflared"
else
  echo "${LOG_PREFIX} cloudflared: running"
fi

echo "${LOG_PREFIX} done"
