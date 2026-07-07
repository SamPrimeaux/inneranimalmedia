# Design / CAD / Draw — platform inventory (2026-07)

Honest snapshot of what Inner Animal Media has today, what is real vs cosmetic, and gaps worth filling **in order**.

**Related:** `docs/learn/courses/agentsam-cad-engineering.md` · `docs/inneranimalmedia/product/designstudio/`

---

## Executive summary

We have **good bones** and **real backend plumbing** — but the in-app CAD experience still reads as a Blender-themed shell over a voxel viewport, not a calm product over real engines.

| Surface | Route | Verdict |
|---------|-------|---------|
| **Draw** | `/dashboard/draw` | **Production-ready** — Excalidraw, libraries, save/export, agent tools |
| **Design Studio** | `/dashboard/designstudio` | **Substantial but uneven** — real job pipeline + fake-ish UI chrome |
| **AgentSam CAD** | `illustration_create` | **Real router** — OpenSCAD / FreeCAD / Blender / Meshy / Excalidraw |
| **Python CAD** | — | **Missing** — no CadQuery, build123d, or runner lane |
| **Templates** | fixtures + D1 registry | **Early** — one SCAD fixture, library registry, no product template families |

**Design principle (locked):** Do not build a fake CAD UI. Build a calm frontend over **real engines**, **reusable templates**, and **real export pipelines**.

---

## What we have

### 1. Draw — 2D illustration lane (strong)

**Route:** `/dashboard/draw`

| Layer | Status | Notes |
|-------|--------|-------|
| Excalidraw embed | ✅ Live | `@excalidraw/excalidraw`, collab broadcast |
| API | ✅ Live | `src/api/draw.js` — libraries, save, load, export |
| P0 libraries | ✅ Seeded | 9 libs in D1 + R2 (`migrations/783_*`, `scripts/publish-draw-p0-libraries.mjs`) |
| Agent tools | ✅ Live | `excalidraw_*`, plan maps, wireframe routing (`785_*`) |
| Unified router | ✅ Live | `illustration_create` → Excalidraw lane via `iam-illustration-router.js` |

Draw is the **most honest surface** in the design lane: real editor, real files, real exports.

---

### 2. Design Studio — 3D CAD lab (mixed)

**Route:** `/dashboard/designstudio`

#### Real infrastructure (backend + execution)

| Component | Path | What it does |
|-----------|------|--------------|
| CAD API | `src/api/cad.js` | OpenSCAD / FreeCAD / Blender script jobs, job queue |
| Meshy API | `src/api/cad-meshy.js` | Text/image → 3D, rigging, retexture, print formats |
| Design Studio API | `src/api/designstudio/index.js` | Blueprints, runs, assets, scenes |
| Job runner | `scripts/designstudio/cad-job-runner.mjs` | Poll D1 → OpenSCAD/FreeCAD → STL → Blender → GLB → R2 |
| Dispatch | `src/core/cad-dispatch.js` | GCP ExecOS (default) or CF container (`iam-cad-worker`) |
| Container | `containers/iam-cad-worker/` | Ubuntu image: openscad, blender, freecad |
| Job complete | `src/core/cad-job-complete.js` | R2 ingest, SSE `cad_glb_ready`, D1 status |
| OpenSCAD libs | `migrations/775_*` + `openscad-library-resolver.js` | 26 D1-registered libs; intent → import lines |
| Illustration SSOT | `illustration_create` (755) | Agent entry for all illustration/CAD lanes |

**Pipeline that actually works (when runner is up):**

```txt
prompt / .scad / FreeCAD script
  → agentsam_cad_jobs (D1)
  → cad-job-runner (GCP or CF container)
  → OpenSCAD → STL → Blender → GLB
  → R2 cad/exports/{tenant}/{workspace}/{job_id}.glb
  → Design Studio viewport loads GLB
```

#### UI layer (bones good, polish sloppy)

| Component | Path | Verdict |
|-----------|------|---------|
| Viewport | `AgentSamEngine.ts` (Three.js) | Real GLB spawn, physics, games tie-in |
| CAD shell | `cad-studio/CadStudioShell.tsx` | Large Blender-style chrome — menus, docks, panels |
| Creation lane | `CreationLane.tsx` | Direct API job fire (good); Spline import stub |
| Job polling | `useDesignStudioCad.ts`, `useCadJobPoll.ts` | Wired |
| Export formats | `cadExportFormats.ts` | Meshy formats documented; STEP path incomplete |

Product README (`designstudio/README.md`) is **stale** — it still describes missing OpenSCAD integration and “VoxelEngine” gaps that backend code has largely addressed. Trust **code + migrations** over that doc’s “Current state” section.

---

### 3. AgentSam tools (real entry point)

| Tool | Handler | Lane |
|------|---------|------|
| `illustration_create` | `src/tools/builtin/media.js` → router | SSOT for wireframe + CAD + Meshy |
| `excalidraw_*` | collab + draw API | Draw |
| `meshyai_*` | cad-meshy API | Cloud 3D |

**Practical agent path today:** `illustration_create` with `engine`: `auto` | `excalidraw` | `openscad` | `freecad` | `blender` | `meshy`.

Legacy catalog names (`designstudio_openscad_generate`, `meauxcad_*`) appear in `analytics/agentsam/commands/` but are **not** consistently migration-seeded with dedicated handlers — the router is the SSOT.

---

### 4. Data + assets

| Store | Contents |
|-------|----------|
| D1 `agentsam_cad_jobs` | Job queue, scripts, status, Meshy reconcile |
| D1 `agentsam_openscad_libraries` | 26 libs incl. BOSL2 P1 |
| D1 `designstudio_design_blueprints` | Intent / blueprint rows (247) |
| D1 `draw_libraries` | Excalidraw library catalog |
| D1 `cms_assets` | Stock GLB, chess pieces, BIM examples |
| R2 `cad/exports/…` | Generated GLB output |
| R2 `__tools__/draw/` | Excalidraw `.excalidrawlib` files |
| Fixtures | `scripts/designstudio/fixtures/chess-board.scad` only |

---

### 5. Toolchain scripts (developer-local)

`scripts/designstudio/` — `run-openscad.sh`, `run-freecad.sh`, `stl-to-glb.py`, `cad-job-runner.mjs`, smoke/check scripts, FreeCAD AppImage install for remote VM.

NPM: `designstudio:check`, `designstudio:smoke`, `designstudio:runner`.

---

### 6. Docs + skills (partial)

| Asset | Status |
|-------|--------|
| Product docs | `docs/inneranimalmedia/product/designstudio/*` |
| Sprint plan | `docs/platform/designstudio-sprint-plan.md` |
| Meshy skill | `skills/meshy-3d-designstudio/SKILL.md` |
| Draw test matrix | `docs/platform/draw-p0-test-matrix.md` |
| **CAD learn course** | **This audit adds it** — `docs/learn/courses/agentsam-cad-engineering/` |

---

## Target architecture (north star)

```txt
/draw
  /engines
    openscad     → fast STL generators (BOSL2-backed)
    freecad      → editable FCStd / STEP / BIM / TechDraw
    cadquery     → Python generated CAD (future)
    build123d    → modern Python CAD (future)
  /templates
    enclosures, organizers, brackets, mounts, signs
    rooms, garages, shop-house, assemblies
  /outputs
    preview.png, model.stl, model.step, model.glb
    source.scad, source.py, project.FCStd
```

---

## Gaps worth filling — priority order

### P0 — Make the product feel real (not fake)

1. **Honest UI over real jobs** — Strip or hide chrome that implies editing features we do not have (full Blender modeling in-browser). Primary UX: describe → job → preview → export. Creation lane pattern is correct; shell should match it.
2. **Template families, not one-off SCAD** — Add 5–8 parametric templates (Gridfinity bin, YAPP-style enclosure, bracket, phone stand, tray) under `scripts/designstudio/templates/` with exposed params JSON → `.scad` rewrite → runner. Only `chess-board.scad` exists today.
3. **Runner reliability as product requirement** — Document + monitor: jobs stay `pending` without `designstudio:runner` or ExecOS. iPhone-safe E2E must be provable on every ship touching CAD.
4. **Stale product docs** — Update `designstudio/README.md` to match `AgentSamEngine`, live APIs, and `illustration_create` SSOT.

### P1 — OpenSCAD as generator engine (study → ship)

5. **Vendor BOSL2 on runner** — Registry knows BOSL2 (`775`); runner image must include cloned libs at fixed paths. Agent must generate **against BOSL2**, not raw `cube()` hell.
6. **Gridfinity pattern** — Clone/study `gridfinity_extended_openscad` + `gridfinity-rebuilt-openscad`; ship IAM parametric organizer template (customizer UX = params panel → regenerate).
7. **Library resolver → template resolver** — Extend `openscad-library-resolver.js` pattern to pick **template scaffolds** + libraries from intent tags.

### P2 — FreeCAD as document engine

8. **FreeCAD macro lane** — Study `FreeCAD-macros`; agent generates `.FCMacro` or `.py` headless scripts; store FCStd + STEP in R2 (fix `freecad_output_step_only` GLB-only ingest gap).
9. **Parts catalog** — Study `FreeCAD-library`; model `cms_assets` / template metadata like parts library (tags, dims, preview, source FCStd).
10. **Assembly model** — Study Assembly4.1; D1 schema for parts ↔ assemblies ↔ exports (versioned source objects).

### P3 — Python CAD backends (best agent codegen)

11. **CadQuery runner** — Add `cadquery` engine to container + `illustration_create` router. LLMs generate Python more reliably than OpenSCAD.
12. **build123d as alternate** — Same runner image; pick engine by intent or user preference.
13. **CQ-editor / OCP viewer UX** — Code panel + live preview split (like Creation lane BUILD tab, but with real reload).

### P4 — Architecture / BIM lane (Sam’s house, shop, garage)

14. **BIM workbench study → massing mode** — Concept massing first; BIM detailing later. `freecad-bim-export-with-sidecar.py` already exists as a script seed.
15. **Blueprint persistence** — Wire `designstudio_design_blueprints` into UI flows (create from prompt, link to job, show lineage).

### P5 — Learning loop + polish

16. **Learn course in D1** — Seed `agentsam-cad-engineering` course from `docs/learn/courses/agentsam-cad-engineering/` (see course manifest).
17. **Metrics → templates** — Track which templates/jobs succeed; Thompson routing exists for script arms (`668`); extend to template selection.
18. **Draw ↔ Studio bridge** — Excalidraw sketch → blueprint → OpenSCAD params (documented in vision; partially wired via plan artifacts).

---

## Clone-first external repos

Study order for the team (learn modules mirror these):

| Priority | Repo | IAM use |
|----------|------|---------|
| 1 | [BelfrySCAD/BOSL2](https://github.com/BelfrySCAD/BOSL2) | Default OpenSCAD abstraction |
| 2 | [ostat/gridfinity_extended_openscad](https://github.com/ostat/gridfinity_extended_openscad) | Organizer template UX |
| 3 | [kennetek/gridfinity-rebuilt-openscad](https://github.com/kennetek/gridfinity-rebuilt-openscad) | Complex parametric bins |
| 4 | [FreeCAD/FreeCAD-macros](https://github.com/FreeCAD/FreeCAD-macros) | Agent macro execution |
| 5 | [FreeCAD/FreeCAD-library](https://github.com/FreeCAD/FreeCAD-library) | Parts catalog model |
| 6 | [yorikvanhavre/BIM_Workbench](https://github.com/yorikvanhavre/BIM_Workbench) | Architecture lane |
| 7 | [leoheck/FreeCAD_Assembly4.1](https://github.com/leoheck/FreeCAD_Assembly4.1) | Assembly structure |
| 8 | [CadQuery/cadquery](https://github.com/CadQuery/cadquery) | Python CAD engine |
| 9 | [CadQuery/CQ-editor](https://github.com/CadQuery/CQ-editor) | Dev/preview UX |
| 10 | [gumyr/build123d](https://github.com/gumyr/build123d) | Modern Python CAD |
| 11 | [bernhard-42/vscode-ocp-cad-viewer](https://github.com/bernhard-42/vscode-ocp-cad-viewer) | In-IDE preview pattern |

Reference-only (do not make primary abstraction): OpenSCAD MCAD, OMDL, awesome-openscad (map), keyboard_parts (domain-specific pattern).

---

## Key file index

```txt
# Draw
dashboard/pages/draw/DrawPage.tsx
src/api/draw.js
src/core/iam-illustration-router.js

# Design Studio UI
dashboard/components/DesignStudioPage.tsx
dashboard/components/designstudio/cad-studio/CadStudioShell.tsx
dashboard/services/AgentSamEngine.ts

# Backend
src/api/cad.js
src/core/cad-dispatch.js
src/core/openscad-library-resolver.js
scripts/designstudio/cad-job-runner.mjs
containers/iam-cad-worker/

# Registry
migrations/755_iam_illustration_v1_tool.sql
migrations/775_openscad_library_registry.sql
migrations/783_draw_libraries_p0_seed.sql
```

---

## Bottom line

**Have:** Real multi-engine job pipeline, OpenSCAD library intelligence, Draw as a polished 2D lane, AgentSam unified router, off-edge execution (GCP + container path).

**Need:** Template product layer, honest UI, Python CAD engines, FreeCAD document/assembly model, BIM lane, and learn content so the team (and AgentSam) stop improvising raw SCAD.

**Avoid:** Pretending the Three.js shell is FreeCAD/Blender. Ship generators and exports; let heavy CAD stay in headless runners.
