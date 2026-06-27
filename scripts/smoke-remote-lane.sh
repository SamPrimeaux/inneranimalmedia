#!/usr/bin/env bash
# Prove Sam's remote lane works without Mac (GCP cloud desk).
# Usage: ./scripts/smoke-remote-lane.sh
#        EXECOS_BRIDGE_KEY=… ./scripts/smoke-remote-lane.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

VM_REPO="${IAM_GCP_REPO_PATH:-/home/samprimeaux/inneranimalmedia}"
FAIL=0

pass() { echo "✓ $*"; }
fail() { echo "✗ $*"; FAIL=1; }

echo "━━━ Remote lane smoke (Mac-asleep simulation) ━━━"
echo ""

code="$(curl -sS -m 15 -o /tmp/iam-terminal-health.json -w '%{http_code}' \
  https://terminal.inneranimalmedia.com/health 2>/dev/null || echo 000)"
if [[ "$code" == "200" ]]; then
  pass "terminal.inneranimalmedia.com/health → HTTP $code"
  head -c 120 /tmp/iam-terminal-health.json 2>/dev/null; echo
else
  fail "terminal.inneranimalmedia.com/health → HTTP $code (expected 200)"
fi

local_code="$(curl -sS -m 8 -o /dev/null -w '%{http_code}' \
  https://localpty.inneranimalmedia.com/health 2>/dev/null || echo 000)"
echo "  (reference) localpty → HTTP ${local_code} — remote lane must not depend on this"

BRIDGE="${AGENTSAM_BRIDGE_KEY:-${EXECOS_BRIDGE_KEY:-${PTY_AUTH_TOKEN:-}}}"
EXEC_USER="${IAM_REMOTE_EXEC_USER:-agentsam}"
if [[ -n "$BRIDGE" ]]; then
  payload="$(jq -nc --arg cmd "cd ${VM_REPO} && git rev-parse --short HEAD && echo REMOTE_LANE_OK" '{command:$cmd}')"
  exec_resp="$(curl -sS -m 45 -X POST https://terminal.inneranimalmedia.com/exec \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${BRIDGE}" \
    -H "X-IAM-Exec-Identity: ${EXEC_USER}" \
    -d "$payload" 2>/dev/null || true)"
  if echo "$exec_resp" | grep -q 'REMOTE_LANE_OK'; then
    pass "GCP /exec git rev-parse in ${VM_REPO}"
    echo "  $(echo "$exec_resp" | head -c 200)"
  else
    fail "GCP /exec did not return REMOTE_LANE_OK"
    echo "  response: $(echo "$exec_resp" | head -c 300)"
  fi
else
  echo "⚠ skip /exec (set AGENTSAM_BRIDGE_KEY, EXECOS_BRIDGE_KEY, or PTY_AUTH_TOKEN in .env.cloudflare)"
fi

echo ""
if (( FAIL )); then
  echo "REMOTE LANE SMOKE: FAIL"
  exit 1
fi
echo "REMOTE LANE SMOKE: PASS"
exit 0
