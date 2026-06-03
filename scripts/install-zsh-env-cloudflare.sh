#!/usr/bin/env zsh
# Install repo-root .env.cloudflare + .mcp_exports.sh into ~/.zshrc (idempotent).
# Fixes stale MCP_AUTH_TOKEN in zshrc that breaks MCP OAuth clients and smoke scripts.
#
# Run from repo root:
#   ./scripts/install-zsh-env-cloudflare.sh
#   ./scripts/install-zsh-env-cloudflare.sh --dry-run

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZSHRC="${ZSHRC:-$HOME/.zshrc}"
MARK_BEGIN='# >>> IAM local env (inneranimalmedia) — managed by scripts/install-zsh-env-cloudflare.sh >>>'
MARK_END='# <<< IAM local env (inneranimalmedia) <<<'
DRY_RUN=0

for arg in "$@"; do
  [[ "$arg" == --dry-run ]] && DRY_RUN=1
done

run() {
  if (( DRY_RUN )); then
    print -r -- "[dry-run] $*"
  else
    "$@"
  fi
}

if [[ ! -f "$REPO_ROOT/.env.cloudflare" ]]; then
  print -u2 "Missing $REPO_ROOT/.env.cloudflare"
  print -u2 "Run: source ~/.zshrc && ./scripts/sync-cloudflare-env-from-zshrc.sh"
  print -u2 "Or copy .env.cloudflare.example and fill values."
  exit 1
fi

# Sync platform MCP bearer from rotation exports into .env.cloudflare (if rotated).
if [[ -f "$REPO_ROOT/.mcp_exports.sh" ]]; then
  local_token=""
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.mcp_exports.sh"
  local_token="${MCP_AUTH_TOKEN:-}"
  if [[ -n "$local_token" ]]; then
    if grep -q '^MCP_AUTH_TOKEN=' "$REPO_ROOT/.env.cloudflare" 2>/dev/null; then
      run sed -i '' "s|^MCP_AUTH_TOKEN=.*|MCP_AUTH_TOKEN=${(q)local_token}|" "$REPO_ROOT/.env.cloudflare"
    elif grep -q '^export MCP_AUTH_TOKEN=' "$REPO_ROOT/.env.cloudflare" 2>/dev/null; then
      run sed -i '' "s|^export MCP_AUTH_TOKEN=.*|export MCP_AUTH_TOKEN=${(q)local_token}|" "$REPO_ROOT/.env.cloudflare"
    else
      run print -r -- "MCP_AUTH_TOKEN=${(q)local_token}" >>"$REPO_ROOT/.env.cloudflare"
    fi
    print -r -- "Synced MCP_AUTH_TOKEN from .mcp_exports.sh → .env.cloudflare"
  fi
fi

if [[ ! -f "$ZSHRC" ]]; then
  run touch "$ZSHRC"
fi

# Comment stale hex MCP bearer in zshrc (pre-rotation format); keep line for audit.
if grep -q '^export MCP_AUTH_TOKEN="[0-9a-f]\{64\}"' "$ZSHRC" 2>/dev/null; then
  run sed -i '' 's/^export MCP_AUTH_TOKEN="[0-9a-f]\{64\}"/# DISABLED stale MCP_AUTH_TOKEN — use IAM_REPO .mcp_exports.sh\n# &/' "$ZSHRC"
  print -r -- "Commented stale export MCP_AUTH_TOKEN in $ZSHRC"
fi

# Fix known corrupted alias line (missing newline before export).
if grep -q 'command"export CLOUDFLARE_ACCOUNT_ID' "$ZSHRC" 2>/dev/null; then
  run sed -i '' 's/command"export CLOUDFLARE_ACCOUNT_ID/command"\nexport CLOUDFLARE_ACCOUNT_ID/' "$ZSHRC"
  print -r -- "Fixed broken d1 alias line in $ZSHRC"
fi

if grep -Fq "$MARK_BEGIN" "$ZSHRC" 2>/dev/null; then
  print -r -- "IAM env block already present in $ZSHRC"
else
  run tee -a "$ZSHRC" >/dev/null <<EOF

$MARK_BEGIN
export IAM_REPO="$REPO_ROOT"
if [[ -f "\$IAM_REPO/scripts/lib/load-iam-local-env.sh" ]]; then
  source "\$IAM_REPO/scripts/lib/load-iam-local-env.sh"
fi
$MARK_END
EOF
  print -r -- "Appended IAM env block to $ZSHRC"
fi

print -r -- ""
print -r -- "Next:"
print -r -- "  source ~/.zshrc"
print -r -- "  cd $REPO_ROOT && node scripts/mcp-smoke.mjs"
print -r -- "  Remote GCP PTY env: ./scripts/sync-vm-env-cloudflare.sh  (or ./scripts/install-terminal-tunnel-env.sh for PTY + VM)"
print -r -- "  Cursor OAuth MCP: open https://mcp.inneranimalmedia.com/auth/connect (re-consent if tools are empty)"
