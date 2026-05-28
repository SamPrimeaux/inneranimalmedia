# Chunk 11 — Workspace context persistence

**Status:** Draft

## Purpose
Per-conversation IDE state and chat context packet.

## Live production scope
agentWorkspaceContext + /api/agent/workspace/:id. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/src/ideWorkspace.ts
- dashboard/App.tsx — agentWorkspaceContext useMemo, hydrate/persist
- src/api/agent.js — /api/agent/workspace/:id
- D1 agentsam_workspace_state, workspaces.state_json

## What is ALREADY engineered
GET/PUT bundle v1: ideWorkspace, gitBranch, recentFiles.

## What is PARTIALLY engineered
active_file not in bundle (B07-001); dual write workspaces + agentsam_workspace_state.

## What is BROKEN
404 workspace returns empty shell for allowed workspace id edge case.

## UX reality today
Conversation switch restores recent files metadata when API succeeds.

## Data / event / execution flow
Tab change → persistIdeToApi → D1; chat includes openFiles, browserUrl

## Validation commands
```bash
rg hydrateIdeFromApi persistIdeToApi dashboard
rg agent/workspace src/api/agent.js
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B07-001 | workspace_state active file sync | ideWorkspace.ts | active file in bundle | PUT |

## Immediate next implementation step
Extend bundle schema + migration for active_file (B07-001).
