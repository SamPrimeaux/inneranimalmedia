# Chunk 08 — Google Drive

**Status:** Draft

## Purpose
Drive explorer on agent drive rail — open/save via /api/drive.

## Live production scope
GoogleDriveExplorer when activeActivity drive on agent path. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/GoogleDriveExplorer.tsx
- dashboard/App.tsx handleSaveFile drive branch
- /api/drive/file

## What is ALREADY engineered
OAuth connectDrive, open, save POST.

## What is PARTIALLY engineered
Less used than R2/GitHub on agent.

## What is BROKEN
TBD — verify on production integration connected.

## UX reality today
Sidebar drive tree; opens code tab.

## Data / event / execution flow
Drive API → onOpenInEditor → save POST

## Validation commands
```bash
rg GoogleDriveExplorer dashboard
rg drive/file dashboard/App.tsx
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Confirm integration row connected in /api/settings/integrations/connected.
