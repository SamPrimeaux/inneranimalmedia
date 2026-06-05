# PWA + Browser Service Worker — Platform Spec (2026-06)

**Status:** Plan (not shipped)  
**Primary origin:** `inneranimalmedia.com`  
**Revive target:** `services.inneranimalmedia.com` (stale hub — see §2)  
**Deploy SSOT:** `npm run deploy:full` → R2 `static/dashboard/app/` + `analytics/deploys/*/r2-manifest.json`

---

## 0. Naming (read first)

| Term | What it is |
|------|------------|
| **Cloudflare Worker** | Edge code (`src/index.js`) — APIs, auth, D1, DOs, R2 |
| **Browser Service Worker** | `sw.js` registered by the page — device cache, offline shell, install, push |
| **PWA** | Manifest + SW + HTTPS → installable, standalone app |

These are **complementary**. Edge Worker = kitchen. Browser SW = lunchbox on the user's device.

---

## 1. Current state (gap analysis)

| Capability | Today |
|------------|--------|
| Dashboard static (R2 + cache bust) | ✅ `deploy:full`, 113-object manifest |
| Edge caching headers | ✅ Long cache on hashed JS; `no-store` on SPA HTML |
| Client session cache | ✅ `sessionStorage` / `localStorage` (workspace, git, theme) |
| Browser `sw.js` | ❌ None |
| Web app manifest | ❌ None |
| Install to home screen | ❌ |
| Offline shell | ❌ |
| Web Push | ❌ |
| `services.inneranimalmedia.com` | ⚠️ Stale JSON hub ([live probe](https://services.inneranimalmedia.com/)) |

---

## 2. Role of `services.inneranimalmedia.com`

**Live response today:**
```json
{
  "name": "InnerAnimalMedia Services",
  "features": ["SQL-backed Durable Objects", "MCP Protocol Server", "Browser Rendering", "Video Calls (WebRTC)", "Chat/Communications", "Resend Email Integration"],
  "endpoints": { "session": "/api/session/:id", "mcp": "/api/mcp/*", "browser": "/api/browser/*", "video": "/api/video/*", "chat": "/api/chat/*", "email": "/api/email/*" }
}
```

**Constraint:** A Service Worker is **origin-scoped**. `services.inneranimalmedia.com/sw.js` cannot intercept `inneranimalmedia.com` fetches. Plan for **two coordinated layers**:

### 2A. `inneranimalmedia.com` — Primary PWA (required)

- Host: `/sw.js` (root scope) or `/static/dashboard/sw.js` with `Service-Worker-Allowed: /` response header from edge Worker
- Controls: full dashboard SPA, static chunks, shell.css, icons
- Registered from: dashboard bootstrap (`index.tsx` after auth gate)

### 2B. `services.inneranimalmedia.com` — PWA Control Plane (revive)

Use the stale worker as **cross-cutting services**, not the main dashboard SW:

| Service | Purpose |
|---------|---------|
| `GET /sw/manifest.json` | Deploy-aware precache list (mirror of `r2-manifest.json` + version) |
| `GET /sw/config.json` | Feature flags: which routes precache, push enabled, offline mode |
| `POST /api/push/subscribe` | Web Push subscription storage (D1/KV) |
| `POST /api/push/notify` | Internal: deploy done, plan blocked, approval needed |
| `GET /api/session/:id` | Resume spine (align with `agentsam_workspace_state`) |
| `GET /api/health` | PWA + DO + binding health for status page |
| `GET /` | Human-readable services status (replace raw JSON for operators) |

**Optional:** Host **lite tool shells** (preview-only pages) that benefit from their own SW scope on the services origin.

### 2C. Other origins (secondary SWs)

| Origin | SW benefit |
|--------|------------|
| `tools.inneranimalmedia.com` | Monaco/E2E preview bundles, designstudio runner artifacts — heavy JS precache |
| `assets.inneranimalmedia.com` | Learn course markdown/images — stale-while-revalidate for `/learn/*` |
| `mcp.inneranimalmedia.com` | ❌ No browser SW (API/MCP only) |

---

## 3. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ User device                                                      │
│  ┌──────────────────┐     ┌─────────────────────────────────┐ │
│  │ SW @ inneranimal │     │ Cache API                        │ │
│  │ media.com/sw.js  │────▶│ shell, dashboard.js, route chunks│ │
│  └────────┬─────────┘     │ fonts, icons, glb previews       │ │
│           │ miss           │ NetworkOnly: /api/*, SSE, WS     │ │
└───────────┼───────────────────────────────────────────────────┘
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Cloudflare edge — inneranimalmedia Worker                        │
│ Auth · D1 · DOs · SSE · R2 static · Cache-Control headers        │
└─────────────────────────────────────────────────────────────────┘
            │ manifest poll (optional)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ services.inneranimalmedia.com                                    │
│ SW config · Push · Session API · Health · Deploy manifest mirror   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Global caching policy (all surfaces)

| Pattern | SW strategy | Edge Worker header (keep) |
|---------|-------------|---------------------------|
| `/api/*` | **NetworkOnly** | `no-store` / `private` |
| SSE (`/api/agent/chat`, plan streams) | **Bypass SW** or NetworkOnly | `no-cache` |
| WebSocket (terminal, meet, DO) | **Bypass SW** | n/a |
| SPA HTML (`/dashboard/*`) | **NetworkFirst** (3s timeout → cached shell) | `no-store` |
| `/static/dashboard/app/*.{js,css}` | **CacheFirst** (immutable) | `public, max-age=31536000` |
| `/static/dashboard/shell.css` | **StaleWhileRevalidate** | versioned on deploy |
| R2 media (`moviemode/*`, GLB, images) | **Range-aware NetworkFirst** | support Range (already in places) |
| OAuth redirects | **NetworkOnly** | do not cache |

**Rule:** Never cache personalized API JSON in SW. Device cache is for **bytes**, not **business state** (D1 remains SSOT).

---

## 5. Surface-by-surface SW benefits

### 5.1 Agent Dashboard shell (`/dashboard/agent`) — P0

**Pain:** 1.7MB+ `dashboard.js`, repeat visits re-download; "No workspace" flash on slow network.

**SW wins:**
- Precache: `shell.css`, `dashboard.css`, `dashboard.js`, `vendor-react.js`
- Runtime cache: remaining chunks on first route visit
- Offline: cached shell + "Reconnecting…" + last workspace from `sessionStorage`
- Update flow: new `?v=` from deploy → SW `skipWaiting` prompt

**Chunks (from Vite build):** `dashboard.js`, `vendor-react`, `vendor-icons`, `index.js` (agent core)

---

### 5.2 Agent chat + SSE — P0 (careful)

**Pain:** Streaming breaks if SW caches POST/GET incorrectly.

**SW wins:**
- Explicit **bypass** for `/api/agent/chat`, `/api/agent/plan/*` stream endpoints
- Cache **static** only: composer assets, presence icons, thinking card CSS
- Background: none for chat body

**Do not:** Cache SSE responses or poll endpoints.

---

### 5.3 MovieMode / Remotion (`/dashboard/agent` tab + `MovieModeStudio`) — P1

**Pain:** `vendor-remotion.js` (~194KB gzip), `vendor-realtimekit` (~925KB gzip), video proxies from R2.

**SW wins:**
- **Lazy precache** on first `moviemode` tab open: `MovieModeStudio.js`, `vendor-remotion.js`
- **Runtime cache** for R2 proxy URLs (`moviemode/{workspace_id}/...`) with quota cap (e.g. 500MB LRU)
- **Range request passthrough** for video preview (SW must not strip Range headers)
- Offline: show timeline JSON from last session (localStorage) + "Export unavailable offline"

**Edge synergy:** Worker brokers multipart upload; SW does not cache upload POSTs.

**Render jobs:** NetworkOnly — poll `/api/moviemode/*` until complete.

---

### 5.4 Design Studio / VoxelEngine / OpenSCAD CAD (`/dashboard/designstudio`) — P1

**Pain:** `vendor-three.js` (~158KB gzip), `VoxelEngine.js`, GLB fetches, chess piece models from `/api/games/pieces`.

**SW wins:**
- Lazy precache on route: `DesignStudioPage.js`, `vendor-three.js`, `VoxelEngine.js`
- Cache GLB assets (public chess URLs, user-exported GLB keys) — **huge** for iPhone reload
- Cache blueprint **read-only** metadata if served as static JSON
- Offline: last loaded GLB + voxel state from IndexedDB (future Phase 2)

**CAD pipeline (OpenSCAD → STL → GLB):** NetworkOnly — runner is off-edge; SW only caches **output** GLB URLs after success.

**Related tables:** `designstudio_design_blueprints`, future `designstudio_runs` — API only, not SW cache.

---

### 5.5 Excalidraw (`excalidraw` tab) — P2

**Pain:** `vendor-excalidraw.js` (~1.5MB gzip) — largest chunk.

**SW wins:**
- **Never precache on boot** — lazy on tab first open
- Cache excalidraw CSS asset (`assets/vendor-excalidraw.css`)
- IndexedDB for drawing state (Excalidraw native) + optional SW cache of saved `.excalidraw` exports from R2

---

### 5.6 GLB / 3D viewer tab — P1

**Pain:** Large model files, repeat loads in design/games modes.

**SW wins:**
- Cache-by-URL for `*.glb` with LRU eviction
- `glb/chess/v1/` static assets if served from R2

---

### 5.7 Learn (`/dashboard/learn`) — P2

**Pain:** Course content from `assets.inneranimalmedia.com/learn/*`.

**SW wins:**
- StaleWhileRevalidate for lesson markdown fetched via `/api/learn/*` **only if** responses are cache-friendly (ETag)
- Or: cross-origin cache from `assets.inneranimalmedia.com` with separate SW on assets origin
- Offline: last 3 lessons read (IndexedDB manifest)

---

### 5.8 Library / Media / Images (`/dashboard/library`, `ImagesPage`) — P2

**Pain:** Thumbnails, Cloudflare Images delivery URLs.

**SW wins:**
- Cache image thumbnails (immutable URLs with hash)
- Do not cache signed/upload URLs
- **Cloudflare Polish** (Pro) + SW = faster repeat gallery views

---

### 5.9 Meet / WebRTC (`/dashboard/meet`) — P3

**Pain:** RealtimeKit bundle heavy; calls fail offline anyway.

**SW wins:**
- Lazy precache `MeetPage.js`, `vendor-realtimekit.js` for faster **room entry**
- **No cache** for signaling/API — WebRTC must be live
- Push notification (via services hub): "Meeting starting"

---

### 5.10 Terminal / PTY — P3 (minimal)

**SW wins:** Essentially none for live terminal. Optional: cache xterm CSS/JS only.

**Bypass:** All `/api/terminal/*`, WebSocket URLs.

---

### 5.11 Workflows / Analytics / Database Studio — P2

**Pain:** Large lazy chunks (`WorkflowsPage.js`, `DatabaseStudio.js`, `vendor-charts.js`).

**SW wins:**
- Route-based lazy precache registry (see §6)
- Cache mermaid/cytoscape diagram assets after first render

---

### 5.12 Auth / OAuth / MCP consent — P0 (hands off)

**SW wins:** None. **NetworkOnly** for `/api/oauth/*`, `/oauth/*`, login HTML on R2.

---

### 5.13 `iam-workspace-shell.html` / tools preview — P1

**Pain:** Standalone shell on `tools.inneranimalmedia.com` for isolated previews.

**SW wins:**
- Separate SW on tools origin
- Precache `shell.css` + entry bundle for E2E preview URLs
- `API_ORIGIN` cross-origin calls bypass tools SW (network to inneranimalmedia.com)

---

## 6. Precache manifest strategy (tie to deploy)

**SSOT:** `analytics/deploys/previous-manifest.json` (already built each `deploy:full`).

### Tier 0 — Boot (always precache)
- `/static/dashboard/shell.css`
- `/static/dashboard/app/dashboard.css`
- `/static/dashboard/app/dashboard.js`
- `/static/dashboard/app/vendor-react.js`
- `/static/dashboard/app/vendor-icons.js`
- App icons + `manifest.webmanifest`

### Tier 1 — Agent shell (precache after first login)
- `index.js`, agent chat chunks, `StatusBar`, `WorkspaceDashboard`

### Tier 2 — Route lazy (precache on `navigate` to route)
| Route | Chunks |
|-------|--------|
| `/dashboard/designstudio` | `DesignStudioPage`, `vendor-three`, `VoxelEngine` |
| `/dashboard/agent` + moviemode tab | `MovieModeStudio`, `vendor-remotion` |
| excalidraw tab | `ExcalidrawView`, `vendor-excalidraw` |
| `/dashboard/learn` | `LearnPage`, `LearnPage.css` |
| `/dashboard/workflows` | `WorkflowsPage`, `vendor-charts` |
| `/dashboard/meet` | `MeetPage`, `vendor-realtimekit` |

### Tier 3 — Media (runtime LRU only)
- R2 video, GLB, moviemode exports, learn assets

**services.inneranimalmedia.com** publishes `GET /sw/manifest.json`:
```json
{
  "deploy_id": "8e782268",
  "cache_bust": "1780694885922",
  "tier0": ["..."],
  "tier1": ["..."],
  "tier2": { "/dashboard/designstudio": ["..."] }
}
```

SW checks on activate + every 6h — prompts update when `cache_bust` changes.

---

## 7. PWA manifest (`manifest.webmanifest`)

```json
{
  "name": "Inner Animal Media",
  "short_name": "IAM",
  "start_url": "/dashboard/agent",
  "scope": "/",
  "display": "standalone",
  "background_color": "#002b36",
  "theme_color": "#2aa198",
  "icons": [{ "src": "/static/dashboard/icons/icon-192.png", "sizes": "192x192", "type": "image/png" }, { "src": "/static/dashboard/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }]
}
```

Serve from edge with `Content-Type: application/manifest+json`.

---

## 8. Cloudflare Pro / paid leverage map

| Product | How PWA uses it |
|---------|-----------------|
| **Workers** | APIs stay edge-fast; SW never replaces |
| **R2 + deploy manifest** | Precache list source |
| **KV** | Push subs, SW config version, per-user precache tier |
| **D1** | `agentsam_workspace_state`, push subscriptions table |
| **Durable Objects** | Real-time — bypass SW |
| **CDN cache rules** | Align `immutable` on `/static/dashboard/app/*` |
| **Early Hints** | Preload `shell.css` + `dashboard.js` |
| **Polish / Mirage** | Library thumbnails, learn images |
| **WAF** | Protect `/api/*`; SW serves static when edge busy |
| **Workers Analytics** | Track SW update adoption |
| **Browser Rendering (MYBROWSER)** | Unrelated to browser SW — keep server-side |
| **Cache Reserve** | Optional; R2 versioning may be sufficient |

---

## 9. Implementation phases

### Phase 0 — Foundation (1–2 days)
- [ ] Add `vite-plugin-pwa` to `dashboard/` OR hand-roll `sw.js` + build step
- [ ] `manifest.webmanifest` + icons
- [ ] Register SW in `dashboard/index.tsx` (post-login)
- [ ] Edge: serve `/sw.js` with correct scope headers
- [ ] Tier 0 precache wired to deploy manifest

### Phase 1 — Agent shell offline-aware (2–3 days)
- [ ] NetworkFirst HTML, CacheFirst hashed JS
- [ ] SSE/API bypass list (explicit routes)
- [ ] Update prompt UI ("New version — refresh")
- [ ] Revive `services.inneranimalmedia.com` health + `/sw/manifest.json` mirror

### Phase 2 — Route lazy precache (3–5 days)
- [ ] Route → chunk map for Design Studio, MovieMode, Learn, Workflows
- [ ] GLB/video LRU runtime cache with quota
- [ ] IndexedDB for offline "Recent Work" enrichment

### Phase 3 — Push + services hub (3–5 days)
- [ ] VAPID keys in Wrangler secrets
- [ ] `POST /api/push/subscribe` on services worker
- [ ] Notify: deploy complete, plan question, approval required
- [ ] Background Sync for failed non-SSE POSTs (optional)

### Phase 4 — tools + assets origins (optional)
- [ ] SW on `tools.inneranimalmedia.com`
- [ ] SW on `assets.inneranimalmedia.com` for learn CDN

---

## 10. Files to touch (when implementing)

| Area | Files |
|------|-------|
| SW build | `dashboard/vite.config.ts`, new `dashboard/src/sw/` or vite-plugin-pwa |
| Registration | `dashboard/index.tsx` |
| Manifest | `dashboard/public/manifest.webmanifest`, icons |
| Edge routes | `src/index.js` (sw.js headers), `src/core/dashboard-r2-assets.js` |
| Deploy | `scripts/deploy-frontend.sh` (upload sw.js + manifest), `scripts/build-r2-deploy-manifest.mjs` |
| Services worker | **Separate repo/worker** for `services.inneranimalmedia.com` revive |
| D1 | Migration: `agentsam_push_subscriptions`, `agentsam_sw_deploy_manifest` (optional) |

---

## 11. Risks / anti-patterns

1. Caching SSE → broken Agent Sam chat  
2. Caching authenticated `/api/auth/me` → wrong user shell  
3. Precaching `vendor-excalidraw` + `vendor-realtimekit` on boot → slow first install  
4. SW on wrong path → scope too narrow to cover `/dashboard/*`  
5. Stale API responses → always NetworkOnly for `/api/`  
6. Cross-origin confusion → services SW cannot fix main app cache  

---

## 12. Success metrics

| Metric | Target |
|--------|--------|
| Repeat visit LCP (dashboard) | −40% vs no SW |
| `dashboard.js` network bytes on 2nd visit | 0 (cache hit) |
| Installable PWA | Lighthouse PWA pass |
| SW update adoption | &gt;90% within 24h of deploy |
| SSE error rate post-SW | No increase |
| Offline shell load | Agent home renders in &lt;2s with cached shell |

---

## 13. Related docs

- `docs/MOVIEMODE.md` — R2 prefixes, render stack  
- `docs/inneranimalmedia/product/designstudio/PIPELINE.md` — CAD/OpenSCAD flow  
- `docs/DASHBOARD_R2_ASSET_ARCHITECTURE.md` — chunk splits  
- `docs/platform/iam-runtime-architecture-2026-06.md` — two-worker model (main vs MCP)  
- `moviemode_patch_remotion.md` — Remotion preview/export unity  
