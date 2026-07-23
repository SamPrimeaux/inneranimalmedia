# Agent file-create / HTML turn failures — handoff report (2026-07-22)

**Status:** PREDECESSOR CONTEXT (2026-07-22) — not a separate open mega-ticket. Criteria below were cross-checked 2026-07-23 against compute-lane work.  
**Operator:** Sam (`au_871d920d1233cbd1`) · `ws_inneranimalmedia`  
**Symptom (operator):** Asking for simple file create / styled HTML fails; models wander into search → image → empty hosted shell; UI sometimes dies; “not one model capable of making simple files.”

### Acceptance criteria status (2026-07-23 cross-check)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `fs_write_file` without `imgx_*` / empty hosted shell | Partial — progressive core + empty-shell recover shipped; inventable text after `commands:[]` still needs live 1b proof |
| 2 | No `close_done_no_token` after empty shell | Partial — covered by `tkt_hosted_shell_executor_contract` (1b); not GREEN until live empty-shell pass |
| 3 | `agentsam_workspace_search` empty path doesn't hard-fail | **OPEN** → `tkt_workspace_search_empty_path` (tool-selection / param validation — **not** compute-lane) |
| 4 | "Styled HTML" doesn't trigger image gen unless asked | **OPEN** → `tkt_search_tools_rank_media_last` (media-only ranking) |
| 5 | No new keyword hardcode matrix | Held |
| 6 | Vague fast-lane questions don't hydrate GitHub write/PR/tree | **OPEN** → `tkt_search_tools_hydrate_scope_by_intent` (**split** from media ticket) |
| 7 | Raw `tool_error` / timeout never shown as assistant text | **SHIPPED** → `tkt_tool_error_visible_text` |
| 8 | `fs_write_file` HTML bodies don't die on truncated tool JSON | **OPEN (P0)** → `tkt_fs_write_html_args_parse` |

Do **not** fold #3/#4/#6 into hosted-shell 1a/1b. Keep **#4 media** separate from **#6 hydrate scope**. Treat **#7/#8** as P0 write-path reliability.

---

## Verdict for the next agent

`fs_write_file` **is already on the progressive core menu** (7 tools). The failures are **not** “write tool missing.” They are:

1. **Turn hijacks** (empty OpenAI hosted shell, approval-dead-ends — partly fixed earlier).
2. **Wrong tool choice after `agentsam_search_tools`** (image / workspace_search / CMS noise).
3. **Broken tool contracts** (`agentsam_workspace_search` with `path: ""`).
4. **UI crash** on agent replies with short code fences (`onOpenMonaco` — **fixed** in `bec3bfa4`).
5. **Deploy/SW boot recovery** false “App didn’t load” — **mitigated** in `e15466fc`.

A prior Agent file proof **did** succeed on Mac PTY (`27ce2fbe-…`, `.scratch/…edited_ok=1`) then UX crashed — operator correctly treated that as a hard fail even though the worker wrote the file.

---

## Conversation evidence (today)

### A. HTML / “build me an example” — empty hosted shell, no reply

| Field | Value |
|-------|--------|
| Conversation | `3880f2b4-ae39-4d75-9539-667b10a9262b` |
| Time | ~2026-07-22 17:05 CDT |
| Model | `gpt-5.6-terra` / `ra_gpt56terra_code` |
| Core tools | 7 including `fs_write_file` |
| What happened | `openai_hosted_shell_calls` count=1; UI showed **commands: []**; stream `close_done_no_token`; “Agent finished without a visible reply” |
| Did not call | `fs_write_file` |

**Log fingerprints:**
- `[agent] openai_hosted_shell_calls {"count":1,...}`
- `[chat_stream] close_done_no_token` … `tool_call:1` … **no `text`**
- UI: Agentsam openai hosted shell → empty `commands`

**Next-agent ask:** Why does an empty hosted-shell call end the turn with no assistant text? Should empty `commands` be rejected and the model loop continue? File: `src/core/openai-hosted-shell.js` (+ tool-loop handling of hosted shell results).

---

### B. “Fully styled HTML so I can get a visual” → image gen + error close

| Field | Value |
|-------|--------|
| Conversation | `a7f8b06a-4c10-41dc-9812-87bf3049fa59` |
| Time | ~17:07–17:08 CDT |
| Model | `gpt-5.6-terra` |
| Turn 1 | `agentsam_search_tools` |
| Hydrate (bad) | `imgx_generate_image`, `veo_generate_video`, CF images, CMS, terminal sandbox, … (`active_tools` 19) |
| Turn 2 | **`imgx_generate_image`** (Gemini flash image) — operator asked for **HTML**, not an asset |
| Then | hosted shell again → `close_with_error` after image surface events |
| Also live | `GET …/images/gen-1784758104387-….jpg` |

**Log fingerprints:**
- `[progressive-tools] hydrated {"added":[... "imgx_generate_image","veo_generate_video", ...]}`
- `[agent] tool_execution_start {"tool_name":"imgx_generate_image"...}`
- `[chat_stream] close_with_error` … `image_generation_*` … `error:1` … `saw_token:false`

**Next-agent ask:** Progressive hydrate after search is dumping media tools into a **code** session. Prefer ranking / ceiling that keeps `fs_write_file` / `agentsam_cms_save_page_html` ahead of `imgx_*` unless the user explicitly asked for an image/video. Avoid keyword hardcodes that mirror the same bug class — fix **search hydrate ranking + tool-result feedback** so the model sees “HTML → write file.”

---

### C. Follow-up: search finds `fs_write_file`, then `workspace_search` with empty path

| Field | Value |
|-------|--------|
| Same conversation | `a7f8b06a-…` |
| Time | ~17:09–17:10 CDT |
| Turn 1 | `agentsam_search_tools` (query about Monaco / create HTML) |
| Hydrate (better) | `fs_edit_file`, `agentsam_cms_save_page_html`, `agentsam_workspace_search`, … — **`fs_write_file` already in core** |
| Turn 2 | `agentsam_workspace_search` with `"path": ""` → **`path required`** |
| UI | GAME OVER / waiting UI; no HTML file written |

**Log fingerprints:**
- `[agent] tool_execution_start {"tool_name":"agentsam_workspace_search"...}`
- `[agent] tool_error agentsam_workspace_search path required`
- Screenshot request JSON: `path: ""`, `file_pattern: "*.html"`

**Next-agent ask:**
1. Tool schema / executor: empty `path` should default to workspace root (or reject with a fix hint that doesn’t kill the turn).
2. Why does the model call workspace search for HTML create at all when `fs_write_file` is already listed? System/tool descriptions may under-sell write.

---

### D. Earlier PTY proof (context — not today’s HTML ask)

| Field | Value |
|-------|--------|
| Conversation | `27ce2fbe-ed93-45b4-b4e3-d0f60876f24a` |
| Result | write→read→write→read **success**; file on disk with `edited_ok=1` via `conn_mac_local` |
| Then | Dashboard crash / “App didn’t load” (operator hard-fail) |

**UI crash root cause (shipped):** `AgentMessageList` short fence used undefined `onOpenMonaco` → `ReferenceError` → React death. Fix: `bec3bfa4`.

**Boot recovery (shipped mitigation):** `e15466fc` — stop firing recovery on every `window.error`; SW `skipWaiting`/`clientsClaim` false.

---

## What is NOT the problem

- **Missing `fs_write_file` in Agent mode.** Logs show `core: […, "fs_write_file", …]` and `toolNames` include it every turn.
- **`can_edit_files: false`.** Write policy is green; file.write allowed; require_approval for file write was cleared (`996` + validator auto-allow for Agent workspace file tools — `b0102b5d` / `c5bb0e0a`).
- **Mac PTY dead.** Health 200 on localpty/terminal/sandbox; proof write used `workspace_pty_write` / `conn_mac_local`.

---

## Suspected regression surface (no hardcode mandate)

| Area | Files / systems to inspect | Failure mode |
|------|----------------------------|--------------|
| OpenAI Responses + hosted shell | `src/core/openai-hosted-shell.js`, agent tool loop hosted-shell branch | Empty `commands: []` → tool “done” → early SSE close, no text |
| OpenAI apply_patch / PTC wire | logs: `openai_ptc` / `openai_apply_patch` / `openai_hosted_shell` always on for terra | Model prefers OpenAI container shell over IAM `fs_*` |
| Progressive hydrate | `src/core/progressive-tool-discovery.js` | Search result ranking injects `imgx_*` / veo for “visual” language |
| `agentsam_search_tools` scoring | D1 catalog + search handler | Returns media tools for HTML/landing queries |
| `agentsam_workspace_search` | catalog executor / params validation | `path: ""` → hard error; model thrashing |
| Session thin pipe + cache | `agent-session-context` cache_hit tools:7 | Fine for write; models still ignore write |
| Monaco / message render | `AgentMessageList.tsx` | Fixed undefined `onOpenMonaco` |
| PWA / SW | `dashboard/vite.config.ts` workbox | Mid-turn reclaim; boot overlay |

**Operator suspicion:** “sneaking hardcoded routing” causing rapid regressions. Treat **new keyword→tool routers** as high-risk. Prefer: (a) fix broken tool contracts, (b) fix empty-shell turn termination, (c) improve progressive hydrate ranking from D1/search scores, (d) prompt/tool schema clarity that `fs_write_file` is the create-file tool.

---

## Acceptance criteria for the fix agent (prove in prod)

1. **New Agent chat**, Auto or pinned model, prompt: create a single `.html` file under `.scratch/` with a minimal styled page — **must** call `fs_write_file` (or equivalent file write) **without** `imgx_generate_image` / empty hosted shell.
2. Log must show `tool_execution_start` for write + success; file exists on Mac lane; assistant posts text or opens file — **no** `close_done_no_token` after empty shell.
3. `agentsam_workspace_search` with omitted/empty path does not hard-fail the turn (default root or actionable error + continue).
4. Asking for “styled HTML / visual of the proposal” does **not** open image generation unless the user said image/png/photo/generate image.
5. No new always-on keyword matrix that bypasses D1 tool catalog without tests + dual-pass ticket.

---

## Related commits already on `main` (do not re-litigate unless broken)

| SHA | What |
|-----|------|
| `c23e0859` / `382461ee` | PTY local→GCP→sandbox + quarantine stale connections |
| `e2acc6b3` | Don’t preinvoke `fs_read` on create/edit prompts |
| `b0102b5d` / `c5bb0e0a` | No approval tax on `fs_write_file`; core menu includes write; approve resume |
| `e15466fc` | Boot recovery / SW claim soft |
| `bec3bfa4` | `onOpenMonaco` ReferenceError fix |

---

## Suggested first debug commands (fix agent)

```bash
# Confirm live write still works on desk
ls -la .scratch/agentsam-pty-proof-2026-07-22.txt

# Trace empty hosted shell + workspace_search
rg -n "hosted_shell|commands" src/core/openai-hosted-shell.js src/core/agent-tool-loop.js
rg -n "path required|workspace_search" src/tools src/core

# Progressive hydrate
rg -n "hydrateActiveToolsFromSearchResult|preferKeys" src/core/progressive-tool-discovery.js
```

D1 / logs: conversation_ids above; look for `openai_hosted_shell_calls`, `imgx_generate_image`, `tool_error agentsam_workspace_search`.

---

## One-line summary for the next agent

**Write tools work; OpenAI terra + progressive hydrate + empty hosted shell + broken workspace_search path are stealing “make an HTML file” turns — fix those contracts and turn completion, don’t add more hardcoded intent routers.**
