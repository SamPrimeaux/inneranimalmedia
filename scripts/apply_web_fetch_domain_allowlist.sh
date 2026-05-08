#!/usr/bin/env bash
# Apply rows to agentsam_fetch_domain_allowlist for web_fetch (D1 remote).
# Uses a generated SQL file only — avoids inline zsh and history expansion on patterns like !_allowed.
set -euo pipefail
set +H 2>/dev/null || true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_ID="${FETCH_ALLOWLIST_USER_ID:-sam_primeaux}"
WS_ID="${FETCH_ALLOWLIST_WORKSPACE_ID:-ws_inneranimalmedia}"

TMP="$(mktemp "${TMPDIR:-/tmp}/iam_fetch_allowlist.XXXXXX.sql")"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

{
  cat <<'HDR'
-- web_fetch domain allowlist patch (agentsam_fetch_domain_allowlist)
-- Edit FETCH_ALLOWLIST_USER_ID / FETCH_ALLOWLIST_WORKSPACE_ID before running if needed.
HDR
  for host in \
    inneranimalmedia.com \
    www.inneranimalmedia.com \
    mcp.inneranimalmedia.com \
    github.com \
    api.github.com \
    raw.githubusercontent.com; do
    host_esc="${host//./_}"
    id="fda_${WS_ID}_${host_esc}"
    printf "INSERT INTO agentsam_fetch_domain_allowlist (id, user_id, workspace_id, host, created_at) VALUES ('%s', '%s', '%s', '%s', datetime('now')) ON CONFLICT(user_id, workspace_id, host) DO NOTHING;\n" \
      "$id" "$USER_ID" "$WS_ID" "$host"
  done
} >"$TMP"

cd "$ROOT"
exec ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file="$TMP"
