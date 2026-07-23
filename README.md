# Inner Animal Media

**Read [`AGENTS.md`](AGENTS.md) first.** D1 `agentsam_rules_document` injection covers in-app Agent Sam only; Cursor, ChatGPT, and new Claude accounts still need to read `AGENTS.md` — that file is the cross-tool memory, not chat history.

Inner Animal Media is a **multi-product development platform** — not a generic dashboard application.

This repository contains four distinct layers:

| Layer | What it is |
|-------|------------|
| **Platform** | Shared infrastructure: auth, billing, Workers, D1, Supabase/Hyperdrive, R2, MCP plumbing, model routing, telemetry, deployments |
| **Workspace (Foundry)** | Private dev/ops environment at `/dashboard` — where products are incubated, tested, debugged, and matured (`dashboard/`) |
| **Agent Sam** | Branded intelligence and execution layer inherited by Workspace and products — runtime, MCP, SDK, embedded agents |
| **Products** | Independent surfaces (CMS, Create family, Movie Mode, Agent Sam as SKU, etc.) that may graduate to standalone apps |

Runtime: **Cloudflare Workers + D1 + R2 + Hyperdrive (Supabase) + PTY (iam-pty)**.

---

## Canonical doctrine

> The Workspace is where products are incubated and operated. Agent Sam is the intelligence and execution platform they inherit. Each product remains an independent surface capable of graduating into production.

> **Development topology is not product topology.**

> A route under `/dashboard/*` does not automatically represent a dashboard feature. It may be the current **incubation route** for an independent product.

> Products are independent. Infrastructure is shared.

> The Workspace may wrap a product, but it must not reshape the product.

**Do not infer a product's identity solely from its route or directory.**

---

## Critical interpretation (routes today)

| Route | Classification |
|-------|----------------|
| `/dashboard/*` shell | Workspace (Foundry) |
| `/dashboard/agent` | Agent Sam — **one interface**, not the entirety of Agent Sam |
| `/dashboard/designstudio` | Design Studio (Create family) |
| `/dashboard/draw` | Draw (Create family) |
| `/dashboard/cms/*` | CMS product |
| `/dashboard/moviemode/*` | Movie Mode product |
| `/dashboard/images` | Shared DAM capability |
| `/dashboard/database` | Workspace capability (Database Explorer) |

Full registry: [`docs/products/PRODUCT_REGISTRY.md`](docs/products/PRODUCT_REGISTRY.md) · Manifests: [`product-manifests/`](product-manifests/)

---

## Required agent reading order

Before proposing architecture, redesigning a surface, or changing product code:

1. Root `README.md` (this file)
2. [`docs/platform/PLATFORM_CONSTITUTION.md`](docs/platform/PLATFORM_CONSTITUTION.md)
3. [`docs/workspace/WORKSPACE_CONSTITUTION.md`](docs/workspace/WORKSPACE_CONSTITUTION.md)
4. [`docs/products/PRODUCT_REGISTRY.md`](docs/products/PRODUCT_REGISTRY.md)
5. Relevant product `README.md` under `docs/products/<id>/`
6. Relevant `PRODUCT_PRINCIPLES.md`
7. Relevant `AGENTSAM.md`
8. Relevant PDRs under `docs/platform/decisions/` or `docs/products/*/decisions/`
9. [`docs/shared/AGENT_RUNTIME.md`](docs/shared/AGENT_RUNTIME.md) when touching agent behavior
10. Current task and implementation code

> **Memory** holds preferences. **Documentation** holds principles. Do not guess product identity from chat history.

---

## Documentation map

| Doc | Purpose |
|-----|---------|
| [PLATFORM_CONSTITUTION.md](docs/platform/PLATFORM_CONSTITUTION.md) | Platform identity |
| [WORKSPACE_CONSTITUTION.md](docs/workspace/WORKSPACE_CONSTITUTION.md) | Foundry rules |
| [AGENT_RUNTIME.md](docs/shared/AGENT_RUNTIME.md) | What products inherit from Agent Sam |
| [PRODUCT_REGISTRY.md](docs/products/PRODUCT_REGISTRY.md) | Surface classification and maturity |
| [AUDIT_MULTI_PRODUCT_2026-07-09.md](docs/platform/AUDIT_MULTI_PRODUCT_2026-07-09.md) | Evidence-based status audit |

---

## Documentation maintenance contract

Documentation changes are part of product changes.

- Durable platform principle → `docs/platform/decisions/PDR-*.md`
- Product purpose or scope → product constitution or vision
- Runtime or deploy change → this README and `docs/platform/` ops docs
- Maturity or route change → `PRODUCT_REGISTRY.md` + `product-manifests/*.json`
- Supersede decisions explicitly — do not silently rewrite history

A task is not complete when code and canonical documentation disagree.

---

## Playbooks and active plans

**Tomorrow playbook:** [`docs/TOMORROW_2026-06-01.md`](docs/TOMORROW_2026-06-01.md)  
**Mode spine plan:** [`agentsamrefine.md`](agentsamrefine.md)  
**Active D1 daily plan:** `plan_jun01_2026_execution`

---

## Canonical facts (read first)

| Fact | Value |
|------|-------|
| **Local path** | `/Users/samprimeaux/inneranimalmedia` |
| **GitHub** | `https://github.com/SamPrimeaux/inneranimalmedia` |
| **Worker entry (only)** | `src/index.js` — `wrangler.production.toml` `main` |
| **Legacy `worker.js`** | **Removed** from repo — do not reference in new code or docs |
| **Workspace (Foundry)** | `dashboard/` (Vite → `dashboard/dist` → R2 `static/dashboard/app/`) — internal product incubator at `/dashboard/*`; not the definition of products hosted inside it |
| **D1 database** | `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) |
| **Production deploy** | `npm run deploy:full` only (see below) |
| **Sandbox deploy** | **Discontinued** — do not run `deploy-sandbox.sh` / `promote-to-prod.sh` |
| **MCP server** | Separate worker — `https://mcp.inneranimalmedia.com` (repo: `inneranimalmedia-mcp-server`) |
| **Two-repo runtime map** | [`docs/platform/iam-runtime-architecture-2026-06.md`](docs/platform/iam-runtime-architecture-2026-06.md) |

**Never use these paths or repos:**

- `inneranimalmedia-agentsam-dashboard/` — deleted  
- `~/Downloads/inneranimalmedia` — gone  
- `agent-dashboard/` — never recreate  
- `march1st-inneranimalmedia` — deleted  

**Identity in code:** Never hardcode `au_*`, `ws_*`, or `tenant_*` in `src/` or `dashboard/`. Resolve from session / OAuth / D1.

---

## Runtime contract (Agent Sam)

One chat request follows this spine (see `src/api/agent-chat-spine.js`, `src/core/runtime-profile.js`):

```
POST /api/agent/chat
  → auth + workspace
  → resolveModel (D1 agentsam_routing_arms / catalog)
  → compileModeProfile (D1 agentsam_prompt_routes + agentsam_route_requirements)
  → execution_kind (agent_tool_loop | multitask_fanout | …)
  → dispatchStream (provider from agentsam_model_catalog.api_platform)
  → runAgentToolLoop (tools from compiled allowlist only)
```

| Mode | `execution_kind` (typical) | Tools | Notes |
|------|---------------------------|-------|--------|
| **Ask** | `agent_tool_loop` | Read-biased / minimal | Q&A |
| **Plan** | `agent_tool_loop` | Plan + read | No blind writes |
| **Agent** | `agent_tool_loop` | **Must be non-empty** for repo work | Tonight: often `finalToolCount: 0` — **broken** |
| **Debug** | `agent_tool_loop` | Inspect + terminal | |
| **Multitask** | `multitask_fanout` | 3-tool RWS bundle (read/search/github) | Subagents; needs working provider stream |

**Provider dispatch** (`src/core/provider.js` + `src/integrations/*`):

| `api_platform` | Integration |
|----------------|-------------|
| `openai`, `openai_chat_completions` | `openai.js` |
| `openai_responses`, `responses` | `openai.js` |
| `anthropic`, `anthropic_messages` | `anthropic.js` — **no `temperature` in request body** |
| `gemini_api` | `gemini.js` — SSE via `alt=sse&key=…` |
| `vertex` | `vertex.js` |
| `workers_ai` | Workers AI binding |
| `cursor_sdk` | `cursor-agent.js` |

**Tool surfaces (not “166 tools for every chat”):**

- Catalog: `agentsam_tools` only (`agentsam_mcp_tools` dropped in migration 498)
- Per-route compile: `agentsam_route_requirements` + `selectAgentsamToolsForAgentChat`
- **File read (working):** `fs_read_file` → `src/core/fs-read-file.js` (Monaco buffer → PTY host path → VM workspace)
- **File list/write (broken):** `list_dir` / `write_file` still HTTP-loopback to **unwired** `/api/fs/list`, `/api/fs/write`
- **PTY:** `/workspace/{tenant_id}/{user_id}/` on iam-pty — not the operator’s Mac repo unless synced/cloned there

**Known production issues (2026-06-01):**

- Agent mode can compile **zero tools** while still calling the model  
- Gemini streaming had invalid URL (`alt=sse?key=…`) — fixed in `buildGeminiUrl`  
- Anthropic multitask: SDK `Stream` must use `Symbol.asyncIterator` path (not `getReader` SSE)  
- RWS telemetry: `agentsam_tool_call_events` FK when child `run_id` is not a Supabase UUID  
- Multitask “ok:3” can mean empty subagent output — not a successful audit  

---

## Repo layout

```
inneranimalmedia/
├── src/
│   ├── index.js              ← Production Worker (fetch + scheduled + queue)
│   ├── api/                  ← HTTP handlers (agent.js, oauth, settings, …)
│   ├── core/                 ← Auth, runtime-profile, provider dispatch, routing
│   │   ├── runtime-profile.js
│   │   ├── provider.js
│   │   └── mode-controllers/
│   ├── integrations/         ← anthropic, openai, gemini, vertex, …
│   ├── tools/                ← Catalog tool executors (fs, db, terminal, …)
│   └── cron/
├── dashboard/                ← Vite React SPA
├── migrations/               ← D1 SQL (numbered)
├── scripts/
│   └── deploy-frontend.sh    ← What deploy:full actually runs
├── docs/                     ← Operational docs
├── wrangler.production.toml
└── package.json
```

There is **no** `worker.js`, **no** `server.js`, and **no** `legacyWorker` import in `src/index.js`.

---

## Deploy

| Command | What it does |
|---------|----------------|
| `npm run deploy:full` | **Default ship.** `scripts/deploy-frontend.sh`: Vite build → R2 sync `static/dashboard/app/` → embed sitemap → `wrangler deploy` production → post-deploy hooks |
| `npm run deploy:worker` | Worker only (no R2 dashboard bundles) |
| `npm run deploy` | Wrangler deploy only — **avoid** for full product validation |

**Rules:**

- GitHub `main` auto-build deploys the **Worker** only — **not** the dashboard R2 bundle. Run `deploy:full` locally when UI chunks must match.
- Run from repo root — never `cd dashboard` for builds (`npm run build:vite-only` / `npm --prefix dashboard`).
- Confirm `pwd` is `/Users/samprimeaux/inneranimalmedia` before wrangler or D1.
- After ship: `curl -sS https://inneranimalmedia.com/health` and spot-check dashboard JS URLs (chunk 404 → run `deploy:full` again).

Optional pipelines (not part of `deploy:full` by default): codebase RAG reindex, Supabase embeddings backfill — see `package.json` `codebase-rag:*` / `reingest:*`.

---

## Common commands

```bash
npm install
npm --prefix dashboard install

npm run build:vite-only      # dashboard production build
npm run dev:dashboard        # Vite dev server
npm run deploy:full          # production ship

npm run guard:identity       # before OAuth/identity changes
node --test tests/unit/runtime-profile.test.mjs
node --test tests/unit/gemini-url.test.mjs

# D1 (remote)
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml --command "SELECT id, status FROM agentsam_plans WHERE id='plan_jun01_2026_execution'"

# Prod logs
wrangler tail inneranimalmedia
```

---

## Secret resolution

Secrets: `vault[key] ?? env[key]` — platform `env_secrets`, user `user_secrets`, Wrangler secrets for infra only (~8 keys). Never per-user Wrangler secrets.

See existing tables in prior docs for `env_secrets` key types. Never commit `.env.cloudflare`, `.dev.vars`, or raw tokens.

---

## Database (D1)

**Canonical control-plane tables use the `agentsam_*` prefix** — never abbreviate in migrations or specs (`agentsam_prompt_routes`, not `prompt_routes`).

Operational state: **D1 first** for control plane. Supabase agent data lives in schema **`agentsam`** (not `public.agentsam_*` — those tables do not exist). See `docs/platform/supabase-agentsam-schema-2026-06.md`.

**Two DB tool lanes:**

- **D1:** `d1_query` / `d1_write` / `d1_schema` → `env.DB`
- **Supabase:** `supabase_*` → Hyperdrive — not a third “generic SQL” lane

Retention: `src/core/retention.js` daily cron `00:10 UTC`.

---

## MCP server

Worker: `inneranimalmedia-mcp-server`  
Endpoint: `https://mcp.inneranimalmedia.com/mcp`  
OAuth + workspace tokens: D1-driven — see `docs/` MCP field guide and `.cursor/rules/no-hardcoded-identity-auth-protocol.mdc`.

---

## PTY / terminal

- **iam-pty** on operator Mac (PM2); tunnel via VPS  
- Auth: `X-Bridge-Key` (`AGENTSAM_BRIDGE_KEY`) — not Bearer for bridge  
- Tenant isolation: `/workspace/{tenant_id}/{user_id}/`  
- Terminal gate: `agentsam_user_policy.can_run_pty` — not `isSuperAdmin()`

**GitHub CLI on PTY / local:**

| Who | Command |
|-----|---------|
| Sam (Mac + shared GCP `iam-tunnel`) | `./scripts/install-terminal-github-cli.sh` |
| Connor / other operators (local only) | `./scripts/install-terminal-github-cli-connor.sh` |

Connor’s PAT goes in `~/.config/iam/github.env` — never repo `.env.cloudflare` or Sam’s GCP `gh` session.

---

## Agent Sam modes (Workspace)

Composer modes: **Ask | Plan | Agent | Debug | Multitask** — enum in `src/core/agent-mode.js`.

Implementation status:

- **Spine:** `executeAgentChatSpine` + `RuntimeProfile` compiler (live)  
- **Gap:** Agent route tool allowlist often empty; multitask depends on provider + RWS; docs/README truth pass in progress  

Validation after deploy:

```bash
wrangler tail inneranimalmedia
# Look for: [runtime-profile] … finalToolCount / tool_allowlist_count
#           [agent] route_contract … toolNames
```

---

## Verification

```bash
# Health
curl -sS -o /dev/null -w "%{http_code}\n" https://inneranimalmedia.com/health

# Auth pages (modular)
for path in /auth/login /auth/signup; do
  curl -sD - -o /dev/null "https://inneranimalmedia.com${path}" | head -5
done

# Identity guard
npm run guard:identity
```

---

## P0 backlog (Jun 1 2026)

Registered in D1: **`plan_jun01_2026_execution`**

1. Agent mode: non-zero compiled tools for dev tasks  
2. `fs` list/write: PTY or implement `/api/fs/*` — stop 522 loopback  
3. Gemini streaming URL + catalog `google_model_id` sanity  
4. RWS: Supabase tool_call_events FK + empty “ok” children  
5. README + top docs aligned with this file  

---

## Safety

- Do not commit secrets, `dashboard/dist`, `.wrangler`, `*.bak`, `.scratch/`  
- Do not force-push `main` without explicit approval  
- Do not hardcode identity in `src/` / `dashboard/`  
- Production ship: **`npm run deploy:full`** only  
- Health-only validation is **not** success for UI/agent features  

---

*When you change deploy or entrypoint behavior, update this README in the same PR.*
