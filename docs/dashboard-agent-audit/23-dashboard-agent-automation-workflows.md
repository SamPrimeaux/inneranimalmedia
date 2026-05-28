# Chunk 23 — Automation workflows

**Status:** Draft

## Purpose
Set-and-forget automations from agent — workflow board, not random toys.

## Live production scope
WorkflowRunBoard, /api/agentsam/workflows on agent chat mobile hub. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/ChatAssistant/components/WorkflowRunBoard.tsx
- /api/agentsam/workflows
- /api/agentsam/workflows/:id/run
- D1 agentsam_workflows

## What is ALREADY engineered
List workflows, run, approve steps from board.

## What is PARTIALLY engineered
B23-001 template gallery UX not built.

## What is BROKEN
TBD failed workflow visibility on agent.

## UX reality today
mobileHubTab automations tab.

## Data / event / execution flow
Board → POST run → D1 agentsam_workflow_runs → mirror

## Validation commands
```bash
rg WorkflowRunBoard dashboard
rg agentsam/workflows src
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B23-001 | Automation template gallery | WorkflowRunBoard | Templates for repo sweeps etc | UX |

## Immediate next implementation step
Define template gallery data model in D1.
