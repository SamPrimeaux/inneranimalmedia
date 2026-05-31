#!/usr/bin/env zsh
# Register RealtimeKit webhook → webhooks.inneranimalmedia.com + set Worker secret.
# Usage: ./scripts/cloudflare/register-realtimekit-webhook.sh [--apply-secret]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPLY_SECRET=0
[[ "${1:-}" == "--apply-secret" ]] && APPLY_SECRET=1

WEBHOOK_URL="${REALTIMEKIT_WEBHOOK_URL:-https://webhooks.inneranimalmedia.com/api/webhooks/realtimekit}"

export REPO_ROOT APPLY_SECRET="$APPLY_SECRET" REALTIMEKIT_WEBHOOK_URL="$WEBHOOK_URL"
"${REPO_ROOT}/scripts/with-cloudflare-env.sh" python3 - <<'PY'
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

repo = os.environ["REPO_ROOT"]
apply_secret = os.environ.get("APPLY_SECRET") == "1"
account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "ede6590ac0d2fb7daf155b35653457b2")
app_id = os.environ.get("REALTIMEKIT_APP_ID", "08755a39-bfb2-4c6a-b322-527ba7ef0698")
token = os.environ.get("REALTIMEKIT_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN", "")
if not token:
    print("REALTIMEKIT_API_TOKEN or CLOUDFLARE_API_TOKEN required", file=sys.stderr)
    sys.exit(1)
webhook_url = os.environ.get("REALTIMEKIT_WEBHOOK_URL", "https://webhooks.inneranimalmedia.com/api/webhooks/realtimekit")
events = ["meeting.started", "meeting.ended", "meeting.participantJoined", "meeting.participantLeft"]
base = f"https://api.cloudflare.com/client/v4/accounts/{account}/realtime/kit/{app_id}"

def api(method, path, body=None):
    req = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            out = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            out = json.loads(raw)
        except json.JSONDecodeError:
            out = {"success": False, "error": raw}
        out["_http_status"] = e.code
        return out
    return out

listed = api("GET", "/webhooks")
hooks = []
if listed.get("success") and isinstance(listed.get("data"), list):
    hooks = listed["data"]
elif listed.get("_http_status") == 404:
    hooks = []
elif listed.get("success") and isinstance(listed.get("data"), dict):
    hooks = [listed["data"]]

existing = next((h for h in hooks if str(h.get("url", "")).rstrip("/") == webhook_url.rstrip("/")), None)
if existing:
    print(f"Webhook already registered: id={existing.get('id')} url={existing.get('url')}")
else:
    created = api("POST", "/webhooks", {
        "name": "iam-meet-lifecycle",
        "url": webhook_url,
        "events": events,
        "enabled": True,
    })
    if not created.get("success"):
        print("Create webhook failed:", json.dumps(created), file=sys.stderr)
        sys.exit(1)
    wh = created.get("data") or {}
    print(f"Created webhook id={wh.get('id')} url={webhook_url}")

secret = os.environ.get("REALTIMEKIT_WEBHOOK_SECRET", "").strip()
if not secret:
    secret = secrets.token_hex(32)
    print(f"Generated REALTIMEKIT_WEBHOOK_SECRET (len={len(secret)}) — add to .env.cloudflare")

if apply_secret:
    wrangler = [
        f"{repo}/scripts/with-cloudflare-env.sh",
        "npx", "wrangler", "secret", "put", "-c",
        f"{repo}/wrangler.production.toml",
        "REALTIMEKIT_WEBHOOK_SECRET",
    ]
    subprocess.run(wrangler, input=secret.encode(), check=True)
    print("Worker secret REALTIMEKIT_WEBHOOK_SECRET updated.")
else:
    print("Run with --apply-secret to push REALTIMEKIT_WEBHOOK_SECRET to Worker.")
    print("Use this secret for smoke-realtimekit-webhook.sh (RTK prod uses dyte-signature RSA).")
PY
