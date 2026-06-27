#!/usr/bin/env zsh
# Rotate CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN in .env.cloudflare (never prints the value).
#
# 1) Cloudflare Dashboard → Account → Account API Tokens → Create Token
#    Use a Custom token with broad account admin permissions (Workers, Realtime Admin,
#    Account Rulesets, etc.). Name it e.g. iam-break-glass-admin.
#    Docs: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
#
# 2) Run (paste token at prompt — hidden):
#      cd /Users/samprimeaux/inneranimalmedia
#      ./scripts/update-break-glass-token.sh
#
# 3) Verify:
#      ./scripts/with-cloudflare-env.sh python3 -c "
#      import os, json, urllib.request
#      t=os.environ['CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN']
#      r=urllib.request.urlopen(urllib.request.Request(
#        'https://api.cloudflare.com/client/v4/user/tokens/verify',
#        headers={'Authorization': f'Bearer {t}'}))
#      print('active' if json.load(r).get('success') else 'INVALID')
#      "

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.cloudflare.example first." >&2
  exit 1
fi

print -n "Paste new CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN (hidden): "
read -s NEW_TOKEN
echo
if [[ -z "$NEW_TOKEN" ]]; then
  echo "Empty token — aborted." >&2
  exit 1
fi

python3 - "$ENV_FILE" "$NEW_TOKEN" <<'PY'
import sys
path, token = sys.argv[1], sys.argv[2]
lines = open(path).read().splitlines()
key = "CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN"
out, seen = [], False
for line in lines:
    if line.startswith(f"{key}="):
        out.append(f"{key}={token}")
        seen = True
    else:
        out.append(line)
if not seen:
    out.append(f"{key}={token}")
open(path, "w").write("\n".join(out) + "\n")
print(f"Updated {key} in {path}")
PY
