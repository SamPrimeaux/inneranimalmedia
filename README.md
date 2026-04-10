# InnerAnimalMedia Platform

> Cloudflare-native SaaS platform and AI agent infrastructure.  
> Built and operated by Sam Primeaux — Lafayette, Louisiana.

---

## What This Is

InnerAnimalMedia (IAM) is a full-stack SaaS platform built entirely on Cloudflare's
developer stack. It serves two purposes simultaneously:

1. **Internal tooling** — Agent Sam, the IAM dashboard, and the CICD pipeline are
   the tools Sam uses to build and operate client projects day-to-day.

2. **Offered product** — the platform itself is the product. Agent Sam and the MCP
   tool layer are the first services available to outside users.

There are no external servers. No VPCs. No Docker containers. Everything runs on
Cloudflare Workers at the edge.

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE EDGE                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   inneranimalmedia (Worker)                  │   │
│  │                                                              │   │
│  │   src/                                                       │   │
│  │   ├── api/          HTTP route handlers                      │   │
│  │   ├── tools/        Agent tool implementations (97 tools)    │   │
│  │   │   └── builtin/  browser, storage, deploy, context...     │   │
│  │   ├── core/         Auth, responses, terminal utils          │   │
│  │   └── integrations/ Resend, GitHub, CloudConvert, Drive      │   │
│  │                                                              │   │
│  │   Bindings:                                                  │   │
│  │   ├── DB        → D1 (inneranimalmedia-business, 547 tables) │   │
│  │   ├── DASHBOARD → R2 (agent-sam — dashboard assets)         │   │
│  │   ├── KV        → KV (session state, context cache)         │   │
│  │   └── DO        → Durable Objects (real-time connections)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                               │                                     │
│           ┌───────────────────┼───────────────────┐                 │
│           │                   │                   │                 │
│  ┌────────▼───────┐  ┌────────▼──────┐  ┌────────▼───────┐         │
│  │   MCP Server   │  │  R2 Buckets   │  │   D1 Database  │         │
│  │                │  │               │  │                │         │
│  │ mcp.innerani.. │  │ agent-sam     │  │ 547 tables     │         │
│  │ Bearer auth    │  │ agent-sam-sb  │  │ AI, CICD,      │         │
│  │ 97 tools       │  │ autorag       │  │ deployments,   │         │
│  │ 16 categories  │  │ iam-platform  │  │ agent memory,  │         │
│  └────────────────┘  └───────────────┘  │ cost tracking  │         │
│                                         └────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
         │                                          │
         │ PTY tunnel (iam-pty)                     │ Dashboard UI
         │                                          │
┌────────▼───────┐                       ┌──────────▼──────────┐
│  Local Mac     │                       │  React/Vite SPA     │
│  (Sam's dev    │                       │                     │
│   machine)     │                       │  /dashboard/agent   │
│                │                       │  /dashboard/mcp     │
│  Terminal      │                       │  /dashboard/cloud   │
│  execution     │                       │  /dashboard/...     │
│  via PTY       │                       │                     │
│  WebSocket     │                       │  Served from R2     │
│  bridge        │                       │  via Worker         │
└────────────────┘                       └─────────────────────┘
```

---

## Repository Structure

```
inneranimalmedia/
│
├── src/                          # Worker source (modular — extracted from monolith)
│   ├── index.js                  # Entry point + router
│   ├── api/                      # HTTP handlers (one file per route group)
│   │   ├── agent.js              # /api/agent/* — chat, bootstrap, SSE
│   │   ├── cicd-event.js         # /api/internal/cicd-event — deploy lifecycle
│   │   ├── git-status.js         # /api/internal/git-status — branch/commit data
│   │   └── post-deploy.js        # /api/internal/post-deploy — knowledge sync
│   ├── tools/                    # 97 tool implementations
│   │   └── builtin/
│   │       ├── agent.js          # agentsam_* tools
│   │       ├── browser.js        # cdt_*, browser_*, playwright_*
│   │       ├── context.js        # context_*, rag_search, knowledge_search
│   │       ├── deploy.js         # worker_deploy, list_workers, get_deploy_command
│   │       ├── integrations.js   # resend_*, cf_images_*, gdrive_*, github_*
│   │       ├── media.js          # imgx_*, meshyai_*, voxel_*, excalidraw_*
│   │       ├── platform.js       # platform_info, list_clients, a11y_*
│   │       ├── storage.js        # r2_*, workspace_*, get_r2_url
│   │       ├── telemetry.js      # telemetry_log/query/stats
│   │       └── workflow.js       # workflow_run_pipeline, generate_*
│   └── core/
│       ├── auth.js               # JWT, OAuth, session validation
│       ├── responses.js          # Response helpers (json, error, stream)
│       └── terminal.js           # PTY bridge utilities
│
├── agent-dashboard/              # React/Vite frontend SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── panels/           # SourcePanel, FilePanel, TerminalPanel
│   │   │   └── ...
│   │   └── pages/
│   │       ├── WorkspaceDashboard.tsx   # /dashboard/agent — main agent UI
│   │       ├── McpDashboard.tsx         # /dashboard/mcp
│   │       └── ...
│   └── dist/                     # Built output → uploaded to R2
│
├── dashboard/                    # Static HTML shells (being unified)
│   ├── agent.html                # Shell served from R2 → loads Vite SPA
│   └── iam-workspace-shell.html
│
├── static/                       # Static assets
│   └── dashboard/
│       └── shell.css
│
├── scripts/                      # CICD and tooling scripts
│   ├── deploy-sandbox.sh         # Build → R2 upload → prune → sandbox worker deploy
│   ├── promote-to-prod.sh        # Sandbox → prod R2 → prod worker deploy
│   ├── benchmark-full.sh         # 31/31 quality gate (must pass before promote)
│   ├── e2e-smoke-test.sh         # End-to-end validation (coming soon)
│   └── lib/
│       ├── cicd-d1-log.sh        # D1 logging helpers
│       └── with-cloudflare-env.sh
│
├── wrangler.jsonc                 # Sandbox worker config
├── wrangler.production.toml      # Production worker config (do not edit without approval)
└── package.json
```

---

## Products & Services

### Agent Sam
The primary product. An AI agent with 97 tools across 16 categories, accessible
via the dashboard at `/dashboard/agent` or via MCP.

Agent Sam can:
- Deploy Cloudflare Workers, manage R2/D1/KV
- Execute terminal commands via PTY tunnel
- Write and query D1 databases
- Browse the web and interact with live Chrome via CDP
- Generate images, 3D models, and voxel scenes
- Search the IAM knowledge base and RAG index
- Send email via Resend, interact with Google Drive and GitHub

Tools are filtered at runtime by mode and intent — not all 97 load simultaneously.
Tools marked `requires_approval=1` pause for human confirmation before executing.

**Status:** Active. First offered service.

### MCP Server
Live at `mcp.inneranimalmedia.com/mcp`. Bearer token auth via `MCP_AUTH_TOKEN`.
Exposes the full IAM tool registry to any MCP-compatible client (Claude Desktop,
Cursor, custom integrations).

Tool categories available via MCP: agent, browser, context, db, deploy, email,
file_conversion, github, integrations, media, platform, quality, storage,
telemetry, terminal, ui, workflow.

**Status:** Active.

### Dashboard / IAM Workspace
The web interface for interacting with Agent Sam and managing the platform.

Entry point: `inneranimalmedia.com/dashboard/overview`

Key pages:
- `/dashboard/agent`    — Agent Sam chat + workspace IDE
- `/dashboard/mcp`      — Parallel agent operations (Architect/Builder/Tester/Operator)
- `/dashboard/cloud`    — Cloudflare infrastructure management
- `/dashboard/database` — D1 query interface
- `/dashboard/images`   — Cloudflare Images management
- `/dashboard/draw`     — Excalidraw diagramming
- `/dashboard/meet`     — (planned)
- `/dashboard/mail`     — Email management via Resend

**Note:** `/dashboard/agent` is one page of the application, not the application
itself. The shell/nav is being unified across all pages — currently some pages
still have their own isolated HTML navigation.

**Status:** Active, shell unification in progress.

---

## Infrastructure

### Cloudflare Stack
| Service | Usage |
|---|---|
| Workers | Primary runtime — all server-side logic |
| D1 | Main database (`inneranimalmedia-business`, 547 tables) |
| R2 | Asset storage (`agent-sam` prod, `agent-sam-sandbox-cicd`, `autorag`) |
| KV | Session state, context cache, feature flags |
| Durable Objects | Real-time WebSocket connections |
| Workers AI | T0 inference tier (free, used for embeddings and RAG) |
| Cloudflare Images | Client and platform image hosting |

### PTY Tunnel (iam-pty)
Allows Agent Sam to execute real terminal commands on Sam's local Mac.
Architecture: local Node.js PTY process → WebSocket → `iam-pty` Cloudflare Worker → Worker tool handler.
Auth: `PTY_AUTH_TOKEN` secret.
Repo: `github.com/SamPrimeaux/iam-pty`

### AI Providers (three-tier routing)
```
T0  Workers AI          → free, fast, embeddings + lightweight inference
T1  Gemini Flash-Lite   → 10x cheaper than Haiku, paid tasks
T1.5 Claude Haiku       → conversational tasks
T2  Claude Sonnet       → complex reasoning
T3  Claude Opus         → maximum capability
```
Provider routing is managed via `ai_routing_rules` and `agentsam_ai` D1 tables.

---

## CICD Pipeline

```
git push
    │
    ▼
deploy-sandbox.sh
    ├── npm ci + vite build
    ├── R2 upload (manifest-based, typed content headers)
    ├── R2 prune (manifest diff → delete stale chunks)
    ├── Worker deploy (inneranimal-dashboard)
    ├── Health check
    ├── POST /api/internal/cicd-event (post_sandbox)
    └── Resend notification
    │
    ▼
benchmark-full.sh (31/31 gate — must pass)
    │
    ▼
promote-to-prod.sh
    ├── Pull assets from sandbox R2
    ├── Push to production R2 (agent-sam)
    ├── Worker deploy (inneranimalmedia)
    ├── Health check
    ├── POST /api/internal/cicd-event (post_promote)
    ├── D1 deployment record
    └── Resend notification
```

Every deploy writes to: `deployments`, `tracking_metrics`, `deployment_health_checks`,
`agentsam_hook_execution` (post_deploy hooks), `project_storage` (R2 stats).

**Rule:** Never deploy to production autonomously. `promote-to-prod.sh` requires
explicit human execution. No exceptions.

---

## Secrets

Four secrets are required across all three workers (sandbox, production, MCP):

| Secret | Purpose |
|---|---|
| `INTERNAL_API_SECRET` | Guards all `/api/internal/*` endpoints |
| `INTERNAL_WEBHOOK_SECRET` | HMAC validation for incoming webhooks (GitHub, Resend) |
| `DEPLOY_TRACKING_TOKEN` | Scoped to deploy pipeline telemetry writes |
| `INGEST_SECRET` | Guards RAG/knowledge base ingest endpoints |

Each secret has an independent value. All three workers share the same value
per secret type. Rotation: `openssl rand -hex 32`, push to all three workers via
`wrangler secret put`, update `~/.zshrc`.

Additional secrets: `MCP_AUTH_TOKEN`, `PTY_AUTH_TOKEN`, `RESEND_API_KEY`,
`ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`.

---

## Known Issues / Active Work

### Login redirect on sandbox
Sandbox redirects to homepage instead of staying authenticated on entry.
Root cause: session validation / cookie domain issue on
`inneranimal-dashboard.meauxbility.workers.dev`.
Fix in progress — same sprint as shell unification.

### Shell unification
Most dashboard pages still have isolated HTML navigation.
Goal: single unified shell/nav component rendered consistently across all
`/dashboard/*` routes. Once auth/session is stable, shell standardization
is the next major frontend sprint.

### Worker.js modularization
The production worker.js (~30k lines) is being extracted into `src/` modules.
Strategy: extract leaf if-blocks one at a time. Never move `handleAgentApi`
wholesale. Register new modules via Agent Sam after writing.
Current state: tools routing, API handlers, and core utilities partially extracted.

---

## Client Projects

The same platform powers client sites built and maintained under IAM:

- **New Iberia Church of Christ** — `new-iberia-church` worker
- **Pelican Peptides** — `pelicanpeptides` worker  
- **Swamp Blood Gator Guides** — `swampbloodgatorguides` worker
- **Anything Floors** — `anything-floors-and-more` worker
- **Paw Love Rescue** — `pawlove` worker

All client projects are candidates for migration to the IAM platform stack
as it stabilizes.

---

## Roadmap

| Milestone | Status |
|---|---|
| CICD pipeline stabilization | In progress |
| Shell / nav unification | Planned |
| Auth / login session fix (sandbox) | In progress |
| E2E smoke test (`e2e-smoke-test.sh`) | Next sprint |
| Source panel (`SourcePanel.tsx`) | In progress |
| Agent Sam — public offering | Pending platform stabilization |
| Clean monorepo migration | Post-E2E validation |
| InnerAutodidact — learning platform | After Agent Sam launch |

---

## Development

```bash
# Install
cd agent-dashboard && npm ci

# Sandbox deploy (build + R2 + worker)
./scripts/deploy-sandbox.sh

# Skip rebuild, worker only
./scripts/deploy-sandbox.sh --worker-only

# Quality gate
./scripts/benchmark-full.sh

# Promote to production (human-initiated only)
./scripts/promote-to-prod.sh

# Check sandbox
curl -s https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent \
  | grep -o 'dashboard-v:[0-9]*'
```

---

*InnerAnimalMedia — built at the edge, one deploy at a time.*
