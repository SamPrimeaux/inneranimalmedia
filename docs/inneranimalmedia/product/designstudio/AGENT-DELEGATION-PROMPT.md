# Agent delegation — Design Studio E2E

Copy the **Coordinator** block into a new Cursor agent session. Assign **Workstream** blocks to parallel agents. All agents must read `E2E-COMPLETE-PLAN-2026-06.md` first.

---

## Coordinator prompt (lead agent)

```
You are the lead agent for Inner Animal Media Design Studio E2E completion.

Repo: /Users/samprimeaux/inneranimalmedia
Plan (law): docs/inneranimalmedia/product/designstudio/E2E-COMPLETE-PLAN-2026-06.md

Rules:
- No stubs, no deferred sprints, no "later" items. Every task needs DoD checked.
- D1 is source of truth; Supabase is RAG/analytics mirror only.
- OpenSCAD/Blender run on Mac VM / PTY host only — never in Worker isolate.
- Local toolchain verified: OPENSCAD_BIN=/opt/homebrew/bin/openscad BLENDER_BIN=/usr/local/bin/blender
- Run `npm run designstudio:check` and `npm run designstudio:smoke` before claiming CAD work done.
- Schema re-index (Phase 0A) must complete before any code that writes migration 581 columns.
- Do not commit unless user asks. Do not deploy unless user asks.

Your job:
1. Execute Phase 0A schema re-index immediately.
2. Split remaining phases across workstream agents (below).
3. Merge PRs / resolve conflicts; run node --check on touched .js files.
4. Report blockers with file paths and exact missing routes/secrets.

Current gaps (verified):
- meshyai_* tools → dead /api/meshy/* routes (fix to /api/cad/meshy/*)
- DesignStudioPage.tsx does not call /api/cad/* or blueprints API
- agentsam_cad_jobs 581 columns not written by API
- scene_snapshots 581 columns not written on save
- No cad-job-runner daemon
- agentsam_media_gemini2_1536 has 0 rows (writer exists in moviemode-media-vectorize.js, not triggered on all paths)
- agentsam_plans Supabase mirror empty (mirror script exists, Worker sync not wired)
- agentsam_database_schema_oai3large_1536 missing migration 581 columns

Deliverable: functional /dashboard/designstudio E2E on iPhone (OpenSCAD chess-board + Meshy GLB + Save Scene with project_id).
```

---

## Workstream A — Schema + platform hygiene

```
Workstream A: Schema RAG + tool route fixes.

Read: E2E-COMPLETE-PLAN-2026-06.md Phase 0.

Tasks:
1. Run scripts/autorag_ingest.py --lane schema (with required flags) for migration 581 tables.
2. Verify agentsam_database_schema_oai3large_1536 content includes project_id, glb_r2_key, progress_pct, scene_snapshot_id.
3. Fix src/tools/builtin/media.js meshyai_* URLs → /api/cad/meshy/*
4. Migration 582_*: update agentsam_tools handler_config_json for meshy tools if D1-driven.
5. Add post-migration schema re-index note to deploy script docs if missing.

DoD: summarizePending migrations clean; meshy tool invoke returns non-404; schema RAG spot-check passes.

Do not touch UI. Report SQL/table names changed.
```

---

## Workstream B — CAD runner + Worker APIs

```
Workstream B: CAD job runner + execute API (no UI).

Read: E2E-COMPLETE-PLAN-2026-06.md Phase 1.
Scripts: scripts/designstudio/* (run-openscad.sh, stl-to-glb.py, pipeline-smoke.sh, upload-asset.sh)

Tasks:
1. Create scripts/designstudio/cad-job-runner.mjs — poll agentsam_cad_jobs pending, run openscad/blender, upload R2.
2. Migration 582_cad_runner_queue.sql — runner columns + indexes.
3. Implement POST /api/cad/jobs/:id/execute and POST /api/internal/cad/job-complete in src/api/cad.js.
4. Meshy: on SUCCEEDED download GLB to R2 (not CDN URL only); write cms_assets.
5. Populate agentsam_cad_jobs workspace_id, tenant_id, project_id, scene_snapshot_id, progress_pct on create.
6. Write agentsam_usage_events with ref_table/ref_id on job complete.
7. Write agentsam_todo on failed/stuck jobs.

Env: OPENSCAD_BIN=/opt/homebrew/bin/openscad BLENDER_BIN=/usr/local/bin/blender

DoD: chess-board.scad fixture → GLB in R2 via runner; one job pending→done; usage_events row exists.

Do not touch dashboard. node --check all edited .js files.
```

---

## Workstream C — Design Studio UI + Precision Blueprints

```
Workstream C: Design Studio frontend + scenes API 581 columns.

Read: E2E-COMPLETE-PLAN-2026-06.md Phase 2.
Files: dashboard/components/DesignStudioPage.tsx, src/api/designstudio/scenes.js, VoxelEngine.ts

Tasks:
1. Wire Meshy/Spline/Blender toolbar to /api/cad/* (poll until done, load GLB in VoxelEngine).
2. PUT /api/designstudio/scenes — persist project_id, voxel_count, style_preset, glb_r2_key, cad_job_id.
3. Save Scene button writes all 581 fields from engine state.
4. Wire ProjectType.CAD to blueprint API + Agent Sam chat panel (SSE, chatRouteKey designstudio).
5. Implement circle/sphere/cone in VoxelEngine.ts; wire GenerationConfig to engine.
6. Remove primary-path "run locally via PTY" UX for iPhone users; dev panel optional.

DoD: Save/reload scene preserves 581 metadata; Meshy toolbar loads model; blueprint row created from UI.

Depends on Workstream B for execute endpoint. Can mock poll against stub until B lands.
```

---

## Workstream D — Supabase RAG + memory + plans mirror

```
Workstream D: Supabase activation (Tier 1 + 2 tables).

Read: E2E-COMPLETE-PLAN-2026-06.md Phase 3.
Files: src/core/moviemode-media-vectorize.js, src/core/designstudio-memory.js (create), agentsam-plan-supabase-sync (create)

Tasks:
1. src/core/designstudio-memory.js — write agentsam_memory on style save, project save, CAD failure.
2. Wire agentsam_plans Hyperdrive upsert on D1 plan create/update (mirror scripts/mirror-d1-plans-to-supabase-public.mjs logic into Worker).
3. Ensure moviemode-api.js calls indexMediaAssetForSearch on every video/cms_assets upload path.
4. agentsam_usage_events helper shared with Workstream B.

DoD: agentsam_memory new rows after Design Studio save; one video upload → agentsam_media_gemini2_1536 row > 0; plan mirror row after D1 plan insert.

No CAD runner code. No dashboard UI.
```

---

## Workstream E — Meaux Games + MovieMode project spine

```
Workstream E: Meaux Games MVP + MovieMode project_id + cross-export.

Read: E2E-COMPLETE-PLAN-2026-06.md Phase 4–5.
Files: dashboard/App.tsx, src/api/moviemode-api.js, projects table usage

Tasks:
1. moviemode_edit_sessions create — set project_id from projects WHERE project_type='video'.
2. projects auto-create for design/game/video types per workspace.
3. /dashboard/meauxgames route — game shell loading GLB from Design Studio export.
4. Design Studio GLB → MovieMode media bin bridge.

DoD: MovieMode session has project_id; Meaux Games loads exported scene GLB; projects row links design+game.

Depends on Workstream C for export path.
```

---

## Sync points (all agents)

| Milestone | Owner | Unblocks |
|-----------|-------|----------|
| Phase 0A schema re-index | A | everyone |
| `/api/cad/jobs/:id/execute` + runner | B | C, E |
| scenes.js 581 columns | C | B job-complete linking |
| Meshy R2 ingest | B | C toolbar |
| media_gemini2 writer | D | MovieMode semantic search |
| projects spine | E | Save Scene project picker |

Daily merge order: A → B → C/D parallel → E.

---

## Verification commands (final gate)

```bash
npm run designstudio:check
npm run designstudio:smoke
node --check src/api/cad.js
node --check src/api/designstudio/scenes.js
# Coordinator runs E2E-COMPLETE-PLAN acceptance matrix § Acceptance test matrix
```
