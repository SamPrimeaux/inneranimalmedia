# MEDIA-VIDEOS-STREAM-LIBRARY-2026-07

**Status:** active plan · parallel agent lanes  
**SSOT:** this file  
**Cursor plan mirror:** `~/.cursor/plans/stream_media_library_0647e3c0.plan.md` (keep in sync if edited)

## Overview

Ship a **Videos** product beside Hosted Images (never mixed) with storage locations **Stream + R2 + Google Drive**, Cloudflare Stream–parity detail for Stream rows, then Veo→Stream ingest and Agent Sam chat UX.

## Product lock

- **Images** stay under `/dashboard/images/*` with **CF Images · R2 · Google Drive**.
- **Videos** are a **sibling gallery** under `/dashboard/images/videos/*` (or `/dashboard/videos/*` alias) — never mixed into Images Storage tiles.
- **Video locations:** Cloudflare Stream · R2 · Google Drive (`All | Stream | R2 | Drive` filters).
- Stream rows get full CF detail tabs; R2/Drive get simpler asset panels + Import to Stream.
- Gen: `veo_generate_video` → Veo 3.1 Thompson arms → default destination **Stream**.
- Docs CTA: https://developers.cloudflare.com/stream/  
- Video Link: `https://{customerSubdomain}/{uid}/watch`

## Shell nav lock (dashboard IA)

**Today (wrong depth):** Images lives under **Create** in [`dashboard/config/shellNav.ts`](../../dashboard/config/shellNav.ts) (`SHELL_PRODUCTS` → create → images), which buries media and makes UX hard.

**Target IA:**

```
Home / New chat / Chats / Projects
Work
Media ▾          ← NEW top-level product (chevron / expandable submenu)
  Images         → /dashboard/images/storage (existing)
  Videos         → /dashboard/images/videos (new)
Code / Create / Collaborate …
```

Rules:

1. Promote **Media** out of **Create** — remove the lone `Images` row from Create.
2. Place **Media** in core/product nav **immediately below Work** (same visual weight as Code/Create/Collaborate, or as a dedicated expandable core row — match existing chevron pattern used by CMS Suite `children`).
3. Media submenu = **Images** · **Videos** only (clean, two children). Movie Mode stays under Create for now.
4. Active state: any `/dashboard/images` or `/dashboard/images/videos` path expands Media and highlights the correct child.
5. Owner: **Cursor Lane A** (touches `shellNav.ts`, `DashboardSidebar.tsx` / resolve helpers). Claude does **not** edit shell nav.

---

## Agent assignment (no overlap)


| Lane | Owner | Scope |
|------|--------|--------|
| **B** | **Claude** | Backend Stream CRUD — **SHIPPED** `ce8c6225` / `965deb40` / `afc59ce8` (`stream-videos-api.js` + `stream-api.js` + mount) |
| **D** | **Claude** | Veo LRO complete → Stream upload + durable `stream_uid` (after B from-url exists) |
| **A** | **Cursor** | Shell: promote **Media ▾** below Work (Images · Videos submenu); Media shell + Overview UI |
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

## Claude progress check (2026-07-24)

Lane B landed on `origin/main` (`ce8c6225` + follow-ups `965deb40` / `afc59ce8`):

- **Owns correctly:** `src/api/stream-videos-api.js` (new), `src/core/stream-api.js` helpers, thin mount in `src/api/moviemode-api.js`.
- **Did not touch:** `shellNav.ts`, `dashboard/components/videos/*`, chat cards, Images UI — **no overlap with Cursor A/C**.
- Local checkout may be **behind** `origin/main` — `git pull` before starting Lane A.
- Still outstanding for Claude: Overview merge `source=all|stream|r2|drive` (if not in those commits); Lane D Veo→Stream after from-url proven.

Cursor Lane A starts with **Media ▾ nav promotion** + Videos overview (does not reimplement Stream REST).

### Fact correction (2026-07-24)

Claude’s earlier note that “Stream has no native tags API” was **wrong for Tags**. Cloudflare **Resource Tagging** supports `resource_type=stream_video` (same product as Images `resource_type=image`). Tags now use that API. **Public Details** remain a meta shim (`meta.iam_public_details`) — watch-page branding is not Resource Tagging.

Also: `watch_url` / `iframe_url` must use the **playback HLS customer subdomain**, never `customer-${accountId}` (that caused iframe 404s).


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
