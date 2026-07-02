#!/usr/bin/env bash
# Fail if dashboard bootstrap handler leaks L2 agent-domain data into the L1 envelope.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BOOT="src/api/dashboard-bootstrap.js"
fail=0

check_absent() {
  local label="$1"
  local pattern="$2"
  if rg -q "$pattern" "$BOOT"; then
    echo "guard-bootstrap-l1-fields: FAIL — $label still in $BOOT" >&2
    fail=1
  fi
}

check_absent "agent_policy response field" '^[[:space:]]+agent_policy,'
check_absent "agent L2 block" '^[[:space:]]+agent:[[:space:]]*\{'
check_absent "agentsam_model_catalog query" 'agentsam_model_catalog'
check_absent "fetchDashboardBootstrapAgentPolicy" 'fetchDashboardBootstrapAgentPolicy'
check_absent "resolveActiveBootstrap (default_model)" 'resolveActiveBootstrap'

if rg -q '_meta:\s*\{' "$BOOT"; then
  echo "guard-bootstrap-l1-fields: OK — _meta present"
else
  echo "guard-bootstrap-l1-fields: WARN — _meta telemetry block missing (non-fatal)" >&2
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "guard-bootstrap-l1-fields: OK — L1 bootstrap free of agent domain leaks"
