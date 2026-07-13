#!/usr/bin/env bash
# Rotate CLOUDFLARE_API_TOKEN -> .env.cloudflare (+ optional Worker secret).
#
#   npm run rotate:cf-api-token:paste    # preferred: copy token, then run
#   npm run rotate:cf-api-token
#   npm run rotate:cf-api-token:worker
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
MODE="prompt"
SYNC_WORKER="ask"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.production.toml}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --paste) MODE="paste"; shift ;;
    --visible) MODE="visible"; shift ;;
    --hidden|--prompt) MODE="prompt"; shift ;;
    --also-worker-secret) SYNC_WORKER="yes"; shift ;;
    --local-only) SYNC_WORKER="no"; shift ;;
    -h|--help)
      echo "Usage: $0 [--paste|--visible|--also-worker-secret|--local-only]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

echo ""
echo "Cloudflare API token -> .env.cloudflare"
echo "Create/copy token: https://dash.cloudflare.com/profile/api-tokens"
echo "IMPORTANT: use the token you just verified (same length). Old saved tokens often 401."
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
  ACCOUNT_ID="$(printf '%s' "$ACCOUNT_ID" | tr -d '[:space:]"'"'")"
fi
if [[ ${#ACCOUNT_ID} -lt 16 ]]; then
  echo "ERROR: bad CLOUDFLARE_ACCOUNT_ID" >&2
  exit 1
fi

RAW=""
case "$MODE" in
  paste)
    command -v pbpaste >/dev/null || { echo "ERROR: pbpaste missing" >&2; exit 1; }
    echo "Reading clipboard..."
    RAW="$(pbpaste || true)"
    ;;
  visible)
    printf "Paste token (visible), Enter: "
    read -r RAW
    ;;
  *)
    printf "Paste token (hidden), Enter: "
    read -rs RAW
    echo ""
    ;;
esac

# Minimal clean in bash (no charset stripping that can corrupt tokens)
RAW="$(printf '%s' "$RAW" | sed $'s/\xEF\xBB\xBF//g' | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//;s/^'"'"'//;s/'"'"'$//')"
# Drop accidental KEY= prefix only
case "$RAW" in
  CLOUDFLARE_API_TOKEN=*|CF_API_TOKEN=*) RAW="${RAW#*=}" ;;
esac
RAW="$(printf '%s' "$RAW" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [[ ${#RAW} -lt 20 ]]; then
  echo "ERROR: paste too short (len=${#RAW}). Copy the full token from CF dashboard." >&2
  exit 1
fi

echo "Got paste: len=${#RAW} prefix=${RAW:0:4}... suffix=...${RAW: -4}"
echo "If this does not match the token you curl-verified, copy again and re-run."

export _CF_ROTATE_TOKEN="$RAW"
export _CF_ROTATE_ACCOUNT_ID="$ACCOUNT_ID"
export _CF_ROTATE_ENV_FILE="$ENV_FILE"
unset RAW

# Prefer curl (same as dashboard/manual verify) over urllib
python3 <<'PY'
import json, os, ssl, sys, urllib.error, urllib.request
from pathlib import Path

token = os.environ.pop("_CF_ROTATE_TOKEN", "") or ""
account_id = (os.environ.get("_CF_ROTATE_ACCOUNT_ID") or "").strip()
env_path = Path(os.environ.get("_CF_ROTATE_ENV_FILE") or "")

# Only strip ASCII whitespace leftover; never drop token charset chars
token = "".join(ch for ch in token if ch not in "\r\n\t ").strip()
if not token:
    print("ERROR: empty token", file=sys.stderr)
    sys.exit(1)

print(f"Validating len={len(token)} prefix={token[:4]}... suffix=...{token[-4:]} account={account_id[:8]}...")

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
            data = {"raw": body[:200]}
        return e.code, data
    except Exception as e:
        print(f"ERROR: request failed: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(2)

status, verify = cf_get("https://api.cloudflare.com/client/v4/user/tokens/verify")
ok = bool(verify.get("success")) and str((verify.get("result") or {}).get("status") or "").lower() == "active"
if not ok:
    errs = verify.get("errors") or []
    msg = errs[0].get("message") if errs and isinstance(errs[0], dict) else verify
    print(f"ERROR: token verify failed (HTTP {status}): {msg}", file=sys.stderr)
    print("Nothing written.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Your curl succeeded with a DIFFERENT token value than this paste.", file=sys.stderr)
    print("Fix: create/copy token again in the dashboard, then immediately:", file=sys.stderr)
    print("  npm run rotate:cf-api-token:paste", file=sys.stderr)
    sys.exit(2)

tok_id = (verify.get("result") or {}).get("id")
print(f"OK tokens/verify active id={tok_id}")

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
print(f"OK wrote {env_path.name}")
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
