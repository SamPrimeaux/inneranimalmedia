# Cloudflare bindings reference (inneranimalmedia)

Source: **`wrangler.production.toml`** + usage notes from **`worker.js`**. Secret **names** only; no secret values.

## Summary table

| Binding | Type | Resource / ID | Primary use in worker.js |
|---------|------|---------------|-------------------------|
| **AI** | Workers AI | (managed) | `env.AI.run(...)` — embeddings (`RAG_MEMORY_EMBED_MODEL` ~12862), image routes, etc. |
| **AI_SEARCH** | AI Search | `search_name = "iam-autorag"` | `env.AI_SEARCH.search` when available; pairs with REST fallback using `CLOUDFLARE_API_TOKEN` in `autoragAiSearchQuery` |
| **MYBROWSER** | Browser Rendering | Playwright | `handleBrowserRequest`, `runInternalPlaywrightTool`, queue screenshots, `/api/playwright/*` |
| **ASSETS** | R2 | `inneranimalmedia-assets` | Homepage and public static paths |
| **CAD_ASSETS** | R2 | `splineicons` | CAD assets |
| **DASHBOARD** | R2 | `agent-sam` | Dashboard HTML/JS/CSS, auth pages, `/api/screenshots` asset GET, legacy screenshot storage |
| **AUTORAG_BUCKET** | R2 | `autorag` | AutoRAG file ingest / listing |
| **DOCS_BUCKET** | R2 | `iam-docs` | `putAgentBrowserScreenshotToR2`, documentation objects |
| **R2** | R2 | `iam-platform` | Memory, knowledge, R2 tool I/O, `indexMemoryMarkdownToVectorize` sources |
| **DB** | D1 | `inneranimalmedia-business` | All D1 queries (sessions, tools, spend, deployments, MCP, etc.) |
| **HYPERDRIVE** | Hyperdrive | id `08183bb9d2914e87ac8395d7e4ecff60` | Postgres-backed paths (when used) |
| **VECTORIZE** | Vectorize | `ai-search-inneranimalmedia-aisearch` | Vector search (generic) |
| **VECTORIZE_INDEX** | Vectorize | `ai-search-iam-autorag` | RAG vector path aligned with AutoRAG dimensions (see `vectorRagSearch` ~12870+) |
| **KV** | KV | id `09438d5e4f664bf78467a15af7743c44` | General KV (e.g. browser screenshot cache keys in `handleBrowserRequest`) |
| **SESSION_CACHE** | KV | id `dc87920b0a9247979a213c09df9a0234` | OAuth state / session cache (architecture-critical) |
| **IAM_COLLAB** | Durable Object | class `IAMCollaborationSession` | Stub DO (~182+) |
| **CHESS_SESSION** | Durable Object | class `ChessRoom` | Stub DO (~206+) |
| **MY_QUEUE** | Queue | `74b3155b36334b69852411c083d50322` | Producer + consumer; Playwright jobs, overnight hooks |
| **WAE** | Analytics Engine | dataset `inneranimalmedia` | Custom metrics / analytics |
| **Tail** | Tail consumer | service `inneranimalmedia-tail` | Forwards logs (wrangler config) |

## Secrets (names only)

Referenced in code / docs: **`AI_SEARCH_TOKEN`**, **`ANTHROPIC_API_KEY`**, **`OPENAI_API_KEY`**, **`GOOGLE_AI_API_KEY`**, **`CLOUDFLARE_API_TOKEN`**, **`INTERNAL_API_SECRET`**, **`DEPLOY_TRACKING_TOKEN`**, OAuth client secrets, **`MCP_AUTH_TOKEN`**, **`RESEND_API_KEY`**, terminal / vault tokens, etc. See `worker.js` env inventory patterns (~12600+).

## AI_SEARCH_TOKEN usage

- Pre-prompt RAG in **`POST /api/agent/chat`**: Bearer token for `.../ai-search/instances/iam-autorag/search` (~7418–7431).
- If missing or invalid, pre-prompt RAG logs a warning; chat still works without RAG context.
