# Agent Sam — Ollama workflow registry (migrations 323–324)

## What installs

[migrations/323_agentsam_ollama_embed_pipeline_workflows.sql](../migrations/323_agentsam_ollama_embed_pipeline_workflows.sql) seeds four D1 registry workflows (nodes + edges) and six completed smoke rows in `agentsam_workflow_runs`:

| `workflow_key` | Role |
|----------------|------|
| `ollama_embed_intent_route` | Embed → intent classify → optional local LLM |
| `ollama_code_review` | Local qwen code review JSON verdict |
| `ollama_rag_local` | Embed → D1 vector search → RAG answer |
| `ollama_nightly_chat_compaction` | Scheduled compaction / embeddings pipeline |

[migrations/324_align_ollama_workflow_trigger_types.sql](../migrations/324_align_ollama_workflow_trigger_types.sql) aligns `ollama_code_review.trigger_type` with `src/core/workflow-executor.js` (`event` → `api`) and backfills `metadata_json.migration_ref` on seed runs when missing.

## Why inactive

All four rows use `is_active = 0`. They are **registry definitions only** until handler wiring and smoke validation are done. Turning them on in production requires a deliberate `UPDATE` or a follow-up migration after review.

## Production Worker vs local Ollama

A Cloudflare Worker in production cannot reach a developer machine’s Ollama unless you route through local dev, a terminal bridge, tunnel, or a dedicated service adapter. Treat these workflows as **off by default** until that path is explicit and tested.

## Supabase

- **D1** is canonical for workflow registry rows.
- **Supabase** mirrors **runtime** workflow runs / telemetry where the product already does so; this migration does **not** add static registry mirroring. If a future feature syncs registry definitions to Supabase, that would be a separate, explicit change.

## Verify

Against remote D1 (requires [scripts/with-cloudflare-env.sh](../scripts/with-cloudflare-env.sh) / Wrangler auth):

```bash
./scripts/smoke/verify-migration-323-ollama-workflows.sh
```

Manual apply for 324 if needed:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/324_align_ollama_workflow_trigger_types.sql
```

## Activate later

1. Implement or confirm `dispatchNode` handlers for any `agentsam.ollama.v2.*` keys not yet wired.
2. Run smoke in a safe environment (local or staged bridge to Ollama).
3. Set `is_active = 1` only for the workflow keys you are enabling (narrow `WHERE workflow_key = ...`), or ship a small migration that does the same.
