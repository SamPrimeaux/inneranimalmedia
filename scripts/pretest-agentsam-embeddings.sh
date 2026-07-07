#!/usr/bin/env bash
# Pretest agentsam schema embeddings — 3 rows per table, OpenAI 1536-dim.
# Run from repo root on iMac with Ollama NOT required.
#
#   cd /Users/samprimeaux/inneranimalmedia
#   ./scripts/pretest-agentsam-embeddings.sh
#
# Full backfill after pretest passes:
#   ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py --table agentsam_projects
#   ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py --table agentsam_memory

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f "$REPO_ROOT/.env.cloudflare" ]]; then
  echo "Missing .env.cloudflare — need SUPABASE_DB_URL and OPENAI_API_KEY" >&2
  exit 1
fi

echo "════════════════════════════════════════════════════════"
echo "  agentsam embedding pretest (OpenAI text-embedding-3-large @ 1536)"
echo "  OpenAI 1536 lane (not Ollama / not legacy public.* backfill)"
echo "════════════════════════════════════════════════════════"

run_table() {
  local table="$1"
  echo ""
  echo "── pretest: agentsam.${table} (3 rows) ──"
  ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py \
    --table "$table" \
    --pretest
}

run_table agentsam_projects
run_table agentsam_memory

echo ""
echo "✅ Pretest complete. If cosine smoke looked good, run full backfill:"
echo "   ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py --table agentsam_projects"
echo "   ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py --table agentsam_memory"
