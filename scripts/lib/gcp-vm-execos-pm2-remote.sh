#!/usr/bin/env bash
# Remote shell snippet: ensure ExecOS PM2 runs as agentsam, never samprimeaux (SSH login).
# Source on Mac and append to gcloud ssh --command, or run via:
#   gcloud compute ssh iam-tunnel --command "$(bash scripts/lib/gcp-vm-execos-pm2-remote.sh)"
#
# Optional env before snippet:
#   VM_EXECOS=/home/samprimeaux/ExecOS
#   EXECOS_DEFAULT_CWD=/home/samprimeaux/inneranimalmedia
#
# Stability (2026-07): never block on `pm2 delete` under samprimeaux — those hung for days
# and left orphan ExecOS PIDs fighting for :3099 (EADDRINUSE → tunnel degraded flaps).

: "${VM_EXECOS:=/home/samprimeaux/ExecOS}"
: "${AGENTSAM_USER:=agentsam}"
: "${PM2_HOME_AGENTSAM:=/var/lib/agentsam/.pm2}"

cat <<REMOTE
set -euo pipefail
VM_EXECOS='${VM_EXECOS}'
AGENTSAM_USER='${AGENTSAM_USER}'
PM2_HOME_AGENTSAM='${PM2_HOME_AGENTSAM}'
EXECOS_DEFAULT_CWD='${EXECOS_DEFAULT_CWD:-/home/samprimeaux/inneranimalmedia}'

# Stop samprimeaux PM2 lane — non-blocking (timeout + pkill). Never hang on pm2 delete.
if id samprimeaux &>/dev/null; then
  timeout 2 sudo -u samprimeaux pm2 kill >/dev/null 2>&1 || true
  sudo pkill -9 -u samprimeaux -f 'pm2 delete' 2>/dev/null || true
  sudo pkill -9 -u samprimeaux -f 'PM2 v' 2>/dev/null || true
fi
sudo pkill -u samprimeaux -f "\${VM_EXECOS}/server.js" 2>/dev/null || true

# Free orphan ExecOS listeners before start (EADDRINUSE).
# Use /proc cmdline — never pkill -f a path present in this bash -c argv.
for p in \$(ps -C node -o pid= 2>/dev/null || true); do
  p=\$(echo "\$p" | tr -d '[:space:]')
  [[ -n "\$p" ]] || continue
  cmd=\$(tr '\\0' ' ' <"/proc/\${p}/cmdline" 2>/dev/null || true)
  case "\$cmd" in
    *ExecOS/server.js*) sudo kill -9 "\$p" 2>/dev/null || true ;;
  esac
done
for p in \$(sudo lsof -ti :3099 2>/dev/null || true); do
  sudo kill -9 "\$p" 2>/dev/null || true
done
sleep 1

sudo -u "\${AGENTSAM_USER}" bash -lc "
  export PM2_HOME=\${PM2_HOME_AGENTSAM}
  export EXECOS_DEFAULT_CWD=\${EXECOS_DEFAULT_CWD}
  cd '\${VM_EXECOS}'
  timeout 15 pm2 delete execos >/dev/null 2>&1 || true
  timeout 20 pm2 start ecosystem.config.cjs --update-env
  timeout 10 pm2 save >/dev/null 2>&1 || true
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
