# InnerAnimalMedia Platform

Cloudflare-native SaaS platform and AI agent infrastructure.
Built and operated by Sam Primeaux — Lafayette, Louisiana.

---

## Current State — April 2026

The platform is mid-migration from a 30,000-line monolithic `worker.js` into a clean modular architecture. The new modular `src/` structure is live and running on Cloudflare Workers. The dashboard is a React/Vite app deployed via Cloudflare build pipelines and served from the worker.

### What is working
- `src/` modular worker running on production and sandbox
- Agent Sam `/api/agent/*` live with SSE streaming, tool loop, and D1-backed configuration
- D1, R2, KV, Durable Objects, AI bindings active
- MCP server live and auto-deploying on push to `main`
- PTY terminal bridge active at `terminal.inneranimalmedia.com`
- Local Ollama available behind Cloudflare Access at `ollama.inneranimalmedia.com`

### What is in progress
- Final cleanup of remaining legacy dashboard/static routes as pages migrate into the React app
- Continuous refinement of Agent Sam tool policies, approvals, and observability

### What is not yet done
- Full parity replacement of every legacy HTML page in `source/public/` with React pages
- Complete automation of promote/rollback workflows (human-driven promote is still enforced)

---

## Repo Info

| Item | Value |
|---|---|
| Repo root | `/Users/samprimeaux/inneranimalmedia` |
| Cloudflare tunnel | `inneranimalmedia` (2 replicas — iMac + GCP) |
| GCP tunnel VPS | `iam-tunnel` (us-central1, e2-micro, 24/7) |

---

## Infrastructure

### Workers
- `inneranimalmedia` (prod)
- `inneranimal-dashboard` (sandbox)
- `inneranimalmedia-mcp-server` (MCP, auto-deploys on push to `main`)

### R2 Buckets (bindings)
- `ASSETS` → `inneranimalmedia-assets` (public marketing)
- `DASHBOARD` → `agent-sam` (dashboard HTML + Vite bundles)
- `R2` → `iam-platform` (memory, docs, agent sessions)
- `AUTORAG_BUCKET` → `autorag` (RAG source docs)
- `DOCS_BUCKET` → `iam-docs` (screenshots, draw exports)
- `TOOLS` → `tools` (MCP tool outputs)

### KV Namespaces
- `KV` → `MCP_TOKENS` (MCP auth tokens + Vertex cache only)
- `SESSION_CACHE` → `production-KV_SESSIONS` (user sessions)

### Durable Objects
- `AGENT_SESSION` → `AgentChatSqlV1` (chat + SQLite per session)
- `IAM_COLLAB` → `IAMCollaborationSession` (real-time canvas/theme)
- `CHESS_SESSION` → `ChessRoom`

### Other bindings
- `AI` → Workers AI Catalog
- `HYPERDRIVE` → `inneranimalmedia-supabase-hyperdrive`
- `VECTORIZE` → `ai-search-inneranimalmedia-autorag`
- `MY_QUEUE` → Queue
- `PTY_SERVICE` → VPC localhost:3099 (iam-pty terminal)
- `MYBROWSER` → Browser Run

---

## Deploy Rules

- CI/CD auto-deploys on push to `production` branch (main repo)
- MCP auto-deploys on push to `main` branch
- Never use `npx wrangler deploy` directly
- Sandbox:
  - `cd agent-dashboard && npm run build:vite-only && cd .. && ./scripts/deploy-sandbox.sh`
- Promote:
  - `./scripts/promote-to-prod.sh`

---

## Tunnel

- `cloudflared` is installed as a macOS system service (auto-starts on boot)
- GCP `e2-micro` replica provides 24/7 uptime independent of the iMac
- Routes:
  - `terminal.inneranimalmedia.com` → localhost:3099
  - `ollama.inneranimalmedia.com` → localhost:11434
  - `iam-vpc` → Workers VPC localhost:3099
- Ollama CF Access:
  - Service token auth via `OLLAMA_CF_CLIENT_ID` / `OLLAMA_CF_CLIENT_SECRET`

---

## Platform Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             CLOUDFLARE EDGE                              │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                 inneranimalmedia (Worker — prod)                  │   │
│  │                                                                   │   │
│  │  src/                                                             │   │
│  │  ├── index.js          Entry point + router                        │   │
│  │  ├── api/              HTTP route handlers                          │   │
│  │  ├── tools/            Agent tool implementations                    │   │
│  │  ├── core/             Auth, responses, shells, terminal, provider  │   │
│  │  └── integrations/     OpenAI, Workers AI, Ollama, GitHub, Resend   │   │
│  │                                                                   │   │
│  │  Storage + state: D1, R2, KV, Durable Objects, Vectorize           │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                    │                          │                           │
│                    │                          │                           │
│     ┌──────────────▼──────────────┐  ┌────────▼──────────────┐           │
│     │ inneranimalmedia-mcp-server  │  │  Dashboard (React/Vite) │          │
│     │ MCP tools + bearer/OAuth     │  │  Served via worker + R2 │          │
│     └─────────────────────────────┘  └─────────────────────────┘          │
└──────────────────────────────────────────────────────────────────────────┘
                 │                           │
                 │ PTY via Cloudflare Tunnel │ Ollama via CF Access Tunnel
                 │                           │
        ┌────────▼────────┐          ┌───────▼─────────┐
        │ Local iMac + GCP │          │ Ollama (local)  │
        │ terminal bridge  │          │ qwen2.5-coder:7b│
        └──────────────────┘          └─────────────────┘
```

---

## Repository Structure

```
inneranimalmedia/
│
├── src/                          # Worker source — modular extraction from worker.js
│   ├── index.js                  # Entry point + router
│   ├── api/                      # HTTP handlers (one file per route group)
│   │   ├── agent.js              # /api/agent/* — chat, bootstrap, SSE
│   │   ├── agentsam.js           # /api/agentsam/* — config, hooks
│   │   ├── auth.js               # /api/auth/* — signin, OAuth
│   │   ├── cicd.js               # /api/cicd/* — pipeline management
│   │   ├── cicd-event.js         # /api/internal/cicd-event
│   │   ├── dashboard.js          # /api/dashboard/* — shell routing
│   │   ├── deployments.js        # /api/overview/deployments
│   │   ├── health.js             # /api/health
│   │   ├── overview.js           # /api/overview/*
│   │   ├── r2-api.js             # /api/r2/*
│   │   ├── settings.js           # /api/settings/*
│   │   ├── themes.js             # /api/themes/*
│   │   └── workspace.js          # /api/settings/workspaces
│   ├── core/
│   │   ├── auth.js               # JWT, OAuth, session validation
│   │   ├── d1.js                 # D1 query helpers
│   │   ├── durable_objects.js    # DO class definitions
│   │   ├── notifications.js      # Notification system
│   │   ├── r2.js                 # R2 CRUD via S3 API (Sig V4)
│   │   ├── responses.js          # Response helpers (json, error, stream)
│   │   ├── router.js             # Request routing
│   │   ├── session.js            # Session management
│   │   ├── shells.js             # HTML shell renderer for /dashboard/* routes
│   │   ├── terminal.js           # PTY bridge utilities
│   │   ├── themes.js             # CMS theme resolution from D1
│   │   └── provider.js           # Unified provider dispatch (OpenAI/Workers AI/Ollama/etc.)
│   ├── integrations/
│   │   ├── anthropic.js          # Claude API
│   │   ├── gemini.js             # Google Gemini
│   │   ├── openai.js             # OpenAI
│   │   ├── ollama.js             # Ollama helper(s)
│   │   ├── github.js             # GitHub API
│   │   ├── resend.js             # Email via Resend
│   │   ├── workers-ai.js         # Cloudflare Workers AI
│   │   └── hyperdrive.js         # Hyperdrive (Postgres/Supabase)
│   └── tools/
│       └── builtin/
│           └── index.js          # Builtin tool implementations
│
├── dashboard/                    # React/Vite frontend SPA
│   ├── app/                      # React source
│   ├── index.html                # Entry HTML — theme bootstrap, font preloads
│   ├── vite.config.ts            # Vite config — base assets path
│   └── package.json              # Dashboard-scoped deps (root is canonical)
│
├── source/
│   └── public/                   # Legacy static HTML pages (being replaced)
│
├── docs/
│   ├── archive/                  # Recipes, roadmaps, workflows (D1-synced)
│   └── skills/                   # Agent Sam skill definitions
│
├── worker.js                     # Legacy monolith (30k lines) — do not edit
├── wrangler.jsonc                # Sandbox worker config
├── wrangler.production.toml      # Production worker config
└── package.json                  # Root deps + build tooling
```

---

## Dashboard Pages

overview, finance, chats, mcp, cloud, time-tracking, agent,
billing, clients, tools, calendar, images, draw, meet, kanban,
cms, mail, pipelines, onboarding, user-settings, settings

---

## AI Model Tiers

- Tier 0: GPT-5.4 Nano (gate/rewriter, OpenAI)
- Tier 1: Kimi K2.6 (Workers AI edge, free)
- Tier 2: GPT-5.4 Nano (OpenAI, low cost)
- Tier 3: GPT-5.4 Mini (OpenAI, standard)
- Tier 4: GPT-5.4 (OpenAI, full power)

All tiers live in D1: `agentsam_model_tier`.

Local: Ollama `qwen2.5-coder:7b` via `ollama.inneranimalmedia.com`.

---

## CSS Token Architecture

The design system is fully CSS custom property driven. Three layers load in sequence:

1. **Inline `<script>` in `dashboard/index.html`** — reads `localStorage` and patches `:root` before first paint. No flash.
2. **`dashboard/app/inneranimalmedia.css`** — defines all `--solar-*` raw palette, semantic tokens (`--bg-*`, `--text-*`, `--border-*`), and component aliases (`--color-primary`, `--color-danger`, etc.). Loaded via Vite bundle.
3. **`applyCmsThemeToDocument()`** — fetches `GET /api/themes/active` from D1 `cms_themes` table, calls `root.style.setProperty()` for each var. Inline styles beat stylesheet rules — DB wins every time.

Rule: never hardcode hex values below the `--solar-*` layer. All components reference `var(--color-primary)`, `var(--bg-panel)`, etc. CMS overrides propagate automatically.

---

## CF Autobuild Pipeline

Build and deployment are automated via CI/CD and deploy scripts. Direct manual deploy commands are intentionally disallowed.

---

## AI Provider Routing

Provider selection is resolved at runtime from D1 (`ai_models.api_platform`) and routed through unified dispatch (Workers AI, OpenAI, Ollama, etc.). Tool policy and allow/deny behavior is governed by D1 mode configs.

---

## Secrets

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `OPENAI_API_KEY` | OpenAI API |
| `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY` | Gemini |
| `GITHUB_TOKEN` | GitHub API |
| `MCP_AUTH_TOKEN` | MCP server bearer auth |
| `PTY_AUTH_TOKEN` | PTY terminal bridge auth |
| `RESEND_API_KEY` | Email via Resend |
| `CLOUDFLARE_API_TOKEN` | Wrangler deploy + API calls |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 via S3 Sig V4 |
| `INTERNAL_API_SECRET` | Guards `/api/internal/*` |
| `DEPLOY_TRACKING_TOKEN` | Deploy pipeline telemetry |
| `OLLAMA_CF_CLIENT_ID` | Cloudflare Access service token (Ollama) |
| `OLLAMA_CF_CLIENT_SECRET` | Cloudflare Access service token (Ollama) |

All workers share the same secret values per type.
Rotation: `openssl rand -hex 32` → `wrangler secret put` on all relevant workers.

---

## Rules

- **Never use `npx wrangler deploy` directly.** Deploy through CI/CD or scripted paths only.
- **Sandbox first, always.** Build → sandbox → benchmark → promote. Never skip.
- **Promote requires explicit action.** Use `./scripts/promote-to-prod.sh`.
- **Never hardcode values.** Zero hardcoded hex, slugs, workspace IDs, or URLs below the token layer.
- **No emoji** in code, output, or interfaces.
- **`worker.js` is read-only.** Extract into `src/` incrementally. Never edit the monolith directly.

---

## Phase Roadmap

| Phase | Goal | Status |
|---|---|---|
| 0 — Build pipeline | CI/CD + scripts, assets serving | Active |
| 1 — CI/CD system | Promote + rollback workflows | In progress |
| 2 — Agent Sam refinement | Streaming, tool visualization, policy tuning | In progress |
| 3 — Public pages | Rebuild `inneranimalmedia.com` pages + CMS | Planned |
| 4 — Other apps | Meauxbility, Inner Animals, iAutodidact scaffolded | Planned |

---

## Client Projects

| Client | Worker |
|---|---|
| New Iberia Church of Christ | `new-iberia-church` |
| Pelican Peptides | `pelicanpeptides` |
| Swamp Blood Gator Guides | `swampbloodgatorguides` |
| Anything Floors | `anything-floors-and-more` |
| Paw Love Rescue | `pawlove` |

All client projects are candidates for migration to the IAM platform stack post-stabilization.

---

*InnerAnimalMedia — built at the edge, one deploy at a time.*
