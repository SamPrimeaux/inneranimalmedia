# AST-RAG command cheat sheet

## Deps

```bash
python3 -m pip install --user psycopg2-binary   # Mac
# GCP: sudo python3 -m pip install --break-system-packages psycopg2-binary
```

Env: `CLOUDFLARE_API_TOKEN`, `SUPABASE_DB_URL`, `OPENAI_API_KEY` in `.env.cloudflare`.

## Phase 1 — parse → D1

```bash
python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 0
python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 1
python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 2
python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 3 --commit --resume
# or: --chunk all --commit --resume
# paths: --main-repo /path/to/app --mcp-repo /path/to/mcp
# filter: --repo-filter SamPrimeaux/inneranimalmedia-mcp-server
```

Artifacts: `artifacts/ast_rag_phase1/`

## Phase 2 — embed → Supabase

```bash
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 0
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 1
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 2           # dry-run
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 2 --commit
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 3 --commit  # link node_id
python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 4 --query 'intent here' --top-k 8
# optional: --repo Owner/name --max-nodes N --batch-size 32
```

Artifacts: `artifacts/ast_rag_phase2/`

## GCP one-liner pattern

```bash
sudo -u agentsam bash -lc 'cd /home/samprimeaux/inneranimalmedia && python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 3 --commit'
```

## Sync secrets Mac → GCP

```bash
./scripts/sync-vm-env-cloudflare.sh
```

## Tables

- D1: `codebase_ast_nodes`, `codebase_dep_edges` (scoped by `workspace_id`)
- PG: `agentsam.agentsam_codebase_ast_symbols_oai3large_1536`
- PG: `agentsam.agentsam_codebase_chunks_oai3large_1536` (`node_id` after chunk 3)

## Runtime tool

`agentsam_codebase_retrieve` — params: `query`, optional `repo`, `top_k`, `expand`, `hydrate`.
