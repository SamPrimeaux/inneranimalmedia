# AgentSam Memory System — Management, Usage, and Testing Guide

Status: living doc. Written 2026-06-19 alongside the `LANE_CONTRACTS` fix in
`scripts/lib/rag-ingest-protocol.mjs`. Verify the cron job names and row counts
below against live D1/Supabase before trusting them blindly — they were
pulled live at write time but this doc will drift as the system evolves.

## 1. The two-table model (read this first)

There are **two different tables** that both get called "memory." Conflating
them is the most likely source of confusion, so pin this down first:

| Table | Location | Rows (last checked) | Purpose |
|---|---|---|---|
| `agentsam.agentsam_memory` | Supabase | 46 | **Operational memory.** Structured, typed (`fact`, `preference`, `project`, `skill`, `error`, `decision`, `policy`, `state`). Has confidence/importance scoring, pinning, archiving, supersession (`superseded_by`), expiry. This is the *source* record AgentSam writes when it learns something.
| `agentsam.agentsam_memory_oai3large_1536` | Supabase | 202 | **RAG retrieval mirror.** One embedding row per retrievable memory chunk, `text-embedding-3-large` @ 1536 dims, mirrored to Cloudflare Vectorize index `agentsam-memory-oai3large-1536` via binding `AGENTSAM_VECTORIZE_MEMORY`.

Why two tables and not one: `agentsam_memory` carries fields that should
**never** be embedded as-is (raw `value_json`, internal `sync_key`,
`d1_id` cross-references) and needs structured filtering (by `memory_type`,
`importance`, `is_pinned`) that's awkward over a vector index. The
`_oai3large_1536` table is the retrieval-optimized projection of a subset of
that data. Treat `agentsam_memory` as **source of truth for facts**, and
`agentsam_memory_oai3large_1536` as a **rebuildable index** — same law as
documents/code/schema lanes: *Git/R2/D1 (and here, the structured Supabase
table) is canonical; the embedding lane is a mirror.*

If a memory needs to be searchable by Agent Sam mid-conversation, it has to
exist in **both** tables. If you only write to `agentsam_memory`, it's
durable but not retrievable by similarity search until something ingests it
into the `_oai3large_1536` lane.

## 2. What actually moves data between them (cron jobs)

Confirmed job names in `agentsam_cron_runs` (D1):

- **`agentsam_memory_oai3large_1536_sync`** — the lane sync job. This is almost
  certainly what reads new/changed rows from `agentsam_memory` (or wherever
  memories are first written) and produces the embedded mirror rows.
- **`index_memory_vectorize`** — pushes the Supabase embedding rows to the
  Cloudflare Vectorize index. This is the second half of the dual-write —
  Supabase pgvector gets the row, Vectorize gets the mirror, and (per the
  protocol fix today) both should now be checkable against the `memory` lane
  contract.
- **`agentsam_memory_decay`** — confidence/importance decay over time. This is
  the mechanism that's supposed to keep stale memories from outranking fresh
  ones in retrieval — worth understanding before you assume "no results" means
  "no memory," when it might mean "decayed below threshold."

**Action item for you, not assumed true:** confirm in the actual job
implementation (search for these job names in `src/` or wherever cron
handlers live) that `agentsam_memory_oai3large_1536_sync` and
`index_memory_vectorize` now call `assertLaneContract(LANE_CONTRACTS.memory)`
and `writeVectorizeSyncReceipt(...)` from `rag-ingest-protocol.mjs`. The
contract now *exists* — whether the live job *uses* it yet is a separate,
unverified step. If it doesn't, that's the next surgical edit: thread the
shared protocol helpers into those two job handlers instead of writing
sync_log rows ad hoc.

## 3. How to manage it day to day

**Writing a memory** (as a human, debugging or seeding):
```sql
INSERT INTO agentsam.agentsam_memory
  (tenant_id, workspace_id, user_id, memory_type, memory_key, title, content, source, importance)
VALUES
  ('tenant_sam_primeaux', 'ws_inneranimalmedia', '<your_user_id>',
   'decision', 'lane_contract_fix_2026_06_19',
   'Added memory + schema lanes to LANE_CONTRACTS',
   'Formalized contracts for agentsam_memory_oai3large_1536 and agentsam_database_schema_oai3large_1536 lanes so assertLaneContract() guards them like code/documents already were.',
   'manual', 7);
```
This alone does **not** make it retrievable — it needs to pass through the
sync job (or you manually embed + upsert it) before it shows up in similarity
search.

**Checking sync health:**
```sql
SELECT chunk_id, status, synced_at, details_json
FROM vectorize_sync_log
WHERE vectorize_index = 'agentsam-memory-oai3large-1536'
ORDER BY synced_at DESC LIMIT 10;
```
A healthy lane shows recent `status = 'ok'` rows with non-empty
`details_json.chunks_embedded`. If you write memories and never see new
receipts, the sync job isn't picking them up — check its trigger/query (likely
keyed on `embedded_at IS NULL` or `updated_at > last_sync`).

**Checking decay isn't silently burying things you care about:**
```sql
SELECT memory_key, importance, confidence, is_pinned, is_archived, expires_at
FROM agentsam.agentsam_memory
WHERE is_archived = false
ORDER BY importance DESC, confidence DESC
LIMIT 20;
```
If something important keeps dropping out of retrieval, `is_pinned = true`
should exempt it from decay — confirm that's actually how the decay job
filters before relying on it.

## 4. How to use it (retrieval)

Via the `agentsam_supabase_vector` MCP tool, scoped with `purpose`:
```
purpose: memory
query: "<natural language>"
workspace_id: ws_inneranimalmedia
limit: 8
```
This is a **pgvector similarity search**, not a keyword search — phrase your
test queries the way you'd actually ask Agent Sam something, not as exact
keyword matches. If you want to sanity-check whether a specific memory is
retrievable at all, query with language close to its `title`/`content` and
confirm it surfaces in the top results, not just "any results."

## 5. Weekend test plan (practice + fine-tune the system itself)

Run this as a deliberate loop, not passive use — the goal is to actually
verify each link in the chain, since you said you're genuinely unsure how
solid this is:

1. **Write 3 test memories** via SQL (above), spanning different
   `memory_type` values (e.g. `decision`, `error`, `preference`), with
   distinct, greppable `memory_key`s like `test_weekend_audit_001`.
2. **Wait for / manually trigger the sync job**, then query
   `vectorize_sync_log` filtered to `agentsam-memory-oai3large-1536` and
   confirm 3 new/updated receipts with matching content in `details_json`.
3. **Query Vectorize directly** (or via `agentsam_supabase_vector` with
   `purpose: memory`) using language paraphrased from your test memory
   content — confirm each of the 3 surfaces in the top 5 results. If one
   doesn't, that's a real retrieval-quality finding, not noise.
4. **Force a decay cycle** (or check `agentsam_memory_decay`'s schedule) and
   re-check `confidence`/`importance` on your test rows before/after —
   confirms decay is live and confirms its actual rate, which you can then
   reason about instead of guessing.
5. **Delete/archive one test memory**, re-run the sync job, confirm the
   corresponding Vectorize vector gets removed (via `vectorizeDeleteByIds`
   path) and isn't still retrievable. This is the one most systems get wrong
   — easy to add to an index, easy to forget to remove.
6. **Repeat steps 1–3 against the `schema` lane** now that it has a formal
   contract too — write or trigger a schema-doc ingest after your next D1
   migration and confirm a fresh receipt lands in `vectorize_sync_log` for
   `agentsam-schema-oai3large-1536` with the new migration's tables described.

If all six steps check out, you have a verified, working memory system, not
just one that's running and probably fine. If any step fails, you've found
the actual next thing to fix — and you'll know exactly where in the pipeline
it broke instead of guessing.
