#!/usr/bin/env bash
# Upload iam-playwright-quality-report SKILL.md → inneranimalmedia-autorag/skills/
# D1 agentsam_skill row points here (retrieval_strategy=r2); do NOT paste full MD into D1.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"
BUCKET="${AUTORAG_SKILLS_BUCKET:-inneranimalmedia-autorag}"
KEY="skills/iam-playwright-quality-report/SKILL.md"
SOURCE="$REPO_ROOT/skills/iam-playwright-quality-report/SKILL.md"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing skill file: $SOURCE" >&2
  exit 1
fi

echo "PUT r2://${BUCKET}/${KEY}"
"$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler r2 object put "${BUCKET}/${KEY}" \
  --file "$SOURCE" \
  --content-type "text/markdown; charset=utf-8" \
  --config "$CONFIG" \
  --remote

echo "Done."
echo "  R2:  r2://${BUCKET}/${KEY}"
echo "  D1:  skill_iam_playwright_quality_report (registry; retrieval_strategy=r2)"
echo "  Apply migration 500 if the D1 row is not present yet."
