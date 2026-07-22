#!/usr/bin/env bash
# Ensure platform iam-tunnel ingress uses 127.0.0.1:3099 (not localhost → [::1]).
# Usage: ./scripts/with-cloudflare-env.sh ./scripts/fix-iam-tunnel-ingress-ipv4.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-}"
TOKEN="${CLOUDFLARE_API_TOKEN:-}"
TID="${IAM_TUNNEL_ID:-aa79ecd4-d8c6-4c40-bc17-09f9ae230508}"

if [[ -z "$ACCOUNT" || -z "$TOKEN" ]]; then
  echo "✗ CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN required" >&2
  exit 1
fi

cfg="$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/cfd_tunnel/${TID}/configurations")"

python3 - "$cfg" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
if not d.get("success"):
    raise SystemExit(f"get failed: {d.get('errors')}")
ingress = (d.get("result") or {}).get("config", {}).get("ingress") or []
bad = []
for rule in ingress:
    svc = str(rule.get("service") or "")
    host = rule.get("hostname") or "(catch-all)"
    if "localhost" in svc or "[::1]" in svc:
        bad.append(f"{host} -> {svc}")
if not bad:
    print("✓ ingress already IPv4-safe:")
    for rule in ingress:
        print(f"  {rule.get('hostname') or '(catch-all)'} -> {rule.get('service')}")
    raise SystemExit(0)
print("! rewriting localhost/[::1] origins:")
for b in bad:
    print(f"  {b}")
PY

# Always PUT canonical config (idempotent).
curl -sS -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/cfd_tunnel/${TID}/configurations" \
  --data '{
    "config": {
      "ingress": [
        {"hostname":"sandboxterminal.inneranimalmedia.com","service":"http://127.0.0.1:3099","originRequest":{}},
        {"hostname":"terminal.inneranimalmedia.com","service":"http://127.0.0.1:3099","originRequest":{}},
        {"service":"http_status:404"}
      ]
    }
  }' | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success"), d; print("✓ tunnel config version", (d.get("result") or {}).get("version"))'
