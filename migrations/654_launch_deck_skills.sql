-- 654: marketing_agency (/launch) + brand_aligned_presentations (/deck) skills + profiles.
-- Also adds mode param to on_brand_genmedia (brand_aligned | policy_compliance).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/654_launch_deck_skills.sql

UPDATE agentsam_skill
SET metadata_json = '{"max_iterations":3,"master_agent_slug":"on_brand_genmedia","mode":"brand_aligned","pipeline":["genmedia_prompt_enrichment","genmedia_image_gen","genmedia_scoring","genmedia_checker"]}',
    updated_at = datetime('now')
WHERE id = 'skill_on_brand_genmedia';

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_marketing_agency',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Marketing Agency Launch',
  'Complete product/website launch: domain selection, CMS website, marketing copy, logo generation. Sequential sub-agent handoffs via agentsam_spawn_job.',
  '# Marketing Agency Launch

**Skill key:** `marketing_agency`  
**Slash trigger:** `/launch`  
**Scope:** workspace  
**Task types:** `agent`, `plan`

## Pipeline

1. `launch_domain_advisor` — domain candidates vs D1 + Cloudflare zones
2. `launch_website_builder` — CMS pages + R2 HTML
3. `launch_marketing_writer` — email, social, press release (parallelizable)
4. `launch_logo_gen` — 3 logo variants to brand_assets

State: `agentsam_spawn_job.merged_output` handoffs. No new tables.
',
  'skills/marketing-agency/SKILL.md',
  'workspace',
  'launch',
  '["skills/marketing-agency/**","src/tools/**"]',
  0,
  '["agent","plan"]',
  '["agent_general","plan"]',
  NULL,
  '{}',
  'read_write',
  'rocket',
  '["launch","marketing","domain","website","logo"]',
  '{"max_iterations":1,"phases":["domain","website","marketing","logo"],"master_agent_slug":"marketing_agency","pipeline":["launch_domain_advisor","launch_website_builder","launch_marketing_writer","launch_logo_gen"]}',
  900,
  1,
  'db',
  1,
  26,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_brand_aligned_presentations',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Brand-Aligned Presentations',
  'Research → outline → approval → slide generation → PPTX to R2. Interactive deck_editor for post-gen edits.',
  '# Brand-Aligned Presentations

**Skill key:** `brand_aligned_presentations`  
**Slash trigger:** `/deck`  
**Scope:** workspace  
**Task types:** `plan`, `agent`

## Pipeline

1. `deck_researcher` — internal Vectorize + web search; pause for approval
2. `deck_outline_writer` — DeckSpec JSON; pause for approval
3. `deck_slide_renderer` — images + PPTX to R2 + cms_assets
4. `deck_editor` — surgical slide patches on demand

Output: `presentations/{workspace_id}/{job_id}/deck.pptx` in R2.
',
  'skills/brand-aligned-presentations/SKILL.md',
  'workspace',
  'deck',
  '["skills/brand-aligned-presentations/**","designstudio/**"]',
  0,
  '["plan","agent"]',
  '["agent_general","plan"]',
  'gemini-3.5-flash',
  '{}',
  'read_write',
  'presentation',
  '["deck","slides","pptx","presentation"]',
  '{"max_slides":20,"pause_for_approval":true,"model_key":"gemini-3.5-flash","master_agent_slug":"brand_aligned_presentations","pipeline":["deck_researcher","deck_outline_writer","deck_slide_renderer","deck_editor"]}',
  1100,
  1,
  'db',
  1,
  27,
  datetime('now'),
  datetime('now')
);

-- marketing_agency sub-agents
INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_launch_domain_advisor',
  'platform', '', '',
  'launch_domain_advisor',
  'Domain Advisor',
  'Domain candidate research against D1 domains + Cloudflare zones.',
  'Asks user for brand keywords. Queries domains table via agentsam_d1_query (domain_name LIKE ?). Queries cloudflare_zones for zone status. Generates 8–10 domain candidates, filters against existing D1 rows. Returns ranked list with rationale. Writes chosen domain to agentsam_spawn_job.merged_output as { chosen_domain, keywords, brand_brief }.',
  '["agentsam_d1_query","web_search"]',
  1, 1, 30, 'custom', 0, 'medium', 0, '[]', 1, 0, NULL,
  '["/launch","launch","domain"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_launch_website_builder',
  'platform', '', '',
  'launch_website_builder',
  'Website Builder',
  'Generates CMS pages + R2 HTML from brand brief.',
  'Receives brand_brief + chosen_domain from spawn job state. Queries AGENTSAM_VECTORIZE_DOCUMENTS (source_type=workflows) for CMS patterns. Queries brand_config and brand_assets. Generates homepage, about, product/service, contact pages via agentsam_cms_write (status=draft). Writes R2 HTML per page. Returns page IDs to spawn job state.',
  '["agentsam_cms_write","agentsam_autorag","agentsam_d1_query","agentsam_r2_put"]',
  1, 1, 31, 'custom', 1, 'medium', 0, '[]', 1, 0, NULL,
  '["/launch","launch","website","cms"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_launch_marketing_writer',
  'platform', '', '',
  'launch_marketing_writer',
  'Marketing Copywriter',
  'Email, social, press release, product copy to cms_content.',
  'Receives brand brief + page IDs. Queries AGENTSAM_VECTORIZE_DOCUMENTS (source_type=knowledge) for brand voice. Generates email campaign, 5 social posts per platform (LinkedIn, Instagram, X), press release, product description. Writes to cms_content via agentsam_cms_write with content_type tags. Returns artifact IDs.',
  '["agentsam_cms_write","agentsam_autorag","agentsam_d1_query"]',
  1, 1, 32, 'custom', 1, 'low', 0, '[]', 1, 1, NULL,
  '["/launch","launch","marketing","copy"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  is_parallelizable = excluded.is_parallelizable, updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_launch_logo_gen',
  'platform', '', '',
  'launch_logo_gen',
  'Logo Designer',
  'Generates 3 logo variants to brand_assets + R2.',
  'Receives brand brief + color palette from brand_config. Queries AGENTSAM_VECTORIZE_MEMORY for aesthetic preferences. Generates 3 logo variants via agentsam_ai image gen. Uploads via agentsam_cf_images_upload. Writes brand_assets (type=logo). Sets agentsam_spawn_job.status=completed.',
  '["agentsam_cf_images_upload","agentsam_autorag","agentsam_d1_write","agentsam_d1_query"]',
  1, 1, 33, 'custom', 1, 'low', 0, '[]', 1, 0, NULL,
  '["/launch","launch","logo"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  updated_at = datetime('now');

-- brand_aligned_presentations sub-agents
INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_deck_researcher',
  'platform', '', '',
  'deck_researcher',
  'Research Analyst',
  'Internal Vectorize + web search synthesis with approval gate.',
  'Receives topic + slide count. Parallel retrieval: AGENTSAM_VECTORIZE_DOCUMENTS (source_type IN knowledge,roadmap,clients) + web search via agentsam_autorag external lane. Synthesizes research brief JSON into agentsam_spawn_job.merged_output. STOPS until approval (agentsam_approval_queue or user reply).',
  '["agentsam_autorag","web_search","agentsam_d1_query"]',
  1, 1, 40, 'custom', 0, 'high', 0, '[]', 1, 0, NULL,
  '["/deck","deck","presentation","slides"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_deck_outline_writer',
  'platform', '', '',
  'deck_outline_writer',
  'Outline Strategist',
  'Slide-by-slide DeckSpec with approval gate.',
  'Receives approved research brief. Generates DeckSpec JSON array with slide_num, title, layout_hint, bullet_points, speaker_notes, needs_image, source_citations. STOPS for approval before renderer. Writes DeckSpec to agentsam_spawn_job.merged_output.',
  '["agentsam_d1_query","agentsam_autorag"]',
  1, 1, 41, 'custom', 0, 'medium', 0, '[]', 1, 0, NULL,
  '["/deck","deck","outline"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_deck_slide_renderer',
  'platform', '', '',
  'deck_slide_renderer',
  'Slide Renderer',
  'Images + PPTX render to R2 + cms_assets.',
  'Receives approved DeckSpec. For needs_image slides, calls agentsam_cf_images_upload. Renders PPTX via designstudio_design_blueprints or brand_assets pptx_template. Writes presentations/{workspace_id}/{job_id}/deck.pptx to R2. Inserts cms_assets row. Sets agentsam_spawn_job.status=completed.',
  '["agentsam_cf_images_upload","agentsam_r2_put","agentsam_d1_write","agentsam_d1_query"]',
  1, 1, 42, 'custom', 1, 'low', 0, '[]', 1, 0, NULL,
  '["/deck","deck","render","pptx"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_deck_editor',
  'platform', '', '',
  'deck_editor',
  'Slide Editor',
  'Post-generation surgical slide patches.',
  'Activated on "change slide N" requests. Reads DeckSpec from agentsam_spawn_job.merged_output. Patches specified slides only. Re-uploads PPTX to R2 (same key). Updates cms_assets.updated_at.',
  '["agentsam_r2_get","agentsam_r2_put","agentsam_d1_write","agentsam_d1_query"]',
  1, 1, 43, 'custom', 0, 'low', 0, '[]', 1, 0, NULL,
  '["/deck","deck","edit slide"]',
  'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name, description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs, is_active = 1, is_platform_global = 1,
  updated_at = datetime('now');
