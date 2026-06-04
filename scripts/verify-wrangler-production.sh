#!/usr/bin/env bash
# Compare wrangler.production.toml bindings to the documented production dashboard snapshot.
# Does not print secret values. Exit 0 when TOML contains all required binding names.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOML="${REPO_ROOT}/wrangler.production.toml"

echo "wrangler $(cd "$REPO_ROOT" && npm exec wrangler -- --version 2>/dev/null | tr -d '\r')"

required_bindings=(
  AGENTSAM_VECTORIZE_CODE
  AGENTSAM_VECTORIZE_COURSES
  AGENTSAM_VECTORIZE_DOCUMENTS
  AGENTSAM_VECTORIZE_MEMORY
  AGENTSAM_VECTORIZE_SCHEMA
  AGENT_SESSION
  BROWSER_SESSION
  AI
  ASSETS
  AUTORAG_BUCKET
  CHESS_SESSION
  DASHBOARD
  DB
  DOCS_BUCKET
  EMAIL
  HYPERDRIVE
  IAM_COLLAB
  KV
  LOADER
  MYBROWSER
  MY_QUEUE
  PTY_SERVICE
  SESSION_CACHE
  WAE
)

removed_bindings=(
  VECTORIZE
  AGENTSAMVECTORIZE
  R2
  TOOLS
)

echo "=== wrangler.production.toml binding verify ==="
echo "File: $TOML"
echo ""

missing=0
for b in "${required_bindings[@]}"; do
  if ! grep -qE "binding = \"${b}\"|name = \"${b}\"" "$TOML" 2>/dev/null; then
    echo "✗ missing required binding: $b"
    missing=$((missing + 1))
  fi
done

stale=0
for b in "${removed_bindings[@]}"; do
  if grep -qE "binding = \"${b}\"" "$TOML" 2>/dev/null; then
    echo "⚠ stale binding still in toml (dropped from prod dashboard): $b"
    stale=$((stale + 1))
  fi
done

echo ""
echo "Plaintext [vars] in toml:"
grep -E '^[A-Z_]+ =' "$TOML" | sed 's/ =.*//' | sort | sed 's/^/  /'

echo ""
if [[ "$missing" -gt 0 ]]; then
  echo "✗ $missing required binding(s) missing from toml"
  exit 1
fi
if [[ "$stale" -gt 0 ]]; then
  echo "⚠ $stale removed binding(s) still present — align with docs/platform/worker-env-production-2026-06.md"
  exit 1
fi

echo "✓ All required production bindings present in wrangler.production.toml"
echo "✓ Removed bindings (VECTORIZE, AGENTSAMVECTORIZE, R2, TOOLS) absent from toml"
echo ""
echo "Secrets (names only):"
"${REPO_ROOT}/scripts/with-cloudflare-env.sh" npm exec wrangler secret list -c "$TOML" 2>/dev/null | grep '"name"' | sed 's/.*"name": "\([^"]*\)".*/  \1/' | sort
echo ""
"${REPO_ROOT}/scripts/ensure-token-signing-key.sh" --check 2>/dev/null || true
echo ""
echo "Dashboard cross-check: docs/platform/worker-env-production-2026-06.md"
