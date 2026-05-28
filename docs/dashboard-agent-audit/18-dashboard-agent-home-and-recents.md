# Chunk 18 — Workspace home and recents

**Status:** Draft

## Purpose
Default Workspace tab — recents, plan tasks, open folder entry.

## Live production scope
WorkspaceDashboard on isAgentHomePath. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/WorkspaceDashboard.tsx
- dashboard/App.tsx workspaceSamState GET /api/agent/workspace
- recentFiles from ideWorkspace

## What is ALREADY engineered
Home overlay, quickstart link, workspace plan tasks from API state.

## What is PARTIALLY engineered
tasks_total drift vs D1 plan tasks (alignment rules).

## What is BROKEN
TBD

## UX reality today
Landing tab when opening agent.

## Data / event / execution flow
Load agent → Workspace tab → dashboard cards

## Validation commands
```bash
rg WorkspaceDashboard App.tsx
rg workspaceSamState
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Trace GET workspaceSamState endpoint.
