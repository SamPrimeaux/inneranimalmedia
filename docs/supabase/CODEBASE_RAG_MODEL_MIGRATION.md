# Codebase RAG — embedding model migration playbook

**Gate:** Do **not** start Step 2 until `token_count` backfill is complete:

```bash
curl -s -X POST https://inneranimalmedia.com/api/internal/embed-codebase-chunks-backfill \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}' | jq '.remaining_null_token_count'
# → must be 0
```

**Current state (2026-05-21):**

- **Fresh baseline:** run `node scripts/fresh-codebase-rag-reindex.mjs --apply` after wiping stale snapshots (38× duplicate chunks). Cancels pointless `token_count` backfill on rows about to be deleted.
- Index ignore globs: `src/lib/codebase-index-ignore.js` + `src/queue/codebase-index-sync.js` (skips `migrations/**`, `scripts/sql/**`, `scripts/*.sql`, `supabase/migrations/**`, build artifacts).
- Allowlist only: `src/**/*.js`, `dashboard/components/**/*.tsx`, `dashboard/features/**/*.tsx`, `dashboard/src/**/*.ts`, `dashboard/pages/**` (see `src/lib/codebase-index-ignore.js`).
- `OPENAI_API_KEY` + `RAG_OPENAI_EMBEDDING_MODEL=text-embedding-3-large` for new chunks; Worker backfill defaults to same model label.

---

## Step 2 — Switch to `text-embedding-3-large` (after token_count = 0)

**Rule:** Do not mix embedding models in `public.codebase_chunks`. Vector space changes completely.

### 2.1 `embed-on-ingest` (Supabase Edge Function)

- Replace CF Workers AI (`@cf/baai/bge-large-en-v1.5`) with **OpenAI Embeddings API**.
- Secret: `OPENAI_API_KEY` (already in Edge Function secrets).
- Model: `text-embedding-3-large` with **1024 dimensions** (must match `vector(1024)` on table + RPC).
- On write: set `embed_model = 'text-embedding-3-large'`, `embedding`, `updated_at`.

### 2.2 Worker backfill — `src/api/embed-codebase-chunks-backfill.js`

- Embed via OpenAI (or call updated edge function that uses OpenAI).
- PATCH `embed_model = 'text-embedding-3-large'` on every touched row.
- Change `CODEBASE_CHUNK_EMBED_MODEL` constant / fallback to `text-embedding-3-large`.

### 2.3 `match_codebase_chunks()` RPC

- Query embedding must use **same model** as stored rows (`text-embedding-3-large` @ 1024).
- Update any Worker paths that call this RPC (`unified-search`, agent RAG, etc.) to embed queries with OpenAI, not Workers AI.

### 2.4 Full re-embed

After switch is deployed:

```sql
-- Audit before re-embed
SELECT embed_model, COUNT(*) FROM public.codebase_chunks GROUP BY embed_model;
```

Re-embed **all** rows where `embed_model IS DISTINCT FROM 'text-embedding-3-large'` (~8,249 rows initially).

- Loop: `POST /api/internal/embed-codebase-chunks-backfill` with updated code, or batch script.
- **Never** mix old `@cf/baai/bge-large-en-v1.5` vectors with new OpenAI vectors in search.

### 2.5 Secrets checklist

- [ ] `OPENAI_API_KEY` in Supabase Edge Function secrets (done)
- [ ] Worker `OPENAI_API_KEY` / `RAG_OPENAI_EMBEDDING_MODEL=text-embedding-3-large` aligned in `wrangler.production.toml` + secrets

---

## Step 3 — Embedding cost analytics (after Step 2 stable)

Add `GET /api/analytics/rag/embedding-costs` (e.g. `src/api/analytics/rag-costs.js` or extend `databases.js`):

```sql
SELECT
  embed_model,
  workspace_id,
  COUNT(*)::int AS chunk_count,
  SUM(token_count)::bigint AS total_tokens,
  SUM(token_count)::float / 1000.0 * <rate_per_1k> AS estimated_cost_usd
FROM public.codebase_chunks
GROUP BY embed_model, workspace_id;
```

| `embed_model` | Rate (per 1K tokens) |
|---------------|----------------------|
| `@cf/baai/bge-large-en-v1.5` | $0.00 (Workers AI included) |
| `text-embedding-3-large` | $0.00013 |

- Query via **Hyperdrive** (service role path in Worker).
- Expose in **Analytics → RAG** tab (`dashboard`).

Wire route in `src/core/production-dispatch.js` + register in analytics data sources if needed.

---

## References

- Webhooks: `docs/supabase/DATABASE_WEBHOOKS_SETUP.md`
- Backfill route: `POST /api/internal/embed-codebase-chunks-backfill`
- Table: `public.codebase_chunks` (18 columns; see webhooks doc schema table)
