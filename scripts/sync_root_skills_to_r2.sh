#!/usr/bin/env bash
set -euo pipefail

BASE="$HOME/agentsam/root-skills"
BUCKET="autorag"

echo "Syncing root /skills → remote R2"

for skill in "$BASE"/*; do
  [ -d "$skill" ] || continue
  name="$(basename "$skill")"

  if [ -f "$skill/SKILL.md" ]; then
    echo "Uploading /skills/$name/SKILL.md"
    npx wrangler r2 object put "$BUCKET/skills/$name/SKILL.md" \
      --file "$skill/SKILL.md" \
      --remote
  fi
done

echo "Root skills sync complete."
