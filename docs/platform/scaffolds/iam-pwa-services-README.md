# Inner Animal Media — PWA Services

> **Copy this file to the root of the new repo as `README.md` when you create it.**

Browser PWA control plane and companion Worker for [Inner Animal Media](https://inneranimalmedia.com). This repo powers **`services.inneranimalmedia.com`** — deploy manifests, Web Push, session/resume APIs, and (optionally) lite tool shells. It works **with** the main [`inneranimalmedia`](https://github.com/SamPrimeaux/inneranimalmedia) Worker; it does not replace it.

---

## What this repo is

| Layer | Repo | Origin | Role |
|-------|------|--------|------|
| **Product app** | `inneranimalmedia` | `inneranimalmedia.com` | Dashboard, Agent Sam, D1, APIs, R2 static |
| **Browser Service Worker** | `inneranimalmedia` (Phase 0+) | `inneranimalmedia.com/sw.js` | Device cache, offline shell, install |
| **PWA services hub** | **this repo** | `services.inneranimalmedia.com` | Manifest mirror, push, health, session spine |

**Mental model:** The main repo is the kitchen. This repo is the **delivery + notification + version coordination** layer for installable, offline-aware clients.

---

## What this repo is not

- Not the MCP server (`mcp.inneranimalmedia.com` → `inneranimalmedia-mcp-server`)
- Not the main dashboard Worker (`inneranimalmedia.com` → `inneranimalmedia`)
- Not a replacement for D1 / `agentsam_*` business logic
- Not where heavy encode/render runs (MovieMode Remotion, OpenSCAD — off-edge or main worker broker)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User device                                                             │
│  ┌─────────────────────────┐    ┌──────────────────────────────────┐  │
│  │ sw.js                    │    │ Cache API (shell, chunks, GLB)   │  │
│  │ inneranimalmedia.com     │───▶│ NetworkOnly: /api/*, SSE, WS     │  │
│  └───────────┬─────────────┘    └──────────────────────────────────┘  │
│              │ miss                                                      │
└──────────────┼──────────────────────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  inneranimalmedia.com — main Worker (sibling repo)                       │
│  Auth · Agent Sam · D1 · DOs · R2 dashboard static · MYBROWSER           │
└─────────────────────────────────────────────────────────────────────────┘
               │ deploy manifest poll
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  services.inneranimalmedia.com — THIS REPO                               │
│  /sw/manifest.json · /sw/config.json · push · health · session APIs      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Origin scope rules (non-negotiable)

- A Service Worker only controls fetches from **its own origin**.
- `services.inneranimalmedia.com/sw.js` **cannot** cache `inneranimalmedia.com` assets.
- Primary dashboard SW lives on **`inneranimalmedia.com`** (built from main repo).
- This repo publishes **metadata and services** the dashboard SW consumes cross-origin.

---

## Features (roadmap)

### Phase 0 — Hub online
- [ ] Worker deploy to `services.inneranimalmedia.com`
- [ ] `GET /` — human-readable status (replace stale JSON-only root)
- [ ] `GET /api/health` — bindings + D1 ping
- [ ] `GET /sw/manifest.json` — precache list synced from main repo deploy manifest
- [ ] `GET /sw/config.json` — feature flags (which routes lazy-precache, push on/off)

### Phase 1 — Deploy coordination
- [ ] Webhook or cron pull of `analytics/deploys/previous-manifest.json` from R2
- [ ] Normalize to tiered precache: boot / agent / route-lazy / media LRU
- [ ] Expose `cache_bust` + `git_sha` for dashboard SW update checks
- [ ] Optional: `POST /api/deploy/ingest` called from main `deploy:full` post-hook

### Phase 2 — Web Push
- [ ] VAPID key pair (Wrangler secrets)
- [ ] D1 table `agentsam_push_subscriptions` (or KV)
- [ ] `POST /api/push/subscribe` / `DELETE /api/push/unsubscribe`
- [ ] `POST /api/push/notify` (internal) — deploy done, plan blocked, approval needed
- [ ] CORS allowlist: `inneranimalmedia.com` only

### Phase 3 — Session / resume spine
- [ ] `GET /api/session/:workspaceId` — read `agentsam_workspace_state` (read-only)
- [ ] Align with workspace resume in main dashboard (`agentsam_workspace_state.conversation_id`)
- [ ] No auth bypass — same session cookies or bearer as main app

### Phase 4 — Lite shells (optional)
- [ ] Static preview pages on services origin (E2E, tool smoke) with **local** SW scope
- [ ] `tools.inneranimalmedia.com` coordination doc (separate origin, optional second deploy target)

---

## API surface (target)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/` | Public | Operator status page |
| `GET` | `/api/health` | Public | Liveness + dependency matrix |
| `GET` | `/sw/manifest.json` | Public | Precache manifest (versioned) |
| `GET` | `/sw/config.json` | Public | PWA feature flags |
| `POST` | `/api/push/subscribe` | Session | Store Web Push subscription |
| `DELETE` | `/api/push/unsubscribe` | Session | Remove subscription |
| `POST` | `/api/push/notify` | Service token | Internal notify (deploy CI, cron) |
| `GET` | `/api/session/:workspaceId` | Session | Resume spine snapshot |

Legacy stubs from the stale hub (implement or proxy to main worker as needed):

| Path | Notes |
|------|-------|
| `/api/mcp/*` | Prefer **301** docs → `mcp.inneranimalmedia.com`; do not duplicate MCP |
| `/api/browser/*` | Proxy to main worker MYBROWSER or deprecate |
| `/api/video/*` | Meet/RealtimeKit signaling — evaluate vs main `/api/meet/*` |
| `/api/chat/*` | Deprecate in favor of main Agent Sam APIs |
| `/api/email/*` | Proxy Resend send via main worker patterns |

---

## Repository layout (proposed)

```
iam-pwa-services/
├── README.md
├── package.json
├── wrangler.jsonc              # name: inneranimalmedia-pwa-services
├── src/
│   ├── index.js                # fetch router
│   ├── api/
│   │   ├── health.js
│   │   ├── push.js
│   │   ├── session.js
│   │   └── sw-manifest.js      # build/normalize precache tiers
│   ├── core/
│   │   ├── d1.js
│   │   ├── cors.js
│   │   └── auth-session.js     # validate IAM session cookie
│   └── pages/
│       └── status.html         # GET / operator UI
├── migrations/                   # D1 migrations (push subs, manifest ledger)
├── scripts/
│   ├── sync-r2-manifest.mjs    # pull main deploy manifest → KV/D1
│   └── deploy.sh
└── docs/
    └── integration-main-repo.md
```

---

## Cloudflare bindings (production)

| Binding | Purpose |
|---------|---------|
| `DB` | D1 `inneranimalmedia-business` (read-heavy; push subs) |
| `KV` | Hot cache for `sw/manifest.json`, rate limits |
| `ASSETS` | R2 `inneranimalmedia` — optional static status assets |
| Secrets | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_SERVICE_TOKEN`, `TOKEN_SIGNING_KEY` (session verify) |

**Route:** `services.inneranimalmedia.com/*` (zone: `inneranimalmedia.com`)

**Do not** duplicate Hyperdrive, DOs, or MCP unless a feature truly needs them here.

---

## Integration with main `inneranimalmedia` repo

### Deploy manifest sync

Main repo `npm run deploy:full` writes:

- R2: `analytics/deploys/previous-manifest.json`
- Local: `dashboard/dist/` → `static/dashboard/app/*`

This repo should:

1. **Pull** `previous-manifest.json` after each main deploy (cron every 5m or webhook).
2. **Transform** into tiered precache (see main spec: `docs/platform/pwa-service-worker-platform-spec-2026-06.md`).
3. **Publish** `GET /sw/manifest.json` with `{ deploy_id, cache_bust, git_sha, tier0, tier1, tier2 }`.

### Dashboard SW registration (main repo change)

```javascript
// dashboard/index.tsx (main repo) — after login
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
  // Optional: poll services for manifest version
  fetch('https://services.inneranimalmedia.com/sw/manifest.json', { cache: 'no-store' });
}
```

### Post-deploy hook (optional)

Add to main `scripts/deploy-frontend.sh`:

```bash
curl -sf -X POST "https://services.inneranimalmedia.com/api/deploy/ingest" \
  -H "Authorization: Bearer $PUSH_SERVICE_TOKEN" \
  -d "{\"git_sha\":\"$GIT_SHA\",\"cache_bust\":\"$CACHE_BUST\"}" || true
```

---

## Local development

### Prerequisites

- Node 20+
- Wrangler 4.x
- Access to D1 `inneranimalmedia-business` (read) for session/push tables
- `.env` (gitignored): `CLOUDFLARE_API_TOKEN`, optional `PUSH_SERVICE_TOKEN`

### Commands

```bash
npm install
npm run dev          # wrangler dev --remote (or local miniflare)
npm run deploy       # wrangler deploy
npm run sync-manifest  # node scripts/sync-r2-manifest.mjs
```

### wrangler.jsonc sketch

```jsonc
{
  "name": "inneranimalmedia-pwa-services",
  "main": "src/index.js",
  "compatibility_date": "2026-01-20",
  "routes": [
    { "pattern": "services.inneranimalmedia.com/*", "zone_name": "inneranimalmedia.com" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_name": "inneranimalmedia-business", "database_id": "cf87b717-d4e2-4cf8-bab0-a81268e32d49" }
  ],
  "kv_namespaces": [{ "binding": "KV", "id": "<create or reuse>" }]
}
```

---

## Security

- **CORS:** `Access-Control-Allow-Origin: https://inneranimalmedia.com` (not `*`) for push/subscribe.
- **Session:** Validate IAM session cookie or bearer — same patterns as main `src/core/auth.js` (import shared module or duplicate minimal verify).
- **Push notify:** `PUSH_SERVICE_TOKEN` only — never expose to browser.
- **Manifest endpoints:** Public read OK (no secrets in manifest).
- **Never** commit `.env`, VAPID private keys, or `wrangler` secrets in git.

---

## Surfaces that benefit (reference)

Full per-route matrix lives in main repo:

`inneranimalmedia/docs/platform/pwa-service-worker-platform-spec-2026-06.md`

| Surface | Primary SW (main origin) | This repo helps with |
|---------|--------------------------|----------------------|
| Agent dashboard | Precache shell + chunks | Manifest version, push |
| MovieMode / Remotion | Lazy media LRU | Manifest tier-2 route map |
| Design Studio / GLB | Cache models | Manifest + optional CDN hints |
| Learn / Library | SWR content | assets origin config flags |
| Meet / WebRTC | Bundle lazy precache | Push: meeting reminders |
| OAuth / API | Bypass | Nothing (network only) |

---

## Success metrics

| Metric | Target |
|--------|--------|
| `GET /api/health` uptime | 99.9% |
| Manifest lag after main deploy | < 5 minutes |
| Push delivery (deploy notify) | < 30s |
| Dashboard SW update check | Uses `cache_bust` from this hub |
| Zero SSE/cache incidents | No proxy caching of `/api/agent/chat` |

---

## Related repositories & URLs

| Resource | URL |
|----------|-----|
| Main platform | https://github.com/SamPrimeaux/inneranimalmedia |
| MCP server | https://github.com/SamPrimeaux/inneranimalmedia-mcp-server |
| Production app | https://inneranimalmedia.com/dashboard/agent |
| **This service** | https://services.inneranimalmedia.com |
| MCP (separate) | https://mcp.inneranimalmedia.com |
| PWA spec (main repo) | `docs/platform/pwa-service-worker-platform-spec-2026-06.md` |

---

## License & ownership

Inner Animals LLC / Inner Animal Media — private repository.  
Operator: Sam Primeaux (`tenant_sam_primeaux`).

---

## Quick start checklist (day one)

1. Create GitHub repo (see naming recommendation in PR/issue or parent README).
2. Copy this README to repo root.
3. `wrangler init` + route `services.inneranimalmedia.com/*`.
4. Ship `GET /api/health` + `GET /` status page (revive the stale JSON hub).
5. Ship `GET /sw/manifest.json` with static tier0 list (hand-authored OK for v0).
6. Wire main repo dashboard to poll manifest URL.
7. Add D1 migration for push subscriptions when ready for Phase 2.
