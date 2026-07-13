# [Design Studio] Dream Home Artifact Engine — Sam Sketch (`proj_mrb5shkc_3kos2c`)

## Product
Design Studio | Sam Sketch (dream home / barndominium)

## Project anchor
- **Project id:** `proj_mrb5shkc_3kos2c`
- **Display name:** Sam Sketch
- **Dashboard:** https://inneranimalmedia.com/dashboard/projects/proj_mrb5shkc_3kos2c
- **Surfaces:** `/dashboard/designstudio` · `/dashboard/draw`
- **References already in project metadata:** barndominium floor plan + exterior render (see `projects.metadata_json`)

## User outcome
Sam can evolve a **real, persistent house project** from idea → sketch → parametric architectural model → visualization — with **human GUI controls** and **agent-assisted workflows**, not agent-only script roulette.

Closing this ticket means:

1. **Test A (OpenSCAD smoke)** passes — parameterized building shell, compile, parameter change, recompile, artifact retained.
2. **Test B (FreeCAD architectural MVP)** passes — BIM-style blockout on `proj_mrb5shkc_3kos2c`, editable dimensions, revision saved, object tree readable, Blender derivative possible.
3. Operator palette buttons map to **real catalog tools + real runners**, not injected placeholder scripts.
4. Inspector shows **architectural semantics** (walls, openings, footprint) — not generic “scene” sliders only.
5. Artifact graph links: intent → FreeCAD master → OpenSCAD components → Blender derivatives.

## Current failure (honest)

The Design Studio UI **looks** like a CAD product (operator search, Meshy/Blender/OpenSCAD/FreeCAD labels, viewport, Agent Sam rail) but the integration spine is **cosmetic**:

| Symptom | Evidence |
|---------|----------|
| Operators are UI labels, not routed task types | `dashboard/components/designstudio/cad-studio/operators.ts` — static `CAD_OPERATORS[]`, “Send to Agent” dumps prompt text |
| No artifact graph / revisions | Draw → collab DO; Studio → blueprint/job rows often missing `project_id` (see DESIGNSTUDIO-001) |
| CAD jobs ≠ architectural semantics | `illustration_create` + generic Python script paths; no FreeCAD BIM object inventory |
| OpenSCAD runner exists but unproven E2E | `scripts/designstudio/run-openscad.sh`, `cad-job-runner.mjs` — no gated smoke on prod path |
| FreeCAD = script dispatch, not document model | `/api/cad/freecad/script` — not FCStd lifecycle, recompute, or TechDraw |
| Meshy/Blender dominate UX | Operator modal defaults to Meshy; dream-home **source of truth** should be FreeCAD |
| Agent pins ≠ human controls | `design_studio` task_type pins Meshy tools; no `generate` / `parameterize` / `modify` taxonomy |

**Do not ship more “random script injection.”** That is the slop this ticket replaces.

## Tool hierarchy (LOCKED for this project)

| Tool | Role | Authority |
|------|------|-----------|
| **FreeCAD** | Architectural master — footprint, walls, openings, roof, rooms, drawings, IFC | **Source of truth** |
| **OpenSCAD** | Parameterized components (cabinets, trim, repeated systems) | **Referenced into** FreeCAD, never master building |
| **Blender** | Materials, lighting, renders, walkthroughs | **Derivative** of FreeCAD master |
| **Meshy** | Fast concept meshes, décor, landscaping props | **Non-authoritative** for dimensions |
| **Draw / visual_canvas** | 2D plans, diagrams, intake sketches | **Upstream** of FreeCAD blockout |

**Integration proof order:** OpenSCAD smoke first (fast runner validation) → FreeCAD MVP second (product lane).

## Task taxonomy (Design Studio — not tool names)

Thompson / route pins use **`task_type` = intent**, not `blender` / `freecad`:

```
domain: design_studio
task_type: inspect | ideate | generate | modify | compose | parameterize | convert | validate | render | export | manage_project
artifact_type: design_brief | rough_sketch | procedural_model | parametric_cad | mesh | blender_scene | render | ...
preferredTool: freecad | openscad | blender | meshy | excalidraw  (router picks after classify)
```

Example — dream-home massing (Test B):

```json
{
  "domain": "design_studio",
  "task_type": "generate",
  "artifact_type": "design_brief",
  "target_artifact_type": "parametric_cad",
  "stage": "blockout",
  "scope": "building",
  "constraints": { "preserveDimensions": true, "preserveEditability": true, "unitSystem": "ft" },
  "execution": { "preferredTool": "freecad", "mode": "branch", "approvalRequired": true }
}
```

## Integration tests (proof gates)

### Test A — OpenSCAD smoke (do first)

**Prompt:**

> Create a configurable 24 × 36-foot single-room building shell with eight-foot walls, a centered six-foot front opening, and a gable roof. Expose width, depth, wall height, opening width, and roof pitch as parameters.

**Must prove:**

- [ ] Agent or operator generates `.scad` under `proj_mrb5shkc_3kos2c` artifact path
- [ ] Runner compiles (CLI `openscad -o` per [OpenSCAD CLI docs](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Using_OpenSCAD_in_a_command_line))
- [ ] Preview captured (STL/PNG) → R2 + D1 artifact row
- [ ] Parameter change → recompile → new revision (not overwrite without lineage)
- [ ] Source `.scad` retained and human-openable in Studio script panel

### Test B — FreeCAD architectural MVP (primary product proof)

**Prompt:**

> Create a 60 × 40-foot single-storey building with ten-foot exterior walls, a 24 × 40-foot garage zone, open living area, three placeholder bedrooms, two bathrooms, a covered porch, doors, windows, and a gable roof.

**Must prove:**

- [ ] FCStd document created: `dream-home/freecad/master-v{N}.FCStd` (or project-scoped R2 key)
- [ ] Building → Storey → Slab/Walls/Openings/Roof hierarchy (FreeCAD BIM workbench — research [Arch/BIM](https://wiki.freecad.org/Arch_Workbench))
- [ ] Major dimensions exposed and editable from inspector (human sliders + agent `modify`)
- [ ] `recompute` succeeds after wall width change
- [ ] Object inventory returned to UI tree (not opaque “job done”)
- [ ] New revision saved; prior revision addressable
- [ ] Optional: derive GLB/Blender branch without destroying FCStd master

### Test C — Exterior option branch (after B)

Three Blender material branches off **one** FreeCAD master — dimensions locked. Proves promote/derive, not regenerate-from-scratch.

## Human GUI requirements (non-negotiable)

Agent assistance **augments** a real studio; it does not replace human control.

**First inspector panels (architectural, not engine internals):**

| Panel | Human controls |
|-------|----------------|
| Project | Active artifact + revision; link to `proj_mrb5shkc_3kos2c` |
| Levels | Storey list, elevations |
| Footprint | Width, depth, rotation |
| Walls | Height, thickness, alignment, material role |
| Openings | Door/window presets, width, sill height |
| Roof | Pitch, overhang, type |
| Rooms | Name, area, tags |
| Components | Insert OpenSCAD-generated refs |
| Dimensions | Read-only until edit mode |
| Visualize | Branch to Blender (preview quality) |
| Drawings | TechDraw export (later phase) |

**Operator palette (`Cmd+K`) must:**

- Call **registered catalog tools** with schemas (not free-text-only)
- Show job status, artifact id, revision
- Offer **Run** (human) and **Ask Agent** (assisted) on the same operator
- Default architectural flow to **FreeCAD**, not Meshy

## Scope

1. Research-backed executor design for OpenSCAD + FreeCAD (see Next Agent Mandate below).
2. Wire Test A smoke on prod runner path.
3. Wire Test B FreeCAD MVP on `proj_mrb5shkc_3kos2c`.
4. Replace sloppy operator→prompt injection with tool + artifact dispatch.
5. `design_studio` profile expansion (FreeCAD/OpenSCAD executors — **not** Draw `visual_canvas` tools).
6. Minimal artifact graph tables or extend existing `agentsam_artifacts` / `agentsam_cad_jobs` with lineage fields.

## Non-scope

- Full IFC/TechDraw production pipeline
- Movie Mode transcription lane
- Replacing Excalidraw / Draw (`visual_canvas` is separate — shipped)
- Sidebar nav remaster
- Meshy marketplace UX
- Claiming BIM Example stock GLB = dream-home master (it's proof stock only)

## Dependencies

| Ticket | Why |
|--------|-----|
| `tkt_designstudio_001` | Project binding on sketch/blueprint/job — artifact graph needs real `project_id` |
| `tkt_routing_tool_ssot` | Tool profiles must resolve before expanding `design_studio` pins |

## Acceptance criteria

- [ ] Test A smoke: 5 checklist items green with D1/R2 receipts pasted in ticket events
- [ ] Test B MVP: 7 checklist items green on `proj_mrb5shkc_3kos2c`
- [ ] No active catalog pin for `excalidraw_add_elements` on `design_studio` profile
- [ ] Operator `generateFreeCAD` invokes real executor — not generic chat script dump
- [ ] Human can change wall height in inspector without opening Agent chat
- [ ] Agent can `modify` same wall via `task_type: modify` with approval on destructive ops
- [ ] `consecutive_pass_count >= 2` on design-studio gate script (when gate exists) OR manual proof matrix signed in ticket

## Gap closure matrix

| Gap | Close when | Proof |
|-----|------------|-------|
| OpenSCAD runner E2E | Test A green | `.scad` + STL + 2 revisions in artifact table |
| FreeCAD document lifecycle | Test B green | FCStd v1 + v2 after dimension edit |
| Project binding | DESIGNSTUDIO-001 + this ticket | All artifacts `project_id = proj_mrb5shkc_3kos2c` |
| Operator→tool routing | Executor wired | tool_call_log shows `openscad_*` / `freecad_*` catalog keys |
| Human inspector | Panel ships | Screenshot: wall height edit without agent |
| Agent taxonomy | D1 bindings | `task_type: generate` + `preferredTool: freecad` in decision row |
| Blender derivative | Test C or defer | Branch artifact `derived_from` FK to FCStd master |
| Slop removal | No placeholder scripts in hot path | Code review: operators dispatch catalog, not raw prompt |

---

## NEXT AGENT MANDATE (read before any code)

> **You are forbidden from implementing FreeCAD/OpenSCAD integration from training data alone.**

### Required research (web search + official docs)

Before writing executors, tools, or UI controls, produce a **Research Receipt** section in the ticket event log with URLs and one-line takeaways for each:

1. **OpenSCAD CLI** — batch compile, `-D` parameter overrides, preview formats ([OpenSCAD CLI](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Using_OpenSCAD_in_a_command_line)).
2. **FreeCAD headless** — `FreeCADCmd` macro execution, document save, recompute ([FreeCAD Python scripting](https://wiki.freecad.org/Python_scripting), [Headless mode](https://wiki.freecad.org/Headless_mode)).
3. **FreeCAD BIM/Arch** — `Arch.makeWall`, `Arch.makeWindow`, `Arch.makeRoof`, building structure ([Arch Workbench](https://wiki.freecad.org/Arch_Workbench)).
4. **FreeCAD TechDraw** (defer ok) — drawing export path.
5. **Existing IAM runners** — read `scripts/designstudio/run-openscad.sh`, `run-freecad.sh`, `cad-job-runner.mjs`, `/api/cad/*` handlers — **extend, don't duplicate**.
6. **Blender headless export** — glTF/GLB pipeline for derivatives only.

### Implementation rules

1. **Real catalog tools** — each executor gets `agentsam_tools` rows with `input_schema`, `handler_key`, OAuth visibility off, pinned on `design_studio` / `cad_generation` profiles by `task_type` binding.
2. **Real buttons** — every `CAD_OPERATORS` entry maps to `{ tool_key, task_type, artifact_mutation }` or is marked `deferred` with ticket comment. No orphan labels.
3. **Human + agent** — same operation must be callable from inspector button **and** agent tool (shared handler).
4. **Artifact Engine** — every run creates/updates artifact row with `sourceArtifactIds`, `version`, `status`, `storage.sourceUri`.
5. **No Meshy as default** for architectural generate on this project — Meshy only when `target_artifact_type: mesh` and `preserveDimensions: false`.

### Stop point (Cursor law)

After research + verified path trace:

1. Verified current path (route → operator → API → runner → storage)
2. First broken boundary
3. Proposed files (minimal)
4. Acceptance test (Test A or B)
5. Rollback plan

**Wait for approval before editing.**

---

## Completion evidence

1. Research Receipt URLs in `agentsam_ticket_events` for `tkt_designstudio_002`
2. Test A + B proof artifacts (R2 keys + D1 queries)
3. Screenshot: inspector wall edit + operator panel with job id
4. Screenshot: Agent modify turn with `task_type: modify` decision row
5. Note what remains for Test C / TechDraw / IFC

## Cursor operating rule

Investigate the complete path first. Trace: route → page → operator → API → runner → D1/R2 → UI state.

**Do not** add another migration that pins tools without `validateToolProfileKeys` passing.

**Do not** conflate Draw (`visual_canvas`) with Design Studio (`design_studio` / `cad_generation`).
