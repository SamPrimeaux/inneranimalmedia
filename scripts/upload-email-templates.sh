#!/usr/bin/env bash
# Sync version-controlled email HTML → ASSETS bucket (inneranimalmedia/email/…).
#
# Layout (Worker onboarding loads via getEmailR2Bucket / emailTemplateKey):
#   src/email-templates/*.html     → email/templates/{basename}.html
#   docs/onboarding/*.html         → email/guides/{basename}.html
#
# Usage:
#   ./scripts/upload-email-templates.sh
#   ./scripts/upload-email-templates.sh --dry-run
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TOML="wrangler.production.toml"
BUCKET="inneranimalmedia"
DRY_RUN=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

put_object() {
  local key="$1"
  local file="$2"
  local content_type="${3:-text/html; charset=utf-8}"

  if [[ ! -f "$file" ]]; then
    echo "✗ Missing file: $file" >&2
    exit 1
  fi

  if (( DRY_RUN )); then
    echo "[dry-run] $file → ${BUCKET}/${key}"
    return 0
  fi

  echo "→ ${file} → ${BUCKET}/${key}"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="$content_type" \
    --remote \
    -c "$TOML"
}

echo "=== upload-email-templates (R2 ASSETS: ${BUCKET}/email/) ==="

shopt -s nullglob
for f in "${REPO_ROOT}/src/email-templates/"*.html; do
  base="$(basename "$f" .html)"
  put_object "email/templates/${base}.html" "$f"
done

for f in "${REPO_ROOT}/docs/onboarding/"*.html; do
  base="$(basename "$f" .html)"
  put_object "email/guides/${base}.html" "$f"
done
shopt -u nullglob

echo "✓ Email templates synced to R2 (${BUCKET}/email/)"
