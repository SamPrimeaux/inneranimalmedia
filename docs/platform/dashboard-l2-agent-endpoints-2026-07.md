# Dashboard L2 agent-domain endpoints

**Updated:** 2026-07-01

Agent Sam domain reads are **not** in bootstrap. They load when the agent shell mounts or when hooks run with a session.

## Registry

| Endpoint | Method | D1 / source | Client |
|----------|--------|-------------|--------|
| `/api/agent/policy` | GET | `fetchDashboardBootstrapAgentPolicy` | `fetchAgentPolicy` / `useAgentPolicy` |
| `/api/agent/models` | GET | `agentsam_model_catalog` | `fetchAgentModels` / `useAgentModels` |
| `/api/settings/default-model` | GET | `agentsam_bootstrap` ui prefs | `fetchAgentDefaultModel` / `useAgentDefaultModel` |
| `/api/agent/workspace/:id` | GET | workspace agent state | `App.tsx` (on workspace change) |

## Cache invalidation

`invalidateAgentDomainCache(workspaceId?)` in `dashboard/src/agentDomainFetch.ts`:

- **Workspace switch:** `WorkspaceContext.switchWorkspace` → invalidate policy for new workspace + `refreshDashboardBootstrap` for theme only.
- **Full invalidate:** omit `workspaceId` to clear models + default model caches.

## Debug

```js
localStorage.setItem('IAM_DEBUG_L2', '1');
```

Console lines: `[IAM L2] fetch /api/agent/policy`, etc.
