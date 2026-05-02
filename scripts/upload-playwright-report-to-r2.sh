#!/usr/bin/env bash
# Upload Playwright test report (and optionally results) to R2 (inneranimalmedia bucket).
# Run after: npx playwright test (or npm test)
# Usage: ./scripts/upload-playwright-report-to-r2.sh [report-dir]
# Default report dir: playwright-report (or env PLAYWRIGHT_REPORT_DIR)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
cd "$REPO_ROOT"
REPORT_DIR="${1:-${PLAYWRIGHT_REPORT_DIR:-playwright-report}}"
DATE="$(date +%Y-%m-%d)"
TIME="$(date +%H%M)"
# R2 prefix: tests/reports/YYYY-MM-DD/HHMM/ so reports are namespaced by run
PREFIX="tests/reports/${DATE}/${TIME}"

if [ ! -d "$REPORT_DIR" ]; then
  echo "No report dir at $REPORT_DIR. Run 'npx playwright test' first (or 'npx playwright test --reporter=html')."
  exit 1
fi

echo "Uploading $REPORT_DIR to R2 inneranimalmedia at $PREFIX/ ..."
# Upload index.html and assets (relative paths in report)
for f in "$REPORT_DIR"/*; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  if [ -d "$f" ]; then
    for sub in "$f"/*; do
      [ -e "$sub" ] || continue
      subname="$(basename "$sub")"
      content_type="application/octet-stream"
      [[ "$subname" == *.html ]] && content_type="text/html"
      [[ "$subname" == *.css ]] && content_type="text/css"
      [[ "$subname" == *.js ]] && content_type="application/javascript"
      wrangler r2 object put "inneranimalmedia/${PREFIX}/${name}/${subname}" \
        --file "$sub" \
        --content-type "$content_type" \
        --config "$CONFIG" \
        --remote
    done
  else
    content_type="application/octet-stream"
    [[ "$name" == *.html ]] && content_type="text/html"
    [[ "$name" == *.css ]] && content_type="text/css"
    [[ "$name" == *.js ]] && content_type="application/javascript"
    wrangler r2 object put "inneranimalmedia/${PREFIX}/${name}" \
      --file "$f" \
      --content-type "$content_type" \
      --config "$CONFIG" \
      --remote
  fi
done

echo "Done. Report uploaded to R2 inneranimalmedia at prefix: $PREFIX/"
echo "To view: use worker route for static/dashboard/ or a dedicated reports URL if configured."
