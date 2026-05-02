# Design Studio (product)

| Field | Value |
|--------|--------|
| **Product name** | Design Studio |
| **Internal codename** | MeauxCAD Design Lab |
| **Platform** | Inner Animal Media Dashboard |
| **Route** | `/dashboard/designstudio` |

**Related files (this folder)**

- `PIPELINE.md` — **implementation plan**: remote runner, Worker APIs, UI, VoxelEngine gaps, phases.
- `E2E-TEST-PIPELINE.md` — **Meshy/Spline-free** E2E: blueprint → OpenSCAD → STL → GLB → R2 → D1 → Design Studio; test cases + iPhone proof.
- `design-blueprints-schema.sql` — DDL for `designstudio_design_blueprints` (mirror of `migrations/247_*`).
- `companion-tables.md` — suggested `agentsam_*` tables and how they connect.

Parent product docs: `../roadmap.md`, `../goals.md`, `../page-quality-standards.md`, `../known-bugs.md`.

---

## 1. Product definition

Design Studio is an **AI-assisted, local-first 3D creation environment** that combines:

- Voxel modeling  
- Parametric CAD direction (OpenSCAD / FreeCAD — target architecture)  
- AI-assisted design workflows (Agent Sam)  
- GLB-based real-time rendering (Three.js)  
- Physics simulation (cannon-es)  

---

## 2. Current state (implementation truth)

### What exists

- Three.js scene and camera system  
- Voxel-based modeling  
- CAD-like plane drawing (XZ / XY / YZ)  
- GLB import and drag/drop  
- Basic physics (cannon-es)  
- UI: left panel, HUD, bottom tool bar  
- Modes: **Games**, **Agent Sam (CAD)**, **Sandbox**  

### Partially implemented

- CAD tools: **circle, sphere, cone** not implemented in `VoxelEngine`  
- Undo/redo: basic entity stack only  
- Export: **JSON** download only (“Blender Bridge”), not GLB/STL  
- Assets: mix of hardcoded URLs and **D1** (`cms_assets` for chess via `/api/games/pieces`)  

### Missing (critical gaps)

- No end-to-end **AI → CAD** pipeline in product code  
- No **structured design intent** layer in DB (see `design-blueprints-schema.sql`)  
- No **OpenSCAD / FreeCAD** integration in the live app  
- No **persistent project** system for studio sessions  
- **Generation** UI (style / density / physics toggles) largely **not wired** to `VoxelEngine`  
- No **metrics → learning** loop for this surface  

---

## 3. Core vision

**From idea → structured plan → CAD → asset → refinement → learning loop.**

Design Studio is **not** only a 3D editor. It is an **AI-assisted design system with memory and metrics**.

---

## 4. Architecture direction (layers)

| Layer | Contents |
|--------|-----------|
| **1 — UI / interaction** | React SPA, Three.js viewport, tool overlays; optional Excalidraw concept layer |
| **2 — Engine** | `VoxelEngine` (existing); CAD engine abstraction (new); parametric engine (OpenSCAD bridge, target) |
| **3 — AI orchestration** | Agent Sam, tool system (`agentsam_*`), planning and workflows |
| **4 — Data + learning** | D1 / SQLite / Supabase; token and latency tracking; outcome scoring |

---

## 5. Product modes (refined)

### Games mode

- **Purpose:** Interactive physics and gameplay.  
- **Enhancements:** Multiplayer, physics constraints, scriptable entities.  

### Agent Sam mode (core) — internal name: **Blueprint mode**

- **Purpose:** AI-assisted CAD and structured modeling.  
- **Enhancements:** OpenSCAD generation, parametric constraints, design intent tracking, AI suggestions.  

### Sandbox mode

- **Purpose:** Free experimentation.  
- **Enhancements:** Full physics controls, stress testing, debug visualization.  

---

## 6. Phase roadmap

### Phase 1 — Foundation (now)

**Goal:** Stabilize and wire real functionality.

- OpenSCAD CLI → export pipeline (where approved for runtime).  
- `.scad` generation path and tooling.  
- Implement missing CAD tools (circle, sphere, cone) in `VoxelEngine`.  
- Replace JSON-only export with STL / GLB path (e.g. Blender batch) as infrastructure allows.  
- Normalize asset system (DB-backed catalog).  

### Phase 2 — AI integration

**Goal:** Make Agent Sam materially useful on this route.

- `designstudio_design_blueprints` + intent JSON workflow.  
- Prompt → structured plan → CAD code.  
- Excalidraw sketch pipeline.  
- Model providers (e.g. OpenAI / local Ollama) per org policy.  

### Phase 3 — Parametric CAD

**Goal:** True CAD-style behavior.

- OpenSCAD integration as core path.  
- FreeCAD scripting bridge (optional).  
- Constraint system: dimensions, relationships, regeneration.  

### Phase 4 — Asset pipeline

**Goal:** Production-ready assets.

- GLB optimization, R2 storage, versioning, metadata.  

### Phase 5 — Learning system

**Goal:** Self-improving loop.

- Token and cost tracking per tool, success/failure scoring, optimization hints.  

---

## 7. Key data systems

### Design blueprint (new, critical)

Sits between **user idea** and **CAD code**. Schema: `design-blueprints-schema.sql`.

### Tool execution tracking

Existing: `agentsam_tool_call_log`, `agentsam_tool_chain`. Extend with latency, tokens, cost where missing.

### Asset tracking

`cms_3d_assets` and aligned catalog tables (see `companion-tables.md`).

---

## 8. Target AI workflow (illustrative)

1. User: “Build a parametric chess board.”  
2. Agent Sam creates / updates a blueprint row (`intent_json`).  
3. Generate OpenSCAD (or target CAD script) → `cad_script`.  
4. CLI export → STL; optional conversion → GLB.  
5. Load into scene; attach `latest_asset_id`.  
6. Log metrics; update quality / success fields over time.  

---

## 9. UX direction

**Strengths:** Clear layout, mode switching, solid viewport.

**Gaps:** Remove or wire dead controls; contextual tools; design timeline; history panel; constraints panel.

---

## 10. Non-negotiables

- Traceability: tokens, latency, cost where applicable.  
- **Local-first** and **offline-capable** where product allows.  
- **AI optional** — core editing must work without model calls.  

---

## 11. Success criteria

Design Studio becomes: **CAD system + design assistant + learning engine + production pipeline**.

**Final statement:** Built correctly, Design Studio plus Agent Sam is a platform that **designs, builds, learns, and improves** — not a single feature.

---

## Source code pointers (repo)

| Area | Location |
|------|-----------|
| Page | `agent-dashboard/agent-dashboard/components/DesignStudioPage.tsx` |
| Engine | `agent-dashboard/agent-dashboard/services/VoxelEngine.ts` |
| HUD / CAD chrome | `agent-dashboard/agent-dashboard/components/UIOverlay.tsx` |
| Types | `agent-dashboard/agent-dashboard/types.ts` |
| Games API (pieces) | `src/api/games.js` — `GET /api/games/pieces` |
| Worker SPA segment | `worker.js` — `SPA_ROUTES` includes `designstudio` |
