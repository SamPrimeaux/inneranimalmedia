# Cloudflare Workers AI — IAM reference

## Real usage (`spend_ledger`)

| Model | Calls | Spend (USD) |
|-------|------:|-------------:|
| `@cf/meta/llama-3.1-8b-instruct` | 5 | $0.00007 |

- **Near-zero marginal cost** for small completion calls — suitable for high-volume auxiliary tasks (subject to Workers AI quotas).
- **Embeddings:** **`@cf/baai/bge-large-en-v1.5`** for RAG memory (`RAG_MEMORY_EMBED_MODEL`, `vectorizeRagSearch` ~12862+); **`@cf/baai/bge-base-en-v1.5`** for KB path (`KB_EMBED_MODEL` ~2601).
- **Content moderation:** **`@cf/meta/llama-guard-3-8b`** is the standard Workers AI guard model when a moderation path is enabled — **not** referenced in a current `worker.js` grep; confirm bindings and call sites in your branch or Cloudflare AI dashboard. Track cost in Workers AI usage if invoked.

## Binding

- **`wrangler.production.toml`:** `[ai]` binding → **`env.AI`** in `worker.js`.
- **No** third-party API key for Workers AI models — usage is **account/plan** scoped.

## Models referenced in `worker.js`

| Model id | Role |
|----------|------|
| `@cf/baai/bge-large-en-v1.5` | **RAG memory** embeddings — `RAG_MEMORY_EMBED_MODEL` (~12862) |
| `@cf/baai/bge-base-en-v1.5` | **Vectorize KB** path — `KB_EMBED_MODEL` (~2601) |
| `@cf/meta/llama-3.1-8b-instruct` | Small completions / fallbacks (multiple call sites ~4219, ~5897, ~8109, ~8118) |

### Optional / pipeline models

- **`@cf/meta/llama-guard-3-8b`:** content moderation — add to worker when needed; verify call sites in your revision (no `llama-guard` string in repo snapshot used for this doc).

### Not in this worker revision

- `@cf/qwen/qwen3-embedding-0.6b` — **not** in `worker.js` grep for this snapshot.

## API pattern

- **`await env.AI.run(modelId, { prompt } | { messages })`** — see each call site for exact options.
- **`vectorizeRagSearch`** (~12873+): embeds query with **`RAG_MEMORY_EMBED_MODEL`**, queries Vectorize index, optional rerank.

## Cost

- **Included** in Workers AI quotas per Cloudflare plan; ledger may still record fractional USD for billed usage.
- **Embeddings:** each RAG query runs at least one embedding call — cost scales with **Vectorize + AI** usage.

## IAM integration

- **RAG:** `vectorizeRagSearch`, memory ingestion paths using **`@cf/baai/bge-large-en-v1.5`**.
- **KB:** `KB_EMBED_MODEL` for vectorize-kb embedding.
- **Llama:** used where `env.AI.run('@cf/meta/llama-3.1-8b-instruct', ...)` appears.

## Learning resources (external)

- https://developers.cloudflare.com/workers-ai/
- Model catalog, embeddings, `env.AI.run`
