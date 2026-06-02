#!/usr/bin/env bash
# Assemble branded quality report for R2 upload under inneranimalmedia/reports/quality-report/…
# Expects captures/<workspace>/results.json from Playwright json reporter.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${IAM_WORKSPACE_SLUG:-inneranimalmedia}"
CAPTURES="$REPO_ROOT/captures/$WORKSPACE"
STAGING="$REPO_ROOT/reports/.staging/$WORKSPACE"
STAGE="${QUALITY_REPORT_STAGE_DIR:-$REPO_ROOT/quality-report}"
RUN_ENV="$REPO_ROOT/reports/.staging/quality-report-run.env"

export REPORT_DATE="${REPORT_DATE:-$(date +%Y-%m-%d)}"
export REPORT_TIME="${REPORT_TIME:-$(date +%H%M%S)}"
export QUALITY_REPORT_R2_PREFIX="reports/quality-report/${REPORT_DATE}/${REPORT_TIME}"
export R2_BUCKET="${R2_BUCKET:-inneranimalmedia}"

mkdir -p "$(dirname "$RUN_ENV")"
cat > "$RUN_ENV" <<ENV
REPORT_DATE=$REPORT_DATE
REPORT_TIME=$REPORT_TIME
QUALITY_REPORT_R2_PREFIX=$QUALITY_REPORT_R2_PREFIX
R2_BUCKET=$R2_BUCKET
ENV

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

resolve_screenshot() {
  local slug="$1"
  if [ -f "$STAGING/screenshots/${slug}.png" ]; then
    echo "$STAGING/screenshots/${slug}.png"
  elif [ -f "$CAPTURES/screenshots/${slug}.png" ]; then
    echo "$CAPTURES/screenshots/${slug}.png"
  fi
}

copy_artifacts() {
  for base in "$STAGING" "$CAPTURES"; do
    [ -d "$base/evidence" ] || continue
    for f in "$base/evidence"/*.json; do
      [ -f "$f" ] || continue
      slug="$(basename "$f" .json)"
      case "$slug" in work|contact) cp "$f" "$STAGE/evidence/" ;; esac
    done
  done
  for slug in work contact; do
    shot="$(resolve_screenshot "$slug" || true)"
    [ -n "$shot" ] && [ -f "$shot" ] && cp "$shot" "$STAGE/screenshots/${slug}.png"
  done
}

copy_artifacts

if [ -f "$CAPTURES/results.json" ]; then
  cp "$CAPTURES/results.json" "$STAGE/results.json"
fi

mkdir -p "$STAGE/diagnostics/traces"
if [ -f "$CAPTURES/report/diagnostics-index.html" ]; then
  cp "$CAPTURES/report/diagnostics-index.html" "$STAGE/diagnostics/index.html"
else
  cp "$REPO_ROOT/reports/template/diagnostics.html" "$STAGE/diagnostics/index.html"
fi
if [ -d "$CAPTURES/results" ]; then
  find "$CAPTURES/results" -name '*.zip' -type f 2>/dev/null | while read -r z; do
  cp "$z" "$STAGE/diagnostics/traces/" 2>/dev/null || true
  done
fi

export QUALITY_REPORT_STAGE_DIR="$STAGE"
python3 "$REPO_ROOT/scripts/rewrite-quality-evidence-paths.py"

echo "Staged branded quality report at: $STAGE"
echo "  R2 run prefix: $QUALITY_REPORT_R2_PREFIX"
echo "  Entry: $STAGE/index.html"
echo "  Run env: $RUN_ENV"
