#!/usr/bin/env bash
# Clone objects from production R2 bucket agent-sam into agent-sam-sandbox-cicd.
#
# Wrangler cannot list objects or copy bucket-to-bucket; use S3-compatible API (AWS CLI v2).
#
# Prereqs:
#   - aws CLI v2 installed (`aws --version`)
#   - R2 API token (Dashboard: R2 > Manage R2 API Tokens) with permission to READ agent-sam
#     and WRITE agent-sam-sandbox-cicd (or broader admin read/write on both).
#   - NOT the same credential as CLOUDFLARE_API_TOKEN (that is the HTTP API token).
#
# Env (required for sync):
#   R2_ACCESS_KEY_ID
#   R2_SECRET_ACCESS_KEY
#   CLOUDFLARE_ACCOUNT_ID  (from .env.cloudflare via with-cloudflare-env.sh, or export manually)
#
# Optional:
#   SYNC_PREFIX=static/dashboard/   # only copy keys with this prefix (no leading slash on bucket root)
#   DRY_RUN=1                       # pass --dryrun to aws s3 sync
#   DELETE=1                        # --delete on dest (makes sandbox mirror source; destructive on dest)
#
# Examples:
#   ./scripts/with-cloudflare-env.sh ./scripts/r2-clone-agent-sam-to-sandbox.sh
#   SYNC_PREFIX=static/dashboard/ DRY_RUN=1 ./scripts/with-cloudflare-env.sh ./scripts/r2-clone-agent-sam-to-sandbox.sh
#
# rclone alternative (same keys):
#   rclone copy r2src:agent-sam r2dst:agent-sam-sandbox-cicd --progress
#   # Configure both remotes with endpoint https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com
#
set -euo pipefail

SRC_BUCKET="agent-sam"
DST_BUCKET="${DST_BUCKET:-agent-sam-sandbox-cicd}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install AWS CLI v2, or use rclone with R2 S3 API." >&2
  exit 1
fi

if [[ -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" ]]; then
  echo "Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (R2 API token from Cloudflare dashboard)." >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Set CLOUDFLARE_ACCOUNT_ID (e.g. load via ./scripts/with-cloudflare-env.sh)." >&2
  exit 1
fi

ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
# R2 ignores region but aws cli requires a value
export AWS_DEFAULT_REGION="auto"

DRY=( )
if [[ -n "${DRY_RUN:-}" ]]; then
  DRY=( --dryrun )
fi

DEL=( )
if [[ -n "${DELETE:-}" ]]; then
  DEL=( --delete )
fi

# Optional prefix: sync only s3://src/prefix -> s3://dst/prefix
if [[ -n "${SYNC_PREFIX:-}" ]]; then
  P="${SYNC_PREFIX}"
  # normalize: ensure trailing slash for "directory" sync semantics
  [[ "$P" == */ ]] || P="${P}/"
  SRC_URI="s3://${SRC_BUCKET}/${P}"
  DST_URI="s3://${DST_BUCKET}/${P}"
  echo "Sync prefix: ${P}"
else
  SRC_URI="s3://${SRC_BUCKET}/"
  DST_URI="s3://${DST_BUCKET}/"
  echo "Full bucket sync (this can take a long time and many objects)."
fi

echo "Endpoint: ${ENDPOINT}"
echo "Source:   ${SRC_URI}"
echo "Dest:     ${DST_URI}"
echo ""

exec aws s3 sync "${SRC_URI}" "${DST_URI}" \
  --endpoint-url "${ENDPOINT}" \
  "${DRY[@]}" \
  "${DEL[@]}"
