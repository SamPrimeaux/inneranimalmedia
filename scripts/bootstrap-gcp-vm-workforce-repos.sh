#!/usr/bin/env bash
# Sparse-bootstrap additional workforce repos on GCP iam-tunnel.
#
# Complements bootstrap-gcp-vm-repo.sh (operator IAM clone). These trees match
# workspace_settings.vm_workspace_root so agentsam_terminal_* fail-loud cwd works
# for in-app + MCP agents without silent operator-repo bleed.
#
# Default set (override with IAM_GCP_WORKFORCE_REPOS):
#   inneranimalmedia-mcp-server  ws_inneranimalmedia_mcp
#   fuelnfreetime                ws_fuelnfreetime
#   companionscpas               ws_companionscpas
#
# Usage (Mac, IAM repo root):
#   ./scripts/bootstrap-gcp-vm-workforce-repos.sh
#   ./scripts/bootstrap-gcp-vm-workforce-repos.sh --dry-run
#   ./scripts/bootstrap-gcp-vm-workforce-repos.sh --reconvert-sparse
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
RECONVERT_SPARSE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --reconvert-sparse) RECONVERT_SPARSE=1 ;;
  esac
done

if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_ZONE_VAL="${GCP_ZONE:-}"
HOME_BASE="${IAM_GCP_HOME_BASE:-/home/samprimeaux}"

# name|github_slug|sparse_paths|ssh_url_override(optional)
# Override used when workspace_settings.ssh_remote_overrides points at a Host alias
# (e.g. github.com-inneranimal-mcp). Empty override → git@github.com:SLUG.git
DEFAULT_REPOS="$(cat <<'EOF'
inneranimalmedia-mcp-server|SamPrimeaux/inneranimalmedia-mcp-server|src scripts migrations docs|git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git
fuelnfreetime|SamPrimeaux/fuelnfreetime|src scripts public docs|
companionscpas|SamPrimeaux/companionscpas|src scripts public docs static|
EOF
)"
WORKFORCE_REPOS="${IAM_GCP_WORKFORCE_REPOS:-$DEFAULT_REPOS}"

if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "✗ gcloud not installed" >&2
  exit 1
fi
if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 1
fi

echo "GCP VM: ${GCP_VM_NAME} (${GCP_PROJECT} / ${GCP_ZONE_VAL})"
echo "Home base: ${HOME_BASE}"
echo "Repos:"
echo "$WORKFORCE_REPOS" | while IFS='|' read -r name slug paths ssh_url; do
  [[ -z "${name:-}" ]] && continue
  url="${ssh_url:-git@github.com:${slug}.git}"
  echo "  - ${HOME_BASE}/${name} ← ${url}  [${paths}]"
done

# Encode repo lines for remote (newline-safe via base64)
REPOS_B64="$(printf '%s\n' "$WORKFORCE_REPOS" | base64 | tr -d '\n')"

REMOTE_CMD="$(cat <<EOF
set -euo pipefail
HOME_BASE='${HOME_BASE}'
RECONVERT='${RECONVERT_SPARSE}'
AGENTSAM_USER=agentsam
REPOS_B64='${REPOS_B64}'

clear_stale_git_locks() {
  local repo="\$1"
  [[ -d "\${repo}/.git" ]] || return 0
  find "\${repo}/.git" -name '*.lock' -type f -mmin +2 -delete 2>/dev/null || true
}

bootstrap_one() {
  local name="\$1" slug="\$2" sparse_paths="\$3" ssh_url="\$4"
  local REPO_DIR="\${HOME_BASE}/\${name}"
  local REPO_URL="\${ssh_url:-git@github.com:\${slug}.git}"

  echo ""
  echo "======== \${name} ========"

  git_as() {
    sudo -u samprimeaux git config --global --add safe.directory "\$REPO_DIR" 2>/dev/null || true
    sudo -u samprimeaux git -C "\$REPO_DIR" "\$@"
  }

  fresh_sparse_clone() {
    echo "→ fresh tiny clone (--filter=blob:none --sparse --depth=1) \${REPO_URL}"
    sudo rm -rf "\$REPO_DIR"
    # Partial + shallow + sparse at clone time — sparse-checkout alone is not enough on a tiny VM.
    sudo -u samprimeaux git clone \
      --filter=blob:none \
      --sparse \
      --depth=1 \
      "\$REPO_URL" "\$REPO_DIR"
    # shellcheck disable=SC2086
    git_as sparse-checkout set \$sparse_paths
    clear_stale_git_locks "\$REPO_DIR"
    sudo chown -R "\${AGENTSAM_USER}:\${AGENTSAM_USER}" "\$REPO_DIR"
  }

  if [[ "\$RECONVERT" == "1" ]]; then
    fresh_sparse_clone
  elif [[ -d "\$REPO_DIR/.git" ]]; then
    echo "→ existing clone — sparse sync (prefer --reconvert-sparse for depth=1 rebuild)"
    sudo chown -R samprimeaux:samprimeaux "\$REPO_DIR"
    clear_stale_git_locks "\$REPO_DIR"
    # shellcheck disable=SC2086
    git_as sparse-checkout set \$sparse_paths
    git_as fetch --depth=1 origin
    local branch
    branch="\$(git_as rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
    git_as checkout "\$branch" 2>/dev/null || git_as checkout main
    git_as reset --hard "origin/\${branch}" 2>/dev/null || git_as reset --hard origin/main
    clear_stale_git_locks "\$REPO_DIR"
    sudo chown -R "\${AGENTSAM_USER}:\${AGENTSAM_USER}" "\$REPO_DIR"
  else
    fresh_sparse_clone
  fi

  echo -n "REPO_OK: "
  sudo -u "\${AGENTSAM_USER}" git -C "\$REPO_DIR" rev-parse --short HEAD
  echo -n "shape: shallow="
  sudo -u "\${AGENTSAM_USER}" git -C "\$REPO_DIR" rev-parse --is-shallow-repository
  echo -n "filter="
  sudo -u "\${AGENTSAM_USER}" git -C "\$REPO_DIR" config --get remote.origin.partialclonefilter || echo none
  sudo -u "\${AGENTSAM_USER}" git -C "\$REPO_DIR" remote -v | head -1
  du -sh "\$REPO_DIR"
  pwd_check="\$(sudo -u "\${AGENTSAM_USER}" bash -lc "cd '\$REPO_DIR' && pwd && test -d src && echo HAS_SRC")"
  echo "\$pwd_check"
}

printf '%s' "\$REPOS_B64" | base64 -d | while IFS='|' read -r name slug paths ssh_url; do
  [[ -z "\${name:-}" ]] && continue
  bootstrap_one "\$name" "\$slug" "\$paths" "\$ssh_url"
done

echo ""
echo "=== final disk ==="
df -h "\$HOME_BASE" | tail -1
for d in inneranimalmedia inneranimalmedia-mcp-server fuelnfreetime companionscpas ExecOS; do
  p="\${HOME_BASE}/\${d}"
  if [[ -d "\$p" ]]; then
    echo "EXISTS \${d}: \$(du -sh "\$p" | awk '{print \$1}')"
  else
    echo "MISSING \${d}"
  fi
done
EOF
)"

if (( DRY_RUN )); then
  echo "[dry-run] would sparse-bootstrap workforce repos on ${GCP_VM_NAME}"
  exit 0
fi

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --tunnel-through-iap \
  --command="$REMOTE_CMD"

echo ""
echo "D1 vm_workspace_root should already match:"
echo "  ws_inneranimalmedia_mcp → ${HOME_BASE}/inneranimalmedia-mcp-server"
echo "  ws_fuelnfreetime        → ${HOME_BASE}/fuelnfreetime"
echo "  ws_companionscpas       → ${HOME_BASE}/companionscpas"
echo "  ws_inneranimalmedia     → ${HOME_BASE}/inneranimalmedia (existing)"
echo ""
echo "Smoke (in-app / MCP terminal, workspace-scoped):"
echo "  pwd && git remote -v && ls src | head"
