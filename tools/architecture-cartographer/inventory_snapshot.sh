#!/usr/bin/env bash
# Pass-zero repo inventory: tracked file path + size + last-touch date.
# Uses two git calls (ls-tree + log), not per-file subprocesses.
#
# Usage:
#   chmod +x tools/architecture-cartographer/inventory_snapshot.sh
#   ./tools/architecture-cartographer/inventory_snapshot.sh /Users/samprimeaux/inneranimalmedia > inventory.json
#
# Requires: git, jq, awk

set -euo pipefail

REPO="${1:-.}"
REPO="$(cd "$REPO" && pwd)"

if ! git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: $REPO" >&2
  exit 1
fi

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# path\tsize_bytes
git -C "$REPO" ls-tree -r -l HEAD \
  | awk '{
      # format: <mode> blob <sha> <size>\t<path>
      size=$4
      sub(/^[^\t]+\t/, "", $0)
      path=$0
      if (size ~ /^[0-9]+$/ && path != "") print path "\t" size
    }' > "$TMP_DIR/sizes.tsv"

# path\tepoch — first (newest) touch wins
git -C "$REPO" log --name-only --pretty=format:'COMMIT %ct' --diff-filter=ACDMR \
  | awk '
      /^COMMIT / { epoch=$2; next }
      NF && !seen[$0]++ { print $0 "\t" epoch }
    ' > "$TMP_DIR/touches.tsv"

# Join sizes with touches; missing touch → 0
awk -F'\t' '
  FNR==NR { touch[$1]=$2; next }
  {
    path=$1; size=$2;
    epoch=(path in touch) ? touch[path] : 0
    printf "%s\t%s\t%s\n", path, size, epoch
  }
' "$TMP_DIR/touches.tsv" "$TMP_DIR/sizes.tsv" \
  | jq -R -s -c '
      split("\n")
      | map(select(length>0)
          | split("\t")
          | {
              path: .[0],
              size_bytes: (.[1]|tonumber),
              last_touched_epoch: (.[2]|tonumber),
              last_touched: (
                if (.[2]|tonumber) > 0
                then (.[2]|tonumber|todate)
                else null
                end
              )
            })
      | sort_by(-.size_bytes)
    '
