# MEDIA-VIDEOS-STREAM-LIBRARY-2026-07

**Status:** active plan · parallel agent lanes  
**SSOT:** this file  
**Cursor plan mirror:** `~/.cursor/plans/stream_media_library_0647e3c0.plan.md` (keep in sync if edited)

## Overview

Ship a **Videos** product beside Hosted Images (never mixed) with storage locations **Stream + R2 + Google Drive**, Cloudflare Stream–parity detail for Stream rows, then Veo→Stream ingest and Agent Sam chat UX.

## Product lock

- **Images** stay under `/dashboard/images/*` with **CF Images · R2 · Google Drive**.
- **Videos** are a **sibling gallery** — never mixed into Images Storage.
- **Video locations:** Cloudflare Stream · R2 · Google Drive (`All | Stream | R2 | Drive` filters).
- Stream rows get full CF detail tabs; R2/Drive get simpler asset panels + Import to Stream.
- Gen: `veo_generate_video` → Veo 3.1 Thompson arms → default destination **Stream**.
- Docs CTA: https://developers.cloudflare.com/stream/  
- Video Link: `https://{customerSubdomain}/{uid}/watch`

## Agent assignment (no overlap)

| Lane | Owner | Scope |
|------|--------|--------|
| **B** | **Claude** | Backend Stream CRUD + list merge APIs (`stream-api.js`, `/api/stream/*`, optional `stream-videos-api.js`) |
| **D** | **Claude** | Veo LRO complete → Stream upload + durable `stream_uid` (after B from-url exists) |
| **A** | **Cursor** | Media shell Images\|Videos + Overview UI (All\|Stream\|R2\|Drive) |
| **C** | **Cursor** | Stream detail tab UIs + R2/Drive panels (consumes B APIs only) |
| **E** | **Cursor** | Chat SSE card / scratchpad / rate / veo pin (after D) |
| **F** | **Cursor** | Integrate, validate, `deploy:fast` |

**Shared touch (coordinate, do not dual-edit blindly):** `dashboard/App.tsx` routes · `dashboard/components/videos/videosApi.ts` (Claude defines URL helpers; Cursor imports).

**Claude must not edit:** `AgentImageGenerationCard.tsx`, image gen chat stream merge, Images Storage pages (except reading for patterns).  
**Cursor must not expand:** Stream REST helpers beyond calling Claude’s APIs.

---

## UX contracts

### Overview `/dashboard/images/videos`

- Source tabs: `All | Stream | R2 | Drive`
- Open documentation → https://developers.cloudflare.com/stream/
- Quick Upload / Use Link / Use API (Stream and/or R2 destinations)
- List: thumbnail, name, duration/size, status, created, source badge

### Stream detail `/dashboard/images/videos/:uid/{settings|downloads|captions|embed|json|public-details}`

Real tabs (no stubs): Settings · Downloads · Captions · Embed · JSON · Public Details · Tags  
Video Link → `https://{subdomain}/{uid}/watch`

### R2 / Drive detail

Preview, path/id, delete, Import to Stream — **no** fake Stream Settings/Captions/Embed.

---

## Lane B API surface (Claude)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/stream/videos` | List (exists — extend with richer fields) |
| GET | `/api/stream/videos/:uid` | Details + `watch_url`, `iframe_url`, `customer_subdomain`, hls/dash/thumbnail |
| PATCH | `/api/stream/videos/:uid` | Settings / meta / requireSignedURLs / allowedOrigins |
| DELETE | `/api/stream/videos/:uid` | Delete |
| GET/POST/DELETE | `/api/stream/videos/:uid/downloads` | MP4 (+ M4A if supported) |
| GET/POST/DELETE | `/api/stream/videos/:uid/captions` | Captions |
| GET/PUT | `/api/stream/videos/:uid/public-details` | Public watch metadata |
| POST/DELETE | `/api/stream/videos/:uid/tags` | Tags |
| POST | `/api/stream/videos/from-url` | Copy from URL |
| POST | `/api/stream/direct-upload` | Direct creator upload URL |
| GET | `/api/videos` or extend list | Merge `?source=all\|stream\|r2\|drive` for Overview |

Owner files: `src/core/stream-api.js`, prefer new `src/api/stream-videos-api.js` if `moviemode-api.js` is too large; mount from worker router.

## Lane D (Claude, after from-url)

- Poll Veo LRO → Stream copy-from-URL → persist `stream_uid` on `media_assets` (or thin `video_generation_drafts`).
- Owner: `src/tools/builtin/moviemode.js` + stream upload helper in `stream-api.js`.

## Lane A / C / E / F (Cursor)

See parallel contracts in Cursor plan; UI under `dashboard/components/videos/*`, shell in `ImagesShell.tsx`.

## Kickoff order

1. Claude **B** + Cursor **A** in parallel  
2. Cursor **C** when GET `:uid` is live  
3. Claude **D** when from-url works  
4. Cursor **E** then **F** ship  

## Non-goals

- Mixing video tiles into Images Storage  
- Fake Stream tabs on R2/Drive  
- Sora / MovieMode Remotion in chat v1  
- Image `committed_image_id` / gate_runs bookkeeping in this plan  

## Validation

- [ ] Overview lists Stream (+ R2/Drive when filtered)  
- [ ] Docs CTA + Video Link work  
- [ ] All six Stream tabs real or fail loud  
- [ ] Settings/Downloads/Captions/Embed/JSON/Public Details/Tags  
- [ ] Veo chat → same `stream_uid` in Overview + Scratchpad (after D+E)  
