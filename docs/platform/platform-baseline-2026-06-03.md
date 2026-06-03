# IAM Platform Baseline — 2026-06-03

Verified from: Cloudflare dashboard secrets dump, D1 live query, binding lists, `wrangler vectorize list`, `src/` grep.  
Do not derive from memory — re-query D1 and CF dashboard to update.

Related: [Agent layer snapshot (P0 + RAG)](./agent-layer-snapshot-p0-rag-2026-06.md) · [Worker env production](./worker-env-production-2026-06.md) · [IAM runtime architecture](./iam-runtime-architecture-2026-06.md)

---

## Immediate flags (binding dump review)

These jumped out during today's baseline audit. Fix or consciously stub before feature work on affected surfaces.

| Flag | Severity | Detail |
|------|----------|--------|
| **companionscpas social OAuth** | P1 — blocking | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET` are **empty plaintext** on the live worker. Social/Meta login is broken. |
| **companionscpas email** | P1 | No `RESEND_API_KEY` secret; `RESEND_FROM_EMAIL` plaintext is set. Outbound email likely fails. |
| **companionscpas logs** | P1 | Observability disabled on an active paying client — enable before any debug session. |
| **companionscpas workspace reconciliation** | P1 | **Canonical live customer:** `tenant_companionscpas` → `ws_companionscpas` (worker D1 `fd6dd6fb` aligns). D1 shows `ws_companionscpas` as **archived** — status wrong; reactivate. Duplicate `ws_cp_companions_cpas_001` under `tenant_sam_primeaux` is a provisioning orphan; do not use for credential resolution. |
| **CF Vectorize all empty** | P0 — unlock | 4 active bound indexes, **0 stored_vectors each**. Runtime Vectorize queries return nothing. Supabase has 1,500+ embedded rows but CF mirror never synced. |
| **Agent chat lane context** | ✅ Shipped | Wired in `agent-controller.js`; KV append workaround; canary log `[agent-chat] semantic_lane_degraded` |
| **Documents Vectorize unbound** | P2 | `agentsam-documents-oai3large-1536` exists in CF (May 25) but neither worker binds it. Add `AGENTSAM_VECTORIZE_DOCUMENTS` or confirm Supabase-only documents is intentional. |
| **Legacy 1024d AI Search** | P2 | `AI_SEARCH_ENDPOINT` → `ai-search-iam-autorag`. Only live caller: `POST /api/search` in `src/api/search.js` (dashboard search UI, not Agent chat spine). Agent paths use 1536d Vectorize/pgvector via `semantic-retrieval-dispatch.js`. |
| **Duplicate Supabase secret** | P2 | Both `SUPABASE_SERVICE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set on main worker. **`src/` grep: zero references to `SUPABASE_SERVICE_KEY`**; all hot paths use `SUPABASE_SERVICE_ROLE_KEY`. Safe to remove `SUPABASE_SERVICE_KEY` from dashboard once confirmed no external scripts depend on it. |

---

## Workers — Production

### `inneranimalmedia` (main worker)

- **Repo:** SamPrimeaux/inneranimalmedia (`main` branch)
- **Deploy:** `npm run deploy:full` (not `npm run deploy` alone) · config: `wrangler.production.toml`
- **Compat date:** 2026-01-20 | `nodejs_compat`
- **Crons:** 9 schedules (every 30m, hourly, 6am, 9am, 1pm, midnight, 1am, weekly Sunday 9am, monthly)
- **Queue:** `74b3155b36334b69852411c083d50322`
- **Tail worker:** `inneranimalmedia-tail`
- **Workspace ID:** `ws_inneranimalmedia`

**Bindings:**

| Binding | Type | Target |
|---|---|---|
| `DB` | D1 | `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) |
| `HYPERDRIVE` | Hyperdrive | `inneranimalmedia-supabase-hyperdrive` (`08183bb9d2914e87ac8395d7e4ecff60`) |
| `ASSETS` | R2 | `inneranimalmedia` |
| `DASHBOARD` | R2 | `inneranimalmedia` (same bucket, two bindings) |
| `AUTORAG_BUCKET` | R2 | `inneranimalmedia-autorag` |
| `DOCS_BUCKET` | R2 | `iam-docs` |
| `EMAIL` | R2 | `inneranimalmedia-email-archive` |
| `KV` | KV | `MCP_TOKENS` (`09438d5e4f664bf78467a15af7743c44`) |
| `SESSION_CACHE` | KV | `production-KV_SESSIONS` (`dc87920b0a9247979a213c09df9a0234`) |
| `AGENT_SESSION` | DO | `inneranimalmedia_AgentChatSqlV1` |
| `BROWSER_SESSION` | DO | `inneranimalmedia_AgentBrowserLiveV1` |
| `IAM_COLLAB` | DO | `inneranimalmedia_IAMCollaborationSession` |
| `CHESS_SESSION` | DO | `inneranimalmedia_ChessRoom` |
| `PTY_SERVICE` | VPC Service | `iam-vpc` (`019db639-7c70-7071-8ef3-32ec0392a9ff`) |
| `MYBROWSER` | Browser Run | — |
| `MY_QUEUE` | Queue | `74b3155b36334b69852411c083d50322` |
| `AI` | Workers AI | Workers AI Catalog |
| `WAE` | Analytics Engine | `inneranimalmedia` |
| `LOADER` | Dynamic Workers | configured in code |
| `AGENTSAM_VECTORIZE_CODE` | Vectorize | `agentsam-codebase-oai3large-1536` |
| `AGENTSAM_VECTORIZE_COURSES` | Vectorize | `agentsam-courses-oai3large-1536` |
| `AGENTSAM_VECTORIZE_MEMORY` | Vectorize | `agentsam-memory-oai3large-1536` |
| `AGENTSAM_VECTORIZE_SCHEMA` | Vectorize | `agentsam-schema-oai3large-1536` |

**Notable secrets (non-sensitive names only):**  
`AGENTSAM_BRIDGE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VAULT_KEY`, `VAULT_MASTER_KEY`, `PTY_AUTH_TOKEN`, `MCP_AUTH_TOKEN`, `TERMINAL_SECRET`, `TERMINAL_WS_URL`, `GITHUB_TOKEN`, `GITHUB_APP_*`, `RESEND_API_KEY`, `TAVILY_API_KEY`, `STRIPE_SECRET_KEY`, `MESHYAI_API_KEY`, `CURSOR_API_KEY`, `CURSOR_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `OIDC_ID_TOKEN_RSA_PRIVATE_KEY`, `TOKEN_SIGNING_KEY`

**Plaintext env:**

- `CLOUDFLARE_ACCOUNT_ID`: `ede6590ac0d2fb7daf155b35653457b2`
- `WORKSPACE_ID`: `ws_inneranimalmedia`
- `AGENTSAM_EMBEDDING_DIMENSIONS`: `1536`
- `AGENTSAM_OPENAI_EMBEDDING_MODEL`: `text-embedding-3-large`
- `OPENAI_API_BASE_URL`: `https://api.openai.com/v1`
- `RAG_AGENT_ID`: `inneranimalmedia`
- `RAG_DOCUMENTS_PROJECT_ID`: `inneranimalmedia`
- `RAG_OPENAI_EMBEDDING_MODEL`: `text-embedding-3-large`
- `RAG_AUTORAG_PUBLIC_BASE`: `https://rag.inneranimalmedia.com`
- `R2_AUTORAG_BUCKET_NAME`: `inneranimalmedia-autorag`
- `SUPABASE_S3_ENDPOINT`: `https://dpmuvynqixblxsilnlut.storage.supabase.co/storage/v1/s3`
- `SUPABASE_S3_REGION`: `us-east-2`
- `AI_SEARCH_ENDPOINT`: `https://2da31515-2005-42e4-9efe-a4e6a425a627.search.ai.cloudflare.com`
- `GOOGLE_CLIENT_ID`: `427617292678-gf3u47lpf876q7miq31hel2ms6tcr2f8.apps.googleusercontent.com`
- `GITHUB_CLIENT_ID`: `Ov23li6BZYxjVtGUWibX`
- `CLOUDFLARE_IMAGES_ACCOUNT_HASH`: `g7wf09fCONpnidkRnR_5vw`
- `DEPLOY_ENV` / `ENVIRONMENT`: `production`
- `MEET_ENGINE`: `realtimekit`

**Gaps / issues:**

- `ASSETS` and `DASHBOARD` both point to `inneranimalmedia` bucket — intentional alias or consolidation candidate
- No `AGENTSAM_VECTORIZE_DOCUMENTS` binding — CF index `agentsam-documents-oai3large-1536` exists but is unbound; `docs` lane Vectorize queries route through `AGENTSAM_VECTORIZE_COURSES` per `src/core/rag-lanes.js`
- `AGENTSAM_WAI` not present — Workers AI binding name differs between workers (`AI` in main, `AGENTSAM_WAI` in companionscpas)
- `SUPABASE_SERVICE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` both present — **`SUPABASE_SERVICE_ROLE_KEY` is the only name used in `src/`**; remove duplicate secret

---

### `inneranimalmedia-mcp-server` (MCP worker)

- **Repo:** SamPrimeaux/inneranimalmedia-mcp-server (`main` branch)
- **Deploy:** `npx wrangler deploy`
- **Compat date:** 2026-01-20 | `nodejs_compat`
- **Workspace ID:** `ws_inneranimalmedia_mcp`

**Bindings:**

| Binding | Type | Target |
|---|---|---|
| `DB` | D1 | `inneranimalmedia-business` (same D1 as main) |
| `HYPERDRIVE` | Hyperdrive | `inneranimalmedia-supabase-hyperdrive` (same) |
| `ASSETS` | R2 | `inneranimalmedia-assets` ← **different bucket than main worker ASSETS** |
| `AUTORAG_BUCKET` | R2 | `inneranimalmedia-autorag` (same) |
| `R2` | R2 | `iam-platform` |
| `MYBROWSER` | Browser Run | — |
| `MY_QUEUE` | Queue | same queue |
| `MCP_TOKENS` | KV | `MCP_TOKENS` (`09438d5e4f664bf78467a15af7743c44`) |
| `OAUTH_KV` | KV | `OAUTH_KV` (`e41df955ea884ffc98730d76079aa50b`) ← **not in main worker** |
| `SESSION_CACHE` | KV | `production-KV_SESSIONS` (same) |
| `AI` | Workers AI | Workers AI Catalog |
| `AGENTSAM_VECTORIZE_CODE` | Vectorize | same |
| `AGENTSAM_VECTORIZE_COURSES` | Vectorize | same |
| `AGENTSAM_VECTORIZE_MEMORY` | Vectorize | same |
| `AGENTSAM_VECTORIZE_SCHEMA` | Vectorize | same |

**Secrets (MCP-specific beyond shared set):**  
`AGENTSAM_BRIDGE_KEY`, `MCP_AUTH_TOKEN`, `TERMINAL_SECRET`

**Gaps / issues:**

- `OAUTH_KV` exists in MCP but not main — OAuth token store is MCP-only. Correct by design per platform law.
- `ASSETS` points to `inneranimalmedia-assets` (separate bucket) vs main worker's `inneranimalmedia` — watch for path confusion when serving static assets
- No `AGENT_SESSION` DO binding — MCP worker can't create AgentChat DOs directly, must proxy to main. Correct.
- No `PTY_SERVICE` VPC binding — terminal only accessible through main worker proxy. Correct.
- `WORKSPACE_ID` plaintext set to `ws_inneranimalmedia_mcp` — correct for MCP OAuth scope

---

### `companionscpas` (client worker — active paying client)

- **URL:** `companionscpas.meauxbility.workers.dev`
- **Repo:** SamPrimeaux/companionscpas (`main`)
- **Compat date:** 2025-04-01 | **no nodejs_compat** ← older, may need update
- **D1:** `companionscpas` (`fd6dd6fb-156b-4b6a-8ff0-505422652391`) — **own separate D1**
- **Cron:** 1 (daily 6am)
- **Logs:** Disabled ← should enable for active client

**Bindings:**

| Binding | Type | Target |
|---|---|---|
| `DB` | D1 | `companionscpas` (own DB, not IAM main) |
| `WEBSITE_ASSETS` | R2 | `companionscpas` |
| `CMS_CACHE` | KV | `companionscpas-cache` |
| `AGENTSAM_WAI` | Workers AI | Workers AI Catalog |

**Secrets:** `AGENTSAM_BRIDGE_KEY`, `OPENAI_API_KEY`, `PASSWORD_RESET_SECRET`, `IAM_TELEMETRY_URL`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

**Plaintext:** `ADMIN_EMAIL: ljmusland@gmail.com`, `APP_NAME: Companions of CPAS`, `APP_DOMAIN: companionscpas.meauxbility.workers.dev`, `ALLOWED_ORIGINS`, `RESEND_FROM_EMAIL: Companions of CPAS <no-reply@companionscpas.org>`

**Issues / next focus (do before feature work):**

1. Fill or remove empty OAuth plaintext: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`
2. Add `RESEND_API_KEY` secret or disable email paths
3. Enable worker logs
4. **Workspace reconciliation:** reactivate `ws_companionscpas` under `tenant_companionscpas` (canonical live customer); archive or delete orphan `ws_cp_companions_cpas_001` under `tenant_sam_primeaux`
5. Bump compat date + add `nodejs_compat` (currently 2025-04-01, 14 months old)

---

### `agentsam-cms-editor`

- **Repo:** SamPrimeaux/agentsam-cms-editor
- **Bindings:** `DB` (IAM main D1), `HYPERDRIVE`, `MYBROWSER`, `SESSION_CACHE`, `ASSETS_BUCKET` → `cms` R2, `ASSETS` (static)
- **Secrets:** `CLOUDFLARE_API_TOKEN`, `GEMINI_API_KEY`, `OPENAI_API_KEY`
- **Plaintext:** `CMS_R2_DEV_PREFIX: cms-editor/`, `CLOUDFLARE_ACCOUNT_ID`
- Shares IAM main D1 — correct, CMS reads/writes IAM tables

### `agentsam-cms-python`

- **Repo:** SamPrimeaux/agentsam-cms-python
- **Bindings:** Same as cms-editor (`cms` R2, IAM D1, HYPERDRIVE, MYBROWSER, SESSION_CACHE)
- **Plaintext:** `CMS_R2_DEV_PREFIX: cms-python/`
- Separate prefix in same `cms` bucket — staging vs editor split

---

## Vectorize Indexes — CF Account (verified 2026-06-03)

Registry (`vectorize_index_registry`) is clean. **4 active CF bindings, all empty.** 5 inactive rows dropped.

### Active bindings — 0 vectors each (confirmed)

| Binding | Index | stored_vectors | Supabase mirror |
|---|---|---:|---|
| `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` | **0** | `agentsam_codebase_chunks_oai3large_1536` (262 rows) |
| `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | **0** | none — CF-only lane |
| `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | **0** | `agentsam_memory_oai3large_1536` (194 rows) |
| `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | **0** | `agentsam_database_schema_oai3large_1536` (593 rows) |

**Current runtime RAG from CF Vectorize = zero results across all lanes.** Supabase has the embeddings; CF edge mirror was never populated (or was wiped). The ingest sync step (Supabase → CF Vectorize upsert) is the unlock — once it runs, `stored_vectors` on these registry rows becomes the truth table for what's live at the edge.

### Inactive / dropped registry rows (`is_active = 0`)

| Binding | Notes |
|---|---|
| `VECTORIZE` | Old binding → `ai-search-inneranimalmedia-autorag` (1024d). Source of historical 290 queries/30d. **Gone from worker — no longer hit.** |
| `AGENTSAMVECTORIZE` | → `inneranimalmedia-vectors` orphan |
| `VECTORIZE_INDEX` | Legacy alias |
| `VECTORIZE_DOCS` | Legacy docs binding |
| `TOOLS` | Unrelated legacy |

No legacy index is still being queried in production. Situation is cleaner than the binding dump suggested.

### Unbound CF indexes (exist, not in active registry)

| Index | Dims | stored_vectors | Notes |
|---|---:|---:|---|
| `agentsam-documents-oai3large-1536` | 1536 | unknown | Created May 25; no worker binding |
| `inneranimalmedia-vectors` | 1536 | unknown | Prototype orphan (May 23) |
| `ai-search-iam-autorag` | 1024 | legacy | `AI_SEARCH_ENDPOINT` env only |
| `ai-search-iam-docs-search` | 1024 | legacy | unbound |
| `ai-search-inneranimalmedia-autorag` | 1024 | legacy | old ingest scripts only |

### Three issues surfaced

**1. `agentsam-documents-oai3large-1536` — created, never wired**

Created May 25 alongside the other custom indexes. Neither worker binds it. Documents lane is currently Supabase-primary (307 embedded rows). Either bind it or delete the orphan index.

Add to `wrangler.production.toml` and MCP `wrangler.jsonc`:

```toml
[[vectorize]]
binding = "AGENTSAM_VECTORIZE_DOCUMENTS"
index_name = "agentsam-documents-oai3large-1536"
```

Then update `src/core/rag-lanes.js` and `semantic-retrieval-dispatch.js` so `docs` lane Vectorize reads/writes use `AGENTSAM_VECTORIZE_DOCUMENTS`, not `AGENTSAM_VECTORIZE_COURSES`. RAG ingest should dual-write Supabase + CF index for documents.

**2. `inneranimalmedia-vectors` — orphan prototype**

Created May 23 (two days before `agentsam-*` indexes). No binding, no Supabase mirror, no registry entry. Likely empty or stale test data from before naming convention standardized. Decommission after confirming empty:

```bash
wrangler vectorize get inneranimalmedia-vectors   # metadata only via CLI
# confirm vector count in dashboard, then:
wrangler vectorize delete inneranimalmedia-vectors
```

**3. Three `ai-search-*` 1024d indexes — legacy AutoRAG**

Created March–April, CF-managed AutoRAG (1024d, pre–1536d migration). Read-only legacy; do not write. Old ingest scripts (`scripts/ingest_rag_knowledge.js`, `scripts/ingest_testing_knowledge.js`) still reference `ai-search-inneranimalmedia-autorag` — not production hot paths.

`AI_SEARCH_ENDPOINT` plaintext points at `ai-search-iam-autorag` (`2da31515-...`). **`src/` grep:** only `src/api/search.js` uses it — authenticated `POST /api/search` dashboard route. Agent chat spine uses `semantic-retrieval-dispatch.js` / `queryRouteRagLanes` (1536d Vectorize + pgvector). No Agent hot-path reads from 1024d index unless something calls `/api/search` directly.

### Lane routing — code paths (`src/core/rag-lanes.js`)

| Lane | Vectorize binding | Supabase table | Notes |
|---|---|---|---|
| `memory` | `AGENTSAM_VECTORIZE_MEMORY` | `agentsam_memory_oai3large_1536` | dual-write |
| `code` | `AGENTSAM_VECTORIZE_CODE` | `agentsam_codebase_chunks_oai3large_1536` | dual-write |
| `docs` | `AGENTSAM_VECTORIZE_COURSES` ← **wrong alias** | `agentsam_documents_oai3large_1536` | split-brain bug |
| `schema` | `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam_database_schema_oai3large_1536` | dual-write |
| `archive` | none (3072 Supabase only) | `agentsam_deep_archive_oai3large_3072` | pgvector only |

**Courses lane is CF Vectorize only** — no Supabase pgvector mirror for `agentsam-courses-oai3large-1536`.

**Lane routing bug:** `docs_knowledge_search` in `agent-lane-router.js` → `semantic-retrieval-dispatch.js` binds to `AGENTSAM_VECTORIZE_COURSES` but hydrates from `agentsam_documents_oai3large_1536`. `rag-retrieve.js` intent `courses` searches `docs` + `code` lanes: Vectorize query hits courses index, then `fetchLaneRow` looks up match ids in the **documents** Supabase table — vectors in courses index won't resolve if content was written only to documents pgvector. `queryPgvectorLane` (Supabase-only path) works for documents; Vectorize path is broken for docs unless courses and documents share vectors (they don't).

`classifySemanticLane` in `semantic-lane-classifier.js` routes IAM docs/runbook queries to `docs_knowledge_search`; no separate `courses` semantic lane — courses intent only appears in `rag-retrieve.js` `LANE_ORDER_BY_INTENT.courses`.

### Vectorize action items

- [ ] Add `AGENTSAM_VECTORIZE_DOCUMENTS` binding to both wrangler configs + redeploy
- [ ] Fix `rag-lanes.js` / `semantic-retrieval-dispatch.js`: `docs` → `DOCUMENTS` binding, keep `courses` as separate CF-only lane if needed
- [ ] Verify `inneranimalmedia-vectors` is empty (dashboard), then delete
- [ ] Confirm no production callers depend on `POST /api/search` 1024d path before retiring `AI_SEARCH_ENDPOINT`
- [ ] Retire legacy `scripts/ingest_rag_knowledge.js` 1024d references or mark archived
- [ ] Decide: dedicated `courses` Supabase table vs CF-only courses index

---

## Vector Lanes — Organization & Health (2026-06-03)

Learning reference for how the six active lanes work, what's healthy, and what's broken.  
Related: [Agent layer snapshot (RAG ingest gates)](./agent-layer-snapshot-p0-rag-2026-06.md) · `src/core/rag-lanes.js` · `src/core/semantic-retrieval-dispatch.js`

### Current state — two backends, six lanes

**Intended pattern:** Supabase pgvector (HYPERDRIVE) is the **write/store/audit** layer. Cloudflare Vectorize is the **fast query** layer at the edge. They are meant to be mirrors — write to Supabase, sync to Vectorize, query Vectorize at runtime. **Right now they are only partially synced.**

```
Supabase pgvector (HYPERDRIVE)          Cloudflare Vectorize
─────────────────────────────           ─────────────────────────────────
deep_archive         3072d   22 rows    (none — intentionally Supabase-only)
codebase_chunks      1536d  262 rows    AGENTSAM_VECTORIZE_CODE
database_schema      1536d  593 rows    AGENTSAM_VECTORIZE_SCHEMA
documents            1536d  307 rows    agentsam-documents-* (unbound orphan)
memory               1536d  194 rows    AGENTSAM_VECTORIZE_MEMORY
codebase_files       1536d  ~few rows   (file metadata only — no Vectorize lane)
                                       AGENTSAM_VECTORIZE_COURSES (courses; docs wrongly aliased here)
```

**Sync status: confirmed empty.** All 4 bound CF indexes have 0 stored_vectors while Supabase holds 1,500+ embedded rows. The silent quality killer is real — but see Runtime RAG audit below for the pgvector fallback path.

### Runtime RAG audit — `src/` grep (2026-06-03)

```bash
grep -rn "agentsam_match_\|AGENTSAM_VECTORIZE\|AI_SEARCH_ENDPOINT" src/
```

| Pattern | Files | Role |
|---|---|---|
| `AGENTSAM_VECTORIZE_*` | `rag-lanes.js`, `semantic-retrieval-dispatch.js`, `agentsam-memory-vector-sync.js` | Lane config + Vectorize query (returns 0 hits today) |
| `agentsam_match_*` | `semantic-retrieval-dispatch.js`, `rag-retrieve.js` | **Only** `agentsam_match_deep_archive_oai3large_3072_ann` — 1536d lanes use direct `embedding <=> $1::vector` SQL, not match functions |
| `AI_SEARCH_ENDPOINT` | `src/api/search.js` only | Legacy `POST /api/search` dashboard route (1024d AutoRAG) — not Agent chat |

**Agent chat hot path — lane context wired (Step 2 shipped):**

1. `agent-controller.js` calls `resolveAgentChatLaneContextBlock` → passes `contextBlock` to `buildSystemPrompt`; appends after cache miss if KV hit omitted block
2. Fires when `classifySemanticLane` / `classifyDatabaseAssistantIntent` match user message (explicit semantic/DB phrasing — not every turn until P0-A)
3. `dispatchSemanticRetrieval`: Vectorize (empty today) → **pgvector fallback** via Hyperdrive
4. Explicit `semantic_retrieval` tools in `catalog-tool-executor.js` still work independently

**Post-deploy canary:** `[agent-chat] semantic_lane_degraded` on semantic queries → workspace UUID or Hyperdrive path broken

**What still works today:**

| Path | Backend | Status |
|---|---|---|
| Explicit semantic tools (`code_semantic_search`, etc.) | Vectorize (empty) → **pgvector fallback** | Works if tool invoked + Hyperdrive + workspace resolves |
| `POST /api/search` | `AI_SEARCH_ENDPOINT` 1024d AutoRAG | Legacy dashboard only; stale data |
| `POST /api/agent/rag/query` | `legacyUnifiedRagSearch` | Legacy compat endpoint |
| Deep archive lane | `agentsam_match_deep_archive_*` via Hyperdrive | Works (21/22 embedded) |

**Unlock sequence:**

1. ~~Wire lane context~~ **Done**
2. P0-A: `classifyIntent` + d1/supabase route rows (broaden RAG + DB routing)
3. Run Supabase → CF Vectorize sync for all 4 lanes
4. Bind `AGENTSAM_VECTORIZE_DOCUMENTS`; fix docs→COURSES alias
5. Update `vectorize_index_registry.stored_vectors` after sync

### Three-tier mental model

| Tier | Lane(s) | Storage | Write discipline | Query cost | Use |
|---|---|---|---|---|---|
| **1 — Golden archive** | `deep_archive` | 3072d Supabase only | Slow, intentional — only when a doc is authoritative | ~20–50ms HYPERDRIVE | Debugging, research, architecture — **not hot agent turns** |
| **2 — Domain lanes** | code, schema, docs, courses | 1536d CF Vectorize + Supabase mirror | Automation (ingest scripts, commit hooks) | Fast (CF edge) | **Every agent turn** — this is the hot path |
| **3 — Live memory** | memory | 1536d CF Vectorize + Supabase mirror | Automatic after meaningful turns | Fast; filter by `workspace_id` + date | Session context, decisions, learned facts |

**Discipline:** Tier 1 written slowly and intentionally. Tier 2 written by automation. Tier 3 writes itself. **Missing today:** the Tier 2 automation layer (ingest script + Vectorize sync), which is why lanes are sparse and CF indexes may be out of sync with Supabase.

### Lane-by-lane health

#### `deep_archive` — 3072d — Supabase only

| Metric | Value |
|---|---|
| Rows | 22 (21 embedded; 1 missing — "AgentSam Runtime Contract" from May 25) |
| Content | Golden/architecture only — correct scope |
| CF Vectorize | None by design — 3072d too large for CF Vectorize query performance |
| Quality | Good — H2-section chunks, architecture docs only. Keep strict |

Every deep archive query goes through HYPERDRIVE. Fine for golden docs; not for hot paths.

#### `database_schema` — 1536d — 593 rows, fully embedded

| Metric | Value |
|---|---|
| Size | ~11 MB — largest lane |
| Embedded | All rows, ingested May 27 |
| Coverage gap | D1 tables only (`database_kind = 'd1'`). No Supabase table schema, KV structure, or R2 object structure |
| Quality | 300-token hard splits — acceptable for one-row-per-table definitions |

Agent asking "what columns does `agentsam_memory_oai3large_1536` have" won't find it here — that's a Supabase pgvector table, not D1.

#### `codebase_chunks` — 1536d — 262 rows, fully embedded

| Metric | Value |
|---|---|
| Files | 30 files — all dashboard / ChatAssistant |
| Coverage gap | **Zero `src/` backend** — `agent.js`, `agent-lane-router.js`, `catalog-tool-executor.js` not indexed |
| Quality | ~362 avg tokens — good chunk size for code |

#### `documents` — 1536d — 307 rows, fully embedded

| Source type | Chunks | Avg tokens | Quality |
|---|---:|---:|---|
| roadmap | 98 | 268 | **Bad** — 300-token splits mid-sentence; retrieval fragments |
| document | 74 | — | **Bad** — architecture docs too small; lose section context |
| workflows | 40 | 164–175 | OK — short atomic records |
| recipes | (in mix) | 164–175 | OK |

**Chunk size mismatch:** everything split at 300 tokens regardless of content type. Fix per RAG ingest spec: **H2-section chunking** for narrative docs (roadmap, architecture); keep fixed small chunks for atomic records (recipes, workflows, skills).

CF index `agentsam-documents-oai3large-1536` exists but unbound — runtime Vectorize path broken (see docs→COURSES alias bug above).

#### `memory` — 1536d — 194 rows, 192 embedded, 2 missing

| Metric | Value |
|---|---|
| Activity | Live and growing (April 30 → present) — healthiest lane |
| Metadata gap | `source_type` NULL on **all** rows — no pre-filter at query time; every search is full-scan similarity |
| Quality | Good embeddings, bad metadata |

#### `codebase_files` — 1536d — small

File-level metadata (paths), not chunk content. Used for file path resolution, not content retrieval. No dedicated Vectorize lane.

### Three quality problems

**1. Chunk size mismatch in documents**

300-token splits on everything. Narrative docs (roadmap, architecture) need H2-section chunking; atomic records (recipes, workflows, skills) can stay small. Highest-impact retrieval fix for roadmap/architecture queries.

**2. CF Vectorize sync never ran — confirmed**

| Lane | Supabase embedded | CF stored_vectors |
|---|---:|---:|
| codebase | 262 | **0** |
| schema | 593 | **0** |
| memory | 192 | **0** |
| documents | 307 | unbound index |
| courses | — | **0** (CF-only) |

Runtime tries Vectorize first (`dispatchSemanticRetrieval`); empty indexes fall through to pgvector SQL — but only when semantic retrieval is actually invoked (tools or wired lane context). Agent chat does neither today.

**3. No quality signal loop**

`avg_quality_score` exists in `agentsam_routing_arms`; `quality_score` in `agentsam_agent_run`. Nothing equivalent on vector lane tables. When retrieval returns bad chunks, there's nowhere to record it.

**Proposed fix:** add `retrieval_hit_count` and `last_retrieved_at` to each lane table. Increment on every RAG hit. Zero hits after 30 days → re-chunk or delete candidate. High hit rate → deep archive promotion candidate.

### Vector lane action items (quality + sync)

- [x] **P0:** Wire `resolveAgentChatLaneContextBlock` into agent chat spine (`agent-controller.js`)
- [ ] **P0:** Supabase → CF Vectorize sync all 4 lanes; verify `stored_vectors` > 0 in registry
- [ ] Bind `AGENTSAM_VECTORIZE_DOCUMENTS`; fix docs→COURSES alias in `rag-lanes.js`
- [ ] Run full Supabase → Vectorize backfill for lanes with count mismatch
- [ ] Re-chunk documents lane: H2 for narrative, fixed size for atomic records
- [ ] Extend `shouldChunkFile()` / reindex to cover `src/` backend hot paths
- [ ] Backfill `source_type` on memory rows
- [ ] Embed missing deep_archive row ("AgentSam Runtime Contract")
- [ ] Migration: `retrieval_hit_count`, `last_retrieved_at` on lane tables + increment in `queryRouteRagLanes` / `retrieveContextPack`
- [ ] Extend schema lane ingest to Supabase/Hyperdrive/KV/R2 structure (not D1-only)

---

## Supabase

- **Project:** `dpmuvynqixblxsilnlut`
- **Hyperdrive:** `08183bb9d2914e87ac8395d7e4ecff60` (shared by main + MCP + CMS workers)
- **S3 endpoint:** `https://dpmuvynqixblxsilnlut.storage.supabase.co/storage/v1/s3`
- **Region:** `us-east-2`
- **Disk used:** 422 MB / 8 GB

**Active pgvector lanes (agentsam schema)** — lane health detail in [Vector Lanes — Organization & Health](#vector-lanes--organization--health-2026-06-03):

| Table | Dims | Rows | Embedded |
|---|---|---:|---:|
| `agentsam_database_schema_oai3large_1536` | 1536 | 593 | 593 |
| `agentsam_codebase_chunks_oai3large_1536` | 1536 | 262 | 262 |
| `agentsam_documents_oai3large_1536` | 1536 | 307 | 307 |
| `agentsam_memory_oai3large_1536` | 1536 | 194 | 192 |
| `agentsam_codebase_files_oai3large_1536` | 1536 | ~few | ~few |
| `agentsam_deep_archive_oai3large_3072` | 3072 | 22 | 21 |

---

## Workspaces — D1 Verified

| ID | Name | Tenant | Status | Worker | D1 |
|---|---|---|---|---|---|
| `ws_inneranimalmedia` | Inner Animal Media — Main SaaS | `tenant_sam_primeaux` | active | `inneranimalmedia` | IAM main |
| `ws_inneranimalmedia_mcp` | Inner Animal Media — MCP Server | `tenant_sam_primeaux` | active | `inneranimalmedia-mcp-server` | IAM main |
| `ws_companionscpas` | Companions of CPAS | `tenant_companionscpas` | **archived** ← wrong | `companionscpas` | companionscpas (`fd6dd6fb`) |
| `ws_cp_companions_cpas_001` | Companions CPAS | `tenant_sam_primeaux` | active | — | — ← orphan duplicate |
| `ws_cms_editor` | AgentSam CMS Editor | `tenant_sam_primeaux` | active | — | — |
| `ws_python_cms` | AgentSam CMS Python | `tenant_sam_primeaux` | active | — | — |
| `ws_designstudio` | DesignStudio / MeauxCAD | `tenant_sam_primeaux` | active | — | — |
| `ws_connor_mcneely` | Connor McNeely / Leadership Legacy | `tenant_connor_mcneely` | active | — | — |
| `ws_shinshu` | Shinshu Solutions | `tenant_jake_waalk` | active | — | — |
| `ws_meauxbility` | Meauxbility Foundation | `tenant_nonprofit_organization` | active | — | — |
| `ws_knowledgeplatform` | Knowledge Platform / iAutodidact | `tenant_knowledge_platform` | active | — | — |
| `ws_pelicanpeptides` | Pelican Peptides | `tenant_pelican_peptides` | active | — | — |
| `ws_newiberiachurchofchrist` | New Iberia Church of Christ | `tenant_newiberia_20260110` | active | — | — |

**Companions CPAS reconciliation (canonical):**

```
tenant_companionscpas  →  ws_companionscpas  →  companionscpas worker  →  D1 fd6dd6fb
```

Live paying customer. D1 `status: archived` on `ws_companionscpas` is **wrong** — reactivate. `ws_cp_companions_cpas_001` under `tenant_sam_primeaux` is a duplicate provisioning row; archive it. Never resolve companionscpas credentials via `tenant_sam_primeaux`.

**Other workspace issues:**
- 4× `ATC Video` duplicate workspaces under `tenant_sam_primeaux` (UUID slugs) — orphan provisioning rows
- 2× `chrystal-clear-insurance-demo` UUID workspaces — same issue
- 2× `inneranimalmedia-cms-editor` UUID workspaces
- `ws_nicoc` (New Iberia Church of Christ Legacy) is paused alongside active `ws_newiberiachurchofchrist` — legacy row

---

## Cron Schedule (main worker)

| Schedule | Purpose (inferred) |
|---|---|
| `*/30 * * * *` | Health checks / polling |
| `0 * * * *` | Hourly rollups |
| `0 1 * * *` | 1am cleanup / archival |
| `0 6 * * *` | 6am daily brief |
| `0 9 * * *` | 9am daily tasks |
| `30 13 * * *` | 1:30pm (unknown — check `scheduled()` handler) |
| `0 9 * * 1` | Weekly Sunday 9am (verify actual day in handler) |
| `0 0 * * *` | Midnight daily reset |
| `0 0 1 * *` | Monthly 1st |

9 cron handlers all pointing to same `scheduled()` — confirm handler branches on `cron` string, not separate handlers.

---

## Key Cross-Worker Rules (platform law)

1. **Two repos, one D1.** `inneranimalmedia` and `inneranimalmedia-mcp-server` share `cf87b717` D1. Never write migrations targeting only one worker's behavior.
2. **In-app agent never calls MCP host.** `agent.js → dispatchByToolCode → catalog-tool-executor.js`. MCP→main via `proxyToMainWorker()` is allowed; main→MCP in hot paths is not.
3. **Never `npm run deploy` alone.** Always `npm run deploy:full` in each respective repo.
4. **Hyperdrive = Supabase Postgres only.** `auth_users` is D1. Routing `auth_users` through HYPERDRIVE causes `permission denied` — grep `src/` for this.
5. **Vectorize dims are locked.** One index, one dim, one model. `AGENTSAM_EMBEDDING_DIMENSIONS=1536` in env. Deep archive uses 3072 via Supabase pgvector only, never CF Vectorize.
6. **Database tools:** `agentsam_d1_*` = SQLite/D1 (`handler_type: cf`). `agentsam_supabase_*` = Postgres/Hyperdrive. Task types must be explicit (`d1_write`, `supabase_query`, …) — see [agent layer snapshot](./agent-layer-snapshot-p0-rag-2026-06.md#database-tool-naming--canonical-catalog-is-clean). Never both write tools on one turn.
7. **companionscpas uses own D1** (`fd6dd6fb`), not IAM main. Never run IAM migrations against it.

---

## Ship log — agent RAG sequence (2026-06-03)

| Step | Status | Notes |
|---|---|---|
| 1. Wire `resolveAgentChatLaneContextBlock` | **Done** | `agent-controller.js`; pgvector fallback active on semantic/DB intent match |
| 2. Supabase → CF Vectorize sync | Pending | All 4 indexes at 0 vectors |
| 3. Bind `AGENTSAM_VECTORIZE_DOCUMENTS` + fix COURSES alias | Pending | Same deploy as sync |
| 4. Documents H2 chunking | Next sprint | Quality, not wiring |
| P0-A classifyIntent + 4 DB route rows | Next | Fix `inferIntentHeuristically` returns **before** P0-B skill shrink |

## Agent Layer Snapshot (2026-06-03)

Full spec: [agent-layer-snapshot-p0-rag-2026-06.md](./agent-layer-snapshot-p0-rag-2026-06.md)

Three compounding problems blocking agent quality:

| # | Problem | Symptom | Primary fix |
|---|---------|---------|-------------|
| 1 | Context bloat | ~20.8K chars (~5.2K tokens) of `always_apply` skills every turn | Shrink always-on to 3 safety skills; semantic retrieval for the rest |
| 2 | Dead routing | 8 `agentsam_prompt_routes`; `classifyIntent()` uncalled; spine uses `composerMode` as `taskType` | Wire `classifyIntent` into `resolveRuntimeProfile`; add general-purpose routes; split `agent.js` |
| 3 | Duplicate identity | `core_identity` + `sse_system` (~180 tokens each, overlapping) | Consolidate to single `prompt_key` |

**D1 snapshot (production):**

| Table | Key metric |
|---|---|
| `agentsam_prompt_versions` | 19 active; `core_identity` + `sse_system` overlap |
| `agentsam_skill` | 289 rows; 16 ever invoked (5.5%); 7 always-on ≈ 5,200 tokens cold |
| `agentsam_prompt_routes` | 8 active — 6 CMS nodes, 1 MCP panel, 1 greeting; no general chat/code/debug/deploy routes |
| `agentsam_rules_document` | 22 active; none in Vectorize yet |
| `agentsam_cookbook` | 53 recipes; 1 ever used |
| `agentsam_tools` | 54 active (152 total); 24 OAuth-visible |

**P0 execution order (before RAG ingest):**

1. **P0-A** — Wire `classifyIntent()` into `resolveRuntimeProfile` when `overrides.task_type` missing
2. **P0-B** — D1 migration: keep `always_apply=1` only on deploy/D1/security skills (~450 tokens vs ~5,200)
3. **P0-C** — Merge `core_identity` + `sse_system` into one canonical prompt
4. **P0-D** — Split `src/api/agent.js` (10,156 lines) into `src/api/agent/*` before codebase RAG chunking

RAG ingest fixes discoverability; it does **not** fix cold always-on injection — that requires P0-B first.

---

## Open Issues From Today's Session

| Issue | Severity | Fix |
|---|---|---|
| CF Vectorize indexes all empty (0 vectors) | P0 | Run Supabase → Vectorize sync; update registry `stored_vectors` |
| ~~`resolveAgentChatLaneContextBlock` never called~~ | ✅ | Shipped in `agent-controller.js` |
| `classifyIntent()` has no live caller | P0 | Fix `inferIntentHeuristically` returns + wire in `resolveRuntimeProfile`; add d1/supabase route rows |
| CMS routes bare `"d1"` in tool_categories | P0 | Fix to `database.d1.*` with P0-A migration |
| 5,200 tokens of always-on skills every turn | P0 | Set `always_apply=0` on 4 skills, keep 3 |
| `core_identity` + `sse_system` duplicate identity prompts | P0 | Merge into single `prompt_key` |
| `src/api/agent.js` 10,156 lines / 389KB | P0 | Split into `src/api/agent/` modules |
| Deep archive — 22 rows, 1 missing embed | P1 | Embed "AgentSam Runtime Contract" row |
| CF Vectorize sync unknown vs Supabase | P1 | ~~Audit~~ **Confirmed empty** — run backfill |
| Documents 300-token chunk mismatch | P1 | H2-section chunking for narrative; small chunks for atomic |
| `codebase_chunks` — zero `src/` backend coverage | P1 | Extend `shouldChunkFile()` |
| 273/289 skills never invoked (no semantic index) | P1 | RAG ingest after P0 |
| `ws_companionscpas` archived but is live customer | P1 | Reactivate under `tenant_companionscpas`; archive orphan `ws_cp_companions_cpas_001` |
| Courses/docs Vectorize lane split-brain | P1 | Bind `AGENTSAM_VECTORIZE_DOCUMENTS`; fix `rag-lanes.js` alias |
| `companionscpas` social OAuth secrets empty | P1 | Fill or remove |
| `companionscpas` logs disabled | P1 | Enable |
| `companionscpas` no `RESEND_API_KEY` | P1 | Add secret or stub email |
| `companionscpas` compat date 2025-04-01 | P2 | Update + add nodejs_compat |
| `SUPABASE_SERVICE_KEY` unused duplicate | P2 | Remove from dashboard; keep `SUPABASE_SERVICE_ROLE_KEY` |
| `ASSETS` + `DASHBOARD` both → same R2 bucket | P2 | Consolidate if not intentional alias |
| Schema lane D1-only — no Supabase/KV/R2 | P2 | Extend schema ingest beyond `database_kind = 'd1'` |
| No retrieval quality loop on lane tables | P2 | Add `retrieval_hit_count`, `last_retrieved_at`; increment on RAG hit |
| `inneranimalmedia-vectors` orphan index | P2 | Confirm empty, delete |
| `AI_SEARCH_ENDPOINT` 1024d legacy | P2 | Only `/api/search` UI; safe to retire after caller audit |
| `ai-search-*` managed indexes (3) | P3 | Read-only legacy; delete when 1024d path retired |
| ~10 orphan UUID workspace rows | P3 | Cleanup migration |
| Missing indexes: `execution_steps`, `tool_call_log` | P3 | Add in Sprint 519 migration |
| Storage inventory stale (April 1) | P3 | Fix inventory cron |
| `agentsam_memory` — `source_type` NULL on all 194 rows | P3 | Backfill |

---

## Changelog

| date | change |
|---|---|
| 2026-06-03 | Initial baseline from dashboard dump + D1 audit; Vectorize list verified; `SUPABASE_SERVICE_KEY` grep; agent layer snapshot cross-linked |
| 2026-06-03 | Step 2 shipped (lane context); database routing naming map; P0-A scope documented |
