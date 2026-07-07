# Course storage vs AutoRAG / Vectorize lanes

**Question:** Where do Learn courses live, and what belongs in vector search?

---

## Three layers (do not mix them)

```txt
1. Authoring + delivery     →  repo learn/{slug}/  +  R2 learn/{slug}/  +  D1 course_*
2. Interactive Learn UI       →  /dashboard/learn reads D1 + fetches markdown from R2 URLs
3. AgentSam semantic search   →  optional ingest into DOCUMENTS lane (Vectorize + Supabase)
```

Courses are **not** stored only in Vectorize. Vectorize is a **search mirror** for Agent Sam chat/RAG — not the Learn product database.

---

## Where courses live (canonical)

| What | Where | Purpose |
|------|--------|---------|
| **Source of truth (git)** | `learn/{course-slug}/` in repo | Versioned authoring, PR review, sync script input |
| **Public lesson files** | R2 bucket `inneranimalmedia`, prefix `learn/{course-slug}/` | Markdown, manifests, rubrics, starter files — loaded by URL |
| **Public URL** | `https://assets.inneranimalmedia.com/learn/{course-slug}/...` | `lesson_assets.asset_url` / dashboard markdown fetch |
| **Structured metadata** | D1 `courses`, `course_modules`, `course_lessons`, `lesson_assets` | Slugs, order, progress, submissions, grades |
| **User progress** | D1 `lesson_progress`, `course_submissions`, `course_grades` | Per-user state |

**Sync command:**

```bash
./scripts/with-cloudflare-env.sh python3 scripts/sync_learn_course_to_r2.py {course-slug}
```

**D1 seed:** `migrations/###_*` or `learn/{slug}/sql/` — introspect columns first (`LEARNING_OS_RECONCILIATION.md`).

**Current courses:**

```txt
learn/software-engineering-builder-os/
learn/agentsam-cad-engineering/
learn/connor-platform-operator/   (README only in some envs)
```

---

## What belongs in AutoRAG / Vectorize (and what does not)

### Put in Vectorize DOCUMENTS lane (optional ingest for Agent Sam)

Use when Agent Sam should **answer questions about** course content in chat — not when rendering `/dashboard/learn`.

| Content | Lane | `source_type` | Notes |
|---------|------|---------------|-------|
| Lesson markdown (chunked) | DOCUMENTS | `course`, `lesson`, `markdown` | Set `course_id`, `lesson_id`, `source_path` = R2 key |
| Course overview / AGENTSAM compass | DOCUMENTS | `course` or `product_doc` | Chunk by H2 |
| Platform truth docs (TRUTH, PIPELINE) | DOCUMENTS | `product_doc`, `architecture_note` | Same lane as courses for `docs_knowledge_search` |
| Skills playbooks | DOCUMENTS | `knowledge` | e.g. `meshy_3d_designstudio` |

**Storage path for ingest scripts:**

- Supabase: `agentsam.agentsam_documents_oai3large_1536`
- Cloudflare Vectorize binding: `AGENTSAM_VECTORIZE_COURSES` (RAG lane name: `docs`)
- Receipt: D1 `vectorize_sync_log`

Ingest is **separate** from R2 sync. Typical flow:

```txt
learn/{slug}/lessons/*.md  →  R2 (delivery)
                          →  chunk + embed (retrieval only)
```

See: `docs/supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md`, `docs/dashboard-agent-audit/26-vector-lanes-reference.md`

### Do NOT put in Vectorize (use other stores)

| Content | Store instead | Why |
|---------|---------------|-----|
| Lesson HTML rendering | R2 + D1 URLs | Learn UI fetches full markdown files |
| Progress / grades | D1 only | User-scoped relational data |
| Starter/solution binaries | R2 `learn/{slug}/assets/` | Download artifacts, not semantic chunks |
| CAD GLB exports | R2 `cad/exports/` + `cms_assets` | 3D assets, not text RAG |
| Project covers (Sam Sketch) | `projects.metadata_json` + Cloudflare Images | Dynamic per project |
| Full repo codebase | CODE lane | `agentsam_codebase_chunks_oai3large_1536` |
| Agent session memory | MEMORY lane | `agentsam_memory_oai3large_1536` |
| DB schema awareness | SCHEMA lane | Migrations / `d1_schema` introspect |

### R2 bucket `inneranimalmedia-autorag` (object storage — not a vector lane)

**Binding:** `AUTORAG_BUCKET` in `wrangler.production.toml` — this is **R2**, not embedding dimensions.

Use for:

- Agent plans / compaction artifacts (`src/core/r2-context-store.js`)
- Skill mirrors under `skills/` (upload via `skills:*:upload-r2`)
- Milestone markdown copies (`knowledge/milestones/…`)

**Not** the Learn delivery bucket (that is **`inneranimalmedia`**, prefix **`learn/`**).

### Retired vs current Agent Sam vector lanes

| Era | What | Status |
|-----|------|--------|
| **Legacy** | `VECTORIZE` → `ai-search-inneranimalmedia-autorag` @ **1024** (Workers AI `@cf/baai/bge-m3`), Managed AI Search `[[ai_search]]` | **Removed from production bindings** (2026-06-02). Do not ingest new chat RAG here. |
| **Production** | Six `AGENTSAM_VECTORIZE_*` indexes @ **1536** (`text-embedding-3-large`) + paired Supabase `agentsam_*_oai3large_1536` tables | Active — `src/core/rag-lanes.js`, `AGENTSAM_EMBEDDING_DIMENSIONS=1536` |
| **Deep archive** | Supabase `agentsam_deep_archive_oai3large_**3072**` | pgvector only — **no** Cloudflare Vectorize mirror |

Course chunk ingest (when you want Agent Sam to tutor from lessons) targets the **`docs`** lane → `AGENTSAM_VECTORIZE_COURSES` + `agentsam_documents_oai3large_1536`, not the autorag R2 bucket name.

---

## Rule of thumb

| Need | Use |
|------|-----|
| Human reads lesson in Learn UI | R2 `learn/` + D1 metadata |
| Track completion / submit lab | D1 progress tables |
| Agent Sam answers "how does BOSL2 work in IAM?" | Ingest lesson chunks → DOCUMENTS lane |
| Agent Sam runs a lab with real terminal | Learn UI + tools — not vector search alone |

**Delivery first (R2 + D1). Vectorize second (when you want chat retrieval).**

---

## Related docs

- `learn/README.md` — R2 folder contract
- `docs/LEARN_PLATFORM_ARCHITECTURE.md` — `/api/learn/*`
- `docs/learn/LEARNING_OS_RECONCILIATION.md` — D1 column safety
- `docs/autorag/AUTORAG_KNOWLEDGE_RETRIEVAL_RUNTIME_CONTRACT.md` — ingest contract
- `docs/platform/embedding-pipeline-2026-06.md` — end-to-end embed flow
