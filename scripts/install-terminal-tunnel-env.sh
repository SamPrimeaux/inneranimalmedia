#!/usr/bin/env zsh
# Sync terminal stack env from .env.cloudflare (SSOT) to:
#   - Mac ~/iam-pty: symlink .env.cloudflare → repo SSOT; slim .env for Mac-only overrides + PM2 restart
#   - GCP iam-tunnel VM ~/iam-pty/.env + PM2 restart (when reachable)
#   - Main Worker secrets: PTY_AUTH_TOKEN, TERMINAL_SECRET, TERMINAL_WS_URL
#   - MCP Worker secret: PTY_AUTH_TOKEN
#
# Usage (repo root):
#   ./scripts/install-terminal-tunnel-env.sh              # mac + workers + gcp
#   ./scripts/install-terminal-tunnel-env.sh --mac-only
#   ./scripts/install-terminal-tunnel-env.sh --workers-only
#   ./scripts/install-terminal-tunnel-env.sh --gcp-only
#   ./scripts/install-terminal-tunnel-env.sh --dry-run
#
# Requires: PTY_AUTH_TOKEN in .env.cloudflare (TERMINAL_SECRET defaults to same value).

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
MCP_EXPORTS="${REPO_ROOT}/.mcp_exports.sh"
MCP_DIR="${REPO_ROOT}/../inneranimalmedia-mcp-server"
MAC_PTY_DIR="${IAM_PTY_DIR:-$HOME/iam-pty}"
MAC_PTY_ENV="${MAC_PTY_DIR}/.env"

DRY_RUN=0
DO_MAC=1
DO_WORKERS=1
DO_GCP=1

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --mac-only) DO_WORKERS=0; DO_GCP=0 ;;
    --workers-only) DO_MAC=0; DO_GCP=0 ;;
    --gcp-only) DO_MAC=0; DO_WORKERS=0 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.cloudflare.example" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

PTY_TOKEN="${PTY_AUTH_TOKEN:-}"
if [[ -z "$PTY_TOKEN" ]]; then
  echo "PTY_AUTH_TOKEN is required in .env.cloudflare" >&2
  exit 1
fi

TERMINAL_SECRET_VAL="${TERMINAL_SECRET:-$PTY_TOKEN}"
TERMINAL_WS="${TERMINAL_WS_URL:-https://terminal.inneranimalmedia.com}"
MAC_WORKSPACES_ROOT="${IAM_MAC_WORKSPACES_ROOT:-/Users/samprimeaux}"
GCP_WORKSPACES_ROOT="${IAM_GCP_WORKSPACES_ROOT:-/workspace}"
ALLOWED="${ALLOWED_TENANTS:-tenant_sam_primeaux,tenant_connor_mcneely}"
MAC_ALLOWED="${IAM_MAC_ALLOWED_TENANTS:-tenant_sam_primeaux}"
WORKER_URL_VAL="${WORKER_URL:-https://inneranimalmedia.com}"
GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_ZONE_VAL="${GCP_ZONE:-}"

if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

write_pty_env() {
  local dest="$1"
  local workspaces_root="$2"
  local allowed_tenants="$3"
  local content
  content="$(cat <<EOF
# iam-pty local overrides (Mac/GCP). Secrets + WORKER_URL: .env.cloudflare (symlink to inneranimalmedia SSOT).
IAM_WORKSPACES_ROOT=${workspaces_root}
ALLOWED_TENANTS=${allowed_tenants}
PORT=3099
EOF
)"
  if (( DRY_RUN )); then
    echo "[dry-run] would write ${dest} (workspaces_root=${workspaces_root})"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  print -r -- "$content" > "$dest"
  chmod 600 "$dest"
  echo "OK: wrote ${dest}"
}

put_worker_secret() {
  local config="$1"
  local name="$2"
  local value="$3"
  if (( DRY_RUN )); then
    echo "[dry-run] would set Worker secret ${name} via ${config}"
    return 0
  fi
  printf '%s' "$value" | "${REPO_ROOT}/scripts/with-cloudflare-env.sh" \
    npx wrangler secret put "$name" -c "$config"
  echo "OK: Worker secret ${name}"
}

link_mac_ssot_env() {
  local dest_cloudflare="${MAC_PTY_DIR}/.env.cloudflare"
  local dest_mcp="${MAC_PTY_DIR}/.mcp_exports.sh"
  if (( DRY_RUN )); then
    echo "[dry-run] would symlink ${dest_cloudflare} → ${ENV_FILE}"
    [[ -f "$MCP_EXPORTS" ]] && echo "[dry-run] would symlink ${dest_mcp} → ${MCP_EXPORTS}"
    return 0
  fi
  mkdir -p "$(dirname "$dest_cloudflare")"
  rm -f "$dest_cloudflare"
  ln -sf "$ENV_FILE" "$dest_cloudflare"
  echo "OK: symlinked ${dest_cloudflare} → ${ENV_FILE}"
  if [[ -f "$MCP_EXPORTS" ]]; then
    rm -f "$dest_mcp"
    ln -sf "$MCP_EXPORTS" "$dest_mcp"
    echo "OK: symlinked ${dest_mcp} → ${MCP_EXPORTS}"
  fi
}

sync_mac() {
  if [[ ! -d "$MAC_PTY_DIR" ]]; then
    echo "Skip Mac: ${MAC_PTY_DIR} not found (clone github.com/SamPrimeaux/iam-pty)" >&2
    return 0
  fi
  link_mac_ssot_env
  write_pty_env "$MAC_PTY_ENV" "$MAC_WORKSPACES_ROOT" "$MAC_ALLOWED"
  if (( DRY_RUN )); then
    echo "[dry-run] would pm2 restart iam-pty"
    return 0
  fi
  if command -v pm2 >/dev/null 2>&1; then
    (cd "$MAC_PTY_DIR" && pm2 restart iam-pty --update-env 2>/dev/null) \
      || (cd "$MAC_PTY_DIR" && pm2 start ecosystem.config.cjs)
    echo "OK: pm2 iam-pty restarted (Mac)"
  else
    echo "pm2 not found — restart iam-pty manually" >&2
  fi
}

sync_workers() {
  put_worker_secret "${REPO_ROOT}/wrangler.production.toml" PTY_AUTH_TOKEN "$PTY_TOKEN"
  put_worker_secret "${REPO_ROOT}/wrangler.production.toml" TERMINAL_SECRET "$TERMINAL_SECRET_VAL"
  put_worker_secret "${REPO_ROOT}/wrangler.production.toml" TERMINAL_WS_URL "$TERMINAL_WS"

  if [[ -d "$MCP_DIR" ]]; then
    put_worker_secret "${MCP_DIR}/wrangler.jsonc" PTY_AUTH_TOKEN "$PTY_TOKEN"
  else
    echo "Skip MCP: ${MCP_DIR} not found" >&2
  fi
}

sync_gcp() {
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "Skip GCP: gcloud not installed" >&2
    return 0
  fi
  if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
    echo "Skip GCP: set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare (or ensure gcloud default project + iam-tunnel VM)" >&2
    return 0
  fi

  local remote_script
  remote_script="$(cat <<'REMOTE'
set -euo pipefail
SSOT="/workspace/tenant_sam_primeaux/au_871d920d1233cbd1/inneranimalmedia/.env.cloudflare"
PTY_DIR="$HOME/ExecOS"
[[ -d "$PTY_DIR" ]] || PTY_DIR="$HOME/iam-pty"
mkdir -p "$PTY_DIR"
ln -sfn "$SSOT" "$PTY_DIR/.env.cloudflare"
cat > "$PTY_DIR/.env" <<EOF
# Generated by install-terminal-tunnel-env.sh (remote) — secrets live in .env.cloudflare SSOT
WORKER_URL=__WORKER_URL__
IAM_WORKSPACES_ROOT=__GCP_ROOT__
ALLOWED_TENANTS=__ALLOWED__
PORT=3099
TUNNEL_URL=https://terminal.inneranimalmedia.com
EOF
chmod 600 "$PTY_DIR/.env" "$PTY_DIR/.env.cloudflare" 2>/dev/null || chmod 600 "$PTY_DIR/.env"
if command -v pm2 >/dev/null 2>&1; then
  cd "$PTY_DIR"
  pm2 restart execos --update-env 2>/dev/null || pm2 restart iam-pty --update-env 2>/dev/null || pm2 start ecosystem.config.cjs
  pm2 save 2>/dev/null || true
fi
REMOTE
)"
  remote_script="${remote_script//__WORKER_URL__/$WORKER_URL_VAL}"
  remote_script="${remote_script//__GCP_ROOT__/$GCP_WORKSPACES_ROOT}"
  remote_script="${remote_script//__ALLOWED__/$ALLOWED}"

  if (( DRY_RUN )); then
    echo "[dry-run] would gcloud ssh ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL}) and sync iam-pty/.env"
    return 0
  fi

  gcloud compute ssh "$GCP_VM_NAME" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE_VAL" \
    --command="$remote_script"
  echo "OK: GCP iam-pty env synced + pm2 restarted"
}

verify_endpoints() {
  local host code
  for host in localpty.inneranimalmedia.com terminal.inneranimalmedia.com sandboxterminal.inneranimalmedia.com; do
    code="$(curl -sS -m 8 -o /dev/null -w '%{http_code}' "https://${host}/health" || echo '000')"
    echo "health https://${host}/health → HTTP ${code}"
  done

  if (( DRY_RUN )); then
    return 0
  fi

  code="$(curl -sS -m 8 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${PTY_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"command":"pwd","cwd":"/tmp","timeout_ms":5000}' \
    "https://terminal.inneranimalmedia.com/exec" || echo '000')"
  echo "exec  https://terminal.inneranimalmedia.com/exec → HTTP ${code} (expect 200)"
}

echo "=== install-terminal-tunnel-env ==="
(( DO_MAC )) && sync_mac
(( DO_WORKERS )) && sync_workers
(( DO_GCP )) && sync_gcp
if (( DO_GCP )) && [[ -x "${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh" ]]; then
  if (( DRY_RUN )); then
    "${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh" --dry-run
  else
    "${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh"
  fi
fi
verify_endpoints
echo "Done."
