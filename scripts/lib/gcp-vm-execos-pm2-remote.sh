#!/usr/bin/env bash
# Remote shell snippet: ensure ExecOS PM2 runs as agentsam, never samprimeaux (SSH login).
# Source on Mac and append to gcloud ssh --command, or run via:
#   gcloud compute ssh iam-tunnel --command "$(bash scripts/lib/gcp-vm-execos-pm2-remote.sh)"
#
# Optional env before snippet:
#   VM_EXECOS=/home/samprimeaux/ExecOS
#   EXECOS_DEFAULT_CWD=/home/samprimeaux/inneranimalmedia

: "${VM_EXECOS:=/home/samprimeaux/ExecOS}"
: "${AGENTSAM_USER:=agentsam}"
: "${PM2_HOME_AGENTSAM:=/var/lib/agentsam/.pm2}"

cat <<REMOTE
set -euo pipefail
VM_EXECOS='${VM_EXECOS}'
AGENTSAM_USER='${AGENTSAM_USER}'
PM2_HOME_AGENTSAM='${PM2_HOME_AGENTSAM}'
EXECOS_DEFAULT_CWD='${EXECOS_DEFAULT_CWD:-/home/samprimeaux/inneranimalmedia}'

# Stop samprimeaux PM2 lane — SSH sessions must not resurrect execos under login user.
if id samprimeaux &>/dev/null; then
  sudo -u samprimeaux pm2 delete execos 2>/dev/null || true
  sudo -u samprimeaux pm2 delete iam-pty 2>/dev/null || true
  sudo -u samprimeaux pm2 kill 2>/dev/null || true
fi
sudo pkill -u samprimeaux -f '\${VM_EXECOS}/server.js' 2>/dev/null || true

sudo -u "\${AGENTSAM_USER}" bash -lc "
  export PM2_HOME=\${PM2_HOME_AGENTSAM}
  export EXECOS_DEFAULT_CWD=\${EXECOS_DEFAULT_CWD}
  cd '\${VM_EXECOS}'
  pm2 delete execos 2>/dev/null || true
  pm2 start ecosystem.config.cjs --update-env
  pm2 save
"

sleep 2
PM2_USER=""
EXEC_PID=""
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  PM2_LINE=\$(sudo -u "\${AGENTSAM_USER}" bash -lc 'export PM2_HOME='"${PM2_HOME_AGENTSAM}"'; pm2 jlist 2>/dev/null' \
    | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  if not d:
    print(" ")
    raise SystemExit
  env=d[0].get("pm2_env") or {}
  print(str(env.get("username","")) + " " + str(d[0].get("pid","")))
except Exception:
  print(" ")' 2>/dev/null || true)
  PM2_USER="\${PM2_LINE%% *}"
  EXEC_PID="\${PM2_LINE##* }"
  if [[ -n "\${PM2_USER}" && -n "\${EXEC_PID}" && "\${EXEC_PID}" != " " ]]; then
    break
  fi
  sleep 1
done
echo "execos_pm2_user: \${PM2_USER:-unknown} pid=\${EXEC_PID:-none}"
if [[ "\${PM2_USER}" != "\${AGENTSAM_USER}" ]]; then
  echo "execos_runtime_user_mismatch: expected \${AGENTSAM_USER} got \${PM2_USER:-none}" >&2
  exit 1
fi
if [[ -n "\${EXEC_PID}" ]]; then
  RUNTIME=\$(ps -o user= -p "\${EXEC_PID}" 2>/dev/null | tr -d ' ' || true)
  echo "execos_process_user: \${RUNTIME:-unknown}"
  if [[ -n "\${RUNTIME}" && "\${RUNTIME}" != "\${AGENTSAM_USER}" ]]; then
    echo "execos_process_user_mismatch: expected \${AGENTSAM_USER} got \${RUNTIME}" >&2
    exit 1
  fi
fi
REMOTE
