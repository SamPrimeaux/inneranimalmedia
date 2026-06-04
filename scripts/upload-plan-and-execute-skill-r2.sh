#!/usr/bin/env bash
# Upload plan-and-execute SKILL.md → inneranimalmedia-autorag/skills/
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"
BUCKET="${AUTORAG_SKILLS_BUCKET:-inneranimalmedia-autorag}"
KEY="skills/plan-and-execute/SKILL.md"
SOURCE="$REPO_ROOT/skills/plan-and-execute/SKILL.md"

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
echo "  D1:  skill_plan_and_execute (apply migrations/538_plan_and_execute_skill.sql)"
