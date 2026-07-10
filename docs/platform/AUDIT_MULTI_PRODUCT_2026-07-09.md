# Multi-product platform audit (2026-07-09)

**Scope:** Code inspection before formalizing product knowledge structure.  
**Method:** Routes, components, APIs, D1 references, existing truth docs — not file-name inference.

## Legend

| Label | Meaning |
|-------|---------|
| **Verified** | Implemented and referenced in production paths |
| **Unstable** | Implemented but known broken or degraded |
| **Partial** | Some layers work; integration incomplete |
| **Planned** | Documented or scaffolded; not end-to-end |
| **Legacy** | Deprecated; do not extend |

---

## Layer summary

| Layer | Host | Status |
|-------|------|--------|
| **Platform** | `src/index.js`, D1, R2, MCP repo | **Verified** — auth, routing, deploy |
| **Workspace** | `dashboard/` → `/dashboard/*` | **Verified** — shell, nav, projects |
| **Agent Sam** | `src/api/agent*.js`, `src/core/runtime-profile.js`, MCP, SDK | **Partial** — spine live; tool allowlist gaps |
| **Products** | Routes under Workspace | **Mixed** — see registry |

---

## Surface audit

### Workspace (Foundry)

| Item | Evidence | Status |
|------|----------|--------|
| Shell nav | `dashboard/config/shellNav.ts` — Code / Create / Collaborate | Verified |
| Home / projects / artifacts | `App.tsx` routes, `ProjectsPage` | Verified |
| Auth entry | `/auth/login` → `/dashboard/agent` default | Verified |

### Agent Sam (`/dashboard/agent` + infra)

| Item | Evidence | Status |
|------|----------|--------|
| Chat spine | `src/api/agent-chat-spine.js`, `runtime-profile.js` | Verified |
| Route context | `dashboardRouteContext.ts` — `agent_sam`, `agent_examples` | Verified |
| MCP | Separate repo `inneranimalmedia-mcp-server` | Verified |
| SDK API | `src/api/sdk.js`, `src/core/sdk-scaffold.js` | Partial — scaffold lanes exist |
| npm SDK | D1 `proj_agentsam_sdk`, `@inneranimalmedia/agentsam-sdk` | Partial — external repo |
| Tool loop gaps | README P0: Agent mode `finalToolCount: 0` | Unstable |
| CF Agents SDK adoption | `docs/platform/agents-sdk-2026-06-adoption.md` | Planned |

### Draw (`/dashboard/draw`)

| Item | Evidence | Status |
|------|----------|--------|
| UI | `dashboard/pages/draw/DrawPage.tsx`, Excalidraw lazy | Verified |
| API | `src/api/draw.js` | Verified |
| Agent tools | `excalidraw_*`, `illustration_create` | Verified |
| Route context | **Not in** `dashboardRouteContext.ts` — falls through to `dashboard` | Partial |
| Deep link from DS | `?from=designstudio&mode=plan` | Verified |

### Design Studio (`/dashboard/designstudio`)

| Item | Evidence | Status |
|------|----------|--------|
| UI | `DesignStudioPage.tsx`, `CadStudioShell`, `AgentSamEngine` | Partial — UI oversells capability |
| APIs | `src/api/cad.js`, `cad-meshy.js`, `designstudio/index.js` | Verified |
| Jobs | `agentsam_cad_jobs`, `cad-job-runner.mjs`, `iam-cad-worker` | Partial — runner dependency |
| Route context | `design_studio` in `dashboardRouteContext.ts` | Verified |
| Blueprint phase router | D1 schema + API; UI not wired | Partial |
| Truth doc | `docs/inneranimalmedia/product/designstudio/TRUTH-2026-07.md` | Verified |

### Create family / Sam Sketch

| Item | Evidence | Status |
|------|----------|--------|
| Project hub | `proj_mrb5shkc_3kos2c`, migrations 799, 801 | Verified |
| Unified product SKU | Not a single route or app bundle | Planned |
| Lineage sketch→3D→render | Documented; manual today | Partial |

### CMS (`/dashboard/cms/*`)

| Item | Evidence | Status |
|------|----------|--------|
| Hub | `CmsPage.tsx`, `CmsSiteLauncherGrid` | Verified |
| Editor shell | `CmsStudioEditor.tsx` → iframe `/studio/editor` | Unstable |
| Federated bridge | `cms-client-bridge.js`, `cms-federated-hub-architecture.md` | Partial |
| APIs | `src/api/cms.js` + `cms-v2-api-patch.js` (partial landing) | Partial |
| Route context | `cms_edit`, `fuel_cms_admin`, `cms_client_worker` | Verified |
| Shopify-like UX | Shell tabs in `CmsShellLayout` | Unstable — display/edit loop broken |

### Images (`/dashboard/images`)

| Item | Evidence | Status |
|------|----------|--------|
| UI | `dashboard/components/ImagesPage.tsx` | Verified |
| API | `src/api/images.js` — multi-source, draft/commit | Verified |
| D1 | `cms_assets` | Verified |
| CF Images | `cloudflare_image_id`, imagedelivery.net | Verified |
| Cross-product pickers | Not unified across CMS/Create/Movie | Partial |

### Movie Mode (`/dashboard/moviemode`)

| Item | Evidence | Status |
|------|----------|--------|
| UI | `MovieModePage`, workbench, timeline | Partial — mobile editor pending |
| API | `src/api/moviemode-api.js` | Verified |
| Export | Remotion via VPC PTY | Verified |
| Satellite worker | `moviemode-service` — globe only | Partial |
| Route context | App.tsx `moviemode` workbench tab; not in `dashboardRouteContext.ts` | Partial |
| Plan | `docs/MOVIEMODE-INFRA-PLAN.md` | Verified |

### Database Explorer (`/dashboard/database`)

| Item | Evidence | Status |
|------|----------|--------|
| UI | Database studio pages | Verified |
| Route context | `database_studio` | Verified |
| Standalone intent | Not declared in code | Capability |

### Terminal

| Item | Evidence | Status |
|------|----------|--------|
| API | `src/api/terminal.js` | Verified |
| PTY lanes | local, remote GCP, sandbox container | Verified |
| Product surface | Agent-integrated, not standalone route product | Capability |

---

## Documentation state

| Area | Canonical today | Action |
|------|-----------------|--------|
| Platform ops | `README.md`, `docs/platform/iam-runtime-architecture-2026-06.md` | Keep; link from new structure |
| Platform identity | `docs/platform/PLATFORM_CONSTITUTION.md` | Update four-layer model |
| Design Studio | `docs/inneranimalmedia/product/designstudio/*` | Link; add `docs/products/design-studio/` canonical index |
| CMS | `docs/platform/cms-federated-hub-architecture.md` | Link from `docs/products/cms/` |
| Agent delivery | `.cursor/rules/iam-core.mdc` | Operational; not product identity |

---

## Confidence

This audit reflects repository state at commit time of formalization task. Maturity labels in `PRODUCT_REGISTRY.md` and `product-manifests/` derive from this evidence.
