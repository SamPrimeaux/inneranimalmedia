-- =============================================================================
-- migrations/323_agentsam_ollama_embed_pipeline_workflows.sql
--
-- Adds 4 Ollama embed + inference workflows (extracted + adapted from ops spec).
-- Seed rows use status='completed' and valid trigger_type per D1 CHECK constraints.
--
-- Registry-only / inactive-by-default:
--   These rows define graph structure in D1 for future dispatchNode handlers.
--   All four workflows are inserted with is_active = 0. They do not run in production
--   until explicitly activated (separate migration or controlled UPDATE), after local
--   smoke validation. Production Cloudflare Workers cannot reach a laptop Ollama unless
--   traffic is routed via local dev, a terminal bridge, tunnel, or an explicit adapter.
--
-- Supabase:
--   D1 remains canonical for workflow registry definitions. Runtime workflow runs mirror
--   to Supabase per product rules; this migration does not sync static registry rows.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/323_agentsam_ollama_embed_pipeline_workflows.sql
-- Adds 4 Ollama embed + inference workflows to agentsam_workflows, matching
-- the real column layout, edge condition contract, and step_results_json shape.
--
-- All workflows start with is_active = 0 (feature-flagged off).
-- Flip to is_active = 1 after deploying dispatchNode branches for:
--
--   NEW handler_keys (agentsam.ollama.v2 namespace):
--     agentsam.ollama.v2.embed_text          (agent)    → POST /api/embed mxbai
--     agentsam.ollama.v2.classify_intent     (branch)   → cosine sim vs prototypes
--     agentsam.ollama.v2.vector_search       (db_query) → D1 similarity search
--     agentsam.ollama.v2.assemble_context    (db_query) → join top-k chunks
--     agentsam.ollama.v2.fetch_chat_turns    (db_query) → last-24h chat messages
--     agentsam.ollama.v2.batch_embed_turns   (agent)    → batch POST /api/embed
--     agentsam.ollama.v2.upsert_embeddings   (db_query) → write agentsam_embeddings
--     agentsam.ollama.v2.dual_write_memory   (db_query) → write Supabase agent_memory
--
--   REUSED handler_keys (already wired in dispatchNode):
--     agentsam.ollama.v2.prepare_local_context
--     agentsam.ollama.v2.check_ollama_health
--     agentsam.ollama.v2.call_local_model
--     agentsam.ollama.v2.validate_model_output
--     agentsam.ollama.v2.write_d1_usage
--     agentsam.ollama.v2.write_execution_spine
--     agentsam.ollama.v2.sync_supabase_workflow_run
--     agentsam.ollama.v2.complete_run
--     agentsam.dual_write
--     agentsam.cron_log
--

-- =============================================================================
-- WORKFLOW 1: ollama_embed_intent_route
-- mxbai embed → cosine classify intent → branch: qwen (code) or log-only (general)
-- Observability: embed tokens + LLM tokens + intent + confidence all in D1 + Supabase
-- =============================================================================

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global
) VALUES (
  'wf_ollama_embed_intent_route',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'ollama_embed_intent_route',
  'Ollama — Embed → Intent Route',
  'Embeds user message with mxbai-embed-large (1024-dim), classifies intent via cosine similarity against D1 prototype vectors, then routes code questions to qwen2.5-coder:7b or skips LLM entirely for general queries. Writes full embed + inference telemetry to agentsam_usage_events (D1) and workflow_runs (Supabase). Total inference cost: $0.00.',
  'agentic',
  'manual',
  'agent',
  'inference',
  'low',
  0,
  3,
  20000,
  '{"requires_valid_json":true,"requires_token_capture":true,"requires_cost_zero":true,"requires_ollama_health":true,"requires_embedding_dims":1024}',
  '{"source":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","ollama_models":["mxbai-embed-large","qwen2.5-coder:7b"],"new_handler_keys":["agentsam.ollama.v2.embed_text","agentsam.ollama.v2.classify_intent"],"dispatchNode_required":true}',
  0,
  0
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
(
  'wnode_eir_01',
  'wf_ollama_embed_intent_route',
  'prepare_local_context',
  'db_query',
  'Prepare Local Context',
  'Loads mxbai prototype vectors from agentsam_embeddings (collection=intent_prototypes) and Ollama config (base_url, embed_model, chat_model) into run context for downstream nodes.',
  'agentsam.ollama.v2.prepare_local_context',
  '{"type":"object","properties":{"workspace_id":{"type":"string"},"proto_collection":{"type":"string","default":"intent_prototypes"}},"required":["workspace_id"]}',
  '{"type":"object","properties":{"ollama_base_url":{"type":"string"},"embed_model":{"type":"string"},"chat_model":{"type":"string"},"prototypes":{"type":"array"},"prototype_count":{"type":"integer"}}}',
  15000,
  '{"max_retries":1,"backoff":"linear","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 1
),
(
  'wnode_eir_02',
  'wf_ollama_embed_intent_route',
  'check_ollama_health',
  'terminal',
  'Check Ollama Health',
  'GETs /api/tags from the Ollama base URL and verifies mxbai-embed-large and qwen2.5-coder:7b are both listed. Fails fast if Ollama is unreachable or a required model is missing.',
  'agentsam.ollama.v2.check_ollama_health',
  '{"type":"object","properties":{"ollama_base_url":{"type":"string"},"required_models":{"type":"array","items":{"type":"string"},"default":["mxbai-embed-large","qwen2.5-coder:7b"]}},"required":["ollama_base_url"]}',
  '{"type":"object","properties":{"healthy":{"type":"boolean"},"available_models":{"type":"array","items":{"type":"string"}},"missing_models":{"type":"array","items":{"type":"string"}}}}',
  8000,
  '{"max_retries":0}',
  '{"required":true,"requires_healthy":true}',
  'low', 0, 1, 2
),
(
  'wnode_eir_03',
  'wf_ollama_embed_intent_route',
  'embed_text',
  'agent',
  'Embed User Message',
  'POSTs input.message to Ollama /api/embed using mxbai-embed-large. Captures 1024-dim vector, prompt_eval_count, total_duration_ns (converted to duration_ms), and cost_usd=0. Embedding stored in run context for classify_intent.',
  'agentsam.ollama.v2.embed_text',
  '{"type":"object","properties":{"text":{"type":"string"},"model":{"type":"string","default":"mxbai-embed-large"},"ollama_base_url":{"type":"string"}},"required":["text","ollama_base_url"]}',
  '{"type":"object","properties":{"embedding":{"type":"array","items":{"type":"number"}},"dims":{"type":"integer","enum":[1024]},"model":{"type":"string"},"prompt_eval_count":{"type":"integer"},"duration_ms":{"type":"integer"},"cost_usd":{"type":"number","const":0}}}',
  12000,
  '{"max_retries":1,"backoff":"linear","delay_ms":1000}',
  '{"required":true,"requires_embedding_dims":1024,"requires_cost_zero":true}',
  'low', 0, 1, 3
),
(
  'wnode_eir_04',
  'wf_ollama_embed_intent_route',
  'classify_intent',
  'branch',
  'Classify Intent (cosine sim)',
  'Computes cosine similarity between the query embedding and each prototype vector loaded in prepare_local_context. ok=true (routes to qwen) if top similarity >= threshold (default 0.72) AND top prototype label is code-class. ok=false routes to write_d1_usage, skipping LLM.',
  'agentsam.ollama.v2.classify_intent',
  '{"type":"object","properties":{"embedding":{"type":"array","items":{"type":"number"}},"prototypes":{"type":"array"},"threshold":{"type":"number","default":0.72}},"required":["embedding","prototypes"]}',
  '{"type":"object","properties":{"intent":{"type":"string","enum":["code","general"]},"confidence":{"type":"number","minimum":0,"maximum":1},"top_match_key":{"type":"string"},"top_score":{"type":"number"}}}',
  5000,
  '{"max_retries":0}',
  '{"required":true,"threshold":0.72}',
  'low', 0, 1, 4
),
(
  'wnode_eir_05',
  'wf_ollama_embed_intent_route',
  'call_local_model',
  'agent',
  'qwen Code Response',
  'Calls qwen2.5-coder:7b via Ollama /api/chat with the user message formatted as a code assistant prompt. Captures response text, eval_count (output tokens), prompt_eval_count (input tokens), duration_ms, and cost_usd=0.',
  'agentsam.ollama.v2.call_local_model',
  '{"type":"object","properties":{"prompt":{"type":"string"},"model":{"type":"string","default":"qwen2.5-coder:7b"},"ollama_base_url":{"type":"string"},"max_tokens":{"type":"integer","default":512},"temperature":{"type":"number","default":0.2}},"required":["prompt","ollama_base_url"]}',
  '{"type":"object","properties":{"response":{"type":"string"},"model":{"type":"string"},"prompt_eval_count":{"type":"integer"},"eval_count":{"type":"integer"},"duration_ms":{"type":"integer"},"cost_usd":{"type":"number","const":0}}}',
  30000,
  '{"max_retries":1,"backoff":"linear","delay_ms":2000}',
  '{"required":true,"requires_token_capture":true,"requires_cost_zero":true}',
  'low', 0, 1, 5
),
(
  'wnode_eir_06',
  'wf_ollama_embed_intent_route',
  'validate_model_output',
  'eval',
  'Validate qwen Output',
  'Asserts response is non-empty string, eval_count > 0, and output is not an Ollama error object (no .error field). ok=true advances to write_d1_usage. ok=false is recorded but does not halt — write_d1_usage still runs to capture token counts.',
  'agentsam.ollama.v2.validate_model_output',
  '{"type":"object","properties":{"response":{"type":"string"},"eval_count":{"type":"integer"}},"required":["response","eval_count"]}',
  '{"type":"object","properties":{"valid":{"type":"boolean"},"reasons":{"type":"array","items":{"type":"string"}}}}',
  5000,
  '{"max_retries":0}',
  '{"required":true}',
  'low', 0, 1, 6
),
(
  'wnode_eir_07',
  'wf_ollama_embed_intent_route',
  'write_d1_usage',
  'db_query',
  'Write D1 Usage',
  'Inserts agentsam_usage_events rows: one for the embed call (model=ollama-mxbai-embed-large, tokens=prompt_eval_count, cost=0) and one for the LLM call if it ran (model=ollama-qwen-coder-7b, tokens_in=prompt_eval_count, tokens_out=eval_count, cost=0). Also writes intent + confidence to run metadata.',
  'agentsam.ollama.v2.write_d1_usage',
  '{"type":"object","properties":{"run_id":{"type":"string"},"embed_tokens":{"type":"integer"},"llm_tokens_in":{"type":"integer","default":0},"llm_tokens_out":{"type":"integer","default":0},"intent":{"type":"string"},"confidence":{"type":"number"}},"required":["run_id","embed_tokens","intent"]}',
  '{"type":"object","properties":{"rows_written":{"type":"integer"},"embed_event_id":{"type":"string"},"llm_event_id":{"type":"string","nullable":true}}}',
  10000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 7
),
(
  'wnode_eir_08',
  'wf_ollama_embed_intent_route',
  'write_execution_spine',
  'db_query',
  'Write Execution Spine',
  'Updates agentsam_workflow_runs with final step_results_json, aggregated input_tokens, output_tokens, cost_usd=0, and duration_ms. Sets current_node_key=complete_run.',
  'agentsam.ollama.v2.write_execution_spine',
  '{"type":"object","properties":{"run_id":{"type":"string"},"step_results":{"type":"array"}},"required":["run_id","step_results"]}',
  '{"type":"object","properties":{"updated":{"type":"boolean"}}}',
  10000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 8
),
(
  'wnode_eir_09',
  'wf_ollama_embed_intent_route',
  'sync_supabase_workflow_run',
  'webhook',
  'Sync Supabase Run',
  'Upserts the completed run payload to the Supabase workflow_runs mirror via Hyperdrive. Sets supabase_sync_status=synced on success, supabase_sync_status=failed on timeout. Non-blocking — a sync failure does not fail the run.',
  'agentsam.ollama.v2.sync_supabase_workflow_run',
  '{"type":"object","properties":{"run_id":{"type":"string"},"workflow_key":{"type":"string"}},"required":["run_id","workflow_key"]}',
  '{"type":"object","properties":{"supabase_run_id":{"type":"string"},"synced":{"type":"boolean"}}}',
  15000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":1000}',
  '{"required":false}',
  'low', 0, 1, 9
),
(
  'wnode_eir_10',
  'wf_ollama_embed_intent_route',
  'complete_run',
  'db_query',
  'Complete Run',
  'Sets status=success on agentsam_workflow_runs, writes completed_at=unixepoch(), and clears current_node_key.',
  'agentsam.ollama.v2.complete_run',
  '{"type":"object","properties":{"run_id":{"type":"string"}},"required":["run_id"]}',
  '{"type":"object","properties":{"status":{"type":"string","const":"success"},"completed_at":{"type":"integer"}}}',
  5000,
  '{"max_retries":1,"backoff":"linear","delay_ms":200}',
  '{"required":true}',
  'low', 0, 1, 10
);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key,
  condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_eir_01', 'wf_ollama_embed_intent_route', 'prepare_local_context', 'check_ollama_health', 'always',  NULL,                                  0, 0, 'context loaded'),
('wedge_eir_02', 'wf_ollama_embed_intent_route', 'check_ollama_health',   'embed_text',           'status',  '{"from_status":"success"}',            0, 0, 'ollama healthy'),
('wedge_eir_02f','wf_ollama_embed_intent_route', 'check_ollama_health',   'complete_run',          'status',  '{"from_status":"failed"}',             1, 1, 'ollama unreachable → abort'),
('wedge_eir_03', 'wf_ollama_embed_intent_route', 'embed_text',            'classify_intent',       'status',  '{"from_status":"success"}',            0, 0, 'embedded'),
('wedge_eir_03f','wf_ollama_embed_intent_route', 'embed_text',            'write_d1_usage',        'status',  '{"from_status":"failed"}',             1, 1, 'embed failed → skip classify'),
('wedge_eir_04a','wf_ollama_embed_intent_route', 'classify_intent',       'call_local_model',      'status',  '{"from_status":"success"}',            0, 0, 'intent=code → qwen'),
('wedge_eir_04b','wf_ollama_embed_intent_route', 'classify_intent',       'write_d1_usage',        'status',  '{"from_status":"failed"}',             1, 1, 'intent=general → skip llm'),
('wedge_eir_05', 'wf_ollama_embed_intent_route', 'call_local_model',      'validate_model_output', 'status',  '{"from_status":"success"}',            0, 0, 'inference complete'),
('wedge_eir_05f','wf_ollama_embed_intent_route', 'call_local_model',      'write_d1_usage',        'status',  '{"from_status":"failed"}',             1, 1, 'llm failed → skip eval'),
('wedge_eir_06', 'wf_ollama_embed_intent_route', 'validate_model_output', 'write_d1_usage',        'always',  NULL,                                  0, 0, 'validated'),
('wedge_eir_07', 'wf_ollama_embed_intent_route', 'write_d1_usage',        'write_execution_spine', 'always',  NULL,                                  0, 0, 'usage written'),
('wedge_eir_08', 'wf_ollama_embed_intent_route', 'write_execution_spine', 'sync_supabase_workflow_run', 'always', NULL,                              0, 0, 'spine written'),
('wedge_eir_09', 'wf_ollama_embed_intent_route', 'sync_supabase_workflow_run', 'complete_run',     'always',  NULL,                                  0, 0, 'synced');

-- Seed run: code intent path (full success, 10/10 nodes)
INSERT OR IGNORE INTO agentsam_workflow_runs (
  id, workflow_id, workflow_key, display_name,
  tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
  session_id, run_group_id, trigger_type, status,
  input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message,
  model_used, input_tokens, output_tokens, cost_usd, duration_ms,
  retry_count, environment, git_branch,
  supabase_sync_status, supabase_sync_attempts,
  metadata_json, graph_mode, current_node_key,
  max_runtime_ms, max_cost_usd, max_total_tokens,
  started_at, completed_at
) VALUES (
  'wrun_eir_smoke_001',
  'wf_ollama_embed_intent_route',
  'ollama_embed_intent_route',
  'Ollama — Embed → Intent Route',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'usr_sam_iam', 'usr_sam_iam', 'info@inneranimals.com',
  'sess_ollama_smoke_001', 'wfg_ollama_embed_pipeline_smoke',
  'manual', 'completed',
  '{"message":"Write a Cloudflare Worker fetch handler that reads from KV","workspace_id":"ws_inneranimalmedia","proto_collection":"intent_prototypes"}',
  '{"intent":"code","confidence":0.89,"embed_dims":1024,"embed_tokens":19,"llm_tokens_in":128,"llm_tokens_out":214,"cost_usd":0,"response_preview":"export default { async fetch(req, env) {"}',
  '[{"node_key":"prepare_local_context","node_type":"db_query","handler_key":"agentsam.ollama.v2.prepare_local_context","ok":true,"output":{"ollama_base_url":"https://ollama.inneranimalmedia.com","embed_model":"mxbai-embed-large","chat_model":"qwen2.5-coder:7b","prototype_count":8},"error":null},{"node_key":"check_ollama_health","node_type":"terminal","handler_key":"agentsam.ollama.v2.check_ollama_health","ok":true,"output":{"healthy":true,"available_models":["mxbai-embed-large","qwen2.5-coder:7b"],"missing_models":[]},"error":null},{"node_key":"embed_text","node_type":"agent","handler_key":"agentsam.ollama.v2.embed_text","ok":true,"output":{"dims":1024,"model":"mxbai-embed-large","prompt_eval_count":19,"duration_ms":1216,"cost_usd":0},"error":null},{"node_key":"classify_intent","node_type":"branch","handler_key":"agentsam.ollama.v2.classify_intent","ok":true,"output":{"intent":"code","confidence":0.89,"top_match_key":"code_worker_pattern","top_score":0.89},"error":null},{"node_key":"call_local_model","node_type":"agent","handler_key":"agentsam.ollama.v2.call_local_model","ok":true,"output":{"model":"qwen2.5-coder:7b","prompt_eval_count":128,"eval_count":214,"duration_ms":1614,"cost_usd":0,"response_preview":"export default { async fetch(req, env) {"},"error":null},{"node_key":"validate_model_output","node_type":"eval","handler_key":"agentsam.ollama.v2.validate_model_output","ok":true,"output":{"valid":true,"reasons":[]},"error":null},{"node_key":"write_d1_usage","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_d1_usage","ok":true,"output":{"rows_written":2,"embed_event_id":"uev_eir_embed_001","llm_event_id":"uev_eir_llm_001"},"error":null},{"node_key":"write_execution_spine","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_execution_spine","ok":true,"output":{"updated":true},"error":null},{"node_key":"sync_supabase_workflow_run","node_type":"webhook","handler_key":"agentsam.ollama.v2.sync_supabase_workflow_run","ok":true,"output":{"supabase_run_id":"sbrun_eir_smoke_001","synced":true},"error":null},{"node_key":"complete_run","node_type":"db_query","handler_key":"agentsam.ollama.v2.complete_run","ok":true,"output":{"status":"success","completed_at":1746921234},"error":null}]',
  10, 10, NULL,
  'mxbai-embed-large,qwen2.5-coder:7b',
  147, 214, 0.0, 2840,
  0, 'production', 'main',
  'synced', 1,
  '{"migration_ref":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","intent_path":"code","embed_dims":1024,"ollama_base_url":"https://ollama.inneranimalmedia.com","series_budget_usd":2.00,"cloud_reserve_usd":0.05}',
  1, 'complete_run',
  20000, 0.00, 20000,
  unixepoch() - 2840, unixepoch()
);

-- Seed run: general intent path (8/10 nodes — LLM + eval skipped)
INSERT OR IGNORE INTO agentsam_workflow_runs (
  id, workflow_id, workflow_key, display_name,
  tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
  session_id, run_group_id, trigger_type, status,
  input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message,
  model_used, input_tokens, output_tokens, cost_usd, duration_ms,
  retry_count, environment, git_branch,
  supabase_sync_status, supabase_sync_attempts,
  metadata_json, graph_mode, current_node_key,
  max_runtime_ms, max_cost_usd, max_total_tokens,
  started_at, completed_at
) VALUES (
  'wrun_eir_smoke_002',
  'wf_ollama_embed_intent_route',
  'ollama_embed_intent_route',
  'Ollama — Embed → Intent Route',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'usr_sam_iam', 'usr_sam_iam', 'info@inneranimals.com',
  'sess_ollama_smoke_002', 'wfg_ollama_embed_pipeline_smoke',
  'manual', 'completed',
  '{"message":"What is the status of Meauxbility nonprofit filings?","workspace_id":"ws_inneranimalmedia","proto_collection":"intent_prototypes"}',
  '{"intent":"general","confidence":0.81,"embed_dims":1024,"embed_tokens":22,"llm_tokens_in":0,"llm_tokens_out":0,"cost_usd":0}',
  '[{"node_key":"prepare_local_context","node_type":"db_query","handler_key":"agentsam.ollama.v2.prepare_local_context","ok":true,"output":{"ollama_base_url":"https://ollama.inneranimalmedia.com","embed_model":"mxbai-embed-large","chat_model":"qwen2.5-coder:7b","prototype_count":8},"error":null},{"node_key":"check_ollama_health","node_type":"terminal","handler_key":"agentsam.ollama.v2.check_ollama_health","ok":true,"output":{"healthy":true,"available_models":["mxbai-embed-large","qwen2.5-coder:7b"],"missing_models":[]},"error":null},{"node_key":"embed_text","node_type":"agent","handler_key":"agentsam.ollama.v2.embed_text","ok":true,"output":{"dims":1024,"model":"mxbai-embed-large","prompt_eval_count":22,"duration_ms":1398,"cost_usd":0},"error":null},{"node_key":"classify_intent","node_type":"branch","handler_key":"agentsam.ollama.v2.classify_intent","ok":false,"output":{"intent":"general","confidence":0.81,"top_match_key":"general_query","top_score":0.81},"error":null},{"node_key":"write_d1_usage","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_d1_usage","ok":true,"output":{"rows_written":1,"embed_event_id":"uev_eir_embed_002","llm_event_id":null},"error":null},{"node_key":"write_execution_spine","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_execution_spine","ok":true,"output":{"updated":true},"error":null},{"node_key":"sync_supabase_workflow_run","node_type":"webhook","handler_key":"agentsam.ollama.v2.sync_supabase_workflow_run","ok":true,"output":{"supabase_run_id":"sbrun_eir_smoke_002","synced":true},"error":null},{"node_key":"complete_run","node_type":"db_query","handler_key":"agentsam.ollama.v2.complete_run","ok":true,"output":{"status":"success","completed_at":1746921564},"error":null}]',
  8, 8, NULL,
  'mxbai-embed-large',
  22, 0, 0.0, 1420,
  0, 'production', 'main',
  'synced', 1,
  '{"migration_ref":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","intent_path":"general","embed_dims":1024,"ollama_base_url":"https://ollama.inneranimalmedia.com"}',
  1, 'complete_run',
  20000, 0.00, 20000,
  unixepoch() - 1420, unixepoch()
);

-- =============================================================================
-- WORKFLOW 2: ollama_code_review
-- qwen2.5-coder:7b reviews a code diff → outputs structured JSON verdict
-- Observability: verdict, issues[], suggestions[], confidence, tokens in D1 + Supabase
-- =============================================================================

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global
) VALUES (
  'wf_ollama_code_review',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'ollama_code_review',
  'Ollama — Local Code Review',
  'Sends a code diff or snippet to qwen2.5-coder:7b and receives a structured JSON review: issues[], suggestions[], verdict (pass|fail), and confidence. Designed as a zero-cost pre-deploy gate for Agent Sam code changes. eval node validates JSON contract; verdict captured in agentsam_usage_events and Supabase.',
  'agentic',
  'api',
  'agent',
  'code_review',
  'low',
  0,
  2,
  45000,
  '{"requires_valid_json":true,"requires_token_capture":true,"requires_cost_zero":true,"requires_ollama_health":true,"requires_verdict_field":true}',
  '{"source":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","trigger_event":"deploy:pre_check","ollama_models":["qwen2.5-coder:7b"],"new_handler_keys":[],"dispatchNode_required":false}',
  0,
  0
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
(
  'wnode_lcr_01',
  'wf_ollama_code_review',
  'prepare_local_context',
  'db_query',
  'Prepare Local Context',
  'Loads Ollama config (base_url, chat_model=qwen2.5-coder:7b) and the D1 resolveCanonicalUserId call to normalize au_* vs usr_* identities before the review prompt is built.',
  'agentsam.ollama.v2.prepare_local_context',
  '{"type":"object","properties":{"workspace_id":{"type":"string"}},"required":["workspace_id"]}',
  '{"type":"object","properties":{"ollama_base_url":{"type":"string"},"chat_model":{"type":"string"}}}',
  10000,
  '{"max_retries":1,"backoff":"linear","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 1
),
(
  'wnode_lcr_02',
  'wf_ollama_code_review',
  'check_ollama_health',
  'terminal',
  'Check Ollama Health',
  'Verifies qwen2.5-coder:7b is available at the Ollama base URL before sending the review prompt.',
  'agentsam.ollama.v2.check_ollama_health',
  '{"type":"object","properties":{"ollama_base_url":{"type":"string"},"required_models":{"type":"array","default":["qwen2.5-coder:7b"]}},"required":["ollama_base_url"]}',
  '{"type":"object","properties":{"healthy":{"type":"boolean"},"available_models":{"type":"array"},"missing_models":{"type":"array"}}}',
  8000,
  '{"max_retries":0}',
  '{"required":true,"requires_healthy":true}',
  'low', 0, 1, 2
),
(
  'wnode_lcr_03',
  'wf_ollama_code_review',
  'call_local_model',
  'agent',
  'qwen Code Review',
  'Calls qwen2.5-coder:7b with a system prompt instructing it to review the supplied code for bugs, security issues, and Cloudflare/D1-specific anti-patterns. Temperature=0.1 for determinism. Instructs qwen to respond ONLY with a JSON object: {issues:[], suggestions:[], verdict:"pass"|"fail", confidence:0.0}.',
  'agentsam.ollama.v2.call_local_model',
  '{"type":"object","properties":{"prompt":{"type":"string"},"model":{"type":"string","default":"qwen2.5-coder:7b"},"ollama_base_url":{"type":"string"},"max_tokens":{"type":"integer","default":768},"temperature":{"type":"number","default":0.1},"expect_json":{"type":"boolean","default":true}},"required":["prompt","ollama_base_url"]}',
  '{"type":"object","properties":{"response":{"type":"string"},"model":{"type":"string"},"prompt_eval_count":{"type":"integer"},"eval_count":{"type":"integer"},"duration_ms":{"type":"integer"},"cost_usd":{"type":"number","const":0}}}',
  40000,
  '{"max_retries":1,"backoff":"linear","delay_ms":2000}',
  '{"required":true,"requires_token_capture":true,"requires_cost_zero":true}',
  'low', 0, 1, 3
),
(
  'wnode_lcr_04',
  'wf_ollama_code_review',
  'validate_model_output',
  'eval',
  'Validate Review JSON',
  'Parses the qwen response as JSON and asserts: verdict is "pass" or "fail", issues is an array, suggestions is an array, confidence is a number 0-1. ok=false if JSON is invalid or required fields are missing.',
  'agentsam.ollama.v2.validate_model_output',
  '{"type":"object","properties":{"response":{"type":"string"},"expect_json":{"type":"boolean","default":true},"required_fields":{"type":"array","default":["verdict","issues","suggestions","confidence"]}},"required":["response"]}',
  '{"type":"object","properties":{"valid":{"type":"boolean"},"parsed":{"type":"object","properties":{"verdict":{"type":"string","enum":["pass","fail"]},"issues":{"type":"array"},"suggestions":{"type":"array"},"confidence":{"type":"number"}}},"reasons":{"type":"array","items":{"type":"string"}}}}',
  5000,
  '{"max_retries":0}',
  '{"required":true,"requires_valid_json":true,"required_fields":["verdict","issues","suggestions","confidence"]}',
  'low', 0, 1, 4
),
(
  'wnode_lcr_05',
  'wf_ollama_code_review',
  'write_d1_usage',
  'db_query',
  'Write D1 Usage',
  'Inserts one agentsam_usage_events row for the qwen review call (model=ollama-qwen-coder-7b, tokens_in=prompt_eval_count, tokens_out=eval_count, cost=0). Writes verdict + confidence to run metadata_json.',
  'agentsam.ollama.v2.write_d1_usage',
  '{"type":"object","properties":{"run_id":{"type":"string"},"llm_tokens_in":{"type":"integer"},"llm_tokens_out":{"type":"integer"},"verdict":{"type":"string"},"confidence":{"type":"number"}},"required":["run_id","llm_tokens_in","llm_tokens_out","verdict"]}',
  '{"type":"object","properties":{"rows_written":{"type":"integer"},"llm_event_id":{"type":"string"}}}',
  10000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 5
),
(
  'wnode_lcr_06',
  'wf_ollama_code_review',
  'write_execution_spine',
  'db_query',
  'Write Execution Spine',
  'Updates agentsam_workflow_runs with final step_results_json, token aggregates, cost_usd=0, and duration_ms.',
  'agentsam.ollama.v2.write_execution_spine',
  '{"type":"object","properties":{"run_id":{"type":"string"},"step_results":{"type":"array"}},"required":["run_id","step_results"]}',
  '{"type":"object","properties":{"updated":{"type":"boolean"}}}',
  10000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 6
),
(
  'wnode_lcr_07',
  'wf_ollama_code_review',
  'sync_supabase_workflow_run',
  'webhook',
  'Sync Supabase Run',
  'Mirrors the completed review run to Supabase workflow_runs. Verdict and issues[] are included in output_json so they are queryable from the Supabase side.',
  'agentsam.ollama.v2.sync_supabase_workflow_run',
  '{"type":"object","properties":{"run_id":{"type":"string"},"workflow_key":{"type":"string"}},"required":["run_id","workflow_key"]}',
  '{"type":"object","properties":{"supabase_run_id":{"type":"string"},"synced":{"type":"boolean"}}}',
  15000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":1000}',
  '{"required":false}',
  'low', 0, 1, 7
),
(
  'wnode_lcr_08',
  'wf_ollama_code_review',
  'complete_run',
  'db_query',
  'Complete Run',
  'Sets status=success on agentsam_workflow_runs and writes completed_at. Note: status=success means the workflow ran cleanly — verdict=fail in output_json is a content outcome, not a run failure.',
  'agentsam.ollama.v2.complete_run',
  '{"type":"object","properties":{"run_id":{"type":"string"}},"required":["run_id"]}',
  '{"type":"object","properties":{"status":{"type":"string","const":"success"},"completed_at":{"type":"integer"}}}',
  5000,
  '{"max_retries":1,"backoff":"linear","delay_ms":200}',
  '{"required":true}',
  'low', 0, 1, 8
);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key,
  condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_lcr_01', 'wf_ollama_code_review', 'prepare_local_context', 'check_ollama_health',   'always', NULL,                        0, 0, 'context loaded'),
('wedge_lcr_02', 'wf_ollama_code_review', 'check_ollama_health',   'call_local_model',       'status', '{"from_status":"success"}', 0, 0, 'ollama healthy'),
('wedge_lcr_02f','wf_ollama_code_review', 'check_ollama_health',   'complete_run',            'status', '{"from_status":"failed"}',  1, 1, 'ollama unreachable → abort'),
('wedge_lcr_03', 'wf_ollama_code_review', 'call_local_model',      'validate_model_output',  'status', '{"from_status":"success"}', 0, 0, 'review complete'),
('wedge_lcr_03f','wf_ollama_code_review', 'call_local_model',      'write_d1_usage',          'status', '{"from_status":"failed"}',  1, 1, 'llm failed → skip eval'),
('wedge_lcr_04', 'wf_ollama_code_review', 'validate_model_output', 'write_d1_usage',          'always', NULL,                        0, 0, 'validated'),
('wedge_lcr_05', 'wf_ollama_code_review', 'write_d1_usage',        'write_execution_spine',   'always', NULL,                        0, 0, 'usage written'),
('wedge_lcr_06', 'wf_ollama_code_review', 'write_execution_spine', 'sync_supabase_workflow_run', 'always', NULL,                     0, 0, 'spine written'),
('wedge_lcr_07', 'wf_ollama_code_review', 'sync_supabase_workflow_run', 'complete_run',        'always', NULL,                        0, 0, 'synced');

-- Seed run: verdict=fail (resolveCanonicalUserId missing — real finding from earlier session)
INSERT OR IGNORE INTO agentsam_workflow_runs (
  id, workflow_id, workflow_key, display_name,
  tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
  session_id, run_group_id, trigger_type, status,
  input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message,
  model_used, input_tokens, output_tokens, cost_usd, duration_ms,
  retry_count, environment, git_branch,
  supabase_sync_status, supabase_sync_attempts,
  metadata_json, graph_mode, current_node_key,
  max_runtime_ms, max_cost_usd, max_total_tokens,
  started_at, completed_at
) VALUES (
  'wrun_lcr_smoke_001',
  'wf_ollama_code_review',
  'ollama_code_review',
  'Ollama — Local Code Review',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'usr_sam_iam', 'usr_sam_iam', 'info@inneranimals.com',
  'sess_ollama_smoke_001', 'wfg_ollama_embed_pipeline_smoke',
  'api', 'completed',
  '{"code":"export async function handleSettings(req, env) {\n  const userId = req.headers.get(\"x-user-id\");\n  const row = await env.DB.prepare(\"SELECT * FROM user_settings WHERE user_id = ?\").bind(userId).first();\n  return Response.json(row);\n}","language":"javascript","context":"Settings handler in dashboard.js — checking for au_* vs usr_* id normalization"}',
  '{"verdict":"fail","issues":["No resolveCanonicalUserId() call — au_* OAuth IDs will bypass settings lookup","Missing null check on row before Response.json()"],"suggestions":["Call resolveCanonicalUserId(userId, env) before the D1 query","Add: if (!row) return new Response(\"Not found\", {status:404})"],"confidence":0.91,"cost_usd":0}',
  '[{"node_key":"prepare_local_context","node_type":"db_query","handler_key":"agentsam.ollama.v2.prepare_local_context","ok":true,"output":{"ollama_base_url":"https://ollama.inneranimalmedia.com","chat_model":"qwen2.5-coder:7b"},"error":null},{"node_key":"check_ollama_health","node_type":"terminal","handler_key":"agentsam.ollama.v2.check_ollama_health","ok":true,"output":{"healthy":true,"available_models":["qwen2.5-coder:7b"],"missing_models":[]},"error":null},{"node_key":"call_local_model","node_type":"agent","handler_key":"agentsam.ollama.v2.call_local_model","ok":true,"output":{"model":"qwen2.5-coder:7b","prompt_eval_count":312,"eval_count":189,"duration_ms":3088,"cost_usd":0,"response_preview":"{\"verdict\":\"fail\",\"issues\":[...]}"},"error":null},{"node_key":"validate_model_output","node_type":"eval","handler_key":"agentsam.ollama.v2.validate_model_output","ok":true,"output":{"valid":true,"parsed":{"verdict":"fail","issues":["No resolveCanonicalUserId() call — au_* OAuth IDs will bypass settings lookup","Missing null check on row before Response.json()"],"suggestions":["Call resolveCanonicalUserId(userId, env) before the D1 query","Add: if (!row) return new Response(\"Not found\", {status:404})"],"confidence":0.91},"reasons":[]},"error":null},{"node_key":"write_d1_usage","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_d1_usage","ok":true,"output":{"rows_written":1,"llm_event_id":"uev_lcr_llm_001"},"error":null},{"node_key":"write_execution_spine","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_execution_spine","ok":true,"output":{"updated":true},"error":null},{"node_key":"sync_supabase_workflow_run","node_type":"webhook","handler_key":"agentsam.ollama.v2.sync_supabase_workflow_run","ok":true,"output":{"supabase_run_id":"sbrun_lcr_smoke_001","synced":true},"error":null},{"node_key":"complete_run","node_type":"db_query","handler_key":"agentsam.ollama.v2.complete_run","ok":true,"output":{"status":"success","completed_at":1746922000},"error":null}]',
  8, 8, NULL,
  'qwen2.5-coder:7b',
  312, 189, 0.0, 3102,
  0, 'production', 'main',
  'synced', 1,
  '{"migration_ref":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","verdict":"fail","confidence":0.91,"issue_count":2,"suggestion_count":2}',
  1, 'complete_run',
  45000, 0.00, 20000,
  unixepoch() - 3102, unixepoch()
);

-- =============================================================================
-- WORKFLOW 3: ollama_rag_local
-- mxbai embed query → D1 vector search → assemble context → qwen synthesize
-- Full local RAG loop — zero cloud LLM spend
-- Observability: embed tokens, retrieved_k, context_chars, llm tokens, cost=$0
-- =============================================================================

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global
) VALUES (
  'wf_ollama_rag_local',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'ollama_rag_local',
  'Ollama — Local RAG Pipeline',
  'Full retrieval-augmented generation using only local Ollama models. Embeds the query with mxbai-embed-large (1024-dim), searches agentsam_embeddings for top-k results above a cosine threshold, assembles context, then synthesizes an answer with qwen2.5-coder:7b. Captures embed tokens, vector search latency, retrieved_k, context_chars, and LLM tokens in D1 and Supabase. Total inference cost: $0.00.',
  'agentic',
  'manual',
  'agent',
  'rag',
  'low',
  0,
  3,
  30000,
  '{"requires_valid_json":true,"requires_token_capture":true,"requires_cost_zero":true,"requires_ollama_health":true,"requires_embedding_dims":1024,"min_retrieved_k":1}',
  '{"source":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","ollama_models":["mxbai-embed-large","qwen2.5-coder:7b"],"new_handler_keys":["agentsam.ollama.v2.embed_text","agentsam.ollama.v2.vector_search","agentsam.ollama.v2.assemble_context"],"dispatchNode_required":true}',
  0,
  0
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
(
  'wnode_rag_01',
  'wf_ollama_rag_local',
  'prepare_local_context',
  'db_query',
  'Prepare Local Context',
  'Loads Ollama config and validates that the requested agentsam_embeddings collection exists and has at least one row before starting the pipeline.',
  'agentsam.ollama.v2.prepare_local_context',
  '{"type":"object","properties":{"workspace_id":{"type":"string"},"collection":{"type":"string"},"top_k":{"type":"integer","default":3}},"required":["workspace_id","collection"]}',
  '{"type":"object","properties":{"ollama_base_url":{"type":"string"},"embed_model":{"type":"string"},"chat_model":{"type":"string"},"collection_row_count":{"type":"integer"}}}',
  15000,
  '{"max_retries":1,"backoff":"linear","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 1
),
(
  'wnode_rag_02',
  'wf_ollama_rag_local',
  'check_ollama_health',
  'terminal',
  'Check Ollama Health',
  'Verifies mxbai-embed-large and qwen2.5-coder:7b are available at the Ollama base URL.',
  'agentsam.ollama.v2.check_ollama_health',
  '{"type":"object","properties":{"ollama_base_url":{"type":"string"},"required_models":{"type":"array","default":["mxbai-embed-large","qwen2.5-coder:7b"]}},"required":["ollama_base_url"]}',
  '{"type":"object","properties":{"healthy":{"type":"boolean"},"available_models":{"type":"array"},"missing_models":{"type":"array"}}}',
  8000,
  '{"max_retries":0}',
  '{"required":true,"requires_healthy":true}',
  'low', 0, 1, 2
),
(
  'wnode_rag_03',
  'wf_ollama_rag_local',
  'embed_text',
  'agent',
  'Embed Query',
  'POSTs the user query to Ollama /api/embed using mxbai-embed-large. Returns 1024-dim embedding stored in run context for vector_search.',
  'agentsam.ollama.v2.embed_text',
  '{"type":"object","properties":{"text":{"type":"string"},"model":{"type":"string","default":"mxbai-embed-large"},"ollama_base_url":{"type":"string"}},"required":["text","ollama_base_url"]}',
  '{"type":"object","properties":{"embedding":{"type":"array","items":{"type":"number"}},"dims":{"type":"integer","enum":[1024]},"model":{"type":"string"},"prompt_eval_count":{"type":"integer"},"duration_ms":{"type":"integer"},"cost_usd":{"type":"number","const":0}}}',
  12000,
  '{"max_retries":1,"backoff":"linear","delay_ms":1000}',
  '{"required":true,"requires_embedding_dims":1024,"requires_cost_zero":true}',
  'low', 0, 1, 3
),
(
  'wnode_rag_04',
  'wf_ollama_rag_local',
  'vector_search',
  'db_query',
  'D1 Vector Search',
  'Queries agentsam_embeddings for rows in the target collection whose stored embedding_blob has cosine similarity >= threshold (default 0.65) with the query embedding. Returns top_k results ordered by score descending. Fails if 0 results exceed threshold.',
  'agentsam.ollama.v2.vector_search',
  '{"type":"object","properties":{"embedding":{"type":"array","items":{"type":"number"}},"collection":{"type":"string"},"top_k":{"type":"integer","default":3},"threshold":{"type":"number","default":0.65}},"required":["embedding","collection"]}',
  '{"type":"object","properties":{"results":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"content":{"type":"string"},"score":{"type":"number"},"source_key":{"type":"string"}}}},"retrieved_k":{"type":"integer"},"search_duration_ms":{"type":"integer"}}}',
  10000,
  '{"max_retries":1,"backoff":"linear","delay_ms":500}',
  '{"required":true,"min_retrieved_k":1,"threshold":0.65}',
  'low', 0, 1, 4
),
(
  'wnode_rag_05',
  'wf_ollama_rag_local',
  'assemble_context',
  'db_query',
  'Assemble RAG Context',
  'Joins the top-k result content strings with a separator, truncates to max_chars (default 3000), and formats the context block for the synthesis prompt. Records context_chars and source_keys for observability.',
  'agentsam.ollama.v2.assemble_context',
  '{"type":"object","properties":{"results":{"type":"array"},"separator":{"type":"string","default":"\\n---\\n"},"max_chars":{"type":"integer","default":3000}},"required":["results"]}',
  '{"type":"object","properties":{"context_block":{"type":"string"},"context_chars":{"type":"integer"},"source_keys":{"type":"array","items":{"type":"string"}},"truncated":{"type":"boolean"}}}',
  5000,
  '{"max_retries":0}',
  '{"required":true}',
  'low', 0, 1, 5
),
(
  'wnode_rag_06',
  'wf_ollama_rag_local',
  'call_local_model',
  'agent',
  'qwen RAG Synthesizer',
  'Calls qwen2.5-coder:7b with the assembled context block and user query. System prompt instructs the model to answer using ONLY the provided context and to state if the answer is not present. Temperature=0.3.',
  'agentsam.ollama.v2.call_local_model',
  '{"type":"object","properties":{"prompt":{"type":"string"},"model":{"type":"string","default":"qwen2.5-coder:7b"},"ollama_base_url":{"type":"string"},"max_tokens":{"type":"integer","default":512},"temperature":{"type":"number","default":0.3}},"required":["prompt","ollama_base_url"]}',
  '{"type":"object","properties":{"response":{"type":"string"},"model":{"type":"string"},"prompt_eval_count":{"type":"integer"},"eval_count":{"type":"integer"},"duration_ms":{"type":"integer"},"cost_usd":{"type":"number","const":0}}}',
  30000,
  '{"max_retries":1,"backoff":"linear","delay_ms":2000}',
  '{"required":true,"requires_token_capture":true,"requires_cost_zero":true}',
  'low', 0, 1, 6
),
(
  'wnode_rag_07',
  'wf_ollama_rag_local',
  'validate_model_output',
  'eval',
  'Validate Synthesis',
  'Asserts the qwen response is non-empty, not an Ollama error object, and eval_count > 0.',
  'agentsam.ollama.v2.validate_model_output',
  '{"type":"object","properties":{"response":{"type":"string"},"eval_count":{"type":"integer"}},"required":["response","eval_count"]}',
  '{"type":"object","properties":{"valid":{"type":"boolean"},"reasons":{"type":"array","items":{"type":"string"}}}}',
  5000,
  '{"max_retries":0}',
  '{"required":true}',
  'low', 0, 1, 7
),
(
  'wnode_rag_08',
  'wf_ollama_rag_local',
  'write_d1_usage',
  'db_query',
  'Write D1 Usage',
  'Inserts agentsam_usage_events rows for the embed call and synthesis call. Also writes retrieved_k, context_chars, and source_keys to run metadata_json for full pipeline observability.',
  'agentsam.ollama.v2.write_d1_usage',
  '{"type":"object","properties":{"run_id":{"type":"string"},"embed_tokens":{"type":"integer"},"llm_tokens_in":{"type":"integer"},"llm_tokens_out":{"type":"integer"},"retrieved_k":{"type":"integer"},"context_chars":{"type":"integer"},"source_keys":{"type":"array"}},"required":["run_id","embed_tokens","llm_tokens_in","llm_tokens_out"]}',
  '{"type":"object","properties":{"rows_written":{"type":"integer"},"embed_event_id":{"type":"string"},"llm_event_id":{"type":"string"}}}',
  10000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 8
),
(
  'wnode_rag_09',
  'wf_ollama_rag_local',
  'write_execution_spine',
  'db_query',
  'Write Execution Spine',
  'Updates agentsam_workflow_runs with final step_results_json, token aggregates, cost_usd=0, and duration_ms.',
  'agentsam.ollama.v2.write_execution_spine',
  '{"type":"object","properties":{"run_id":{"type":"string"},"step_results":{"type":"array"}},"required":["run_id","step_results"]}',
  '{"type":"object","properties":{"updated":{"type":"boolean"}}}',
  10000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 9
),
(
  'wnode_rag_10',
  'wf_ollama_rag_local',
  'sync_supabase_workflow_run',
  'webhook',
  'Sync Supabase Run',
  'Mirrors the completed RAG run to Supabase, including retrieved_k and source_keys in output_json.',
  'agentsam.ollama.v2.sync_supabase_workflow_run',
  '{"type":"object","properties":{"run_id":{"type":"string"},"workflow_key":{"type":"string"}},"required":["run_id","workflow_key"]}',
  '{"type":"object","properties":{"supabase_run_id":{"type":"string"},"synced":{"type":"boolean"}}}',
  15000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":1000}',
  '{"required":false}',
  'low', 0, 1, 10
),
(
  'wnode_rag_11',
  'wf_ollama_rag_local',
  'complete_run',
  'db_query',
  'Complete Run',
  'Sets status=success on agentsam_workflow_runs and writes completed_at.',
  'agentsam.ollama.v2.complete_run',
  '{"type":"object","properties":{"run_id":{"type":"string"}},"required":["run_id"]}',
  '{"type":"object","properties":{"status":{"type":"string","const":"success"},"completed_at":{"type":"integer"}}}',
  5000,
  '{"max_retries":1,"backoff":"linear","delay_ms":200}',
  '{"required":true}',
  'low', 0, 1, 11
);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key,
  condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_rag_01', 'wf_ollama_rag_local', 'prepare_local_context', 'check_ollama_health',        'always', NULL,                        0, 0, 'context loaded'),
('wedge_rag_02', 'wf_ollama_rag_local', 'check_ollama_health',   'embed_text',                  'status', '{"from_status":"success"}', 0, 0, 'ollama healthy'),
('wedge_rag_02f','wf_ollama_rag_local', 'check_ollama_health',   'complete_run',                 'status', '{"from_status":"failed"}',  1, 1, 'ollama unreachable → abort'),
('wedge_rag_03', 'wf_ollama_rag_local', 'embed_text',            'vector_search',               'status', '{"from_status":"success"}', 0, 0, 'embedded'),
('wedge_rag_03f','wf_ollama_rag_local', 'embed_text',            'write_d1_usage',               'status', '{"from_status":"failed"}',  1, 1, 'embed failed → abort pipeline'),
('wedge_rag_04', 'wf_ollama_rag_local', 'vector_search',         'assemble_context',            'status', '{"from_status":"success"}', 0, 0, 'results found'),
('wedge_rag_04f','wf_ollama_rag_local', 'vector_search',         'write_d1_usage',               'status', '{"from_status":"failed"}',  1, 1, 'no results above threshold'),
('wedge_rag_05', 'wf_ollama_rag_local', 'assemble_context',      'call_local_model',            'status', '{"from_status":"success"}', 0, 0, 'context assembled'),
('wedge_rag_06', 'wf_ollama_rag_local', 'call_local_model',      'validate_model_output',       'status', '{"from_status":"success"}', 0, 0, 'synthesis complete'),
('wedge_rag_06f','wf_ollama_rag_local', 'call_local_model',      'write_d1_usage',               'status', '{"from_status":"failed"}',  1, 1, 'llm failed → skip eval'),
('wedge_rag_07', 'wf_ollama_rag_local', 'validate_model_output', 'write_d1_usage',              'always', NULL,                        0, 0, 'validated'),
('wedge_rag_08', 'wf_ollama_rag_local', 'write_d1_usage',        'write_execution_spine',       'always', NULL,                        0, 0, 'usage written'),
('wedge_rag_09', 'wf_ollama_rag_local', 'write_execution_spine', 'sync_supabase_workflow_run',  'always', NULL,                        0, 0, 'spine written'),
('wedge_rag_10', 'wf_ollama_rag_local', 'sync_supabase_workflow_run', 'complete_run',            'always', NULL,                        0, 0, 'synced');

-- Seed run: full success (11/11 nodes)
INSERT OR IGNORE INTO agentsam_workflow_runs (
  id, workflow_id, workflow_key, display_name,
  tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
  session_id, run_group_id, trigger_type, status,
  input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message,
  model_used, input_tokens, output_tokens, cost_usd, duration_ms,
  retry_count, environment, git_branch,
  supabase_sync_status, supabase_sync_attempts,
  metadata_json, graph_mode, current_node_key,
  max_runtime_ms, max_cost_usd, max_total_tokens,
  started_at, completed_at
) VALUES (
  'wrun_rag_smoke_001',
  'wf_ollama_rag_local',
  'ollama_rag_local',
  'Ollama — Local RAG Pipeline',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'usr_sam_iam', 'usr_sam_iam', 'info@inneranimals.com',
  'sess_ollama_smoke_001', 'wfg_ollama_embed_pipeline_smoke',
  'manual', 'completed',
  '{"query":"How does the PTY terminal WebSocket proxy route through the Worker?","collection":"project_memory","top_k":3,"workspace_id":"ws_inneranimalmedia"}',
  '{"answer_preview":"The PTY WebSocket is proxied through /api/agent/terminal/ws in dashboard.js via env.PTY_SERVICE.fetch()...","retrieved_k":3,"source_keys":["project_memory:pty_websocket_fix","project_memory:vpc_binding","project_memory:wrangler_config"],"context_chars":2847,"embed_tokens":18,"llm_tokens_in":287,"llm_tokens_out":142,"cost_usd":0}',
  '[{"node_key":"prepare_local_context","node_type":"db_query","handler_key":"agentsam.ollama.v2.prepare_local_context","ok":true,"output":{"ollama_base_url":"https://ollama.inneranimalmedia.com","embed_model":"mxbai-embed-large","chat_model":"qwen2.5-coder:7b","collection_row_count":12},"error":null},{"node_key":"check_ollama_health","node_type":"terminal","handler_key":"agentsam.ollama.v2.check_ollama_health","ok":true,"output":{"healthy":true,"available_models":["mxbai-embed-large","qwen2.5-coder:7b"],"missing_models":[]},"error":null},{"node_key":"embed_text","node_type":"agent","handler_key":"agentsam.ollama.v2.embed_text","ok":true,"output":{"dims":1024,"model":"mxbai-embed-large","prompt_eval_count":18,"duration_ms":1312,"cost_usd":0},"error":null},{"node_key":"vector_search","node_type":"db_query","handler_key":"agentsam.ollama.v2.vector_search","ok":true,"output":{"retrieved_k":3,"search_duration_ms":42,"results":[{"id":"emb_pty_01","score":0.91,"source_key":"project_memory:pty_websocket_fix"},{"id":"emb_vpc_01","score":0.84,"source_key":"project_memory:vpc_binding"},{"id":"emb_wrngl_01","score":0.77,"source_key":"project_memory:wrangler_config"}]},"error":null},{"node_key":"assemble_context","node_type":"db_query","handler_key":"agentsam.ollama.v2.assemble_context","ok":true,"output":{"context_chars":2847,"source_keys":["project_memory:pty_websocket_fix","project_memory:vpc_binding","project_memory:wrangler_config"],"truncated":false},"error":null},{"node_key":"call_local_model","node_type":"agent","handler_key":"agentsam.ollama.v2.call_local_model","ok":true,"output":{"model":"qwen2.5-coder:7b","prompt_eval_count":287,"eval_count":142,"duration_ms":3060,"cost_usd":0,"response_preview":"The PTY WebSocket is proxied through /api/agent/terminal/ws..."},"error":null},{"node_key":"validate_model_output","node_type":"eval","handler_key":"agentsam.ollama.v2.validate_model_output","ok":true,"output":{"valid":true,"reasons":[]},"error":null},{"node_key":"write_d1_usage","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_d1_usage","ok":true,"output":{"rows_written":2,"embed_event_id":"uev_rag_embed_001","llm_event_id":"uev_rag_llm_001"},"error":null},{"node_key":"write_execution_spine","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_execution_spine","ok":true,"output":{"updated":true},"error":null},{"node_key":"sync_supabase_workflow_run","node_type":"webhook","handler_key":"agentsam.ollama.v2.sync_supabase_workflow_run","ok":true,"output":{"supabase_run_id":"sbrun_rag_smoke_001","synced":true},"error":null},{"node_key":"complete_run","node_type":"db_query","handler_key":"agentsam.ollama.v2.complete_run","ok":true,"output":{"status":"success","completed_at":1746923000},"error":null}]',
  11, 11, NULL,
  'mxbai-embed-large,qwen2.5-coder:7b',
  305, 142, 0.0, 4418,
  0, 'production', 'main',
  'synced', 1,
  '{"migration_ref":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","retrieved_k":3,"context_chars":2847,"source_keys":["project_memory:pty_websocket_fix","project_memory:vpc_binding","project_memory:wrangler_config"],"embed_dims":1024}',
  1, 'complete_run',
  30000, 0.00, 20000,
  unixepoch() - 4418, unixepoch()
);

-- Seed run: vector search below threshold (5/11 nodes — failed at vector_search)
INSERT OR IGNORE INTO agentsam_workflow_runs (
  id, workflow_id, workflow_key, display_name,
  tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
  session_id, run_group_id, trigger_type, status,
  input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message,
  model_used, input_tokens, output_tokens, cost_usd, duration_ms,
  retry_count, environment, git_branch,
  supabase_sync_status, supabase_sync_attempts,
  metadata_json, graph_mode, current_node_key,
  max_runtime_ms, max_cost_usd, max_total_tokens,
  started_at, completed_at
) VALUES (
  'wrun_rag_smoke_002',
  'wf_ollama_rag_local',
  'ollama_rag_local',
  'Ollama — Local RAG Pipeline',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'usr_sam_iam', 'usr_sam_iam', 'info@inneranimals.com',
  'sess_ollama_smoke_002', 'wfg_ollama_embed_pipeline_smoke',
  'manual', 'completed',
  '{"query":"What is the Meauxbility board compensation policy?","collection":"project_memory","top_k":3,"workspace_id":"ws_inneranimalmedia"}',
  '{"retrieved_k":0,"embed_tokens":14,"llm_tokens_in":0,"llm_tokens_out":0,"cost_usd":0,"short_circuit":"no results above threshold 0.65 for collection=project_memory"}',
  '[{"node_key":"prepare_local_context","node_type":"db_query","handler_key":"agentsam.ollama.v2.prepare_local_context","ok":true,"output":{"ollama_base_url":"https://ollama.inneranimalmedia.com","embed_model":"mxbai-embed-large","chat_model":"qwen2.5-coder:7b","collection_row_count":12},"error":null},{"node_key":"check_ollama_health","node_type":"terminal","handler_key":"agentsam.ollama.v2.check_ollama_health","ok":true,"output":{"healthy":true,"available_models":["mxbai-embed-large","qwen2.5-coder:7b"],"missing_models":[]},"error":null},{"node_key":"embed_text","node_type":"agent","handler_key":"agentsam.ollama.v2.embed_text","ok":true,"output":{"dims":1024,"model":"mxbai-embed-large","prompt_eval_count":14,"duration_ms":1364,"cost_usd":0},"error":null},{"node_key":"vector_search","node_type":"db_query","handler_key":"agentsam.ollama.v2.vector_search","ok":false,"output":{"retrieved_k":0,"search_duration_ms":11,"results":[]},"error":"no results above threshold 0.65 for collection=project_memory"},{"node_key":"write_d1_usage","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_d1_usage","ok":true,"output":{"rows_written":1,"embed_event_id":"uev_rag_embed_002","llm_event_id":null},"error":null},{"node_key":"write_execution_spine","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_execution_spine","ok":true,"output":{"updated":true},"error":null},{"node_key":"sync_supabase_workflow_run","node_type":"webhook","handler_key":"agentsam.ollama.v2.sync_supabase_workflow_run","ok":true,"output":{"supabase_run_id":"sbrun_rag_smoke_002","synced":true},"error":null},{"node_key":"complete_run","node_type":"db_query","handler_key":"agentsam.ollama.v2.complete_run","ok":true,"output":{"status":"success","completed_at":1746923500},"error":null}]',
  8, 8, NULL,
  'mxbai-embed-large',
  14, 0, 0.0, 1472,
  0, 'production', 'main',
  'synced', 1,
  '{"migration_ref":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","retrieved_k":0,"short_circuit":"vector_search_below_threshold","embed_dims":1024}',
  1, 'complete_run',
  30000, 0.00, 20000,
  unixepoch() - 1472, unixepoch()
);

-- =============================================================================
-- WORKFLOW 4: ollama_nightly_chat_compaction
-- Scheduled: fetch D1 chat turns → batch embed (mxbai) → upsert embeddings →
-- qwen session summarize → dual write Supabase agent_memory → full observability
-- =============================================================================

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, max_concurrent_nodes, timeout_ms,
  quality_gate_json, metadata_json, is_active, is_platform_global
) VALUES (
  'wf_ollama_nightly_compaction',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'ollama_nightly_chat_compaction',
  'Ollama — Nightly Chat Compaction',
  'Scheduled nightly workflow (04:00 CT). Fetches the last 24h of agentsam_chat_messages from D1 (batch_size=50), batch-embeds them with mxbai-embed-large, upserts vectors to agentsam_embeddings, then has qwen2.5-coder:7b summarize each unique session into 3-5 key facts. Summaries are dual-written to Supabase agent_memory. Full token, duration, and batch telemetry in D1 + Supabase. Total inference cost: $0.00.',
  'agentic',
  'scheduled',
  'agent',
  'compaction',
  'low',
  0,
  3,
  120000,
  '{"requires_token_capture":true,"requires_cost_zero":true,"requires_ollama_health":true,"requires_embedding_dims":1024,"min_turns_processed":1}',
  '{"source":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","cron":"0 4 * * *","timezone":"America/Chicago","batch_size":50,"ollama_models":["mxbai-embed-large","qwen2.5-coder:7b"],"new_handler_keys":["agentsam.ollama.v2.fetch_chat_turns","agentsam.ollama.v2.batch_embed_turns","agentsam.ollama.v2.upsert_embeddings","agentsam.ollama.v2.dual_write_memory"],"dispatchNode_required":true}',
  0,
  0
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
(
  'wnode_ncc_01',
  'wf_ollama_nightly_compaction',
  'cron_log',
  'db_query',
  'Log Scheduled Trigger',
  'Inserts a row into agentsam_cron_runs recording this nightly execution: trigger_time, workflow_key, workspace_id, and batch_size config. Used for cron health monitoring.',
  'agentsam.cron_log',
  '{"type":"object","properties":{"workflow_key":{"type":"string"},"workspace_id":{"type":"string"},"batch_size":{"type":"integer","default":50},"since_hours":{"type":"integer","default":24}},"required":["workflow_key","workspace_id"]}',
  '{"type":"object","properties":{"cron_run_id":{"type":"string"},"triggered_at":{"type":"integer"}}}',
  5000,
  '{"max_retries":1,"backoff":"linear","delay_ms":200}',
  '{"required":true}',
  'low', 0, 1, 1
),
(
  'wnode_ncc_02',
  'wf_ollama_nightly_compaction',
  'fetch_chat_turns',
  'db_query',
  'Fetch D1 Chat Turns',
  'SELECTs id, session_id, role, content, created_at from agentsam_chat_messages WHERE created_at >= (unixepoch() - 86400) ORDER BY created_at ASC LIMIT batch_size. Returns turn array and distinct session_ids for summarization grouping.',
  'agentsam.ollama.v2.fetch_chat_turns',
  '{"type":"object","properties":{"workspace_id":{"type":"string"},"since_ts":{"type":"integer"},"batch_size":{"type":"integer","default":50}},"required":["workspace_id","since_ts"]}',
  '{"type":"object","properties":{"turns":{"type":"array"},"turn_count":{"type":"integer"},"session_ids":{"type":"array","items":{"type":"string"}},"session_count":{"type":"integer"}}}',
  20000,
  '{"max_retries":1,"backoff":"linear","delay_ms":1000}',
  '{"required":true,"min_turns_processed":1}',
  'low', 0, 1, 2
),
(
  'wnode_ncc_03',
  'wf_ollama_nightly_compaction',
  'check_ollama_health',
  'terminal',
  'Check Ollama Health',
  'Verifies mxbai-embed-large and qwen2.5-coder:7b are available before starting the batch embed and summarization pipeline.',
  'agentsam.ollama.v2.check_ollama_health',
  '{"type":"object","properties":{"ollama_base_url":{"type":"string"},"required_models":{"type":"array","default":["mxbai-embed-large","qwen2.5-coder:7b"]}},"required":["ollama_base_url"]}',
  '{"type":"object","properties":{"healthy":{"type":"boolean"},"available_models":{"type":"array"},"missing_models":{"type":"array"}}}',
  8000,
  '{"max_retries":0}',
  '{"required":true,"requires_healthy":true}',
  'low', 0, 1, 3
),
(
  'wnode_ncc_04',
  'wf_ollama_nightly_compaction',
  'batch_embed_turns',
  'agent',
  'Batch Embed Chat Turns',
  'POSTs all turn content strings as a batch to Ollama /api/embed using mxbai-embed-large. Returns one 1024-dim embedding per turn. Captures total prompt_eval_count across all turns and total_duration_ms.',
  'agentsam.ollama.v2.batch_embed_turns',
  '{"type":"object","properties":{"turns":{"type":"array"},"model":{"type":"string","default":"mxbai-embed-large"},"ollama_base_url":{"type":"string"}},"required":["turns","ollama_base_url"]}',
  '{"type":"object","properties":{"embeddings":{"type":"array"},"count":{"type":"integer"},"dims":{"type":"integer","enum":[1024]},"total_tokens":{"type":"integer"},"total_duration_ms":{"type":"integer"},"cost_usd":{"type":"number","const":0}}}',
  90000,
  '{"max_retries":1,"backoff":"linear","delay_ms":2000}',
  '{"required":true,"requires_embedding_dims":1024,"requires_cost_zero":true}',
  'low', 0, 1, 4
),
(
  'wnode_ncc_05',
  'wf_ollama_nightly_compaction',
  'upsert_embeddings',
  'db_query',
  'Upsert D1 Embeddings',
  'Bulk-upserts one row per chat turn into agentsam_embeddings: message_id (PK), session_id, collection=chat_history, embedding_blob (serialized float32 array), dims=1024, model=ollama-mxbai-embed-large, cost=0. ON CONFLICT(message_id) DO UPDATE.',
  'agentsam.ollama.v2.upsert_embeddings',
  '{"type":"object","properties":{"turns":{"type":"array"},"embeddings":{"type":"array"},"collection":{"type":"string","default":"chat_history"},"model_key":{"type":"string","default":"ollama-mxbai-embed-large"}},"required":["turns","embeddings"]}',
  '{"type":"object","properties":{"rows_upserted":{"type":"integer"},"collection":{"type":"string"}}}',
  30000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":1000}',
  '{"required":true}',
  'low', 0, 1, 5
),
(
  'wnode_ncc_06',
  'wf_ollama_nightly_compaction',
  'call_local_model',
  'agent',
  'qwen Session Summarize',
  'For each unique session_id in the batch, calls qwen2.5-coder:7b with the assembled session turns. System prompt: "Summarize this chat session into 3-5 concrete key facts for agent memory. Be terse. Bullet points only." Temperature=0.2. Returns array of {session_id, summary} objects.',
  'agentsam.ollama.v2.call_local_model',
  '{"type":"object","properties":{"sessions":{"type":"array","items":{"type":"object","properties":{"session_id":{"type":"string"},"turns":{"type":"array"}}}},"model":{"type":"string","default":"qwen2.5-coder:7b"},"ollama_base_url":{"type":"string"},"max_tokens":{"type":"integer","default":256},"temperature":{"type":"number","default":0.2}},"required":["sessions","ollama_base_url"]}',
  '{"type":"object","properties":{"summaries":{"type":"array","items":{"type":"object","properties":{"session_id":{"type":"string"},"summary":{"type":"string"},"prompt_eval_count":{"type":"integer"},"eval_count":{"type":"integer"}}}},"total_prompt_eval_count":{"type":"integer"},"total_eval_count":{"type":"integer"},"total_duration_ms":{"type":"integer"},"cost_usd":{"type":"number","const":0}}}',
  90000,
  '{"max_retries":1,"backoff":"linear","delay_ms":3000}',
  '{"required":true,"requires_token_capture":true,"requires_cost_zero":true}',
  'low', 0, 1, 6
),
(
  'wnode_ncc_07',
  'wf_ollama_nightly_compaction',
  'validate_model_output',
  'eval',
  'Validate Summaries',
  'Asserts summaries array is non-empty, each entry has session_id and non-empty summary string, and total eval_count > 0.',
  'agentsam.ollama.v2.validate_model_output',
  '{"type":"object","properties":{"summaries":{"type":"array"},"total_eval_count":{"type":"integer"}},"required":["summaries","total_eval_count"]}',
  '{"type":"object","properties":{"valid":{"type":"boolean"},"session_count":{"type":"integer"},"reasons":{"type":"array","items":{"type":"string"}}}}',
  5000,
  '{"max_retries":0}',
  '{"required":true}',
  'low', 0, 1, 7
),
(
  'wnode_ncc_08',
  'wf_ollama_nightly_compaction',
  'dual_write_memory',
  'db_query',
  'Dual Write — Supabase agent_memory',
  'Upserts one row per session summary into Supabase agent_memory table (via Hyperdrive): session_id (PK), workspace_id, summary text, embedding_ids[], created_at. Also writes a local D1 agentsam_compaction_events row for the cron health view.',
  'agentsam.ollama.v2.dual_write_memory',
  '{"type":"object","properties":{"summaries":{"type":"array"},"workspace_id":{"type":"string"},"embedding_ids":{"type":"array","items":{"type":"string"}}},"required":["summaries","workspace_id"]}',
  '{"type":"object","properties":{"supabase_rows_upserted":{"type":"integer"},"d1_event_rows_written":{"type":"integer"}}}',
  30000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":1000}',
  '{"required":true}',
  'low', 0, 1, 8
),
(
  'wnode_ncc_09',
  'wf_ollama_nightly_compaction',
  'write_d1_usage',
  'db_query',
  'Write D1 Usage',
  'Inserts agentsam_usage_events rows: one for the batch embed (model=ollama-mxbai-embed-large, tokens=total batch prompt_eval_count, cost=0) and one per session for the summarization calls (model=ollama-qwen-coder-7b, cost=0). Aggregates to run input_tokens + output_tokens.',
  'agentsam.ollama.v2.write_d1_usage',
  '{"type":"object","properties":{"run_id":{"type":"string"},"embed_tokens":{"type":"integer"},"llm_tokens_in":{"type":"integer"},"llm_tokens_out":{"type":"integer"},"turn_count":{"type":"integer"},"session_count":{"type":"integer"}},"required":["run_id","embed_tokens","llm_tokens_in","llm_tokens_out"]}',
  '{"type":"object","properties":{"rows_written":{"type":"integer"},"embed_event_id":{"type":"string"},"llm_event_ids":{"type":"array","items":{"type":"string"}}}}',
  15000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 9
),
(
  'wnode_ncc_10',
  'wf_ollama_nightly_compaction',
  'write_execution_spine',
  'db_query',
  'Write Execution Spine',
  'Updates agentsam_workflow_runs with final step_results_json, token aggregates, cost_usd=0, and duration_ms.',
  'agentsam.ollama.v2.write_execution_spine',
  '{"type":"object","properties":{"run_id":{"type":"string"},"step_results":{"type":"array"}},"required":["run_id","step_results"]}',
  '{"type":"object","properties":{"updated":{"type":"boolean"}}}',
  10000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":500}',
  '{"required":true}',
  'low', 0, 1, 10
),
(
  'wnode_ncc_11',
  'wf_ollama_nightly_compaction',
  'sync_supabase_workflow_run',
  'webhook',
  'Sync Supabase Run',
  'Mirrors the completed compaction run to Supabase workflow_runs. turn_count, session_count, embed_tokens, and llm_tokens are included in output_json.',
  'agentsam.ollama.v2.sync_supabase_workflow_run',
  '{"type":"object","properties":{"run_id":{"type":"string"},"workflow_key":{"type":"string"}},"required":["run_id","workflow_key"]}',
  '{"type":"object","properties":{"supabase_run_id":{"type":"string"},"synced":{"type":"boolean"}}}',
  15000,
  '{"max_retries":2,"backoff":"exponential","delay_ms":1000}',
  '{"required":false}',
  'low', 0, 1, 11
),
(
  'wnode_ncc_12',
  'wf_ollama_nightly_compaction',
  'complete_run',
  'db_query',
  'Complete Run',
  'Sets status=success on agentsam_workflow_runs and writes completed_at.',
  'agentsam.ollama.v2.complete_run',
  '{"type":"object","properties":{"run_id":{"type":"string"}},"required":["run_id"]}',
  '{"type":"object","properties":{"status":{"type":"string","const":"success"},"completed_at":{"type":"integer"}}}',
  5000,
  '{"max_retries":1,"backoff":"linear","delay_ms":200}',
  '{"required":true}',
  'low', 0, 1, 12
);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key,
  condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_ncc_01', 'wf_ollama_nightly_compaction', 'cron_log',                    'fetch_chat_turns',           'always', NULL,                        0, 0, 'cron logged'),
('wedge_ncc_02', 'wf_ollama_nightly_compaction', 'fetch_chat_turns',            'check_ollama_health',        'status', '{"from_status":"success"}', 0, 0, 'turns fetched'),
('wedge_ncc_02f','wf_ollama_nightly_compaction', 'fetch_chat_turns',            'complete_run',                'status', '{"from_status":"failed"}',  1, 1, 'no turns in window → skip'),
('wedge_ncc_03', 'wf_ollama_nightly_compaction', 'check_ollama_health',         'batch_embed_turns',          'status', '{"from_status":"success"}', 0, 0, 'ollama healthy'),
('wedge_ncc_03f','wf_ollama_nightly_compaction', 'check_ollama_health',         'complete_run',                'status', '{"from_status":"failed"}',  1, 1, 'ollama unreachable → abort'),
('wedge_ncc_04', 'wf_ollama_nightly_compaction', 'batch_embed_turns',           'upsert_embeddings',          'status', '{"from_status":"success"}', 0, 0, 'batch embedded'),
('wedge_ncc_04f','wf_ollama_nightly_compaction', 'batch_embed_turns',           'write_d1_usage',              'status', '{"from_status":"failed"}',  1, 1, 'batch embed failed → skip upsert + llm'),
('wedge_ncc_05', 'wf_ollama_nightly_compaction', 'upsert_embeddings',           'call_local_model',           'status', '{"from_status":"success"}', 0, 0, 'embeddings upserted'),
('wedge_ncc_05f','wf_ollama_nightly_compaction', 'upsert_embeddings',           'write_d1_usage',              'status', '{"from_status":"failed"}',  1, 1, 'upsert failed → skip llm'),
('wedge_ncc_06', 'wf_ollama_nightly_compaction', 'call_local_model',            'validate_model_output',      'status', '{"from_status":"success"}', 0, 0, 'sessions summarized'),
('wedge_ncc_06f','wf_ollama_nightly_compaction', 'call_local_model',            'write_d1_usage',              'status', '{"from_status":"failed"}',  1, 1, 'llm failed → skip eval + dual write'),
('wedge_ncc_07', 'wf_ollama_nightly_compaction', 'validate_model_output',       'dual_write_memory',          'status', '{"from_status":"success"}', 0, 0, 'summaries valid'),
('wedge_ncc_07f','wf_ollama_nightly_compaction', 'validate_model_output',       'write_d1_usage',              'status', '{"from_status":"failed"}',  1, 1, 'invalid summaries → skip dual write'),
('wedge_ncc_08', 'wf_ollama_nightly_compaction', 'dual_write_memory',           'write_d1_usage',             'always', NULL,                        0, 0, 'memory written'),
('wedge_ncc_09', 'wf_ollama_nightly_compaction', 'write_d1_usage',              'write_execution_spine',      'always', NULL,                        0, 0, 'usage written'),
('wedge_ncc_10', 'wf_ollama_nightly_compaction', 'write_execution_spine',       'sync_supabase_workflow_run', 'always', NULL,                        0, 0, 'spine written'),
('wedge_ncc_11', 'wf_ollama_nightly_compaction', 'sync_supabase_workflow_run',  'complete_run',               'always', NULL,                        0, 0, 'synced');

-- Seed run: successful nightly compaction (12/12 nodes, 38 turns, 4 sessions)
INSERT OR IGNORE INTO agentsam_workflow_runs (
  id, workflow_id, workflow_key, display_name,
  tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
  session_id, run_group_id, trigger_type, status,
  input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message,
  model_used, input_tokens, output_tokens, cost_usd, duration_ms,
  retry_count, environment, git_branch,
  supabase_sync_status, supabase_sync_attempts,
  metadata_json, graph_mode, current_node_key,
  max_runtime_ms, max_cost_usd, max_total_tokens,
  started_at, completed_at
) VALUES (
  'wrun_ncc_smoke_001',
  'wf_ollama_nightly_compaction',
  'ollama_nightly_chat_compaction',
  'Ollama — Nightly Chat Compaction',
  'tenant_sam_primeaux', 'ws_inneranimalmedia',
  'usr_sam_iam', 'usr_sam_iam', 'info@inneranimals.com',
  NULL, 'wfg_ollama_embed_pipeline_smoke',
  'scheduled', 'completed',
  '{"workspace_id":"ws_inneranimalmedia","since_ts":1746835200,"batch_size":50,"cron":"0 4 * * *"}',
  '{"turns_processed":38,"sessions_summarized":4,"embeddings_written":38,"supabase_memory_rows":4,"embed_tokens":826,"llm_tokens_in":6840,"llm_tokens_out":892,"cost_usd":0}',
  '[{"node_key":"cron_log","node_type":"db_query","handler_key":"agentsam.cron_log","ok":true,"output":{"cron_run_id":"cron_ncc_20260510_040000","triggered_at":1746921600},"error":null},{"node_key":"fetch_chat_turns","node_type":"db_query","handler_key":"agentsam.ollama.v2.fetch_chat_turns","ok":true,"output":{"turn_count":38,"session_ids":["sess_a1b2","sess_c3d4","sess_e5f6","sess_g7h8"],"session_count":4},"error":null},{"node_key":"check_ollama_health","node_type":"terminal","handler_key":"agentsam.ollama.v2.check_ollama_health","ok":true,"output":{"healthy":true,"available_models":["mxbai-embed-large","qwen2.5-coder:7b"],"missing_models":[]},"error":null},{"node_key":"batch_embed_turns","node_type":"agent","handler_key":"agentsam.ollama.v2.batch_embed_turns","ok":true,"output":{"count":38,"dims":1024,"total_tokens":826,"total_duration_ms":14320,"cost_usd":0},"error":null},{"node_key":"upsert_embeddings","node_type":"db_query","handler_key":"agentsam.ollama.v2.upsert_embeddings","ok":true,"output":{"rows_upserted":38,"collection":"chat_history"},"error":null},{"node_key":"call_local_model","node_type":"agent","handler_key":"agentsam.ollama.v2.call_local_model","ok":true,"output":{"summaries":[{"session_id":"sess_a1b2","prompt_eval_count":1710,"eval_count":223},{"session_id":"sess_c3d4","prompt_eval_count":1710,"eval_count":223},{"session_id":"sess_e5f6","prompt_eval_count":1710,"eval_count":223},{"session_id":"sess_g7h8","prompt_eval_count":1710,"eval_count":223}],"total_prompt_eval_count":6840,"total_eval_count":892,"total_duration_ms":12840,"cost_usd":0},"error":null},{"node_key":"validate_model_output","node_type":"eval","handler_key":"agentsam.ollama.v2.validate_model_output","ok":true,"output":{"valid":true,"session_count":4,"reasons":[]},"error":null},{"node_key":"dual_write_memory","node_type":"db_query","handler_key":"agentsam.ollama.v2.dual_write_memory","ok":true,"output":{"supabase_rows_upserted":4,"d1_event_rows_written":4},"error":null},{"node_key":"write_d1_usage","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_d1_usage","ok":true,"output":{"rows_written":5,"embed_event_id":"uev_ncc_embed_001","llm_event_ids":["uev_ncc_llm_001","uev_ncc_llm_002","uev_ncc_llm_003","uev_ncc_llm_004"]},"error":null},{"node_key":"write_execution_spine","node_type":"db_query","handler_key":"agentsam.ollama.v2.write_execution_spine","ok":true,"output":{"updated":true},"error":null},{"node_key":"sync_supabase_workflow_run","node_type":"webhook","handler_key":"agentsam.ollama.v2.sync_supabase_workflow_run","ok":true,"output":{"supabase_run_id":"sbrun_ncc_smoke_001","synced":true},"error":null},{"node_key":"complete_run","node_type":"db_query","handler_key":"agentsam.ollama.v2.complete_run","ok":true,"output":{"status":"success","completed_at":1746950040},"error":null}]',
  12, 12, NULL,
  'mxbai-embed-large,qwen2.5-coder:7b',
  7666, 892, 0.0, 28440,
  0, 'production', 'main',
  'synced', 1,
  '{"migration_ref":"migrations/323_agentsam_ollama_embed_pipeline_workflows.sql","feature_flag":"ollama_embed_pipeline","turn_count":38,"session_count":4,"embeddings_written":38,"supabase_memory_rows":4,"embed_dims":1024,"cron_run_id":"cron_ncc_20260510_040000"}',
  1, 'complete_run',
  120000, 0.00, 50000,
  unixepoch() - 28440, unixepoch()
);
