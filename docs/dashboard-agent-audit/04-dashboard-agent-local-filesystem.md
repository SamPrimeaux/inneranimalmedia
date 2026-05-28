# Chunk 04 — Local filesystem (File System Access)

**Status:** Draft

## Purpose
Local folder open on agent Files rail — native picker, IndexedDB handles, tree in LocalExplorer.

## Live production scope
Only LocalExplorer on isAgentHomePath + FS API persistence. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/LocalExplorer.tsx
- dashboard/src/lib/localFileTree.ts
- dashboard/src/ideWorkspace.ts — source: local

## What is ALREADY engineered
Open folder, lazy tree, openInEditorFromExplorer.

## What is PARTIALLY engineered
IDB handle may revoke across sessions; workspace hint only in IDB.

## What is BROKEN
TBD after mobile operator mode — local bridge future (B14-002).

## UX reality today
Desktop: usable; mobile: Files rail hides center column.

## Data / event / execution flow
User picks folder → IDB handle → read file → openInEditor → code tab

## Validation commands
```bash
rg -n nativeFolderOpenSignal|LocalExplorer dashboard/App.tsx dashboard/components/LocalExplorer.tsx
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Document IDB schema version in chunk body after rg pass.
