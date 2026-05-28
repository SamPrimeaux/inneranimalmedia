# Chunk 07 — Monaco and save matrix

**Status:** Draft

## Purpose
Code tab editor and all save destinations from agent workbench.

## Live production scope
MonacoEditorView, useEditor, handleSaveFile in App.tsx. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/MonacoEditorView (glob)
- dashboard/App.tsx — handleSaveFile, openInEditorFromExplorer, useEditor
- dashboard/src/ideWorkspace.ts — persist bundle (no active_file field today)
- PUT/GET /api/agent/workspace/:id

## What is ALREADY engineered
Multi-tab editor, dirty indicator, save local handle, R2, GitHub, Drive branches.

## What is PARTIALLY engineered
IDE bundle persists ideWorkspace, gitBranch, recentFiles — not active file pointer (B07-001).

## What is BROKEN
B07-001, B07-002 — patch apply + workspace active file; mobile Monaco default (B03-002).

## UX reality today
Desktop editor works for many flows; mobile squeezed; save path unclear when buffer has no r2/github metadata.

## Data / event / execution flow
openInEditor → edit → handleSaveFile → API per source

## Validation commands
```bash
rg handleSaveFile dashboard/App.tsx
rg persistIdeToApi dashboard/src/ideWorkspace.ts
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B07-001 | workspace_state active file sync | ideWorkspace.ts | Bundle includes active file | PUT JSON |
| B07-002 | Patch apply loop completion | ChatAssistant, ToolApprovalModal | Patch review apply save | E2E |

## Immediate next implementation step
Add active_file to IdePersistedBundle + PUT on tab change (B07-001).
