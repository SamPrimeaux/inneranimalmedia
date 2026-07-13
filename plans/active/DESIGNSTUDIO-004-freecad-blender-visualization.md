# [Design Studio] FreeCAD → Blender Visualization Pipeline (`proj_mrb5shkc_3kos2c`)

## Product
Design Studio | Sam Sketch — **design_visualization** branch (persistent, not optional export)

## Status
**Deferred / blocked by** [`tkt_designstudio_003`](./DESIGNSTUDIO-003-architectural-plan-lane.md).  
Contracts, lineage, semantic IDs, and promotion hooks are acceptance criteria of **003**. This ticket implements the Blender executor.

## Project anchor
- **Project id:** `proj_mrb5shkc_3kos2c`
- **D1 ticket:** `tkt_designstudio_004`
- **Depends on:** PlanGraph semantic IDs, FreeCAD artifact lineage, `promote_plan` hook surface from 003

## Authority (LOCKED)

| Authority | Owner |
|-----------|--------|
| Geometry (walls, openings, dimensions) | FreeCAD |
| Presentation (materials, lights, cameras, furniture, landscape, animation) | Blender |

Blender must **never** silently become the architectural master.

## Pipeline position

```
… → massing_freecad → detail_bim
→ visualization_package
→ blender_scene
→ render / animation / walkthrough
```

Bridge:

```
FCStd revision
→ VisualizationPackage (iam.visualization-package.v1)
→ Blender scene (.blend + recipes)
```

**Not** `FCStd → random GLB → Blender`.

## Blender scene separation

```
IAM_PROJECT
├── CAD_SYNC          ← replaceable from FreeCAD (match by semanticId)
│   ├── Walls | Roofs | Openings | Slabs | Structural
├── DESIGN_DETAILS    ← Blender-owned; survives geometry refresh
├── FURNITURE | LANDSCAPE | MATERIALS | LIGHTING | CAMERAS | ANIMATION
```

On FreeCAD update: export new VisualizationPackage → match `semanticId` → replace/update CAD_SYNC meshes → retain Blender materials/cameras/lights/furniture → rerender.

Default sync policy: `preview_then_apply`, preserve all presentation, `archive_orphaned` (never auto-delete).

## Artifact family (not only `.blend`)

```
blender-scene/vN.blend
visualization-manifest/vN.json
render-recipe/<name>-vN.json
preview-render/vN.webp
final-render/vN.png
walkthrough/vN.mp4
```

`iam.render-recipe.v1` lets Agent Sam reproduce renders without reverse-engineering the whole scene.

## Task classification (`design_visualization`)

| User request | Task | Profile |
|--------------|------|---------|
| Show approved model in 3D | `create_visualization` | design_visualization |
| Update render after geometry change | `sync_visualization` | design_visualization |
| Black metal siding / timber posts | `style_visualization` | design_visualization |
| Add pool / outdoor kitchen | `compose_scene` | design_visualization |
| Golden-hour exterior | `configure_lighting` + `render_preview` | design_visualization |
| Walkthrough | `animate_scene` | design_visualization |
| Move garage wall ten feet | `modify` on **cad_generation**, then sync Blender | split |

## Initial scope (narrow — prove the loop)

1. Read approved FreeCAD artifact  
2. Produce GLB + semantic manifest (`VisualizationPackage`)  
3. Create new `.blend`  
4. Import geometry into CAD_SYNC collections  
5. Store semantic IDs as Blender custom properties  
6. Apply small architectural material preset  
7. Create one exterior camera  
8. Create one daylight / golden-hour lighting preset  
9. Render a preview  
10. Save Blender artifact + render lineage  

### Prove then update-loop

```
PlanGraph v1 → FCStd v1 → VisualizationPackage v1 → BLEND v1 → exterior preview
FCStd v1 → BLEND v1 → move wall in FreeCAD → FCStd v2 → sync preview
→ preserve materials/camera/lights → BLEND v2 → rerender
```

## Non-scope (v1)

- Full furniture automation  
- Walkthrough navigation  
- Procedural landscaping  
- Detailed interiors / photoreal automation  
- Real-time bidirectional mesh editing  
- Complex animation  

## Acceptance

- [ ] `visualization_package_create` / sync catalog tools green  
- [ ] CAD_SYNC refresh preserves presentation collections  
- [ ] Orphaned objects archived until user confirms  
- [ ] Preview render + lineage rows on Sam Sketch  
- [ ] Gate ×2 when gate script exists  

## NEXT AGENT MANDATE

Do **not** start until 003 semantic IDs + promote_plan hook are green. Then implement VisualizationPackage writer → Blender import → one exterior preview only.

Docs lineage: contracts live in DESIGNSTUDIO-003; this ticket owns Blender/executor implementation only.
