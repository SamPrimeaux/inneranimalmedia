# Design Studio — Meshy-free E2E test pipeline

**Goal:** Prove the product on **iPhone** and desktop **without Meshy, Spline, or any paid 3D API** until polish. All geometry comes from **OpenSCAD → STL → Blender GLB** plus R2.

**Related:** `PIPELINE.md` (architecture), `scripts/designstudio/` (local scripts), `fixtures/` (prompts + sample `.scad`).

---

## 1. Canonical pipeline (no Meshy / Spline)

```
User prompt (or structured intent)
  → designstudio_design_blueprints (intent_json + cad_script + status)
  → OpenSCAD script (.scad text)
  → OpenSCAD CLI → STL
  → Blender CLI → GLB
  → R2 put (e.g. inneranimalmedia or AUTORAG meshy-free prefix — see naming below)
  → D1: agentsam_workflow_runs (run record) + cms_3d_assets (catalog row with glb_url)
  → Design Studio loads GLB (spawnEntity / model-viewer URL)
```

**Remote runner** executes OpenSCAD + Blender on a host with binaries; the **browser never** runs CAD tools. Same flow as `scripts/designstudio/pipeline-smoke.sh`, but driven by API + queue.

---

## 2. Visual concepts before CAD (optional layers)

Use these for **UX iteration** without blocking the core pipeline:

| Layer | Use |
|-------|-----|
| **Excalidraw JSON** | Rough layout / storyboard (`sketch_json` on blueprint) |
| **Simple generated SVG** | 2D silhouette / branding |
| **Three.js voxel preview** | Fast feedback in `VoxelEngine` (already in app) |
| **OpenSCAD preview / STL** | Truth path for printability |
| **Blender viewport render** | Thumbnail for `cms_3d_assets.thumbnail_url` (optional batch) |

None of these replace the **STL → GLB** proof for “real geometry in hand.”

---

## 3. R2 key naming (meshy-free)

Avoid confusion with Meshy uploads under `meshy/`. Prefer an explicit prefix, for example:

- `designstudio/glb/<blueprint_id>/<run_id>.glb`
- or `autorag/meshy/` **only** if you must reuse existing bucket layout — better: **new prefix** `designstudio/` on the chosen bucket.

Document the chosen prefix in the runner env.

---

## 4. D1 writes

### `designstudio_design_blueprints`

- `intent_json`, `cad_script`, `cad_engine = 'openscad'`, `status` transitions: `draft` → `structured` → `generated` → `exported` (or `failed`).

### `agentsam_workflow_runs`

- One row per end-to-end run: `workflow_key` e.g. `designstudio_openscad_to_glb`, `status`, `step_results_json`, `duration_ms`, link to `blueprint_id` / `run_id` when schema allows.

### `cms_3d_assets`

- Insert with **`glb_url`** (public or signed URL to R2), **`prompt`**, **`tenant_id`**, **`meshy_task_id` NULL** (or a sentinel like `openscad_local` if column is NOT NULL — confirm schema before prod insert).
- Existing Meshy path in `worker.js` shows column shape; Design Studio runner should use the **same table** with non-Meshy source.

---

## 5. Best test cases (prompts)

| # | Name | Intent (short) |
|---|------|------------------|
| 1 | **Cube tray** | Shallow tray with floor + 4 walls, inside dimensions parametric |
| 2 | **Chess board** | 8×8 alternating tiles, flat board, optional border — **first ship proof** |
| 3 | **Phone stand** | Wedge or slot stand, stable base, parametric phone thickness |
| 4 | **Wheelchair ramp blockout** | Single wedge prism, rise/run ratio label in intent |
| 5 | **Logo pedestal** | Cylinder or low prism platform for a plaque |
| 6 | **Modular shelf bracket** | L-bracket with screw holes, unit width parametric |

Fixture prompts and a starter **chess board** `.scad** live under `scripts/designstudio/fixtures/`.

---

## 6. First proof milestone (iPhone)

**Command / UX (target):** e.g. natural language or button: **“create chess board”** from Design Studio context.

**Expected sequence:**

1. **Blueprint** row created (`title` / `original_prompt`).
2. **`.scad`** generated (LLM or template from `intent_json`).
3. **STL** produced (OpenSCAD).
4. **GLB** produced (Blender).
5. **R2** object exists at agreed key.
6. **cms_3d_assets** + **agentsam_workflow_runs** updated.
7. **`/dashboard/designstudio`** loads the GLB on **iPhone** (same URL as desktop).

**Success:** User sees the chess board model **without** Meshy/Spline and **without** local CAD on the phone.

---

## 7. What to skip in tests

- Meshy text-to-3d / image-to-3d
- Spline embeds or exports as **required** path
- Paid API keys for the **proof** branch (Anthropic for `.scad` text may still be used — separate cost from Meshy)

---

## 8. Local rehearsal (no Worker)

From repo root:

```bash
npm run designstudio:smoke
```

With fixtures:

```bash
./scripts/designstudio/run-openscad.sh scripts/designstudio/fixtures/chess-board.scad /tmp/chess.stl
python3 scripts/designstudio/stl-to-glb.py /tmp/chess.stl /tmp/chess.glb
./scripts/designstudio/upload-asset.sh /tmp/chess.glb designstudio/glb/smoke/chess.glb model/gltf-binary
```

Adjust R2 key and `wrangler -c` to match your deploy policy.
