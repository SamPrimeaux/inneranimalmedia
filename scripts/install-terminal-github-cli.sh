#!/usr/bin/env zsh
# Install GitHub CLI (gh) + git credential helper on PTY hosts.
#
# Profiles (never cross-contaminate GitHub accounts):
#   sam    — platform operator: Mac iam-pty + shared GCP iam-tunnel; token in .env.cloudflare
#   connor — Connor only: local machine; token in ~/.config/iam/github.env; no shared GCP
#   self   — any operator: like connor but login taken from PAT (must not be SamPrimeaux)
#
# Usage:
#   ./scripts/install-terminal-github-cli.sh --prompt-token              # Sam (default)
#   ./scripts/install-terminal-github-cli-connor.sh                      # Connor wrapper
#   ./scripts/install-terminal-github-cli.sh --profile self --prompt-token --local-only
#
# Flags: --mac-only | --gcp-only | --local-only | --dry-run | --help

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
USER_GH_ENV="${IAM_GITHUB_ENV:-${HOME}/.config/iam/github.env}"
MAC_PTY_ENV="${IAM_PTY_DIR:-$HOME/iam-pty}/.env"

DRY_RUN=0
DO_MAC=1
DO_GCP=1
PROMPT_TOKEN=0
PROFILE="sam"
TOKEN_ENV_FILE=""
GH_LOGIN=""
GH_NAME=""
GH_EMAIL=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --mac-only) DO_GCP=0 ;;
    --gcp-only) DO_MAC=0 ;;
    --local-only) DO_GCP=0 ;;
    --prompt-token) PROMPT_TOKEN=1 ;;
    --profile=sam|--profile=connor|--profile=self)
      PROFILE="${arg#*=}"
      ;;
    --profile)
      echo "Use --profile=sam|connor|self (e.g. --profile=connor)" >&2
      exit 1
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      echo ""
      echo "Connor: ./scripts/install-terminal-github-cli-connor.sh"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

PROFILE="${PROFILE:l}"
case "$PROFILE" in
  sam|connor|self) ;;
  *)
    echo "Invalid --profile ${PROFILE} (use sam, connor, or self)" >&2
    exit 1
    ;;
esac

if [[ "$PROFILE" == "connor" ]]; then
  TOKEN_ENV_FILE="$USER_GH_ENV"
  DO_GCP=0
elif [[ "$PROFILE" == "self" ]]; then
  TOKEN_ENV_FILE="$USER_GH_ENV"
else
  TOKEN_ENV_FILE="$ENV_FILE"
fi

validate_github_token() {
  local token="$1"
  if [[ -z "$token" ]]; then
    echo "empty token" >&2
    return 1
  fi
  local http meta
  http="$(curl -sS -o /tmp/iam-gh-user.json -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    https://api.github.com/user 2>/dev/null || echo 000)"
  if [[ "$http" != "200" ]]; then
    echo "GitHub API rejected token (HTTP ${http})." >&2
    return 1
  fi
  meta="$(python3 - <<'PY' 2>/dev/null || echo '{}'
import json
try:
    d = json.load(open("/tmp/iam-gh-user.json"))
    print(json.dumps({
        "login": d.get("login") or "",
        "name": d.get("name") or "",
        "email": (d.get("email") or ""),
    }))
except Exception:
    print("{}")
PY
)"
  GH_LOGIN="$(print -r -- "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("login") or "")' 2>/dev/null || true)"
  GH_NAME="$(print -r -- "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name") or "")' 2>/dev/null || true)"
  GH_EMAIL="$(print -r -- "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("email") or "")' 2>/dev/null || true)"
  if [[ -n "$GH_LOGIN" ]]; then
    echo "OK: token valid for GitHub user @${GH_LOGIN}"
  else
    echo "OK: token validated (HTTP 200)"
  fi
  if [[ "$PROFILE" == "connor" || "$PROFILE" == "self" ]]; then
    if [[ "$GH_LOGIN" == "SamPrimeaux" ]]; then
      echo "ERROR: this profile requires YOUR GitHub PAT, not @SamPrimeaux." >&2
      echo "Create a token at https://github.com/settings/tokens for account @${GH_LOGIN:-your-account}." >&2
      return 1
    fi
  elif [[ "$PROFILE" == "sam" && -n "$GH_LOGIN" && "$GH_LOGIN" != "SamPrimeaux" ]]; then
    echo "WARN: Sam profile but token is @${GH_LOGIN} (expected SamPrimeaux for platform GCP gh)." >&2
  fi
  return 0
}

persist_github_token_to_env() {
  local token="$1"
  local dest="$TOKEN_ENV_FILE"
  if (( DRY_RUN )); then
    echo "[dry-run] would save GITHUB_TOKEN to ${dest}"
    return 0
  fi
  if [[ "$dest" == "$USER_GH_ENV" ]]; then
    mkdir -p "$(dirname "$dest")"
    if [[ ! -f "$dest" ]]; then
      print -r -- "# IAM per-user GitHub PAT — never commit" > "$dest"
    fi
  elif [[ ! -f "$dest" ]]; then
    if [[ -f "${REPO_ROOT}/.env.cloudflare.example" ]]; then
      cp "${REPO_ROOT}/.env.cloudflare.example" "$dest"
      echo "Created ${dest} from example."
    else
      print -r -- "# gitignored — platform .env.cloudflare" > "$dest"
    fi
  fi
  chmod 600 "$dest"
  local tmp="${dest}.tmp.$$"
  if grep -qE '^[[:space:]]*GITHUB_TOKEN=' "$dest" 2>/dev/null; then
    awk -v line="GITHUB_TOKEN=${token}" '
      /^[[:space:]]*GITHUB_TOKEN=/ { print line; next }
      { print }
    ' "$dest" > "$tmp"
  else
    cat "$dest" > "$tmp"
    print -r -- "GITHUB_TOKEN=${token}" >> "$tmp"
  fi
  if [[ "$PROFILE" == "connor" || "$PROFILE" == "self" ]]; then
    {
      print -r -- "IAM_GITHUB_PROFILE=${PROFILE}"
      [[ -n "$GH_LOGIN" ]] && print -r -- "GITHUB_ACCOUNT=${GH_LOGIN}"
    } >> "$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$dest"
  echo "OK: saved GITHUB_TOKEN to ${dest} (gitignored / user-local, not committed)"
}

load_token_from_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  set -a
  # shellcheck source=/dev/null
  source "$f"
  set +a
  GITHUB_TOKEN_VAL="${GITHUB_TOKEN:-${GH_TOKEN:-${GITHUB_PAT:-}}}"
  [[ -n "$GITHUB_TOKEN_VAL" ]]
}

prompt_for_github_token() {
  local attempt=1
  local max_attempts=3
  while (( attempt <= max_attempts )); do
    print -n "Paste YOUR GITHUB_TOKEN (ghp_ or github_pat_; input hidden): " >&2
    read -rs GITHUB_TOKEN_VAL
    print "" >&2
    if validate_github_token "$GITHUB_TOKEN_VAL"; then
      persist_github_token_to_env "$GITHUB_TOKEN_VAL"
      return 0
    fi
    (( attempt++ ))
    if (( attempt <= max_attempts )); then
      echo "Try again (${attempt}/${max_attempts})…" >&2
    fi
  done
  echo "Giving up after ${max_attempts} invalid tokens." >&2
  exit 1
}

if (( PROMPT_TOKEN )); then
  prompt_for_github_token
elif load_token_from_env_file "$TOKEN_ENV_FILE"; then
  validate_github_token "$GITHUB_TOKEN_VAL" || {
    echo "Re-run with --prompt-token to enter a fresh PAT." >&2
    exit 1
  }
else
  echo "No token in ${TOKEN_ENV_FILE} — re-run with --prompt-token" >&2
  exit 1
fi

if [[ "$PROFILE" == "sam" && -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi
unset GITHUB_TOKEN GH_TOKEN GITHUB_PAT

gh_env() {
  env -u GITHUB_TOKEN -u GH_TOKEN -u GITHUB_PAT "$@"
}

if [[ "$PROFILE" == "sam" ]]; then
  GIT_USER_NAME_VAL="${GIT_USER_NAME:-${GITHUB_USER_NAME:-Sam Primeaux}}"
  GIT_USER_EMAIL_VAL="${GIT_USER_EMAIL:-${GITHUB_USER_EMAIL:-ceosamprimeaux@gmail.com}}"
else
  GIT_USER_NAME_VAL="${GIT_USER_NAME:-${GH_NAME:-${GH_LOGIN:-}}}"
  GIT_USER_EMAIL_VAL="${GIT_USER_EMAIL:-${GH_EMAIL:-}}}"
  if [[ -z "$GIT_USER_NAME_VAL" || -z "$GIT_USER_EMAIL_VAL" ]]; then
    print -n "Git user.name [${GH_NAME:-$GH_LOGIN}]: " >&2
    read -r GIT_USER_NAME_VAL
    GIT_USER_NAME_VAL="${GIT_USER_NAME_VAL:-${GH_NAME:-$GH_LOGIN}}"
    print -n "Git user.email: " >&2
    read -r GIT_USER_EMAIL_VAL
    if [[ -z "$GIT_USER_EMAIL_VAL" ]]; then
      echo "Git email required for commits." >&2
      exit 1
    fi
  fi
fi

persist_gcp_env_to_cloudflare() {
  [[ "$PROFILE" == "sam" ]] || return 0
  [[ -f "$ENV_FILE" ]] || return 0
  local project zone
  project="$(gcloud config get-value project 2>/dev/null || true)"
  zone="$(gcloud compute instances list --project="${GCP_PROJECT_ID:-$project}" \
    --filter="name=${GCP_VM_NAME:-iam-tunnel}" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
  [[ -n "$project" ]] || return 0
  if (( DRY_RUN )); then
    echo "[dry-run] would sync GCP_PROJECT_ID/GCP_ZONE to ${ENV_FILE}"
    return 0
  fi
  local tmp="${ENV_FILE}.tmp.$$"
  awk -v p="$project" -v z="${zone:-us-central1-f}" '
    BEGIN { have_p=0; have_z=0 }
    /^[[:space:]]*GCP_PROJECT_ID=/ { print "GCP_PROJECT_ID=" p; have_p=1; next }
    /^[[:space:]]*GCP_ZONE=/ { if (z != "") { print "GCP_ZONE=" z; have_z=1 } else { print; have_z=1 }; next }
    { print }
    END {
      if (!have_p) print "GCP_PROJECT_ID=" p
      if (!have_z && z != "") print "GCP_ZONE=" z
    }
  ' "$ENV_FILE" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  echo "OK: synced GCP_PROJECT_ID/GCP_ZONE in ${ENV_FILE}"
}

GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_ZONE_VAL="${GCP_ZONE:-}"

if [[ "$PROFILE" == "sam" ]]; then
  persist_gcp_env_to_cloudflare
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
    unset GITHUB_TOKEN GH_TOKEN GITHUB_PAT
    GCP_PROJECT="${GCP_PROJECT_ID:-$GCP_PROJECT}"
    GCP_ZONE_VAL="${GCP_ZONE:-$GCP_ZONE_VAL}"
  fi
fi

if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" && "$PROFILE" == "sam" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

write_ssh_config_block() {
  local dest="$1"
  local content
  if [[ "$PROFILE" == "sam" ]]; then
    content="$(cat <<'EOF'
# IAM PTY — GitHub SSH (Sam platform — scripts/install-terminal-github-cli.sh)
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  AddKeysToAgent yes

Host github-inneranimal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes

Host github.com-inneranimal-mcp
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
EOF
)"
  else
    content="$(cat <<EOF
# IAM PTY — GitHub SSH (${GH_LOGIN:-self} — scripts/install-terminal-github-cli.sh)
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  AddKeysToAgent yes
EOF
)"
  fi
  if (( DRY_RUN )); then
    echo "[dry-run] would write SSH block to ${dest} (profile=${PROFILE})"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  local marker="IAM PTY — GitHub SSH"
  if [[ -f "$dest" ]] && grep -q "$marker" "$dest" 2>/dev/null; then
    echo "OK: SSH config already has IAM GitHub block (${dest})"
    return 0
  fi
  print -r -- "$content" >> "$dest"
  chmod 600 "$dest"
  echo "OK: appended GitHub SSH block to ${dest}"
}

configure_gh_auth_local() {
  local label="$1"
  if ! command -v gh >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1; then
      (( DRY_RUN )) && echo "[dry-run] would brew install gh" && return 0
      brew install gh
    elif command -v apt-get >/dev/null 2>&1; then
      (( DRY_RUN )) && echo "[dry-run] would apt install gh" && return 0
      sudo apt-get update -qq && sudo apt-get install -y -qq gh
    else
      echo "Install gh manually: https://cli.github.com/" >&2
      return 1
    fi
  fi
  if (( DRY_RUN )); then
    echo "[dry-run] would gh auth on ${label} (profile=${PROFILE})"
    return 0
  fi
  git config --global user.name "$GIT_USER_NAME_VAL"
  git config --global user.email "$GIT_USER_EMAIL_VAL"
  if gh_env gh auth status -h github.com >/dev/null 2>&1; then
    local active
    active="$(gh_env gh auth status -h github.com 2>&1 | head -3 || true)"
    if [[ "$PROFILE" != "sam" && "$active" == *SamPrimeaux* ]]; then
      echo "ERROR: gh on ${label} is logged in as SamPrimeaux — run: gh auth logout -h github.com" >&2
      return 1
    fi
    gh_env gh auth setup-git
    write_ssh_config_block "$HOME/.ssh/config"
    echo "OK: gh already authenticated on ${label} (@${GH_LOGIN:-unknown})"
    return 0
  fi
  printf '%s' "$GITHUB_TOKEN_VAL" | gh_env gh auth login --hostname github.com --git-protocol ssh --with-token
  gh_env gh auth setup-git
  if ! gh_env gh auth status -h github.com >/dev/null 2>&1; then
    echo "ERROR: gh auth login failed on ${label}" >&2
    return 1
  fi
  write_ssh_config_block "$HOME/.ssh/config"
  echo "OK: gh + git credential helper on ${label} (@${GH_LOGIN:-$(gh_env gh api user -q .login 2>/dev/null || echo unknown)})"
}

sync_mac_pty_env_hint() {
  [[ "$PROFILE" == "sam" ]] || return 0
  [[ -f "$MAC_PTY_ENV" ]] || return 0
  if (( DRY_RUN )); then
    echo "[dry-run] would update iam-pty PATH + pm2 restart"
    return 0
  fi
  if ! grep -q '^PATH=' "$MAC_PTY_ENV" 2>/dev/null; then
    print -r -- 'PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' >> "$MAC_PTY_ENV"
  fi
  if command -v pm2 >/dev/null 2>&1 && [[ -d "${IAM_PTY_DIR:-$HOME/iam-pty}" ]]; then
    (cd "${IAM_PTY_DIR:-$HOME/iam-pty}" && pm2 restart iam-pty --update-env 2>/dev/null) || true
  fi
}

install_gcp() {
  [[ "$PROFILE" == "sam" ]] || {
    echo "Skip GCP: shared iam-tunnel is Sam platform only (Connor uses --local-only)." >&2
    return 0
  }
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "Skip GCP: gcloud not installed" >&2
    return 0
  fi
  if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
    echo "Skip GCP: set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
    return 0
  fi

  local token_file
  token_file="$(mktemp)"
  chmod 600 "$token_file"
  printf '%s' "$GITHUB_TOKEN_VAL" > "$token_file"

  if (( DRY_RUN )); then
    echo "[dry-run] would install gh on GCP ${GCP_VM_NAME}"
    rm -f "$token_file"
    return 0
  fi

  gcloud compute scp "$token_file" "${GCP_VM_NAME}:/tmp/iam-gh-token" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE_VAL"

  gcloud compute ssh "$GCP_VM_NAME" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE_VAL" \
    --command="$(cat <<REMOTE
set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v gh >/dev/null 2>&1; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
  sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq gh curl ca-certificates
fi
git config --global user.name $(printf %q "$GIT_USER_NAME_VAL")
git config --global user.email $(printf %q "$GIT_USER_EMAIL_VAL")
if gh auth status -h github.com >/dev/null 2>&1; then
  gh auth setup-git
else
  gh auth login --hostname github.com --git-protocol ssh --with-token < /tmp/iam-gh-token
  gh auth setup-git
fi
rm -f /tmp/iam-gh-token
mkdir -p ~/.ssh && chmod 700 ~/.ssh
if ! grep -q 'IAM PTY — GitHub SSH' ~/.ssh/config 2>/dev/null; then
  cat >> ~/.ssh/config <<'SSHEOF'
# IAM PTY — GitHub SSH (Sam platform — GCP iam-tunnel)
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
SSHEOF
  chmod 600 ~/.ssh/config
fi
gh --version | head -1
gh auth status -h github.com 2>&1 | head -3
REMOTE
)"

  rm -f "$token_file"
  echo "OK: GCP gh + git credential helper installed (Sam platform VM only)"
}

verify_remote() {
  [[ "$PROFILE" == "sam" ]] || return 0
  local host="$1"
  local pty_token
  pty_token="$(grep -E '^PTY_AUTH_TOKEN=' "$MAC_PTY_ENV" 2>/dev/null | cut -d= -f2- || true)"
  if [[ -z "$pty_token" && -f "$ENV_FILE" ]]; then
    pty_token="$(grep -E '^PTY_AUTH_TOKEN=' "$ENV_FILE" | cut -d= -f2- || true)"
  fi
  [[ -n "$pty_token" ]] || return 0
  local payload='{"command":"command -v gh && gh --version | head -1 && gh auth status -h github.com 2>&1 | head -2","cwd":"/tmp","timeout_ms":12000}'
  local code
  code="$(curl -sS -m 15 -o /tmp/iam-gh-verify.json -w '%{http_code}' \
    -H "Authorization: Bearer ${pty_token}" \
    -H 'Content-Type: application/json' \
    -d "$payload" \
    "https://${host}/exec" || echo 000)"
  [[ "$code" == "200" ]] || { echo "verify https://${host}/exec → HTTP ${code}" >&2; return 0; }
  python3 - <<'PY' 2>/dev/null || true
import json
try:
    d=json.load(open("/tmp/iam-gh-verify.json"))
    print((d.get("stdout") or "").strip().replace("\n"," | ") or "(empty)")
except Exception:
    pass
PY
  echo "verify https://${host}/exec → HTTP ${code}"
}

echo "=== install-terminal-github-cli (profile=${PROFILE}) ==="
(( DO_MAC )) && configure_gh_auth_local "local"
(( DO_MAC )) && sync_mac_pty_env_hint
(( DO_GCP )) && install_gcp
verify_remote "localpty.inneranimalmedia.com"
verify_remote "terminal.inneranimalmedia.com"
echo "Done."
