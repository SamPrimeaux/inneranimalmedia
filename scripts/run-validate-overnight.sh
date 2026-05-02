#!/usr/bin/env bash
# Trigger REMOTE validation (worker runs screenshots + proof email). No local env for Resend/D1.
# Usage: export OVERNIGHT_SESSION_COOKIE=<your-session-cookie> then ./scripts/run-validate-overnight.sh
# Get cookie: log in at https://inneranimalmedia.com/dashboard, DevTools → Application → Cookies → session

set -e
BASE="${OVERNIGHT_BASE_URL:-https://inneranimalmedia.com}"
COOKIE="${OVERNIGHT_SESSION_COOKIE:-}"

if [[ -z "$COOKIE" ]]; then
  echo "Remote validation requires a session cookie (superadmin)."
  echo "  1. Log in at $BASE/dashboard (with your account email)"
  echo "  2. Copy the 'session' cookie value from DevTools → Application → Cookies"
  echo "  3. export OVERNIGHT_SESSION_COOKIE=<paste-value>"
  echo "  4. ./scripts/run-validate-overnight.sh"
  echo "Or from the dashboard, run in console: fetch('/api/admin/overnight/validate',{method:'POST',credentials:'include'}).then(r=>r.json()).then(console.log)"
  exit 1
fi

echo "Triggering remote validation (worker will capture screenshots and send proof email)..."
RESP=$(curl -s -w "\n%{http_code}" -X POST -b "session=$COOKIE" "$BASE/api/admin/overnight/validate")
HTTP=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')
echo "$BODY" | head -20
if [[ "$HTTP" == "202" ]]; then
  echo ""
  echo "Validation started on worker. Check your configured RESEND_TO for the proof email; screenshots → R2 reports/screenshots/before-<date>/"
else
  echo "HTTP $HTTP"
  exit 1
fi
