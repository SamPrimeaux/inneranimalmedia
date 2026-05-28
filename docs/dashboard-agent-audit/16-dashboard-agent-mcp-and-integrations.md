# Chunk 16 — MCP and integrations

**Status:** Draft

## Purpose
MCP panel on agent + integration connection state affecting tools.

## Live production scope
MCPPanel, /api/settings/integrations/connected, OAuth flows return_to agent. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/MCPPanel.tsx
- dashboard/App.tsx activeActivity mcps

## What is ALREADY engineered
Panel renders on agent; OAuth return_to /dashboard/agent for GitHub.

## What is PARTIALLY engineered
MCP remote vs in-worker tools alignment.

## What is BROKEN
TBD MCP auth on production.

## UX reality today
Power users open MCP rail; most use chat tools only.

## Data / event / execution flow
Connect integration → tools available on route

## Validation commands
```bash
rg MCPPanel dashboard
rg integrations/connected
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
List MCP tools exposed on default agent route from D1.
