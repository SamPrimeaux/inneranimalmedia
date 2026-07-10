# Create (product family)

**Classification:** `product_family`  
**Stage:** `incubating`  
**Manifest:** [`product-manifests/create.json`](../../product-manifests/create.json)

**Create** is the broader Agent Sam–enhanced creativity product family incubating under the Workspace **Create** nav group (`shellNav.ts`).

> **Create** is a family name — not interchangeable with Design Studio, Draw, or Sam Sketch.

---

## Family members

| Member | Route | Role |
|--------|-------|------|
| **Draw** | `/dashboard/draw` | 2D sketch / diagram lane (Excalidraw) |
| **Design Studio** | `/dashboard/designstudio` | 3D / CAD / GLB lane |
| **Sam Sketch** | `/dashboard/projects/proj_mrb5shkc_3kos2c` | Flagship reference project |

**Images** and **Movie Mode** share the Create nav family but are separate products/capabilities — see their own docs.

---

## Current state vs intended state

### Current state (verified)

- Draw and Design Studio are **separate routes** with separate page components
- Manual handoff: Design Studio → Draw via `?from=designstudio&mode=plan`
- Sam Sketch project in D1 with `metadata_json.designstudio` lane (migrations 799, 801)
- Agent entry: `illustration_create` router for all illustration/CAD engines
- Project hub scopes files, cover, chat — not yet filtering all Create entry points

### Intended state

- Seamless Create product: project-first workflow across Draw → massing → detail → render
- Blueprint-driven phase router (`designstudio_design_blueprints.intent_json.flow`)
- Single product SKU possible — **decision still required** (family vs umbrella brand)

### Known gaps

| Gap | Evidence |
|-----|----------|
| No unified Create app shell | Separate `DrawPage` / `DesignStudioPage` |
| Blueprint UI router unwired | `TRUTH-2026-07.md` |
| Draw missing `route_key` in route context | `dashboardRouteContext.ts` |
| Sam Sketch blueprint parent row | `sams-house-plan.md` — pending D1 insert |
| Lineage sketch→3D→render | Manual today |

---

## Decisions still required

1. **SKU naming:** Sell "Create" as one product vs "Design Studio" + "Draw" SKUs?
2. **Sam Sketch relationship:** Reference project only vs sub-brand?
3. **Graduation topology:** Single app vs two apps with shared project layer?

Document assumptions in [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md) until decided.

---

## Docs

- [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md)
- [EXPERIENCE.md](./EXPERIENCE.md)
- [AGENTSAM.md](./AGENTSAM.md)
- [../design-studio/](../design-studio/) — 3D lane detail
- Legacy technical: [../../inneranimalmedia/product/designstudio/](../../inneranimalmedia/product/designstudio/)
