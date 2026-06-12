# Agent Sam Studio — MovieMode

MovieMode is the AI-assisted media production orchestration layer under Agent Sam Studio. It does not replace Premiere, Resolve, or CapCut; it orchestrates:

`drive_import → analysis → edit plan → timeline → render → variants → R2 publish → CMS attach`

## Storage

- **ARTIFACTS R2:** canonical MovieMode export bytes (`artifacts/{scope}/{workspace_id}/export/{artifact_id}.webm`)
- **D1 (MovieMode lane):** `media_assets`, `moviemode_projects`, `moviemode_timelines`, `moviemode_render_jobs`, `moviemode_exports`, `moviemode_edit_sessions`, `moviemode_templates`, `moviemode_conversion_jobs`, `moviemode_conversions`
- **D1 (optional mirror):** `agentsam_artifacts` (`source=moviemode_export` only — not the primary edit lane)
- **KV:** ephemeral export job status + Veo job polling cache
- **Supabase:** planning mirror / observability (not video bytes)

### Export ingest flow

1. PTY runs `scripts/moviemode-remotion-render.mjs` → `RENDER_DONE`
2. Script POSTs bytes to `/api/moviemode/ingest` (X-Bridge-Key) → `finalizeMoviemodeOutput` writes ARTIFACTS + D1 rows
3. Job KV status moves `rendering` → `uploading` → `done`

### R2 prefix convention (project-scoped media)

```
moviemode/{workspace_id}/{project_slug}/source/{asset_id}/{filename}
moviemode/{workspace_id}/{project_slug}/proxy/{asset_id}/{filename}
moviemode/{workspace_id}/{project_slug}/renders/{render_id}/{filename}
moviemode/{workspace_id}/{project_slug}/exports/{variant_type}/{filename}
```

Legacy compatibility: `moviemode/{project_slug}/{variant_type}/{filename}`

## Render stack

| Layer | Role |
|-------|------|
| Remotion | Branded motion, React timelines, `@remotion/player` preview |
| ffmpeg / MoviePy | Clip assembly, loops, practical transcodes |
| Worker | Auth, metadata, multipart upload broker, job registry — **no heavy encode in Worker** |

## Dashboard media (prerequisite)

- File kind routing: text → Monaco; image/video/audio/pdf/binary → `FilePreview`
- R2 GET supports `Range` for video/audio seeking
- Uploads &gt; 100MB use `/api/r2/multipart/*`

## Templates (starter pack)

Platform templates live in `moviemode_templates` (migration `617`). Pack `starter-broll` — **IAM Starter B-Roll (Free)** — three public Stream clips for Connor and all workspaces:

| Stream UID | Clip |
|------------|------|
| `372d8e5700cd7574ac60a84fe3292293` | gorrilla pov |
| `a7f5bf0f88e31e6fc8405179f6b85680` | rain motorcycle vid - ai |
| `5bbe1ddac1a022562c50f32e33193afc` | ai bike pass |

API: `GET /api/moviemode/templates?pack=starter-broll` · `POST /api/moviemode/templates/:id/apply` (Stream → `media_assets` + timeline add).

## Transcode / conversion jobs

`moviemode_conversion_jobs` queues ffmpeg / CloudConvert / PTY transcodes; completed rows land in `moviemode_conversions`. API: `GET|POST /api/moviemode/conversions`, `PATCH /api/moviemode/conversions/:id` (bridge key for worker finalize).

## Live Input (MeauxCLOUD → Stream → edit)

`moviemode_live_inputs` tracks per-workspace Cloudflare Stream Live Inputs (RTMPS / WebRTC). Migration `618`.

| API | Purpose |
|-----|---------|
| `GET/POST /api/stream/live-inputs` | List / create live input (+ D1 row) |
| `GET/DELETE /api/stream/live-inputs/:id` | Detail / archive |
| `GET /api/stream/webhook` | Current VOD webhook registration |
| `POST /api/stream/webhook/install` | `PUT /accounts/.../stream/webhook` |

**Webhooks** (registry: `agentsam_webhooks` `wh_stream_vod` + `wh_stream_live`; events: `agentsam_webhook_events`):

| Endpoint | Events | Auth |
|----------|--------|------|
| `POST /api/webhooks/stream/vod` | `video.ready`, `video.error` | `Webhook-Signature` + `CLOUDFLARE_STREAM_WEBHOOK_SECRET` |
| `POST /api/webhooks/stream/live` | `live_input.connected`, `live_input.disconnected`, `live_input.errored` | `cf-webhook-auth` + `CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET` |

Install: `./scripts/with-cloudflare-env.sh node scripts/stream-install-webhooks.mjs` or `./scripts/cloudflare/register-stream-notifications.sh --apply-live-secret`.

## CloudConvert conversions

Webhook: `POST /api/webhooks/cloudconvert` (`job.created`, `job.finished`, `job.failed`). Registry: `wh_cloudconvert_main` → `wf_on_cloudconvert`. Verify with `CloudConvert-Signature` + Worker secret `CLOUDCONVERT_WEBHOOK_SECRET` (signing secret from CloudConvert dashboard webhook settings — not the API key).

### Presets (`src/core/cloudconvert-workflows.js`)

| Preset | Outputs |
|--------|---------|
| `video-h264` | MP4 (x264/AAC) |
| `video-h264-gpu` | MP4 (NVENC when available) |
| `video-hevc` | H.265 MP4 |
| `video-av1` | AV1 MP4 |
| `proxy-720p` | 1280×720 proxy |
| `mov-to-mp4` | QuickTime → MP4 |
| `encode-plus-thumb` | MP4 + PNG poster |
| `thumbnail-only` | PNG poster |
| `capture-website-pdf` / `capture-website-png` | `capture_url` required |
| `ffmpeg-custom` | `ffmpeg_arguments` required |

When R2 S3 credentials are configured, jobs use `import/s3` + `export/s3` (no export URL fetch). Otherwise presigned GET + `export/url` + webhook pulls bytes into R2.

### API

| Route | Purpose |
|-------|---------|
| `GET /api/cloudconvert/presets` | Preset catalog + R2-direct flag |
| `GET /api/cloudconvert/operations` | CloudConvert operations/options |
| `POST /api/cloudconvert/jobs` | Enqueue preset job (`preset`, `asset_id`, `capture_url`, `sync`) |
| `GET /api/cloudconvert/jobs/:id` | D1 row + optional remote CC job |
| `POST /api/moviemode/conversions` | Same lane with `service: cloudconvert` |

Example:

```json
{ "service": "cloudconvert", "preset": "video-h264-gpu", "asset_id": "asset_…" }
{ "service": "cloudconvert", "preset": "encode-plus-thumb", "asset_id": "asset_…", "convert_options": { "convert": { "width": 1920 } } }
{ "service": "cloudconvert", "preset": "capture-website-pdf", "capture_url": "https://example.com" }
```

## moviemode-service (product worker)

Dedicated Worker repo: [github.com/SamPrimeaux/moviemode-service](https://github.com/SamPrimeaux/moviemode-service). Monorepo mirror: `services/moviemode-service/`.

**Aligned to inneranimalmedia.com** (not meauxcloud):

| Surface | URL |
|---------|-----|
| Globe landing | `https://inneranimalmedia.com/globe` |
| Work portfolio scene | `https://inneranimalmedia.com/work` (scroll globe replaces first 3 CMS sections; no public tweaks panel) |
| Dashboard studio | `https://inneranimalmedia.com/dashboard/moviemode` |
| Product subdomain (optional) | `https://moviemode.inneranimalmedia.com/` |
| APIs (main worker today) | `/api/moviemode/*`, `/api/cloudconvert/*`, `/api/stream/*` |

Main worker binds `MOVIEMODE_SERVICE` → `moviemode-service` (`wrangler.production.toml`). `GET /globe` proxies to the scroll-driven Three.js scene.

**Product worker deploy (landing only):**

```bash
cd services/moviemode-service && npx wrangler deploy -c wrangler.toml
```

Slim worker: `public/` globe + legacy `/meaux*` — full MovieMode API bundle not wired in this worker yet.

Sync product repo from monorepo: `cd services/moviemode-service && IAM_ROOT=../.. npm run sync`.

### `/work` globe scene (main ASSETS)

Scroll scene on the portfolio page — **no public tweaks panel**. Replaces CMS sections hero + case-study-one/two/three.

| Artifact | R2 key |
|----------|--------|
| Page shell | `pages/work/index.html` |
| Scene assets | R2 `scenes/work-globe/*` → URL `/assets/scenes/work-globe/*` |

Upload (no worker redeploy): `./scripts/upload-work-page.sh`

Handoff: **`docs/platform/work-globe-scene.md`** (CMS sections, tomorrow pickup).

## PTY / Remotion render

| Step | Where |
|------|--------|
| Queue job | `POST /api/moviemode/export` or tool `moviemode.render` → `moviemode_render_jobs` |
| Execute | `execOnPtyHost` → `scripts/moviemode-remotion-render.mjs` on resolved repo |
| Ingest | Script → `POST /api/moviemode/ingest` → ARTIFACTS + D1 |

Terminal: D1 `terminal_connections` — `ORDER BY is_default DESC, target_priority ASC`. See `iam-terminal-connections.mdc`.

## Timeline JSON

See `dashboard/src/types/moviemode.ts` — version `1`, tracks/clips with optional `r2: { bucket, key }` references.

## Next session (pickup)

1. **CMS editor** — `/work` sections (`work-globe-scene`, `case-study-four`, …) editable from dashboard; R2 write + D1 `cms_page_sections` (contact hydrate pattern).
2. **Editor preview** — globe scene with tweaks panel; public pages omit `#tweak-toggle`.
3. **MovieMode renders** — exercise `/dashboard/moviemode` export; confirm PTY `validateMoviemodeRepoOnPty`.
4. **Optional** — full API on moviemode-service worker; `npm run build:all` for `/studio/` subdomain.

## Active plan (Supabase)

`plan_agentsam_studio_moviemode` — Agent Sam Studio — MovieMode Architecture & ATC Pilot
