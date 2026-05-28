# Chunk 06 — GitHub plane

**Status:** Draft

## Purpose
Remote repos on activity actions rail — OAuth, browse, open, save via GitHub API.

## Live production scope
GitHubExplorer + /api/github + /api/integrations/github/repos. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/GitHubExplorer.tsx
- /api/oauth/github/start?return_to=/dashboard/agent
- /api/integrations/github/repos
- /api/github/repos/:owner/:repo/contents
- dashboard/App.tsx — github save in handleSaveFile

## What is ALREADY engineered
List repos, browse tree, open file base64 decode, save with sha.

## What is PARTIALLY engineered
Rate limit sessionStorage cooldown; reconnect UX.

## What is BROKEN
Delete folder blocked by design (alert).

## UX reality today
Connect GitHub → expand repo → open in Monaco; mobile uses actions rail.

## Data / event / execution flow
OAuth → repos → contents API → onOpenInEditor → code tab

## Validation commands
```bash
rg GitHubExplorer dashboard
rg github/repos src
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Verify OAuth return_to on production after login.
