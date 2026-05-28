# Chunk 20 — Command palette (UnifiedSearchBar)

**Status:** Draft

## Purpose
Cmd+K search on agent — navigate, R2 facet, terminal commands.

## Live production scope
UnifiedSearchBar in agent top bar only. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/UnifiedSearchBar.tsx
- App.tsx handleUnifiedNavigate

## What is ALREADY engineered
Open palette, R2 facet dispatches iam-palette-open-r2, conversation jump.

## What is PARTIALLY engineered
Not full VS Code command set.

## What is BROKEN
TBD

## UX reality today
Desktop power feature; cramped on mobile top bar.

## Data / event / execution flow
Cmd+K → pick → navigate agent surfaces

## Validation commands
```bash
rg UnifiedSearchBar App.tsx
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
List navigate kinds that work on /dashboard/agent.
