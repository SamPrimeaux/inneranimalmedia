---
name: ast-rag-codebase-index
description: >-
  Index and maintain AST-RAG for codebases (Phase 1 parse → D1 nodes/edges, Phase 2
  embed → Supabase pgvector symbols, optional chunk node_id link, smoke ANN). Use when
  embedding/chunking repos, refreshing code search, agentsam_codebase_retrieve returns
  empty/stale hits, onboarding fuelnfreetime/companionsofcaddo/customer repos, or when
  the user mentions AST-RAG, Phase 2 embed, symbol ANN, or codebase index drift.
---

# AST-RAG codebase index

Keep symbol search trustworthy: parse → embed → link → smoke → drift-check. Never mix customer workspaces into the platform index.

## Pipeline (what / where)

| Phase | Script | Writes | Purpose |
|------|--------|--------|---------|
| 1 parse | `scripts/ast_rag_phase1_dual_repo_walk.py` | D1 `codebase_ast_nodes`, `codebase_dep_edges` | Structure |
| 2 embed | `scripts/ast_rag_phase2_embed_symbols.py` `--chunk 0..4` | Supabase `agentsam.agentsam_codebase_ast_symbols_oai3large_1536` | Semantic ANN |
| 2 link | same `--chunk 3 --commit` | Supabase chunks.`node_id` | Hydrate full code snippets |
| Runtime | `agentsam_codebase_retrieve` → `src/core/codebase-ast-retrieve.js` | read-only | Symbol ANN → graph → hydrate |

Embeddings: OpenAI `text-embedding-3-large` @ 1536-d. **Not** Cloudflare Vectorize for this lane (`vectorize_id` on D1 nodes may stay null — OK).

## IAM platform defaults (this Mac / GCP)

- Workspace: `ws_inneranimalmedia` / Supabase UUID `fa1f12a8-c841-4b79-a26c-d53a78b17dac`
- Repos already indexed: `SamPrimeaux/inneranimalmedia`, `SamPrimeaux/inneranimalmedia-mcp-server`
- Secrets (`.env.cloudflare`, never commit): `CLOUDFLARE_API_TOKEN`, `SUPABASE_DB_URL`, `OPENAI_API_KEY`
- Mac: run from repo root after `set -a; source .env.cloudflare; set +a`
- GCP `iam-tunnel`: `sudo -u agentsam bash -lc 'cd /home/samprimeaux/inneranimalmedia && …'` (env file is `chmod 600` agentsam)

```bash
# Refresh after meaningful code land (platform) — explicit target required
python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk all --target platform --commit --resume
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk all --target platform --commit
# or stepwise:
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 0 --target platform
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 1 --target platform
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 2 --commit --target platform
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 3 --commit --target platform   # optional hydrate
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 4 --query 'your intent' --target platform
```

Bare `--chunk all` **refuses** without `--target platform` or customer `--workspace-id` / `--single-repo` (safety rail — no accidental dual-repo walk).

Single-repo refresh: `--repo SamPrimeaux/inneranimalmedia-mcp-server` on Phase 2; Phase 1 `--repo-filter` / `--main-repo` / `--mcp-repo` paths.

## Customer / other projects (fuelnfreetime, companionsofcaddo, …)

**Law:** isolate by `workspace_id` (D1) + Supabase `workspace_id` UUID. Never upsert customer symbols under platform UUID.

Before indexing a customer repo, resolve from D1 (session/workspace row — do **not** hardcode `ws_*`):

1. `workspace_id` string (e.g. from `workspaces` / project binding)
2. Supabase workspace UUID used in Hyperdrive symbol/chunk tables
3. Repo full name(s) `Owner/name` and local clone path(s)
4. Confirm Hyperdrive + embedding key available for that tenant (platform BYOK / `user_api_keys` — not Wrangler secret sprawl)

Then:

1. Phase 1: parse **their** clone(s) into D1 with **their** `workspace_id` (extend walker flags or temporary env overrides — do not wipe platform rows). Prefer `--resume` / repo-scoped delete+replace.
2. Phase 2: pull/embed only that workspace’s embeddable nodes; upsert with **their** workspace UUID into the symbol table (or tenant-specific table if provisioned).
3. Smoke ANN with `--query` that should hit **their** symbols only; pass `repo` filter when validating.
4. Runtime: `agentsam_codebase_retrieve` must run in that workspace session so graph expand uses their D1 edges. Today symbol ANN defaults to platform Supabase UUID in `searchAstSymbols` — for non-platform tenants, pass/fix `workspaceUuid` mapping from `workspaceId` before claiming customer retrieve works.

If a customer uses a **separate Vectorize index** (legacy/other lane), do not assume this AST-RAG path feeds it. Prefer pgvector symbols for `agentsam_codebase_retrieve`; treat Vectorize as a different product lane unless migrations say otherwise.

## Drift management (don’t silently lose the benefit)

Run before claiming “indexed” and after large merges:

```sql
-- D1: embeddable vs total by repo (platform example)
SELECT repo, COUNT(*) AS nodes,
  SUM(CASE WHEN node_type IN ('function','class','method','arrow_function','component','hook','const','type_alias','interface','variable') THEN 1 ELSE 0 END) AS embeddable
FROM codebase_ast_nodes
WHERE workspace_id = ?   -- bind workspace
GROUP BY repo;
```

```sql
-- Supabase: symbol coverage
SELECT repo, COUNT(*) FROM agentsam.agentsam_codebase_ast_symbols_oai3large_1536
WHERE workspace_id = ?::uuid GROUP BY repo;
```

Healthy when: embeddable ≈ symbol rows (± small lag); chunk4 / tool returns `symbol_hits` with scores; after chunk 3, many results `kind: chunk` (not only signatures). Alert if tool note says “No chunk node_id links” **and** product needs hydrate, or if symbol count ≪ embeddable after a ship.

Agent checklist when user asks to “index X”:

1. Which workspace + UUID + repos?
2. Phase 1 present for those repos?
3. Phase 2 symbol count vs embeddable?
4. Chunk 3 needed for hydrate?
5. Smoke query + (optional) live `agentsam_codebase_retrieve`
6. Note ticket / memory with counts — not just “ran script”

## Validate quality (Claude / ChatGPT / in-app)

1. **Script smoke:** `--chunk 4 --query '…'` — expect known symbol names/paths in top-k.
2. **In-app Agent Sam** (same workspace): ask to call `agentsam_codebase_retrieve` with a precise intent (e.g. “where is agent_run finalized?”). Expect `symbol_hits` including `agent-run-routing.js` / MCP paths as relevant; `result_count > 0`.
3. **Claude / ChatGPT via IAM MCP:** ensure connector has `agentsam_codebase_retrieve` in `tools/list`, then:

```text
Use agentsam_codebase_retrieve with query:
"scheduleAgentsamChatAgentRunInsert finalize agent run"
Optionally repo: "SamPrimeaux/inneranimalmedia"
Report top hits: node_name, file_path, score, kind (symbol vs chunk).
```

Pass criteria: correct files in top ~8, scores sane (>~0.4 typical), both platform repos retrievable unless `repo` filtered. Fail: empty hits, wrong workspace bleed, or only stale paths after a big refactor → re-run Phase 1 `--resume` + Phase 2 `--commit` for that repo.

See [reference.md](reference.md) for command cheat sheet.
