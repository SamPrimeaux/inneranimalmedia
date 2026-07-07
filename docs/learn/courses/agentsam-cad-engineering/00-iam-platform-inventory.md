# Module 00 — IAM platform inventory

**Time:** 30 min read · 15 min lab  
**Prerequisite:** Dashboard access, repo clone

## What you are learning

Where Draw, Design Studio, and AgentSam CAD actually live in Inner Animal Media — and what is real vs cosmetic.

## IAM has two design surfaces

### Draw (`/dashboard/draw`) — ✅ honest

- **Editor:** Excalidraw (`dashboard/components/ExcalidrawView.tsx`)
- **API:** `src/api/draw.js`
- **Agent:** `excalidraw_*` tools + `illustration_create` → Excalidraw lane
- **Assets:** R2 `__tools__/draw/*.excalidrawlib`, D1 `draw_libraries`

Draw is production-ready. Wireframes, UI kits, plan maps, and library loading work end-to-end.

### Design Studio (`/dashboard/designstudio`) — ⚠️ good bones, sloppy shell

**Real:**

- CAD API: `src/api/cad.js` (OpenSCAD, FreeCAD, Blender jobs)
- Meshy API: `src/api/cad-meshy.js`
- Runner: `scripts/designstudio/cad-job-runner.mjs`
- Dispatch: GCP ExecOS + optional CF container (`containers/iam-cad-worker/`)
- Viewport: `AgentSamEngine.ts` loads GLB from R2
- Agent SSOT: `illustration_create` → `src/core/iam-illustration-router.js`

**Cosmetic / incomplete:**

- Blender-style menu chrome implies in-browser modeling we do not have
- Spline import button is a stub (`CreationLane.tsx`)
- Product README still mentions missing OpenSCAD (stale)
- Only one SCAD fixture: `chess-board.scad`

## The real CAD pipeline

```txt
User prompt or script
  → POST /api/cad/openscad/generate (or illustration_create)
  → agentsam_cad_jobs (D1, status pending)
  → cad-job-runner (off-edge: GCP or iam-cad-worker container)
  → OpenSCAD → STL → Blender → GLB
  → R2 cad/exports/…
  → SSE cad_glb_ready → Design Studio spawns GLB
```

Workers **never** run OpenSCAD/Blender in-process. If the runner is down, jobs sit in `pending`.

## OpenSCAD library intelligence (already shipped)

Migration `775` seeds `agentsam_openscad_libraries` (26 libs).  
`src/core/openscad-library-resolver.js` maps user intent → import lines (BOSL2 auto-prepended for mechanical work).

Agent-generated SCAD should use these libraries — not hand-rolled hull rounding.

## What we do NOT have

| Gap | Impact |
|-----|--------|
| CadQuery / build123d | No Python CAD runner lane |
| Template families | No Gridfinity/enclosure/bracket product templates in repo |
| FreeCAD STEP → viewport | STEP-only jobs fail GLB ingest |
| `designstudio_*` catalog tools | Legacy names; use `illustration_create` |
| Learn course in D1 | Docs exist in repo; D1 seed optional next step |

## Lab checklist

- [ ] Open `/dashboard/draw` — load a P0 library (e.g. web-kit)
- [ ] Open `/dashboard/designstudio` — confirm GLB viewport loads
- [ ] Read `docs/platform/design-cad-draw-inventory-2026-07.md`
- [ ] Run locally:

```bash
cd /path/to/inneranimalmedia
npm run designstudio:check
./scripts/designstudio/run-openscad.sh \
  scripts/designstudio/fixtures/chess-board.scad /tmp/chess.stl
```

- [ ] Optional: `npm run designstudio:smoke` if toolchain installed

## AgentSam takeaway

Use `illustration_create` with explicit `engine`. Do not pretend the viewport is a CAD editor — it is a **preview surface** for runner output.

## Next module

→ `01-openscad-bosl2.md`
