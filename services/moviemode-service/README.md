# moviemode-service

**Inner Animal Media product worker** — MovieMode encode lane, studio UI, and the scroll-driven **3D globe landing** (`Code = Communication`).

Deploy: Cloudflare Worker `moviemode-service` · Git: `SamPrimeaux/moviemode-service` · **Consumed by `inneranimalmedia.com`** via service binding.

## inneranimalmedia alignment

| What | Where |
|------|--------|
| Globe (production) | `https://inneranimalmedia.com/globe` — main worker proxies → this worker `/` |
| MovieMode editor | `https://inneranimalmedia.com/dashboard/moviemode` — IAM dashboard (main worker) |
| Standalone studio build | `https://moviemode.inneranimalmedia.com/studio/` — optional subdomain route |
| Encode APIs | Main worker `/api/moviemode/*` today; can offload to this worker later |

### Main worker binding (`inneranimalmedia` / `wrangler.production.toml`)

```toml
[[services]]
binding = "MOVIEMODE_SERVICE"
service = "moviemode-service"
```

Proxy (`src/core/moviemode-service-proxy.js`):

- `/globe` → moviemode-service `/`
- `/globe/globe.js` → `/globe.js`, etc.

Optional shared secret on both workers: `IAM_SERVICE_KEY` (header `X-IAM-Service-Key`).

## Layout

```
moviemode-service/
├── public/                 # Globe landing (served at /)
│   ├── index.html
│   ├── globe.js            # window.GlobeScene — procedural Three.js earth
│   ├── scroll.js
│   └── charts.js
├── studio/                 # Standalone MovieMode Vite app → /studio/
├── worker/src/             # API + webhooks (CloudConvert, Stream, conversions)
├── migrations/
└── scripts/sync-from-iam.sh
```

## Routes (this worker)

| URL | What |
|-----|------|
| `/` | Globe landing |
| `/studio/` | Built studio (`npm run build:all`) |
| `/api/moviemode/*` | Media / conversions / templates |
| `/api/cloudconvert/*` | Presets + jobs |
| `/api/stream/*` | Live inputs + library |
| `/api/webhooks/cloudconvert` | CloudConvert lifecycle |
| `/api/webhooks/stream/*` | Stream VOD + live |
| `/health` | Liveness |

## Secrets

| Secret | Purpose |
|--------|---------|
| `CLOUDCONVERT_API_KEY` | Encode jobs |
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
npm run build:all && npx wrangler deploy
```

## Relationship to inneranimalmedia monorepo

| Concern | Owner |
|---------|--------|
| Dashboard MovieMode UX | `inneranimalmedia/dashboard/features/moviemode` |
| Production APIs (today) | `inneranimalmedia` main worker |
| Product iteration / globe | **This repo** — `npm run sync` keeps parity |
