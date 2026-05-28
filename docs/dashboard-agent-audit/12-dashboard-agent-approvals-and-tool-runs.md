# Chunk 12 — Approvals and tool runs

**Status:** Draft

## Purpose
Human approval for dangerous tools; command_run_id linkage.

## Live production scope
ToolApprovalModal, pendingToolApproval in ChatAssistant. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/src/components/ToolApprovalModal.tsx
- dashboard/components/ChatAssistant/ChatAssistant.tsx — pendingToolApproval
- onApprovalRequired, activeCommandRunId in App.tsx

## What is ALREADY engineered
Modal on approval request; command run id passed to chat shell.

## What is PARTIALLY engineered
Policy from D1 agentsam_user_policy / route requirements.

## What is BROKEN
TBD — verify d1_write and terminal gates on production.

## UX reality today
User must approve some tools; unclear queue on mobile.

## Data / event / execution flow
SSE approval event → modal → resume stream

## Validation commands
```bash
rg ToolApprovalModal dashboard
rg onApprovalRequired App.tsx
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
List tools that require approval on /dashboard/agent route.
