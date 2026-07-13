#!/usr/bin/env bash
# Smoke-check CLOUDFLARE_API_TOKEN from .env.cloudflare without printing the secret.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load env into this process (does not print secrets).
# shellcheck disable=SC1091
set -a
# Prefer sourcing via with-cloudflare-env by re-exec under it when token unset.
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" && -f "$REPO_ROOT/.env.cloudflare" ]]; then
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env.cloudflare"
fi
set +a

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  exec "$REPO_ROOT/scripts/with-cloudflare-env.sh" "$0" "$@"
fi

tok="${CLOUDFLARE_API_TOKEN}"
aid="${CLOUDFLARE_ACCOUNT_ID:-}"
echo "token_len=${#tok} prefix=${tok:0:4}… account=${aid:0:8}…"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
code=$(curl -sS -o "$tmp" -w "%{http_code}" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")

python3 - "$tmp" "$code" <<'PY'
import json, sys
from pathlib import Path
path, code = Path(sys.argv[1]), sys.argv[2]
d = json.loads(path.read_text())
ok = bool(d.get("success")) and str((d.get("result") or {}).get("status") or "").lower() == "active"
print(f"verify_http={code} success={d.get('success')} status={(d.get('result') or {}).get('status')}")
if not ok:
    print("errors:", (d.get("errors") or [])[:2])
    raise SystemExit(2)
print("✓ CLOUDFLARE_API_TOKEN is active")
PY

cd "$REPO_ROOT"
npx wrangler whoami 2>&1 | head -30
