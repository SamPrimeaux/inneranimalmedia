# On-Brand GenMedia Agent

**Skill key:** `on_brand_genmedia`  
**Slash trigger:** `/genmedia`  
**Scope:** workspace  
**Task types:** `agent`, `plan`

## Purpose

Takes a user prompt, enriches it against workspace brand guidelines in Vectorize, generates an image, scores it against policy chunks, and iterates until the score passes threshold or max iterations. Every sub-agent is a real `agentsam_subagent_profile` row. Loop state lives in `agentsam_spawn_job`. Output goes to R2 + `image_generation_jobs`.

## Orchestration sequence

1. **Parent run** — User invokes `/genmedia` or task type matches. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `on_brand_genmedia`
   - `subagent_slug` = `genmedia_prompt_enrichment` (first step)
   - `merged_output` = `{}`
   - `status` = `pending`

2. **genmedia_prompt_enrichment** — Enrich raw prompt via:
   - `AGENTSAM_VECTORIZE_DOCUMENTS` — `source_type IN ('knowledge','clients','workflows')`
   - `AGENTSAM_VECTORIZE_MEMORY` — workspace brand preferences
   - Output: single enriched generation prompt string (brand color, tone, subject, layout)
   - Patch `merged_output.enriched_prompt`

3. **genmedia_image_gen** — Generate image:
   - Input: enriched prompt + `merged_output.last_feedback` (empty on first pass)
   - Provider from `agentsam_ai` catalog, `task_type=image_generation`
   - Upload via `agentsam_cf_images_upload` → R2
   - Upsert `image_generation_jobs` (status=completed, prompt_text, provider, model, run_id)
   - Patch `merged_output.current_r2_key`

4. **genmedia_scoring** — Brand compliance score:
   - Input: R2 key + iteration number
   - Fetch image (`agentsam_r2_get`); retrieve rubric from `AGENTSAM_VECTORIZE_DOCUMENTS` where `source_type=policy`
   - LLM score → `{ score, feedback, passed, r2_key }`
   - Insert `image_generation_variants` (`variant_type=iteration_N`, `artifact_id=R2 key`, `sort_order=N`)
   - JSON-patch `agentsam_spawn_job.merged_output` (best_score, last_feedback, iterations[])

5. **genmedia_checker** — Loop control:
   - Read threshold from `agentsam_memory` key `brand_score_threshold` (default **75**)
   - Read `max_iterations` from this skill's `metadata_json` (default **3**)
   - If `passed` OR `subagents_spawned >= max_iterations` → `status=completed`, return `best_r2_key`
   - Else spawn `genmedia_image_gen` again with feedback, then `genmedia_scoring`

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_run_id` | Parent `agentsam_agent_run.id` |
| `master_agent_slug` | `on_brand_genmedia` |
| `subagent_slug` | Current active sub-agent |
| `subagents_spawned` | Iteration counter |
| `subagents_succeeded` | Passed threshold count |
| `merge_quality_score` | Best score achieved |
| `merged_output` | JSON: `{ current_r2_key, best_r2_key, best_score, last_feedback, enriched_prompt, iterations[] }` |
| `status` | `pending` → `running` → `completed` / `failed` |
| `total_cost_usd` | Accumulated gen + scoring cost |

No new columns required.

## Vector lanes

| Step | Lane | Filter |
|------|------|--------|
| Enrichment | DOCUMENTS | `source_type IN ('knowledge','clients','workflows')` |
| Enrichment | MEMORY | workspace-scoped brand prefs |
| Scoring | DOCUMENTS | `source_type = 'policy'` |
| Accepted output | MEDIA | embed accepted image to `AGENTSAM_VECTORIZE_MEDIA` |

**Not used:** COURSES, CODE, SCHEMA lanes.

## Config (D1 only — no .env)

| Setting | Location | Key / field |
|---------|----------|-------------|
| Score threshold | `agentsam_memory` | `brand_score_threshold` (default 75) |
| Max iterations | `agentsam_skill.metadata_json` | `max_iterations` (default 3) |
| Image provider | `agentsam_ai` catalog | `task_type=image_generation` |
| R2 prefix | `agentsam_memory` or workspace | `brand_r2_prefix` |
| Policy docs | documents lane | `source_type=policy` — run `npm run run:ingest_genmedia_brand_policy` |

## Sub-agent slugs

- `genmedia_prompt_enrichment`
- `genmedia_image_gen`
- `genmedia_scoring`
- `genmedia_checker`

## Prerequisites

1. Policy docs ingested (`source_type=policy`) — see `docs/inneranimalmedia/brand/genmedia-brand-policy.md`
2. Sub-agent profiles seeded (migration 653)
3. Spawn tree linkage (Sprint 2A) for parent↔child runs

## Verification

```bash
# Policy chunks exist
# Supabase: SELECT COUNT(*) FROM agentsam.agentsam_documents_oai3large_1536 WHERE source_type='policy';

# Profiles
# D1: SELECT slug FROM agentsam_subagent_profile WHERE slug LIKE 'genmedia_%';

# MCP spawn tree after a run
# agentsam_spawn_tree { "run_id": "<parent_ar_id>" }
```
