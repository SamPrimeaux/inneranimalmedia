# MovieMode — Infrastructure & Product Plan

**Status:** Living doc · **Git baseline:** `d020c060` (mobile home shell + create-surface chrome)  
**Audience:** Engineering + Agent Sam context (also indexed from `inneranimalmedia-autorag`)

---

## 1. Where we are (honest, shipped)

### Workers

| Worker | Role today | Deploy |
|--------|------------|--------|
| **`inneranimalmedia`** | Dashboard, all `/api/moviemode/*`, CloudConvert, Stream, export/ingest, D1, cron (Veo poll) | `npm run deploy:full` |
| **`moviemode-service`** | Globe landing (`moviemode.inneranimalmedia.com`), legacy `/meaux*`, optional `/studio/` static | `npx wrangler deploy -c services/moviemode-service/wrangler.toml` |

Main worker binds `MOVIEMODE_SERVICE` for **`GET /globe` proxy only**. Full MovieMode API is **not** offloaded to the product worker yet (sources mirrored under `services/moviemode-service/worker/src/` for future use).

### Dashboard (Movie Mode UX)

| Shipped | Route / component |
|---------|-------------------|
| Dedicated route | `/dashboard/moviemode`, sub-routes `templates`, `ai-studio`, `projects` |
| Mobile home shell | Hero, New movie, Import from Stream, recent projects, AI tools grid |
| Bottom nav | Editor · Templates · AI Studio · Projects (replaces global Chat/Database on mobile) |
| Create-surface chrome | Status bar (git/notifications lip) hidden on Create routes |
| Editor workbench | Media bin + preview + timeline (desktop layout; mobile editor refactor pending) |
| Export panel | Modal + Remotion job queue; auto local download (destination sheet pending) |

### Backend lanes (main worker)

| Concern | Implementation |
|---------|----------------|
| Projects / timelines / sessions | D1 `moviemode_*` + KV session mirror |
| Export render | `POST /api/moviemode/export` → **Workers VPC `PTY_SERVICE`** → `scripts/moviemode-remotion-render.mjs` |
| Export bytes | PTY script → `POST /api/moviemode/ingest` → **`artifacts` R2** + D1 |
| Conversions | `moviemode_conversion_jobs` + CloudConvert presets (`src/core/cloudconvert-workflows.js`) |
| Stream live/VOD | Webhooks → `media_assets` + `moviemode_live_inputs` |
| Media search | Gemini embeddings → **`AGENTSAM_VECTORIZE_MEDIA`** (not OpenAI lane) |
| Agent tools | `moviemode.render`, Veo poll cron, migration `615` artifact link |

### Private compute (already live)

```toml
# wrangler.production.toml
[[vpc_services]]
binding = "PTY_SERVICE"
service_id = "019db639-7c70-7071-8ef3-32ec0392a9ff"
remote = true
```

Remotion/ffmpeg **does not run in the Worker** — it runs on the private iam-pty host reachable via VPC.

---

## 2. Where we are building (strategic, not hypothetical)

### Architecture target

```
┌─────────────────────────────────────────────────────────────┐
│  Edge — inneranimalmedia Worker                             │
│  Auth · D1 · KV jobs · webhooks · dashboard APIs            │
│  Bindings: DB, ARTIFACTS, ASSETS, AUTORAG (docs only),      │
│            AGENTSAM_VECTORIZE_MEDIA, PTY_SERVICE (VPC),       │
│            MOVIEMODE_RENDER (Container — planned),            │
│            MOVIEMODE_SERVICE (globe proxy)                    │
└───────────────┬─────────────────────────────┬───────────────┘
                │ VPC / Container               │ R2 / Stream
                ▼                               ▼
┌───────────────────────────┐     ┌────────────────────────────┐
│  Private render compute    │     │  Storage lanes              │
│  Phase A: PTY + Remotion   │     │  inneranimalmedia/moviemode/│
│  Phase B: Container image  │     │  artifacts/ (exports)       │
│  Phase C: ffmpeg pool CC   │     │  Stream (delivery)          │
└───────────────────────────┘     └────────────────────────────┘
                │
                ▼
┌───────────────────────────┐
│  CloudConvert (SaaS)       │
│  capture · transcode · thumb│
│  webhook → D1 finalize     │
└───────────────────────────┘
```

### Sprint map (UX + infra)

| Win | Focus | Owner |
|-----|-------|-------|
| **1** ✅ | Mobile home + bottom nav + create chrome | Dashboard |
| **2** | Export sheet (resolution/fps/quality) + **destination picker** (local / Drive / R2 / Stream / Artifacts) | Dashboard + `/api/moviemode/assets/save` |
| **3** | Session → timeline hydration (real D1 data, not empty seed) | `useMovieModeProject` + API |
| **4** | Mobile editor layout (preview-on-top, stacked tracks, bottom tool dock) | Dashboard |
| **5** | Render VPC HTTP service (replace exec heredoc) | Main worker + private host |
| **6** | Container render image (`MOVIEMODE_RENDER` binding) | Main worker + CF Containers |
| **7** | Optional API offload to `moviemode-service` | Product worker |
| **8** | Project thumbnails + duration on Projects tab | D1 + CloudConvert `thumbnail-only` or Stream |

---

## 3. Which worker gets the Container?

**Answer: `inneranimalmedia` (main worker), not `moviemode-service`.**

| Worker | Container? | Why |
|--------|------------|-----|
| **`inneranimalmedia`** | **Yes** — `MOVIEMODE_RENDER` container binding | Owns auth, D1 jobs, ingest bridge, webhooks, session cookies |
| **`moviemode-service`** | **No** (stay slim) | Marketing globe + legacy routes; optional future **API route offload** only |
| **Private VPC host (today)** | N/A (PTY shell) | Bridge until container image is production-ready |

### Container image contents (planned)

- Node 22 + `@remotion/bundler` + `@remotion/renderer` + Chromium deps
- ffmpeg (proxy generation, loudnorm, concat)
- HTTP API: `POST /render`, `GET /health`, optional `POST /proxy`
- Env: `AGENTSAM_BRIDGE_KEY`, `IAM_ORIGIN` for ingest callback

### Why not run Container on moviemode-service?

Product worker lacks dashboard session middleware, agent tool registry, and unified webhook ingest. Duplicating those bindings creates two sources of truth for D1 writes and workspace auth.

---

## 4. R2 strategy — dedicated MovieMode bucket?

### Recommendation: **no new bucket for v1–v2**

Use **prefix lanes** on existing buckets:

| Bucket | Prefix / pattern | Content |
|--------|------------------|---------|
| **`inneranimalmedia` (ASSETS)** | `moviemode/{workspace_id}/{project_slug}/source\|proxy\|renders\|exports\|converted/` | Project media, CloudConvert outputs, proxies |
| **`artifacts` (ARTIFACTS)** | `{scope}/{workspace_id}/export/{artifact_id}.webm` | **Finished** user exports only (library UX) |
| **`inneranimalmedia-autorag` (AUTORAG)** | `docs/`, `skills/` | Markdown docs, runbooks, agent context — **never raw video** |

### Dedicated `moviemode-media` bucket — pros / cons

| Pros | Cons |
|------|------|
| Isolated lifecycle (expire proxies, keep sources) | Extra Wrangler binding on main + product worker |
| Cleaner IAM policies for BYOK customers | Cross-bucket copy for Artifacts export ingest |
| Separate analytics / billing | CloudConvert `export/s3` must target correct bucket |
| Easier “delete all MovieMode data” | Migration from existing `moviemode/` prefixes |

**Trigger for dedicated bucket:** BYOK multi-tenant isolation or >10TB MovieMode-only storage with different retention than general ASSETS.

---

## 5. `inneranimalmedia-autorag` — what belongs there

**Purpose:** Agent-readable knowledge (RAG documents lane), not media bytes.

| Upload path | Content |
|-------------|---------|
| `docs/platform/workers-vpc-moviemode.md` | Workers VPC + PTY + container plan |
| `docs/MOVIEMODE-INFRA-PLAN.md` | This file |
| `docs/MOVIEMODE.md` | API reference (sync from repo) |
| `skills/moviemode/` | Export runbooks, CloudConvert preset guide |
| `docs/cloudconvert/` | Operation cheat sheets (capture, thumbnail, optimize, command) |

**Indexed into:** `AGENTSAM_VECTORIZE_DOCUMENTS` via queue ingest (`src/queue/docs-vectorize.js`), not `AGENTSAM_VECTORIZE_MEDIA`.

**Video / audio bytes:** `media_assets` + project R2 + optional Stream UID → **`AGENTSAM_VECTORIZE_MEDIA`**.

---

## 6. CloudConvert — status & integration

### Verified (2026-06-12)

```bash
./scripts/with-cloudflare-env.sh node scripts/cloudconvert-smoke-capture.mjs
```

| Check | Result |
|-------|--------|
| `CLOUDCONVERT_API_KEY` | ✅ Valid (628 credits on account) |
| `capture-website` → PNG | ✅ `https://inneranimalmedia.com` captured in ~8s |
| Webhook registered in CC dashboard | ⚠️ **0 webhooks** — async production jobs won't finalize to D1/R2 until registered |
| Worker secret `CLOUDCONVERT_WEBHOOK_SECRET` | Set last night (verify with sync script) |

### Register webhook (required for async)

1. CloudConvert dashboard → Webhooks → Add  
   - URL: `https://inneranimalmedia.com/api/webhooks/cloudconvert`  
   - Events: `job.created`, `job.finished`, `job.failed`
2. Sync signing secret:

```bash
./scripts/with-cloudflare-env.sh node scripts/cloudconvert-sync-webhook-secret.mjs
# then wrangler secret put CLOUDCONVERT_WEBHOOK_SECRET
```

3. Confirm R2 direct path (optional, faster):

```bash
# Requires R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY on worker
GET /api/cloudconvert/presets  →  "r2_direct_storage": true
```

### Presets (already in code)

| Preset | CloudConvert op | Use |
|--------|-----------------|-----|
| `capture-website-png` | capture-website | Site previews, marketing captures |
| `capture-website-pdf` | capture-website | PDF print of URL |
| `video-h264` / `video-h264-gpu` | convert | Transcode uploads |
| `proxy-720p` | convert | Editor proxies |
| `encode-plus-thumb` | convert + thumbnail | Export + poster |
| `thumbnail-only` | thumbnail | Project list thumbnails |
| `ffmpeg-custom` | command | Custom ffmpeg args |

### Production API

```http
POST /api/cloudconvert/jobs
Content-Type: application/json
Cookie: session …

{
  "preset": "capture-website-png",
  "capture_url": "https://inneranimalmedia.com",
  "convert_options": {
    "capture": {
      "screen_width": 1440,
      "wait_until": "networkidle2",
      "filename": "homepage.png"
    }
  }
}
```

Same lane via MovieMode: `POST /api/moviemode/conversions` with `"service": "cloudconvert"`.

Webhook handler: `POST /api/webhooks/cloudconvert` → `moviemode-cloudconvert-webhook.js` → R2 + `moviemode_conversions`.

---

## 7. CloudConvert value by dashboard surface

### `/dashboard/moviemode` — **primary**

| Feature | CloudConvert preset | UX win |
|---------|---------------------|--------|
| Project thumbnail | `thumbnail-only` / `encode-plus-thumb` | CapCut-style project cards |
| Import odd formats | `mov-to-mp4`, `video-h264` | User drops ProRes/MOV |
| Proxy for timeline | `proxy-720p` | Smooth mobile preview |
| Captions prep | convert + Whisper (Worker) | Cheaper than full re-encode |
| Website/B-roll capture | `capture-website-png` | Reference frame from URL |

### `/dashboard/artifacts` — **secondary**

| Feature | Preset | Win |
|---------|--------|-----|
| PDF/PNG preview of linked URL | `capture-website-pdf/png` | Artifact metadata card |
| Optimize large PDF attachment | optimize (future preset) | Smaller library storage |
| Video artifact proxy | `proxy-720p` | Preview without full download |

### `/dashboard/designstudio` — **high value**

| Feature | Preset | Win |
|---------|--------|-----|
| GLB/scene marketing shot | `capture-website-png` on published preview URL | Thumbnail for 3D projects |
| Export canvas to PNG/PDF | capture or convert | Share static comps |
| Texture/video normalize | `video-h264` | Consistent engine inputs |

Design Studio already benefits from **capture-website** for portfolio shots without running headless Chrome on PTY.

### `/dashboard/draw` — **light**

| Feature | Preset | Win |
|---------|--------|-----|
| Excalidraw export → optimized PNG/PDF | convert / optimize | Smaller share files |
| Scene capture | `capture-website-png` on shared draw link | Thumbnail in projects list |

Draw is vector-first; CloudConvert is **export polish**, not core editing.

---

## 8. End-to-end flows (target state)

### Export (Remotion — private compute)

1. User taps Export → settings sheet → destination choice  
2. `POST /api/moviemode/export` → D1 + KV `rendering`  
3. **VPC or Container** runs Remotion  
4. `POST /api/moviemode/ingest` → **ARTIFACTS**  
5. Optional mirror: Drive / BYOK R2 / Stream via `/api/moviemode/assets/save`  
6. UI polls until `done`; download via `/api/artifacts/:id/content`

### Transcode (CloudConvert — SaaS)

1. User imports MOV / requests proxy  
2. `POST /api/cloudconvert/jobs` → D1 `moviemode_conversion_jobs`  
3. CloudConvert runs (import/s3 if R2 creds configured)  
4. Webhook `job.finished` → Worker pulls or reads S3 export → `moviemode/{ws}/{project}/converted/`  
5. New `media_assets` row → timeline add

### Search (Vectorize — Worker)

1. `POST /api/moviemode/embed` or auto on upload  
2. Gemini embedding → **AGENTSAM_VECTORIZE_MEDIA**  
3. AI Studio / media bin: “find rain clip”

---

## 9. Secrets & bindings checklist

| Name | Where | Purpose |
|------|-------|---------|
| `CLOUDCONVERT_API_KEY` | Main worker secret | Job create |
| `CLOUDCONVERT_WEBHOOK_SECRET` | Main worker secret | Webhook HMAC |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Main worker secret | CC import/s3 + export/s3 |
| `AGENTSAM_BRIDGE_KEY` | Main worker + PTY host | Ingest auth |
| `PTY_SERVICE` | VPC binding | Remotion render (today) |
| `MOVIEMODE_SERVICE` | Service binding | Globe proxy |

---

## 10. Immediate action items

1. **Register CloudConvert webhook** — `./scripts/with-cloudflare-env.sh node scripts/cloudconvert-register-webhook.mjs` (then sync secret).  
2. **Run capture smoke after webhook:** `./scripts/with-cloudflare-env.sh node scripts/cloudconvert-smoke-capture.mjs`  
3. **Win 2:** Export destination sheet (dashboard).  
4. **Win 3:** Session → timeline hydration.  
5. **Upload docs to autorag** (see `scripts/upload-moviemode-docs-autorag.sh`).  
6. **Plan Container image** on main worker when PTY queue latency hurts UX.

---

## Related files

| Path | Topic |
|------|-------|
| `docs/MOVIEMODE.md` | API + storage reference |
| `docs/platform/workers-vpc-moviemode.md` | VPC deep dive |
| `src/core/cloudconvert-workflows.js` | Preset definitions |
| `src/core/moviemode-cloudconvert-webhook.js` | Webhook → R2 finalize |
| `scripts/cloudconvert-register-webhook.mjs` | Idempotent webhook registration via API |
| `scripts/cloudconvert-smoke-capture.mjs` | Live API test |
| `scripts/cloudconvert-sync-webhook-secret.mjs` | Webhook secret sync |
| `dashboard/config/shellChrome.ts` | Create-surface status bar rules |
