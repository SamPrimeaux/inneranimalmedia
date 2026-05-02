# Worker routing map (`worker.js`)

**Primary router:** `export default { async fetch(...) }` — search **`async fetch(request, env, ctx)`** (line ~2181+ region; line numbers drift — use ripgrep).

**Order matters:** `/api/agentsam/*` is registered **before** `/api/agent/*` to avoid prefix collisions (comment ~2961).

## Core clusters (approximate line ranges)

| Region | Responsibility |
|--------|----------------|
| **2181–2350** | Health (`/api/health`, `/health`), webhooks (`/api/webhooks/*`, `/api/hooks/*`), `POST /api/internal/post-deploy`, `POST /api/internal/record-deploy`, deployment log/recent, OTLP `POST /api/telemetry/v1/traces` |
| **2434+** | `handleBrowserRequest` — `/api/browser/*` (screenshot GET uses **KV** cache, not DOCS_BUCKET) |
| **2471+** | Overview, time tracking, colors, finance, clients, projects, hub, billing summaries |
| **2539+** | OAuth Google/GitHub start + callbacks; canonical `/auth/callback/google`, `/auth/callback/github` |
| **2561+** | `/api/auth/login`, backup code, logout |
| **2572+** | Admin overnight validate/start |
| **2589+** | Admin vectorize, reindex-codebase, trigger-workflow |
| **2885+** | `/api/agent/commands/execute` |
| **2961–2962** | **`handleAgentsamApi`** for **`/api/agentsam/*`** |
| **2986+** | Workers list, commands, themes, federated search, settings block |
| **3345+** | Settings / theme / vault (large block) |
| **3827+** | Static + dashboard: `/`, `PUBLIC_ROUTES`, `/auth/signin`, `/dashboard/*`, ASSETS vs DASHBOARD fallbacks |

## Auth / OAuth (names only)

- **Google:** `handleGoogleOAuthStart`, `handleGoogleOAuthCallback`, `/auth/callback/google`
- **GitHub:** `handleGitHubOAuthStart`, `handleGitHubOAuthCallback`, `/api/oauth/github/callback`, `/auth/callback/github`
- **Email:** `POST /api/auth/login`, backup code, `POST /api/auth/logout`

## Dashboard serving

- **`respondWithR2Object`:** streams R2 object with content-type; used for auth HTML and many static responses.
- **`respondWithDashboardHtml`:** ~4001+ — if `?embedded=1`, injects `body.embedded` script for shell chrome hiding; else delegates to `respondWithR2Object`.

## `handleAgentsamApi` (~8913+)

Authenticated (`getAuthUser`). Examples include:

- `/api/agentsam/user-policy` GET/PATCH
- `/api/agentsam/hooks` CRUD
- Fetch domain allowlist, memory, recipes, commands, workspaces
- **AutoRAG:** `/api/agentsam/autorag/stats`, `/files`, `/sync`, `/upload`, `/search`, DELETE file (see ~9799+)

Use ripgrep: **`handleAgentsamApi`** and **`pathLower === '/api/agentsam`** inside the function for the full list.

## `handleAgentApi` / agent chat

- **`POST /api/agent/chat`:** compiles system prompt, optional **pre-prompt RAG** (~7410–7451), `fetchContextIndex`, `ai_compiled_context_cache`, then model call or **`runToolLoop`** (~7839, ~8020).
- **`runToolLoop`:** ~4918+ — multi-round tool execution; loads tools from **`mcp_registered_tools`** when `useTools`.

## API categories (non-exhaustive)

- **MCP:** `/api/mcp/*` — `handleMcpApi`
- **Images, draw, terminal, playwright** — see grep `pathLower === '/api/` in fetch
- **Spend / billing / CICD** — `/api/spend`, `/api/billing`, `/api/cicd/current`
- **Deploy rollback:** `POST /api/deploy/rollback` (~2184)

## Pre-prompt RAG pipeline

- **Gate:** `chatMode === 'agent'` && `env.AI_SEARCH_TOKEN` && last user message word count >= **4** (`RAG_MIN_QUERY_WORDS`, ~7411–7416).
- **Request:** `POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai-search/instances/iam-autorag/search` with Bearer **`AI_SEARCH_TOKEN`**, body `messages` + `ai_search_options.retrieval.max_num_results` (~7418–7430).
- **Parse:** `ragData.result.chunks` -> `text` fields joined (~7435–7442).
- **Minimum context:** `RAG_MIN_CONTEXT_CHARS = 100` (~7412, 7440).

## Tool loop behavior

- **`runToolLoop`** (~4918): loops up to `MAX_ROUNDS`, calls provider APIs (Anthropic/OpenAI/Google), executes **builtin** tools from large `else if` chain (~5070+) or MCP proxy, records **`mcp_tool_calls`**, **`agent_costs`**.

## DOCS_BUCKET

- **No** dedicated `fetch` route serves `iam-docs` GETs through this worker; screenshot **URLs** point to **`docs.inneranimalmedia.com`**. Upload path is **`putAgentBrowserScreenshotToR2`**.
