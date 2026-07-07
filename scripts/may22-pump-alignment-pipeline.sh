#!/usr/bin/env bash
# May 22 alignment pump: D1 migration 371 → Supabase plan mirror → D1 memory → embeddings backfill
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
export IAM_D1_DB="${IAM_D1_DB:-inneranimalmedia-business}"
export IAM_WRANGLER_CONFIG="${IAM_WRANGLER_CONFIG:-wrangler.production.toml}"

echo "━━ May 22 alignment pipeline ━━"
echo "repo: $REPO_ROOT"

if [[ -f "$REPO_ROOT/.env.cloudflare" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi

echo "→ D1 migrations 371 + 372 (sprint rotation + plan_tasks fixup)"
for f in ./migrations/371_may22_sprint_rotation_alignment.sql ./migrations/372_may22_plan_tasks_fixup.sql; do
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$IAM_D1_DB" \
    --remote -c "$IAM_WRANGLER_CONFIG" \
    --file="$f"
done

echo "→ Mirror D1 plans → Supabase public.agentsam_plans / plan_tasks"
./scripts/with-cloudflare-env.sh node scripts/mirror-d1-plans-to-supabase-public.mjs

echo "→ Sync D1 agentsam_memory → Supabase agent_memory (dedupe sync_key)"
./scripts/with-cloudflare-env.sh node scripts/sync-d1-memory-to-agent-memory.mjs --limit 100

if [[ -n "${SUPABASE_WEBHOOK_SECRET:-}" ]]; then
  echo "→ Supabase Edge backfill-embeddings (agent_memory, documents, …)"
  RUN_SUPABASE_EMBEDDINGS_BACKFILL=1 bash scripts/supabase-embeddings-backfill.sh || true
else
  echo "[skip] SUPABASE_WEBHOOK_SECRET unset — Edge embedding backfill skipped"
fi

if command -v curl >/dev/null 2>&1 && [[ -n "${INTERNAL_API_SECRET:-}" ]]; then
  echo "[skip] public.codebase_* backfill retired — use: node scripts/agentsam_codebase_reindex.mjs"
fi

if curl -sfS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "→ Local Ollama: batch_embed_all.py (D1 + Supabase → Vectorize)"
  ./scripts/with-cloudflare-env.sh python3 scripts/batch_embed_all.py --all --push || true
else
  echo "[skip] Ollama not reachable at :11434 — run batch_embed_all.py locally when available"
fi

echo "[note] agentsam.agentsam_projects / agentsam_memory: use scripts/embed_agentsam_schema.py (OpenAI 1536, not Ollama)"

echo "━━ Pipeline complete ━━"
echo "Active plan: plan_may22_2026_agent_sam"
echo "Archived plan: plan_may14_2026_repair (status=abandoned)"
