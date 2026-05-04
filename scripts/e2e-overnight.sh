#!/usr/bin/env bash
# E2E overnight: Vite build -> TOOLS R2 (full dist/ or single entry) -> overnight-api-suite -> D1 token gate.
# TOOLS bucket only — never writes inneranimalmedia or inneranimalmedia-sandbox-cicd.
# Requires: .env.cloudflare with export lines for CLOUDFLARE_API_TOKEN, INTERNAL_API_SECRET, SESSION_COOKIE
# Env:
#   E2E_TOOLS_MODE=full|entry   (default: full) — full = entire dashboard/dist; entry = agent-dashboard.js only
#   E2E_COPY_DASHBOARD_HTML=1   optional — also upload dashboard/agent.html as shell/agent.html under same prefix
# Usage: ./scripts/e2e-overnight.sh
set -euo pipefail

START_TS="$(date +%s)"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

load_env() {
  if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${REPO_ROOT}/.env.cloudflare"
    set +a
  fi
}
load_env

RUN_ID="e2e-$(date -u +%Y%m%dT%H%M%SZ)"
export RUN_ID

die() { echo "E2E FAIL: $*" >&2; exit 1; }

[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || die "CLOUDFLARE_API_TOKEN not set (Wrangler)"
[[ -n "${INTERNAL_API_SECRET:-}" ]] || die "INTERNAL_API_SECRET not set"
[[ -n "${SESSION_COOKIE:-}" ]] || die "SESSION_COOKIE not set (session=<uuid>)"

SESSION_UUID="${SESSION_COOKIE#session=}"
SESSION_UUID="${SESSION_UUID%%;*}"
[[ -n "$SESSION_UUID" ]] || die "Could not parse session uuid from SESSION_COOKIE"

# D1 agent_telemetry.session_id stores conversation_id, not cookie — do not filter by SESSION_UUID there.
TELEMETRY_WINDOW_SEC="${E2E_TELEMETRY_WINDOW_SEC:-300}"
CANARY_MODEL_SUBSTR="${E2E_CANARY_MODEL_SUBSTR:-haiku}"

echo "=== E2E ${RUN_ID} cookie_session=${SESSION_UUID:0:8}... ==="

# --- G5: build + TOOLS R2 (optional skips) ---
if [[ "${E2E_SKIP_BUILD:-0}" != "1" ]]; then
  echo "=== Vite build (agent-dashboard) ==="
  if [[ -n "${E2E_TOOLS_VITE_BASE:-}" ]]; then
    echo "  (E2E_TOOLS_VITE_BASE set — dist/ chunk URLs target TOOLS; rebuild without e2e for R2 prod path)"
  fi
  (cd "${REPO_ROOT}" && npm run build:vite-only)
  unset E2E_TOOLS_VITE_BASE 2>/dev/null || true
else
  echo "=== SKIP build (E2E_SKIP_BUILD=1) ==="
fi

DIST_ROOT="${REPO_ROOT}/dashboard/dist"
DIST_JS="${DIST_ROOT}/agent-dashboard.js"
[[ -f "$DIST_JS" ]] || die "Missing ${DIST_JS} (run build or unset E2E_SKIP_BUILD)"

TOOLS_PREFIX="code/e2e-nightly/${RUN_ID}"
TOOLS_ENTRY_KEY="${TOOLS_PREFIX}/agent-dashboard.js"
TOOLS_ENTRY_URL="https://tools.inneranimalmedia.com/${TOOLS_ENTRY_KEY}"
MANIFEST_LOCAL="${REPO_ROOT}/reports/${RUN_ID}-tools-manifest.json"
TOOLS_PUBLIC_BASE="https://tools.inneranimalmedia.com/${TOOLS_PREFIX}/"
PREVIEW_LOCAL="${REPO_ROOT}/reports/${RUN_ID}-preview.html"

# Full TOOLS upload: bake chunk URLs into the Vite build (same prefix as R2 keys).
if [[ "${E2E_SKIP_TOOLS:-0}" != "1" ]] && [[ "${E2E_TOOLS_MODE:-full}" == "full" ]]; then
  export E2E_TOOLS_VITE_BASE="${TOOLS_PUBLIC_BASE}"
else
  unset E2E_TOOLS_VITE_BASE 2>/dev/null || true
fi

ctype_for() {
  case "${1##*.}" in
    js)   echo "application/javascript" ;;
    mjs)  echo "application/javascript" ;;
    css)  echo "text/css" ;;
    map)  echo "application/json" ;;
    json) echo "application/json" ;;
    html) echo "text/html" ;;
    svg)  echo "image/svg+xml" ;;
    woff) echo "font/woff" ;;
    woff2) echo "font/woff2" ;;
    *)    echo "application/octet-stream" ;;
  esac
}

if [[ "${E2E_SKIP_TOOLS:-0}" != "1" ]]; then
  E2E_TOOLS_MODE="${E2E_TOOLS_MODE:-full}"
  echo "=== TOOLS R2 upload mode=${E2E_TOOLS_MODE} prefix=${TOOLS_PREFIX}/ ==="

  if [[ "$E2E_TOOLS_MODE" == "full" ]]; then
    n=0
    while IFS= read -r -d '' f; do
      rel="${f#${DIST_ROOT}/}"
      key="${TOOLS_PREFIX}/${rel}"
      ct="$(ctype_for "$f")"
      ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "tools/${key}" \
        --file="$f" \
        --content-type="$ct" \
        --remote \
        -c wrangler.production.toml
      n=$((n + 1))
      if (( n % 25 == 0 )); then echo "  ... ${n} objects"; fi
    done < <(find "$DIST_ROOT" -type f -print0)
    echo "Uploaded ${n} files from dist/"

    if [[ "${E2E_COPY_DASHBOARD_HTML:-0}" == "1" ]] && [[ -f "${REPO_ROOT}/dashboard/agent.html" ]]; then
      HKEY="${TOOLS_PREFIX}/shell/agent.html"
      ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "tools/${HKEY}" \
        --file="${REPO_ROOT}/dashboard/agent.html" \
        --content-type=text/html \
        --remote \
        -c wrangler.production.toml
      echo "Also uploaded shell snapshot: https://tools.inneranimalmedia.com/${HKEY}"
    fi

    mkdir -p "${REPO_ROOT}/reports"
    DIST_ROOT="$DIST_ROOT" TOOLS_PREFIX="$TOOLS_PREFIX" RUN_ID="$RUN_ID" python3 << 'PY' > "$MANIFEST_LOCAL"
import json, os, hashlib
root = os.environ["DIST_ROOT"]
pre = os.environ["TOOLS_PREFIX"]
manifest = {"run_id": os.environ["RUN_ID"], "tools_prefix": pre, "bucket": "tools", "files": []}
for dirpath, _, files in os.walk(root):
    for fn in files:
        path = os.path.join(dirpath, fn)
        rel = os.path.relpath(path, root).replace(os.sep, "/")
        st = os.stat(path)
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        manifest["files"].append({
            "key": f"{pre}/{rel}",
            "bytes": st.st_size,
            "sha256": h.hexdigest(),
            "url": f"https://tools.inneranimalmedia.com/{pre}/{rel}",
        })
manifest["files"].sort(key=lambda x: x["key"])
print(json.dumps(manifest, indent=2))
PY
    echo "Wrote ${MANIFEST_LOCAL}"
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "tools/${TOOLS_PREFIX}/manifest.json" \
      --file="$MANIFEST_LOCAL" \
      --content-type=application/json \
      --remote \
      -c wrangler.production.toml
    echo "TOOLS manifest URL: https://tools.inneranimalmedia.com/${TOOLS_PREFIX}/manifest.json"

    echo "=== Generate preview.html (dashboard shell + TOOLS bundle URLs) ==="
    mkdir -p "${REPO_ROOT}/reports"
    REPO_ROOT="$REPO_ROOT" TOOLS_PUBLIC_BASE="$TOOLS_PUBLIC_BASE" RUN_ID="$RUN_ID" PREVIEW_LOCAL="$PREVIEW_LOCAL" python3 << 'PY'
import os, re
repo = os.environ["REPO_ROOT"]
base = os.environ["TOOLS_PUBLIC_BASE"]
if not base.endswith("/"):
    base += "/"
run_id = os.environ["RUN_ID"]
out_path = os.environ["PREVIEW_LOCAL"]
agent_path = os.path.join(repo, "dashboard", "agent.html")
with open(agent_path, encoding="utf-8") as f:
    html = f.read()
html = html.replace(
    'href="/static/dashboard/shell.css"',
    'href="https://inneranimalmedia.com/static/dashboard/shell.css"',
)
html = re.sub(
    r'href="/static/dashboard/agent/agent-dashboard\.css[^"]*"',
    'href="' + base + 'agent-dashboard.css"',
    html,
    count=1,
)
html = re.sub(
    r'src="/static/dashboard/agent/agent-dashboard\.js[^"]*"',
    'src="' + base + 'agent-dashboard.js"',
    html,
    count=1,
)
banner = (
    '<div id="e2e-tools-preview-banner" style="position:fixed;z-index:99999;left:0;right:0;top:0;'
    'padding:8px 12px;font:12px/1.4 system-ui,sans-serif;'
    'background:var(--bg-elevated,#1e293b);color:var(--text-primary,#f1f5f9);'
    'border-bottom:1px solid var(--color-border,#334155);">'
    "E2E TOOLS preview (" + run_id + "): bundle and chunks load from this origin. "
    "API calls use relative /api/ on tools.inneranimalmedia.com and may fail; use the sandbox dashboard for full stack."
    "</div>"
)
html = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + banner, html, count=1)
with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)
print("Wrote " + out_path)
PY
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "tools/${TOOLS_PREFIX}/preview.html" \
      --file="$PREVIEW_LOCAL" \
      --content-type=text/html \
      --remote \
      -c wrangler.production.toml
    echo "TOOLS preview URL: https://tools.inneranimalmedia.com/${TOOLS_PREFIX}/preview.html"

  elif [[ "$E2E_TOOLS_MODE" == "entry" ]]; then
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "tools/${TOOLS_ENTRY_KEY}" \
      --file="$DIST_JS" \
      --content-type=application/javascript \
      --remote \
      -c wrangler.production.toml
    echo "Uploaded 1 file (entry bundle only)"
  else
    die "E2E_TOOLS_MODE must be full or entry (got ${E2E_TOOLS_MODE})"
  fi

  echo "=== Verify entry bundle URL ==="
  code="$(curl -s -o /dev/null -w "%{http_code}" -I "$TOOLS_ENTRY_URL" || echo "000")"
  [[ "$code" == "200" ]] || die "TOOLS entry URL not 200: $TOOLS_ENTRY_URL (got $code)"
  echo "OK $TOOLS_ENTRY_URL"
else
  echo "=== SKIP TOOLS upload (E2E_SKIP_TOOLS=1) ==="
fi

END_TS="$(date +%s)"
echo "=== wall_seconds=$((END_TS - START_TS)) ==="

# --- G1–G3 + suite (G6 budget inside Node) ---
echo "=== overnight-api-suite ==="
export WRITE_OVERNIGHT_TO_D1="${WRITE_OVERNIGHT_TO_D1:-1}"
node "${REPO_ROOT}/scripts/overnight-api-suite.mjs" || die "overnight-api-suite exit non-zero"

# --- G4: exact tokens (agent_telemetry.session_id = conversation_id, not cookie) ---
echo "=== D1 gate: latest haiku row in last ${TELEMETRY_WINDOW_SEC}s ==="
SQL="SELECT input_tokens, output_tokens, computed_cost_usd, model_used, session_id, id FROM agent_telemetry WHERE created_at >= (unixepoch('now') - ${TELEMETRY_WINDOW_SEC}) AND LOWER(COALESCE(model_used,'')) LIKE '%${CANARY_MODEL_SUBSTR}%' ORDER BY created_at DESC LIMIT 1;"
OUT="$(./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml --command="$SQL" --json 2>/dev/null || true)"

echo "$OUT" | python3 -c "
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
    rows = d[0].get('results', []) if isinstance(d, list) and d else d.get('results', [])
    r = rows[0] if rows else {}
    inn = r.get('input_tokens')
    out = r.get('output_tokens')
    cost = r.get('computed_cost_usd')
    mid = r.get('id', '')
    conv = r.get('session_id', '')
    mod = r.get('model_used', '')
    if inn is None or out is None:
        sys.stderr.write('E2E FAIL: missing token columns in agent_telemetry row\\n')
        sys.exit(1)
    inn, out = int(inn), int(out)
    if inn <= 0 or out <= 0:
        sys.stderr.write(f'E2E FAIL: input_tokens={inn} output_tokens={out}\\n')
        sys.exit(1)
    print(f'OK telemetry id={mid} conversation_id={conv} model={mod} in={inn} out={out} cost_usd={cost}')
except Exception as e:
    sys.stderr.write(f'E2E FAIL: {e}\\n')
    sys.exit(1)
" || die "agent_telemetry gate failed"

echo ""
echo "=== E2E PASS ${RUN_ID} ==="
echo "Artifacts:"
echo "  Report: ${REPO_ROOT}/reports/ (latest overnight-*.json)"
if [[ "${E2E_SKIP_TOOLS:-0}" != "1" ]]; then
  echo "  TOOLS entry: ${TOOLS_ENTRY_URL}"
  if [[ "${E2E_TOOLS_MODE:-full}" == "full" ]] && [[ -f "${MANIFEST_LOCAL}" ]]; then
    echo "  Manifest:    ${MANIFEST_LOCAL}"
    echo "  Manifest R2: https://tools.inneranimalmedia.com/${TOOLS_PREFIX}/manifest.json"
  fi
  if [[ "${E2E_TOOLS_MODE:-full}" == "full" ]] && [[ -f "${PREVIEW_LOCAL}" ]]; then
    echo "  Preview HTML: ${PREVIEW_LOCAL}"
    echo "  Preview live: https://tools.inneranimalmedia.com/${TOOLS_PREFIX}/preview.html"
  fi
fi
echo "DONE"
