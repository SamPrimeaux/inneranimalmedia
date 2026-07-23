#!/usr/bin/env bash
# deploy-trail-gate.sh — END of every production deploy that claims to be shipped.
# Exit 0 = trail complete. Exit 1 = trail broken — deploy MUST NOT report success.
# Not advisory. Do not swallow this exit code.
#
# Usage:
#   ./scripts/deploy-trail-gate.sh [git-ref-or-hash]
#   GIT_HASH=abc123 ./scripts/deploy-trail-gate.sh
#
# Override (logged): ALLOW_SKIP_DEPLOY_TRAIL=1 — only for explicit operator bypass.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${ALLOW_SKIP_DEPLOY_TRAIL:-0}" == "1" ]]; then
  echo "[deploy-trail-gate] ALLOW_SKIP_DEPLOY_TRAIL=1 — bypass logged; trail NOT verified" >&2
  ./scripts/with-cloudflare-env.sh node "$REPO_ROOT/scripts/notify-ops.mjs" \
    --severity=critical \
    --message="Deploy trail gate BYPASSED (ALLOW_SKIP_DEPLOY_TRAIL=1) at $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    || true
  exit 0
fi

GIT_REF="${1:-${GIT_HASH:-}}"
if [[ -z "$GIT_REF" ]]; then
  GIT_REF="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -z "$GIT_REF" ]]; then
  echo "❌ DEPLOY TRAIL GATE FAILED: git hash required" >&2
  exit 1
fi

exec ./scripts/with-cloudflare-env.sh node "$REPO_ROOT/scripts/deploy-trail-gate.mjs" "$GIT_REF"
