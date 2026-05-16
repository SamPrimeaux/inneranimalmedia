#!/usr/bin/env zsh
# Preflight: local .env.cloudflare R2 S3 creds + production Worker secrets for S3 fallback.
# Usage: ./scripts/check-r2-s3-env.sh
# Exit 0 when local + Worker are configured; exit 1 with actionable errors otherwise.

emulate -R zsh
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"
WRANGLER_CONFIG="${REPO_ROOT}/wrangler.production.toml"
FAIL=0

warn() { print -u2 "⚠ $*"; }
err() { print -u2 "✗ $*"; FAIL=1; }
ok() { print "✓ $*"; }

# --- Local (.env.cloudflare) ---
if [[ ! -f "$ENV_FILE" ]]; then
  err "Missing $ENV_FILE — copy from .env.cloudflare.example"
else
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  for k in CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    if [[ -z "${(P)k:-}" ]]; then
      err "Local: $k not set in .env.cloudflare"
    else
      ok "Local: $k set"
    fi
  done
fi

# --- Worker secrets (production) ---
if [[ ! -f "$WRANGLER_CONFIG" ]]; then
  err "Missing $WRANGLER_CONFIG"
else
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    warn "CLOUDFLARE_API_TOKEN unset — skipping Worker secret list (set in .env.cloudflare or ~/.zshrc)"
  else
  SECRET_JSON="$("$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$WRANGLER_CONFIG" 2>/dev/null || true)"
  for k in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    if print -r -- "$SECRET_JSON" | grep -q "\"name\": \"$k\""; then
      ok "Worker secret: $k"
    else
      err "Worker secret missing: $k — run: ./scripts/with-cloudflare-env.sh npx wrangler secret put $k -c wrangler.production.toml"
    fi
  done
  fi
fi

# CLOUDFLARE_ACCOUNT_ID on Worker is a [vars] entry (not a secret)
if grep -q '^CLOUDFLARE_ACCOUNT_ID' "$WRANGLER_CONFIG" 2>/dev/null; then
  ok "Worker var: CLOUDFLARE_ACCOUNT_ID in wrangler.production.toml"
else
  warn "CLOUDFLARE_ACCOUNT_ID not found in wrangler.production.toml [vars] — S3 host may be wrong"
fi

if (( FAIL )); then
  print -u2 ""
  print -u2 "Fix local creds: cp .env.cloudflare.example .env.cloudflare"
  print -u2 "Run Node R2 scripts: ./scripts/with-cloudflare-env.sh node scripts/…"
  exit 1
fi

print ""
print "R2 S3 env OK (local + Worker secrets for unbound-bucket fallback)."
