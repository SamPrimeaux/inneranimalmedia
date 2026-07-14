# Codebase RAG — live runtime index (not dashboard-only)

## What must be indexed
`dashboard/` alone is wrong for Agent Sam backend understanding. Live runtime SSOT:

| Root | Role |
|------|------|
| `src/core/` | Core agent logic |
| `src/api/` | Route handlers |
| `src/tools/` | Tool implementations |
| `src/cron/` | Cron (incl. daily-memory-pipeline) |
| `src/integrations/` | GitHub, Gmail, etc. |
| `src/do/` | Durable Objects |
| `src/queue/` | Queue consumers |
| `src/index.js` | Worker entry |
| `services/moviemode-service/` | MovieMode worker |
| `services/iam-workflows/src/` | Workflow service (Python; vendored `python_modules/` excluded) |
| `containers/iam-cad-worker/` | CAD container |
| `containers/iam-sandbox/` | Sandbox container |
| `containers/moviemode-render/` | Render container |
| `scripts/agentsam_codebase_reindex.mjs` | Reindex script itself |

Encoded in `scripts/lib/runtime-code-index-manifest.mjs`. Prune is **off** for `--runtime` so existing `dashboard/` chunks stay until you intentionally replace them.

## Batch 1 (small validate) — already shipped
```bash
npm run run:reindex_src_worker_batch1:dry-run
npm run run:reindex_src_worker_batch1
```

## Full runtime (long) — count first, then embed
```bash
# Print eligible file counts by root (~900 files on current tree)
npm run run:reindex_runtime:dry-run

# Overnight / long terminal — full live embed (delete-chunks-then-insert per file)
npm run run:reindex_runtime
```

## Progressive prefixes (recommended after Batch 1)
```bash
npm run run:reindex_runtime:dry-run -- --runtime-prefix=src/tools
./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --runtime --runtime-prefix=src/cron
./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --runtime --runtime-prefix=src/api
# largest:
./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --runtime --runtime-prefix=src/core
```

Suggested order after Batch 1: `src/do` → `src/queue` → `src/tools` → `src/cron` → `src/integrations` → `src/api` → `src/core` → `services/moviemode-service` → `services/iam-workflows` → `containers/` → explicit scripts.

## Schema RAG (unchanged)
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/dedupe_database_schema_rag.sql
./scripts/with-cloudflare-env.sh python3 scripts/ingest_schema_rag.py
```
