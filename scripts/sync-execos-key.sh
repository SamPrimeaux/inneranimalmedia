#!/usr/bin/env zsh
# Rotate or sync EXECOS_KEY across SSOT env files, Workers, and GCP ExecOS VM.
#
# Usage (repo root):
#   ./scripts/sync-execos-key.sh              # rotate + sync everywhere
#   ./scripts/sync-execos-key.sh --sync-only  # push current .env.cloudflare value (no rotation)
#   ./scripts/sync-execos-key.sh --dry-run
#
# Targets:
#   - inneranimalmedia/.env.cloudflare (SSOT)
#   - ExecOS/.env.cloudflare + ExecOS/.env
#   - Worker secrets: inneranimalmedia (CORE), execos dispatcher, MCP server
#   - GCP iam-tunnel ~/ExecOS via sync-vm-env-cloudflare + pm2 restart

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
EXECOS_DIR="${REPO_ROOT}/../ExecOS"
MCP_DIR="${REPO_ROOT}/../inneranimalmedia-mcp-server"

DRY_RUN=0
ROTATE=1

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --sync-only) ROTATE=0 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

if (( ROTATE )); then
  NEW_KEY="$(openssl rand -hex 32)"
  echo "Rotating EXECOS_KEY (new sha256 prefix: $(printf '%s' "$NEW_KEY" | shasum -a 256 | cut -c1-12))"
  if (( DRY_RUN )); then
    echo "[dry-run] would update EXECOS_KEY in SSOT env files"
  else
    python3 - "$ENV_FILE" "$NEW_KEY" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
text = path.read_text()
line = f"EXECOS_KEY={key}\n"
if re.search(r'^EXECOS_KEY=', text, flags=re.M):
    text = re.sub(r'^EXECOS_KEY=.*$', f"EXECOS_KEY={key}", text, flags=re.M)
else:
    if not text.endswith('\n'):
        text += '\n'
    text += f"\n# ExecOS dispatcher + MCP + VM /run auth\n{line}"
path.write_text(text)
PY
    export EXECOS_KEY="$NEW_KEY"
  fi
else
  : "${EXECOS_KEY:?EXECOS_KEY missing in .env.cloudflare}"
  echo "Sync-only mode (sha256 prefix: $(printf '%s' "$EXECOS_KEY" | shasum -a 256 | cut -c1-12))"
fi

if (( ! DRY_RUN )); then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
  : "${EXECOS_KEY:?EXECOS_KEY missing after update}"

  for dest in "${EXECOS_DIR}/.env.cloudflare" "${EXECOS_DIR}/.env"; do
    if [[ -f "$dest" ]] || [[ "$dest" == *".env.cloudflare" ]]; then
      python3 - "$dest" "$EXECOS_KEY" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
path.parent.mkdir(parents=True, exist_ok=True)
text = path.read_text() if path.exists() else ""
if re.search(r'^EXECOS_KEY=', text, flags=re.M):
    text = re.sub(r'^EXECOS_KEY=.*$', f"EXECOS_KEY={key}", text, flags=re.M)
else:
    if text and not text.endswith('\n'):
        text += '\n'
    text += f"EXECOS_KEY={key}\n"
path.write_text(text)
path.chmod(0o600)
PY
      echo "OK: updated ${dest}"
    fi
  done
fi

put_worker_secret() {
  local config="$1"
  local name="$2"
  if (( DRY_RUN )); then
    echo "[dry-run] would set Worker secret ${name} via ${config}"
    return 0
  fi
  printf '%s' "$EXECOS_KEY" | "${REPO_ROOT}/scripts/with-cloudflare-env.sh" \
    npx wrangler secret put "$name" -c "$config"
  echo "OK: Worker secret ${name} (${config})"
}

put_worker_secret "${REPO_ROOT}/wrangler.production.toml" EXECOS_KEY

if [[ -f "${EXECOS_DIR}/dispatcher/wrangler.jsonc" ]]; then
  put_worker_secret "${EXECOS_DIR}/dispatcher/wrangler.jsonc" EXECOS_KEY
else
  echo "Skip execos dispatcher: ${EXECOS_DIR}/dispatcher/wrangler.jsonc not found" >&2
fi

if [[ -f "${MCP_DIR}/wrangler.jsonc" ]]; then
  put_worker_secret "${MCP_DIR}/wrangler.jsonc" EXECOS_KEY
else
  echo "Skip MCP server: ${MCP_DIR}/wrangler.jsonc not found" >&2
fi

if (( DRY_RUN )); then
  "${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh" --dry-run
  echo "[dry-run] would run install-terminal-tunnel-env.sh --gcp-only"
else
  "${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh"
  "${REPO_ROOT}/scripts/install-terminal-tunnel-env.sh" --gcp-only
  echo "== smoke execos chain =="
  "${REPO_ROOT}/scripts/test/smoke-execos-chain.sh"
fi

echo "Done: EXECOS_KEY synced across CORE, execos Worker, MCP server, and GCP VM."
