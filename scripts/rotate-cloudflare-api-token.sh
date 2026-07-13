#!/usr/bin/env bash
# Rotate CLOUDFLARE_API_TOKEN -> .env.cloudflare (+ optional Worker secret).
# ASCII-only prompts. Junk in the paste (arrows/labels) is stripped, not rejected.
#
#   npm run rotate:cf-api-token
#   npm run rotate:cf-api-token:paste      # from clipboard
#   npm run rotate:cf-api-token:worker     # also wrangler secret put
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
MODE="stdin_prompt" # stdin_prompt | paste | visible
SYNC_WORKER="ask"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.production.toml}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --paste) MODE="paste"; shift ;;
    --visible) MODE="visible"; shift ;;
    --hidden|--prompt) MODE="stdin_prompt"; shift ;;
    --also-worker-secret) SYNC_WORKER="yes"; shift ;;
    --local-only) SYNC_WORKER="no"; shift ;;
    -h|--help)
      echo "Usage: $0 [--paste|--visible|--also-worker-secret|--local-only]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo ""
echo "Cloudflare API token -> .env.cloudflare"
echo "Create token: https://dash.cloudflare.com/profile/api-tokens"
echo ""

ACCOUNT_ID="$(
  python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
if not p.exists():
    raise SystemExit(0)
for line in p.read_text().splitlines():
    m = re.match(r'^CLOUDFLARE_ACCOUNT_ID=(.*)$', line.strip())
    if m:
        print(m.group(1).strip().strip('"').strip("'"))
        break
PY
)"

if [[ -z "${ACCOUNT_ID}" ]]; then
  printf "CLOUDFLARE_ACCOUNT_ID: "
  read -r ACCOUNT_ID
  ACCOUNT_ID="$(printf '%s' "$ACCOUNT_ID" | tr -d '[:space:]"'\''')"
fi
if [[ ${#ACCOUNT_ID} -lt 16 ]]; then
  echo "ERROR: bad CLOUDFLARE_ACCOUNT_ID" >&2
  exit 1
fi

RAW=""
case "$MODE" in
  paste)
    if ! command -v pbpaste >/dev/null 2>&1; then
      echo "ERROR: pbpaste missing; use without --paste" >&2
      exit 1
    fi
    echo "Reading token from clipboard..."
    RAW="$(pbpaste || true)"
    ;;
  visible)
    printf "Paste token (visible), then Enter: "
    read -r RAW
    ;;
  *)
    # Default: hidden. Prompt is ASCII only — no unicode arrows.
    printf "Paste token (hidden), then Enter: "
    read -rs RAW
    echo ""
    ;;
esac

export _CF_ROTATE_TOKEN="$RAW"
export _CF_ROTATE_ACCOUNT_ID="$ACCOUNT_ID"
export _CF_ROTATE_ENV_FILE="$ENV_FILE"
unset RAW

python3 <<'PY'
import json, os, re, ssl, sys, urllib.error, urllib.request
from pathlib import Path

raw = os.environ.pop("_CF_ROTATE_TOKEN", "") or ""
account_id = (os.environ.get("_CF_ROTATE_ACCOUNT_ID") or "").strip()
env_path = Path(os.environ.get("_CF_ROTATE_ENV_FILE") or "")

# Keep only CF-token charset; drop arrows, labels, quotes, whitespace, unicode.
cleaned = re.sub(r"(?i)^(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*[:=]?\s*", "", raw.strip())
token = "".join(ch for ch in cleaned if ch.isascii() and (ch.isalnum() or ch in "_-."))
dropped = len(cleaned) - len(token) if cleaned else 0
# Also drop non-ascii from cleaned length accounting
if any(ord(c) > 127 for c in cleaned):
    dropped = max(dropped, 1)

if not token or len(token) < 20:
    print("ERROR: could not find a token in what you pasted (need 20+ ascii chars).", file=sys.stderr)
    print("Copy the token from the Cloudflare dashboard, then re-run.", file=sys.stderr)
    print(f"  raw_len={len(raw)} cleaned_len={len(token)}", file=sys.stderr)
    sys.exit(1)

print(f"Validating (len={len(token)} prefix={token[:4]}... account={account_id[:8]}...)")
if dropped:
    print("(stripped non-token characters from paste)")

ctx = ssl.create_default_context()

def cf_get(url: str):
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
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
    except Exception as e:
        print(f"ERROR: network/verify failed: {e}", file=sys.stderr)
        sys.exit(2)

status, verify = cf_get("https://api.cloudflare.com/client/v4/user/tokens/verify")
ok = bool(verify.get("success")) and str((verify.get("result") or {}).get("status") or "").lower() == "active"
if not ok:
    errs = verify.get("errors") or []
    msg = errs[0].get("message") if errs and isinstance(errs[0], dict) else verify
    print(f"ERROR: token verify failed (HTTP {status}): {msg}", file=sys.stderr)
    print("Nothing written.", file=sys.stderr)
    sys.exit(2)
print("OK tokens/verify active")

st2, acct = cf_get(f"https://api.cloudflare.com/client/v4/accounts/{account_id}")
if not acct.get("success"):
    errs = acct.get("errors") or []
    msg = errs[0].get("message") if errs and isinstance(errs[0], dict) else acct
    print(f"ERROR: account probe failed (HTTP {st2}): {msg}", file=sys.stderr)
    sys.exit(3)
print(f"OK account access ({account_id[:8]}...)")

def upsert(path: Path, key: str, value: str) -> None:
    new_line = f"{key}={value}"
    lines = path.read_text().splitlines() if path.exists() else []
    out, found = [], False
    for line in lines:
        if line.strip().startswith(f"{key}="):
            if not found:
                out.append(new_line)
                found = True
        else:
            out.append(line)
    if not found:
        if out and out[-1].strip():
            out.append("")
        out.append(new_line)
    path.write_text("\n".join(out).rstrip() + "\n")

if not env_path.exists():
    example = env_path.with_name(".env.cloudflare.example")
    env_path.write_text(example.read_text() if example.exists() else "# cloudflare env\n")

upsert(env_path, "CLOUDFLARE_ACCOUNT_ID", account_id)
upsert(env_path, "CLOUDFLARE_API_TOKEN", token)
print(f"OK wrote {env_path.name} (token len={len(token)}, not printed)")
PY

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

do_worker_sync() {
  echo "Syncing Worker secret CLOUDFLARE_API_TOKEN..."
  printf '%s' "${CLOUDFLARE_API_TOKEN}" | ./scripts/with-cloudflare-env.sh npx wrangler secret put CLOUDFLARE_API_TOKEN -c "$WRANGLER_CONFIG"
  if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    printf '%s' "${CLOUDFLARE_ACCOUNT_ID}" | ./scripts/with-cloudflare-env.sh npx wrangler secret put CLOUDFLARE_ACCOUNT_ID -c "$WRANGLER_CONFIG" || true
  fi
  echo "OK Worker secrets updated"
}

case "$SYNC_WORKER" in
  yes) do_worker_sync ;;
  no) echo "Skipped Worker secret sync" ;;
  ask)
    if [[ -t 0 ]]; then
      printf "Also push to Worker secret? [Y/n] "
      read -r ans || ans="Y"
      case "${ans:-Y}" in n|N|no|NO) echo "Skipped Worker secret" ;; *) do_worker_sync ;; esac
    else
      echo "Non-interactive: skip Worker secret (pass --also-worker-secret)"
    fi
    ;;
esac

unset CLOUDFLARE_API_TOKEN _CF_ROTATE_TOKEN _CF_ROTATE_ACCOUNT_ID _CF_ROTATE_ENV_FILE
echo ""
echo "Done. Smoke: npm run rotate:cf-api-token:smoke"
