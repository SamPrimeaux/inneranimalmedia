# Codebase / schema RAG — batch 1 (validate before full src reindex)

## Problem
Main-branch codebase index is almost entirely `dashboard/` (~3.7k chunks). Worker `src/` is missing. Schema RAG is ~39d stale with duplicates.

## Batch 1 (you run in terminal — embedding is slow)

### A. Deploy notes (already patched in repo)
`deploy:fast` + `post-deploy-record` now use `git log -1 --pretty=%s` for notes/description.

### B. Small src reindex (delete-before-insert)

Dry-run (zero writes):
```bash
cd /Users/samprimeaux/inneranimalmedia
npm run run:reindex_src_worker_batch1:dry-run
# or: ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --src-batch1 --dry-run --verbose
```

Live write (~10 files: production-dispatch, catalog-tool-executor, agent-tool-loop, …):
```bash
npm run run:reindex_src_worker_batch1
```

Validate in Supabase:
```sql
SELECT file_path, count(*) AS chunks, max(created_at) AS last_chunk
FROM agentsam.agentsam_codebase_chunks_oai3large_1536
WHERE workspace_id = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac'
  AND file_path LIKE 'src/%'
GROUP BY 1
ORDER BY 1;
```

Expect the Batch1 paths with fresh `created_at` and non-zero chunks. Re-run the same command — chunk counts should stay stable (delete-then-insert), not double.

### C. Schema dedupe then refresh
```bash
# 1) dedupe duplicates (keeps newest)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/dedupe_database_schema_rag.sql

# 2) full schema re-ingest (long)
./scripts/with-cloudflare-env.sh python3 scripts/ingest_schema_rag.py
```

### Later (full Worker src — not Batch 1)
Extend path list or add `--src-glob='src/**/*.js'` once Batch 1 proves clean; then optionally prune orphan `dashboard/`-only main chunks separately.
