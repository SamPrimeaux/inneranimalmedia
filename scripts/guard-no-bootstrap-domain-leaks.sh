#!/usr/bin/env bash
# Client-side: bootstrap loader must not fetch agent-domain endpoints.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOADER="dashboard/src/loadDashboardBootstrap.ts"
fail=0

for pattern in '/api/agent/policy' '/api/agent/models' 'agent_policy' 'fetchAgentPolicy'; do
  if rg -q "$pattern" "$LOADER"; then
    echo "guard-no-bootstrap-domain-leaks: FAIL — $pattern in $LOADER" >&2
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "guard-no-bootstrap-domain-leaks: OK"
