#!/usr/bin/env bash
# Side-index MCP server into AST Graph RAG (nodes/symbols/chunk links).
# Run on Mac with .env.cloudflare — does NOT need remote PTY.
#
# Usage (from inneranimalmedia repo root):
#   bash scripts/ast_rag_index_mcp_side.sh
#   bash scripts/ast_rag_index_mcp_side.sh --symbols-only   # skip Phase 1 if nodes already exist
#   bash scripts/ast_rag_index_mcp_side.sh --dry-run
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MCP_REPO="${MCP_REPO:-$ROOT/../inneranimalmedia-mcp-server}"
DRY=()
SYMBOLS_ONLY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=(--dry-run) ;;
    --symbols-only) SYMBOLS_ONLY=1 ;;
  esac
done

if [[ ! -d "$MCP_REPO" ]]; then
  echo "MCP repo missing: $MCP_REPO" >&2
  exit 1
fi

REPO_KEY="SamPrimeaux/inneranimalmedia-mcp-server"
echo "== AST side-index MCP: $MCP_REPO ($REPO_KEY) =="

if [[ "$SYMBOLS_ONLY" -eq 0 ]]; then
  echo "-- Phase 1 walk/edges/upsert (mcp filter) --"
  if [[ ${#DRY[@]} -gt 0 ]]; then
    python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk all --repo-filter "$REPO_KEY" --mcp-repo "$MCP_REPO"
  else
    python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk all --commit --resume --repo-filter "$REPO_KEY" --mcp-repo "$MCP_REPO"
  fi
fi

echo "-- Phase 2 symbols embed + chunk link (mcp repo) --"
if [[ ${#DRY[@]} -gt 0 ]]; then
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 2 --repo "$REPO_KEY"
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 3 --repo "$REPO_KEY"
else
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 2 --commit --repo "$REPO_KEY"
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 3 --commit --resume --repo "$REPO_KEY" || \
    python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 3 --commit --repo "$REPO_KEY"
fi

echo "-- Smoke --"
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 4 --query "execute MCP terminal tool sanitize cwd" --top-k 8 --repo "$REPO_KEY" || true
echo "Done. Prefer agentsam_codebase_retrieve with repo filter when querying MCP-only."
