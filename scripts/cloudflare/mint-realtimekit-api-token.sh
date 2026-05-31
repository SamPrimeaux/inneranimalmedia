#!/usr/bin/env zsh
# Mint a narrow account-owned Realtime Admin token and optionally push to Worker secret.
# Requires CLOUDFLARE_API_TOKEN with Account API Tokens Write.
# Usage:
#   ./scripts/cloudflare/mint-realtimekit-api-token.sh           # mint only
#   ./scripts/cloudflare/mint-realtimekit-api-token.sh --apply   # mint + wrangler secret put
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

export REPO_ROOT APPLY
"${REPO_ROOT}/scripts/with-cloudflare-env.sh" python3 - <<'PY'
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "ede6590ac0d2fb7daf155b35653457b2")
api_token = os.environ["CLOUDFLARE_API_TOKEN"]
rtk_perm = "ba6ce7d23a9544ccad0816691ba38e21"
expires = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ")
repo_root = os.environ["REPO_ROOT"]
apply = os.environ.get("APPLY") == "1"

body = {
    "name": "iam-meet-realtimekit-worker",
    "policies": [{
        "effect": "allow",
        "permission_groups": [{"id": rtk_perm}],
        "resources": {f"com.cloudflare.api.account.{account}": "*"},
    }],
    "expires_on": expires,
}

req = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{account}/tokens",
    data=json.dumps(body).encode(),
    headers={
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(req, timeout=60) as resp:
    data = json.loads(resp.read().decode())

if not data.get("success"):
    print("Mint failed:", json.dumps(data.get("errors")), file=sys.stderr)
    sys.exit(1)

minted = data["result"]["value"]
token_path = os.path.join(os.environ.get("TMPDIR", "/tmp"), "iam_rtk_token_mint.txt")
with open(token_path, "w") as f:
    f.write(minted)

print(f"Minted Realtime Admin token (len={len(minted)}) → {token_path}")
print(f"Token id: {data['result'].get('id', '?')}")
print(f"Expires: {expires}")

app_id = os.environ.get("REALTIMEKIT_APP_ID", "08755a39-bfb2-4c6a-b322-527ba7ef0698")
smoke_url = f"https://api.cloudflare.com/client/v4/accounts/{account}/realtime/kit/{app_id}/presets"
smoke_req = urllib.request.Request(smoke_url, headers={"Authorization": f"Bearer {minted}"})
try:
    with urllib.request.urlopen(smoke_req, timeout=30) as resp:
        smoke = json.loads(resp.read().decode())
    if smoke.get("success"):
        names = [p.get("name") for p in (smoke.get("result") or [])[:5]]
        print("Smoke OK — presets:", ", ".join(n for n in names if n))
    else:
        print("Smoke WARN:", smoke.get("errors"), file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print("Smoke failed:", e, file=sys.stderr)
    sys.exit(1)

if apply:
    wrangler = [
        f"{repo_root}/scripts/with-cloudflare-env.sh",
        "npx", "wrangler", "secret", "put", "-c",
        f"{repo_root}/wrangler.production.toml",
        "REALTIMEKIT_API_TOKEN",
    ]
    subprocess.run(wrangler, input=minted.encode(), check=True)
    print("Worker secret REALTIMEKIT_API_TOKEN updated (narrow Realtime Admin).")
else:
    print("Next: add REALTIMEKIT_API_TOKEN=<minted> to .env.cloudflare, then ./scripts/cloudflare/set-realtimekit-worker-secrets.sh")
    print("Or re-run with --apply to push directly to Worker.")
PY
