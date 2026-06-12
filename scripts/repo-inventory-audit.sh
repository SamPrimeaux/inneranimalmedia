#!/usr/bin/env zsh
# Inventory inneranimalmedia (and optional sibling repos) for cleanup planning.
#
# Usage (repo root):
#   ./scripts/repo-inventory-audit.sh                    # summary to stdout
#   ./scripts/repo-inventory-audit.sh --write            # write .scratch/repo-inventory-YYYY-MM-DD/
#   ./scripts/repo-inventory-audit.sh --write --repos    # include ~/iam-pty, ~/inneranimalmedia-mcp-server
#   ./scripts/repo-inventory-audit.sh --stale-only       # only likely-clutter candidates
#
# Does not delete anything.

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WRITE=0
STALE_ONLY=0
INCLUDE_REPOS=0
OUT_DIR=""

for arg in "$@"; do
  case "$arg" in
    --write) WRITE=1 ;;
    --stale-only) STALE_ONLY=1 ;;
    --repos) INCLUDE_REPOS=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

if (( WRITE )); then
  OUT_DIR="${REPO_ROOT}/.scratch/repo-inventory-$(date +%Y-%m-%d)"
  mkdir -p "$OUT_DIR"
  echo "Writing reports to ${OUT_DIR}"
fi

emit() {
  print -r -- "$1"
  if [[ -n "$OUT_DIR" && -n "${2:-}" ]]; then
    print -r -- "$1" >> "$OUT_DIR/$2"
  fi
}

section() {
  emit "" 
  emit "══════════════════════════════════════════════════════════════"
  emit "  $1"
  emit "══════════════════════════════════════════════════════════════"
}

inventory_repo() {
  local root="$1"
  local label="$2"
  local stale_file="${label//\//_}-stale-candidates.txt"
  local tree_file="${label//\//_}-by-topdir.txt"
  local ext_file="${label//\//_}-by-extension.txt"

  [[ -d "$root" ]] || { emit "SKIP: $root not found"; return 0 }

  section "$label ($root)"

  emit "Git: $(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo 'not a git repo')"
  emit "Tracked files: $(git -C "$root" ls-files 2>/dev/null | wc -l | tr -d ' ')"
  emit "Untracked (excl .git): $(git -C "$root" status -u --porcelain 2>/dev/null | rg '^\?\?' | wc -l | tr -d ' ')"

  if (( ! STALE_ONLY )); then
    emit ""
    emit "── Top-level directories (file count) ──"
    find "$root" -maxdepth 1 -mindepth 1 ! -name .git -print0 2>/dev/null \
      | while IFS= read -r -d '' d; do
          local n
          n=$(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ')
          emit "$(printf '%6s  %s' "$n" "${d:t}")"
        done \
      | sort -rn \
      | head -25 \
      | while read -r line; do emit "$line"; [[ -n "$OUT_DIR" ]] && emit "$line" "$tree_file"; done
  fi

  emit ""
  emit "── Stale / clutter candidates ──"
  {
    # backup / save patterns
    find "$root" -type f \( \
      -name '*.bak' -o -name '*.bak.*' -o -name '*.save' -o -name '*~' -o \
      -name '.DS_Store' -o -name 'Thumbs.db' \
    \) 2>/dev/null
    # empty files (tracked or not)
    find "$root" -type f -empty ! -path '*/.git/*' 2>/dev/null
    # large node_modules outside expected roots
    find "$root" -type d -name node_modules ! -path '*/.git/*' 2>/dev/null \
      | while read -r nm; do echo "$nm"; done
    # legacy dashboard duplicates (from old audit)
    for legacy in agent-dashboard overview-dashboard time-tracking-dashboard mcp-server server; do
      [[ -d "$root/$legacy" ]] && echo "$root/$legacy/  [legacy app dir — verify before delete]"
    done
    # root placeholders
    find "$root" -maxdepth 1 -type f -size 0 2>/dev/null
    # worker.js at root if src/index.js exists
    [[ -f "$root/worker.js" && -f "$root/src/index.js" ]] && echo "$root/worker.js  [superseded by src/index.js?]"
    # scratch not gitignored content
    [[ -d "$root/.scratch" ]] && find "$root/.scratch" -type f 2>/dev/null | head -200
  } | sort -u | while read -r line; do
      [[ -z "$line" ]] && continue
      emit "  $line"
      [[ -n "$OUT_DIR" ]] && emit "  $line" "$stale_file"
    done

  if (( ! STALE_ONLY )); then
    emit ""
    emit "── Extensions (tracked files, top 20) ──"
    git -C "$root" ls-files 2>/dev/null \
      | sed 's/.*\.//' \
      | sort | uniq -c | sort -rn | head -20 \
      | while read -r line; do emit "  $line"; [[ -n "$OUT_DIR" ]] && emit "  $line" "$ext_file"; done
  fi

  emit ""
  emit "── Large tracked files (>500KB) ──"
  git -C "$root" ls-files -z 2>/dev/null \
    | while IFS= read -r -d '' f; do
        [[ -f "$root/$f" ]] || continue
        local sz
        sz=$(stat -f%z "$root/$f" 2>/dev/null || stat -c%s "$root/$f" 2>/dev/null || echo 0)
        (( sz > 512000 )) && echo "$sz  $f"
      done \
    | sort -rn | head -15 \
    | while read -r line; do emit "  $line"; done
}

section "INNER ANIMAL MEDIA REPO INVENTORY"
emit "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
emit "Host: $(hostname)"

inventory_repo "$REPO_ROOT" "inneranimalmedia"

if (( INCLUDE_REPOS )); then
  inventory_repo "${IAM_PTY_DIR:-$HOME/iam-pty}" "iam-pty"
  inventory_repo "${MCP_DIR:-$HOME/inneranimalmedia-mcp-server}" "inneranimalmedia-mcp-server"
  inventory_repo "$REPO_ROOT/services/moviemode-service" "moviemode-service"
fi

section "SUGGESTED CLEANUP WORKFLOW"
emit "  1. Run with --write --repos to save reports under .scratch/repo-inventory-*/"
emit "  2. Review stale-candidates.txt — never delete without git grep / deploy check"
emit "  3. Archive then delete: git rm legacy dirs only after confirming zero imports"
emit "  4. R2 clutter: npm run r2:inventory:inneranimalmedia"
emit "  5. D1 orphans: query agentsam_* / deployments via /api/d1 or MCP d1_query"

if [[ -n "$OUT_DIR" ]]; then
  emit ""
  emit "Reports written to: $OUT_DIR"
  ls -la "$OUT_DIR"
fi
