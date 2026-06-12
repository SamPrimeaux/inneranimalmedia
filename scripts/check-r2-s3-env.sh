#!/usr/bin/env zsh
# Preflight: local .env.cloudflare R2 S3 creds + production Worker secrets for S3 fallback.
# Usage: ./scripts/check-r2-s3-env.sh
# Exit 0 when local + Worker are configured; exit 1 with actionable errors otherwise.

emulate -R zsh
# Do not use set -e — wrangler/API flakes must surface via FAIL, not silent exit.
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
wrangler_secret_list() {
  local attempt max_attempts=3
  local wr_err wr_out wr_exit
  wr_err="$(mktemp)"
  for attempt in 1 2 3; do
    wr_out="$("$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$WRANGLER_CONFIG" 2>"$wr_err")"
    wr_exit=$?
    if (( wr_exit == 0 )) && [[ -n "${wr_out//[[:space:]]/}" ]]; then
      rm -f "$wr_err"
      print -r -- "$wr_out"
      return 0
    fi
    if (( attempt < max_attempts )); then
      warn "wrangler secret list attempt $attempt/$max_attempts failed (exit $wr_exit) — retrying…"
      sleep 2
    fi
  done
  err "wrangler secret list failed after $max_attempts attempts (exit $wr_exit): $(tr '\n' ' ' < "$wr_err")"
  err "  Retry: ./scripts/with-cloudflare-env.sh npx wrangler secret list -c wrangler.production.toml"
  rm -f "$wr_err"
  return 1
}

if [[ ! -f "$WRANGLER_CONFIG" ]]; then
  err "Missing $WRANGLER_CONFIG"
else
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    warn "CLOUDFLARE_API_TOKEN unset — skipping Worker secret list (set in .env.cloudflare or ~/.zshrc)"
  else
    wr_out="$(wrangler_secret_list)" || wr_out=""
    if [[ -n "${wr_out//[[:space:]]/}" ]]; then
      for k in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
        if print -r -- "$wr_out" | grep -qE "\"name\"[[:space:]]*:[[:space:]]*\"${k}\""; then
          ok "Worker secret: $k"
        else
          err "Worker secret missing on inneranimalmedia: $k — run: ./scripts/with-cloudflare-env.sh npx wrangler secret put $k -c wrangler.production.toml"
        fi
      done
    fi
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
  print -u2 "Local creds live in .env.cloudflare (gitignored) — not .env.cloudflare.example."
  print -u2 "If secrets exist on the Worker, this is usually a transient wrangler API flake."
  print -u2 "  ./scripts/with-cloudflare-env.sh npx wrangler secret list -c wrangler.production.toml"
  print -u2 "Deploy anyway (R2 sync uses local .env.cloudflare): SKIP_R2_WORKER_SECRET_CHECK=1 npm run deploy:full"
  exit 1
fi

print ""
print "R2 S3 env OK (local + Worker secrets for unbound-bucket fallback)."
