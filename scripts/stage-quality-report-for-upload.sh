#!/usr/bin/env bash
# Assemble Inner Animal Media branded quality report for R2 upload.
# Expects captures/<workspace>/results.json from a Playwright json reporter run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${IAM_WORKSPACE_SLUG:-inneranimalmedia}"
CAPTURES="$REPO_ROOT/captures/$WORKSPACE"
STAGE="${QUALITY_REPORT_STAGE_DIR:-$REPO_ROOT/quality-report}"

cd "$REPO_ROOT"

if [ ! -f "$CAPTURES/results.json" ]; then
  echo "Missing $CAPTURES/results.json — run Playwright with a json reporter first."
  exit 1
fi

python3 "$REPO_ROOT/reports/template/render.py"

if [ ! -f "$CAPTURES/report/index.html" ]; then
  echo "Branded report not generated at $CAPTURES/report/index.html"
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE/evidence" "$STAGE/screenshots"

cp "$CAPTURES/report/index.html" "$STAGE/index.html"

copy_artifacts() {
  local scope="${QUALITY_REPORT_SCOPE:-all}"
  if [ "$scope" = "work" ]; then
    [ -f "$CAPTURES/evidence/work.json" ] && cp "$CAPTURES/evidence/work.json" "$STAGE/evidence/"
    [ -f "$CAPTURES/screenshots/work.png" ] && cp "$CAPTURES/screenshots/work.png" "$STAGE/screenshots/"
    return
  fi
  if [ -d "$CAPTURES/evidence" ]; then
    cp -r "$CAPTURES/evidence/." "$STAGE/evidence/"
  fi
  if [ -d "$CAPTURES/screenshots" ]; then
    cp -r "$CAPTURES/screenshots/." "$STAGE/screenshots/"
  fi
}

copy_artifacts

if [ -f "$CAPTURES/results.json" ]; then
  cp "$CAPTURES/results.json" "$STAGE/results.json"
fi

# Optional raw runner output (Playwright HTML) — kept under diagnostics/, not the public entry.
if [ -d "$CAPTURES/raw-playwright-report" ]; then
  mkdir -p "$STAGE/diagnostics"
  cp -r "$CAPTURES/raw-playwright-report/." "$STAGE/diagnostics/"
fi

echo "Staged branded quality report at: $STAGE"
echo "  Entry: $STAGE/index.html"
