# Create — experience

**Parent:** [README.md](./README.md)

---

## Target workflow (Sam Sketch)

```
Project hub (proj_mrb5shkc_3kos2c)
  → Sketch: Draw / Excalidraw
  → Massing: Design Studio + FreeCAD job → GLB
  → Detail: BIM / STEP
  → Render: Meshy or viewport export
```

Each step updates D1 lineage (`designstudio_design_blueprints`, `agentsam_cad_jobs`, `cms_assets`).

---

## Current user paths

| Intent | Today | Status |
|--------|-------|--------|
| New 2D sketch | Draw entry → canvas | Verified |
| 3D preview / CAD job | Design Studio entry → viewport | Partial UI |
| Plan from DS | Link to `/dashboard/draw?from=designstudio&mode=plan` | Verified |
| Project files | `/dashboard/projects/:id` | Verified |
| Guided phase flow | — | Planned |

---

## Agent experience

- Side panel on Draw and Design Studio routes
- Design Studio: `cadcreator` subagent default
- Quick actions on Design Studio route context
- Draw: agent events `iam:excalidraw_load_document`

---

## Related

- [AGENTSAM.md](./AGENTSAM.md)
- [../../inneranimalmedia/product/designstudio/projects/sams-house-plan.md](../../inneranimalmedia/product/designstudio/projects/sams-house-plan.md)
