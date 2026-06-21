-- 653: on_brand_genmedia skill + GenMedia sub-agent profiles (Sprint 2B seed).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/653_on_brand_genmedia_skill.sql
--
-- Policy lane (Supabase + Vectorize) — after supabase migration 20260621120000:
--   npm run run:ingest_genmedia_brand_policy

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_on_brand_genmedia',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'On-Brand GenMedia Agent',
  'Brand-aware image generation loop: enrich prompt → generate → score against policy → iterate until threshold. Spawn job state in agentsam_spawn_job; sub-agents in agentsam_subagent_profile.',
  '# On-Brand GenMedia Agent

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
   - `AGENTSAM_VECTORIZE_DOCUMENTS` — `source_type IN (''knowledge'',''clients'',''workflows'')`
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
   - Read `max_iterations` from this skill''s `metadata_json` (default **3**)
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
| Enrichment | DOCUMENTS | `source_type IN (''knowledge'',''clients'',''workflows'')` |
| Enrichment | MEMORY | workspace-scoped brand prefs |
| Scoring | DOCUMENTS | `source_type = ''policy''` |
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
# Supabase: SELECT COUNT(*) FROM agentsam.agentsam_documents_oai3large_1536 WHERE source_type=''policy'';

# Profiles
# D1: SELECT slug FROM agentsam_subagent_profile WHERE slug LIKE ''genmedia_%'';

# MCP spawn tree after a run
# agentsam_spawn_tree { "run_id": "<parent_ar_id>" }
```
',
  'skills/on-brand-genmedia/SKILL.md',
  'workspace',
  'genmedia',
  '["docs/inneranimalmedia/brand/**","skills/on-brand-genmedia/**","src/tools/image_generation.js"]',
  0,
  '["agent","plan"]',
  '["agent_general","plan","image_generation"]',
  NULL,
  '{}',
  'read_write',
  'image',
  '["genmedia","brand","image","spawn","policy"]',
  '{"max_iterations":3,"master_agent_slug":"on_brand_genmedia","pipeline":["genmedia_prompt_enrichment","genmedia_image_gen","genmedia_scoring","genmedia_checker"]}',
  1200,
  1,
  'db',
  1,
  25,
  datetime('now'),
  datetime('now')
);


INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_genmedia_prompt_enrichment',
  'platform', '', '',
  'genmedia_prompt_enrichment',
  'Brand Prompt Enricher',
  'Enriches raw user prompts with workspace brand context from Vectorize.',
  'Receives raw user prompt. Queries AGENTSAM_VECTORIZE_DOCUMENTS (source_type IN knowledge, clients, workflows) and AGENTSAM_VECTORIZE_MEMORY for workspace brand context. Returns a single enriched generation prompt string with brand color, tone, subject, and layout guidance folded in. Sequential step — must complete before image generation. Write enriched prompt to agentsam_spawn_job.merged_output.enriched_prompt via JSON patch.',
  '["agentsam_autorag","agentsam_d1_query"]',
  1, 1,
  20,
  'custom',
  0,
  'medium',
  0,
  '[]',
  1,
  0,
  NULL,
  '["/genmedia","genmedia","brand image","on-brand"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  sort_order = excluded.sort_order,
  agent_type = excluded.agent_type,
  run_in_background = excluded.run_in_background,
  model_reasoning_effort = excluded.model_reasoning_effort,
  can_spawn_subagents = excluded.can_spawn_subagents,
  spawnable_agent_slugs = excluded.spawnable_agent_slugs,
  max_spawn_depth = excluded.max_spawn_depth,
  is_parallelizable = excluded.is_parallelizable,
  output_schema_json = excluded.output_schema_json,
  spawn_trigger_keywords = excluded.spawn_trigger_keywords,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_genmedia_image_gen',
  'platform', '', '',
  'genmedia_image_gen',
  'Image Generator',
  'Generates brand images from enriched prompts; uploads to R2 and records jobs.',
  'Receives enriched prompt from merged_output.enriched_prompt plus iteration feedback string (merged_output.last_feedback, empty on first pass). Calls image generation provider from agentsam_ai catalog (task_type=image_generation). Writes result to R2 via agentsam_cf_images_upload under workspace brand_r2_prefix. Inserts or updates image_generation_jobs with run_id, prompt_text, status=completed, provider, model. Returns R2 key; patch merged_output.current_r2_key.',
  '["agentsam_cf_images_upload","agentsam_d1_write"]',
  1, 1,
  21,
  'custom',
  1,
  'low',
  0,
  '[]',
  1,
  0,
  NULL,
  '["/genmedia","genmedia","brand image","on-brand"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  sort_order = excluded.sort_order,
  agent_type = excluded.agent_type,
  run_in_background = excluded.run_in_background,
  model_reasoning_effort = excluded.model_reasoning_effort,
  can_spawn_subagents = excluded.can_spawn_subagents,
  spawnable_agent_slugs = excluded.spawnable_agent_slugs,
  max_spawn_depth = excluded.max_spawn_depth,
  is_parallelizable = excluded.is_parallelizable,
  output_schema_json = excluded.output_schema_json,
  spawn_trigger_keywords = excluded.spawn_trigger_keywords,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_genmedia_scoring',
  'platform', '', '',
  'genmedia_scoring',
  'Brand Compliance Scorer',
  'Scores generated images against policy rubric chunks.',
  'Receives R2 key of generated image (merged_output.current_r2_key) and iteration number. Fetches image via agentsam_r2_get. Queries AGENTSAM_VECTORIZE_DOCUMENTS with source_type=policy for scoring rubric chunks. Runs LLM scoring with image + rubric. Outputs JSON: score 0-100, feedback string, passed boolean, r2_key. Writes image_generation_variants row (job_id, artifact_id=R2 key, variant_type=iteration_N, sort_order=N). JSON-patch agentsam_spawn_job.merged_output with score, feedback, iterations array, best_score, best_r2_key.',
  '["agentsam_autorag","agentsam_r2_get","agentsam_d1_write"]',
  1, 1,
  22,
  'custom',
  0,
  'medium',
  0,
  '[]',
  1,
  0,
  '{"score":"number","feedback":"string","passed":"boolean","r2_key":"string"}',
  '["/genmedia","genmedia","brand image","on-brand"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  sort_order = excluded.sort_order,
  agent_type = excluded.agent_type,
  run_in_background = excluded.run_in_background,
  model_reasoning_effort = excluded.model_reasoning_effort,
  can_spawn_subagents = excluded.can_spawn_subagents,
  spawnable_agent_slugs = excluded.spawnable_agent_slugs,
  max_spawn_depth = excluded.max_spawn_depth,
  is_parallelizable = excluded.is_parallelizable,
  output_schema_json = excluded.output_schema_json,
  spawn_trigger_keywords = excluded.spawn_trigger_keywords,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_genmedia_checker',
  'platform', '', '',
  'genmedia_checker',
  'Iteration Checker',
  'Loop controller — completes job or respawns image_gen + scoring.',
  'Reads latest score from agentsam_spawn_job.merged_output and merge_quality_score. Compare score against threshold from agentsam_memory key brand_score_threshold (default 75). Read max_iterations from on_brand_genmedia skill metadata_json (default 3). If passed=true OR subagents_spawned >= max_iterations: set agentsam_spawn_job.status=completed and return final best_r2_key to parent. Otherwise increment iteration, set last_feedback, spawn genmedia_image_gen then genmedia_scoring (can_spawn_subagents).',
  '["agentsam_d1_query","agentsam_d1_write"]',
  1, 1,
  23,
  'custom',
  0,
  'medium',
  1,
  '["genmedia_image_gen","genmedia_scoring"]',
  1,
  0,
  NULL,
  '["/genmedia","genmedia","brand image","on-brand"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  sort_order = excluded.sort_order,
  agent_type = excluded.agent_type,
  run_in_background = excluded.run_in_background,
  model_reasoning_effort = excluded.model_reasoning_effort,
  can_spawn_subagents = excluded.can_spawn_subagents,
  spawnable_agent_slugs = excluded.spawnable_agent_slugs,
  max_spawn_depth = excluded.max_spawn_depth,
  is_parallelizable = excluded.is_parallelizable,
  output_schema_json = excluded.output_schema_json,
  spawn_trigger_keywords = excluded.spawn_trigger_keywords,
  updated_at = datetime('now');

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES
(
  'mem_brand_score_threshold_ws_iam',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'preference',
  'brand_score_threshold',
  '75',
  'GenMedia pass threshold',
  'Minimum brand compliance score (0-100) for on_brand_genmedia loop.',
  'migration_653_on_brand_genmedia',
  '["genmedia","brand","config"]',
  1.0, 8, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:brand_score_threshold',
  unixepoch()
),
(
  'mem_brand_r2_prefix_ws_iam',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'preference',
  'brand_r2_prefix',
  'brand/genmedia/',
  'GenMedia R2 output prefix',
  'Default R2 key prefix for accepted GenMedia images.',
  'migration_653_on_brand_genmedia',
  '["genmedia","brand","r2"]',
  1.0, 7, 0,
  'tenant_sam_primeaux:au_871d920d1233cbd1:brand_r2_prefix',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  memory_type = excluded.memory_type,
  source = excluded.source,
  tags = excluded.tags,
  importance = excluded.importance,
  updated_at = unixepoch();

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_on_brand_genmedia_router_v1',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'skill',
  'on_brand_genmedia_router_v1',
  'START HERE for /genmedia on-brand image loop. Skill: agentsam_skill id=skill_on_brand_genmedia slash_trigger=genmedia. Sub-agents: genmedia_prompt_enrichment → genmedia_image_gen → genmedia_scoring → genmedia_checker (loop). Policy chunks: npm run run:ingest_genmedia_brand_policy (source_type=policy). Threshold: agentsam_memory brand_score_threshold (default 75). Max iterations: skill metadata_json max_iterations=3. Spawn state: agentsam_spawn_job.merged_output JSON. Verify profiles: SELECT slug FROM agentsam_subagent_profile WHERE slug LIKE ''genmedia_%'';',
  'On-Brand GenMedia router',
  'Router for brand-aware image generation spawn pipeline.',
  'migration_653_on_brand_genmedia',
  '["genmedia","brand","spawn","skill","router"]',
  1.0, 8, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:on_brand_genmedia_router_v1',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  memory_type = excluded.memory_type,
  source = excluded.source,
  tags = excluded.tags,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  updated_at = unixepoch();
