# IAM Cursor / Agent context (production)

Canonical stack summary for Cursor and humans. Grounded in `wrangler.production.toml`, `worker.js` (header and routing), and `docs/autorag-knowledge/architecture/platform-stack.md`.

## Worker

- **Worker name:** `inneranimalmedia`
- **Entry:** `worker.js`
- **Compatibility:** `2026-01-20`, `nodejs_compat`
- **Routes:** `inneranimalmedia.com/*`, `www.inneranimalmedia.com/*`, `webhooks.inneranimalmedia.com/*`
- **Workers dev URL:** `https://inneranimalmedia.meauxbility.workers.dev` (see wrangler deploy output)

## Locked behavior (do not break)

- **OAuth callbacks:** `handleGoogleOAuthCallback` -> `/auth/callback/google`; `handleGitHubOAuthCallback` -> `/api/oauth/github/callback` (and related paths). Do not rewrite without explicit approval; KV `SESSION_CACHE` holds OAuth state (`connectDrive` / `connectGitHub` flags).
- **Production deploy:** `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml` (never bare `wrangler deploy` at repo root).
- **MCP worker:** `inneranimalmedia-mcp-server` deploy only from `inneranimalmedia-mcp-server/` with `npx wrangler deploy -c wrangler.toml`.

## Agent dashboard shell

- **HTML shell:** `dashboard/agent.html` loads theme early, then `shell.css`, then `/static/dashboard/agent/agent-dashboard.js?v=N` and `.css?v=N` (see grep `?v=` in `agent.html` for current N).
- **React app:** `agent-dashboard/src/AgentDashboard.jsx` — main shell (FloatingPreviewPanel, execution plan, queue, etc.); welcome commands reference D1 tables (`roadmap_steps`, `agent_recipe_prompts`, `agent_commands`, `agent_memory_index`, `workspaces`, `agent_tools`).

## Data plane (short)

- **D1:** `inneranimalmedia-business` — sessions, tools, spend, deployments, MCP registry, etc.
- **R2 buckets:** See `platform/r2-bucket-map.md` in this bucket. **DOCS_BUCKET** (`iam-docs`) holds this documentation and agent screenshots under `screenshots/agent/` (public URL base `https://docs.inneranimalmedia.com/` when DNS + R2 public access are configured).
- **AutoR:** AI Search instance `iam-autorag` (`[[ai_search]]` in wrangler); ingest bucket `autorag` (`AUTORAG_BUCKET`).

## Pre-prompt RAG (Agent chat)

- In `POST /api/agent/chat`, when `chatMode === 'agent'`, `env.AI_SEARCH_TOKEN` is set, and last user message has at least **4 words**, the worker calls Cloudflare AI Search REST:  
  `POST .../ai-search/instances/iam-autorag/search` (see `worker.js` ~7410–7451). Chunks are read from `ragData.result.chunks`, joined as text.

## Where this file lives

- **Repo:** `docs/iam-docs/cursor/IAM-CURSOR-CONTEXT.md`
- **R2:** `iam-docs` bucket key `cursor/IAM-CURSOR-CONTEXT.md`
