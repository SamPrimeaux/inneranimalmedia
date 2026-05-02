# Monaco Editor Implementation Audit

**Date:** 2026-03-17  
**Scope:** Agent dashboard Monaco integration (code tab, diff from chat, R2 save, file context).

---

## Current State

### What's working

- **Open in Monaco:** Agent streams code via SSE `type: "code"`; React sets `generatedCode` / `filename` / `language` on the assistant message; "Open in Monaco" button appears and opens the diff view.
- **Diff view:** Persistent DiffEditor pattern — DiffEditor is always mounted; visibility toggled with CSS (`display: monacoDiffFromChat ? 'block' : 'none'`). Models updated in `useEffect` when `monacoDiffFromChat` or `diffMode`/content change. No unmount/remount, so no disposal errors.
- **Keep Changes:** PUT to `/api/r2/buckets/{bucket}/object/{filename}`; on success, `onMonacoDiffResolved()` is called (parent clears diff state); R2 save error state shows inline when PUT fails (e.g. 404).
- **Undo:** Calls `onMonacoDiffResolved()` directly; diff bar hides via CSS when parent clears state.
- **Filename validation (worker):** `emitCodeBlocksFromText` validates fence-line filename with `/^[a-zA-Z0-9._-]+\.[a-z]{1,10}$/i`; invalid or missing filename falls back to `'snippet'`.
- **System prompt:** Agent is instructed to output code in fenced blocks with filename on the fence line and not to use `r2_write` for code; users save via Monaco.
- **File context bridge:** `FloatingPreviewPanel` reports `onFileContextChange({ filename, content, bucket })`; chat request sends `fileContext`; worker injects "CURRENT FILE OPEN IN MONACO" into system when user message references the file.
- **Single-file editor:** Code tab shows regular Monaco Editor when not in diff mode; lock icon toggles read-only; Save File / Undo work against R2 and local state.

### What's fixed (disposal, filename, save errors)

- **Disposal:** Switched from conditional render + delayed `onMonacoDiffResolved` to persistent DiffEditor (always mounted, show/hide with CSS; model updates in `useEffect`). Keep Changes / Undo call `onMonacoDiffResolved()` directly.
- **Filename:** Worker validates extracted filename; rejects `*`, `//`, no-extension, etc.; uses `'snippet'` when invalid.
- **Save errors:** Keep Changes failure path sets `saveError` state, shows inline message, logs to console, clears after 5s.

### Outstanding issues (if any)

- **Filename on fence line:** If the model omits the filename (e.g. `` ```js `` only), filename becomes `'snippet'`; user can still "Keep Changes" and save as `snippet` or rename in Files tab. Optional: stronger system prompt or client-side hint.
- **Bucket:** SSE code event does not include `bucket`; dashboard uses `defaultBucketForMonacoRef` (first bucket from `/api/r2/buckets`). User cannot currently choose bucket per "Open in Monaco" from chat.
- **Non-stream code:** When the worker returns a non-streaming JSON response, code blocks in the final content are not parsed; "Open in Monaco" does not appear for that turn.

---

## Architecture

### Code flow: agent to SSE to React to Monaco

1. **Worker:** One of the streaming paths (OpenAI, Google, Workers AI, Anthropic inline, Anthropic tools) runs; after stream completes, `emitCodeBlocksFromText(fullText, send)` runs. It parses the first `` ```lang [filename]\ncode\n``` `` block and sends one SSE event: `{ type: 'code', code, filename, language }`. Filename is validated; invalid becomes `'snippet'`.
2. **React (AgentDashboard):** SSE handler for `data.type === "code"` updates the latest assistant message with `generatedCode`, `filename`, `language`. No `bucket` in event; bucket is from `defaultBucketForMonacoRef` when opening.
3. **Monaco:** User clicks "Open in Monaco". `openInMonaco(message)` fetches existing object from R2 (if bucket set) for original, then calls `setMonacoDiffFromChat({ original, modified: generatedCode, filename, language, bucket })`. Parent re-renders; `FloatingPreviewPanel` shows the diff bar and the DiffEditor (via CSS). DiffEditor is already mounted; `useEffect` updates its original/modified models from `monacoDiffFromChat`. User clicks "Keep Changes" or "Undo"; handler calls `onMonacoDiffResolved()`; parent sets `monacoDiffFromChat` to null; diff bar and DiffEditor hide via CSS; DiffEditor is not unmounted.

### File save flow: Monaco to R2 to verification

1. **Keep Changes:** `handleKeepChangesFromChat` builds bucket from `monacoDiffFromChat.bucket || filesBucket || filesBuckets[0]`, then `PUT /api/r2/buckets/{bucket}/object/{filename}` with `monacoDiffFromChat.modified`. On success: update local filename/content, call `onMonacoDiffResolved()`, show "Saved". On failure: set `saveError`, log, show inline error, clear after 5s.
2. **Worker R2 route:** `PUT` on `/api/r2/buckets/:name/object/:key` reads body, uses `getR2Binding(env, name)`, calls `binding.put(key, body, { httpMetadata: { contentType } })`, returns `{ ok: true, key }` or 404 if bucket not bound.
3. **Verification:** User can confirm in Files tab (same bucket) or Browser/Code tab after reopening the file.

### File context bridge: Monaco to chat to worker

1. **Dashboard:** When the user opens a file in the Code tab (from R2 or paste), `onFileContextChange({ filename, content, bucket })` runs. `AgentDashboard` stores it in `currentFileContext` and sends it in the next chat request body as `fileContext`.
2. **Worker:** Reads `bodyFileContext`; if `filename` and `content` exist and the last user message "references the file" (e.g. "this file", "fix", "edit", "monaco"), appends a "CURRENT FILE OPEN IN MONACO" block (filename, bucket, first 15k chars) to `finalSystem`.
3. **Agent:** Sees the file content in system context and can suggest edits; user can then use "Open in Monaco" for agent-generated code or edit in place and save.

---

## Known Limitations

- **Filename extraction:** Requires filename on the **same line** as the opening fence (e.g. `` ```javascript hello.js ``). If the model puts it in a comment on the next line or omits it, filename becomes `'snippet'`.
- **Bucket selection:** "Open in Monaco" uses the first bucket from the bucket list (or `filesBucket` from the panel). No per-message bucket in SSE; no UI to pick bucket when opening from chat.
- **Error handling:** Keep Changes shows inline error for failed PUT; Save File (single editor) uses `alert()`. R2 404 and other API errors are surfaced but not always consistent across flows.
- **Non-stream responses:** Code in JSON (non-stream) responses is not parsed for "Open in Monaco"; only streaming code events are used.

---

## Production Readiness Checklist

- [ ] All console errors eliminated (persistent DiffEditor should remove disposal errors; verify in production).
- [ ] File saves reliably (Keep Changes and Save File both PUT to R2; confirm bucket and key).
- [ ] Diff view works for all supported file types (language from filename extension; same as single editor).
- [ ] Mobile responsive (Phase 3 — chat input minWidth/z-index/touch) — deferred.
- [ ] Error messages user-friendly (Keep Changes shows inline message; Save File still uses alert; consider unifying).

---

## Recommended Next Steps

**Priority order for remaining work:**

1. **Verify in production:** Hard refresh, run "Open in Monaco" → Keep Changes / Undo; confirm no disposal errors and saves succeed.
2. **Optional system prompt tweak:** Add an explicit example of fence syntax (e.g. "Use \`\`\`javascript filename.js on the opening line") if models still omit filenames.
3. **Tool execution feedback (Phase 4):** Worker emits `tool_start` / `tool_result`; React shows loading/success in chat (larger lift).
4. **Success confirmation (P2):** After Keep Changes, show "Saved to {bucket}/{filename}" for clarity.
5. **Non-stream code extraction (P2):** Parse fenced blocks from JSON response content and set `generatedCode`/filename so "Open in Monaco" appears for non-streaming turns.
6. **Phase 3 (chat input):** Responsive minWidth, z-index, touch per `docs/plans/MONACO_PREVIEW_INPUT_PLAN.md` when ready.

---

*Handoff: This document reflects state after the persistent DiffEditor change and R2 error handling. Use it for the next session to continue Monaco/agent dashboard work.*
