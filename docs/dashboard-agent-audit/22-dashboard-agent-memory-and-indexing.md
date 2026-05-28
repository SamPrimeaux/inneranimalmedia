# Chunk 22 — Memory and indexing

**Status:** Live-code verified (dependability: **not production-dependable** until auth + write path fixed)

## Purpose

Document memory and retrieval paths **used or intended** by live `/dashboard/agent` — D1 `agentsam_memory`, Supabase `agent_memory`, Vectorize/AutoRAG, and code indexing — with honest status on embedding writes.

## Live production scope

Agent chat may invoke memory tools and RAG lanes configured in D1/MCP. Operators expect recall on **inneranimalmedia.com/dashboard/agent** only if those tools are on the chat tool bar and Worker paths succeed.

## Existing live code paths

| Kind | Path |
|------|------|
| D1 KV memory | `agentsam_memory` — `src/core/memory.js`, `src/api/agent.js` (reads/upserts) |
| Tool alias | `src/core/agentsam-capability-aliases.js` — `memory.write` → `agent_memory_write` |
| Builtin tool | `src/tools/memory.js` — `memory_write` |
| MCP public key | `agentsam_memory_search` — `src/core/mcp-tool-resolve.js`, `mcp-memory-search-schema.js` |
| Supabase semantic | `agent_memory` (pgvector) — separate schema from D1; mirror rules in `.cursor/rules` |
| RAG lanes | `src/core/rag-lanes.js` |
| Vectorize index | Worker `env.VECTORIZE` — `indexMemoryMarkdownToVectorize` in worker (markdown prefixes under R2 memory paths — **not** full `dashboard/` source tree by default) |
### Canonical R2 path for this audit series

| Field | Value |
|-------|--------|
| Bucket | `inneranimalmedia-autorag` |
| Prefix | `knowledge/agentsam/dashboard-agent-audit/` |
| Repo mirror | `docs/dashboard-agent-audit/*.md` |
| Upload | `scripts/upload-dashboard-agent-audit-to-autorag.sh` + [r2-upload-manifest.json](./r2-upload-manifest.json) |

Post-approval embedding: after user approves a write tool or deploy, Worker should queue index of changed paths into Vectorize/AutoRAG — **conceptual**; not production-dependable until B22-001 auth fixed.

| R2 bucket | `inneranimalmedia-autorag` / autorag paths (operational; confirm in wrangler bindings) |
| Alignment sync | `src/core/alignment-sync.js` — optional `agentsam_memory` writes |
| Dashboard schema hint | `dashboard/schema.json` — `agent_workspace_state` (IDE persist, not embeddings) |

### D1 `agentsam_memory` shape (operational)

Per rules: `user_id`, `key`, `value`, `memory_type` — **not** `role`/`content`/`embed_model` (those are Supabase `agent_memory`).

## What is ALREADY engineered

- D1 keyword memory path in `src/core/memory.js` (no embedding required).
- Cron decay / importance updates on `agentsam_memory`.
- Chat can pass context via files, workspace, and tool results (chunk 09).
- PostgREST mirror patterns documented for plans (separate from this table).

## What is PARTIALLY engineered

- **Automatic codebase indexing** — Vectorize indexing historically targets R2 markdown prefixes (`memory/`, `docs/`, etc.), not live `dashboard/` + `src/` on every commit (see **LEGACY** note in old audit docs). **Stale/manual code index** is an operator-reported pain (B22-002).
- **Post-approval embedding** — concept: embed after user approves tool/file changes; not verified as wired end-to-end on agent chat.
- **`memory_write` with `provider=both`** — if operators see **401**, treat embedding path as **broken until triaged** (reported issue; verify live with authenticated tool call — do not assume fixed).

## What is BROKEN

**Embedding/memory is NOT production dependable until:**

1. Auth path for write tool repaired (no 401 for entitled users).
2. Write pipeline validated D1 + Supabase (if `provider=both`).
3. Retrieval quality confirmed on real agent prompts.

| ID | Symptom |
|----|---------|
| B22-001 | `agentsam_memory_write` / `memory_write` auth failures |
| B22-002 | Code index stale — search misses live `dashboard/` changes |

## UX reality today

User asks agent to “remember” or “search codebase” — success depends on which tools are enabled for route. Failures often appear as silent tool errors in trace rows, not as clear “memory unavailable” banner. Operators cannot trust semantic recall until B22-001 resolved.

## Data / event / execution flow

```text
Agent chat tool: memory_write / agentsam_memory_search
  → runToolLoop (src/api/agent.js)
  → memory.js / memory.js core helpers
  → D1 agentsam_memory INSERT/UPDATE
  → Optional: Supabase agent_memory upsert (embedding) — fails if auth/config broken
  → Optional: Vectorize upsert (separate jobs / R2 markdown indexing)
```

## Validation commands

```bash
rg -n "agentsam_memory|memory_write|agent_memory_write" src --glob '*.js' | head -40
rg -n "indexMemoryMarkdownToVectorize|VECTORIZE" src --glob '*.js' | head -20
rg -n "agent_memory" src/core/rag-lanes.js
# Live (authenticated): invoke memory_write via agent tool trace — expect 200 not 401
```

## Acceptance criteria

- [ ] Team distinguishes D1 `agentsam_memory` vs Supabase `agent_memory`.
- [ ] B22-001 reproduced or cleared with logged HTTP status.
- [ ] Indexing scope documented: what is actually in Vectorize today vs desired `dashboard/`+`src/`.
- [ ] No claim “RAG is fixed” without retrieval test on `/dashboard/agent`.

## Repair backlog IDs

| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B22-001 | Embedding write auth repair | `src/tools/memory.js`, MCP auth | `memory_write` succeeds for session user | Tool trace 200 |
| B22-002 | Automatic code indexing | Worker index job + R2 prefix | Index includes current `dashboard/` + `src` on deploy | Search hits new file |

## Immediate next implementation step

Reproduce **B22-001** on production with one entitled session: run `memory_write` from agent chat, capture status/body in `mcp_tool_calls` or tool trace — fix auth before any AutoRAG expansion.
