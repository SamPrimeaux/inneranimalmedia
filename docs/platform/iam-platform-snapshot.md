---
title: IAM Platform Runtime Snapshot
project_key: inneranimalmedia
d1_context_id: ctx_inneranimalmedia
workspace_id: ws_inneranimalmedia
tenant_id: tenant_sam_primeaux
lane_key: docs_knowledge_search
doc_type: platform_runtime_snapshot
topic: iam_platform_snapshot
ingest_script: scripts/ingest_platform_snapshot.mjs
updated: 2026-06-14
---

# IAM Platform Runtime Snapshot

Single curated retrieval doc for Agent Sam + Cursor. **D1 SSOT row:** `ctx_inneranimalmedia`. **Memory router:** `agentsam_memory.key=iam_platform_context_router_v1` (also in `agentsam_memory_oai3large_1536` + `AGENTSAM_VECTORIZE_MEMORY`). **Vector mirror:** `agentsam_documents_oai3large_1536` + `AGENTSAM_VECTORIZE_DOCUMENTS`. Re-ingest docs: `npm run run:ingest_platform_snapshot`. Sync memory router vector: `npm run run:sync_platform_context_router_memory_vector`.

## Repos, GitHub, and deploy

| Surface | Local path | GitHub | Deploy |
|---------|------------|--------|--------|
| **Main worker + dashboard** | `/Users/samprimeaux/inneranimalmedia` | https://github.com/SamPrimeaux/inneranimalmedia | `npm run deploy:full` (Vite → R2 `static/dashboard/app/` → wrangler production) |
| **MCP server** | `/Users/samprimeaux/inneranimalmedia-mcp-server` | https://github.com/SamPrimeaux/inneranimalmedia-mcp-server | `cd .../inneranimalmedia-mcp-server && npm run deploy:full` |
| **MovieMode service** | `inneranimalmedia/services/moviemode-service` | same monorepo | separate worker deploy when MovieMode lane changes |

Never `npm run deploy` alone for full product ship. Never mix deploy commands between repos. Worker entry **only** `src/index.js` (`wrangler.production.toml`). Legacy `worker.js` removed.

**Deep docs:** `README.md`, `docs/platform/iam-runtime-architecture-2026-06.md`, `docs/autorag/TEAM_MILESTONE_INGEST_PIPELINE.md`.

## Runtime lanes (end-to-end)

### Main worker (inneranimalmedia.com)

```
Browser / API client
  → src/index.js (session, webhooks, R2 dashboard assets)
  → src/core/production-dispatch.js (all /api domain routes)
  → handler modules under src/api/, src/core/, src/tools/
```

Agent Sam chat: `POST /api/agent/chat` → `agent-chat-spine.js` → `runtime-profile.js` → `resolveModelForTask` (Thompson) → `agent-tool-loop.js` → `dispatchByToolCode` → `catalog-tool-executor.js`.

### MCP worker (mcp.inneranimalmedia.com)

External OAuth clients (Claude.ai, ChatGPT, Cursor) → MCP worker `dispatchTool()` locally. Same D1 catalog `agentsam_tools`. `proxyToMainWorker()` only for unimplemented fallbacks. **Golden rule:** dashboard/in-app Agent Sam never routes through MCP server.

### PTY lane (iam-pty / Workers VPC)

Binding: `PTY_SERVICE` (VPC service `iam-vpc`). Terminal tools: `agentsam_terminal_local`, `agentsam_terminal_remote`, `agentsam_terminal_sandbox`. Workspace paths: `/workspace/{tenant_id}/{user_id}/` on PTY host. Auth: `PTY_AUTH_TOKEN`. Code: `src/core/pty-workspace-paths.js`, `execOnPtyHost()`.

### Cloudflare Tunnel

`cloudflared` on private host reaches PTY/render pool. Tunnel status: `/api/tunnel/status`, restart: `/api/tunnel/restart`. Not used for public dashboard traffic.

### MyContainer sandbox

DO class `MyContainer` + binding `MY_CONTAINER`. Image: `meauxcontainer-mycontainer:sandbox-v2`. Tool: `agentsam_container_exec` (migration 635). For sandboxed code execution offload from PTY.

### Bridge auth (MCP → main only)

| Secret | Direction | Purpose |
|--------|-----------|---------|
| `AGENTSAM_BRIDGE_KEY` | MCP worker → main worker | Service trust for proxy/fallback |
| `MCP_AUTH_TOKEN` | External → MCP worker | MCP endpoint gate |
| `PTY_AUTH_TOKEN` | Worker → PTY host | Terminal WebSocket/exec |

## Stack bindings (production)

| Binding | Resource |
|---------|----------|
| `DB` | D1 `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) |
| `ASSETS` | R2 `inneranimalmedia` |
| `AUTORAG_BUCKET` | R2 `inneranimalmedia-autorag` |
| `ARTIFACTS` | R2 `artifacts` |
| `KV` | KV `09438d5e4f664bf78467a15af7743c44` |
| `SESSION_CACHE` | KV `dc87920b0a9247979a213c09df9a0234` |
| `HYPERDRIVE` | Supabase `dpmuvynqixblxsilnlut` agentsam schema |
| `AGENTSAM_VECTORIZE_*` | 6 indexes @1536 (memory, code, schema, documents, courses + moviemode gemini2) |
| DOs | `IAM_COLLAB`, `AGENT_SESSION` (AgentChatSqlV1), `BROWSER_SESSION`, `CHESS_SESSION`, `MY_CONTAINER` |
| `MOVIEMODE_SERVICE` | moviemode-service worker |
| `PTY_SERVICE` | Workers VPC iam-pty |

## Tool catalog and credential lanes

SSOT: `agentsam_tools` only (`agentsam_mcp_tools` dropped). Handler pairs: `cf`+cloudflare (D1/R2/KV), `hyperdrive`+supabase (pgvector), `github`, `memory`, `notify`, `terminal`, `deploy`. BYOK via `user_api_keys` + `user_secrets`. Superadmin: `user.role === superadmin` only — never hardcode tenant strings in code.

## CMS and client workers

Per-site CMS context: `ctx_cms_{slug}` (priority 75) on `ws_inneranimalmedia`. Client workers (e.g. companionscpas) have **separate repos**, D1 databases, and `agentsam_project_context` on `ws_companionscpas` — not patched from IAM platform context.

**Reusable client patterns:** `docs/patterns/README.md` (ingested via `iam-platform-docs.manifest.json`). **Client compass:** `docs/clients/{slug}/project-brief.md` + `ingest.manifest.json` → `npm run run:ingest_client_companionscpas`.

## How agents should resume work

1. **Fast compass (always):** D1 `agentsam_project_context.id = ctx_inneranimalmedia` — constraints, goals, blockers, key files.
2. **Deep runtime (semantic):** `docs_knowledge_search` or ask "IAM platform snapshot" → chunks from this doc + `iam-runtime-architecture-2026-06.md` in documents lane.
3. **Code changes:** `code_semantic_search` scoped to relevant `src/` paths — not full-repo reindex unless debugging broadly.
4. **Client work:** read client `agentsam_project_context` on client workspace + `docs/clients/{slug}/project-brief.md`.

## Current blockers (2026-06-14)

Agent mode can compile zero tools while still calling model. `list_dir`/`write_file` loopback to unwired `/api/fs/list`, `/api/fs/write`. `agent.js` ~4742 lines. Dashboard `subset-shared.chunk.js` ~737KB gzip. Multitask empty subagent edge cases. Open security audit items. MCP customer pgvector BYOK not fully proven E2E.
