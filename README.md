# InnerAnimalMedia Platform

Cloudflare-native SaaS platform and AI agent infrastructure.
Built and operated by Sam Primeaux — Lafayette, Louisiana.

---

## Current State — April 2026

The platform is mid-migration from a 30,000-line monolithic `worker.js` into a clean modular architecture. The new repo structure is live and building on Cloudflare. The dashboard React/Vite app is wired into the CF autobuild pipeline and receiving active development.

### What is working
- `src/` modular worker is deployed to sandbox (`sandbox.inneranimalmedia.com`)
- Vite build pipeline is wired: CF autobuild runs `cd dashboard && vite build` on every push to `main`
- `dashboard/app/` React shell is mounted and rendering — CSS token system, theme bootstrap, and `--color-primary` alias layer are complete
- `src/core/shells.js` serves the HTML shell at all `/dashboard/*` routes
- D1, R2, KV, Durable Objects, AI bindings all active on sandbox worker
- MCP server live at `mcp.inneranimalmedia.com` — 97 tools, bearer auth
- PTY terminal bridge active at `terminal.inneranimalmedia.com`

### What is in progress
- CF autobuild: Vite build succeeding, currently resolving remaining component import errors
- `dashboard/app/services/VoxelEngine.ts` — written, committed, wiring to build
- `dashboard/app/types.ts` — rewritten to match App.tsx actual usage
- `src/core/shells.js` — needs Vite asset tags added once build produces stable output
- Login redirect on sandbox — session/cookie domain issue, fix pending

### What is not yet done
- `shells.js` loading the built Vite bundle (blocked on clean build)
- Tailwind config (`tailwind.config.js`, `postcss.config.js`) for `dashboard/`
- Deploy scripts (`deploy-sandbox.sh`, `promote-to-prod.sh`) not yet in new repo
- `.github/workflows/` CI/CD not yet wired
- Several dashboard pages still served as legacy static HTML

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE EDGE                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              inneranimalmedia (Worker — src/)                │   │
│  │                                                              │   │
│  │   src/                                                       │   │
│  │   ├── index.js          Entry point + router                 │   │
│  │   ├── api/              HTTP route handlers (one per group)  │   │
│  │   ├── tools/            Agent tool implementations (97)      │   │
│  │   │   └── builtin/      browser, storage, deploy, context    │   │
│  │   ├── core/             Auth, responses, shells, terminal    │   │
│  │   └── integrations/     Anthropic, OpenAI, GitHub, Resend    │   │
│  │                                                              │   │
│  │   Bindings:                                                  │   │
│  │   ├── DB        → D1 (inneranimalmedia-business, 547 tables) │   │
│  │   ├── DASHBOARD → R2 (inneranimalmedia bucket)               │   │
│  │   ├── KV        → KV (session state, context cache)         │   │
│  │   └── DO        → Durable Objects (real-time connections)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                               │                                     │
│           ┌───────────────────┼───────────────────┐                 │
│           │                   │                   │                 │
│  ┌────────▼───────┐  ┌────────▼──────┐  ┌────────▼───────┐         │
│  │   MCP Server   │  │  R2 Buckets   │  │   D1 Database  │         │
│  │                │  │               │  │                │         │
│  │ mcp.innerani.. │  │ inneranim..   │  │ 547 tables     │         │
│  │ Bearer auth    │  │ iam-platform  │  │ AI, CICD,      │         │
│  │ 97 tools       │  │ iam-docs      │  │ deployments,   │         │
│  │ 16 categories  │  │ tools         │  │ agent memory,  │         │
│  └────────────────┘  └───────────────┘  │ cost tracking  │         │
│                                         └────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
         │                                          │
         │ PTY tunnel (iam-pty)                     │ Dashboard UI
         │                                          │
┌────────▼───────┐                       ┌──────────▼──────────┐
│  Local Mac     │                       │  React/Vite SPA     │
│  (Sam's iMac   │                       │                     │
│   Lafayette)   │                       │  dashboard/app/     │
│                │                       │  Built by CF auto-  │
│  Terminal      │                       │  build on push to   │
│  execution     │                       │  main. Assets       │
│  via PTY       │                       │  bundled into       │
│  WebSocket     │                       │  worker deployment. │
│  bridge        │                       │                     │
└────────────────┘                       └─────────────────────┘
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
│   │   └── themes.js             # CMS theme resolution from D1
│   ├── integrations/
│   │   ├── anthropic.js          # Claude API (Sonnet/Opus/Haiku)
│   │   ├── gemini.js             # Google Gemini
│   │   ├── openai.js             # OpenAI (GPT-5.4, o4-mini)
│   │   ├── github.js             # GitHub API
│   │   ├── resend.js             # Email via Resend
│   │   ├── workers-ai.js         # Cloudflare Workers AI
│   │   └── hyperdrive.js         # Hyperdrive (Postgres/Supabase)
│   └── tools/
│       └── builtin/
│           └── index.js          # 97 tool implementations
│
├── dashboard/                    # React/Vite frontend SPA
│   ├── app/                      # React source
│   │   ├── App.tsx               # Main shell — layout, routing, state
│   │   ├── index.tsx             # React root — imports CSS, mounts app
│   │   ├── index.css             # Tailwind utilities
│   │   ├── inneranimalmedia.css  # Design token system (:root CSS vars)
│   │   ├── types.ts              # Shared TypeScript types
│   │   ├── types.ts              # Shared TypeScript types
│   │   ├── components/           # All UI components
│   │   │   ├── ChatAssistant.tsx
│   │   │   ├── CommandCenter.tsx
│   │   │   ├── DatabaseBrowser.tsx
│   │   │   ├── MonacoEditorView.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── WorkspaceDashboard.tsx
│   │   │   ├── settings/         # Settings panel tabs
│   │   │   └── ...               # 20+ components
│   │   └── services/
│   │       └── VoxelEngine.ts    # Three.js 3D engine (Studio tab)
│   ├── index.html                # Entry HTML — theme bootstrap, font preloads
│   ├── vite.config.ts            # Vite config — base: /static/dashboard/agent/
│   └── package.json              # Dashboard-scoped deps (unused — see root)
│
├── source/
│   └── public/                   # Legacy static HTML pages (being replaced)
│       ├── index.html            # Landing page
│       ├── auth-signin.html
│       ├── auth-signup.html
│       ├── dashboard-agent.html  # Legacy shell (being replaced by Vite SPA)
│       └── dashboard-overview.html
│
├── docs/
│   ├── archive/                  # Recipes, roadmaps, workflows (D1-synced)
│   └── skills/                   # Agent Sam skill definitions
│
├── worker.js                     # Legacy monolith (30k lines) — do not edit
│                                 # Being extracted into src/ incrementally
├── wrangler.jsonc                # Sandbox worker config
├── wrangler.production.toml      # Production worker config
└── package.json                  # Root — all deps including vite, react, three
```

---

## CSS Token Architecture

The design system is fully CSS custom property driven. Three layers load in sequence:

1. **Inline `<script>` in `dashboard/index.html`** — reads `localStorage` and patches `:root` before first paint. No flash.
2. **`dashboard/app/inneranimalmedia.css`** — defines all `--solar-*` raw palette, semantic tokens (`--bg-*`, `--text-*`, `--border-*`), and component aliases (`--color-primary`, `--color-danger`, etc.). Loaded via Vite bundle.
3. **`applyCmsThemeToDocument()`** — fetches `GET /api/themes/active` from D1 `cms_themes` table, calls `root.style.setProperty()` for each var. Inline styles beat stylesheet rules — DB wins every time.

Rule: never hardcode hex values below the `--solar-*` layer. All components reference `var(--color-primary)`, `var(--bg-panel)`, etc. CMS overrides propagate automatically.

---

## CF Autobuild Pipeline

Every push to `main` triggers:

```
bun install (root package.json)
    │
    ▼
cd dashboard && ../node_modules/.bin/vite build
    │
    ▼
dashboard/dist/ bundled into worker deployment via wrangler.jsonc assets binding
    │
    ▼
npx wrangler deploy → sandbox.inneranimalmedia.com
```

Build command: `cd dashboard && ../node_modules/.bin/vite build`
Deploy command: `npx wrangler deploy`
Assets binding: `"assets": { "directory": "./dashboard/dist" }`

---

## AI Provider Routing

```
T0   Workers AI (env.AI)   → free, embeddings, lightweight inference
T1   Gemini Flash-Lite     → 10x cheaper than Haiku, paid tasks
T1.5 Claude Haiku          → conversational tasks
T2   Claude Sonnet 4.6     → complex reasoning
T3   Claude Opus 4.6       → maximum capability
```

Routing managed via `ai_routing_rules` and `agentsam_ai` D1 tables. `classifyIntent()` routes by keyword at request time. `filterToolsByIntent()` reduces tool payload per request.

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

All three workers (sandbox, production, MCP) share the same secret values per type.
Rotation: `openssl rand -hex 32` → `wrangler secret put` on all three.

---

## Rules

- **Never deploy to production autonomously.** `promote-to-prod.sh` requires explicit human execution. No exceptions.
- **Never hardcode values.** Zero hardcoded hex, slugs, workspace IDs, or URLs below the token layer. Everything resolves from Git, D1, env vars, or CSS custom properties.
- **No emoji** in code, output, or interfaces.
- **No `npm run deploy` alone** — skips frontend. Use deploy scripts when available.
- **Sandbox first, always.** Build → sandbox → benchmark → promote. Never skip.
- **`worker.js` is read-only.** Extract into `src/` incrementally. Never edit the monolith directly.

---

## Phase Roadmap

| Phase | Goal | Status |
|---|---|---|
| 0 — Build pipeline | CF autobuild + Vite wired, assets serving | In progress |
| 1 — CI/CD system | Agent Sam can deploy, promote, rollback autonomously | Planned |
| 2 — Agent Sam refinement | Streaming, tool visualization, decision matrix | Planned |
| 3 — Public pages | All `inneranimalmedia.com` pages rebuilt + CMS connected | Planned |
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
*InnerAnimalMedia — built at the edge, one deploy at a time.*
  
