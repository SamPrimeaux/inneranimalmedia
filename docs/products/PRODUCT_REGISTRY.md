# Inner Animal Media — Product Registry

**Status:** Canonical · **Updated:** 2026-07-09  
**Audit:** [../platform/AUDIT_MULTI_PRODUCT_2026-07-09.md](../platform/AUDIT_MULTI_PRODUCT_2026-07-09.md)  
**Manifests:** [`product-manifests/`](../../product-manifests/)

> Do not infer a product's identity solely from its route or directory.

---

## Registry

| ID | Name | Class | Family | Stage | Route | Standalone | Confidence |
|----|------|-------|--------|-------|-------|------------|------------|
| `workspace` | Workspace (Foundry) | workspace | — | production | `/dashboard/*` | no | verified |
| `agent-sam` | Agent Sam | independent_product | — | incubating | `/dashboard/agent` + MCP + SDK | yes | partial |
| `create` | Create | product_family | — | incubating | (nav family) | yes | partial |
| `draw` | Draw | independent_product | create | incubating | `/dashboard/draw` | yes | verified |
| `design-studio` | Design Studio | independent_product | create | incubating | `/dashboard/designstudio` | yes | partial |
| `sam-sketch` | Sam Sketch (reference project) | reference_project | create | incubating | `/dashboard/projects/proj_mrb5shkc_3kos2c` | n/a | verified |
| `cms` | CMS | independent_product | — | incubating | `/dashboard/cms/*` | yes | partial |
| `images` | Images / DAM | shared_capability | — | incubating | `/dashboard/images` | no | verified |
| `movie-mode` | Movie Mode | independent_product | — | incubating | `/dashboard/moviemode/*` | yes | partial |
| `database-explorer` | Database Explorer | shared_capability | — | internal_alpha | `/dashboard/database` | maybe | verified |
| `terminal` | Terminal | shared_capability | — | production | (agent-integrated) | no | verified |

---

## Detail by surface

### Workspace (`workspace`)

| Field | Value |
|-------|-------|
| **Implementation** | `dashboard/`, `dashboard/config/shellNav.ts`, `App.tsx` |
| **Agent Sam** | Hosts embedded agents; not a product |
| **Docs** | [../workspace/WORKSPACE_CONSTITUTION.md](../workspace/WORKSPACE_CONSTITUTION.md) |
| **Blockers** | None — shell is operational |

---

### Agent Sam (`agent-sam`)

| Field | Value |
|-------|-------|
| **Surfaces** | In-app, embedded, MCP, SDK, scaffold |
| **Implementation** | `src/api/agent*.js`, `src/core/runtime-profile.js`, MCP repo, `src/api/sdk.js` |
| **Agent integration** | Self — runtime spine |
| **Docs** | [agent-sam/README.md](./agent-sam/README.md), [../shared/AGENT_RUNTIME.md](../shared/AGENT_RUNTIME.md) |
| **Blockers** | Agent mode zero-tool compile; CF Agents SDK migration planned |
| **Dependencies** | Platform auth, D1 catalog, model routing |

---

### Create family (`create`)

| Field | Value |
|-------|-------|
| **Members** | Draw, Design Studio, Sam Sketch project |
| **Docs** | [create/README.md](./create/README.md) |
| **Blockers** | No unified app; blueprint router unwired; SKU decision pending |
| **Decision required** | Umbrella SKU vs separate lane SKUs |

---

### Draw (`draw`)

| Field | Value |
|-------|-------|
| **Implementation** | `dashboard/pages/draw/`, `src/api/draw.js` |
| **Agent** | `illustration_create` → excalidraw; **no** `route_key` in route context |
| **Docs** | [create/README.md](./create/README.md) (family) |
| **Blockers** | Route context gap; not project-scoped entry |

---

### Design Studio (`design-studio`)

| Field | Value |
|-------|-------|
| **Implementation** | `DesignStudioPage.tsx`, `src/api/cad.js`, `designstudio/` |
| **Agent** | `route_key: design_studio`, `cadcreator` subagent |
| **Docs** | [design-studio/README.md](./design-studio/README.md) |
| **Blockers** | UI oversells capability; runner dependency; blueprint UI |

---

### Sam Sketch (`sam-sketch`)

| Field | Value |
|-------|-------|
| **Project ID** | `proj_mrb5shkc_3kos2c` |
| **Role** | Flagship reference workflow — not a separate route product |
| **Docs** | [../inneranimalmedia/product/designstudio/projects/sams-house-plan.md](../inneranimalmedia/product/designstudio/projects/sams-house-plan.md) |
| **Blockers** | Parent blueprint row pending |

---

### CMS (`cms`)

| Field | Value |
|-------|-------|
| **Implementation** | `CmsPage.tsx`, `CmsStudioEditor.tsx`, `src/api/cms.js` |
| **Agent** | `cms_edit`, `cms_client_worker`, `fuel_cms_admin` |
| **Docs** | [cms/README.md](./cms/README.md) |
| **Blockers** | Editor iframe / section display broken |

---

### Images (`images`)

| Field | Value |
|-------|-------|
| **Implementation** | `dashboard/components/images/*`, `src/api/images.js`, `src/core/cf-resource-tags.js` |
| **Agent** | Image generate/commit tools |
| **Docs** | [images/README.md](./images/README.md) |
| **Blockers** | Cross-product picker unification |

---

### Movie Mode (`movie-mode`)

| Field | Value |
|-------|-------|
| **Implementation** | `dashboard/features/moviemode/`, `moviemode-api.js` |
| **Agent** | Workbench tab; render tools — **no** route context entry |
| **Docs** | [movie-mode/README.md](./movie-mode/README.md) |
| **Blockers** | Mobile editor; API offload to satellite |

---

### Database Explorer (`database-explorer`)

| Field | Value |
|-------|-------|
| **Implementation** | Database studio pages, `d1-dashboard` APIs |
| **Agent** | `route_key: database_studio` |
| **Standalone intent** | false unless promoted |

---

### Terminal (`terminal`)

| Field | Value |
|-------|-------|
| **Implementation** | `src/api/terminal.js`, agent bottom panel |
| **Agent** | `agentsam_terminal_*` tools |
| **Standalone intent** | false — execution capability |

---

## Lifecycle reference

[../platform/PRODUCT_LIFECYCLE.md](../platform/PRODUCT_LIFECYCLE.md)

---

## Maintenance

Update this file and `product-manifests/*.json` together when maturity, routes, or blockers change.
