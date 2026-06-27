#!/usr/bin/env zsh
# Create or sync Cloudflare account OAuth client credentials to the production Worker.
# Uses CLOUDFLARE_API_TOKEN from .env.cloudflare (via with-cloudflare-env.sh) to mint a
# narrow OAuth Client Write token, register the client if missing, then wrangler secret put.
#
# Usage (from repo root):
#   ./scripts/sync-cloudflare-oauth-secrets.sh           # create if needed + sync secrets
#   ./scripts/sync-cloudflare-oauth-secrets.sh --sync-only  # push existing .env.cloudflare creds only
#   ./scripts/sync-cloudflare-oauth-secrets.sh --public     # DNS verify client_uri + promote to public
#
# Logo asset (required for public): upload once to R2 bucket inneranimalmedia
#   curl -sSL 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e323ffb-4338-41dc-1f71-9c7bdc57bb00/public' -o /tmp/iam-oauth-logo.png
#   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/static/brand/oauth-client-logo.png \
#     --file /tmp/iam-oauth-logo.png --content-type image/png -c wrangler.production.toml --remote

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_ONLY=0
MAKE_PUBLIC=0
for arg in "$@"; do
  case "$arg" in
    --sync-only) SYNC_ONLY=1 ;;
    --public) MAKE_PUBLIC=1 ;;
  esac
done

export REPO_ROOT SYNC_ONLY MAKE_PUBLIC
"${REPO_ROOT}/scripts/with-cloudflare-env.sh" python3 - <<'PY'
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
base = os.environ["CLOUDFLARE_API_TOKEN"]
repo = os.environ["REPO_ROOT"]
sync_only = os.environ.get("SYNC_ONLY") == "1"
make_public = os.environ.get("MAKE_PUBLIC") == "1"
redirect = "https://inneranimalmedia.com/api/oauth/cloudflare/callback"
client_uri = "https://inneranimalmedia.com"
client_name = "Inner Animal Media Platform"
logo_uri = "https://inneranimalmedia.com/static/brand/oauth-client-logo.png"
policy_uri = "https://inneranimalmedia.com/privacy"
tos_uri = "https://inneranimalmedia.com/terms"
zone_id = os.environ.get("CLOUDFLARE_ZONE_ID", "0bab48636c1bea4be4ea61c0c7787c3e")
zone_name = os.environ.get("CLOUDFLARE_ZONE_NAME", "inneranimalmedia.com")
scopes = [
    "account-settings.read",
    "zone.read",
    "workers-scripts.write",
    "d1.read",
    "workers-r2.read",
]
oauth_write = "50fc2f43318f40e4855a35d8de5bf643"
oauth_read = "0b7793327a1a417681e4d49ee233e184"
dns_write = "4755a26eedb94da69e1066d98aa820be"
env_path = os.path.join(repo, ".env.cloudflare")


def cf(token, method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read().decode())


def mint_token(name, permission_ids, resources):
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    mint = cf(
        base,
        "POST",
        f"/accounts/{account}/tokens",
        {
            "name": name,
            "policies": [
                {
                    "effect": "allow",
                    "permission_groups": [{"id": pid} for pid in permission_ids],
                    "resources": resources,
                }
            ],
            "expires_on": expires,
        },
    )
    if not mint.get("success"):
        print("Mint failed:", mint.get("errors"), file=sys.stderr)
        sys.exit(1)
    return mint["result"]["value"], mint["result"]["id"]


def ensure_oauth_publisher_txt(token, txt_value):
    listed = cf(token, "GET", f"/zones/{zone_id}/dns_records?type=TXT&per_page=100")
    if not listed.get("success"):
        print("DNS list failed:", listed.get("errors"), file=sys.stderr)
        sys.exit(1)
    for row in listed.get("result") or []:
        if txt_value in (row.get("content") or ""):
            print(f"OAuth publisher TXT already present on {row.get('name')}")
            return
    created = cf(
        token,
        "POST",
        f"/zones/{zone_id}/dns_records",
        {
            "type": "TXT",
            "name": zone_name,
            "content": txt_value,
            "ttl": 300,
        },
    )
    if not created.get("success"):
        print("DNS TXT create failed:", created.get("errors"), file=sys.stderr)
        sys.exit(1)
    print(f"Created OAuth publisher TXT on {zone_name}")


def wait_for_domain_verification(admin, client_id, timeout_sec=180):
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        detail = cf(admin, "GET", f"/accounts/{account}/oauth_clients/{client_id}")
        if not detail.get("success"):
            print("OAuth client fetch failed:", detail.get("errors"), file=sys.stderr)
            sys.exit(1)
        verification = (detail.get("result") or {}).get("client_uri_verification") or {}
        status = verification.get("status")
        print(f"client_uri_verification.status={status}")
        if status == "verified":
            return detail["result"]
        if status in {"failed", "timed_out"}:
            restarted = cf(
                admin,
                "PATCH",
                f"/accounts/{account}/oauth_clients/{client_id}",
                {"client_uri": client_uri},
            )
            if not restarted.get("success"):
                print("Restart verification failed:", restarted.get("errors"), file=sys.stderr)
                sys.exit(1)
            print("Restarted domain verification")
        time.sleep(10)
    print("Timed out waiting for client_uri verification", file=sys.stderr)
    sys.exit(1)


def promote_oauth_client_public(admin, client_id):
    detail = wait_for_domain_verification(admin, client_id)
    if detail.get("visibility") == "public":
        print(f"OAuth client {client_id} already public")
        return detail
    patched = cf(
        admin,
        "PATCH",
        f"/accounts/{account}/oauth_clients/{client_id}",
        {
            "logo_uri": logo_uri,
            "policy_uri": policy_uri,
            "tos_uri": tos_uri,
            "client_uri": client_uri,
            "visibility": "public",
        },
    )
    if not patched.get("success"):
        print("Promote to public failed:", patched.get("errors"), file=sys.stderr)
        sys.exit(1)
    print(f"Promoted oauth client {client_id} to public")
    return patched["result"]


def upsert_env(client_id, client_secret):
    lines = open(env_path).read().splitlines() if os.path.isfile(env_path) else []
    updates = {
        "CLOUDFLARE_OAUTH_CLIENT_ID": client_id,
        "CLOUDFLARE_OAUTH_CLIENT_SECRET": client_secret,
    }
    out, seen = [], set()
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line and not line.startswith("#") else None
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, val in updates.items():
        if key not in seen:
            out.append(f"{key}={val}")
    with open(env_path, "w") as fh:
        fh.write("\n".join(out) + "\n")


def wrangler_put(name, value):
    proc = subprocess.run(
        [
            os.path.join(repo, "scripts/with-cloudflare-env.sh"),
            "npx",
            "wrangler",
            "secret",
            "put",
            name,
            "-c",
            "wrangler.production.toml",
        ],
        input=value.encode(),
        cwd=repo,
        capture_output=True,
    )
    if proc.returncode != 0:
        print(f"wrangler secret put {name} failed:", proc.stderr.decode()[:500], file=sys.stderr)
        sys.exit(1)
    print(f"OK wrangler secret put {name}")


client_id = os.environ.get("CLOUDFLARE_OAUTH_CLIENT_ID", "").strip()
client_secret = os.environ.get("CLOUDFLARE_OAUTH_CLIENT_SECRET", "").strip()

if sync_only:
    if not client_id or not client_secret:
        print("Set CLOUDFLARE_OAUTH_CLIENT_ID and CLOUDFLARE_OAUTH_CLIENT_SECRET in .env.cloudflare", file=sys.stderr)
        sys.exit(1)
    if make_public:
        admin, mint_id = mint_token(
            f"iam-oauth-public-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
            [oauth_write, oauth_read],
            {f"com.cloudflare.api.account.{account}": "*"},
        )
        detail = cf(admin, "GET", f"/accounts/{account}/oauth_clients/{client_id}")
        verification = (detail.get("result") or {}).get("client_uri_verification") or {}
        txt_value = verification.get("text")
        if not txt_value:
            print("Missing client_uri verification TXT from Cloudflare", file=sys.stderr)
            cf(base, "DELETE", f"/accounts/{account}/tokens/{mint_id}")
            sys.exit(1)
        dns_token, dns_mint_id = mint_token(
            f"iam-oauth-dns-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
            [dns_write],
            {f"com.cloudflare.api.account.zone.{zone_id}": "*"},
        )
        ensure_oauth_publisher_txt(dns_token, txt_value)
        cf(base, "DELETE", f"/accounts/{account}/tokens/{dns_mint_id}")
        promote_oauth_client_public(admin, client_id)
        cf(base, "DELETE", f"/accounts/{account}/tokens/{mint_id}")
else:
    admin, mint_id = mint_token(
        f"iam-oauth-client-mint-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        [oauth_write, oauth_read],
        {f"com.cloudflare.api.account.{account}": "*"},
    )

    listed = cf(admin, "GET", f"/accounts/{account}/oauth_clients")
    if not listed.get("success"):
        print("List oauth clients failed:", listed.get("errors"), file=sys.stderr)
        cf(base, "DELETE", f"/accounts/{account}/tokens/{mint_id}")
        sys.exit(1)

    match = None
    for row in listed.get("result") or []:
        uris = row.get("redirect_uris") or []
        if redirect in uris:
            match = row
            break

    if match:
        client_id = match["client_id"]
        print(f"Reusing oauth client {client_id}")
        if not client_secret:
            print("Existing client has no secret in env; rotate in dashboard if token exchange fails.", file=sys.stderr)
    else:
        created = cf(
            admin,
            "POST",
            f"/accounts/{account}/oauth_clients",
            {
                "client_name": client_name,
                "grant_types": ["authorization_code"],
                "redirect_uris": [redirect],
                "scopes": scopes,
                "response_types": ["code"],
                "token_endpoint_auth_method": "client_secret_basic",
                "client_uri": client_uri,
                "logo_uri": logo_uri,
                "policy_uri": policy_uri,
                "tos_uri": tos_uri,
            },
        )
        if not created.get("success"):
            print("Create oauth client failed:", created.get("errors"), file=sys.stderr)
            cf(base, "DELETE", f"/accounts/{account}/tokens/{mint_id}")
            sys.exit(1)
        client_id = created["result"]["client_id"]
        client_secret = created["result"].get("client_secret") or ""
        print(f"Created oauth client {client_id}")

    if make_public:
        detail = cf(admin, "GET", f"/accounts/{account}/oauth_clients/{client_id}")
        verification = (detail.get("result") or {}).get("client_uri_verification") or {}
        txt_value = verification.get("text")
        if not txt_value:
            print("Missing client_uri verification TXT from Cloudflare", file=sys.stderr)
            cf(base, "DELETE", f"/accounts/{account}/tokens/{mint_id}")
            sys.exit(1)
        dns_token, dns_mint_id = mint_token(
            f"iam-oauth-dns-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
            [dns_write],
            {f"com.cloudflare.api.account.zone.{zone_id}": "*"},
        )
        ensure_oauth_publisher_txt(dns_token, txt_value)
        cf(base, "DELETE", f"/accounts/{account}/tokens/{dns_mint_id}")
        promote_oauth_client_public(admin, client_id)

    cf(base, "DELETE", f"/accounts/{account}/tokens/{mint_id}")
    upsert_env(client_id, client_secret)

wrangler_put("CLOUDFLARE_OAUTH_CLIENT_ID", client_id)
if client_secret:
    wrangler_put("CLOUDFLARE_OAUTH_CLIENT_SECRET", client_secret)
else:
    print("SKIP CLOUDFLARE_OAUTH_CLIENT_SECRET (not available — rotate secret in dashboard)", file=sys.stderr)

print("Cloudflare OAuth client synced.")
PY
