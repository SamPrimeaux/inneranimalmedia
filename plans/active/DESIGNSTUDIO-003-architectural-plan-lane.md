# [Design Studio] Architectural Plan Lane — PlanGraph bridge (`proj_mrb5shkc_3kos2c`)

## Product
Design Studio | Sam Sketch (dream home / barndominium)

## Project anchor
- **Project id:** `proj_mrb5shkc_3kos2c`
- **Surfaces:** `/dashboard/draw` (concepts) · `/dashboard/designstudio` (3D + promote)
- **Depends on:** `tkt_designstudio_002` (FreeCAD master), `tkt_designstudio_001` (project binding)

## User outcome
2D house plans are **not** generic Excalidraw drawings or `imgx_generate_image` pretty pictures. They flow:

```
2D plan input
→ architectural plan understanding
→ normalized PlanGraph (iam.plan_graph.v1)
→ human verification
→ FreeCAD architectural model
→ Blender / GLB visualization derivative
```

## Routing law (LOCKED)

| Input | `task_type` | Profile | Tool ownership |
|-------|-------------|---------|----------------|
| Vague brief | `create_plan` | `visual_canvas` | Excalidraw adjacency / layout options |
| Rough sketch photo | `trace_plan` | `architectural_plan` | Vision → PlanGraph → review overlay |
| Dimensioned PDF/image | `inspect_plan` | `architectural_plan` | Dimension extract + approve gate |
| Approved PlanGraph | `promote_plan` | `cad_generation` | FreeCAD BIM blockout |
| Materials / render | `visualize_plan` | `design_visualization` | Blender / Meshy décor (non-authoritative) |

**Excalidraw owns** early layouts, markup, review overlays.  
**PlanGraph owns** walls/rooms/openings/dimensions/confidence/`unresolved[]`.  
**FreeCAD owns** dimensional building master.  
**Blender owns** look. **OpenSCAD** = components only. **Meshy** = concept meshes / character animation — never plan dimensions.

## PlanGraph (bridge SSOT)

Do **not** route image → random FreeCAD Python. Persist `iam.plan_graph.v1` with:

- `boundary`, `walls[]`, `rooms[]`, `openings[]`, `dimensions[]`, `annotations[]`, `unresolved[]`
- `confidence` on every structural object
- Lineage: `excalidraw-plan/vN` → `plan-graph/vN` → `freecad-building/vN`

Storage: R2 JSON + D1 artifact row (`agentsam_artifacts` or `designstudio_plan_graphs`). Extend `designstudio_design_blueprints.intent_json` only as a pointer — not the geometry SSOT.

## Profiles to add (D1)

| `profile_key` / `route_key` | Pins (intent) |
|-----------------------------|---------------|
| `architectural_plan` | plan understand / validate / PlanGraph tools (new catalog keys) |
| `design_visualization` | Blender derivative + Meshy décor (existing runners) |

`visual_canvas` and `cad_generation` already exist — **do not** overload them with plan semantics.

## Catalog tools (D1-driven — not hardcoded prompt injection)

Models **freehand** tool arguments against `agentsam_tools.input_schema`. Operators may compose a short **intent** message for Agent Sam; they must **not** paste Python/OpenSCAD scripts as the product path.

Required new tools (this ticket):

- `plan_graph_create` — vision/heuristic → PlanGraph draft
- `plan_graph_validate` — dimension chains + unresolved list
- `plan_graph_promote` — approved PlanGraph → FreeCAD job (uses DESIGNSTUDIO-002 executor)

UI operators map to `{ tool_key, task_type, artifact_mutation }` or `deferred`.

## First success condition (one level)

1. User uploads or sketches a simple plan  
2. Agent produces PlanGraph with Confirmed / Needs confirmation  
3. User corrects in review UI → PlanGraph v2 (lineage, not overwrite)  
4. `promote_plan` → FCStd v1 on Sam Sketch  
5. Viewport shows GLB; user moves one wall → FCStd v2 → preview refresh  

Supported vocabulary v1: exterior boundary, interior walls, rooms, doors, windows, slab, porch, simple gable, overall dimensions.

## Non-scope

- Full construction docs / MEP / structural analysis  
- OpenSCAD as house master  
- `imgx_generate_image` as floor-plan authority  
- Coin/Pivy FreeCAD viewer in browser  

## Acceptance

- [ ] `architectural_plan` route + profile in D1 with `validateToolProfileKeys` green  
- [ ] `iam.plan_graph.v1` schema + artifact writer  
- [ ] Human review panel for `unresolved[]`  
- [ ] `promote_plan` creates FCStd revision linked to PlanGraph id  
- [ ] Prompt copy never steers 2D house plans to `imgx_generate_image`  
- [ ] Gate: consecutive_pass_count ≥ 2 when gate script exists  

## NEXT AGENT MANDATE

1. Web-search FreeCAD Arch/BIM + OpenSCAD CLI only for **executor** design (same as 002).  
2. Implement PlanGraph schema + `architectural_plan` D1 lane **before** UI chrome.  
3. Trace: Draw sketch → PlanGraph → promote → FreeCAD → GLB spawn.  
4. Stop for approval after path trace + minimal file list.

**Do not** conflate with Meshy character animation (cataloged in migration 851 — separate from this lane).
