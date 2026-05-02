#!/usr/bin/env bash
# Trigger REMOTE pipeline start (worker runs before screenshots + first email). No local env.
# Usage: export OVERNIGHT_SESSION_COOKIE=<your-session-cookie> then ./scripts/run-overnight-pipeline.sh
# Get cookie: log in at https://inneranimalmedia.com/dashboard, DevTools → Application → Cookies → session

set -e
BASE="${OVERNIGHT_BASE_URL:-https://inneranimalmedia.com}"
COOKIE="${OVERNIGHT_SESSION_COOKIE:-}"

if [[ -z "$COOKIE" ]]; then
  echo "Remote pipeline start requires a session cookie (superadmin)."
  echo "  1. Log in at $BASE/dashboard"
  echo "  2. Copy the 'session' cookie value from DevTools → Application → Cookies"
  echo "  3. export OVERNIGHT_SESSION_COOKIE=<paste-value>"
  echo "  4. ./scripts/run-overnight-pipeline.sh"
  echo "Or from the dashboard console: fetch('/api/admin/overnight/start',{method:'POST',credentials:'include'}).then(r=>r.json()).then(console.log)"
  exit 1
fi

echo "Triggering remote pipeline start (worker: before screenshots + first email)..."
RESP=$(curl -s -w "\n%{http_code}" -X POST -b "session=$COOKIE" "$BASE/api/admin/overnight/start")
HTTP=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')
echo "$BODY" | head -20
if [[ "$HTTP" == "202" ]]; then
  echo ""
  echo "Pipeline started on worker. Check inbox for first email; screenshots → R2 reports/screenshots/before-<date>/"
  echo "Note: 30min and hourly updates require a cron or repeated trigger (worker cannot sleep 30min in one request)."
else
  echo "HTTP $HTTP"
  exit 1
fi
