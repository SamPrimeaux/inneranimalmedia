# Chunk 15 — Local git source panel

**Status:** Draft

## Purpose
git activity rail — local repo status not GitHub API.

## Live production scope
SourcePanel + /api/internal/git-status only. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/SourcePanel.tsx
- /api/internal/git-status

## What is ALREADY engineered
Fetch branch, staged/unstaged, commits display.

## What is PARTIALLY engineered
Not wired to Monaco commit from agent.

## What is BROKEN
TBD if endpoint 404 in some envs.

## UX reality today
Confused with GitHubExplorer (actions).

## Data / event / execution flow
Open git rail → GET git-status → render

## Validation commands
```bash
rg SourcePanel dashboard
rg git-status src
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Clarify label Git vs GitHub on activity rail.
