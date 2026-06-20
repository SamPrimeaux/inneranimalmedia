#!/usr/bin/env bash
# Insert one row into deployments so each deploy shows in Overview / deployment tracking.
# Run after: npm run deploy (or: wrangler deploy --config wrangler.production.toml).
# Loads .env.cloudflare if present so CLOUDFLARE_API_TOKEN is set for --remote. Run from repo root.
# Expects DEPLOY_SECONDS from environment (set by deploy-with-record.sh); uses 0 if unset.
#
# Set CLOUDFLARE_VERSION_ID (or WRANGLER_VERSION_ID) to the Wrangler "Current Version ID" when available
# so deployments.id matches the worker revision. If unset, a UUID is used.
#
# Agent documentation: When an agent runs the deploy, set TRIGGERED_BY=agent and optionally
# DEPLOYMENT_NOTES='brief description' so deployments.triggered_by / notes reflect the agent.
# Example: TRIGGERED_BY=agent DEPLOYMENT_NOTES='AI Gateway + R2 upload' npm run deploy
#
# Timestamp: uses deploy machine local wall clock (date), not D1 UTC datetime('now').
# Override: DEPLOY_TIMESTAMP='2026-03-24 21:36:00'
#
# DORA/spend attribution: TENANT_ID, WORKSPACE_ID, PROJECT_ID default to the IAM platform
# scope below. Override per-project (e.g. fuelnfreetime's own deploy pipeline) by exporting
# these before calling this script -- do not rely on the defaults outside this repo.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="$REPO_ROOT/wrangler.production.toml"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

VERSION_ID="${CLOUDFLARE_VERSION_ID:-${WRANGLER_VERSION_ID:-}}"
if [[ -z "$VERSION_ID" ]]; then
  VERSION_ID="$(uuidgen 2>/dev/null || echo "post-$(date +%s)")"
fi

DEPLOY_SECONDS="${DEPLOY_SECONDS:-0}"
if [[ ! "$DEPLOY_SECONDS" =~ ^[0-9]+$ ]]; then DEPLOY_SECONDS=0; fi

TRIGGERED_BY="${TRIGGERED_BY:-cli_post_deploy}"
DEPLOYMENT_NOTES="${DEPLOYMENT_NOTES:-}"
DEPLOY_VERSION="${DEPLOY_VERSION:-}"
GIT_HASH="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '')"
VERSION_SLUG="${DEPLOY_VERSION:-${GIT_HASH:-deploy-$(date +%s)}}"
DEPLOYED_BY="${DEPLOYED_BY:-sam_primeaux}"
DESCRIPTION="${DEPLOY_DESCRIPTION:-${DEPLOYMENT_NOTES:-Worker deploy (inneranimalmedia)}}"

# DORA/spend attribution scope -- defaults are this repo's own platform identity.
TENANT_ID="${TENANT_ID:-tenant_sam_primeaux}"
WORKSPACE_ID="${WORKSPACE_ID:-ws_inneranimalmedia}"
PROJECT_ID="${PROJECT_ID:-inneranimalmedia}"

# Escape single quotes for SQL: ' -> ''
VID_ESC="${VERSION_ID//\'/\'\'}"
VS_ESC="${VERSION_SLUG//\'/\'\'}"
GH_ESC="${GIT_HASH//\'/\'\'}"
DESC_ESC="${DESCRIPTION//\'/\'\'}"
DBY_ESC="${DEPLOYED_BY//\'/\'\'}"
TB_ESC="${TRIGGERED_BY//\'/\'\'}"
DN_ESC="${DEPLOYMENT_NOTES//\'/\'\'}"
TID_ESC="${TENANT_ID//\'/\'\'}"
WID_ESC="${WORKSPACE_ID//\'/\'\'}"
PID_ESC="${PROJECT_ID//\'/\'\'}"

DEPLOY_TIMESTAMP="${DEPLOY_TIMESTAMP:-$(date '+%Y-%m-%d %H:%M:%S')}"
TS_ESC="${DEPLOY_TIMESTAMP//\'/\'\'}"

# project_id is nullable -- emit SQL NULL rather than an empty string when unset.
if [[ -z "$PROJECT_ID" ]]; then
  PID_SQL="NULL"
else
  PID_SQL="'$PID_ESC'"
fi

echo "Recording deploy in D1 (deployments.id=$VERSION_ID, timestamp=$DEPLOY_TIMESTAMP local, deploy_time_seconds=$DEPLOY_SECONDS, triggered_by=$TRIGGERED_BY, tenant_id=$TENANT_ID, workspace_id=$WORKSPACE_ID, project_id=${PROJECT_ID:-<null>})"
npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "INSERT INTO deployments (id, timestamp, version, git_hash, description, status, deployed_by, environment, deploy_time_seconds, worker_name, triggered_by, notes, tenant_id, workspace_id, project_id) VALUES ('$VID_ESC', '$TS_ESC', '$VS_ESC', '$GH_ESC', '$DESC_ESC', 'success', '$DBY_ESC', 'production', $DEPLOY_SECONDS, 'inneranimalmedia', '$TB_ESC', '$DN_ESC', '$TID_ESC', '$WID_ESC', $PID_SQL)"
echo "Done. Overview / deployment tracking will show this deploy."
