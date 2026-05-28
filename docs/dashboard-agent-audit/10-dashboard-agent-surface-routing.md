---
title: "Dashboard Agent — Surface Routing"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Surface routing

## UI → Worker metadata

`ChatAssistant.tsx` sets `browserContext.dashboard_route` from `window.location.pathname` on each chat POST.

## Workflow resolution

For `/dashboard/agent` (`agent.js` ~2968–2987):

```javascript
const wfKey = await resolveWorkflowFromSurfaceMetadata(env, '/dashboard/agent', intent);
```

`resolveWorkflowFromSurfaceMetadata` (~5276–5305): reads `agentsam_workflows.metadata_json.surface_routes` (array or map by route + intent).

`resolveWorkflowForMessage` may run full workflow graph SSE (`executeWorkflowAndStream`) instead of default chat loop.

## Dashboard capability tools

`ensureAgentDashboardSurfaceCapabilityTools` (~1915–1956) forces tools on agent surface, e.g.:

- `browser_navigate`, `cdt_take_screenshot`, `workspace_read_file`, `d1_query`  
- `terminal_execute` — **`requires_approval`** on agent surface  

Preflight (~6534–6576): explicit “open browser/monaco” may execute workflow or `streamBrowserPreflightNoWorkflow` without LLM.

## Capability router (pre-model)

~7934–7948: emits `capability_selected`, `surface_open` for browser/monaco/excalidraw before `runAgentToolLoop`.

## D1 (minimal)

| Table | Fields |
|-------|--------|
| `agentsam_workflows` | `workflow_key`, `metadata_json.surface_routes`, `is_active` |
| `agentsam_tools` | `tool_name`, `requires_approval`, `workspace_scope` |

No workflow row → warn + null workflow; chat may still run default tool loop.

## Failure modes

| Symptom | Cause |
|---------|--------|
| Wrong tools on agent page | Surface ensure list vs catalog inactive rows |
| Unexpected workflow graph | `surface_routes` match + preflight `execute` |
| Browser opens but no WF | `streamBrowserPreflightNoWorkflow` path |
| Intent ignored | `task_type` / `auto` → `*` wildcard only |

## Cursor gap

Surface metadata is **D1-driven** (good) but **opaque in UI** — operators cannot see which workflow/tools bound to current route.

## Files

`agent.js` (surface helpers), `ChatAssistant.tsx`, `workflow-executor.js` for graph execution
