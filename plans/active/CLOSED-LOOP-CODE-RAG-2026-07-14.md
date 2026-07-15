# CLOSED-LOOP + CODE RAG — 2026-07-14

**Ticket:** `tkt_closed_loop_code_rag_2026_07_14`  
**Status:** `failed_partial` — experimental corpus only; **not promoted** (707/911 checkpoint abandoned; do not resume as authoritative)  
**Project:** `inneranimalmedia` · **Subsystem:** `rag` + `agentsam-closed-loop`  
**Priority:** P0  
**Cursor plan (doctrine):** `~/.cursor/plans/supabase_closed_loop_4918b9c6.plan.md`

---

## Why this ticket exists

Close the AgentSam **observe → remember → improve** loop after Wave 1/2 shipping, fix broken **codebase RAG** (almost all `dashboard/`, no Worker `src/`), connect **D1 job bookkeeping**, and make overnight reindex **safe under Mac sleep**.

---

## Shipped this session (git)

| SHA | What |
|-----|------|
| `e0170b66` … Wave 2 | Session summarize, deep archive, vector sync outbox |
| `a4b9c8e0` | Stop hooks → `agentsam_request_queue`; Postgres-on-D1 guard |
| `582798c4` | Deploy SSOT → Supabase `agentsam_deploy_events`; narrow blocklist |
| `a0fd2ae8` | Deploy events → Sam Supabase user + `ws_*`→UUID map |
| `2bb98e57` | Batch1 `src/` reindex + deploy notes from `git log -1` |
| `6c5954df` | `--runtime` manifest (Worker/services/containers ≈911 files) |
| `23536783` | Reindex writes `agentsam_code_index_job` (`cidx_src_reindex_v1`) |
| `c9abb912` | Checkpoint resume + `npm run run:reindex_runtime:safe` (caffeinate) |

Supporting docs/scripts:

- `docs/platform/codebase-schema-rag-batch1-2026-07.md`
- `scripts/lib/runtime-code-index-manifest.mjs`
- `scripts/lib/src-worker-batch1-paths.mjs`
- `scripts/lib/code-index-job-d1.mjs`
- `scripts/lib/code-reindex-checkpoint.mjs`
- `scripts/run-reindex-runtime-safe.sh`
- `scripts/sql/dedupe_database_schema_rag.sql`

---

## Closed-loop map (what should now be connected)

```text
Chat / agent run
  → D1 control plane (runs, tools, queue, hooks)
  → Hyperdrive telemetry companion (Wave 1)
  → R2 messages.jsonl + Worker summarize-session → agentsam_memory + memory_oai3large_1536
  → deep archive promote (supplement-only 3072)
  → agentsam_vector_sync_outbox → Vectorize replica
  → deploy:fast → D1 deployments + agentsam_deploy_events (identity-attributed)
  → CODE lane reindex → agentsam_codebase_* + Vectorize agentsam-codebase-oai3large-1536
  → D1 agentsam_code_index_job progress
```

**Do not confuse:**

| Name | Role |
|------|------|
| `agentsam_request_queue` | Machine retry / stop-hook enqueue |
| `agentsam_approval_queue` | Human gate (not this work) |
| prune (reindex) | Offline “delete paths not in current manifest” — **disabled** for runtime/batch1 so dashboard chunks survive |

---

## Overnight result (failed_partial — do not promote)

Abandoned `run:reindex_runtime:safe` as an authoritative baseline:

- Incomplete (~707/911), mixed across commits, ~222 stale dashboard paths in mirror, unstable Supabase/Vectorize
- D1 `cidx_src_reindex_v1` → `failed_partial`; receipt + evidence under `.scratch/code-reindex-failed-partial-evidence.json`
- Treat Vectorize/code mirror as experimental only; AgentSam code truth = live `rg`/fs + symbol search; embeddings = accelerator with path/hash/commit verify

Reliability hardening shipped (min pass): commit pin (abort on HEAD drift / refuse mismatched checkpoint), Supabase mirror nonfatal, pg `error` handler, retryable `fetch failed`, smaller Vectorize batches, safe-wrapper exit 78 does not restart.

**Next index:** focused stable corpus from one pinned commit → verify (eligible=indexed) → promote; do not chase the old 911 checkpoint.

---

## Tomorrow AM — validation checklist (prove loops closed)

### A. Runtime CODE reindex finished

- [ ] Checkpoint `status=completed` or job % at 100
- [ ] D1: `SELECT id,status,indexed_file_count,chunk_count,progress_percent,triggered_by,completed_at FROM agentsam_code_index_job WHERE id='cidx_src_reindex_v1';`
- [ ] Supabase: count `src/%` files with fresh `created_at` (expect hundreds, not 10)
- [ ] Re-run dry-run counts: `npm run run:reindex_runtime:dry-run` → still ~911 eligible; live re-run should mostly **skip unchanged**

### B. In-app CODE RAG (semantic proof)

Ask Agent Sam (or Cmd+K codebase search):

- [ ] “Where is `dispatchProductionDomainRoutes` and what does it dispatch?”
- [ ] “How does `d1-postgres-table-guard` / `POSTGRES_ONLY_TABLES` work?”
- [ ] “What does `agentsam-run-stop-hooks` enqueue?”

Expect **`src/core/…` citations**, not only `dashboard/…`.

### C. Deploy loop

- [ ] Latest `deploy:fast` row: D1 `deployments.description` / notes = **git subject** (not hardcoded `vite→R2…`)
- [ ] Supabase `agentsam.agentsam_deploy_events`: `user_id=6cbd71f8-…`, metadata `d1_user_id=au_871d920d1233cbd1`, workspace UUID mapped

### D. Wave 1/2 memory / outbox (spot checks)

- [ ] After a real chat compaction/summarize: row in `agentsam.agentsam_memory` (+ embedding lane)
- [ ] `agentsam_vector_sync_outbox` drains (pending → done) without poison
- [ ] Edge `summarize-thread` still **410** (retired); Worker owns summarize

### E. Schema RAG (still open — do after CODE)

- [ ] `psql … -f scripts/sql/dedupe_database_schema_rag.sql`
- [ ] `./scripts/with-cloudflare-env.sh python3 scripts/ingest_schema_rag.py`
- [ ] Confirm no duplicate `table_name+database_name`; freshness ≫ June 5

---

## Still open / left (ordered)

### P0 — finish this ticket

1. **Complete overnight `--runtime` reindex** (or resume with same safe command).
2. **Morning proofs A–D** above; mark sections done in this doc.
3. **Schema RAG dedupe + refresh** (E).
4. **Optional:** prune orphan `dashboard/`-only main chunks only after runtime index is trusted (explicit decision — do not prune by accident).

### P0 — closed-loop plan leftovers (`w2-freshness`, `w3-spine`)

5. Wire **codebase reindex on main push** / schema on migration (automation, not only manual safe script).
6. **Wave 3:** UUID workspace normalization + Phase 2 tenant RLS (`SET LOCAL app.workspace_id`) — **deferred**; Phase 1 service_role RLS already shipped.
7. Feedback readers / archive stale todos (plan `w2-freshness`).

### Known backlog called out earlier (not blocked on reindex)

8. `subagent_child_run_create` high fail rate — investigate.
9. `worker_analytics_*` bad rollups — audit midnight pipeline.
10. Bare `d1_query` traffic volume — tighten routing / policy.
11. Confirm stop-hook → queue drain still green after next agent fail proof.

### Other active IAM tickets needing attention (platform — not blocking sleep)

| ID | Priority | Title |
|----|----------|-------|
| `tkt_routing_tool_ssot` | P0 | D1 tool profiles + gate harness |
| `tkt_workspace_001` | P0 | Agent Sam repository edit loop |
| `tkt_routing_spine_front_door` | P0 in_review | TaskSpec + golden matrix |
| `tkt_p0_infer_intent_heuristically` | P0 | Replace heuristic intent with D1 front-door |
| `tkt_telemetry_002` | P0 in_review | Paid tool usage cost |
| `tkt_finding_3_pending_status` | P0 in_review | pending ≠ error |
| Image/routing/Thompson cluster | P0–P1 | Intent keywords, revision follow-up, cost→bandit |
| Client backlog | P1–P2 | Companions CMS SSOT, Fuel setup, Design Studio 002–004 |

**Tomorrow focus for THIS track:** finish/prove CODE RAG + schema refresh + deploy/memory spot checks. Routing/workspace P0s are parallel product work — pick after RAG green.

---

## Acceptance (close this ticket when)

**Dual-pass E2E law (LOCKED):** do **not** set `shipped` until two independent E2E proofs are recorded:

```bash
npm run record:ticket-e2e-pass -- --ticket=tkt_closed_loop_code_rag_2026_07_14 --detail='PASS1: …'
npm run record:ticket-e2e-pass -- --ticket=tkt_closed_loop_code_rag_2026_07_14 --detail='PASS2: …'
npm run assert:ticket-shippable -- --ticket=tkt_closed_loop_code_rag_2026_07_14 --set-shipped
```

1. Runtime index: ≥800 of ~911 runtime paths present in Supabase CODE lane with fresh timestamps (or documented intentional skips).
2. In-app chat returns correct Worker file citations for ≥3 backend prompts (**pass 1** overnight/AM; **pass 2** separate later retest).
3. `cidx_src_reindex_v1` shows completed with honest file/chunk counts.
4. Schema RAG deduped + re-ingested (or filed follow-up with owner/date).
5. Short note in `status_reason` or ticket events linking final commit SHA + proof timestamps.

---

## Quick commands (copy/paste)

```bash
# Overnight / resume
npm run run:reindex_runtime:safe

# Job progress
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml --json \
  --command "SELECT id,status,indexed_file_count,chunk_count,progress_percent,triggered_by FROM agentsam_code_index_job WHERE id='cidx_src_reindex_v1'"

# Schema (after CODE)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/dedupe_database_schema_rag.sql
./scripts/with-cloudflare-env.sh python3 scripts/ingest_schema_rag.py
```
