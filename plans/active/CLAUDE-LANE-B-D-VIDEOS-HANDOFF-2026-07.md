# Claude — Lane B (+ D) handoff

Read first: [`plans/active/MEDIA-VIDEOS-STREAM-LIBRARY-2026-07.md`](../active/MEDIA-VIDEOS-STREAM-LIBRARY-2026-07.md)

You are **Claude**. Cursor owns UI/chat/ship. **Do not overlap.**

## Your lanes

### Lane B (start now)

Expand Cloudflare Stream backend so Cursor can build Overview + detail tabs.

1. Extend [`src/core/stream-api.js`](../../src/core/stream-api.js): get/update/delete video, downloads, captions, public-details, tags, from-url, direct-upload. Every detail response must include `watch_url`, `iframe_url`, `customer_subdomain`, `hls`, `dash`, `thumbnail`.
2. Prefer new [`src/api/stream-videos-api.js`](../../src/api/stream-videos-api.js) mounted from the worker router; only touch [`src/api/moviemode-api.js`](../../src/api/moviemode-api.js) if you must re-export existing `GET /api/stream/videos`.
3. Add Overview merge list: `source=all|stream|r2|drive` (reuse Images Drive connect + R2 video mime listing patterns; do not put rows into `/api/images`).
4. Optional client URL helper only: `dashboard/components/videos/videosApi.ts` (paths/types — no React pages).

### Lane D (after `POST /api/stream/videos/from-url` works)

1. Complete Veo LRO in [`src/tools/builtin/moviemode.js`](../../src/tools/builtin/moviemode.js).
2. Upload result to Stream via from-url helper.
3. Persist `stream_uid` on `media_assets` (preferred) or thin `video_generation_drafts` — **not** CF Images `committed_image_id`.

## Do not touch

- `dashboard/config/shellNav.ts`, `DashboardSidebar.tsx`, Media ▾ nav promotion (Cursor A)
- `dashboard/components/videos/Videos*.tsx` pages (Cursor A/C)
- `ImagesShell.tsx` / Overview UI / App.tsx routes (Cursor A)
- `AgentVideoGenerationCard`, chat SSE merge, scratchpad UI (Cursor E)
- `AgentImageGenerationCard`, `image_generation.js` format work
- `deploy:fast` / PWA publish (Cursor F)

## Shared files (announce before edit)

- `dashboard/App.tsx` — Cursor owns route wiring; you do not add routes unless Cursor asks.
- `videosApi.ts` — you may create URL builders; Cursor imports them.

## Proof when Lane B is done

Paste:

```bash
# list
curl -sS "$ORIGIN/api/stream/videos?limit=5" -H "Cookie: …" | head
# detail (use a real uid from list)
curl -sS "$ORIGIN/api/stream/videos/$UID" -H "Cookie: …" | jq '{uid,watch_url,iframe_url,customer_subdomain,hls}'
```

Then tell Cursor: **Lane B GET `:uid` ready** so Lane C can start.

## Product reminders

- Videos locations: Stream + R2 + Drive (not Stream-only).
- Stream detail tabs must be API-real; R2/Drive stay simple panels.
- Docs: https://developers.cloudflare.com/stream/
- Watch: `https://{customerSubdomain}/{uid}/watch`
- Tool/model: `veo_generate_video` / Veo 3.1 arms only for gen.
