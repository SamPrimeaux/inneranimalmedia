# Sam's House Plan — data-driven Design Studio project

**Status:** Plan + D1 hooks — product sign-off pending.  
**Owner:** Sam — project already exists in dashboard.

---

## Canonical project (dashboard)

| Field | Value |
|-------|--------|
| **Project id** | `proj_mrb5shkc_3kos2c` |
| **Name** | Sam Sketch |
| **Route** | `/dashboard/projects/proj_mrb5shkc_3kos2c` |
| **Cover** | `metadata_json.cover_image_url` (Cloudflare Images) |
| **Files** | `metadata_json.project_files[]` — includes barndominium reference image |
| **Design lane** | `metadata_json.designstudio` — added by migration 799 |

**Confirmed dynamic:** UI reads `projects` row via `/api/projects/:id`. No hardcoded TS project constants.

---

## What NOT to do

- Do not add `dashboard/lib/*Barndominium*` or fixed deep links in React.
- Do not seed fake `ctx_sams_house_plan` unless it mirrors the real `projects` row purpose.
- Do not duplicate cover URLs in code — use project metadata or `cms_assets`.

---

## SSOT stack

| Layer | Table / API | Role |
|-------|-------------|------|
| Project hub | `projects` | Cover, files, memory, instructions, chat scope |
| Design intent | `designstudio_design_blueprints` | Layout options, phases, sketch JSON |
| CAD jobs | `agentsam_cad_jobs` | Scripts, runner output |
| Assets | `cms_assets` | Stock BIM, future house GLBs |
| Sketch | `/api/draw/*` + Excalidraw | 2D floor plans |
| Agent | `illustration_create` | Phase routing target |

Optional compass row in `agentsam_project_context` may **reference** `proj_mrb5shkc_3kos2c` in `notes` — not replace it.

---

## Phase flow (target)

```txt
Chat (project-scoped)
  → blueprint phase from intent_json.flow
  → sketch: Draw / excalidraw
  → massing: freecad job → GLB
  → detail: BIM / STEP
  → render: Meshy or viewport export
```

Each step updates D1 lineage (`latest_asset_id`, blueprint status).

---

## Barndominium reference

The starter template board (3 layout options) is **reference material** attached to Sam Sketch. Layout options belong in a **blueprint** `intent_json.options[]` when you create the parent blueprint row — not in application code.

---

## Next D1 work (after 799)

1. `INSERT designstudio_design_blueprints` — parent "Sam's House Plan" linked to project id in `project_id` column.  
2. Optional `project_memory` / instructions via project UI (you fill content).  
3. Wire Design Studio entry to list blueprints filtered by active project — generic query, no slug constants.

---

## Related docs

- `../TRUTH-2026-07.md`
- `../AGENTSAM.md`
- `../../../platform/design-cad-draw-inventory-2026-07.md`
