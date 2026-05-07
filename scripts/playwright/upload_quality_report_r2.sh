#!/usr/bin/env bash
set -u

BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
WORKSPACE="${IAM_WORKSPACE_SLUG:-inneranimalmedia}"
ROOT="captures/$WORKSPACE"
FAIL_LOG="$ROOT/upload-failures.log"

: > "$FAIL_LOG"

echo "Uploading $ROOT to R2 bucket: $BUCKET"

find "$ROOT" -type f \
  ! -name ".DS_Store" \
  ! -path "*/node_modules/*" \
  ! -path "*/.cache/*" \
  | while read -r file; do
    key="$file"
    echo "→ $key"

    if ! npx wrangler r2 object put "$BUCKET/$key" --file "$file" --remote; then
      echo "$file" >> "$FAIL_LOG"
      echo "  failed: $file"
    fi
  done

echo ""
echo "Done. Failures:"
cat "$FAIL_LOG"
