# RAG vector dimensions

Canonical setup for Agent Sam custom RAG and related infrastructure.

## Worker custom RAG (OpenAI)

- **Model:** `text-embedding-3-large` (configured via `RAG_OPENAI_EMBEDDING_MODEL`; default behavior aligns with this model).
- **Dimensions:** `1024`. The Worker passes `dimensions` to the OpenAI embeddings API using `Number(env.RAG_EMBEDDING_DIMENSIONS || 1024)` so requests stay aligned with downstream storage when the env var is unset.

Implementation: `src/api/rag.js` (`openaiCreateEmbedding` → REST `POST .../embeddings` with `dimensions`).

## Cloudflare Vectorize

- **Index:** `ai-search-inneranimalmedia-autorag`
- **Configuration:** 1024 dimensions, cosine distance (binding `VECTORIZE` in production).

Indexes are fixed at creation time; embeddings ingested here must remain 1024-dimensional for this index.

## Supabase (pgvector)

- **Active RAG-related tables** use `vector(1024)` for current ingestion paths (for example `documents`, `agent_memory`, `knowledge_edges`, `session_summaries`, `tenant_context`, and related HNSW-backed tables as deployed).
- **Legacy:** `agent_context_snapshots` and `agent_decisions` retain **768-dimensional** vector columns from earlier schemas. Do not alter those columns or write 1024-dimensional embedding vectors into them unless application code is audited and updated to generate matching 768- or 1024-dimensional vectors consistently for those tables.

## Operational note

After changing embedding model or dimension defaults, reconcile env vars (`RAG_EMBEDDING_DIMENSIONS`, `RAG_OPENAI_EMBEDDING_MODEL`), Vectorize index metadata, and Supabase column types before bulk re-ingest.
