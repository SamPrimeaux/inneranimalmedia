---
title: "Dashboard Agent — Monaco and Save Matrix"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Monaco and save matrix

## UI entry

| Layer | File |
|-------|------|
| Tabs/buffers | `dashboard/src/EditorContext.tsx` — `isDirty` = `content !== lastSavedContent` |
| Editor | `dashboard/components/MonacoEditorView.tsx` — Cmd/Ctrl+S, Save, Diff Accept/Reject |
| Wiring | `dashboard/App.tsx` — `handleSaveFile`, `onSave={handleSaveFile}` |
| Chat context | `dashboard/components/ChatAssistant/ChatAssistant.tsx` — `active_file_*` on every chat POST |

## Manual save routing (`handleSaveFile`)

| Condition | API |
|-----------|-----|
| `mcp_tool:` workspace path | `PATCH /api/settings/mcp/tools/:toolId` |
| `driveFileId` | `POST /api/drive/file` |
| File System Access `handle` | `createWritable()` (local disk) |
| `r2Key` | `POST /api/r2/file` |
| GitHub repo+path | `POST /api/github/repos/:owner/:repo/contents` |
| Else (buffer) | React state only — **no remote** |

Server R2 write: `src/api/r2-api.js` (`handleR2FileRoute`).

## IDE bundle (not file bytes)

`dashboard/src/ideWorkspace.ts`:

- `GET/PUT /api/agent/workspace/:conversationId`  
- Payload: `{ v, ideWorkspace, gitBranch, recentFiles[] }` (snapshots capped)  
- Debounce **650ms** on changes  

Worker (`src/api/agent.js` ~10303–10416): row `uws:{tenant}:{user}:{conversationId}` in **`agentsam_workspace_state.state_json`** (+ optional `workspaces.state_json`).

Client **swallows PUT errors** — silent loss possible.

## Agent tool save (`write_file` / `fs.js`)

`active_file_*` form fields (chat) are **not** auto-merged server-side. Tools need explicit args; `resolveFileEnvelope()` in `src/tools/builtin/fs.js` maps aliases.

| `source` | Behavior |
|----------|----------|
| `local` / `buffer` | `{ status: 'local_file', proposed_content }` only |
| `r2` / `github` / `drive` | `INSERT change_sets` **pending** → `apply_change_set` |

Parallel path: **`r2_write`** builtin → SSE `r2_file_updated` → `App.tsx` reload via `GET /api/r2/file` (bypasses change_sets).

## Flow diagrams

**Manual save:** `MonacoEditorView` → `handleSaveFile` → source-specific API → storage.

**Agent write:** `POST /api/agent/chat` → tool loop → `write_file` / `r2_write` → D1/R2/SSE reload.

## Failure modes (production)

| Issue | Detail |
|-------|--------|
| Dirty dot after save | `handleSaveFile` does not call `EditorContext.saveActiveFile` / `lastSavedContent` stale |
| Buffer lost on refresh | Only in `recentFiles` snapshot if IDE persist ran |
| Agent edit no-op | Model used `local` source or missing bucket/key in tool args |
| change_sets stuck | Diff Accept calls `handleSaveFile`, not `apply_change_set` |
| Truncated file | `fileKind === 'truncated'` blocks save shortcuts |

## Cursor gap

Cursor unifies **editor save + agent apply** with clear pending diff UX. Here **three paths** (manual HTTP, change_sets, r2_write SSE) confuse operators and agents.

## Files

`MonacoEditorView.tsx`, `App.tsx`, `ideWorkspace.ts`, `ChatAssistant.tsx`, `src/tools/builtin/fs.js`, `src/api/r2-api.js`, `src/api/agent.js`
