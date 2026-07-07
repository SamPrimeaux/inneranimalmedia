# Design Studio — Agent Sam compass (2026-07)

Suggested instructions for Agent Sam on `/dashboard/designstudio`, `/dashboard/draw`, and CAD tool calls.  
**Runtime SSOT:** D1 + APIs — not this file alone. Refresh after migrations ship.

---

## What you are helping with

Design Studio is IAM's **3D preview + CAD job surface**. Draw is the **2D sketch/wireframe surface**. Neither is a full in-browser FreeCAD/Blender clone — runners execute real tools off-edge.

**User project (Sam):** `proj_mrb5shkc_3kos2c` — **Sam Sketch** (cover + files in `projects.metadata_json`; design lane tagged in migration 799).

---

## Agent entry (always use this)

```txt
illustration_create
  schema: iam.illustration.v1
  engine: auto | excalidraw | openscad | freecad | blender | meshy
```

Do **not** rely on legacy `designstudio_*` or `meauxcad_*` catalog names unless D1 `agentsam_tools` confirms a handler.

---

## Phase flow (target — blueprint-driven)

| Phase | Surface | Engine | Output |
|-------|---------|--------|--------|
| Sketch / floor plan | `/dashboard/draw` | excalidraw | PNG + JSON → blueprint `sketch_json` |
| Quick printable part | Design Studio job | openscad + BOSL2 | GLB via runner |
| Editable mechanical | Design Studio job | freecad | FCStd + STL/STEP |
| Character / prop | Design Studio | meshy | GLB (+ rig/anim when wired) |
| Architecture massing | Design Studio | freecad (Arch/BIM) | GLB + sidecar |

**Today:** phases are manual — user picks surface. **Next:** `designstudio_design_blueprints.intent_json.flow` drives routing.

---

## CAD execution truth

- Workers **never** run OpenSCAD/Blender/FreeCAD in-process.
- Jobs → `agentsam_cad_jobs` → GCP ExecOS or `iam-cad-worker` container → R2 `cad/exports/…` → viewport spawn.
- If runner is down, jobs stay `pending` — say so clearly; don't pretend preview is live.

**OpenSCAD libraries:** D1 `agentsam_openscad_libraries` + `openscad-library-resolver.js` — prefer BOSL2, not raw hull hell.

**BIM spawn:** placement sidecar `iam.cad.placement.v1` — `up_axis: Z` (FreeCAD source), `glb_up_axis: Y` (after Blender glTF export). Do not assume Z-up GLB.

---

## What is real vs cosmetic

| Real | Cosmetic / stub |
|------|------------------|
| Meshy text/image → GLB loop | Spline import button |
| OpenSCAD/FreeCAD/Blender job APIs | Blender-style menus implying in-browser modeling |
| GLB viewport (`AgentSamEngine`) | Full CAD feature parity with desktop apps |
| Draw + libraries + save | Plan button was toast — now routes to Draw (deploy pending) |
| `illustration_create` router | `designstudio_*` tools without migration handlers |
| Chess / games GLB viewport | In-viewport STL/STEP export |

---

## Sam Sketch project rules

1. Resolve project from session / `projects` row — **never hardcode** tenant or user ids in generated code.
2. Cover and files live in `metadata_json` (Cloudflare Images URLs today).
3. House plan progression: sketch in Draw → blueprint row → massing job → BIM detail — store lineage in D1.
4. Barndominium reference image is **inspiration** — dimensions/options belong in `designstudio_design_blueprints.intent_json`, not TS constants.

---

## Commands you may suggest (operator/dev)

```bash
npm run designstudio:check
npm run designstudio:smoke          # local toolchain
npm run designstudio:runner         # drain cad jobs (GCP creds)
python3 scripts/sync_learn_course_to_r2.py agentsam-cad-engineering
```

---

## Docs to read before sprint planning

| Doc | Purpose |
|-----|---------|
| `TRUTH-2026-07.md` | Code-aligned status, pros/cons, sign-off gaps |
| `docs/platform/design-cad-draw-inventory-2026-07.md` | Full inventory + priority gaps |
| `PIPELINE.md` | Runner architecture |
| `E2E-TEST-PIPELINE.md` | Meshy-free proof matrix |
| `projects/sams-house-plan.md` | Data-driven house plan model |
| `learn/agentsam-cad-engineering/` | Study course (R2 + D1) |

---

## Sign-off rule

Nothing is "done" for product until Sam signs off. Shipped code can exist while UX polish, blueprint router, and mobile flows remain open.
