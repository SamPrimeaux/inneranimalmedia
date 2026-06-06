# Design Studio + Meaux Games + MovieMode — Complete E2E Plan

**Status:** execution plan (no stubs, no deferred sprints)  
**Date:** 2026-06-05  
**Baseline:** migration `581_project_ds_moviemode_align.sql` applied + ledgered; local toolchain verified  
**Route:** `/dashboard/designstudio` · **Product:** Design Studio (MeauxCAD Design Lab) · **Games:** Meaux Games (separate surface)

---

## Policy

Every item below has a **Definition of Done (DoD)**. If DoD is not met, the item is **not done**.

- No stub job statuses in production UI (except dev-only `NODE_ENV=development` banner)
- No dead tool routes (`meshyai_*` → 404)
- No schema columns that APIs never write
- No Supabase RAG lanes left at 0 rows when the feature ships
- No “run locally via PTY” copy shown to iPhone users on the primary path

---

## Local toolchain (verified on Sam’s Mac)

```bash
./scripts/designstudio/local-check.sh
```

| Tool | Path | Version |
|------|------|---------|
| **OpenSCAD** | `/opt/homebrew/bin/openscad` | 2026.04.26 |
| **Blender** | `/usr/local/bin/blender` | 5.0.1 |
| **Python3** | on PATH | 3.14.4 |

Recommended env for runner + Worker script responses:

```bash
export OPENSCAD_BIN=/opt/homebrew/bin/openscad
export BLENDER_BIN=/usr/local/bin/blender
```

**Download links (if reinstalling on runner VM):**

- OpenSCAD: https://openscad.org/downloads.html
- Blender: https://www.blender.org/download/

**Local proof commands (must pass before any deploy):**

```bash
npm run designstudio:check
npm run designstudio:smoke
```

Scripts live in `scripts/designstudio/` (`run-openscad.sh`, `stl-to-glb.py`, `pipeline-smoke.sh`, `upload-asset.sh`).

---

## Sequencing answer: schema re-index **first**, same day as CAD runner

| Order | Task | Why |
|-------|------|-----|
| **0** | Schema re-index for migration 581 | Agent Sam + all agents will hallucinate old `scene_snapshots` / `agentsam_cad_jobs` columns without this |
| **1** | CAD job runner + API execute path | Functional product surface (Design Studio E2E) |
| **2** | UI + Agent Sam wire | Users can trigger and see results |
| **3** | `agentsam_media_gemini2_1536` writer | MovieMode RAG — parallel once CAD ingest pattern exists |
| **4** | Plans mirror + usage_events + todos | Cross-cutting observability |

Schema re-index is **~30 min**. It unblocks every code task that follows. MovieMode media writer is **not blocked** by schema re-index but shares the same “write + embed + mirror” pattern as CAD GLB ingest — build CAD R2 ingest first as the template.

---

## Architecture (target)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser: Design Studio + Agent Sam chat + Meaux Games entry             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│ inneranimalmedia Worker                                                 │
│  /api/designstudio/{scenes,blueprints,runs,assets}                      │
│  /api/cad/{meshy,openscad,blender,jobs,execute}                         │
│  /api/moviemode/*  /api/games/*                                         │
│  Agent Sam tool loop → catalog tools (fixed routes)                     │
└───────┬─────────────────────────────┬───────────────────┬───────────────┘
        │                             │                   │
        ▼                             ▼                   ▼
   D1 (truth)                    R2 (blobs)         Supabase (RAG/analytics)
 scene_snapshots                 glb/scad/stl        agentsam_memory
 agentsam_cad_jobs               scenes/*.json       agentsam_media_gemini2_1536
 projects                        cad/exports/        agentsam_plans (mirror)
 moviemode_edit_sessions                               agentsam_usage_events
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CAD Runner (Mac VM / platform PTY host) — NOT Cloudflare Worker edge    │
│  Poll agentsam_cad_jobs WHERE status='pending'                          │
│  openscad → stl → blender → glb → R2 put → D1 update                  │
│  Meshy: poll external_task_id OR webhook → download GLB → R2          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Services worker** (`services.inneranimalmedia.com`): PWA manifest + push only — **not** CAD execution.  
**PTY / VM:** **Yes** — sole execution plane for OpenSCAD/Blender. Edge orchestrates; VM runs binaries.

---

## Cross-system connection map

| Feature | D1 (source of truth) | Supabase (RAG + analytics) | Vectorize |
|---------|----------------------|----------------------------|-----------|
| **Design Studio** | `scene_snapshots`, `agentsam_cad_jobs`, `projects`, `designstudio_design_blueprints` | `agentsam_memory` (style prefs, project context) | — |
| | | `agentsam_usage_events` via `ref_table`/`ref_id` | — |
| | | `agentsam_todo` on failed/stuck jobs | — |
| | | `agentsam_tool_call_events` on MCP/catalog tool calls | — |
| **MovieMode** | `moviemode_edit_sessions`, `moviemode_render_jobs`, `cms_assets` | `agentsam_media_gemini2_1536` | `agentsam-moviemode-gemini2-1536` |
| **Agent Sam core** | `agentsam_plans`, `agentsam_plan_tasks` | `agentsam.agentsam_plans` mirror + embed | plans embed index |
| **Schema awareness** | `d1_schema` / sqlite_master | `agentsam_database_schema_oai3large_1536` | `agentsam-schema-oai3large-1536` |

---

## Phase 0 — Schema re-index + route fixes (Day 0, ~2h)

### 0A. Re-index D1 schema for migration 581

**Command:**

```bash
./scripts/with-cloudflare-env.sh python3 scripts/autorag_ingest.py \
  --lane schema \
  --include-schema \
  --i-understand-schema-is-not-stable
```

**DoD:**

- [ ] `agentsam_database_schema_oai3large_1536` rows exist for `scene_snapshots`, `agentsam_cad_jobs`, `project_storage`, `moviemode_edit_sessions` with **581 columns** in `content`
- [ ] Vectorize `agentsam-schema-oai3large-1536` upserted for changed tables
- [ ] Agent Sam schema RAG returns `project_id`, `glb_r2_key`, `progress_pct` when queried

### 0B. Fix dead Meshy tool routes

| Current (broken) | Target |
|------------------|--------|
| `meshyai_text_to_3d` → `/api/meshy/text-to-3d` | `/api/cad/meshy/generate` |
| `meshyai_image_to_3d` | `/api/cad/meshy/generate` (mode=image) |
| `meshyai_get_task` | `/api/cad/meshy/status/:jobId` |

**Files:** `src/tools/builtin/media.js`, D1 `agentsam_tools.handler_config_json` migration `582_*`

**DoD:**

- [ ] `POST` catalog invoke for each `meshyai_*` tool returns 200 (or 401 without auth), never 404
- [ ] `agentsam_tool_call_events` row on successful invoke

### 0C. Secrets checklist

| Secret | Surface |
|--------|---------|
| `MESHYAI_API_KEY` | Worker — user collects new key |
| `SPLINE_API_KEY` | Worker — user collects (Phase 4) |
| `ANTHROPIC_API_KEY` | OpenSCAD/Blender script gen (already used) |
| `OPENSCAD_BIN` / `BLENDER_BIN` | Runner env vars (not Wrangler secrets) |
| `INTERNAL_API_SECRET` | Runner → Worker callbacks |

---

## Phase 1 — CAD runner + execute API (Day 1–2)

### 1A. Migration `582_cad_runner_queue.sql`

Add queue semantics without new tables:

- Extend `agentsam_cad_jobs`: `runner_host`, `started_at`, `finished_at`, `r2_bucket`, `error_code`
- Ensure `idx_cad_jobs_status` covers poll: `(status, created_at) WHERE status IN ('pending','running')`
- Seed `agentsam_tools` execute handler config for `designstudio_cad_execute`

### 1B. Runner daemon: `scripts/designstudio/cad-job-runner.mjs`

Long-running process on Mac VM (same host as OpenSCAD/Blender):

1. Poll D1 `agentsam_cad_jobs WHERE status='pending' ORDER BY created_at LIMIT 1`
2. By `engine`:
   - **openscad:** read `.scad` from `r2_key` or inline → `run-openscad.sh` → STL
   - **blender:** read script → `blender --background --python`
   - **meshy:** skip (Worker polls API) OR download `result_url` when `status=done` from external poll
   - **meshy_pending:** download GLB from Meshy URL → R2 `cad/exports/{tenant}/{workspace}/{job_id}.glb`
3. STL path: `stl-to-glb.py` → GLB
4. R2 put via `upload-asset.sh` pattern
5. `UPDATE agentsam_cad_jobs SET status='done', r2_key=?, progress_pct=100, scene_snapshot_id=?`
6. `POST /api/internal/cad/job-complete` (Worker) → link scene, write `cms_assets`, fire memory + usage_events

**DoD:**

- [ ] `pipeline-smoke.sh` output GLB uploaded to R2 manually via runner
- [ ] One real `agentsam_cad_jobs` row goes `pending` → `running` → `done` with `r2_key` set
- [ ] Runner survives restart (idempotent job pickup)

### 1C. Worker routes

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/cad/jobs/:id/execute` | Auth user; set `status=pending`, populate `workspace_id`, `tenant_id`, `project_id`, `scene_snapshot_id`; return `{ ok, job_id }` |
| POST | `/api/internal/cad/job-complete` | `INTERNAL_API_SECRET`; finalize job, register asset, optional scene link |
| POST | `/api/designstudio/workflows/idea-to-glb` | Create blueprint + cad_job + run row; enqueue |
| GET | `/api/designstudio/workflows/:runId` | Poll status for UI |

**Files:** `src/api/cad.js`, new `src/api/designstudio/workflows.js`, `src/index.js` dispatch

**DoD:**

- [ ] iPhone can `POST execute` without PTY; runner on Mac completes within 5 min for chess-board fixture
- [ ] `agentsam_usage_events` row: `ref_table='agentsam_cad_jobs'`, `ref_id=<job_id>`

### 1D. Meshy E2E (non-stub)

Extend `src/api/cad.js`:

- On Meshy `SUCCEEDED`: **download GLB** → R2 (not just store Meshy CDN URL)
- Write `cms_assets` row (`category=3d_studio_user`)
- Populate 581 columns on linked `scene_snapshots`

**DoD:**

- [ ] Toolbar Meshy flow in UI produces loadable same-origin GLB in viewport
- [ ] Works with real `MESHYAI_API_KEY` (user-provided)

---

## Phase 2 — Design Studio UI + Precision Blueprints (Day 2–3)

### 2A. Wire toolbar + Save Scene (581 columns)

**File:** `dashboard/components/DesignStudioPage.tsx`

| UI action | API | D1 fields written |
|-----------|-----|-------------------|
| Save Scene | `PUT /api/designstudio/scenes` | `project_id`, `voxel_count`, `style_preset`, `glb_r2_key`, `cad_job_id` |
| Meshy button | `POST /api/cad/meshy/generate` + poll | creates `agentsam_cad_jobs`, links scene |
| OpenSCAD / Agent Sam | blueprint → openscad → execute | full chain |
| Spline | Phase 4 | — |

**File:** `src/api/designstudio/scenes.js` — accept + persist 581 columns on PUT/POST.

**DoD:**

- [ ] Save Scene writes all 581 fields when available from engine state
- [ ] Reload scene restores voxel count + style + linked GLB

### 2B. Precision Blueprints = OpenSCAD spine (not voxel-only)

**Flow:**

```
User intent
  → POST /api/designstudio/blueprints (structured intent_json)
  → Agent Sam refines blueprint in chat
  → POST /api/cad/openscad/generate (from blueprint)
  → .scad stored R2 cad/scripts/{job_id}.scad
  → POST /api/cad/jobs/:id/execute
  → runner → GLB
  → spawn in VoxelEngine + save scene
```

**UI:** Wire `ProjectType.CAD` mode to:

- Left panel: blueprint list (from API, not hardcoded)
- Agent Sam chat panel (reuse `ChatAssistant` SSE pattern with `chatRouteKey: 'designstudio'`)

**DoD:**

- [ ] `designstudio_design_blueprints` row created from UI (not 0 rows after first use)
- [ ] OpenSCAD chess-board fixture visible in viewport after runner
- [ ] Blueprint version immutability via `agentsam_design_blueprint_versions` (migration `583_*`)

### 2C. Agent Sam design tools (D1 catalog)

Register + wire in `agentsam_tools`:

| tool_key | handler |
|----------|---------|
| `designstudio_blueprint_create` | blueprint API |
| `designstudio_openscad_generate` | `/api/cad/openscad/generate` |
| `designstudio_cad_execute` | `/api/cad/jobs/:id/execute` |
| `designstudio_scene_save` | scenes API |
| `meauxcad_openscad_export_stl` | PTY fallback for dev panel only |
| `meauxcad_blender_stl_to_glb` | PTY fallback for dev panel only |

**DoD:**

- [ ] Agent Sam in Design Studio can complete “create a parametric gear” without user clicking buttons
- [ ] `agentsam_tool_call_events` rows for each step

### 2D. VoxelEngine gaps (same sprint — not deferred)

| Gap | File | DoD |
|-----|------|-----|
| circle, sphere, cone CAD tools | `VoxelEngine.ts` | rasterize + undo stack |
| Generation config wired | `DesignStudioPage.tsx` → engine | density/style affect output |
| GLB export | server-side only via runner | no JSON-only “Blender Bridge” on primary path |

---

## Phase 3 — Supabase activation (Day 3–4)

### 3A. `agentsam_memory` writers

On Design Studio events, write structured memory:

| Event | `memory_type` | content |
|-------|---------------|---------|
| Style preset change | `preference` | `designstudio.style_preset=cyberpunk` |
| Project save | `project` | scene summary + project_id |
| Failed CAD job | `state` | error + resolution hint |

**File:** new `src/core/designstudio-memory.js`; call from cad complete + scene save.

**DoD:**

- [ ] `agentsam_memory` row queryable by Agent Sam in Design Studio context
- [ ] Mirror to `agentsam_memory_oai3large_1536` via existing memory ingest

### 3B. `agentsam_plans` mirror sync

**Exists:** `scripts/mirror-d1-plans-to-supabase-public.mjs`, `supabase/migrations/20260605140000_agentsam_plans_mirror.sql`

**Wire:** `src/core/agentsam-plan-supabase-sync.js` (or create) — Hyperdrive upsert on:

- `agentsam_plans` INSERT/UPDATE
- `agentsam_plan_tasks` INSERT/UPDATE

**DoD:**

- [ ] D1 plan creation → Supabase `agentsam.agentsam_plans` row within 30s
- [ ] Embedding populated; semantic plan search returns result

### 3C. `agentsam_usage_events` attribution

**File:** `src/core/designstudio-usage.js`

Write on:

- Meshy API call (estimate cost from Meshy pricing table or flat fee)
- OpenSCAD/Blender runner job (duration_ms, engine)
- MovieMode render job (existing path extended)

Fields: `ref_table`, `ref_id`, `provider`, `model`, `cost_estimate`

**DoD:**

- [ ] Analytics overview shows Design Studio cost line item
- [ ] Per-job cost visible in Design Studio run panel

### 3D. `agentsam_todo` on failure

When `agentsam_cad_jobs.status='failed'` or stuck `running` > 30 min:

- Insert `agentsam_todo` with `linked_table='agentsam_cad_jobs'`, `linked_id=<job_id>`
- Agent Sam can resolve via existing todo executor

**DoD:**

- [ ] Forced failure creates todo; marking done clears job error state

---

## Phase 4 — Spline + MovieMode media RAG (Day 4–5)

### 4A. Spline integration (honest scope)

Spline API is **export/embed-first**, not text-to-3D like Meshy.

**Pattern:**

1. User authenticates Spline; store token in `user_secrets`
2. `POST /api/cad/spline/import` — fetch scene export URL (GLB/USDZ)
3. `agentsam_cad_jobs` with `engine='spline'`
4. Download → R2 → `cms_assets`

**DoD:**

- [ ] Spline toolbar button imports one scene to viewport
- [ ] Not a stub — real API key, real GLB in R2

### 4B. `agentsam_media_gemini2_1536` writer

**Exists:** `src/core/moviemode-media-vectorize.js` (`indexMediaAssetForSearch`, `upsertMediaPgvectorRow`)

**Wire triggers:**

| Trigger | File |
|---------|------|
| `cms_assets` video upload | storage/moviemode upload handler |
| MovieMode clip register | `src/api/moviemode-api.js` (extend existing calls) |
| CAD GLB with `media_kind=model` | cad job complete (optional cross-lane) |

**DoD:**

- [ ] `agentsam_media_gemini2_1536` row count > 0 after one video upload
- [ ] Vectorize `agentsam-moviemode-gemini2-1536` has matching id
- [ ] Agent Sam query “find clips with speaker” returns hit in MovieMode context

### 4C. MovieMode `project_id` wire

On `moviemode_edit_sessions` create:

```sql
SELECT id FROM projects WHERE project_type = 'video' AND workspace_id = ? ORDER BY updated_at DESC LIMIT 1
```

Fallback: create project row if none exists.

**DoD:**

- [ ] New MovieMode session has `project_id` FK populated
- [ ] Same `project_id` links to `agentsam_media_gemini2_1536.project_id`

---

## Phase 5 — Meaux Games product surface (Day 5–7)

### 5A. `projects` spine

| `project_type` | Surface |
|----------------|---------|
| `design` | Design Studio scenes |
| `game` | Meaux Games |
| `video` | MovieMode |

**DoD:**

- [ ] `projects` table has typed rows per workspace
- [ ] Design Studio save prompts project picker (or auto-create `design` project)

### 5B. Meaux Games MVP (in-repo)

**Not** a separate marketing-only link — minimum viable:

1. `/dashboard/meauxgames` route in `App.tsx` (or alias from designstudio Games mode)
2. Reuse `/api/games/*` + extend for generic `game_project_id`
3. Export Design Studio scene GLB → game asset manifest
4. Phaser or Three gameplay shell loading exported GLB

**DoD:**

- [ ] User exports scene from Design Studio → loads in Meaux Games playable shell
- [ ] `projects.project_type='game'` row links scene + assets

### 5C. MovieMode ↔ Design Studio bridge

- Design Studio `glb_r2_key` → MovieMode asset bin
- Remotion render job references `project_id`

**DoD:**

- [ ] One GLB from Design Studio appears in MovieMode media bin

---

## Phase 6 — Observability + deploy hooks (Day 7)

| Item | Trigger | DoD |
|------|---------|-----|
| `agentsam_deploy_events` | `npm run deploy:full` post-hook | row per deploy |
| `agentsam_worker_events` | Worker tail → cron mirror | non-zero after 24h |
| Schema re-index | post-migration hook in deploy script | auto-run for 582+ |
| `agentsam_search_log` | RAG queries in Design Studio/MoveMode | audit trail |

---

## File manifest (primary touch list)

### New files

| Path | Purpose |
|------|---------|
| `scripts/designstudio/cad-job-runner.mjs` | Poll + execute CAD jobs |
| `src/api/designstudio/workflows.js` | idea-to-glb + run poll |
| `src/core/designstudio-memory.js` | agentsam_memory writes |
| `src/core/designstudio-usage.js` | usage_events attribution |
| `src/core/agentsam-plan-supabase-sync.js` | plans mirror on write |
| `migrations/582_cad_runner_queue.sql` | job columns + tool seeds |
| `migrations/583_design_blueprint_versions.sql` | immutable blueprint history |

### Modify

| Path | Changes |
|------|---------|
| `src/api/cad.js` | execute, Meshy R2 ingest, 581 column writes |
| `src/api/designstudio/scenes.js` | 581 columns on save |
| `dashboard/components/DesignStudioPage.tsx` | toolbar, chat, poll, save |
| `src/tools/builtin/media.js` | fix meshy routes |
| `src/api/moviemode-api.js` | ensure media indexer on all upload paths |
| `package.json` | `designstudio:runner` script |

---

## Acceptance test matrix (full E2E — iPhone-safe)

| # | Test | Device | Pass criteria |
|---|------|--------|---------------|
| 1 | Schema RAG | any | Agent cites `cad_job_id` column correctly |
| 2 | OpenSCAD chess board | iPhone | blueprint → GLB in viewport < 10 min |
| 3 | Meshy text-to-3D | iPhone | toolbar → GLB in viewport |
| 4 | Save Scene | iPhone | reload preserves style + voxel_count + project_id |
| 5 | Agent Sam gear | desktop | chat-only completes parametric model |
| 6 | Failed job todo | any | todo created; Agent resolves |
| 7 | MovieMode upload | desktop | media_gemini2 row + semantic search hit |
| 8 | Meaux Games export | desktop | scene GLB playable in game shell |
| 9 | Plans mirror | any | new plan searchable in Supabase |
| 10 | Cost attribution | any | usage_events row per Meshy job |

---

## What is explicitly NOT in scope for stubs

- `status: 'stub'` Meshy responses in production when key is set
- External-only Spline link without import API
- JSON download as the only “export” path
- `mcp_agent_sessions` for design workflows (use `projects` + `scene_snapshots` + `agentsam_cad_jobs`)
- Running OpenSCAD/Blender inside Cloudflare Worker isolate

---

## Related docs

- `PIPELINE.md` — phased architecture (this doc supersedes for execution tracking)
- `E2E-TEST-PIPELINE.md` — Meshy-free test matrix
- `companion-tables.md` — table design reference
- `docs/platform/supabase-agentsam-schema-2026-06.md` — RAG lane registry
- `supabase/migrations/20260605120000_agentsam_media_gemini2_1536.sql`
- `supabase/migrations/20260605140000_agentsam_plans_mirror.sql`
