# [Design Studio] Sam Sketch — consolidated dream-home tracker

**Ticket:** `tkt_designstudio_sam_sketch` · **Status:** active · **Priority:** P1
**Project:** `proj_mrb5shkc_3kos2c` (Sam Sketch — designstudio + first house / barndominium)
**Dashboard:** https://inneranimalmedia.com/dashboard/projects/proj_mrb5shkc_3kos2c
**Surfaces:** `/dashboard/designstudio` · `/dashboard/draw`

> Single source of truth for the Sam Sketch dream-home build. Folds the five DESIGNSTUDIO
> tickets + the Design Studio route-pin ticket into one project-aligned tracker, and records
> the CAD storage + reliability work already shipped.

## Supersedes (folded here)

| Old ticket | Was | Folded as workstream |
|---|---|---|
| `tkt_designstudio_001` | Sam Sketch persistent artifact loop | **WS-1 Persistence & lineage** |
| `tkt_designstudio_002` | Dream Home Artifact Engine (FreeCAD master + OpenSCAD smoke) | **WS-2 Engine spine / tool hierarchy** |
| `tkt_designstudio_003` | Architectural Plan Lane (PlanGraph bridge) | **WS-3 Plan lane** |
| `tkt_designstudio_004` | FreeCAD → Blender visualization pipeline | **WS-4 Visualization** |
| `tkt_designstudio_005` | Repair eight Meshy catalog handler configs | **WS-5 Meshy catalog repair** |
| `tkt_p0_design_studio_pin` | Design Studio route pin + CAD create regex → D1 | **WS-6 Routing / classification** |

Authoritative status snapshot: `docs/platform/design-cad-draw-inventory-2026-07.md`.

## Locked design principles

- Do **not** build a fake CAD UI. Calm frontend over **real engines**, **reusable templates**, **real export pipelines**.
- **Tool hierarchy (LOCKED):** FreeCAD = architectural master/source of truth · OpenSCAD = parametric components referenced into FreeCAD · Blender = presentation/derivative (never silently the master) · Meshy = non-authoritative concept meshes · Draw/Excalidraw = upstream 2D intake.
- **Authority split:** geometry → FreeCAD · presentation → Blender · plan meaning → PlanGraph.

---

## DONE — infrastructure & reliability (shipped this cycle)

CAD output storage moved off the codebase `ASSETS` bucket and the fragile GCP VM runner path proven replaceable by the CF/local container lane.

- [x] **Dedicated `cad` R2 bucket + CDN domain.** GLB output now writes to bucket `cad`, served publicly via `cad.inneranimalmedia.com` (bucket CORS applied for cross-origin `GLTFLoader`). Legacy `cad/exports/*` on `ASSETS` stay readable. — commit `cb061b6e`
- [x] **`cad_generate` model_key footgun removed.** Tool no longer forwards an agent-supplied `model_key` into the LLM resolver (was throwing `MODEL_NOT_FOUND` on the object slug); dropped from tool schema. — commit `7cecb196` + migration `944`
- [x] **`cad_job_status` fixed.** Stopped selecting a non-existent `public_url` column (`D1_ERROR ... offset 85`) that made every Meshy/OpenSCAD job appear failed; derives URL from `r2_key`. — commit `9ecaff53`
- [x] **CF/local CAD container spine validated E2E.** `meauxcontainer-cad-worker:cad-v1` run locally: OpenSCAD → GLB → `glb-upload` → `cad` bucket → `job-complete`. Job row `status=done`, `r2_bucket=cad`, `result_url=https://cad.inneranimalmedia.com/...`; GLB served `200 model/gltf-binary` with ACAO; `cms_assets` row written. — commit `4af1cf91`
- [x] **Container callback bucket fix.** `containers/iam-cad-worker/run-pipeline.mjs` no longer hardcodes the legacy bucket/`/assets/` URL — uses the `glb-upload` response (single source of truth).

**Open follow-up (infra):** push `cad-v1` image to CF registry (blocked earlier by Docker Desktop proxy `:3128` broken pipe), enable `[[containers]]` + `IAM_CAD_WORKER` binding in `wrangler.production.toml`, set `CAD_DISPATCH_TARGET=container` (or `auto`), deploy, smoke `/api/internal/cad-container/health`.

---

## Workstreams (folded scope)

### WS-1 — Persistence & lineage  (from DESIGNSTUDIO-001)
One project moves idea → sketch → persistent model artifact, reopenable with lineage.
- [ ] Excalidraw sketch bound to real `projects.id` (not collab DO / userId).
- [ ] Parent blueprint/artifact record linked to project; `designstudio_design_blueprints.project_id` populated.
- [ ] CAD job attributable to project; GLB stored as project-linked asset.
- [ ] Reopen restores sketch + model; lineage visible: project → blueprint → job → asset.

### WS-2 — Engine spine / tool hierarchy  (from DESIGNSTUDIO-002)
- [ ] **Test A — OpenSCAD smoke:** parameterized shell compiles, param change recompiles, artifact retained. *(container lane now proven — wire to prod path.)*
- [ ] **Test B — FreeCAD architectural MVP:** BIM blockout on the project, editable dims, revision saved, object tree readable, Blender derivative possible.
- [ ] Operator palette buttons map to real catalog tools + real runners (no injected placeholder scripts).
- [ ] Inspector shows architectural semantics (walls, openings, footprint), not generic scene sliders.
- [ ] Fix `freecad_output_step_only` GLB-only ingest gap.

### WS-3 — Architectural plan lane  (from DESIGNSTUDIO-003)
Flow: `requirements → sketch_excalidraw → plan_graph → massing_freecad → detail_bim → visualization_package → blender_scene → render`.
- [ ] PlanGraph semantic layer (stable semantic IDs) — 2D architectural meaning, not generic drawings.
- [ ] `promote_plan` hook surface (contract consumed by WS-4).
- [ ] Draw sketch → plan graph → FreeCAD massing params bridge.

### WS-4 — FreeCAD → Blender visualization  (from DESIGNSTUDIO-004)
- [ ] Blender executor consuming PlanGraph/FreeCAD lineage from WS-3.
- [ ] `visualization_sync_policy`: geometry authority FreeCAD, presentation Blender, `preview_then_apply`, preserve materials/cameras/lighting/furniture/landscaping/animation, `archive_orphaned`.

### WS-5 — Meshy catalog repair  (from DESIGNSTUDIO-005)
- [ ] Eight active Meshy tools are `handler_type=ai` with **empty `handler_config`** despite builtin impls in `src/tools/builtin/media.js` → populate `handler_config` (same fix pattern as migration 943/944 for `excalidraw_export` / `cad_generate`). Meshy stays non-authoritative for dimensions.

### WS-6 — Routing / classification  (from tkt_p0_design_studio_pin)
- [ ] Design Studio route pin + CAD-create regex resolved from D1 classification consumers (no hardcoded routing). Ref: `plans/backlog/tkt_hardcoded_routing_audit-findings.md`.

---

## Priority order (north star: inventory doc)
1. **Honest UI over real jobs** (WS-2) — describe → job → preview → export; hide chrome implying in-browser modeling we don't have.
2. **Persistence spine** (WS-1) — B0 project binding must be real before deeper lanes.
3. **Template families** — 5–8 parametric OpenSCAD templates (Gridfinity, enclosure, bracket, phone stand, tray) vs today's single `chess-board.scad`.
4. **Runner reliability as product requirement** — CF container lane (infra follow-up above) so jobs don't stall on the GCP VM.
5. Plan lane (WS-3) → visualization (WS-4) → Meshy polish (WS-5) → routing hardening (WS-6).

## E2E proof tracking (dual-pass, `required_pass_count=2`)
- **PASS 1 (infra spine, 2026-07-18):** local Docker `cad-v1` full pipeline → `cad` bucket → viewport URL 200 + CORS + `cms_assets`. (see DONE section)
- **PASS 2 (pending):** in-app Design Studio prompt → job → GLB spawns in viewport from `cad.inneranimalmedia.com`, with a real `projects.id` binding.

## Key files
```txt
src/api/cad.js · src/core/cad-dispatch.js · src/core/cad-job-complete.js · src/core/cad-job-scope.js
src/tools/builtin/design-studio.js · src/tools/builtin/media.js · src/core/iam-illustration-router.js
containers/iam-cad-worker/ · scripts/designstudio/cad-job-runner.mjs
dashboard/components/DesignStudioPage.tsx · dashboard/components/designstudio/cad-studio/CadStudioShell.tsx
dashboard/pages/draw/DrawPage.tsx · src/api/draw.js
docs/platform/design-cad-draw-inventory-2026-07.md (SSOT status)
```
