#!/usr/bin/env zsh
# RealtimeKit REST smoke — prefers REALTIMEKIT_API_TOKEN (narrow Realtime Admin), else Break Glass.
# Usage: ./scripts/cloudflare/realtimekit-smoke.sh
# Optional: REALTIMEKIT_APP_ID=... CLOUDFLARE_ACCOUNT_ID=... (defaults below)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-ede6590ac0d2fb7daf155b35653457b2}"
APP_ID="${REALTIMEKIT_APP_ID:-08755a39-bfb2-4c6a-b322-527ba7ef0698}"
TOKEN="${REALTIMEKIT_API_TOKEN:-${CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}}"

if [[ -z "$TOKEN" ]]; then
  echo "Missing CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN or CLOUDFLARE_API_TOKEN in .env.cloudflare" >&2
  exit 1
fi

API_BASE="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/realtime/kit/${APP_ID}"

cf_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${API_BASE}${path}"
  local curl_bin="${CURL_BIN:-$(command -v curl || true)}"
  if [[ -z "$curl_bin" ]]; then
    curl_bin="/usr/bin/curl"
  fi
  if [[ -n "$body" ]]; then
    "$curl_bin" -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    "$curl_bin" -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

assert_success() {
  local label="$1"
  local json="$2"
  node -e "
    const j = JSON.parse(process.argv[1]);
    if (!j.success) {
      console.error('FAIL ${label}:', JSON.stringify(j, null, 2));
      process.exit(1);
    }
    console.log('OK ${label}');
  " "$json"
}

echo "=== RealtimeKit smoke (account=${ACCOUNT_ID}, app=${APP_ID}) ==="

echo "--- 1. List presets ---"
PRESETS="$(cf_api GET "/presets")"
assert_success "list presets" "$PRESETS"
node -e "
  const j = JSON.parse(process.argv[1]);
  const names = (j.data || []).map((p) => p.name).filter(Boolean);
  console.log('Presets:', names.join(', ') || '(none)');
  const required = ['group_call_host', 'group_call_participant', 'group_call_guest'];
  for (const r of required) {
    if (!names.includes(r)) console.warn('WARN: preset missing:', r);
  }
" "$PRESETS"

echo "--- 2. Create meeting ---"
MEETING_TITLE="iam-smoke-$(date +%s)"
CREATE_BODY="$(node -e "process.stdout.write(JSON.stringify({ title: process.argv[1] }))" "$MEETING_TITLE")"
CREATE_RES="$(cf_api POST "/meetings" "$CREATE_BODY")"
assert_success "create meeting" "$CREATE_RES"
MEETING_ID="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).data.id)" "$CREATE_RES")"
echo "Meeting id: ${MEETING_ID}"

echo "--- 3. Add host participant ---"
PART_BODY="$(node -e "
process.stdout.write(JSON.stringify({
  name: 'Smoke Host',
  preset_name: 'group_call_host',
  custom_participant_id: 'smoke_host_' + Date.now(),
}));
")"
PART_RES="$(cf_api POST "/meetings/${MEETING_ID}/participants" "$PART_BODY")"
assert_success "add participant" "$PART_RES"
node -e "
  const j = JSON.parse(process.argv[1]);
  const token = j.data?.token;
  if (!token || String(token).length < 20) {
    console.error('FAIL: participant token missing or too short');
    process.exit(1);
  }
  console.log('OK participant token (len=' + String(token).length + ')');
" "$PART_RES"

echo "--- 4. End meeting (PATCH INACTIVE — DELETE may 404) ---"
END_BODY='{"status":"INACTIVE"}'
END_RES="$(cf_api PATCH "/meetings/${MEETING_ID}" "$END_BODY" || true)"
if node -e "
  try {
    const j = JSON.parse(process.argv[1]);
    if (j.success) { console.log('OK end meeting'); process.exit(0); }
  } catch {}
  process.exit(1);
" "$END_RES" 2>/dev/null; then
  :
else
  echo "WARN: meeting end returned non-success (meeting ${MEETING_ID} may need manual cleanup in RTK dashboard)"
fi

echo "=== RealtimeKit smoke passed ==="
