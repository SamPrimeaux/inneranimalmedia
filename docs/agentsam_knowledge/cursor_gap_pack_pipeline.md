# Cursor gap pack pipeline

Operational tooling to build a **clean, Cursor-parity knowledge pack** for Agent Sam: repo intelligence, embeddings, Vectorize upload, and Supabase observability ingest. This is **not** production Worker behavior; it is local/scripted batch work under `artifacts/agentsam_cursor_gap_pack_v2/` (gitignored).

## Two ledgers (do not conflate)

| Ledger | What it records | Primary stores |
|--------|-----------------|----------------|
| **Runtime compaction** | Live token/context compaction during agent chat (`tokens_before` → `tokens_after`, strategy, provider/model) | D1 `agentsam_compaction_events` only |
| **Gap-pack evidence** | Plans, workflow trace, prompts, tools, codebase snapshots, embedded audit corpus, decisions | Supabase/D1 observability tables + Vectorize index metadata |

`agentsam_compaction_events` was built for **runtime compaction**, not for every “compressed / chunked / embedded” batch job. A gap pack is chunked and embedded for retrieval, but that is **evidence and knowledge ingest**, not context-window compaction.

**Gap-pack embedding and vector work belongs in:**

- `agentsam_prompt_runs`, `agentsam_tool_call_events` — model/tool trace for the pack run
- `codebase_snapshots`, `codebase_files` — repo evidence at a point in time
- `documents` — chunked text tied to embed model and content hash
- Vectorize index metadata (changeset / manifest receipts under the pack dir)
- Plus plan/workflow tables: `agentsam_plans`, `agentsam_plan_tasks`, `agentsam_workflow_*`, `agent_context_snapshots`, `agent_decisions`

**It does not belong in** `agentsam_compaction_events` unless a real compaction event occurred in production chat (Worker `scheduleCompactionEvent` path).

## Purpose

The gap pack closes the loop between:

- What the repo actually does (routes, tools, D1 tables, dashboard surfaces)
- What Vectorize / semantic search can retrieve
- What Supabase mirrors for plans, workflows, prompts, tools, codebase snapshots, and decisions

It supports the megaprompt track in `docs/MEGAPROMPT_AGENT_SAM_CURSOR_PARITY.md` (read-before-edit, routing trace, P0 writer hooks) without polluting compaction or guardrail tables with ingest-shaped rows.

## Clean corpus rule

1. **Build** (`scripts/build_agentsam_cursor_gap_pack.py`) scans `src/`, `dashboard/`, and related paths; writes markdown + JSON under `artifacts/agentsam_cursor_gap_pack_v2/`.
2. **Refine** (`scripts/refine_agentsam_cursor_gap_pack.py`) strips noise, dedupes chunks, and emits `CLEAN_CHUNKS.jsonl` / `clean_findings.json` — the only corpus intended for embedding and Vectorize.
3. Do **not** embed raw audit NDJSON, patch backups, or full `*.local.jsonl` dumps into production indexes without the balanced filter step.

Default output dir in the builder is `artifacts/agentsam_cursor_gap_pack`; the v2 pack uses `artifacts/agentsam_cursor_gap_pack_v2` in downstream scripts.

## Embedding policy

| Path | Model | When to use |
|------|--------|-------------|
| `scripts/embed_agentsam_clean_chunks.py` | Ollama (`mxbai-embed-large:latest` by default) | Local/dev, no API cost; dimension must match Vectorize index expectations |
| `scripts/embed_agentsam_clean_chunks_openai.py` | OpenAI `text-embedding-3-large` @ 1024 dims | Production-aligned vectors for `ai-search-inneranimalmedia-autorag` |

Both scripts read `CLEAN_CHUNKS.jsonl`, append to pack-local JSONL, and skip IDs already present (idempotent re-runs).

Requires: `OPENAI_API_KEY` for OpenAI path; Ollama listening on `http://127.0.0.1:11434` for local path.

## Vectorize balanced upload flow

1. `scripts/filter_gap_pack_vectorize_balanced.py` — caps per-source / per-table density so uploads stay balanced (avoids one file dominating the index).
2. `scripts/fix_vectorize_ids_gap_pack.py` — normalizes vector IDs for Cloudflare Vectorize NDJSON.
3. `scripts/vectorize_manifest_gap_pack.py` — documents manifest / changeset metadata for the upload receipt.

Upload the resulting `*.vectorize.balanced.fixed_ids.ndjson` via Cloudflare dashboard or wrangler Vectorize APIs (see pack `VECTORIZE_UPLOAD_RECEIPT.md` after a run). **Do not commit** NDJSON artifacts.

## Supabase ingest flow

1. `scripts/prepare_agentsam_gap_pack_supabase_ingest.py` — builds `SUPABASE_ROWS_PREVIEW.json`, `PROMPT_TRACE_ROWS_PREVIEW.json`, and ingest plan/manifest from clean pack + Vectorize receipt pointers.
2. `scripts/ingest_agentsam_gap_pack_supabase.py` — PostgREST upserts in dependency order:

   - `agentsam_plans`, `agentsam_plan_tasks`
   - `agentsam_workflow_runs`, `agentsam_workflow_steps`, `agentsam_workflow_events`
   - `codebase_snapshots`, `codebase_files`
   - `documents`
   - `agent_context_snapshots`, `agent_decisions`
   - `agentsam_prompt_runs`, `agentsam_tool_call_events`

Env: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (loaded from `.env.agentsam.local` / `.env.local` when present).

D1 remains canonical for operational plans; this ingest mirrors **observability and knowledge** into Supabase `public` tables that the Worker also uses for workflow/prompt telemetry.

## What this pipeline does **not** write

**`agentsam_compaction_events`** is the **runtime compaction ledger** (D1 only; no Supabase mirror). Rows mean a real summarize/truncate/selective-compact of **live context**, not “we embedded an audit pack.”

Gap-pack Vectorize/Supabase ingest is the **plan/evidence/prompt/tool/codebase ledger**. Omitting compaction rows from gap-pack ingest is correct and intentional.

Production compaction is wired via `scheduleCompactionEvent` in `src/core/agentsam-ops-ledger.js`, called from `scheduleCompactionFromAnthropicUsage` in `src/core/agent-costs.js` when Anthropic usage reports compaction. The table may stay at **zero rows** until:

- CF Builds has deployed the Worker with that wiring, and
- A real chat turn triggers server-side compaction.

Do **not** add a public route or synthetic production rows to satisfy audit counts. Optional local smoke rows must set `metadata_json` with `smoke: true`, `source: "compaction_writer_smoke"`, and `delete_after_verification: true`.

Long-term: nightly/cron summarization paths should call the same `scheduleCompactionEvent` helper when they truly truncate or summarize context.

## Verification

**D1 (remote):**

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --json --command "SELECT COUNT(*) AS n FROM agentsam_compaction_events;"
```

**Supabase** (if mirrored): count rows in `public.agentsam_compaction_events` only when that table exists and is in use. Zero is expected until real compaction runs.

## One-time session repairs

`scripts/archive/session_repairs/repair_gap_pack_*.py` — idempotent fixes applied to **preview JSON** during the 2026-05-16 ingest session (stable UUIDs, NOT NULL defaults). Prefer re-running `prepare_*` + `ingest_*` on a clean pack for new sessions.

## Next task (P0 writers)

Run the read-only locator (does not modify source):

```bash
python3 scripts/locate_agentsam_p0_writer_hooks.py
./scripts/with-cloudflare-env.sh python3 scripts/locate_agentsam_p0_writer_hooks.py --with-d1
```

Targets:

- `agentsam_guardrail_events`
- `agentsam_skill_revision`
- `agentsam_user_feature_override`
- `agentsam_compaction_events` — treat Worker wiring as landed; verify after deploy/real compaction, do not force fake rows

Output: `artifacts/agentsam_p0_writer_hooks/` (HOOK_CANDIDATES.md, NEXT_CURSOR_PATCH.md).

Then: read-before-edit enforcement, routing trace, and surgical patches per `docs/MEGAPROMPT_AGENT_SAM_CURSOR_PARITY.md`.

## Next ops knowledge batch (curated)

Do **not** rebuild the full ~3k-vector gap pack for small operational lessons. Embed these paths in a **dedicated ops batch** (separate from noisy full-repo audit NDJSON):

```text
docs/agentsam_knowledge/dashboard_r2_asset_deploy_tactics.md
docs/agentsam_knowledge/cursor_gap_pack_pipeline.md
artifacts/dashboard_overview_data_mapping/NEXT_PATCH.md
artifacts/read_before_edit_enforcement/NEXT_PATCH.md
```

Run through the same clean pipeline (`refine` → `embed_*` → balanced Vectorize filter → optional Supabase `documents` ingest). Tag chunks with `source: ops_knowledge` so they stay retrievable without diluting code-index density.

## Script index

| Script | Role |
|--------|------|
| `build_agentsam_cursor_gap_pack.py` | Scan repo, optional D1/OpenAI/Ollama, emit pack artifacts |
| `refine_agentsam_cursor_gap_pack.py` | Clean corpus |
| `embed_agentsam_clean_chunks.py` | Ollama embeddings |
| `embed_agentsam_clean_chunks_openai.py` | OpenAI embeddings |
| `filter_gap_pack_vectorize_balanced.py` | Balanced Vectorize NDJSON |
| `fix_vectorize_ids_gap_pack.py` | Vector ID normalization |
| `vectorize_manifest_gap_pack.py` | Upload manifest helper |
| `prepare_agentsam_gap_pack_supabase_ingest.py` | Build Supabase preview rows |
| `ingest_agentsam_gap_pack_supabase.py` | PostgREST upsert |
