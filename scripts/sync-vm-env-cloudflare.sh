#!/usr/bin/env zsh
# Securely sync gitignored env from Mac repo SSOT → GCP iam-tunnel GitHub clone.
# Never commits secrets. Remote files are chmod 600.
#
# Usage (repo root):
#   ./scripts/sync-vm-env-cloudflare.sh
#   ./scripts/sync-vm-env-cloudflare.sh --dry-run
#
# Target path (comma-separated on VM):
#   IAM_VM_ENV_REPO_PATHS=/home/samprimeaux/inneranimalmedia

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
MCP_EXPORTS="${REPO_ROOT}/.mcp_exports.sh"
GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
DRY_RUN=0

for arg in "$@"; do
  [[ "$arg" == --dry-run ]] && DRY_RUN=1
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_ZONE_VAL="${GCP_ZONE:-}"
if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Skip VM env: gcloud not installed" >&2
  exit 0
fi
if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "Skip VM env: set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 0
fi

DEFAULT_REPO="${IAM_GCP_REPO_PATH:-/home/samprimeaux/inneranimalmedia}"
VM_PATHS="${IAM_VM_ENV_REPO_PATHS:-$DEFAULT_REPO}"

if (( DRY_RUN )); then
  echo "[dry-run] would scp .env.cloudflare (+ .mcp_exports.sh if present) to ${GCP_VM_NAME}"
  echo "[dry-run] target repo paths: ${VM_PATHS}"
  exit 0
fi

_gcp_vm_cmd() {
  bash -lc "source '${REPO_ROOT}/scripts/lib/gcp-vm-paths.sh'; export GCP_PROJECT_ID='${GCP_PROJECT}'; export GCP_ZONE='${GCP_ZONE_VAL}'; \"\$@\"" bash "$@"
}

_gcp_vm_cmd gcp_vm_ssh --command='rm -rf /tmp/iam-env-sync && mkdir -p /tmp/iam-env-sync && chmod 700 /tmp/iam-env-sync'

_gcp_vm_cmd gcp_vm_scp "$ENV_FILE" \
  "${GCP_VM_NAME}:/tmp/iam-env-sync/.env.cloudflare"

if [[ -f "$MCP_EXPORTS" ]]; then
  _gcp_vm_cmd gcp_vm_scp "$MCP_EXPORTS" \
    "${GCP_VM_NAME}:/tmp/iam-env-sync/.mcp_exports.sh"
fi

_gcp_vm_cmd gcp_vm_ssh --command="export PATHS=$(printf '%q' "$VM_PATHS"); export DEFAULT_REPO=$(printf '%q' "$DEFAULT_REPO"); bash -s" <<'REMOTE'
set -euo pipefail
if ! command -v zsh >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq zsh
    echo "OK: installed zsh for with-cloudflare-env.sh"
  else
    echo "WARN: zsh missing — install manually for ./scripts/with-cloudflare-env.sh" >&2
  fi
fi
IFS=',' read -ra REPOS <<< "$PATHS"
for repo in "${REPOS[@]}"; do
  repo="${repo// /}"
  [[ -n "$repo" ]] || continue
  if [[ ! -d "$repo/.git" ]]; then
    echo "WARN: $repo is not a git clone — run ./scripts/bootstrap-gcp-vm-repo.sh from Mac first" >&2
  fi
  sudo mkdir -p "$repo"
  sudo cp /tmp/iam-env-sync/.env.cloudflare "$repo/.env.cloudflare"
  sudo chmod 600 "$repo/.env.cloudflare"
  if [[ -f /tmp/iam-env-sync/.mcp_exports.sh ]]; then
    sudo cp /tmp/iam-env-sync/.mcp_exports.sh "$repo/.mcp_exports.sh"
    sudo chmod 600 "$repo/.mcp_exports.sh"
  fi
  sudo chown -R agentsam:agentsam "$repo/.env.cloudflare" "$repo/.mcp_exports.sh" 2>/dev/null || \
    sudo chown agentsam:agentsam "$repo/.env.cloudflare" 2>/dev/null || true
  echo "OK: synced env → $repo"
done
rm -rf /tmp/iam-env-sync

MARK_BEGIN='# >>> IAM local env (inneranimalmedia) — managed by scripts/sync-vm-env-cloudflare.sh >>>'
MARK_END='# <<< IAM local env (inneranimalmedia) <<<'
for rc in "${HOME}/.zshrc" "${HOME}/.bashrc"; do
  touch "$rc"
  if grep -Fq "$MARK_BEGIN" "$rc"; then
    sed -i "s|^export IAM_REPO=.*|export IAM_REPO=\"$DEFAULT_REPO\"|" "$rc"
    echo "OK: updated IAM_REPO in $rc"
  else
    {
      echo ''
      echo "$MARK_BEGIN"
      echo "export IAM_REPO=\"$DEFAULT_REPO\""
      if [[ "$rc" == *zshrc ]]; then
        echo 'if [[ -f "$IAM_REPO/scripts/lib/load-iam-local-env.sh" ]]; then'
        echo '  source "$IAM_REPO/scripts/lib/load-iam-local-env.sh"'
        echo 'fi'
      else
        echo 'if [[ -f "$IAM_REPO/.env.cloudflare" ]]; then'
        echo '  set -a'
        echo '  # shellcheck source=/dev/null'
        echo '  source "$IAM_REPO/.env.cloudflare"'
        echo '  [[ -f "$IAM_REPO/.mcp_exports.sh" ]] && source "$IAM_REPO/.mcp_exports.sh"'
        echo '  set +a'
        echo 'fi'
      fi
      echo "$MARK_END"
    } >> "$rc"
    echo "OK: appended IAM env block to $rc"
  fi
done
REMOTE

echo "Done: VM env synced (chmod 600). On GCP PTY:"
echo "  cd ${DEFAULT_REPO} && source scripts/lib/load-iam-local-env.sh"
