#!/usr/bin/env zsh
# Register Cloudflare Stream VOD webhook + Notifications Live Input destination/policy.
# Uses CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN or CLOUDFLARE_STREAM_TOKEN / CLOUDFLARE_API_TOKEN.
#
# Usage:
#   ./scripts/cloudflare/register-stream-notifications.sh
#   ./scripts/cloudflare/register-stream-notifications.sh --apply-live-secret
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPLY_LIVE_SECRET=0
[[ "${1:-}" == "--apply-live-secret" ]] && APPLY_LIVE_SECRET=1

export REPO_ROOT APPLY_LIVE_SECRET="$APPLY_LIVE_SECRET"
"${REPO_ROOT}/scripts/with-cloudflare-env.sh" python3 - <<'PY'
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

repo = os.environ["REPO_ROOT"]
apply_live = os.environ.get("APPLY_LIVE_SECRET") == "1"
account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
stream_token = (
    os.environ.get("CLOUDFLARE_STREAM_TOKEN")
    or os.environ.get("CLOUDFLARE_API_TOKEN")
    or ""
).strip()
alert_token = (
    os.environ.get("CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN")
    or os.environ.get("CLOUDFLARE_API_TOKEN")
    or stream_token
).strip()
vod_url = os.environ.get(
    "STREAM_VOD_WEBHOOK_URL",
    "https://inneranimalmedia.com/api/webhooks/stream/vod",
)
live_url = os.environ.get(
    "STREAM_LIVE_WEBHOOK_URL",
    "https://inneranimalmedia.com/api/webhooks/stream/live",
)

if not account or not (stream_token or alert_token):
    print("Need CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_TOKEN or CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN", file=sys.stderr)
    sys.exit(1)

def cf_api(method, path, body=None, token=None):
    bearer = token or alert_token
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            out = json.loads(raw)
        except json.JSONDecodeError:
            out = {"success": False, "errors": [{"message": raw}]}
        out["_http_status"] = e.code
        return out

print("=== Stream VOD webhook (PUT /stream/webhook) ===")
vod = cf_api(
    "PUT",
    f"/accounts/{account}/stream/webhook",
    {"notificationUrl": vod_url},
    token=stream_token,
)
if vod.get("success"):
    secret = (vod.get("result") or {}).get("secret")
    print(f"✓ VOD webhook → {vod_url}")
    if secret:
        print(f"  secret returned (set CLOUDFLARE_STREAM_WEBHOOK_SECRET on Worker)")
        if apply_live:
            subprocess.run(
                ["npx", "wrangler", "secret", "put", "CLOUDFLARE_STREAM_WEBHOOK_SECRET", "-c", "wrangler.production.toml"],
                input=secret.encode(),
                cwd=repo,
                check=True,
            )
            print("  ✓ Worker secret CLOUDFLARE_STREAM_WEBHOOK_SECRET updated")
else:
    print("✗ VOD webhook failed:", json.dumps(vod), file=sys.stderr)

print("\n=== Notifications: Live Input destination ===")
live_secret = os.environ.get("CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET", "").strip()
if not live_secret:
    live_secret = secrets.token_hex(24)
    print(f"Generated live webhook secret (len={len(live_secret)})")

if apply_live and live_secret:
    subprocess.run(
        ["npx", "wrangler", "secret", "put", "CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET", "-c", "wrangler.production.toml"],
        input=live_secret.encode(),
        cwd=repo,
        check=True,
    )
    print("✓ Worker secret CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET pre-set for CF destination test")

dest_name = "iam-moviemode-stream-live"
listed = cf_api("GET", f"/accounts/{account}/alerting/v3/destinations/webhooks")
dest_id = None
if listed.get("success"):
    for row in listed.get("result") or []:
        if str(row.get("url", "")).rstrip("/") == live_url.rstrip("/"):
            dest_id = row.get("id")
            print(f"✓ Live destination exists id={dest_id}")
            break

if not dest_id:
    created = cf_api(
        "POST",
        f"/accounts/{account}/alerting/v3/destinations/webhooks",
        {"name": dest_name, "url": live_url, "secret": live_secret},
    )
    if created.get("success"):
        dest_id = (created.get("result") or {}).get("id")
        print(f"✓ Created live destination id={dest_id} → {live_url}")
    else:
        print("✗ Live destination create failed:", json.dumps(created), file=sys.stderr)
        dest_id = None

if dest_id:
    print("\n=== Notifications: stream_live_notifications policy ===")
    policies = cf_api("GET", f"/accounts/{account}/alerting/v3/policies")
    policy_id = None
    if policies.get("success"):
        for p in policies.get("result") or []:
            if p.get("alert_type") == "stream_live_notifications" and p.get("name") == dest_name:
                policy_id = p.get("id")
                print(f"✓ Policy exists id={policy_id}")
                break
    if not policy_id:
        policy_body = {
            "name": dest_name,
            "description": "MovieMode Stream Live Input connect/disconnect/error",
            "enabled": True,
            "alert_type": "stream_live_notifications",
            "mechanisms": {"webhooks": [{"id": dest_id}]},
        }
        created_p = cf_api("POST", f"/accounts/{account}/alerting/v3/policies", policy_body)
        if created_p.get("success"):
            policy_id = (created_p.get("result") or {}).get("id")
            print(f"✓ Created policy id={policy_id}")
        else:
            print("✗ Policy create failed:", json.dumps(created_p), file=sys.stderr)

    elif live_secret and not os.environ.get("CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET") and not apply_live:
        print("\nSet live secret on Worker:")
        print("  printf '%s' '<secret>' | ./scripts/with-cloudflare-env.sh npx wrangler secret put CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET -c wrangler.production.toml")
        print(f"  (generated secret length {len(live_secret)} — save locally if you created destination now)")

print("\nDone.")
PY
