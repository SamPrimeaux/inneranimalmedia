#!/usr/bin/env bash
# Record a CI/DI workflow run in D1 (ci_di_workflow_runs).
# Usage: ./scripts/record-workflow-run.sh <workflow_name> <status> <trigger_type> [details_text]
# Example: ./scripts/record-workflow-run.sh autorag_sync success post-merge "Uploaded 9 knowledge files"
# Requires: migration 140 applied. Loads .env.cloudflare via with-cloudflare-env.sh.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WORKFLOW_NAME="${1:-}"
STATUS="${2:-success}"
TRIGGER_TYPE="${3:-manual}"
DETAILS="${4:-}"

if [[ -z "$WORKFLOW_NAME" ]]; then
  echo "Usage: $0 <workflow_name> <status> <trigger_type> [details_text]" >&2
  exit 1
fi

ID="wr-$(date +%s)-$(openssl rand -hex 4 2>/dev/null || echo "local")"
# Escape single quotes for SQL: ' -> ''
DETAILS_ESC="${DETAILS//\'/\'\'}"
WORKFLOW_ESC="${WORKFLOW_NAME//\'/\'\'}"
TRIGGER_ESC="${TRIGGER_TYPE//\'/\'\'}"

echo "Recording workflow run in D1: workflow_name=$WORKFLOW_NAME status=$STATUS trigger_type=$TRIGGER_TYPE"
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command \
  "INSERT INTO ci_di_workflow_runs (id, workflow_name, trigger_type, status, completed_at, details_text, created_at) VALUES ('$ID', '$WORKFLOW_ESC', '$TRIGGER_ESC', '$STATUS', datetime('now'), '$DETAILS_ESC', datetime('now'))" 2>/dev/null || true
