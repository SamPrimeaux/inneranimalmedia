# Chunk 05 — R2 file plane

**Status:** Draft

## Purpose
R2 bucket list/open/save from agent Files rail and agent r2_file_updated SSE.

## Live production scope
/api/r2/* called from dashboard on agent path only. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/LocalExplorer.tsx — R2 section
- dashboard/src/lib/mediaPreview.ts — openR2KeyInEditor
- dashboard/src/lib/r2Listing.ts, r2Buckets.ts
- src/api/r2-api.js
- dashboard/App.tsx — handleR2FileUpdatedFromAgent, handleSaveFile POST /api/r2/file

## What is ALREADY engineered
List buckets, open text in Monaco, save POST, SSE refresh buffer.

## What is PARTIALLY engineered
Multipart upload UX; access errors per bucket policy.

## What is BROKEN
TBD — verify assertR2ObjectAccess errors surfaced in UI.

## UX reality today
Operators browse R2 in sidebar; preview images via stream URL.

## Data / event / execution flow
Click object → GET /api/r2/file → Monaco → POST save

## Validation commands
```bash
rg -n '/api/r2/' dashboard src/api/r2-api.js
rg openR2KeyInEditor dashboard
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Trace one open+save with network tab on production.
