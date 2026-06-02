#!/usr/bin/env bash
# Upload generated quality report assets to R2.
# Target bucket/path:
#   inneranimalmedia/reports/quality-report/YYYY-MM-DD/HHMMSS/
#
# Note:
# - The local default report directory may still be named "playwright-report"
#   because that is the default generated folder from the test runner.
# - The stored R2 label/path intentionally uses "quality-report", not "playwright".

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"

cd "$REPO_ROOT"

BUCKET="${R2_BUCKET:-inneranimalmedia}"
REPORT_DIR="${1:-${QUALITY_REPORT_DIR:-${PLAYWRIGHT_REPORT_DIR:-playwright-report}}}"

DATE="$(date +%Y-%m-%d)"
TIME="$(date +%H%M%S)"
REPORT_ID="${QUALITY_REPORT_ID:-quality-report-${DATE}-${TIME}}"
ORIGIN="${IAM_ORIGIN:-https://inneranimalmedia.com}"
PUBLIC_PATH="/qualityreport/${DATE}/${TIME}/"
PUBLIC_URL="${PUBLIC_URL:-${ORIGIN}${PUBLIC_PATH}}"

# Requested R2 location:
# bucket: inneranimalmedia
# prefix/folder: reports/quality-report/...
PREFIX="reports/quality-report/${DATE}/${TIME}"

if [ ! -d "$REPORT_DIR" ]; then
  echo "No quality report directory found at: $REPORT_DIR"
  echo "Run the test command first so the HTML report is generated."
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  echo "Missing Wrangler config: $CONFIG"
  echo "Set WRANGLER_CONFIG=/path/to/wrangler.toml if needed."
  exit 1
fi

content_type_for() {
  local file="$1"

  case "$file" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.css) echo "text/css; charset=utf-8" ;;
    *.js) echo "application/javascript; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.txt) echo "text/plain; charset=utf-8" ;;
    *.svg) echo "image/svg+xml" ;;
    *.png) echo "image/png" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.webp) echo "image/webp" ;;
    *.gif) echo "image/gif" ;;
    *.ico) echo "image/x-icon" ;;
    *.webm) echo "video/webm" ;;
    *.mp4) echo "video/mp4" ;;
    *.zip) echo "application/zip" ;;
    *) echo "application/octet-stream" ;;
  esac
}

echo "Uploading quality report..."
echo "  Local dir: $REPORT_DIR"
echo "  Bucket:    $BUCKET"
echo "  Prefix:    $PREFIX/"
echo "  Config:    $CONFIG"
echo ""

uploaded=0

while IFS= read -r -d '' file; do
  rel="${file#"$REPORT_DIR"/}"
  key="${PREFIX}/${rel}"
  ct="$(content_type_for "$file")"

  echo "PUT r2://${BUCKET}/${key}"

  wrangler r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "$ct" \
    --config "$CONFIG" \
    --remote

  uploaded=$((uploaded + 1))
done < <(find "$REPORT_DIR" -type f -print0)

if [ "$uploaded" -eq 0 ]; then
  echo "No files found in quality report directory: $REPORT_DIR"
  exit 1
fi

# Upload a small manifest so the dashboard/API has an obvious report entry to index later.
MANIFEST_FILE="$(mktemp)"
cat > "$MANIFEST_FILE" <<MANIFEST
{
  "label": "quality-report",
  "report_id": "$REPORT_ID",
  "bucket": "$BUCKET",
  "prefix": "$PREFIX/",
  "public_path": "$PUBLIC_PATH",
  "public_url": "$PUBLIC_URL",
  "source_dir": "$REPORT_DIR",
  "uploaded_files": $uploaded,
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
MANIFEST

wrangler r2 object put "${BUCKET}/${PREFIX}/manifest.json" \
  --file "$MANIFEST_FILE" \
  --content-type "application/json; charset=utf-8" \
  --config "$CONFIG" \
  --remote

rm -f "$MANIFEST_FILE"

export REPORT_DATE="$DATE" REPORT_TIME="$TIME" R2_PREFIX="$PREFIX" UPLOADED_FILES="$uploaded"
if [[ -x "$REPO_ROOT/scripts/register-quality-report-d1.mjs" ]] || [[ -f "$REPO_ROOT/scripts/register-quality-report-d1.mjs" ]]; then
  node "$REPO_ROOT/scripts/register-quality-report-d1.mjs" || echo "Warning: D1 register failed (migration 500 applied? deploy route?)" >&2
fi

echo ""
echo "Done."
echo "Uploaded $uploaded files."
echo "R2 location: r2://${BUCKET}/${PREFIX}/"
echo "Public URL:  $PUBLIC_URL"
echo "Dashboard folder: ${BUCKET}/reports/quality-report/${DATE}/${TIME}/"
