#!/usr/bin/env bash
# Rotate / refresh CLOUDFLARE_API_TOKEN for local wrangler + .env.cloudflare.
#
# Flow:
#   1. Paste this command
#   2. Script prompts for the new token (hidden — never echoed)
#   3. Validates against Cloudflare (tokens/verify + account probe)
#   4. Upserts .env.cloudflare only if valid — prints length/prefix only
#
# Usage:
#   npm run rotate:cf-api-token
#   ./scripts/rotate-cloudflare-api-token.sh
#   ./scripts/rotate-cloudflare-api-token.sh --paste   # read from clipboard
#
# Notes:
#   - This updates LOCAL operator env (.env.cloudflare) used by with-cloudflare-env.sh / wrangler.
#   - It does NOT put CLOUDFLARE_API_TOKEN into Worker secrets (that token is for CLI/API, not the Worker).
#   - Workers AI binding (env.AI) uses account identity — separate from this token.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
MODE="hidden"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --paste) MODE="paste"; shift ;;
    --visible) MODE="visible"; shift ;;
    --hidden) MODE="hidden"; shift ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (try --hidden, --paste, --visible)" >&2
      exit 1
      ;;
  esac
done

if [[ ! -t 0 && "$MODE" == "hidden" ]]; then
  echo "ERROR: need an interactive terminal (or use --paste / pipe with --visible)." >&2
  exit 1
fi

# shellcheck source=scripts/lib/read-secret-prompt.sh
source "$REPO_ROOT/scripts/lib/read-secret-prompt.sh"

echo ""
echo "Cloudflare API token rotate → .env.cloudflare"
echo "  Create/rotate at: https://dash.cloudflare.com/profile/api-tokens"
echo "  Suggested template: Edit Cloudflare Workers (+ Account → Workers AI / D1 if you use them)"
echo "  Never paste the token into chat."
echo ""

# Load account id from existing env file if present (no token needed).
ACCOUNT_ID=""
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # Prefer sourcing only ACCOUNT_ID without loading a dead token into this shell for verify.
  ACCOUNT_ID="$(
    python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
if not p.exists():
    raise SystemExit(0)
for line in p.read_text().splitlines():
    s = line.strip()
    if not s or s.startswith("#"):
        continue
    m = re.match(r'^CLOUDFLARE_ACCOUNT_ID=(.*)$', s)
    if m:
        v = m.group(1).strip().strip('"').strip("'")
        print(v)
        break
PY
  )"
  set +a
fi

if [[ -z "${ACCOUNT_ID}" ]]; then
  echo "→ CLOUDFLARE_ACCOUNT_ID missing in .env.cloudflare"
  echo "  Paste account id (visible) and press Enter:"
  read -r ACCOUNT_ID
  ACCOUNT_ID="$(printf '%s' "$ACCOUNT_ID" | tr -d '[:space:]"'\''')"
fi

if [[ -z "${ACCOUNT_ID}" || ${#ACCOUNT_ID} -lt 16 ]]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID looks empty/invalid (len=${#ACCOUNT_ID})." >&2
  exit 1
fi

READ_SECRET_MODE="$MODE"
TOKEN="$(read_secret_interactive "CLOUDFLARE_API_TOKEN")"

# Validate + write in Python so the token isn't printed and failed tokens aren't saved.
export _CF_ROTATE_TOKEN="$TOKEN"
export _CF_ROTATE_ACCOUNT_ID="$ACCOUNT_ID"
export _CF_ROTATE_ENV_FILE="$ENV_FILE"
unset TOKEN

python3 <<'PY'
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

token = (os.environ.get("_CF_ROTATE_TOKEN") or "").strip()
account_id = (os.environ.get("_CF_ROTATE_ACCOUNT_ID") or "").strip()
env_path = Path(os.environ.get("_CF_ROTATE_ENV_FILE") or "")

# Scrub from this process env ASAP after copy
os.environ.pop("_CF_ROTATE_TOKEN", None)

if not token:
    print("ERROR: empty token", file=sys.stderr)
    sys.exit(1)
if not env_path:
    print("ERROR: missing env file path", file=sys.stderr)
    sys.exit(1)

prefix = token[:4]
print(f"→ Validating token (len={len(token)} prefix={prefix}… account={account_id[:8]}…)")

ctx = ssl.create_default_context()

def cf_get(url: str):
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {"raw": body[:300]}
        return e.code, data

status, verify = cf_get("https://api.cloudflare.com/client/v4/user/tokens/verify")
ok = bool(verify.get("success")) and str((verify.get("result") or {}).get("status") or "").lower() == "active"
if not ok:
    errs = verify.get("errors") or []
    msg = errs[0].get("message") if errs and isinstance(errs[0], dict) else verify
    print(f"✗ Token verify failed (HTTP {status}): {msg}", file=sys.stderr)
    print("  Create a new API token in the dashboard and re-run. Nothing was written.", file=sys.stderr)
    sys.exit(2)

print("✓ tokens/verify → active")

# Account-scoped probe (catches token that verifies but lacks account access)
st2, acct = cf_get(f"https://api.cloudflare.com/client/v4/accounts/{account_id}")
if not acct.get("success"):
    errs = acct.get("errors") or []
    msg = errs[0].get("message") if errs and isinstance(errs[0], dict) else acct
    print(f"✗ Account probe failed (HTTP {st2}): {msg}", file=sys.stderr)
    print("  Token is active but cannot read this account. Check token permissions / account id.", file=sys.stderr)
    sys.exit(3)

print(f"✓ account access ok ({account_id[:8]}…)")

# Optional light AI probe — do not fail rotate if AI permission missing
st3, ai = cf_get(f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/models")
if ai.get("success"):
    print("✓ Workers AI models list reachable (token can call AI API)")
else:
    print("⚠ Workers AI models list not reachable with this token (optional for wrangler/D1)")
    print("  Add Workers AI / Account AI permissions if you need REST MiniMax probes.")

def upsert(path: Path, key: str, value: str) -> None:
    # Prefer unquoted values unless needed; keep quotes if value has spaces (tokens won't)
    if re.search(r'[\s#"\']', value):
        new_line = f'{key}="{value}"'
    else:
        new_line = f"{key}={value}"
    lines = path.read_text().splitlines() if path.exists() else []
    out = []
    found = False
    for line in lines:
        if line.strip().startswith(f"{key}="):
            if not found:
                out.append(new_line)
                found = True
            # drop duplicate KEY= lines
        else:
            out.append(line)
    if not found:
        if out and out[-1].strip():
            out.append("")
        out.append(f"# {key} — local wrangler/API only (NOT a Worker secret)")
        out.append(new_line)
    path.write_text("\n".join(out).rstrip() + "\n")

if not env_path.exists():
    example = env_path.with_name(".env.cloudflare.example")
    if example.exists():
        env_path.write_text(example.read_text())
        print(f"→ Created {env_path.name} from example")
    else:
        env_path.write_text("# local Cloudflare operator env (gitignored)\n")

upsert(env_path, "CLOUDFLARE_ACCOUNT_ID", account_id)
upsert(env_path, "CLOUDFLARE_API_TOKEN", token)

print(f"✓ Updated {env_path.name}")
print(f"  CLOUDFLARE_API_TOKEN len={len(token)} prefix={prefix}… (value not printed)")
print("  Wrangler will pick this up via: ./scripts/with-cloudflare-env.sh …")
print("  Smoke: npm run rotate:cf-api-token:smoke")
PY

# Ensure shell leftovers are cleared
unset _CF_ROTATE_TOKEN _CF_ROTATE_ACCOUNT_ID _CF_ROTATE_ENV_FILE

echo ""
echo "Done. Next (optional smoke — no secret printed):"
echo "  npm run rotate:cf-api-token:smoke"
echo "  ./scripts/with-cloudflare-env.sh npx wrangler whoami"
