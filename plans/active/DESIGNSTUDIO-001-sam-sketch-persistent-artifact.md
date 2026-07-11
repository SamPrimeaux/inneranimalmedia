# [Design Studio] Sam Sketch persistent artifact loop

## Product
Design Studio | Draw

## User outcome
For one project (Sam Sketch / a named `projects.id`), the user can:

1. Capture an idea as an Excalidraw sketch bound to that `project_id`  
2. Create or confirm a parent blueprint / artifact record  
3. Submit a CAD job from that project context  
4. Store GLB (or CAD output) as a project-linked asset  
5. Leave and reopen the project later — sketch + model restore  
6. See version / lineage metadata (project → blueprint → job → asset)  

**One project moves from idea/sketch into a persistent model artifact.**

## Current failure
Product spine is split across unbound stores:

- Live Draw UI persists to **collab DO** (`canvas:{workspace_id}`), not `projects.id`  
- `/api/draw/save` writes `project_draws.project_id = userId` (not real project FK)  
- Design Studio Save Scene sets `scene_snapshots.project_id = blueprint id` (overloaded)  
- Blueprint create often leaves `designstudio_design_blueprints.project_id` null  
- CAD jobs usually scope to blueprint id via `resolveCadJobScope`  
- Agent Excalidraw → `agentsam_artifacts`; CAD GLB → `agentsam_cad_jobs` + `cms_assets` — reopen paths diverge  

## Severity triage (this ticket)

| Issue | Severity |
|-------|----------|
| No real `projects.id` on sketch save | **B0** |
| No parent blueprint/artifact linked to project | **B0** |
| CAD job not attributable to project | **B0** |
| GLB not reopenable from project after refresh | **B0** |
| Draw UI vs `/api/draw/save` vs agent artifacts split | **B1** |
| Lineage metadata incomplete | **B1** |
| Create nav merge / hide Draw product | **B2/B3** — Sprint 5 backlog |
| Full Meshy marketplace / remesh UX | **B3** |

Only **B0** and **B1** belong in this ticket.

## Verified path (as-is)

```
Draw:
  route:   /dashboard/draw
  page:    DrawPage.tsx → ExcalidrawView.tsx
  persist: POST /api/collab/canvas/elements  (IAM_COLLAB DO)
  API alt: POST /api/draw/save → project_draws + R2 draw/scenes/{userId}/…

Design Studio:
  route:   /dashboard/designstudio
  page:    DesignStudioPage.tsx → CadStudioShell / AgentSamEngine
  API:     /api/designstudio/blueprints
           /api/designstudio/scenes*
           /api/cad/{openscad|freecad|blender|meshy}/* → /api/cad/jobs/:id/execute
  storage: designstudio_design_blueprints
           scene_snapshots + R2 scenes/{ws}/{scene}.json
           agentsam_cad_jobs + R2 cad/exports/…glb
           cms_assets (3d_studio_user)

Agent:
  illustration_create → excalidraw | cad | meshy
  Excalidraw branch → agentsam_artifacts + /api/artifacts/:id/content
  surface_open → Draw / Design Studio

Project:
  /dashboard/projects/:id  (Sam Sketch row exists in docs)
  NOT currently the save key for Draw or Studio
```

Inventory docs: `docs/platform/design-cad-draw-inventory-2026-07.md`,  
`docs/inneranimalmedia/product/designstudio/TRUTH-2026-07.md`

## Scope

1. Bind Draw and Design Studio **actions** used in this loop to a real `project_id` (one test project).  
2. Create or confirm parent blueprint / artifact record under that project.  
3. Save Excalidraw document under the project (not `userId`-as-project).  
4. Submit CAD job with project context.  
5. Store GLB/output as project-linked asset.  
6. Reopen project and restore sketch + model.  
7. Add minimal version/lineage metadata (enough to prove chain).  

## Non-scope

- Do not remaster Design Studio chrome, Creation Station panels, or Draw entry marketing UI  
- Do not merge sidebar Create nav (Sprint 5)  
- Do not replace Excalidraw with tldraw in this ticket  
- Do not wire all agent route_keys  
- Do not fix Movie Mode  

## Acceptance criteria

- [ ] Chosen `project_id` is present on sketch save row (or artifact row) — not equal to `user_id` unless they coincidentally match  
- [ ] Blueprint (or parent artifact) row has `project_id` set  
- [ ] CAD job row references same `project_id` (or clear FK chain project → blueprint → job)  
- [ ] GLB exists in R2 and is linked (cms_assets and/or scene_snapshots.glb_r2_key)  
- [ ] Reopen `/dashboard/projects/{id}` or Studio with that project — sketch JSON and GLB load without manual URL paste  
- [ ] Lineage readable: project → sketch/blueprint → job → asset (DB query or UI metadata)  

## Verification

1. Pick/create test project id; record it.  
2. Draw: create simple sketch → save under project.  
3. Confirm D1:  
   ```sql
   -- adjust table once binding chosen
   SELECT id, project_id, updated_at FROM project_draws ORDER BY updated_at DESC LIMIT 5;
   SELECT id, project_id, title FROM designstudio_design_blueprints ORDER BY updated_at DESC LIMIT 5;
   SELECT id, project_id, status, r2_key FROM agentsam_cad_jobs ORDER BY created_at DESC LIMIT 5;
   ```  
4. Submit CAD from Studio with that project context → wait for GLB.  
5. Hard refresh — reopen project — sketch + model present.  
6. Screenshot lineage or paste query results.  
7. Rollback: delete test sketch/job assets if needed.

## Documentation updates

- This file + TRUTH doc status when loop proven  
- Product registry Design Studio status if promoted  
- Sprint 5 backlog note: Create nav / Draw-as-lane decision  

## Completion evidence

1. `project_id` values from D1 for sketch, blueprint, job, asset  
2. Screenshot of restored scene with GLB  
3. First broken boundary note (expected: project binding on save)  
4. Rollback note  

## Cursor operating rule

Investigate the complete path first. Do not begin by changing the first visible component.

Trace: route → page → state → API → service/tool → database/storage → response → UI state → verification.

Identify the first broken boundary. Propose the smallest coherent fix.

Stop after presenting: (1) verified current path, (2) first broken boundary, (3) proposed files, (4) acceptance test, (5) rollback plan.

**Wait for approval before editing.**
