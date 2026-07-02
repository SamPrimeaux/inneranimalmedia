# Dashboard bootstrap L1 contract

**Updated:** 2026-07-01  
**Handler:** `src/api/dashboard-bootstrap.js`  
**Client:** `dashboard/src/loadDashboardBootstrap.ts`

## Purpose

`GET /api/dashboard/bootstrap` is the **L1 context envelope** for `/dashboard/*` cold mount. It must not include agent-domain data (policy, models, tool permissions).

## Allowed top-level keys

| Key | Layer | Source |
|-----|-------|--------|
| `ok` | L1 | handler |
| `fetched_at` | L1 | handler |
| `me` | L1 | `buildCanonicalAuthMe` |
| `workspaces` | L1 | `workspace_members` + `workspaces` |
| `status` | L1 | notifications, git, problems, tunnel, terminal, sandbox |
| `theme` | L1 | `resolveDashboardBootstrapTheme` |
| `client` | L1 | Supabase anon bootstrap |
| `_meta` | L1 telemetry | `l1_version`, `parallel_queries`, `l2_excluded` |

## Explicitly excluded (L2)

| Concern | L2 endpoint | Client module |
|---------|-------------|---------------|
| Agent policy | `GET /api/agent/policy` | `dashboard/src/agentDomainFetch.ts` → `useAgentPolicy` |
| Model catalog | `GET /api/agent/models?show_in_picker=1` | `useAgentModels` |
| Default model | `GET /api/settings/default-model` | `useAgentDefaultModel` |

## Guards

```bash
npm run guard:bootstrap-l1
npm run guard:bootstrap-domain-leaks
node --test tests/unit/dashboard-bootstrap-payload.test.mjs
```

## Debug (browser console)

```js
localStorage.setItem('IAM_DEBUG_L1', '1');  // bootstrap publish
localStorage.setItem('IAM_DEBUG_L2', '1');  // agent domain fetches
location.reload();
```
