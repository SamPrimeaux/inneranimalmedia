# Movie Mode

**Classification:** `independent_product`  
**Stage:** `incubating`  
**Route:** `/dashboard/moviemode/*`  
**Manifest:** [`product-manifests/movie-mode.json`](../../product-manifests/movie-mode.json)

Collaborative media production — **agentically enhanced, not AI-only**.

---

## Vision

- Human timeline editing, Stream import, manual export
- AI studio for generation (Veo, conversions)
- Agent tools for render, search, automate
- Future standalone app (`moviemode-service` partial today)

---

## Status

| Area | Status |
|------|--------|
| Home shell, projects | **Verified** |
| Timeline / workbench | **Partial** — mobile editor pending |
| Export (Remotion + PTY) | **Verified** |
| API | **Verified** — `moviemode-api.js` |
| Route context | **Partial** — not in `dashboardRouteContext.ts` |
| Satellite worker | **Partial** — globe landing only |

**Plan:** [../../MOVIEMODE-INFRA-PLAN.md](../../MOVIEMODE-INFRA-PLAN.md)

---

## Routes

- `/dashboard/moviemode` — home
- `/dashboard/moviemode/projects`
- `/dashboard/moviemode/ai-studio`
- `/dashboard/moviemode/templates`
- `/dashboard/moviemode/:projectId` — editor

---

## Docs

- [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [AGENTSAM.md](./AGENTSAM.md)
