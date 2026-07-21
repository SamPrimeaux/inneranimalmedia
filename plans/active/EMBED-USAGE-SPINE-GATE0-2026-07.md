# Embed usage spine — Gate 0 proof (2026-07-21)

## Law

Every Worker OpenAI/Workers-AI embed that has `workspace_id` + `tenant_id` context MUST write
`agentsam_usage_events` with:

| field | value |
|-------|--------|
| `event_type` | `embed` |
| `model_key` | usually `text-embedding-3-large` (or lane spec) |
| `tokens_in` | OpenAI `usage.prompt_tokens` when present, else ~chars/4 |
| `cost_usd` | from `resolveUsageEventCostUsd` |
| `workspace_id` | D1 workspace id |
| `user_id` | when known (also sent as OpenAI `user`) |
| `task_type` | see matrix |
| `ref_table` / `ref_id` | originating surface |

Central path: `createAgentsamEmbedding(..., { usage: { task_type, … } })` → `logEmbeddingUsageEvent`.

## Hot-path matrix (Worker)

| task_type | call site | was silent? |
|-----------|-----------|-------------|
| `ast_retrieve` | `codebase-ast-retrieve` / `agentsam_codebase_retrieve` | **yes → fixed** |
| `ast_symbol_reembed` | `ast-symbol-reembed.js` dashboard Re-Index | partial → per-call via usage opts |
| `code_index_embed` | `code-indexer.js` | **yes → fixed** |
| `code_retrieve` | `codebase-search.js` | **yes → fixed** |
| `rag_retrieve` | `rag-retrieve.js` retrieveContextPack | **yes → fixed** |
| `archive_retrieve` | `rag-retrieve.js` deep archive | **yes → fixed** |
| `semantic_retrieve_*` | `semantic-retrieval-dispatch.js` | **yes → fixed** |

## Offline / CLI (not Worker)

| path | status |
|------|--------|
| `ast_rag_phase2_embed_symbols.py` | stamps job + INSERT usage (`ast_rag_phase2`) on `--commit` |
| `rag_ingest.mjs` / other Python ingest | still CLI-only — follow-up to call D1 usage insert or Worker proxy |

## Prove SQL (after one AST retrieve or Re-Index)

```sql
SELECT id, event_type, task_type, tool_name, model_key, tokens_in, cost_usd,
       workspace_id, user_id, ref_table, ref_id,
       datetime(created_at, 'unixepoch') AS at
  FROM agentsam_usage_events
 WHERE event_type = 'embed'
 ORDER BY created_at DESC
 LIMIT 20;
```

Expect ≥1 row with `task_type='ast_retrieve'` after `agentsam_codebase_retrieve`, and
`task_type='ast_symbol_reembed'` after dashboard Re-Index AST.

Baseline before fix (2026-07-21): **0** embed rows; only `agent_chat` events present.
