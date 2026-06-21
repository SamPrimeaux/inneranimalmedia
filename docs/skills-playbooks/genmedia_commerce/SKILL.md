# GenMedia Commerce Agent

**Skill key:** `genmedia_commerce`  
**Slash trigger:** `/vto`  
**Scope:** workspace  
**Task types:** `agent`

## Purpose

Commerce media generation and catalog search: classifies user intent (VTO video, product spin, static VTO, or catalog-only search), routes to the appropriate generator, validates output quality with a retry loop, and tracks jobs in `moviemode_projects` and `moviemode_render_jobs`. Every sub-agent is a real `agentsam_subagent_profile` row. State lives in `agentsam_spawn_job.merged_output`.

## Orchestration sequence

1. **Parent run** — User invokes `/vto` with product image, SKU, or catalog query. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `genmedia_commerce`
   - `subagent_slug` = `commerce_router`
   - `merged_output` = empty commerce shape
   - `status` = `pending`

2. **commerce_router** — Intent classification:
   - Parse request: VTO try-on video, 360 product spin, static VTO, or catalog search
   - Patch `merged_output.pipeline` (`vto_video` | `product_spin` | `static_vto` | `catalog_search`)
   - Patch `merged_output.inputs` (product R2 key, SKU, audience filters, framing prefs)

3. **Generator step** (one of):
   - **catalog_search** → `catalog_searcher` only (no validation loop)
   - **product_spin** → `product_spin_gen`
   - **vto_video** / **static_vto** → `vto_video_gen`
   - Generators write R2 output keys + upsert `moviemode_render_jobs` / `moviemode_projects`
   - Patch `merged_output.output_r2_keys[]`

4. **commerce_validator** — Quality loop (skipped for catalog_search):
   - Fetch generated media via `agentsam_r2_get`
   - Score for rotation consistency, glitch artifacts, framing compliance
   - Patch `validation_score`, `validation_passed`
   - If failed and `retry_count < max_validation_retries`: re-spawn generator with `last_failure` feedback
   - Loop until pass or max retries (default **3**)

5. **Completion** — `status` = `completed` (or `partial` if validation never passed). Best R2 key stored on spawn job.

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_run_id` | Parent `agentsam_agent_run.id` |
| `master_agent_slug` | `genmedia_commerce` |
| `subagent_slug` | Current step (validator may re-spawn generators) |
| `subagents_spawned` | Includes validation retries |
| `merged_output` | JSON handoff (see below) |
| `status` | `pending` → `running` → `completed` / `partial` / `failed` |
| `total_cost_usd` | Video/image gen + validation cost |

### `merged_output` shape

```json
{
  "phase": "validate",
  "pipeline": "vto_video",
  "inputs": {
    "product_r2_key": "catalog/sku-123/front.jpg",
    "sku": "SKU-123",
    "audience": "womens-casual",
    "framing": "full_body"
  },
  "output_r2_keys": [
    "moviemode/ws_inneranimalmedia/job_abc/vto-output.mp4"
  ],
  "validation_score": 87,
  "validation_passed": true,
  "retry_count": 1,
  "last_failure": "rotation jitter detected at frame 12-18"
}
```

## D1 tables

| Table | Role |
|-------|------|
| `agentsam_spawn_job` | Pipeline route, inputs, outputs, validation state |
| `moviemode_projects` | Project container per commerce media request |
| `moviemode_render_jobs` | Individual render job rows (status, provider, R2 keys) |
| Product catalog tables | Queried by `catalog_searcher` (Vector + D1 NL search) |

## Vector lanes

| Step | Lane | Filter |
|------|------|--------|
| Router | DOCUMENTS | commerce workflow recipes |
| Catalog search | DOCUMENTS + product embeddings | audience and category filters |
| Generators | MEDIA | reference product images for conditioning |
| Validator | MEDIA | fetch output for visual QA scoring |

**Not used:** CODE lane unless troubleshooting pipeline scripts.

## Sub-agent slugs

- `commerce_router`
- `vto_video_gen` (parallelizable)
- `product_spin_gen`
- `commerce_validator` (can re-spawn `vto_video_gen`, `product_spin_gen`)
- `catalog_searcher`

## Config (D1 only — no .env)

| Setting | Location | Key / field |
|---------|----------|-------------|
| Max validation retries | `agentsam_skill.metadata_json` | `max_validation_retries` (default **3**) |
| Supported pipelines | `agentsam_skill.metadata_json` | `pipelines`: `["vto_video","product_spin","static_vto","catalog_search"]` |
| Pipeline order | `agentsam_skill.metadata_json` | `pipeline` — 5 slugs above |
| Video provider | `agentsam_ai` catalog | `task_type=video_generation` |
| Pass threshold | sub-agent instructions | validator `passed=true` or score ≥ workspace default |

## Verification

```bash
# Skill metadata
# D1: SELECT metadata_json FROM agentsam_skill WHERE id = 'skill_genmedia_commerce';

# Sub-agent profiles (note validator spawn permissions)
# D1: SELECT slug, can_spawn_subagents, spawnable_agent_slugs FROM agentsam_subagent_profile WHERE slug LIKE '%commerce%' OR slug IN ('vto_video_gen','product_spin_gen','catalog_searcher');

# Render jobs from last run
# D1: SELECT id, status, output_r2_key FROM moviemode_render_jobs ORDER BY created_at DESC LIMIT 5;

# Spawn job validation state
# D1: SELECT merged_output FROM agentsam_spawn_job WHERE master_agent_slug = 'genmedia_commerce' ORDER BY created_at DESC LIMIT 1;
```
