-- 655: blogger_agent, deep_search, genmedia_commerce, data_engineering

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_blogger_agent', 'tenant_sam_primeaux', 'au_871d920d1233cbd1', '', 'ws_inneranimalmedia',
  'Blogger Agent', 'Topic to published technical blog post.',
  '# Blogger Agent', 'skills/blogger_agent/SKILL.md', 'workspace', 'blog',
  '["skills/blogger_agent/**"]', 0, '["agent","plan"]', '["agent_general","plan","debug"]', NULL, '{}',
  'read_write', 'book', '["blog","content"]', '{"max_plan_iterations":3,"max_write_iterations":3,"pause_for_outline_approval":true,"export_format":"markdown","master_agent_slug":"blogger_agent","pipeline":["blog_planner","blog_writer","blog_social_writer","blog_exporter"]}', 1000, 1, 'db', 1, 28, datetime('now'), datetime('now')
);

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_deep_search', 'tenant_sam_primeaux', 'au_871d920d1233cbd1', '', 'ws_inneranimalmedia',
  'Deep Search', 'Two-phase cited research report.',
  '# Deep Search', 'skills/deep_search/SKILL.md', 'workspace', 'research',
  '["skills/deep_search/**"]', 0, '["plan","agent"]', '["agent_general","plan","debug"]', NULL, '{}',
  'read_write', 'search', '["research","report"]', '{"max_search_iterations":5,"pause_for_plan_approval":true,"output_format":"markdown_report","master_agent_slug":"deep_search","pipeline":["research_planner","research_outliner","section_researcher","research_critic","report_composer"]}', 1000, 1, 'db', 1, 29, datetime('now'), datetime('now')
);

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_genmedia_commerce', 'tenant_sam_primeaux', 'au_871d920d1233cbd1', '', 'ws_inneranimalmedia',
  'GenMedia Commerce', 'VTO, spin, catalog commerce media.',
  '# GenMedia Commerce', 'skills/genmedia_commerce/SKILL.md', 'workspace', 'vto',
  '["skills/genmedia_commerce/**"]', 0, '["agent"]', '["agent_general","plan","debug"]', NULL, '{}',
  'read_write', 'shopping-bag', '["vto","commerce"]', '{"max_validation_retries":3,"pipelines":["vto_video","product_spin","static_vto","catalog_search"],"master_agent_slug":"genmedia_commerce","pipeline":["commerce_router","vto_video_gen","product_spin_gen","commerce_validator","catalog_searcher"]}', 1000, 1, 'db', 1, 30, datetime('now'), datetime('now')
);

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_data_engineering', 'tenant_sam_primeaux', 'au_871d920d1233cbd1', '', 'ws_inneranimalmedia',
  'Data Engineering', 'D1 pipeline build, troubleshoot, transform, QA.',
  '# Data Engineering', 'skills/data_engineering/SKILL.md', 'workspace', 'dataeng',
  '["skills/data_engineering/**"]', 0, '["agent","debug"]', '["agent_general","plan","debug"]', NULL, '{}',
  'read_write', 'database', '["data","pipeline"]', '{"targets":["d1","r2","pipeline"],"supports_troubleshoot":true,"master_agent_slug":"data_engineering","pipeline":["dataeng_pipeline_builder","dataeng_troubleshooter","dataeng_transformer","dataeng_quality_checker"]}', 1000, 1, 'db', 1, 31, datetime('now'), datetime('now')
);

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_blog_planner', 'platform', '', '', 'blog_planner', 'Content Strategist', 'Blog outline from codebase context.',
  'Receives topic. Queries AGENTSAM_VECTORIZE_CODE and DOCUMENTS. Generates markdown outline in agentsam_spawn_job.merged_output.outline. STOPS for approval.', '["agentsam_autorag","web_search","agentsam_d1_query"]', 1, 1, 50, 'custom', 0, 'medium',
  0, '[]', 1, 0, NULL, '["/blog","blog"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_blog_writer', 'platform', '', '', 'blog_writer', 'Technical Writer', 'Writes full blog post to content_items.',
  'Receives approved outline. Writes markdown to content_items (blog_post) and content_revisions.', '["agentsam_autorag","web_search","agentsam_d1_write","agentsam_d1_query"]', 1, 1, 51, 'custom', 1, 'high',
  0, '[]', 1, 0, NULL, '["/blog","blog"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_blog_editor', 'platform', '', '', 'blog_editor', 'Technical Editor', 'Surgical draft edits on user feedback.',
  'Reads content_items.body_raw, applies edits, new content_revisions row.', '["agentsam_d1_write","agentsam_d1_query"]', 1, 1, 52, 'custom', 0, 'medium',
  0, '[]', 1, 0, NULL, '["/blog","blog","edit"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_blog_social_writer', 'platform', '', '', 'blog_social_writer', 'Social Media Marketer', 'Platform social copy to cms_content.',
  'LinkedIn, X, dev.to teasers via agentsam_cms_write.', '["agentsam_cms_write","agentsam_d1_query"]', 1, 1, 53, 'custom', 1, 'low',
  0, '[]', 1, 1, NULL, '["/blog","blog"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_blog_exporter', 'platform', '', '', 'blog_exporter', 'Export Handler', 'Publish markdown to R2 + content_items.',
  'Writes content/{workspace}/{slug}.md to R2, sets published status.', '["agentsam_r2_put","agentsam_d1_write","agentsam_d1_query"]', 1, 1, 54, 'custom', 0, 'low',
  0, '[]', 1, 0, NULL, '["/blog","blog"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_research_planner', 'platform', '', '', 'research_planner', 'Research Strategist', 'Phase 1 research plan with approval gate.',
  'Generates plan JSON with [RESEARCH]/[DELIVERABLE] goals. STOPS for approval.', '["agentsam_d1_query","agentsam_d1_write"]', 1, 1, 60, 'custom', 0, 'high',
  0, '[]', 1, 0, NULL, '["/research","research"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_research_outliner', 'platform', '', '', 'research_outliner', 'Report Outliner', 'Structural outline from approved plan.',
  'Converts plan to report outline scaffold in merged_output.outline.', '["agentsam_d1_query","agentsam_d1_write"]', 1, 1, 61, 'custom', 0, 'medium',
  0, '[]', 1, 0, NULL, '["/research","research"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_section_researcher', 'platform', '', '', 'section_researcher', 'Section Researcher', 'Per-section internal + web research.',
  'Writes findings to pipeline_kv and merged_output.sections. Parallelizable.', '["agentsam_autorag","web_search","agentsam_d1_write"]', 1, 1, 62, 'custom', 1, 'medium',
  0, '[]', 1, 1, NULL, '["/research","research"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_research_critic', 'platform', '', '', 'research_critic', 'Research Critic', 'Gap analysis and retry signals.',
  'Evaluates section findings, writes followups and retry flags.', '["agentsam_d1_query","agentsam_d1_write"]', 1, 1, 63, 'custom', 0, 'high',
  0, '[]', 1, 0, NULL, '["/research","research"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_report_composer', 'platform', '', '', 'report_composer', 'Report Composer', 'Final cited markdown report to R2.',
  'Composes report with citations, content_items + R2 reports/{ws}/{job}/report.md.', '["agentsam_d1_write","agentsam_r2_put","agentsam_d1_query"]', 1, 1, 64, 'custom', 1, 'high',
  0, '[]', 1, 0, NULL, '["/research","research"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_commerce_router', 'platform', '', '', 'commerce_router', 'Commerce Media Router', 'Classifies VTO/spin/catalog intent.',
  'Writes merged_output.pipeline and inputs, routes to generator or catalog search.', '["agentsam_d1_query","agentsam_autorag"]', 1, 1, 70, 'custom', 0, 'low',
  0, '[]', 1, 0, NULL, '["/vto","vto"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_vto_video_gen', 'platform', '', '', 'vto_video_gen', 'VTO Video Generator', 'Clothing VTO video generation.',
  'Generates framings and video via agentsam_ai video gen, moviemode_render_jobs.', '["agentsam_cf_images_upload","agentsam_r2_put","agentsam_d1_write"]', 1, 1, 71, 'custom', 1, 'low',
  0, '[]', 1, 1, NULL, '["/vto","vto"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_product_spin_gen', 'platform', '', '', 'product_spin_gen', 'Product Spin Generator', '360 product spin video.',
  'Multi-angle product spin via video gen provider.', '["agentsam_cf_images_upload","agentsam_r2_get","agentsam_r2_put","agentsam_d1_write"]', 1, 1, 72, 'custom', 1, 'medium',
  0, '[]', 1, 0, NULL, '["/vto","vto"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_commerce_validator', 'platform', '', '', 'commerce_validator', 'Output Validator', 'Rotation/glitch validation loop.',
  'Scores output, re-spawns generators on failure up to max retries.', '["agentsam_r2_get","agentsam_d1_write","agentsam_d1_query"]', 1, 1, 73, 'custom', 0, 'medium',
  1, '["vto_video_gen","product_spin_gen"]', 1, 0, NULL, '["/vto","vto"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_catalog_searcher', 'platform', '', '', 'catalog_searcher', 'Catalog Search', 'NL catalog retrieval, no generation.',
  'Vector + D1 catalog search with audience filters.', '["agentsam_autorag","agentsam_d1_query"]', 1, 1, 74, 'custom', 0, 'low',
  0, '[]', 1, 0, NULL, '["/vto","vto","catalog"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_dataeng_pipeline_builder', 'platform', '', '', 'dataeng_pipeline_builder', 'Pipeline Builder', 'Design D1 pipelines and scripts.',
  'Creates pipelines + agentsam_scripts rows, terminal execution on approval.', '["agentsam_autorag","agentsam_d1_write","agentsam_d1_query","agentsam_terminal_local","agentsam_github_write"]', 1, 1, 80, 'custom', 0, 'high',
  0, '[]', 1, 0, NULL, '["/dataeng","dataeng"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_dataeng_troubleshooter', 'platform', '', '', 'dataeng_troubleshooter', 'Pipeline Troubleshooter', 'Diagnose pipeline failures.',
  'Reads pipeline_runs failures and agentsam_error_log, proposes script patches.', '["agentsam_d1_query","agentsam_autorag","agentsam_terminal_local","agentsam_d1_write"]', 1, 1, 81, 'custom', 0, 'high',
  0, '[]', 1, 0, NULL, '["/dataeng","dataeng","troubleshoot"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_dataeng_transformer', 'platform', '', '', 'dataeng_transformer', 'Data Transformer', 'SQL/JS transformation design.',
  'Schema-aware transforms, EXPLAIN via agentsam_d1_query, terminal execute on approval.', '["agentsam_autorag","agentsam_d1_query","agentsam_d1_write","agentsam_terminal_local"]', 1, 1, 82, 'custom', 0, 'high',
  0, '[]', 1, 0, NULL, '["/dataeng","dataeng","transform"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_dataeng_quality_checker', 'platform', '', '', 'dataeng_quality_checker', 'Data Quality Checker', 'Post-run quality report.',
  'Null rates, duplicates, row counts to agentsam_quality_reports.', '["agentsam_d1_query","agentsam_d1_write"]', 1, 1, 83, 'custom', 1, 'low',
  0, '[]', 1, 0, NULL, '["/dataeng","dataeng"]', 'read_write', datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name=excluded.display_name, description=excluded.description,
  instructions_markdown=excluded.instructions_markdown, allowed_tool_globs=excluded.allowed_tool_globs,
  is_active=1, is_platform_global=1, can_spawn_subagents=excluded.can_spawn_subagents,
  spawnable_agent_slugs=excluded.spawnable_agent_slugs, is_parallelizable=excluded.is_parallelizable,
  updated_at=datetime('now');

