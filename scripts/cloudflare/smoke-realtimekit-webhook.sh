#!/usr/bin/env zsh
# Smoke POST /api/webhooks/realtimekit with REALTIMEKIT_WEBHOOK_SECRET (simulated event).
# Usage: ./scripts/cloudflare/smoke-realtimekit-webhook.sh [meeting_id] [room_id]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

BASE="${IAM_BASE_URL:-https://webhooks.inneranimalmedia.com}"
SECRET="${REALTIMEKIT_WEBHOOK_SECRET:-}"
MEETING_ID="${1:-smoke-meeting-id}"
ROOM_HINT="${2:-}"

if [[ -z "$SECRET" ]]; then
  echo "REALTIMEKIT_WEBHOOK_SECRET required in .env.cloudflare or Worker secret" >&2
  exit 1
fi

BODY="$(node -e "
const meetingId = process.argv[1];
console.log(JSON.stringify({
  event: 'meeting.participantJoined',
  meeting: {
    id: meetingId,
    sessionId: 'smoke-session',
    title: 'Webhook smoke',
    status: 'LIVE',
    startedAt: new Date().toISOString(),
  },
  participant: {
    customParticipantId: 'smoke_user',
    userDisplayName: 'Smoke',
    joinedAt: new Date().toISOString(),
  },
}));
" "$MEETING_ID")"

HTTP="$(curl -sS -o /tmp/iam_rtk_wh_smoke.json -w '%{http_code}' \
  -X POST "${BASE}/api/webhooks/realtimekit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "dyte-uuid: smoke-$(date +%s)" \
  -d "$BODY")"

echo "HTTP ${HTTP}"
cat /tmp/iam_rtk_wh_smoke.json
echo

if [[ "$HTTP" != "200" ]]; then
  exit 1
fi

echo "PASS realtimekit webhook smoke (use real meeting_id from meet_rooms.realtimekit_meeting_id for D1 patch)"
if [[ -n "$ROOM_HINT" ]]; then
  echo "room hint: $ROOM_HINT"
fi
