#!/usr/bin/env zsh
# Install Cache Reserve + Tiered Cache + Cache Rules for inneranimalmedia.com
#
# Usage:
#   ./scripts/with-cloudflare-env.sh ./scripts/cloudflare/install-cache-reserve.sh
#   ./scripts/with-cloudflare-env.sh ./scripts/cloudflare/install-cache-reserve.sh --dry-run
#   ./scripts/with-cloudflare-env.sh ./scripts/cloudflare/install-cache-reserve.sh --warm
#
# Required API token permissions (Custom Token):
#   Zone > Cache Rules > Edit
#   Zone > Zone Settings > Edit
#   Zone > Zone > Read
# Optional (if not already enabled in dashboard):
#   Account > Account Settings > Read
#
# Docs:
#   https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/
#   https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RULES_FILE="${REPO_ROOT}/scripts/cloudflare/cache-reserve-rules.inneranimalmedia.json"

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-ede6590ac0d2fb7daf155b35653457b2}"
ZONE_NAME="${CLOUDFLARE_ZONE_NAME:-inneranimalmedia.com}"
ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
API_TOKEN="${CLOUDFLARE_CACHE_RESERVE_TOKEN:-${CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}}"
# Prefer CLOUDFLARE_CACHE_RESERVE_TOKEN (zone-scoped). Updated break-glass with Zone
# Cache Rules + Zone Settings also works.

DRY_RUN=0
DO_WARM=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --warm) DO_WARM=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local url="https://api.cloudflare.com/client/v4${path}"
  local curl_bin="${CURL_BIN:-$(command -v curl 2>/dev/null || true)}"
  [[ -z "$curl_bin" && -x /usr/bin/curl ]] && curl_bin="/usr/bin/curl"
  if [[ -z "$curl_bin" ]]; then
    echo "ERROR: curl not found in PATH" >&2
    return 127
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $method $url"
    [[ -n "$data" ]] && echo "$data" | python3 -m json.tool 2>/dev/null || echo "$data"
    return 0
  fi
  if [[ -n "$data" ]]; then
    "$curl_bin" -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    "$curl_bin" -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${API_TOKEN}"
  fi
}

require_json_success() {
  local label="$1"
  local raw="$2"
  python3 - <<'PY' "$label" "$raw"
import json, sys
label, raw = sys.argv[1], sys.argv[2]
if not raw.strip():
    print(f"ERROR: {label}: empty response", file=sys.stderr)
    sys.exit(1)
data = json.loads(raw)
if not data.get("success"):
    print(f"ERROR: {label}:", json.dumps(data.get("errors") or data, indent=2), file=sys.stderr)
    sys.exit(1)
print(json.dumps(data.get("result"), indent=2)[:4000])
PY
}

if [[ -z "$API_TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_CACHE_RESERVE_TOKEN or CLOUDFLARE_API_TOKEN is not set." >&2
  echo "       CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN cannot be used for Cache Rules (zone permission missing)." >&2
  exit 1
fi

if [[ ! -f "$RULES_FILE" ]]; then
  echo "ERROR: missing rules file: $RULES_FILE" >&2
  exit 1
fi

if [[ -z "$ZONE_ID" ]]; then
  echo "→ Resolving zone id for ${ZONE_NAME}..."
  zone_resp="$(cf_api GET "/zones?name=${ZONE_NAME}")"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    ZONE_ID="DRY_RUN_ZONE_ID"
  else
    ZONE_ID="$(python3 - <<'PY' "$zone_resp"
import json, sys
d = json.loads(sys.argv[1])
rows = d.get("result") or []
if not rows:
    raise SystemExit("zone not found")
print(rows[0]["id"])
PY
)"
  fi
fi

echo "=== IAM Cache Reserve installer ==="
echo "Account: ${ACCOUNT_ID}"
echo "Zone:    ${ZONE_NAME} (${ZONE_ID})"
echo

# ── 1. Smart Tiered Cache (pair with Cache Reserve) ──
echo "→ Enabling Smart Tiered Cache topology..."
tiered_payload='{"value":"on"}'
tiered_resp="$(cf_api PATCH "/zones/${ZONE_ID}/cache/tiered_cache_smart_topology_enable" "$tiered_payload" || true)"
if [[ "$DRY_RUN" -eq 0 ]]; then
  python3 - <<'PY' "$tiered_resp" || echo "  (skipped — enable Smart Tiered Cache manually if token lacks Zone Settings Edit)"
import json, sys
raw = sys.argv[1]
try:
    d = json.loads(raw)
except Exception:
    print("  warn: could not parse tiered cache response")
    raise SystemExit(0)
if d.get("success"):
    print("  ✓ Smart Tiered Cache enabled")
else:
    errs = d.get("errors") or []
    print("  warn:", errs)
    print("  → Dashboard: Caching → Tiered Cache → Smart Tiered Cache")
PY
fi

# Legacy Argo tiered caching flag (some accounts still use this endpoint)
echo "→ Enabling Tiered Caching (argo/tiered_caching)..."
argo_resp="$(cf_api PATCH "/zones/${ZONE_ID}/argo/tiered_caching" '{"value":"on"}' || true)"
if [[ "$DRY_RUN" -eq 0 ]]; then
  python3 - <<'PY' "$argo_resp" || true
import json, sys
d = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
if d.get("success"):
    print("  ✓ argo/tiered_caching enabled")
else:
    print("  (argo/tiered_caching skipped — may require Argo/Smart Shield plan)")
PY
fi

# ── 2. Cache Reserve sync (often dashboard-only on Pro; attempt API) ──
echo "→ Enabling Cache Reserve sync..."
cr_resp="$(cf_api PATCH "/zones/${ZONE_ID}/cache/cache_reserve" '{"value":"on"}' || true)"
if [[ "$DRY_RUN" -eq 0 ]]; then
  python3 - <<'PY' "$cr_resp" || true
import json, sys
d = json.loads(sys.argv[1]) if sys.argv[1].strip() else {}
if d.get("success"):
    print("  ✓ Cache Reserve sync enabled via API")
else:
    print("  (Cache Reserve API skipped — already ON in Smart Shield dashboard is fine)")
PY
fi

# ── 3. Merge Cache Rules (http_request_cache_settings) ──
echo "→ Installing Cache Rules (Cache Reserve eligible paths)..."

rules_payload="$(python3 - <<'PY' "$RULES_FILE"
import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    bundle = json.load(f)
out = {
    "description": bundle.get("description", "IAM cache rules"),
    "rules": bundle.get("rules", []),
}
print(json.dumps(out))
PY
)"

if [[ "$DRY_RUN" -eq 0 ]]; then
  existing_raw="$(cf_api GET "/zones/${ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint" || echo '{}')"
  merged_payload="$(python3 - <<'PY' "$existing_raw" "$rules_payload"
import json, sys
existing_raw, new_raw = sys.argv[1], sys.argv[2]
new_bundle = json.loads(new_raw)
new_rules = new_bundle["rules"]
prefix = "IAM Cache Reserve:"
mp4_prefix = "IAM MP4 Safari:"
kept = []
try:
    existing = json.loads(existing_raw)
except Exception:
    existing = {"success": False}
if existing.get("success") and existing.get("result"):
    result = existing["result"]
    for rule in result.get("rules") or []:
        desc = str(rule.get("description") or "")
        if not desc.startswith(prefix) and not desc.startswith(mp4_prefix):
            kept.append(rule)
else:
    result = None
merged_rules = new_rules + kept
out = {
    "description": new_bundle.get("description") or "IAM cache rules",
    "rules": merged_rules,
}
print(json.dumps(out))
PY
)"
else
  merged_payload="$rules_payload"
fi

put_resp="$(cf_api PUT "/zones/${ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint" "$merged_payload")"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  ✓ [dry-run] Cache Rules payload ready"
else
  require_json_success "Cache Rules entrypoint" "$put_resp" >/dev/null
  echo "  ✓ Cache Rules installed ($(python3 - <<'PY' "$merged_payload"
import json, sys
print(len(json.loads(sys.argv[1]).get("rules", [])))
PY
) rules)"
fi

# ── 4. Optional: cloud region hint for assets host (manual table in Tiered Cache UI) ──
echo
echo "→ Cloud region hint (Tiered Cache → Origin Configuration):"
echo "  For assets.inneranimalmedia.com / Worker origin, set hint: aws/us-east-1 (or your R2 region)"
echo "  Dashboard: Caching → Tiered Cache → Origin Configuration"
echo

# ── 5. Verify ──
if [[ "$DRY_RUN" -eq 0 ]]; then
  echo "→ Verifying entrypoint..."
  verify_raw="$(cf_api GET "/zones/${ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint")"
  python3 - <<'PY' "$verify_raw"
import json, sys
d = json.loads(sys.argv[1])
if not d.get("success"):
    raise SystemExit("verify failed")
rules = (d.get("result") or {}).get("rules") or []
print(f"  Active cache rules: {len(rules)}")
for i, r in enumerate(rules[:8], 1):
    print(f"    {i}. {r.get('description','(no description)')}")
if len(rules) > 8:
    print(f"    … +{len(rules)-8} more")
PY
fi

if [[ "$DO_WARM" -eq 1 ]]; then
  echo
  "${REPO_ROOT}/scripts/cloudflare/warm-cache-reserve.sh"
fi

echo
echo "Done."
echo "Analytics: Caching → Cache Reserve → View Cache Reserve Analytics (expect data after 24–48h traffic)"
echo "Warm now:  ./scripts/with-cloudflare-env.sh ./scripts/cloudflare/warm-cache-reserve.sh"
