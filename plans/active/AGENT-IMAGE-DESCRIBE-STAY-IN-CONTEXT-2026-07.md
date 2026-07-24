# Agent image-describe stay-in-context (2026-07)

**Status:** `active` — spine / surface UX; do **not** remaster Integrations UI in the same PR.  
**Priority:** P1 (wrong route + wrong modality for a simple vision ask)  
**Operator:** Sam · `ws_inneranimalmedia`  
**Conversation proof:** `586795be-377b-45a2-8034-d42ebf489736`  
**Turn:** `turn_c45bd2d8980f4de7` · assistant `17e96c10-30dc-4a48-ad71-237f6d3283ec` · agent_run `arun_bf2c7e3e7d9b`  
**Asset:** `img_db7d743d082647a683e13d4c` (`3d-designstudiobgheroimage.webp`)  
**Baseline live SHA:** `e2b7e3115aa01842cbfa3b04ed1ec8516b3f523c`

## Problem (operator)

On `/dashboard/images/img_db7d743d082647a683e13d4c`, user opened a fresh chat and asked to **describe the opened image** (id + attachment). Observed:

1. **Route hijack** → `/dashboard/agent/586795be-…` (full agent workspace) instead of staying on the image detail surface with the Agent Sam rail.
2. Model emitted **Python + OpenCV `code_execution`** to “see” the image (dev feel) instead of a **native multimodal describe**.
3. Monaco opened `agent_output.python` as **“Binary file — preview not available”** even though the stream earlier showed readable Python — bad code preview contract.
4. Scratchpad attachment `image.png` existed; `active_file_context_injected` from github was weak (`path:""`, 108 chars) — image binding to the page asset was incomplete.

## Log summary (WAE / chat_stream 2026-07-24 ~9:55 CDT)

| Signal | Value | Implication |
|--------|--------|-------------|
| Model / arm | `gemini-3.6-flash` / `ra_code_35flash` | Code-leaning Thompson arm for a vision describe ask |
| Profile | `in_app_agent_cf_github` | Agent tool loop, purple write policy |
| Progressive core (8) | `search_tools`, `fs_*`, `terminal_local`, `codebase_retrieve`, `memory_search`, `search_web` | **No vision / images tool in core** |
| Write policy | includes `python.execute`, `media.*`, … | Model free to choose code_execution |
| `session_thin_pipe` | true | Thin allowlist; `forced_explicit_catalog_tool_miss` / `no_forceable_named_tools` |
| `project_ref` | null | No project binding from image surface |
| First token | ~9379 ms | Slow open before text |
| Close | `close_ok` ~19s, text events present | Turn completed; UX still wrong |

**Verdict:** Functionally the model eventually described the image, but the **surface contract failed**: navigate away + code-first analysis + broken Monaco binary preview.

## Desired behavior

1. **Stay on** `/dashboard/images/:id` (sidebar/rail chat). Do **not** `openAgentThreadFullScreen` / navigate to `/dashboard/agent/:conversationId` for a describe-on-open-asset ask unless the user explicitly opens full Agent.
2. Prefer **multimodal vision** on the attached / opened image (Gemini/Claude vision path) — **not** Python OpenCV as the default “see” path.
3. If code artifacts are produced anyway, Monaco must render **text/python**, never “Binary file” for `agent_output.python`.
4. Inject **page image context** (image id, public/variant URL, filename) into session context when chat starts from an image detail route.

## Failure B — image → video ask (2026-07-24 ~10:12 CDT)

**User (same page / same conv):** turn the opened image into a short video clip preview using video tools.  
**UI:** red `✘ url required` after `agentsam_search_tools` + `web_fetch`.  
**agent_run:** `arun_e38eba97eeea` · model `gemini-3.6-flash` / `ra_code_35flash`

| Signal | Value | Implication |
|--------|--------|-------------|
| Progressive core | same 8 thin tools | Veo not on core; must hydrate |
| `media_hydrate_deferred` | `veo_generate_video`, `moviemode_render`, `imgx_generate_image`, `moviemode_export` | reason=`non_media_user_message` — **false negative** |
| Hydrated instead | `web_fetch`, Meshy*, `agentsam_video_embed`, CAD, … (28 tools) | Media-gen family blocked; noise allowed |
| `web_fetch` | `tool_error url required` | Model guessed fetch; no URL in args |
| Close | `Error: Network connection lost` after tool_error | Turn died without Veo |

### Root cause (proof — local replay)

`hasVideoGenerationIntent` in `src/tools/image_generation.js`:

```js
/\b(generate|create|make|produce|render)\b.{0,40}\b(video|clip|footage|movie|animation)\b/i
|| /\b(veo|sora|text.to.video|video.gen|moviemode)\b/i
```

| Phrase | `hasVideoGenerationIntent` | `userMessageAllowsMediaToolHydrate` |
|--------|:---:|:---:|
| `could we possibly turn this into a video using our video creating tools… short clip preview?` | **false** | **false** |
| `turn this into a video` | **false** | **false** |
| `create a short video clip preview` | true | true |

So “turn this into a video” / “video creating tools” never unlocks `veo_*` / `moviemode_*`. `isMediaGenerationToolKey` only gates `imgx_|veo_|moviemode_` — Meshy still hydrated and crowded the menu.

Inverse of `tkt_search_tools_rank_media_last` (don’t hydrate media when *not* asked): here media was asked and still deferred.

### Desired (Failure B)

1. Expand video intent (or page-context pin) so image-detail “make/turn into video/clip/preview” hydrates `veo_generate_video` (+ optional moviemode).
2. When on `/dashboard/images/:id`, pin image URL / `img_*` into tool args context so Veo image-to-video has a source — never require `web_fetch` for the open asset.
3. Fail loud with a recoverable assistant message if Veo still cannot run; do not dead-end on `web_fetch` `url required`.

## Failure C — Veo hydrated but handler missing (2026-07-24 ~10:14 CDT)

**agent_run:** `arun_bebb588ecf5e` · model `claude-haiku-4-5-20251001` · chat **Canceled** after tool_error  
**UI:** `media handler not registered: veo_generate_video` after search returned the catalog row.

| Signal | Value | Implication |
|--------|--------|-------------|
| Hydrate | `veo_generate_video` **added** (no media_hydrate_deferred) | Intent gate OK this turn |
| Exec | `tool_error veo_generate_video media handler not registered` | Catalog `handler_type=media` → `media.js` only |
| Truth | Handler lives in `src/tools/builtin/moviemode.js` | `ai-dispatch.js` already routes Veo/MovieMode there |

**Fix:** `catalog-tool-executor.js` media/canvas case falls back to `moviemode` handlers with `(env, params)` + identity merge (parity with `ai-dispatch`).

## Evidence (R2 — before snapshots)

Prefix `ticket-evidence/2026-07-24-media-qa/` on bucket `inneranimalmedia`:

| Key | What |
|-----|------|
| `03-image-detail-agent-rail-house-variations.png` | Image detail + rail (stale prior task) |
| `04-agent-route-describe-redirect.png` | Forced `/dashboard/agent/…` |
| `05-agent-python-code-execution.png` | Python OpenCV path |
| `06-monaco-binary-agent-output-python.png` | Binary preview fail |
| `07-image-detail-sidebar-describe-python.png` | Describe still via Python on image route (later state) |
| `08-image-to-video-url-required.png` | Video ask → `✘ url required` / web_fetch |

## Acceptance

- [ ] Describe-from-image-detail keeps URL on `/dashboard/images/:id`.
- [ ] Default path uses vision / multimodal; no automatic `code_execution` for “describe this image.”
- [ ] Page asset id + attachment bound in context (`img_*` + URL).
- [ ] Monaco shows Python source when an artifact is text.
- [ ] “Turn this into a video / short clip preview” from image detail → `veo_generate_video` hydrated (not deferred as `non_media_user_message`).
- [ ] Catalog exec of `veo_generate_video` / `moviemode_*` resolves moviemode handlers (no `media handler not registered`).
- [ ] No `web_fetch` required to reference the open hosted image for image→video.
- [ ] Tier 1 + Tier 2 E2E with conversation + turn ids before `shipped`.

## Related

- Spine / progressive tools: `src/core/progressive-tool-discovery.js`, `agent-controller.js`
- Video intent: `hasVideoGenerationIntent` in `src/tools/image_generation.js`
- Inverse media-rank ticket: `tkt_search_tools_rank_media_last`
- Navigation: `dashboard/lib/openAgentConversation.ts` (`openAgentThreadFullScreen`)
- Vision attachments rule: `.cursor/rules/iam-chat-vision-attachments.mdc`
- P0 spine ticket may absorb multimodal pieces — keep **route stay** + **no-python-first** + **video intent hydrate** as explicit acceptance here.
