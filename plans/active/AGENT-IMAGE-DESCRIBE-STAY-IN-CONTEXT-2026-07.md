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

## Evidence (R2 — before snapshots)

Prefix `ticket-evidence/2026-07-24-media-qa/` on bucket `inneranimalmedia`:

| Key | What |
|-----|------|
| `03-image-detail-agent-rail-house-variations.png` | Image detail + rail (stale prior task) |
| `04-agent-route-describe-redirect.png` | Forced `/dashboard/agent/…` |
| `05-agent-python-code-execution.png` | Python OpenCV path |
| `06-monaco-binary-agent-output-python.png` | Binary preview fail |
| `07-image-detail-sidebar-describe-python.png` | Describe still via Python on image route (later state) |

## Acceptance

- [ ] Describe-from-image-detail keeps URL on `/dashboard/images/:id`.
- [ ] Default path uses vision / multimodal; no automatic `code_execution` for “describe this image.”
- [ ] Page asset id + attachment bound in context (`img_*` + URL).
- [ ] Monaco shows Python source when an artifact is text.
- [ ] Tier 1 + Tier 2 E2E with conversation + turn ids before `shipped`.

## Related

- Spine / progressive tools: `src/core/progressive-tool-discovery.js`, `agent-controller.js`
- Navigation: `dashboard/lib/openAgentConversation.ts` (`openAgentThreadFullScreen`)
- Vision attachments rule: `.cursor/rules/iam-chat-vision-attachments.mdc`
- P0 spine ticket may absorb multimodal pieces — keep **route stay** + **no-python-first** as explicit acceptance here.
