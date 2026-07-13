# [Design Studio] Architectural Plan Lane — PlanGraph bridge (`proj_mrb5shkc_3kos2c`)

## Product
Design Studio | Sam Sketch (dream home / barndominium)

## Project anchor
- **Project id:** `proj_mrb5shkc_3kos2c`
- **Surfaces:** `/dashboard/draw` (concepts) · `/dashboard/designstudio` (3D + promote)
- **Depends on:** `tkt_designstudio_002` (FreeCAD master), `tkt_designstudio_001` (project binding)
- **Blocks (lineage only):** [`tkt_designstudio_004`](./DESIGNSTUDIO-004-freecad-blender-visualization.md) — FreeCAD → Blender visualization (implement later; contracts start here)

## User outcome
2D house plans are **not** generic Excalidraw drawings or `imgx_generate_image` pretty pictures. They flow:

```
requirements
→ sketch_excalidraw
→ plan_graph
→ massing_freecad
→ detail_bim
→ visualization_package          ← contract defined in 003; executor in 004
→ blender_scene                  ← DESIGNSTUDIO-004
→ render / animation / walkthrough
```

## Authority split (LOCKED)

| Layer | Owns | Must never |
|-------|------|------------|
| **PlanGraph** | Interpreted 2D architectural meaning, stable semantic IDs | Become the 3D master |
| **FreeCAD** | Dimensions, walls, openings, levels, roof, constraints — editable architectural master | Be replaced by Blender mesh edits |
| **Blender** | Presentation geometry, materials, lighting, cameras, environment, landscaping, furnishing, render/animation | Silently become architectural master |
| **Meshy** | Concept meshes / character animation | Plan dimensions or house master |
| **OpenSCAD** | Component smoke / parametric parts | House master |
| **Excalidraw** | Early layouts, markup, review overlays | Dimensional authority |

A wall can look better in Blender; its authoritative length, location, and openings still come from FreeCAD.

## Routing law (LOCKED)

| Input | `task_type` | Profile | Tool ownership |
|-------|-------------|---------|----------------|
| Vague brief | `create_plan` | `visual_canvas` | Excalidraw adjacency / layout options |
| Rough sketch photo | `trace_plan` | `architectural_plan` | Vision → PlanGraph → review overlay |
| Dimensioned PDF/image | `inspect_plan` | `architectural_plan` | Dimension extract + approve gate |
| Approved PlanGraph | `promote_plan` | `cad_generation` | FreeCAD BIM blockout |
| Show approved model / style / render | `create_visualization` … (004) | `design_visualization` | VisualizationPackage → Blender |
| Geometry change (“move garage wall 10 ft”) | `modify` | `cad_generation` | FreeCAD first → then sync Blender (004) |

## PlanGraph (bridge SSOT)

Do **not** route image → random FreeCAD Python. Persist `iam.plan_graph.v1` with:

- `boundary`, `walls[]`, `rooms[]`, `openings[]`, `dimensions[]`, `annotations[]`, `unresolved[]`
- `confidence` on every structural object
- **Stable semantic IDs** on every structural object (required for 004), e.g.:
  - `wall.exterior.north.001`
  - `window.kitchen.east.001`
  - `door.garage.interior.001`
  - `roof.main.gable.001`
  - `slab.ground.001`
- Lineage fields on artifacts: `derived_from`, `promoted_from`, `supersedes`
- Units + coordinate system recorded on FreeCAD promotion

Storage: R2 JSON + D1 artifact row (`agentsam_artifacts` or `designstudio_plan_graphs`). Extend `designstudio_design_blueprints.intent_json` only as a pointer — not the geometry SSOT.

### Semantic ID mapping (003 writes; 004 consumes)

```
PlanGraph object id
  → FreeCAD object custom property
  → VisualizationPackage.objects[].semanticId
  → Blender object["iam_semantic_id"] (+ iam_source_artifact_id, iam_source_revision, iam_role)
```

Without durable IDs, every FreeCAD update looks like unrelated new geometry to Blender.

## VisualizationPackage contract (defined in 003 — **do not implement Blender executor here**)

Bridge is **not** `FCStd → random GLB → Blender`. Use:

```
FCStd revision
→ VisualizationPackage (iam.visualization-package.v1)
→ Blender scene (004)
```

```ts
type VisualizationPackage = {
  schema: "iam.visualization-package.v1";
  id: string;
  projectId: string;
  sourceArtifactId: string;
  sourceRevision: number;
  sourceType: "parametric_building";
  geometry: { glbUri: string; manifestUri: string };
  objects: Array<{
    semanticId: string;
    sourceObjectId: string;
    name: string;
    role:
      | "wall" | "slab" | "roof" | "door" | "window"
      | "column" | "beam" | "fixture" | "site" | "unknown";
    parentSemanticId?: string;
    materialSlot?: string;
    levelId?: string;
    visible: boolean;
    replaceable: boolean;
  }>;
  units: "mm" | "cm" | "m" | "in" | "ft";
  coordinateSystem: string;
  generatedAt: string;
};
```

GLB = geometry derivative (never master). Manifest = semantic identity GLB alone cannot carry.

### Sync policy default (004 applies; 003 records intent)

```json
{
  "geometryAuthority": "freecad",
  "presentationAuthority": "blender",
  "onSourceUpdate": "preview_then_apply",
  "preserve": {
    "materials": true,
    "cameras": true,
    "lighting": true,
    "worldEnvironment": true,
    "furniture": true,
    "landscaping": true,
    "animation": true
  },
  "deleteBehavior": "archive_orphaned"
}
```

Do not auto-delete Blender objects when FreeCAD drops them — mark orphaned until user approves.

### Post-promotion hook (003 acceptance)

`promote_plan` **must**:

1. Return created FCStd artifact id + revision  
2. Persist units + coordinate system on the FreeCAD artifact  
3. Preserve PlanGraph semantic IDs as FreeCAD custom properties  
4. Treat any GLB preview as a **derivative**  
5. Optionally enqueue `visualization_package_create` (hook may be stubbed / no-op until 004)

Project stage / flow metadata includes:

```
sketch_excalidraw → plan_graph → massing_freecad → detail_bim
→ visualization_package → visualization_blender → render_output
```

## Profiles to add (D1)

| `profile_key` / `route_key` | Pins (intent) |
|-----------------------------|---------------|
| `architectural_plan` | plan understand / validate / PlanGraph tools |
| `design_visualization` | VisualizationPackage + Blender tasks (004 enables tools) |

Register `design_visualization` route **now** (even if most tools deferred). Task types for 004:

`create_visualization` · `sync_visualization` · `style_visualization` · `compose_scene` · `configure_camera` · `configure_lighting` · `render_preview` · `render_final` · `animate_scene` · `export_visualization`

`visual_canvas` and `cad_generation` already exist — **do not** overload them with plan or Blender semantics.

## Catalog tools (D1-driven — not hardcoded prompt injection)

Models **freehand** tool arguments against `agentsam_tools.input_schema`. Operators may compose a short **intent** message; they must **not** paste Python/OpenSCAD/Blender scripts as the product path.

Required in **003**:

- `plan_graph_create` — vision/heuristic → PlanGraph draft (with semantic IDs)
- `plan_graph_validate` — dimension chains + unresolved list
- `plan_graph_promote` — approved PlanGraph → FreeCAD job; returns FCStd id; may enqueue viz package hook

Deferred to **004** (named here only):

- `visualization_package_create` · `visualization_sync` · Blender scene / render recipe tools

## First success condition (003)

1. User uploads or sketches a simple plan  
2. Agent produces PlanGraph with Confirmed / Needs confirmation + stable semantic IDs  
3. User corrects in review UI → PlanGraph v2 (lineage, not overwrite)  
4. `promote_plan` → FCStd v1 with IDs/units/coords + returned artifact id  
5. Viewport shows GLB **derivative**; user moves one wall → FCStd v2 → preview refresh  
6. Hook surface exists for `visualization_package_create` (stub OK until 004)

Supported vocabulary v1: exterior boundary, interior walls, rooms, doors, windows, slab, porch, simple gable, overall dimensions.

## Non-scope (003)

- Full Blender executor / `.blend` authoring (→ **004**)  
- Furniture automation, walkthroughs, photoreal interiors  
- Full construction docs / MEP / structural analysis  
- OpenSCAD as house master  
- `imgx_generate_image` as floor-plan authority  
- Coin/Pivy FreeCAD viewer in browser  
- Meshy character animation (separate catalog — Anim Library / Rig)

## Acceptance (003)

- [ ] `architectural_plan` route + profile in D1 with `validateToolProfileKeys` green  
- [ ] `design_visualization` route registered (tools may be deferred stubs)  
- [ ] `iam.plan_graph.v1` schema with **stable semantic IDs** + artifact writer  
- [ ] Human review panel for `unresolved[]`  
- [ ] `promote_plan` creates FCStd revision linked to PlanGraph; returns artifact id  
- [ ] FreeCAD artifact records units + coordinate system; preserves semantic IDs  
- [ ] Lineage supports `derived_from` / `promoted_from` / `supersedes`  
- [ ] GLB previews tagged as derivatives, not masters  
- [ ] Post-promotion hook can enqueue `visualization_package_create` (stub allowed)  
- [ ] Project flow metadata includes `visualization_package` → `visualization_blender` → `render_output`  
- [ ] Linked ticket `tkt_designstudio_004` exists and is blocked_by 003  
- [ ] Prompt copy never steers 2D house plans to `imgx_generate_image`  
- [ ] Gate: consecutive_pass_count ≥ 2 when gate script exists  

## NEXT AGENT MANDATE

1. Web-search FreeCAD Arch/BIM + OpenSCAD CLI only for **executor** design (same as 002).  
2. Implement PlanGraph schema + `architectural_plan` D1 lane **before** UI chrome.  
3. Trace: Draw sketch → PlanGraph (IDs) → promote → FreeCAD → GLB derivative + viz hook stub.  
4. Stop for approval after path trace + minimal file list.  
5. Do **not** implement Blender/VisualizationPackage executor — that is 004.

**Do not** conflate with Meshy character animation (Anim Library / Rig — separate from architectural lane).
