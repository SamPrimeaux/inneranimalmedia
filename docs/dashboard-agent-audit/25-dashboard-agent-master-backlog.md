# Chunk 25 — Master backlog

**Status:** Live-code verified

## Purpose

Single roll-up of repair IDs across the **live `/dashboard/agent`** audit series. Source of truth for sprint planning — not a wishlist for unrelated products.

## Live production scope

Every item must improve **inneranimalmedia.com/dashboard/agent** or its direct deploy chain (`dashboard/dist` → R2 → Worker APIs the page calls).

## Existing live code paths

| Artifact | Path |
|----------|------|
| This series | `docs/dashboard-agent-audit/*.md` |
| E2E smoke | `tests/e2e/dashboard-agent-workbench.spec.ts` |
| Deploy | `scripts/deploy-frontend.sh`, `scripts/deploy-sandbox.sh` |

## Master backlog (initial)

| ID | Sprint | Title | Affected paths | Expected behavior | Validation |
|----|--------|-------|----------------|-------------------|------------|
| **B01-001** | 0 | BrowserView iframe vs MYBROWSER clarity | `dashboard/components/BrowserView.tsx` | Users see “Embedded browse” vs “Automation preview” | Manual mobile+desktop |
| **B02-001** | 0 | Detect stale R2 dashboard bundles | `scripts/deploy-frontend.sh`, `dashboard/dist` | `/dashboard/agent` HTML references 200 JS chunks | curl + chunk checklist |
| **B03-001** | 0 | Mobile operator mode | `dashboard/App.tsx` | Mobile default = operator console, not IDE | 390px viewport |
| **B03-002** | 0 | Disable full Monaco mobile default | `App.tsx`, `ChatAssistant` | Diff/review card first; IDE opt-in | Mobile E2E |
| **B03-003** | 0 | Single active surface mobile routing | `App.tsx` narrow branch | One full-screen surface at a time | Device test |
| **B07-001** | 0 | workspace_state active file sync | `dashboard/src/ideWorkspace.ts`, `PUT /api/agent/workspace/:id` | Persisted bundle includes active editor file metadata | PUT body inspect |
| **B07-002** | 0 | Patch apply loop completion | `ChatAssistant`, `ToolApprovalModal`, Monaco | Agent patch → review → apply → save closes loop | E2E script |
| **B12-001** | 0 | Read-only inspection without approval modal | `agent.js`, `agent-policy.js`, `ToolApprovalModal` | grep/read/search/audit auto-run | Tool trace no `tool_blocked` for read-only |
| **B09-001** | 0 | Structured autonomous progress feed | `useAgentChatStream.ts`, `AgentMessageList.tsx` | “Read files / searched / worked Ns” not spinner chaos | SSE fixture test |
| **B13-001** | 1 | browser_navigate failure triage | `browser-cdp.js`, `useAgentChatStream` | Failures show actionable error; no silent iframe | Tool trace |
| **B14-001** | 1 | Mobile terminal operator cards | `XTermShell.tsx` | Terminal usable on phone (cards, not raw xterm only) | Mobile |
| **B14-002** | 2 | AgentSamBridgeKey local connector | New bridge + `XTermShell` | Scoped local FS; hosted VM fallback | Design + POC |
| **B21-001** | 3 | `/agentsam` command namespace | `ChatAssistant`, `src/api/agent.js` | Slash commands per chunk 21 | Composer test |
| **B21-002** | 3 | Cost ceilings and quota enforcement | D1 policy, chat API | Hard stop + message | Integration |
| **B22-001** | 3 | Embedding write auth repair | `src/tools/memory.js` | No 401 on entitled memory_write | Tool trace |
| **B22-002** | 3 | Automatic code indexing | Worker index job | Current repo indexed after deploy | RAG query |
| **B23-001** | 3 | Automation template gallery | `WorkflowRunBoard`, `/api/agentsam/workflows` | Dependable set-and-forget automations | Workflow E2E |

### Chunk-local IDs

Detailed context lives in owning chunk (e.g. B03-* in chunk 03). Add new IDs as `B<chunk>-<seq>`.

## What is ALREADY engineered

- Backlog IDs assigned and linked to sprint order in README.
- Chunk 01, 03, 22 document concrete failures.

## What is PARTIALLY engineered

- D1 `agentsam_todo` / `agentsam_plan_tasks` registration for each ID — per workspace rules, register when work starts (not auto-created in this doc-only commit).

## What is BROKEN

- Master backlog not yet synced to D1 todos — manual step for operator.

## UX reality today

Team repairs without a shared ID list → duplicate work. This file is the dedupe layer.

## Data / event / execution flow

```text
Audit chunk → Bxx-yyy → D1 agentsam_todo (when work starts) → PR → deploy:frontend → E2E → mark Repaired
```

## Validation commands

```bash
rg -n "B[0-9]{2}-[0-9]{3}" docs/dashboard-agent-audit/
```

## Acceptance criteria

- [ ] Every open production bug on `/dashboard/agent` maps to one B ID or new row added here.
- [ ] Closed items marked **Repaired** with commit SHA in chunk notes.
- [ ] No B item references `agent-dashboard/` paths.

## Repair backlog IDs

(This chunk owns the master list above.)

## Immediate next implementation step

Register **B03-001**, **B02-001**, **B09-001** as D1 todos under active sprint plan; assign owners in README ownership table.
