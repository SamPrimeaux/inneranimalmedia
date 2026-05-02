#!/usr/bin/env bash
# Verify Cloudflare API token for local CLI (deploy, d1, r2).
# Run from repo root: ./scripts/verify-cloudflare-cli.sh
# Uses .env.cloudflare (or ~/.zshrc) via with-cloudflare-env.sh — does NOT use Worker secrets.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Checking CLOUDFLARE_API_TOKEN from .env.cloudflare or ~/.zshrc..."
if ! ./scripts/with-cloudflare-env.sh sh -c 'test -n "$CLOUDFLARE_API_TOKEN"'; then
  echo "CLOUDFLARE_API_TOKEN is not set."
  echo "  Create .env.cloudflare from .env.cloudflare.example and set CLOUDFLARE_API_TOKEN to your API token."
  echo "  Get token: Cloudflare Dashboard -> My Profile -> API Tokens (not Worker secrets)."
  exit 1
fi

# Show token length so you can confirm it matches your real token (no secret printed)
./scripts/with-cloudflare-env.sh sh -c 'echo "Token length: ${#CLOUDFLARE_API_TOKEN} (expected: 40 for Cloudflare API tokens)"'
echo "Verifying token with Cloudflare API..."
RESPONSE="$(./scripts/with-cloudflare-env.sh sh -c 'curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify')"
if ! echo "$RESPONSE" | grep -qE '"status"[[:space:]]*:[[:space:]]*"active"'; then
  echo "Token verify failed. Response:"
  echo "$RESPONSE" | head -5
  echo ""
  echo "Update CLOUDFLARE_API_TOKEN in .env.cloudflare with a valid token from My Profile -> API Tokens."
  echo "To test manually (from repo root): ./scripts/with-cloudflare-env.sh sh -c 'curl -sS -H \"Authorization: Bearer \$CLOUDFLARE_API_TOKEN\" https://api.cloudflare.com/client/v4/user/tokens/verify'"
  exit 1
fi
echo "Token valid."
echo "Running: wrangler whoami"
./scripts/with-cloudflare-env.sh npx wrangler whoami
echo "Done. CLI token is valid for this repo when you use: ./scripts/with-cloudflare-env.sh npx wrangler ..."
