---
title: "Dashboard Agent — Explorer Sources (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Explorer sources (reference)

| Panel | Component | Opens editor |
|-------|-----------|--------------|
| Local | `LocalExplorer` | `openInEditorFromExplorer` in `App.tsx` |
| GitHub | `GitHubExplorer.tsx` | repo path → `activeFile` |
| Drive | `GoogleDriveExplorer.tsx` | `driveFileId` |
| R2 | via UnifiedSearch / tools | `r2Key` |

`prepareActiveFileForEditor` — `dashboard/src/lib/mediaPreview.ts`.

**Save matrix:** `07`. **Integrations:** `19`.
