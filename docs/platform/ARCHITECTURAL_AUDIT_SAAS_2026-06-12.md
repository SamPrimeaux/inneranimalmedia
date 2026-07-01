# Architectural Audit — Inner Animal Media SaaS

**Date:** 2026-06-12  
**Updated:** 2026-07-01 — §1, §5.3, §8: `services.inneranimalmedia.com` deployed (`inneranimalmedia-pwa-services`); §5.3 bindings added.  
**Worker version (last deploy):** `905d40c0-44c6-4755-afa3-5ee364fc6ab8` · git `36fb1730`  
**Supersedes for ops:** stale sections in `docs/ARCHITECTURAL_AUDIT.md` (pre-`src/` layout) — use **this doc** + linked platform docs.

**Related SSOT:** [AgentSamQUADMODE.md](../AgentSamQUADMODE.md) · [iam-surface-delegation-plan-2026-06.md](./iam-surface-delegation-plan-2026-06.md) · [iam-runtime-architecture-2026-06.md](./iam-runtime-architecture-2026-06.md) · [deploy-architecture-v3.md](../deploy-architecture-v3.md)

---

## 1. Platform at a glance

Inner Animal Media is a **multi-tenant AI operations platform** on Cloudflare Workers: dashboard SPA, public marketing site, Agent Sam (in-app), MCP OAuth bridge (external clients), MovieMode, PWA services companion, terminal/PTY lanes, and a D1-first `agentsam_*` control plane (~577 tables).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION SURFACES                                  │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│ CORE         │ MOVIE        │ MCP bridge   │ PWA companion│ PTY (not Worker)│
│ inneranimal  │ moviemode-   │ mcp.*        │ services.*   │ iam-pty :3099   │
│ media.com    │ service.*    │ inneranimal  │ inneranimal  │ via CF Tunnels  │
│              │              │ media.com    │ media.com    │                 │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴────────┬────────┘
       │              │              │              │                │
       └──────────────┴──────────────┴──────────────┴────────────────┘
                                    │
                    D1 inneranimalmedia-business (SSOT)
                    R2 inneranimalmedia (SPA + public pages)
                    Supabase agentsam schema (pgvector mirror)
```

| Surface | Repo | Deploy | Owns D1 truth? |
|---------|------|--------|----------------|
| Core worker | `SamPrimeaux/inneranimalmedia` | `npm run deploy:full` | **Yes** |
| MovieMode worker | `SamPrimeaux/moviemode-service` (submodule `services/moviemode-service`) | `npx wrangler deploy` in service dir | No — core APIs today |
| MCP worker | `SamPrimeaux/inneranimalmedia-mcp-server` | `npm run deploy:full` in MCP repo | No — reads same D1 catalog |
| PTY shell | `SamPrimeaux/iam-pty` → `~/iam-pty` | `pm2 restart iam-pty` | No — session verify via core |
| CMS editor (Python) | `SamPrimeaux/agentsam-cms-editor` | `pywrangler deploy` | No — R2 `cms-editor/` + D1 metadata via core |
| PWA services companion | `services.inneranimalmedia.com` · Worker `inneranimalmedia-pwa-services` | `SamPrimeaux/iam-pwa-services` → `~/iam-pwa-services` · CF Builds: `npm run build` + `bash scripts/cf-builds-deploy.sh` | No — PWA manifest / push / deploy ingest only |

**Golden rules**

1. In-app Agent Sam **never** routes through MCP.
2. `agentsam_tools` / `agentsam_workflows` in D1 are the tool/workflow SSOT — not hardcoded tool names in hot paths.
3. Three deploy paths **must not be mixed**: dashboard SPA (R2), public pages (R2), worker (`deploy:full`).
4. Two DB lanes: D1 (`env.DB`) vs Postgres via Hyperdrive — never Postgres through D1.

---

## 2. Build & deploy architecture

### 2.1 Three deploy paths

| Path | When | Build | Target | Record |
|------|------|-------|--------|--------|
| **1 — Dashboard SPA** | `dashboard/**` React/TS | `dashboard` Vite build via `deploy:full` | R2 `dashboard/app/*` | `deployments` row |
| **2 — Public pages** | Marketing HTML, auth shells | Often none; upload scripts | R2 `pages/*`, `auth/*`, `assets/*` | Per script |
| **3 — Worker** | `src/**`, wrangler, crons | esbuild via wrangler | Cloudflare Worker `inneranimalmedia` | version id + deploy proof |

**Canonical prod command:** `npm run deploy:full` → `scripts/deploy-frontend.sh` (Vite + R2 sync + wrangler deploy + lane registry sync).

**Never** `npm run deploy` alone for production ship.

### 2.2 Worker entry & routing

| Layer | File | Role |
|-------|------|------|
| Entry | `src/index.js` | Session priming, marketing `ASSET_ROUTES`, dashboard auth gate, webhooks, collab DO, then dispatch |
| API router | `src/core/production-dispatch.js` | **All new `/api/*` routes** |
| Dashboard assets | `src/core/dashboard-r2-assets.js` | SPA shell from R2 |

**Request order (simplified):**

```
/api/*, /mcp, webhooks → handlers
/sitemap, /qualityreport → public-pages/*
ASSET_ROUTES → R2 ASSETS (+ CMS hydrate on /contact)
/dashboard/* → auth gate → SPA shell
else → 404 or redirects
```

### 2.3 Production bindings (core)

From `wrangler.production.toml` (verify with `npm run verify:wrangler-production`):

| Binding | Resource |
|---------|----------|
| `DB` | D1 `inneranimalmedia-business` |
| `ASSETS` | R2 `inneranimalmedia` |
| `ARTIFACTS` | R2 `artifacts` |
| `AUTORAG_BUCKET` | R2 `inneranimalmedia-autorag` |
| `HYPERDRIVE` | Supabase pooler |
| `AGENTSAM_VECTORIZE_*` | 6 Vectorize indexes (5× OpenAI 1536 + 1× Gemini media) |
| `MOVIEMODE_SERVICE` | Service binding → `moviemode-service` worker |
| `PTY_SERVICE` | Workers VPC → `localhost:3099` (iam-vpc tunnel route) |
| `IAM_COLLAB`, `AGENT_SESSION`, … | Durable Objects |
| `MYBROWSER`, `AI`, `KV`, `SESSION_CACHE` | Browser, Workers AI, KV |

---

## 3. Frontend ↔ backend contracts

### 3.1 Transport & auth

| Concern | Contract |
|---------|----------|
| Origin | Same-origin — dashboard served by worker |
| Session | HttpOnly `session` cookie |
| Fetch | `credentials: 'same-origin'` on all dashboard API calls |
| Identity | **Never** trust `workspace_id` / `tenant_id` from client body for auth — `resolveRequestContext` + `requireDashboardIdentity()` |
| Bootstrap | `GET /api/auth/me` → `GET /api/config/client` → `GET /api/settings/workspaces` → `GET /api/themes/active` |

**Key client files:** `dashboard/src/context/WorkspaceContext.tsx`, `dashboard/src/lib/supabase.ts`, `dashboard/src/applyCmsTheme.ts`

### 3.2 Bootstrap & persisted state

| Store | Table / mechanism | Server |
|-------|-------------------|--------|
| Terminal session, UI prefs | `agentsam_bootstrap` | `src/core/bootstrap.js` |
| Workspace list | `agentsam_workspace` + `workspace_members` | `src/core/workspace-access.js` |
| Theme | `cms_themes` + `cms_theme_preferences` | `src/core/cms-theme-resolve.js` |
| User policy | `agentsam_user_policy` (`can_run_pty`, `platform_operator`, …) | terminal + MCP gates |

### 3.3 API surface map (core)

Grouped by `production-dispatch.js` prefix:

| Prefix | Module | Dashboard consumer |
|--------|--------|-------------------|
| `/api/auth/*` | `auth.js`, `auth-me.js` | Login, session |
| `/api/agent/*`, `/api/chat/*` | `agent.js` | Agent Sam, DO chat |
| `/api/terminal/*` | `terminal.js` + `src/core/terminal.js` | `XTermShell.tsx` |
| `/api/settings/*` | `settings.js` | Settings sections |
| `/api/workspaces/*` | `workspaces.js`, `workspace.js` | Workspace switcher |
| `/api/cms/*` | `cms.js` | Planned `/dashboard/cms` |
| `/api/public/cms` | `cms-public.js` | Public hydration |
| `/api/themes/*` | `themes.js` | Live CSS vars |
| `/api/moviemode/*` | `moviemode-api.js` | `MovieModePage`, studio |
| `/api/agentsam/*` | `agentsam.js` | Workflows, plans, skills |
| `/api/mcp/*`, `/mcp` | `mcp.js` | MCP dashboard panel; JSON-RPC proxy |
| `/api/d1/*` | `d1-dashboard.js` | Database browser |
| `/api/catalog-invoke` | `catalog-invoke-handler.js` | Tool dispatch (in-app) |

**Pre-dispatch only in `index.js`:** `/api/health`, webhooks, `/api/agent/execute`, `/api/agent/approve`, MCP token mint, collab room DO.

### 3.4 Agent tool execution contract

```
POST /api/mcp/catalog-invoke  (or /api/agent/catalog-invoke)
  → getAuthUser()
  → userIsPlatformOperator() for isOperatorCall
  → dispatchByToolCode(env, tool_name, args, { workspaceId, userId, tenantId, authUser })
  → loadAgentsamToolRow() from D1
  → executeCatalogTool() by handler_type (terminal, d1, workflow, …)
```

**Operator-only terminal tools:** `agentsam_terminal_local`, `agentsam_terminal_remote` (migration 622 + `platform-operator-policy.js`).

### 3.5 WebSocket contracts

| Endpoint | Purpose | Client |
|----------|---------|--------|
| Agent chat DO | Streaming agent + tool calls | Agent panel |
| `/api/terminal/*` → AgentChat DO | PTY broker | `TerminalSessionPane.tsx` |
| Collab DO | Canvas / room | Design studio |

PTY DO uses `https://` fetch for outbound WSS upgrade (`toFetchWebSocketUrl` in `AgentChat.js`).

---

## 4. Public pages & CMS

### 4.1 Public routes (R2 + worker)

Defined in `src/index.js` `ASSET_ROUTES`:

| URL | R2 key | Notes |
|-----|--------|-------|
| `/` | `pages/home/index.html` | Home |
| `/about`, `/services`, `/pricing`, `/terms`, `/privacy` | `pages/*/index.html` | Marketing |
| `/work` | `pages/work/index.html` | Globe scene + `data-cms-section` markers |
| `/contact` | `pages/contact/index.html` | **D1 hydrate** at edge (`cms_page_sections`) |
| `/games`, `/games/room_*` | `pages/games/*` | Games lobby |
| `/auth/login`, `/signup`, `/reset` | `pages/auth/*.html` | Auth shells → dashboard |
| `/learn` | `learn.html` | Learn platform entry |
| `/sitemap`, `/sitemap.xml` | `src/public-pages/sitemap-route.js` | Generated + fallback HTML |

**Shell injection:** `src/core/public-html-shell.js` — iam-header/footer from R2 partials.

### 4.2 CMS data model (D1 + R2)

| Table | Role |
|-------|------|
| `cms_pages` | Page metadata, `route_path`, tenant/workspace scope |
| `cms_page_sections` | Section JSON per page (contact hero, work blocks) |
| `cms_section_components` | Component graph |
| `cms_themes` | Theme packages, CSS vars, terminal personality |
| `cms_theme_preferences` | User/workspace theme slug |
| `cms_assets` | Design studio / CAD / media refs |
| `cms_navigation_menus` | Nav structure |

**Content split:** D1 = metadata + section JSON; R2 = published HTML at `cms/{workspace_id}/{project_id}/{slug}/published.html` and marketing `pages/*`.

**Public read API (no auth):** `GET /api/public/cms/page-sections?route=/contact`

**Agent tools:** `agentsam_cms_read|write|publish` in `agentsam_tools`.

### 4.3 CMS roadmap (planned)

From `iam-surface-delegation-plan-2026-06.md` §4:

| Route | Purpose |
|-------|---------|
| `/dashboard/cms` | Page list, publish status |
| `/dashboard/cms/editor/:pageId` | Section editor |
| `/dashboard/cms/preview/:route` | Draft preview |
| `/dashboard/agent` | **No CMS chrome** — execution only |

**Publish flow (target):**

```
Editor → PATCH /api/cms/sections → POST /api/cms/publish
  → R2 pages/work/index.html (+ cache)
Public /work → ASSET_ROUTES + optional section hydrate (contact pattern)
```

**Shipped contact CMS:** migrations `610`–`614`; worker hydrates via `cms-contact-hydrate.js`.

**Separate CMS workers:** `agentsam-cms-editor` (Python, `pywrangler deploy`) — Design Studio at `agentsam-cms-editor.meauxbility.workers.dev`; R2 prefix `cms-editor/` on `cms` bucket. Not in monorepo hot path.

---

## 5. Satellite workers — today & target

### 5.1 moviemode-service

| | Today | Target |
|--|-------|--------|
| **Repo** | `services/moviemode-service` (git submodule) | Same |
| **URL** | `moviemode.inneranimalmedia.com` | Same |
| **Binding** | `env.MOVIEMODE_SERVICE` on core | Same |
| **Serves** | Globe landing (`public/`), legacy `/meaux*` routes | + optional encode webhook offload (phase B) |
| **Core keeps** | `/dashboard/moviemode`, all `/api/moviemode/*`, D1, auth | Session mint + D1 writes always on core |

**Core proxy:** `/globe` can `fetch` via `MOVIEMODE_SERVICE`.

**MovieMode render:** Remotion export on core → `PTY_SERVICE.fetch('http://localhost:3099/exec')` or fallback `https://terminal.inneranimalmedia.com/exec`.

### 5.2 inneranimalmedia-mcp-server

| | Detail |
|--|--------|
| **URL** | `mcp.inneranimalmedia.com` |
| **Clients** | Cursor, Claude, ChatGPT OAuth |
| **Catalog** | Same D1 `agentsam_tools` (+ OAuth allowlist tables) |
| **Execution** | Mostly **local on MCP worker**; `proxyToMainWorker` for fallbacks |
| **Terminal** | `mcp-terminal-exec.js` → POST `https://{host}/exec` on PTY tunnel hostnames |
| **Secrets** | `PTY_AUTH_TOKEN` synced via `install-terminal-tunnel-env.sh` |

**Main worker `/mcp` POST:** proxies JSON-RPC to MCP worker (tools/list schemas live there).

**In-app path:** `catalog-invoke-handler.js` on core — **not** through MCP worker.

### 5.3 services.inneranimalmedia.com

| | Detail |
|--|--------|
| **URL** | `services.inneranimalmedia.com` |
| **Worker** | `inneranimalmedia-pwa-services` |
| **Repo** | `SamPrimeaux/iam-pwa-services` → `~/iam-pwa-services` (`ws_iam_pwa_services` in D1) |
| **Deploy** | Cloudflare Workers Builds on `main`: build `npm run build`, deploy/version `bash scripts/cf-builds-deploy.sh` |
| **Role** | PWA control plane — `/sw/manifest.json` mirror, Web Push, `GET /api/health`, deploy ingest — **not** dashboard SPA |
| **D1 truth** | No — binds shared `inneranimalmedia-business` for companion rows only (push subs, manifest metadata) |
| **Integration** | Dashboard SW polls manifest (`registerServiceWorker.ts`); main `deploy:full` can POST `/api/deploy/ingest` (`scripts/post-services-sw-manifest-ingest.mjs`) |

**Production bindings** (`inneranimalmedia-pwa-services`):

| Binding | Resource | Role |
|---------|----------|------|
| `ASSETS` | Workers Assets | Hub static shell, `/sw/*` publish surface |
| `DB` | D1 `inneranimalmedia-business` | Shared platform DB — companion tables only |
| `SW_MANIFEST_KV` | KV `SW_MANIFEST_KV` | Manifest tier cache, `cache_bust` coordination |

**Runtime env (production):** `MAIN_APP_ORIGIN=https://inneranimalmedia.com`, `ENVIRONMENT` / `DEPLOY_ENV=production`. Secrets: `PUSH_SERVICE_TOKEN`, `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`.

**Origin law:** Service Workers are origin-scoped — primary dashboard SW stays on `inneranimalmedia.com`; this worker publishes cross-origin metadata the main SW consumes.

Scaffold/history: `docs/platform/scaffolds/iam-pwa-services-README.md`.

---

## 6. Terminal / tunnel / MCP end-to-end

### 6.1 Four PTY lanes (+ VPC)

| Lane | Hostname | Tunnel | `target_type` | cwd | Who |
|------|----------|--------|---------------|-----|-----|
| **1 Local** | `localpty.inneranimalmedia.com` | **samsmac** | `user_hosted_tunnel` | `host_default` → Sam repo | Sam (`conn_mac_local`) |
| **2 Cloud** | `terminal.inneranimalmedia.com` | **inneranimalmedia** | `platform_vm` | `host_default` (operators) | Sam splash cloud |
| **3 Sandbox** | `sandboxterminal.inneranimalmedia.com` | **inneranimalmedia** | `sandbox` | `platform_workspace` | Sam sandbox + **Connor** (`conn_connor_primary`) |
| **4 VPC** | `iam-vpc` (private) | **inneranimalmedia** | — | via `PTY_SERVICE` binding | Headless `/exec`, MovieMode |

**Process:** `iam-pty` `server.js` on **port 3099** (Mac PM2 + GCP `iam-tunnel` VM).

**Mac tunnel rule:** LaunchDaemon = samsmac only; inneranimalmedia = user LaunchAgent (`install-inneranimalmedia-tunnel-mac.sh`).

### 6.2 D1 resolution law

```sql
SELECT * FROM terminal_connections
WHERE user_id = ? AND workspace_id = ? AND is_active = 1
ORDER BY is_default DESC, target_priority ASC, updated_at DESC
LIMIT 1;
```

Never sort by `is_default` alone.

### 6.3 Connor isolation (migration 622, deployed)

| Control | Value |
|---------|-------|
| `conn_connor_primary` | `wss://sandboxterminal.inneranimalmedia.com`, `sandbox` |
| `platform_operator` | `0` for Connor; `1` for Sam tenant superadmins |
| Mac `ALLOWED_TENANTS` | `tenant_sam_primeaux` only |
| MCP terminal tools | Gated `platform_operator_required` |

### 6.4 Env SSOT (iam-pty)

```
~/inneranimalmedia/.env.cloudflare  (SSOT, gitignored)
    ↳ symlink ~/iam-pty/.env.cloudflare
~/iam-pty/.env                      (overrides: ALLOWED_TENANTS, IAM_WORKSPACES_ROOT, PORT)
```

Sync: `./scripts/install-terminal-tunnel-env.sh --mac-only`

### 6.5 Flow — dashboard terminal

```
Browser XTermShell → GET /api/terminal/connections/targets
  → AgentChat DO → D1 terminal_connections
  → WSS to localpty | terminal | sandboxterminal
  → cloudflared → iam-pty:3099/terminal
```

### 6.6 Flow — MCP terminal tool

```
Cursor OAuth → mcp.inneranimalmedia.com tools/call
  → MCP worker mcp-terminal-exec.js
  → D1 connection → https://localpty|terminal|sandboxterminal/exec
  → Bearer PTY_AUTH_TOKEN + X-User-Id headers
  → iam-pty
```

---

## 7. agentsam_* control plane (summary)

| Registry | Table(s) | Resolution |
|----------|----------|------------|
| Tools | `agentsam_tools` | `loadAgentsamToolRow()` → `handler_type` + `handler_config_json` |
| Workflows | `agentsam_workflows`, nodes, edges, handlers | `resolveWorkflowFromSurfaceMetadata()` |
| Models | `agentsam_model_catalog` | No hardcoded provider in hot paths |
| OAuth MCP | `agentsam_mcp_oauth_*` allowlists | Per client + user grants |
| User policy | `agentsam_user_policy` | PTY, `platform_operator`, tool risk |
| Bootstrap | `agentsam_bootstrap` | Per-user/workspace UI state |

**Workflow edges:** `from_status` ∈ `success | failed | any`.

**MCP tools/list:** `oauth_visible = 1` on `agentsam_tools`; operator terminal tools filtered for non-operators.

---

## 8. Multi-repo map

| Repo | Path on disk | Purpose |
|------|--------------|---------|
| inneranimalmedia | `~/inneranimalmedia` | Core platform |
| inneranimalmedia-mcp-server | `~/inneranimalmedia-mcp-server` | MCP OAuth worker |
| iam-pty | `~/iam-pty` | PTY shell server |
| moviemode-service | submodule `services/moviemode-service` | MovieMode satellite |
| iam-pwa-services | `~/iam-pwa-services` | PWA companion → `services.inneranimalmedia.com` |
| agentsam-cms-editor | optional `cms/agentsam-cms-editor` | Python CMS worker |

---

## 9. Known gaps & ops debt

| Item | Status |
|------|--------|
| `sandboxterminal.*` DNS 530 | Stale tunnel hostname binding — fix in CF Zero Trust (route exists) |
| `docs/ARCHITECTURAL_AUDIT.md` | Pre-`src/` — deprecated for structure |
| MCP `tools/list` operator filter | Core has `mcp-tool-resolve.js`; verify MCP repo parity |
| `/dashboard/cms` routes | Planned — contact CMS shipped via hydrate |
| Deploy email notification | Needs `INTERNAL_API_SECRET` in deploy shell |

---

## 10. Doc index (platform)

| Doc | Use when |
|-----|----------|
| [AgentSamQUADMODE.md](../AgentSamQUADMODE.md) | Terminal + quad surfaces cheat sheet |
| [iam-surface-delegation-plan-2026-06.md](./iam-surface-delegation-plan-2026-06.md) | Satellite + CMS + tunnel delegation |
| [iam-runtime-architecture-2026-06.md](./iam-runtime-architecture-2026-06.md) | Two-repo MCP vs core |
| [deploy-architecture-v3.md](../deploy-architecture-v3.md) | Three deploy paths |
| [MOVIEMODE.md](../MOVIEMODE.md) | MovieMode storage + API |
| [AUDIT-PUBLIC-ROUTING-R2-AUTH.md](../AUDIT-PUBLIC-ROUTING-R2-AUTH.md) | Public route order |
| [CMS_REALTIME_EDIT_LOOP.md](../CMS_REALTIME_EDIT_LOOP.md) | BrowserView CMS edit flow |
| `.cursor/rules/iam-terminal-connections.mdc` | D1 terminal_connections law |

---

*Generated 2026-06-12 from production worker `36fb1730`, D1 migration 622 applied, Connor sandbox isolation live.*
