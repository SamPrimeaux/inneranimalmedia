# Chunk 19 — Draw and MovieMode tabs

**Status:** Draft

## Purpose
excalidraw and moviemode workbench tabs on agent.

## Live production scope
Lazy tabs only when user opens from agent shell. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/App.tsx openTab excalidraw/moviemode
- iam:excalidraw_load_document event
- MovieModeStudio lazy import

## What is ALREADY engineered
Tabs open; excalidraw load via custom event from surface_open.

## What is PARTIALLY engineered
MovieMode R2 media — moviemode feature module.

## What is BROKEN
TBD unless repair ticket open.

## UX reality today
Secondary surfaces; not mobile Sprint 0 priority.

## Data / event / execution flow
surface_open draw → openTab excalidraw → event load

## Validation commands
```bash
rg excalidraw moviemode App.tsx
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Confirm lazy chunk loads on production (network 200).
