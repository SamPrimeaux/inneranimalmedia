#!/usr/bin/env bash
# Upload repo skills/*/SKILL.md → inneranimalmedia-autorag/skills/
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"
BUCKET="${AUTORAG_SKILLS_BUCKET:-inneranimalmedia-autorag}"
SKILLS_ROOT="${REPO_ROOT}/skills"

if [[ ! -d "$SKILLS_ROOT" ]]; then
  echo "Missing skills directory: $SKILLS_ROOT" >&2
  exit 1
fi

count=0
while IFS= read -r -d '' file; do
  rel="${file#"${SKILLS_ROOT}/"}"
  key="skills/${rel}"
  echo "PUT r2://${BUCKET}/${key}"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "text/markdown; charset=utf-8" \
    --config "$CONFIG" \
    --remote
  count=$((count + 1))
done < <(find "$SKILLS_ROOT" -type f -name 'SKILL.md' ! -name '.DS_Store' -print0)

echo "✓ Uploaded ${count} SKILL.md file(s) to r2://${BUCKET}/skills/"
