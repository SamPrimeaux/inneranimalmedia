#!/bin/bash
# sync-github.sh — stage, commit, push to origin main
# Usage: ./scripts/sync-github.sh "optional message"
set -e
cd "$(dirname "$0")/.."
MSG="${1:-deploy $(date '+%Y-%m-%d %H:%M') — auto sync}"
echo "=== Git status ==="
git status --short
git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit — already up to date."
  exit 0
fi
git commit -m "$MSG"
git push origin main
echo ""
echo "Synced → github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard"
echo "Commit: $(git rev-parse --short HEAD) — $MSG"
