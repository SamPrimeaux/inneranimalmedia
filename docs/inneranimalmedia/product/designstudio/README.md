# Design Studio (product)

| Field | Value |
|--------|--------|
| **Product name** | Design Studio |
| **Internal codename** | MeauxCAD Design Lab |
| **Platform** | Inner Animal Media Dashboard |
| **Route** | `/dashboard/designstudio` |
| **2D sketch route** | `/dashboard/draw` (Excalidraw) |

**Start here (2026-07):** [`TRUTH-2026-07.md`](TRUTH-2026-07.md) — code-aligned status (replaces stale sections below).  
**Agent Sam:** [`AGENTSAM.md`](AGENTSAM.md)  
**Inventory + gaps:** [`docs/platform/design-cad-draw-inventory-2026-07.md`](../../../platform/design-cad-draw-inventory-2026-07.md)

---

## Related files

| File | Purpose |
|------|---------|
| `TRUTH-2026-07.md` | What works / partial / stub — sign-off gaps |
| `AGENTSAM.md` | Agent compass for CAD + Draw lanes |
| `PIPELINE.md` | Runner architecture (off-edge execution) |
| `E2E-TEST-PIPELINE.md` | Meshy-free E2E test matrix |
| `E2E-COMPLETE-PLAN-2026-06.md` | Full execution plan |
| `projects/sams-house-plan.md` | Sam Sketch house plan — data model |
| `design-blueprints-schema.sql` | Blueprint DDL |
| `companion-tables.md` | Suggested companion tables |

Study course: `learn/agentsam-cad-engineering/` · D1 migration `799_*`

---

## 1. Product definition

Design Studio is an **AI-assisted 3D creation environment**:

- **Preview:** Three.js viewport (`AgentSamEngine`) — GLB spawn, Meshy assets, games/chess  
- **Execution:** OpenSCAD, FreeCAD, Blender, Meshy via off-edge runners — **not** in-browser CAD  
- **Sketch:** Excalidraw on `/dashboard/draw` for 2D plans and wireframes  
- **Agent:** `illustration_create` SSOT router  

Design Studio is **not** a web clone of FreeCAD/Blender. It is a calm frontend over real engines, templates, and export pipelines.

---

## 2. Current state (summary — see TRUTH doc for detail)

### Production-ready
- Draw (Excalidraw), libraries, save/export, agent tools  
- CAD job APIs + runner pipeline (GCP + container path)  
- Meshy text/image → GLB loop (~complete; animation UI polishing)  
- `illustration_create` multi-engine router  
- OpenSCAD library registry (D1 775) + intent resolver  
- Sam Sketch project (`proj_mrb5shkc_3kos2c`) — dynamic cover + files in D1  

### In progress (valid, not signed off)
- Blueprint-driven phase router (sketch → massing → render)  
- Template families (Gridfinity v1 scaffold + BOSL2 on worker image)  
- BIM spawn orientation (fixed 2026-07 — deploy to verify)  
- Mobile UX polish  
- Learn course in `/dashboard/learn`  

### Not real / stubs
- Spline import (removed from Creation lane)  
- Legacy `designstudio_*` tool names without handlers  
- In-browser parametric CAD editing  
- CadQuery/build123d runners (planned)  

---

## 3. Architecture (layers)

| Layer | Contents |
|--------|-----------|
| **UI** | React — entry screen, CadStudioShell, Creation lane, Draw |
| **Viewport** | `AgentSamEngine.ts` (Three.js + cannon-es) |
| **API** | `src/api/cad.js`, `designstudio/index.js`, `draw.js` |
| **Execution** | `cad-job-runner.mjs`, `iam-cad-worker` container, ExecOS |
| **Agent** | `illustration_create` → `iam-illustration-router.js` |
| **Data** | D1: jobs, blueprints, libraries, projects, cms_assets |

---

## 4. Key routes & APIs

```txt
/dashboard/designstudio     — 3D studio
/dashboard/draw             — Excalidraw sketch
/dashboard/projects/:id     — project chat + files (Sam Sketch)

POST /api/cad/openscad/generate
POST /api/cad/freecad/script
POST /api/cad/meshy/*
GET  /api/designstudio/blueprints
illustration_create         — agent SSOT
```

---

## 5. Engine matrix (north star)

| Engine | Role | Status |
|--------|------|--------|
| excalidraw | 2D sketch / wireframe | ✅ |
| openscad + BOSL2 | STL generators | ✅ runner |
| freecad | FCStd / BIM / STEP | ✅ partial |
| blender | GLB convert / scripts | ✅ runner |
| meshy | Cloud 3D + anim | ✅ ~complete |
| cadquery / build123d | Python CAD | 🔲 planned |

---

## 6. Deprecated doc claims

The following in older revisions of this README are **wrong** — use `TRUTH-2026-07.md` instead:

- "VoxelEngine" → **`AgentSamEngine`**
- "No OpenSCAD integration" → jobs + runner exist
- "JSON-only export" → GLB via runner; JSON is debug/bridge only
- "No AI → CAD pipeline" → `illustration_create` + jobs exist; missing **guided UX**

---

## 7. Standalone product path

Design Studio + Draw + project system (`projects`, blueprints, assets) is the progression toward a standalone creativity product. Sam Sketch (`proj_mrb5shkc_3kos2c`) is the reference project — data in D1, not hardcoded dashboard constants.

Parent platform context: `ctx_designstudio_games_remaster_2026_06` (migration 681).
