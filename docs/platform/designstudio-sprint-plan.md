---
title: Design Studio Sprint Plan — Agent Sam CAD
project_key: inneranimalmedia
d1_context_id: ctx_inneranimalmedia
workspace_id: ws_inneranimalmedia
tenant_id: tenant_sam_primeaux
lane_key: docs_knowledge_search
doc_type: designstudio_sprint_plan
topic: designstudio_sprint
sprint_status: planned
sprint_target: 2026-06-15
dashboard_url: https://inneranimalmedia.com/dashboard/designstudio
ingest_script: scripts/ingest_designstudio_sprint_plan.mjs
memory_router_key: designstudio_sprint_router_v1
updated: 2026-06-14
---

# Design Studio Sprint Plan — Agent Sam CAD

**START HERE when resuming Design Studio work.** Route: `/dashboard/designstudio`. Memory router: `agentsam_memory.key=designstudio_sprint_router_v1`. Semantic search: `docs_knowledge_search` **"Design Studio sprint plan"** or `source_ref platform/inneranimalmedia/designstudio-sprint-plan#*`. Re-ingest: `npm run run:ingest_designstudio_sprint_plan`. Sync memory: `npm run run:sync_designstudio_sprint_memory_vector`.

Deep execution spec (phases 0–6): `docs/inneranimalmedia/product/designstudio/E2E-COMPLETE-PLAN-2026-06.md`. This doc is the **tomorrow-focused** slice: Agent Sam drives CAD creation end-to-end in the viewport.

## Sprint goal (tomorrow)

Make **Agent Sam + `cadcreator` subagent** complete this loop without manual toolbar clicks:

```
User intent in chat (Design Studio route)
  → blueprint row (designstudio_design_blueprints)
  → OpenSCAD script (POST /api/cad/openscad/generate)
  → CAD job (agentsam_cad_jobs, status=pending)
  → execute (POST /api/cad/jobs/:id/execute)
  → Mac runner (cad-job-runner.mjs) → GLB on R2
  → job-complete callback → cms_assets + scene link
  → GLB spawns in VoxelEngine viewport
  → optional scene save (PUT /api/designstudio/scenes)
```

**iPhone-safe:** user never runs OpenSCAD/Blender locally. Runner on operator Mac only.

## What works today vs what’s missing

### Already built

| Layer | Status |
|-------|--------|
| **Dashboard shell** | `DesignStudioPage.tsx` — VoxelEngine, scenes list/save/load, stock + user GLB assets, chess mode, `pendingGlb` navigation state |
| **Agent shell** | `App.tsx` sets `defaultSubagentSlug='cadcreator'` on `/dashboard/designstudio` |
| **Runtime profile** | `design_studio` + `cad_generation` routes with tool allowlists in `runtime-profile.js` |
| **DesignStudio API** | `src/api/designstudio/` — scenes, assets, blueprints CRUD, runs POST/GET, SSE proxy to `AGENT_SESSION` DO |
| **CAD API** | `src/api/cad.js` — Meshy, OpenSCAD generate, job execute, internal job-complete |
| **Runner** | `scripts/designstudio/cad-job-runner.mjs` — polls `agentsam_cad_jobs` pending, OpenSCAD→STL→GLB, R2 upload, callback |
| **Local toolchain** | `npm run designstudio:check`, `designstudio:smoke` |
| **DO event stream** | `AgentChat.js` — `/designstudio/stream-event`, `/designstudio/events` SSE outbox |
| **Collab** | `IAM_COLLAB` DO — `canvas:{workspaceId}` room (theme/canvas realtime; not yet CAD-specific) |

### Critical gaps (tomorrow priorities)

| Gap | Impact |
|-----|--------|
| **UI does not call blueprints/runs/cad APIs** | `DesignStudioPage.tsx` only hits scenes + assets — no blueprint panel, no job poll, no progress UI |
| **Agent tools not wired to live handlers** | `designstudio_blueprint_create`, `designstudio_openscad_generate`, `designstudio_cad_execute` exist in D1 catalog/docs but no complete tool→API loop verified E2E |
| **Runner not running as daemon** | Jobs stay `pending` unless `npm run designstudio:runner` is active on Mac |
| **No UI subscribe to run SSE** | `/api/designstudio/runs/:id/events` exists but Design Studio page doesn’t poll/stream |
| **Agent → viewport bridge** | No collab/event message to `spawnGlb(url)` when job completes — only manual `pendingGlb` from drag-drop |
| **581 column writes incomplete** | `scene_snapshots` / `agentsam_cad_jobs` extended columns may not be populated on save/complete |
| **Meshy tool routes** | `meshyai_*` catalog tools may still point at dead `/api/meshy/*` paths (fix → `/api/cad/meshy/*`) |

## Architecture (execution plane)

```text
Browser /dashboard/designstudio
  ├── DesignStudioPage (VoxelEngine viewport)
  ├── ChatAssistant (cadcreator subagent, route_key design_studio | cad_generation)
  └── optional SSE: GET /api/designstudio/runs/:runId/events?session_id=…

inneranimalmedia Worker (edge — orchestration only)
  ├── /api/designstudio/{scenes,blueprints,runs,assets}
  ├── /api/cad/{openscad/generate,meshy/*,jobs/:id/execute}
  ├── POST /api/internal/cad/job-complete (INTERNAL_API_SECRET)
  └── AGENT_SESSION DO — designstudio event outbox

Mac operator host (NOT Worker isolate)
  ├── npm run designstudio:runner  (poll agentsam_cad_jobs pending)
  ├── OPENSCAD_BIN, BLENDER_BIN
  └── scripts/designstudio/{run-openscad.sh, stl-to-glb.py, upload-asset.sh}

D1 (source of truth)
  ├── designstudio_design_blueprints
  ├── agentsam_cad_jobs
  ├── scene_snapshots
  ├── cms_assets (category 3d_studio_user)
  └── agentsam_workflow_runs (workflow_key LIKE 'designstudio%')

R2
  └── cad/exports/{tenant}/{workspace}/{job_id}.glb
```

**Golden rule:** OpenSCAD/Blender never run inside Cloudflare Worker. Edge enqueues; Mac executes.

## D1 tables (Design Studio lane)

| Table | Role |
|-------|------|
| `designstudio_design_blueprints` | Structured intent: `sketch_json`, `intent_json`, `cad_script`, `cad_engine`, `status`, `latest_run_id` |
| `agentsam_cad_jobs` | Execution queue: `engine` (openscad/blender/meshy), `status`, `r2_key`, `workspace_id`, `tenant_id`, `project_id`, `scene_snapshot_id`, `progress_pct`, `runner_host` |
| `scene_snapshots` | Saved scenes — entity JSON in R2; metadata in D1 (581 columns: `project_id`, `glb_r2_key`, `cad_job_id`, `voxel_count`, `style_preset`) |
| `cms_assets` | GLB registry — `category=3d_studio` (stock) or `3d_studio_user` (user/agent output) |
| `agentsam_workflow_runs` | Run tracking when using blueprint→run POST flow |
| `projects` | Spine linking design / game / video project types (581 alignment) |

Supabase mirrors (post-MVP): `agentsam_memory` (style prefs), `designstudio_asset_metrics`, `agentsam_usage_events`.

## API surface (canonical paths)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/designstudio/blueprints` | Create blueprint from UI or agent |
| PATCH | `/api/designstudio/blueprints/:id` | Update intent, cad_script, status |
| POST | `/api/designstudio/runs` | Start workflow run for blueprint |
| GET | `/api/designstudio/runs/:id` | Poll run status |
| GET | `/api/designstudio/runs/:id/events` | SSE job progress (via AGENT_SESSION DO) |
| POST | `/api/cad/openscad/generate` | LLM/script → `.scad` + cad_job row |
| POST | `/api/cad/jobs/:id/execute` | Mark job `pending` for runner |
| POST | `/api/internal/cad/job-complete` | Runner callback — finalize, cms_assets, scene |
| PUT | `/api/designstudio/scenes` | Named scene save |
| GET | `/api/designstudio/scenes/:id/entities` | Load entity blob from R2 |

Dispatch: `src/core/production-dispatch.js` → `handleDesignStudioApi`, `handleCadApi`.

## Agent Sam integration

### Subagent + routes

| Setting | Value |
|---------|-------|
| Subagent slug | `cadcreator` (set in `App.tsx` when `isDesignStudioRoute`) |
| Runtime routes | `design_studio`, `cad_generation`, `design_intake` |
| Allowed tools (design_studio) | `agentsam_d1_write`, `fs_read_file`, `agentsam_memory_manager`, `agentsam_r2_put` |
| Allowed tools (cad_generation) | above + R2 put |

### Target tool chain (D1 `agentsam_tools`)

| tool_key | Handler target |
|----------|----------------|
| `designstudio_blueprint_create` | POST `/api/designstudio/blueprints` |
| `designstudio_openscad_generate` | POST `/api/cad/openscad/generate` |
| `designstudio_cad_execute` | POST `/api/cad/jobs/:id/execute` |
| `designstudio_scene_save` | PUT `/api/designstudio/scenes` |

Command mapping: `cmd_designstudio_blueprint_create` → `designstudio:blueprint-create`.

### Agent → UI event bridge (to build tomorrow)

When agent completes a CAD job, viewport must receive GLB URL:

1. **Option A (preferred):** Runner/job-complete posts to `AGENT_SESSION` `/designstudio/stream-event` with `{ type: 'cad_glb_ready', url, job_id, blueprint_id }`; Design Studio page opens SSE on active `run_id` and calls `engine.spawnModel(name, url, scale)`.
2. **Option B:** Poll `GET /api/cad/jobs/:id` until `status=done`, read `public_url` from response.
3. **Option C:** `navigate('/dashboard/designstudio', { state: { pendingGlb: { url, name } } })` from chat callback (already works for drag-drop).

Implement **A + B fallback** tomorrow.

## Tomorrow execution checklist

### Morning — environment (30 min)

```bash
cd /Users/samprimeaux/inneranimalmedia
npm run designstudio:check
npm run designstudio:smoke
export OPENSCAD_BIN=/opt/homebrew/bin/openscad
export BLENDER_BIN=/usr/local/bin/blender
# Terminal 1 — keep running all day:
npm run designstudio:runner
```

Verify secrets: `MESHYAI_API_KEY` (optional tomorrow), `INTERNAL_API_SECRET`, `ANTHROPIC_API_KEY`, R2 credentials.

### Block 1 — Agent tool E2E (2–3 h)

- [ ] Verify `designstudio_blueprint_create` tool invokes blueprint POST (catalog-tool-executor)
- [ ] Verify `designstudio_openscad_generate` creates `agentsam_cad_jobs` row with script
- [ ] Verify `designstudio_cad_execute` sets `status=pending`
- [ ] Chat test: *"Create a parametric chess board blueprint and generate OpenSCAD"* → job reaches `done` with runner live
- [ ] Fix any dead `meshyai_*` routes if testing Meshy (`src/tools/builtin/media.js` → `/api/cad/meshy/*`)

### Block 2 — UI wire (2–3 h)

**File:** `dashboard/components/DesignStudioPage.tsx`

- [ ] Add **CAD mode panel**: blueprint list (`GET /api/designstudio/blueprints`), active job status
- [ ] On agent-started run: subscribe SSE `GET /api/designstudio/runs/:id/events?session_id=…`
- [ ] On `cad_glb_ready` or job `done`: `engineRef.current.spawnModel(…)` + refresh user assets
- [ ] Wire **ProjectType.CAD** left panel to blueprints API (replace hardcoded-only flow)
- [ ] Progress states: `queued` → `running` → `done` | `failed` (show error from job row)
- [ ] Save Scene after spawn: include `glb_r2_key`, `cad_job_id`, `project_id` when available

### Block 3 — Runner + callback proof (1 h)

- [ ] Fixture: `scripts/designstudio/fixtures/chess-board.scad` → full pipeline → viewport
- [ ] Confirm `POST /api/internal/cad/job-complete` writes `cms_assets` + updates job
- [ ] Confirm `agentsam_usage_events` row on complete (if wired in `cad-job-complete.js`)

### Block 4 — Polish + ship criteria (1 h)

- [ ] iPhone Safari: chat-only chess board GLB in viewport (< 10 min with runner)
- [ ] Failed job shows actionable error (not silent pending forever)
- [ ] `npm run deploy:full` only if user requests; smoke `/api/designstudio/scenes` + `/api/cad/jobs` health

## Definition of done (tomorrow)

1. User on `/dashboard/designstudio` asks Agent Sam to create a parametric model → GLB appears in viewport without manual toolbar clicks.
2. `designstudio_design_blueprints` and `agentsam_cad_jobs` rows exist in D1 after the flow.
3. `npm run designstudio:runner` is documented as required operator process.
4. At least one scene save links the generated GLB.

## Key files (edit map)

| Area | Files |
|------|-------|
| UI | `dashboard/components/DesignStudioPage.tsx`, `dashboard/App.tsx` (chat subagent) |
| APIs | `src/api/designstudio/index.js`, `scenes.js`, `src/api/cad.js` |
| Job lifecycle | `src/core/cad-job-complete.js`, `src/core/cad-job-scope.js` |
| Runner | `scripts/designstudio/cad-job-runner.mjs`, `scripts/designstudio/*.sh` |
| Agent | `src/core/runtime-profile.js`, `src/core/catalog-tool-executor.js`, `src/tools/builtin/media.js` |
| DO/SSE | `src/do/AgentChat.js` (designstudio outbox) |
| Engine | `dashboard/services/VoxelEngine.ts` |
| Migrations | `247`, `419`, `420`, `421`, `581`, `582`, `583` |

## Test commands

```bash
npm run designstudio:check
npm run designstudio:smoke
npm run designstudio:runner:once   # single job pickup

# Dry-run RAG
npm run run:ingest_designstudio_sprint_plan:dry-run
npm run run:sync_designstudio_sprint_memory_vector:dry-run

# Live RAG (after doc edits)
npm run run:ingest_designstudio_sprint_plan
npm run run:sync_designstudio_sprint_memory_vector
```

## Known risks

| Risk | Mitigation |
|------|------------|
| Runner not running | Banner in UI: "CAD queue idle — operator runner offline" when pending jobs > 2 min |
| Stuck `running` jobs | Runner resets stuck > 30 min (`CAD_RUNNER_STUCK_SEC`) |
| Worker can’t execute CAD | Never call openscad/blender from Worker — only enqueue |
| Schema drift | APIs use PRAGMA probes; verify 581/582 columns on remote D1 before testing |
| `cadcreator` MCP denylist | `450_agentsam_mcp_ssot_unify` denies cadcreator on MCP panel — in-app Agent Sam OK |

## Retrieval cheat sheet

| Need | Action |
|------|--------|
| Fast compass | D1 `agentsam_memory.key = designstudio_sprint_router_v1` (or `memory_read` exact key) |
| Tomorrow plan | `docs_knowledge_search` → "Design Studio sprint plan" |
| Memory semantic | `memory_semantic_search` → pgvector `agentsam_memory_oai3large_1536` |
| Memory manager | `agentsam_memory_manager` → private `agentsam.agentsam_memory` (sync: `npm run run:sync_sprint_memory_routers`) |
| Team task queue | D1 `agentsam_todo` ids `todo_ds_sprint_*` or `GET /api/agent/todo` |
| Team pipeline policy | `agentsam_memory.key = team_pipeline_cross_tool_v1` |
| Full E2E spec | `docs/inneranimalmedia/product/designstudio/E2E-COMPLETE-PLAN-2026-06.md` |
| Pipeline architecture | `docs/inneranimalmedia/product/designstudio/PIPELINE.md` |
| Agent delegation | `docs/inneranimalmedia/product/designstudio/AGENT-DELEGATION-PROMPT.md` |
| Git SSOT (this doc) | `docs/platform/designstudio-sprint-plan.md` |
| Platform compass | `agentsam_memory.key = iam_platform_context_router_v1` |

## Team pipeline (cross-tool)

| Layer | Purpose |
|-------|---------|
| `agentsam_todo` (`todo_ds_sprint_*`) | Block 0–4 task queue — Sam/Cursor/team assignments |
| `docs_knowledge_search` | Full sprint spec (13 chunks) |
| `designstudio_sprint_router_v1` | Fast compass memory |
| `team_pipeline_cross_tool_v1` | How Claude + Cursor + Agent Sam coordinate |

After router edits: `npm run run:sync_sprint_memory_routers` (vector + private pg + D1 `embedding_id`).
