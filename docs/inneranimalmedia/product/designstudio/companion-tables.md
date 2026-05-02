# Design Studio — companion tables (`agentsam_*`)

These complement `designstudio_design_blueprints` and existing Agent Sam telemetry. **Proposed** names and roles — align with actual D1 migrations and naming conventions before create.

## Already in ecosystem (reference)

| Table / area | Use |
|----------------|-----|
| `agentsam_tool_call_log` | Per-tool invocations, errors, payloads |
| `agentsam_tool_chain` | Chained tool runs |
| `cms_assets` / `cms_3d_assets` (if present) | Published 3D assets, URLs, metadata |
| `game_*`, `cms_assets` | Games / chess catalog |

Enhance with: **latency_ms**, **input_tokens**, **output_tokens**, **cost_usd** if columns missing (migration-specific).

---

## Suggested new tables

### 1. `agentsam_design_blueprint_versions`

**Why:** Immutable history when `intent_json` or `cad_script` changes (audit + rollback).

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | `dbv_` + randomblob |
| `blueprint_id` | TEXT FK | → `designstudio_design_blueprints.id` |
| `version` | INTEGER | Monotonic per blueprint |
| `intent_json` | TEXT | Snapshot |
| `cad_script` | TEXT | Snapshot |
| `sketch_json` | TEXT | Optional |
| `created_at` | TEXT | |
| `created_by_user_id` | TEXT | Optional |

---

### 2. `agentsam_design_runs`

**Why:** Each generation / export attempt (OpenSCAD CLI, Blender, load-into-scene).

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | `dr_` + randomblob |
| `blueprint_id` | TEXT FK | |
| `run_type` | TEXT | `openscad` \| `blender` \| `import_glb` \| `voxel_export` |
| `status` | TEXT | `queued` \| `running` \| `success` \| `failed` |
| `command_json` | TEXT | CLI args, paths (no secrets) |
| `stdout_tail` | TEXT | Truncated log |
| `error_message` | TEXT | |
| `output_asset_id` | TEXT | → `cms_3d_assets` or R2 key ref |
| `duration_ms` | INTEGER | |
| `created_at` | TEXT | |

Update `designstudio_design_blueprints.latest_run_id` to point here.

---

### 3. `agentsam_designstudio_sessions`

**Why:** Correlate a browser session / route visit with blueprints and tool calls.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `user_id` | TEXT | |
| `workspace_id` | TEXT | |
| `started_at` | TEXT | |
| `ended_at` | TEXT | Nullable |
| `client_build` | TEXT | Optional: bundle version |
| `metadata_json` | TEXT | Mode switches, feature flags |

---

### 4. `agentsam_cad_export_log`

**Why:** Fine-grained export audit if `agentsam_design_runs` stays high-level.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `run_id` | TEXT FK | → `agentsam_design_runs` |
| `format` | TEXT | `stl` \| `glb` \| `json` |
| `bytes` | INTEGER | |
| `storage_key` | TEXT | R2 key if applicable |
| `checksum_sha256` | TEXT | Optional |

---

### 5. `agentsam_design_intent_templates` (optional)

**Why:** Reusable patterns (“chess board”, “bracket”) for `intent_json` scaffolding.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `slug` | TEXT UNIQUE | |
| `intent_template_json` | TEXT | |
| `cad_engine` | TEXT | |
| `version` | INTEGER | |

---

## Relationship diagram (logical)

```
User prompt / UI
       ↓
designstudio_design_blueprints (intent_json, status)
       ↓
agentsam_design_blueprint_versions (snapshots)
       ↓
agentsam_design_runs (CLI / pipeline)
       ↓
cms_3d_assets or R2 key
       ↓
agentsam_tool_call_log / agentsam_tool_chain (Agent Sam steps)
```

---

## Naming note

Prefix **`agentsam_`** keeps Agent Sam platform tables grep-friendly. The primary blueprint table uses **`designstudio_`** as specified for product clarity; FKs tie the two namespaces together.
