# Shared capabilities

**Status:** Canonical · **Parent:** [PLATFORM_CONSTITUTION.md](../platform/PLATFORM_CONSTITUTION.md)

Capabilities serve multiple products. They are not standalone customer SKUs unless promoted in the registry.

---

## Capability index

| ID | Name | Route / entry | Serves |
|----|------|---------------|--------|
| `agent-runtime` | Agent Sam runtime | `/api/agent/*` | All products |
| `images-dam` | Images / DAM | `/dashboard/images` | CMS, Create, Movie Mode, projects |
| `terminal` | Terminal execution | Agent panel + `/api/terminal/*` | Agent Sam, dev workflows |
| `database-explorer` | Database Studio | `/dashboard/database` | Workspace operators |
| `auth` | Authentication | `/auth/*`, session | Platform |
| `projects` | Project hub | `/dashboard/projects` | Cross-product scoping |
| `artifacts` | Work library | `/dashboard/artifacts` | Cross-product artifacts |
| `workflows` | Workflow runner | `/dashboard/workflows` | Agent Sam, automation |
| `model-routing` | Model catalog | D1 `agentsam_model_catalog` | Agent Sam |
| `mcp-plumbing` | MCP OAuth host | `mcp.inneranimalmedia.com` | Agent Sam external |

---

## Images / DAM (`images-dam`)

**Not a resale product today** — shared digital asset management.

| Layer | Path |
|-------|------|
| UI | `dashboard/components/ImagesPage.tsx` |
| API | `src/api/images.js` |
| Table | `cms_assets` |
| CF Images | `cloudflare_image_id`, `imagedelivery.net` |

Workflow gap: unified pickers across CMS, Create, Movie Mode — see [../products/images/README.md](../products/images/README.md).

---

## Terminal (`terminal`)

PTY lanes: local Mac, GCP remote, CF container sandbox. Gated by `agentsam_user_policy.can_run_pty`.

See [../platform/terminal-three-lane-model.md](../platform/terminal-three-lane-model.md).

---

## Database Explorer (`database-explorer`)

Schema inspection UI. `route_key: database_studio` in route context.

**Standalone intent:** false unless promoted via PDR.

---

## Agent runtime (`agent-runtime`)

Full specification: [AGENT_RUNTIME.md](./AGENT_RUNTIME.md)

---

## Related

- [PRODUCT_MANIFEST_SCHEMA.md](./PRODUCT_MANIFEST_SCHEMA.md)
- [../products/PRODUCT_REGISTRY.md](../products/PRODUCT_REGISTRY.md)
