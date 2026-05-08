-- 311: Fix stale model keys, seed prompt routes + route requirements, skill task/route JSON,
--      model catalog rows, Thompson priors, routing arms, feature flags.
-- Remote schema verified 2026-05-08 (agentsam_prompt_routes includes prompt_layer_keys NOT NULL; etc.)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/311_agentsam_routing_prompt_skills_flags.sql

-- ══════════════════════════════════════════════════════════════
-- 1. FIX STALE MODEL KEYS IN agentsam_prompt_routes
-- ══════════════════════════════════════════════════════════════

UPDATE agentsam_prompt_routes SET preferred_model = 'wai-llama-4-scout'
  WHERE preferred_model IN ('workers_ai-llama-4-scout','workers_ai-llama-4-scout');
UPDATE agentsam_prompt_routes SET fallback_model = 'wai-llama-4-scout'
  WHERE fallback_model IN ('workers_ai-llama-4-scout','workers_ai-llama-4-scout');
UPDATE agentsam_prompt_routes SET preferred_model = 'ollama-qwen-coder-7b'
  WHERE preferred_model LIKE 'ollama-qwen2.5%';
UPDATE agentsam_prompt_routes SET fallback_model = 'ollama-qwen-coder-7b'
  WHERE fallback_model LIKE 'ollama-qwen2.5%';
UPDATE agentsam_prompt_routes SET preferred_model = 'wai-qwen-coder-32b'
  WHERE preferred_model LIKE 'workers_ai-qwen2.5%';
UPDATE agentsam_prompt_routes SET fallback_model = 'wai-qwen-coder-32b'
  WHERE fallback_model LIKE 'workers_ai-qwen2.5%';

-- ══════════════════════════════════════════════════════════════
-- 2. ADD MISSING ROUTES (intent classifyIntent taskTypes)
--    Includes prompt_layer_keys (required NOT NULL on prod D1).
-- ══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO agentsam_prompt_routes
  (id, route_key, display_name, intent_labels, trigger_keywords, prompt_layer_keys,
   preferred_model, fallback_model, include_rag,
   tool_categories, tool_keys, memory_limit, token_budget,
   is_active, priority)
VALUES
  ('route_chat','chat','General Chat',
   '["chat","general","question","other","mixed"]','[]','["core_identity"]',
   'gemini-2.5-flash-lite','gpt-4.1-nano',0,
   '[]','[]',5,2000,1,10),

  ('route_code','code','Code Generation & Editing',
   '["code","implementation","feature","refactor"]',
   '["write","edit","fix","create","implement","monaco","function","component","worker.js"]',
   '["core_identity"]',
   'claude-sonnet-4-6','gemini-2.5-flash',0,
   '["terminal","mcp_tool","db_query"]',
   '["workspace_read_file","workspace_search","terminal_execute","d1_query"]',
   5,4000,1,70),

  ('route_debug','debug','Debugging & Error Analysis',
   '["debug","error","trace","incident","fix"]',
   '["debug","error","not working","broken","exception","crash","why","failing"]',
   '["core_identity"]',
   'claude-sonnet-4-6','gemini-2.5-flash',0,
   '["terminal","db_query","mcp_tool"]',
   '["workspace_read_file","context_search","d1_query","platform_info"]',
   5,3000,1,70),

  ('route_plan','plan','Architecture & Planning',
   '["plan","architecture","design","diagram","spec","roadmap"]',
   '["plan","design","architect","diagram","excalidraw","wireframe","spec","roadmap"]',
   '["core_identity"]',
   'claude-sonnet-4-6','gemini-2.5-flash',0,
   '["mcp_tool","db_query"]',
   '["knowledge_search","d1_query","excalidraw_open"]',
   5,4000,1,60),

  ('route_summary','summary','Recall & Summarize',
   '["summary","recall","history","memory","past"]',
   '["recall","remember","what did","history","past","last time","yesterday","earlier"]',
   '["core_identity"]',
   'gemini-2.5-flash-lite','gpt-4.1-nano',1,
   '["db_query"]','["d1_query","context_search","knowledge_search"]',
   10,2000,1,50),

  ('route_terminal','terminal_execution','Terminal & Shell',
   '["terminal","shell","command","script","bash","run"]',
   '["run","bash","shell","pm2","npm run","git","ls","cat","chmod","curl","terminal"]',
   '["core_identity"]',
   'claude-sonnet-4-6','gemini-2.5-flash',0,
   '["terminal"]','["terminal_execute","platform_info"]',
   3,2000,1,80),

  ('route_tool_use','tool_use','Tool Invocation',
   '["tool_use","mcp","invoke","tool"]',
   '["use tool","invoke","mcp tool","call tool","run tool"]',
   '["core_identity"]',
   'claude-sonnet-4-6','gemini-2.5-flash',0,
   '["mcp_tool","db_query","terminal"]','[]',
   5,2000,1,60),

  ('route_workflow','workflow_orchestration','Workflow Orchestration',
   '["workflow","automation","pipeline","orchestration"]',
   '["run workflow","start workflow","trigger","pipeline","execute workflow"]',
   '["core_identity"]',
   'gemini-2.5-flash','gpt-4.1-mini',0,
   '["db_query","mcp_tool","terminal"]','[]',
   5,3000,1,80);

-- ══════════════════════════════════════════════════════════════
-- 3. FIX agentsam_skill task_types_json AND route_keys_json
-- ══════════════════════════════════════════════════════════════

UPDATE agentsam_skill SET
  task_types_json = '["code","workflow_orchestration"]',
  route_keys_json = '["code","deploy"]'
WHERE id = 'skill_monaco_code';

UPDATE agentsam_skill SET
  task_types_json = '["deploy","terminal_execution"]',
  route_keys_json = '["deploy","terminal_execution"]'
WHERE id = 'skill_deploy';

UPDATE agentsam_skill SET
  task_types_json = '["deploy","terminal_execution"]',
  route_keys_json = '["deploy","terminal_execution"]'
WHERE id IN ('skill_iam_deploy_rules','skill_deploy_runbook');

UPDATE agentsam_skill SET
  task_types_json = '["plan","code"]',
  route_keys_json = '["plan","code"]'
WHERE id IN ('skill_excalidraw_scene','skill_excalidraw');

UPDATE agentsam_skill SET
  task_types_json = '["debug","code"]',
  route_keys_json = '["debug","code_review"]'
WHERE id IN ('skill_debug_protocol','skill_web_perf');

UPDATE agentsam_skill SET
  task_types_json = '["terminal_execution","deploy"]',
  route_keys_json = '["terminal_execution","deploy"]'
WHERE id IN ('skill_terminal','skill_code_exec');

UPDATE agentsam_skill SET
  task_types_json = '["sql_d1_generation","debug"]',
  route_keys_json = '["db_query","debug"]'
WHERE id = 'skill_d1_explorer';

UPDATE agentsam_skill SET
  task_types_json = '["cms_edit"]',
  route_keys_json = '["cms_edit"]'
WHERE id = 'skill_iam_cms_edit';

UPDATE agentsam_skill SET
  task_types_json = '["code","debug"]',
  route_keys_json = '["code_review","debug"]'
WHERE id IN ('skill_github_copilot','skill_cf_agent_builder');

UPDATE agentsam_skill SET
  task_types_json = '["chat","summary"]',
  route_keys_json = '["general","summary"]'
WHERE id IN ('skill_web_search','skill_web_fetch','skill_autorag_retrieval','skill_autorag_retrieval_v2');

UPDATE agentsam_skill SET
  task_types_json = '["code","debug","deploy"]',
  route_keys_json = '["code","debug","deploy"]'
WHERE id IN ('skill_benchmark','skill_iam_cidi_three_tier','skill_iam_worker_rules');

UPDATE agentsam_skill SET
  task_types_json = '["workflow_orchestration","plan"]',
  route_keys_json = '["workflow_run","plan"]'
WHERE id = 'skill_iam_workflow_l123';

UPDATE agentsam_skill SET
  task_types_json = '["tool_use","code","debug"]',
  route_keys_json = '["tool_use","code"]'
WHERE id IN ('skill_resend_cli','skill_r2_upload','skill_iam_tools_r2_workspace');

UPDATE agentsam_skill SET
  task_types_json = '["debug","terminal_execution"]',
  route_keys_json = '["debug","terminal_execution"]'
WHERE id = 'skill_pty_restart';

-- ══════════════════════════════════════════════════════════════
-- 4. ROUTE REQUIREMENTS (matches prod agentsam_route_requirements columns)
-- ══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO agentsam_route_requirements
  (id, route_key, requires_tools, preferred_tier, max_tier,
   budget_priority, preferred_providers, blocked_providers, is_active)
VALUES
  ('req_chat','chat',0,'flash','standard','cost','[]','[]',1),
  ('req_code','code',1,'power','power','balanced','["anthropic","google","openai"]','[]',1),
  ('req_debug','debug',1,'power','power','quality','["anthropic","google","openai"]','[]',1),
  ('req_plan','plan',0,'power','reasoning','balanced','["anthropic","google","openai"]','[]',1),
  ('req_summary','summary',0,'flash','standard','cost','["google","openai"]','[]',1),
  ('req_terminal','terminal_execution',1,'standard','power','balanced',
   '["anthropic","google","openai"]','["ollama","workers_ai"]',1),
  ('req_tool_use','tool_use',1,'standard','power','balanced','[]','[]',1),
  ('req_workflow','workflow_orchestration',1,'power','reasoning','balanced','[]','[]',1);

-- ══════════════════════════════════════════════════════════════
-- 5. SYNC agentsam_model_catalog (required NOT NULL: context_window, max_output_tokens, etc.)
-- ══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO agentsam_model_catalog
  (id, model_key, display_name, provider, tier,
   context_window, max_output_tokens,
   cost_per_1k_in, cost_per_1k_out, cost_per_tool_call,
   supports_tools, supports_vision, supports_streaming, supports_json_mode, supports_reasoning,
   is_active, is_degraded, budget_exhausted, total_calls)
VALUES
  ('mdl_haiku45_full','claude-haiku-4-5-20251001','Claude Haiku 4.5',
   'anthropic','standard',
   200000, 8192,
   0.0008, 0.004, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0),
  ('mdl_gemini25fl_lite','gemini-2.5-flash-lite','Gemini 2.5 Flash Lite',
   'google','flash',
   1048576, 8192,
   0.0001, 0.0004, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0),
  ('mdl_gpt41nano','gpt-4.1-nano','GPT-4.1 Nano',
   'openai','micro',
   128000, 16384,
   0.0001, 0.0004, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0),
  ('mdl_gpt41mini','gpt-4.1-mini','GPT-4.1 Mini',
   'openai','flash',
   128000, 32768,
   0.0004, 0.0016, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0),
  ('mdl_gpt41','gpt-4.1','GPT-4.1',
   'openai','power',
   1047576, 32768,
   0.002, 0.008, 0,
   1, 0, 1, 1, 0,
   1, 0, 0, 0);

-- ══════════════════════════════════════════════════════════════
-- 6. SEED Thompson arm scores
-- ══════════════════════════════════════════════════════════════

UPDATE agentsam_routing_arms SET
  success_alpha = 13.36, success_beta = 1.0,
  decayed_score = 0.934, total_executions = 13
WHERE model_key = 'claude-haiku-4-5-20251001' AND mode = 'agent' AND task_type = 'chat';

UPDATE agentsam_routing_arms SET
  success_alpha = 6.14, success_beta = 1.0,
  decayed_score = 0.866, total_executions = 5
WHERE model_key = 'gpt-4.1-mini' AND mode = 'auto' AND task_type = 'chat';

UPDATE agentsam_routing_arms SET
  success_alpha = 3.43, success_beta = 1.0,
  decayed_score = 0.783, total_executions = 2
WHERE model_key = 'claude-haiku-4-5-20251001' AND mode = 'auto' AND task_type = 'chat';

UPDATE agentsam_routing_arms SET
  success_alpha = 2.5, success_beta = 1.0,
  decayed_score = 0.71
WHERE model_key = 'claude-sonnet-4-6' AND is_active = 1;

UPDATE agentsam_routing_arms SET
  success_alpha = 2.0, success_beta = 1.0,
  decayed_score = 0.65
WHERE model_key = 'gemini-2.5-flash' AND is_active = 1 AND is_paused = 0;

-- ══════════════════════════════════════════════════════════════
-- 7. ROUTING ARMS for additional task_types
-- ══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO agentsam_routing_arms
  (id, task_type, mode, model_key, provider, workspace_id,
   success_alpha, success_beta, decayed_score,
   is_eligible, is_paused, is_active, budget_exhausted,
   supports_tools, priority, total_executions,
   tools_json, workflow_agent, reasoning_effort,
   last_decay_at, updated_at)
VALUES
  ('ra_code_agent_sonnet','code','agent','claude-sonnet-4-6','anthropic',
   'ws_inneranimalmedia',2.5,1.0,0.71,1,0,1,0,1,70,0,
   '["workspace_read_file","workspace_search","terminal_execute","d1_query","r2_read","r2_write"]',
   'toolbox','medium',unixepoch(),unixepoch()),
  ('ra_code_agent_gemini','code','agent','gemini-2.5-flash','google',
   'ws_inneranimalmedia',2.0,1.0,0.65,1,0,1,0,1,70,0,
   '["workspace_read_file","workspace_search","terminal_execute","d1_query","r2_read","r2_write"]',
   'toolbox','medium',unixepoch(),unixepoch()),
  ('ra_debug_agent_sonnet','debug','agent','claude-sonnet-4-6','anthropic',
   'ws_inneranimalmedia',2.5,1.0,0.71,1,0,1,0,1,70,0,
   '["workspace_read_file","context_search","d1_query","platform_info","terminal_execute"]',
   'toolbox','medium',unixepoch(),unixepoch()),
  ('ra_debug_agent_gemini','debug','agent','gemini-2.5-flash','google',
   'ws_inneranimalmedia',2.0,1.0,0.65,1,0,1,0,1,70,0,
   '["workspace_read_file","context_search","d1_query","platform_info","terminal_execute"]',
   'toolbox','medium',unixepoch(),unixepoch()),
  ('ra_plan_agent_sonnet','plan','agent','claude-sonnet-4-6','anthropic',
   'ws_inneranimalmedia',2.5,1.0,0.71,1,0,1,0,1,60,0,
   '["knowledge_search","d1_query","excalidraw_open","r2_read"]',
   'agent_sam_core','medium',unixepoch(),unixepoch()),
  ('ra_plan_agent_gemini','plan','agent','gemini-2.5-flash','google',
   'ws_inneranimalmedia',2.0,1.0,0.65,1,0,1,0,1,60,0,
   '["knowledge_search","d1_query","excalidraw_open","r2_read"]',
   'agent_sam_core','medium',unixepoch(),unixepoch()),
  ('ra_summary_auto_gemini_lite','summary','auto','gemini-2.5-flash-lite','google',
   'ws_inneranimalmedia',2.0,1.0,0.65,1,0,1,0,1,20,0,
   '["d1_query","context_search","knowledge_search","rag_search"]',
   'recall','low',unixepoch(),unixepoch()),
  ('ra_summary_auto_gpt_nano','summary','auto','gpt-4.1-nano','openai',
   'ws_inneranimalmedia',1.8,1.0,0.63,1,0,1,0,1,20,0,
   '["d1_query","context_search","knowledge_search","rag_search"]',
   'recall','low',unixepoch(),unixepoch()),
  ('ra_terminal_agent_sonnet','terminal_execution','agent','claude-sonnet-4-6','anthropic',
   'ws_inneranimalmedia',2.5,1.0,0.71,1,0,1,0,1,90,0,
   '["terminal_execute","platform_info","list_workers","d1_query"]',
   'toolbox','medium',unixepoch(),unixepoch()),
  ('ra_terminal_agent_gemini','terminal_execution','agent','gemini-2.5-flash','google',
   'ws_inneranimalmedia',2.0,1.0,0.65,1,0,1,0,1,90,0,
   '["terminal_execute","platform_info","list_workers","d1_query"]',
   'toolbox','medium',unixepoch(),unixepoch()),
  ('ra_chat_auto_gemini_lite','chat','auto','gemini-2.5-flash-lite','google',
   'ws_inneranimalmedia',2.0,1.0,0.65,1,0,1,0,1,10,0,
   '["d1_query","tool_knowledge_search","context_*"]',
   'agent_sam_core','low',unixepoch(),unixepoch()),
  ('ra_chat_auto_gpt_nano','chat','auto','gpt-4.1-nano','openai',
   'ws_inneranimalmedia',1.8,1.0,0.63,1,0,1,0,1,10,0,
   '["d1_query","tool_knowledge_search","context_*"]',
   'agent_sam_core','low',unixepoch(),unixepoch());

-- ══════════════════════════════════════════════════════════════
-- 8. FEATURE FLAGS (prod table: flag_key PK, enabled_globally, no id/display_name columns)
-- ══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO agentsam_feature_flag
  (flag_key, description, enabled_globally)
VALUES
  ('thompson_routing_enabled',
   'Route chat requests via agentsam_routing_arms Thompson sampling', 1),
  ('skill_context_injection',
   'Inject matching agentsam_skill content into system prompt', 1),
  ('rag_route_gating',
   'Only run RAG when agentsam_prompt_routes.include_rag = 1', 1),
  ('workflow_auto_routing',
   'Auto-route keyword-matched messages to workflow executor', 1),
  ('mcp_agent_panel',
   'Enable /dashboard/mcp agent chat panel with subagent profiles', 1),
  ('dag_workflow_executor',
   'Use agentsam_workflow_nodes/edges graph traversal vs flat steps_json', 1);
