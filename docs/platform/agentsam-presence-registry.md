---
title: Agent Sam — Presence & loading registry
category: agentsam
updated: 2026-06-04
surface: /dashboard/*
---

# Presence registry

Agent Sam UX uses **one sitewide** `ChatAssistant` (`App.tsx` side panel). Presence is not per-route.

## Two libraries (do not mix randomly)

| Layer | Keys | Used for |
|-------|------|----------|
| **Run / process** | `AgentRunPresenceState` | Thinking row, workflow headers, subagents, merge, approval pause |
| **Tool lane** | `AgentToolLane` | Tool receipts, Monaco/terminal/browser work |

Resolver: `dashboard/features/agent-run/resolveAgentPresence.ts`  
Icons: `dashboard/features/mode-presence/AgentModePresenceIcon.tsx`  
Hero thinking UI: `dashboard/src/components/ThinkingCard.tsx` + `agentRunPresence.css`

## Run states → icons

| State | Icon | Label |
|-------|------|-------|
| `thinking` | agent-spark | Thinking through the request |
| `tool_routing` | tool-router | Choosing the right tool path |
| `task_queue` | work-queue | Working through the task queue |
| `subagent_spawn` | subagent-swarm | Spawning focused subagents |
| `multitask_fanout` | fanout-orbit | Running parallel workstreams |
| `delegate_subtask` | delegate-chain | Delegating a focused task |
| `review_gate` | review-gate | Ready for review (not paused) |
| `approval_required` | approval-wait | Waiting for your approval (paused) |
| `merge_results` | merge-weave | Merging results |
| `complete` | done-bloom | Complete |
| `failed` | error-signal | Needs attention |
| `loading_panel` | skeleton-plan | Loading preview |

## Tool lanes → icons

| Lane | Icon |
|------|------|
| `inspect` | scan |
| `terminal` | terminal |
| `diff` | diff |
| `image` / `video` | pixel |
| `diagram` | path |
| `files` | files |
| `browser` | browser |
| `database` | scan |
| `workflow` | work-queue |
| `subagent` | subagent-swarm |
| `skeleton` | skeleton-plan |

## Resolver priority

1. Failed → error-signal  
2. Complete → done-bloom  
3. `approval_required` / gated → approval-wait  
4. `review_gate` → review-gate  
5. Explicit `presenceState` → `presenceStateIconMap`  
6. Active tool lane → `toolLaneIconMap`  
7. Mode default → mode-presence map  
8. Fallback → agent-spark  

## UI rules

- **Idle** header: small `AgentPresenceStatus` (tiny icon OK).  
- **Active run**: hero `ThinkingCard` (44px animated icon, floating card); header presence **hidden** while hero is shown. Stream start shows hero immediately via `deriveHeroThinkingState`.  
- **Tool receipts**: `ToolTraceRow` → `resolveToolTracePresence` + lane icon (32px).  
- **Workflow / multitask**: `AgentPresenceCard` on `WorkflowRunCard`, `WorkflowRunPresenceBanner` in chat, `/dashboard/workflows` run panel.  
- **Subagent fanout**: `AgentPresenceCard` in thread when `subagentWork` SSE is active.  
- **No** composer terminal trust strip (removed — adds load + noise).  
- **No** new per-page spinners; use registry only.  
- `prefers-reduced-motion`: icons static via existing CSS.  
- Production colors from **mode** + app tokens — not Classy/Ember/Mono demo switchers.

## Five modes

`ask` · `plan` · `agent` · `debug` · `multitask` — behavior/policy only; lanes handle tool motion.
