# AutoRAG bucket structure (Agent Sam)

**Purpose:** Clean R2 bucket for Cloudflare AI Search indexing. High relevance, minimal bloat.

**Bucket name:** `autorag`  
**Script:** `./scripts/populate-autorag-bucket.sh` (from repo root, requires `with-cloudflare-env.sh`)

### Bucket metadata (Cloudflare R2)

| Field | Value |
|-------|--------|
| Created | 2026-03-18 |
| Location | Western North America (WNAM) |
| S3 API (bucket endpoint) | `https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/autorag` |

Use Wrangler (`r2 object put` / `get`) with `./scripts/with-cloudflare-env.sh` for routine uploads; the S3 endpoint is for workers or tools that speak the S3-compatible API (credentials from Cloudflare, not committed here).

---

## Directory layout

```
autorag/
├── code/
│   └── (function indexes, Monaco exports — RAG-friendly)
├── draw/
│   └── (Excalidraw scene JSON — Batch 3 ingest list)
├── pages/
│   └── (saved Monaco pages / HTML fragments — Batch 3 ingest list)
├── knowledge/
│   ├── architecture/
│   │   ├── worker-core.md
│   │   ├── database-schema.md
│   │   ├── r2-storage.md
│   │   └── api-endpoints.md
│   ├── features/
│   │   ├── agent-modes.md
│   │   ├── mcp-tools.md
│   │   ├── monaco-editor.md
│   │   └── visualizer.md
│   ├── workflows/
│   │   ├── deploy-process.md
│   │   ├── r2-upload.md
│   │   └── testing.md
│   └── decisions/
│       ├── why-cloudflare.md
│       ├── single-worker.md
│       └── token-optimization.md
├── plans/
│   ├── templates/
│   │   ├── feature-plan-template.md
│   │   ├── refactor-plan-template.md
│   │   └── architecture-plan-template.md
│   └── executed/
│       ├── token-efficiency-2026-03-18.md
│       ├── phase-2-monaco-2026-03-16.md
│       ├── TOMORROW-2026-03-25-mcp-builtins-finish.md
│       └── cli-npm-publish-mechanics.md
└── context/
    ├── active-priorities.md
    ├── technical-debt.md
    ├── cost-tracking.md
    └── cursor-session-log-recent.md   # rolling tail; full log stays in git docs/cursor-session-log.md
```

---

## File rules

| Rule | Detail |
|------|--------|
| Max size | 15 KB per file (avoid Workers AI / indexing timeouts) |
| Target size | 2-5 KB |
| Format | Markdown only (`.md`) |
| Metadata | YAML frontmatter (`title`, `category`, `updated`, optional `importance`) |
| Content | Headings and short prose; no large code dumps (link to repo paths instead) |

---

## Migration notes (iam-platform to autorag)

- **Copy selectively:** Summarize `knowledge/architecture/worker-structure.md` and schema excerpts from `memory/schema-and-records.md` into small files here; do not mirror multi-megabyte logs.
- **memory/daily:** Prefer last few days, summarized under 3 KB each; archive older content outside this bucket.
- **Session log:** Split major initiatives into `plans/executed/*.md` rather than indexing the full `docs/cursor-session-log.md`.

Optional skill markdown under `docs/knowledge/skills/` can still be uploaded with the legacy `scripts/populate-autorag.sh` if you want those objects under `knowledge/skills/` in R2.

---

## AI Search (dashboard)

1. Cloudflare Dashboard: AI Search.
2. Select the search instance wired to this corpus (see `wrangler.production.toml`: `[[ai_search]]` / `search_name`).
3. Data source: R2 bucket **`autorag`** (not `iam-platform`).
4. Include paths: `knowledge/**/*.md`, `plans/**/*.md`, `context/**/*.md`.
5. Save and run a sync.

**Worker note:** Live RAG in `worker.js` uses Vectorize plus R2 binding `iam-platform` for chunk resolution in some paths. This bucket is the **curated** index for AI Search; keep metadata and paths stable after sync so re-embeddings stay coherent.

---

## Maintenance

| Cadence | Action |
|---------|--------|
| Weekly | New executed plans under `plans/executed/`; refresh `context/active-priorities.md` |
| Monthly | Archive stale dailies; update `context/technical-debt.md` |
| Never | SQL dumps, HTML, binaries, or logs older than agreed retention |
