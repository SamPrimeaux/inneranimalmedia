# moviemode-service

**Inner Animal Media product worker** — scroll-driven **3D globe landing** (`Code = Communication`) and legacy `/meaux*` routes.

Deploy: Cloudflare Worker `moviemode-service` · Git: [SamPrimeaux/moviemode-service](https://github.com/SamPrimeaux/moviemode-service) · Consumed by **inneranimalmedia.com** via service binding.

> **Encode / MovieMode APIs** live on the **main** `inneranimalmedia` worker today (`/api/moviemode/*`, `/api/cloudconvert/*`, `/api/stream/*`). This worker is intentionally **slim** (landing + legacy) until full API offload is bundled.

## Surfaces

| URL | What |
|-----|------|
| `https://moviemode.inneranimalmedia.com/` | Globe landing (this worker `public/`) |
| `https://inneranimalmedia.com/globe` | Same scene — main worker proxies via `MOVIEMODE_SERVICE` |
| `https://inneranimalmedia.com/work` | Same scene pattern on **main ASSETS** (no tweaks on public); see `docs/platform/work-globe-scene.md` |
| `https://inneranimalmedia.com/dashboard/moviemode` | Studio UI — main worker dashboard |
| `https://moviemode.inneranimalmedia.com/studio/` | Optional standalone studio (`npm run build:all`) |

## Main worker binding

`inneranimalmedia` / `wrangler.production.toml`:

```toml
[[services]]
binding = "MOVIEMODE_SERVICE"
service = "moviemode-service"
```

Proxy: `src/core/moviemode-service-proxy.js` — `GET /globe` → moviemode-service `/`.

Optional shared secret on both workers: `IAM_SERVICE_KEY` (header `X-IAM-Service-Key`).

## Layout

```
moviemode-service/
├── public/                 # Globe landing (STATIC assets binding)
│   ├── index.html          # MovieMode-branded hero + tweaks panel
│   ├── globe.js            # window.GlobeScene — procedural Three.js earth
│   ├── scroll.js           # Scroll choreography; tweaks only if #tweak-toggle exists
│   └── charts.js
├── studio/                 # Standalone MovieMode Vite app → /studio/ (optional build)
├── worker/src/
│   ├── index.js            # Slim: health + legacy + STATIC.fetch
│   └── legacy-routes.js    # /meauxcad/*, /meauxmedia/*, /meauxcreate/*, …
├── migrations/             # moviemode D1 SQL (341–619); apply via main repo wrangler
└── scripts/sync-from-iam.sh
```

Full API sources are copied under `worker/src/api/` and `worker/src/core/` for future offload; they are **not** imported by the slim `index.js` deploy.

## Routes (this worker)

| Path | Handler |
|------|---------|
| `/`, `/globe.js`, `/scroll.js`, `/charts.js` | `[assets]` → `public/` |
| `/health`, `/api/health` | JSON liveness (`landing: globe`) |
| `/meaux*` | `legacy-routes.js` |
| `/studio/*` | Static after `npm run build:all` |

## Deploy

```bash
npm install
npx wrangler deploy -c wrangler.toml   # always -c wrangler.toml
```

**Do not** run bare `npx wrangler deploy` from this directory without `-c` — that can target the wrong worker.

GitHub Workers Builds: build command should use `npx wrangler deploy -c wrangler.toml`.

## Secrets (Cloudflare dashboard)

| Secret | Purpose |
|--------|---------|
| `CLOUDCONVERT_API_KEY` | Encode jobs (when API offload restored) |
| `CLOUDCONVERT_WEBHOOK_SECRET` | Webhook HMAC |
| `CLOUDFLARE_API_TOKEN` | Stream API |
| `MESHYAI_API_KEY` | 3D mesh lane |
| `OPEN_AI_KEY` | Whisper / tooling |
| `OIDC_PRIVATE_KEY` | Service auth |
| `IAM_SERVICE_KEY` | Service binding auth from inneranimalmedia |

Bindings: D1 `inneranimalmedia-business`, R2 `inneranimalmedia` + `artifacts`, `AI`, `[assets]` → `./public`.

## Develop

```bash
IAM_ROOT=../inneranimalmedia npm run sync   # from monorepo mirror
npm install && npm run dev                  # globe at :8787/
```

## Sync with monorepo

```bash
cd services/moviemode-service && IAM_ROOT=../.. npm run sync
# then push product repo:
rsync -a --delete --exclude '.git' services/moviemode-service/ /path/to/moviemode-service-clone/
cd /path/to/moviemode-service-clone && git add -A && git commit && git push
```

## Relationship to inneranimalmedia

| Concern | Owner |
|---------|--------|
| Dashboard MovieMode UX | `dashboard/features/moviemode` |
| Production APIs | `inneranimalmedia` main worker |
| `/work` globe (public, no tweaks) | `static/pages/work` + `static/assets/scenes/work-globe` |
| Globe landing + subdomain | **This repo** |

Docs: `inneranimalmedia/docs/MOVIEMODE.md`, `inneranimalmedia/docs/platform/work-globe-scene.md`.
