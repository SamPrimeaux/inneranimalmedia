#!/usr/bin/env zsh
# Lightweight post-deploy smoke: health, E2E route auth gate, optional dry_run E2E, D1 flag query.
# Non-fatal when sourced from deploy-full; safe to run standalone.
# Requires: .env.cloudflare or env with IAM_TEST_SECRET; Worker must have IAM_ENABLE_E2E_TEST_ROUTES=true for E2E 200.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BASE_URL="${IAM_SMOKE_BASE_URL:-https://inneranimalmedia.com}"
DB_NAME="${D1_DATABASE_NAME:-inneranimalmedia-business}"
WRANGLER_CFG="${WRANGLER_PRODUCTION_CONFIG:-wrangler.production.toml}"

set -a
[[ -f "$REPO_ROOT/.env.cloudflare" ]] && source "$REPO_ROOT/.env.cloudflare"
set +a

fail() { echo "[smoke] FAIL: $*"; return 1; }

echo "[smoke] GET $BASE_URL/api/health"
code="$(curl -sS -o /tmp/iam-smoke-health.txt -w '%{http_code}' "$BASE_URL/api/health" || true)"
[[ "$code" == "200" ]] || fail "health HTTP $code"
grep -q . /tmp/iam-smoke-health.txt || fail "health empty body"

echo "[smoke] E2E without secret (expect 401, or 404 when route disabled)"
code="$(curl -sS -o /tmp/iam-smoke-e2e.txt -w '%{http_code}' -X POST "$BASE_URL/api/test/code-execution-e2e" -H 'Content-Type: application/json' -d '{}' || true)"
[[ "$code" == "401" || "$code" == "404" ]] || fail "E2E without secret: expected 401 or 404 got $code"

secret="${IAM_TEST_SECRET:-${PTY_AUTH_TOKEN:-}}"
if [[ -z "$secret" ]]; then
  echo "[smoke] SKIP dry_run E2E (no IAM_TEST_SECRET / PTY_AUTH_TOKEN)"
else
  if [[ "${IAM_ENABLE_E2E_TEST_ROUTES:-}" == "true" ]]; then
    echo "[smoke] E2E dry_run invalid_model_preference (expect pass JSON)"
    code="$(curl -sS -o /tmp/iam-smoke-e2e2.txt -w '%{http_code}' -X POST "$BASE_URL/api/test/code-execution-e2e" \
      -H 'Content-Type: application/json' -H "X-IAM-Test-Secret: $secret" \
      -d '{"dry_run":true,"mode":"invalid_model_preference","model_preference":"__smoke_bad__"}' || true)"
    [[ "$code" == "200" ]] || fail "E2E dry_run HTTP $code"
    grep -q '"pass":true' /tmp/iam-smoke-e2e2.txt || fail "E2E dry_run unexpected body"
  else
    echo "[smoke] SKIP dry_run E2E (set IAM_ENABLE_E2E_TEST_ROUTES=true locally only to assert 200 after Worker secret is set)"
  fi
fi

echo "[smoke] D1 quick null check (tool_chain duration last 20h)"
if command -v cf_d1 >/dev/null 2>&1; then
  cf_d1 execute "$DB_NAME" --remote -c "$WRANGLER_CFG" --command "SELECT COUNT(*) AS n FROM agentsam_tool_chain WHERE completed_at > unixepoch('now','-20 hours') AND duration_ms IS NULL LIMIT 1;" || true
else
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler d1 execute "$DB_NAME" --remote -c "$WRANGLER_CFG" \
    --command "SELECT COUNT(*) AS n FROM agentsam_tool_chain WHERE completed_at > unixepoch('now','-20 hours') AND duration_ms IS NULL LIMIT 1;" || true
fi

echo "[smoke] OK"
