#!/usr/bin/env zsh
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$REPO_ROOT/scripts/deploy-frontend.sh"
