#!/usr/bin/env zsh
# Verify CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN from .env.cloudflare.
#
# Break-glass tokens are Account API Tokens (prefix cfat_*) and must use
# /accounts/{account_id}/tokens/verify — not /user/tokens/verify (cfut_* user tokens).
#
# Usage:
#   ./scripts/verify-break-glass-token.sh

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"${REPO_ROOT}/scripts/with-cloudflare-env.sh" python3 - <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

token = (os.environ.get("CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN") or "").strip()
account = (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "").strip()
if not token:
    print("CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN not set in .env.cloudflare", file=sys.stderr)
    sys.exit(1)
if not account:
    print("CLOUDFLARE_ACCOUNT_ID not set in .env.cloudflare", file=sys.stderr)
    sys.exit(1)

prefix = token[:5]
print(f"token prefix={prefix!r} len={len(token)}")


def verify(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


# Account tokens (cfat_*) — expected for break-glass
try:
    acct = verify(f"https://api.cloudflare.com/client/v4/accounts/{account}/tokens/verify")
except urllib.error.HTTPError as exc:
    print(f"account verify HTTP {exc.code}", file=sys.stderr)
    sys.exit(1)

if acct.get("success") and (acct.get("result") or {}).get("status") == "active":
    print("active (account token — correct endpoint)")
    sys.exit(0)

# User tokens (cfut_*) — legacy / alternate
try:
    user = verify("https://api.cloudflare.com/client/v4/user/tokens/verify")
except urllib.error.HTTPError:
    user = {"success": False}

if user.get("success") and (user.get("result") or {}).get("status") == "active":
    print("active (user token)")
    sys.exit(0)

print("INVALID — token failed both account and user verify", file=sys.stderr)
sys.exit(1)
PY
