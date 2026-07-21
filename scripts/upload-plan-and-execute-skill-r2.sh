#!/usr/bin/env bash
# Upload plan-and-execute SKILL.md → R2 + docs-lane ingest (via upload-iam-skills-autorag.sh).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$REPO_ROOT/scripts/upload-iam-skills-autorag.sh" --only plan-and-execute
