# Design Studio — full implementation plan

This document ties together **local toolchain scripts**, **D1 schema**, **Worker APIs**, **remote runner**, and **dashboard UI** so the flow works on **iPhone** (no local Blender/OpenSCAD).

**Related:** `README.md`, `E2E-TEST-PIPELINE.md` (**Meshy-free** test matrix + chess-board proof), `design-blueprints-schema.sql`, `companion-tables.md`, `migrations/247_designstudio_design_blueprints.sql`.

---

## 1. Target end-to-end flow

```
User (any device)
  → POST /api/designstudio/workflows/idea-to-glb  (auth)
  → D1: designstudio_run row (queued) + optional designstudio_design_blueprints link
  → Remote runner (polls queue OR receives HTTP from Worker)
  → .scad (from blueprint or LLM) → openscad → .stl → blender → .glb
  → R2 put (inneranimalmedia / tools / autorag prefix per policy)
  → D1: asset row + run status success + blueprint latest_asset_id
  → GET /api/designstudio/workflows/:runId  (poll until done)
  → Dashboard loads GLB URL (signed or public key)
```

**Today:** `src/api/cad.js` generates **scripts** and stores jobs; it does **not** execute binaries on the edge. **Workers cannot run** OpenSCAD/Blender in-process. Execution must be **off-edge**: dedicated VM, queue consumer, or existing **PTY/exec** host (`src/core/terminal.js` pattern) with strict allowlists.

---

## 2. Phased delivery

### Phase A — Repo + local proof (this PR direction)

| Deliverable | Purpose |
|-------------|---------|
| `scripts/designstudio/*` | Verify tools; run OpenSCAD → STL → GLB locally; smoke test; R2 upload helper |
| `migrations/247_designstudio_design_blueprints.sql` | Checked-in DDL for `designstudio_design_blueprints` |
| `PIPELINE.md` | Single source for architecture decisions |
| `local/designstudio/` (gitignored) | Scratch outputs |

### Phase B — Remote runner service (minimal)

| Component | Responsibility |
|-----------|----------------|
| **Queue table** OR **KV list** | `designstudio_runs` (id, status, payload_json, created_at) — *add migration 248+ after review* |
| **Runner process** | Long-running on Mac/Linux with Blender + OpenSCAD; polls `queued`; updates D1; uploads R2 via wrangler or S3 API |
| **Auth** | Runner uses **internal secret** header or **Cloudflare API token** only on runner host — never in browser |

### Phase C — Worker API routes

Implement in `src/` and register in `src/index.js` / router (follow existing `handleCadApi` style).

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/designstudio/workflows/idea-to-glb` | Body: `{ prompt \| blueprint_id, session_id }`. Creates blueprint draft or links existing; inserts **run** `queued`; returns `{ run_id }`. |
| GET | `/api/designstudio/workflows/:runId` | Returns `{ status, progress, error, result_url, r2_key }`. |
| POST | `/api/designstudio/assets/register` | Body: `{ r2_key, blueprint_id?, metadata }` → insert `cms_3d_assets` or successor table. |
| POST | `/api/cad/jobs/:id/execute` | **Idempotent** handoff: mark job runnable; runner picks up by `id` **or** enqueue side-channel. Must not execute CLI on Worker. |

### Phase D — Design Studio UI (`DesignStudioPage.tsx`)

- Poll `GET .../workflows/:runId` when a run is started from UI.
- Progress states: `queued` → `running` → `success` | `failed`.
- On success: pass URL to `VoxelEngine.spawnEntity` or model-viewer.
- Remove copy that implies **local PTY only** for iPhone users; keep “advanced: run script locally” in dev panel if needed.

### Phase E — VoxelEngine follow-ups

| Gap | Work |
|-----|------|
| CAD tools | Implement **circle, sphere, cone** in `rasterizeShape` / `VoxelEngine.ts` |
| Generation config | Thread `GenerationConfig` into engine (density, style affect generation or hide UI) |
| Export | Add **STL/GLB** export path or server-side conversion only; JSON remains debug |

### Phase F — D1 seeds (after schema verified on prod)

- `agentsam_tools`, `agentsam_mcp_tools`, `agentsam_commands`: **export live schema** from D1 or add migrations if tables created outside repo.
- `agentsam_workflow_runs`: already has migration `245_*`; seeds optional.
- Seed SQL files: `scripts/d1-seed-designstudio-tools.sql` (placeholder) — **do not guess columns**; introspect first.

---

## 3. Security and ops

- Runner must **not** accept arbitrary shell from clients; only **structured job payloads** (blueprint id, scad hash, preset commands).
- R2 keys: no secrets in object metadata.
- Rate-limit `POST .../idea-to-glb` per user.

---

## 4. Script catalog (local)

See `scripts/designstudio/README.md` for invocation. NPM shortcuts: `npm run designstudio:check`, `npm run designstudio:smoke`.

---

## 5. Definition of done (iPhone-safe)

1. User on Safari completes flow without installing CAD tools.
2. Final **GLB** is viewable in Design Studio or download link.
3. **D1** shows completed run + asset reference.
4. **Local scripts** still work for developers without runner.
