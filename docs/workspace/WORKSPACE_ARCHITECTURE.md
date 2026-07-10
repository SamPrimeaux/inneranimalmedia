# Workspace architecture

**Status:** Canonical · **Parent:** [WORKSPACE_CONSTITUTION.md](./WORKSPACE_CONSTITUTION.md)

Technical map of the Foundry implementation. For platform runtime see [iam-runtime-architecture-2026-06.md](../platform/iam-runtime-architecture-2026-06.md).

---

## Stack

| Layer | Path | Deploy |
|-------|------|--------|
| SPA shell | `dashboard/` (Vite React) | `npm run build:vite-only` → R2 `static/dashboard/app/` |
| Worker | `src/index.js` | `npm run deploy:full` |
| Auth pages | `static/pages/auth/*.html` | R2 upload script (no Worker redeploy) |

---

## Shell navigation

**Source:** `dashboard/config/shellNav.ts`

| Family | ID | Home route | Items (products/capabilities) |
|--------|-----|------------|-------------------------------|
| Core | — | `/dashboard/home` | Home, projects, artifacts, chats |
| Code | `code` | `/dashboard/agent` | Agent, workflows, database |
| Create | `create` | `/dashboard/designstudio` | Design Studio, Draw, CMS Suite, Images, Movie Mode |
| Collaborate | `collaborate` | `/dashboard/collaborate` | Calendar, mail, meet, learn |

Families are **nav groupings**, not products.

---

## Route registration

**Source:** `dashboard/App.tsx` — lazy-loaded pages for heavy surfaces.

Key incubation routes:

- `/dashboard/agent` — Agent Sam workbench UI
- `/dashboard/designstudio`, `/dashboard/draw`
- `/dashboard/cms/*`
- `/dashboard/images`
- `/dashboard/moviemode/*`
- `/dashboard/projects/:projectId`

---

## Agent Sam integration in shell

| Mechanism | File | Role |
|-----------|------|------|
| Route context | `dashboard/lib/dashboardRouteContext.ts` | Per-route `route_key`, quick actions, workspace packet |
| Side panel | `App.tsx` + `ChatAssistant` | Embedded agent on product routes |
| Bootstrap | `/api/dashboard/bootstrap` | Workspace + policy context |

**Gap:** Draw and Movie Mode lack dedicated entries in `dashboardRouteContext.ts` (fall through to generic `dashboard`).

---

## Projects system

| API | `src/api/projects.js` |
| Table | `projects`, `workspace_projects` |
| UI | `ProjectsPage`, `ProjectDetailPage` |

Projects bind chat scope, files (`metadata_json`), runtime contracts (`AGENTSAM.md` sync), and Create lane metadata (e.g. Sam Sketch).

---

## Workspace vs product deploy boundaries

| Stays in Workspace | May graduate |
|--------------------|--------------|
| Shell chrome, sidebar, mobile drawer | Product page bundles (could split Vite entries later) |
| Shared auth session | Product-specific workers (e.g. `moviemode-service` partial) |
| `/dashboard/*` routes | Custom domains per product |

Graduation does not require immediate repo extraction — see [PRODUCT_LIFECYCLE.md](../platform/PRODUCT_LIFECYCLE.md).

---

## Related

- [../shared/AGENT_RUNTIME.md](../shared/AGENT_RUNTIME.md)
- [../products/PRODUCT_REGISTRY.md](../products/PRODUCT_REGISTRY.md)
- `product-manifests/workspace.json`
