-- Migration 227: Enriching Agent Sam SOTA Capability Layer
-- Author: Agent Sam (Antigravity)
-- Date: 2026-04-10

-- 1. ENRICH: agentsam_ai (Add missing SOTA columns)
-- Using separate ALTER statements as SQLite D1 requires per-column injection
ALTER TABLE agentsam_ai ADD COLUMN context_max_tokens INTEGER DEFAULT 1000000;
ALTER TABLE agentsam_ai ADD COLUMN output_max_tokens INTEGER DEFAULT 64000;
ALTER TABLE agentsam_ai ADD COLUMN thinking_mode TEXT DEFAULT 'adaptive';
ALTER TABLE agentsam_ai ADD COLUMN effort TEXT DEFAULT 'medium';

-- 2. SEED/UPDATE: Managed Agent Sam SOTA Profiles
-- We use INSERT OR REPLACE to ensure existing IDs are updated with new pricing/specs
INSERT OR REPLACE INTO agentsam_ai 
(id, tenant_id, name, role_name, mode, model_policy_json, cost_policy_json, context_max_tokens, output_max_tokens, thinking_mode, effort, description, system_prompt, status, is_global, tenant_scope, auth_strategy, tool_permissions_json)
VALUES 
('agent_sam_orchestrator', 'tenant_sam_primeaux', 'Agent Sam (Orchestrator)', 'orchestrator', 'orchestrator', 
 '{"model_key": "claude-opus-4-6", "speed": "fast"}', 
 '{"input_rate_per_mtok": 15, "output_rate_per_mtok": 75}', 1000000, 128000, 'adaptive', 'high',
 'The most intelligent Agent Sam profile for architectural planning and code refactoring.',
 'You are Agent Sam (Orchestrator). You excel at high-level planning and deep reasoning. Use your adaptive thinking to evaluate complex problems before proposing solutions.',
 'active', 1, 'multi_tenant', 'zero_trust_plus_oauth', '{"*": "allow"}'),

('agent_sam_worker', 'tenant_sam_primeaux', 'Agent Sam (Worker)', 'worker', 'worker', 
 '{"model_key": "claude-sonnet-4-6"}', 
 '{"input_rate_per_mtok": 3, "output_rate_per_mtok": 15}', 1000000, 64000, 'adaptive', 'medium',
 'The best combination of speed and intelligence for daily coding and terminal tasks.',
 'You are Agent Sam (Worker). You are fast, efficient, and precise. Focus on executing tasks and providing production-ready code snippets.',
 'active', 1, 'multi_tenant', 'zero_trust_plus_oauth', '{"*": "allow"}'),

('agent_sam_dispatcher', 'tenant_sam_primeaux', 'Agent Sam (Dispatcher)', 'dispatcher', 'dispatcher', 
 '{"model_key": "claude-haiku-4-5"}', 
 '{"input_rate_per_mtok": 0.25, "output_rate_per_mtok": 1.25}', 200000, 4096, 'disabled', 'low',
 'Low-latency agent for session routing, telemetry summaries, and quick queries.',
 'You are Agent Sam (Dispatcher). Your goal is to route requests and summarize information quickly and cost-effectively.',
 'active', 1, 'multi_tenant', 'zero_trust_plus_oauth', '{"*": "allow"}');

-- 3. SEED: Essential Managed Skills
INSERT OR IGNORE INTO agentsam_skill 
(id, user_id, name, description, icon, is_active, metadata_json)
VALUES 
('skill_web_search', 'sam_primeaux', 'Web Search (v2)', 'Search the web with dynamic code-based filtering.', 'globe', 1, '{"tool_key": "web_search_20260209", "version": "GA"}'),
('skill_web_fetch', 'sam_primeaux', 'Web Fetch (v2)', 'Fetch URL content with code-driven relevance filtering.', 'link', 1, '{"tool_key": "web_fetch_20260209", "version": "GA"}'),
('skill_terminal', 'sam_primeaux', 'Terminal Execution', 'Execute shell commands with granular audit logging.', 'terminal', 1, '{"tool_key": "terminal_execute"}'),
('skill_d1_explorer', 'sam_primeaux', 'D1 Explorer', 'Query and modify D1 databases with schema awareness.', 'database', 1, '{"tool_key": "d1_query"}'),
('skill_code_exec', 'sam_primeaux', 'Code Execution', 'Run Python/JS code in a secure sandbox (free with web tools).', 'code', 1, '{"tool_key": "code_execution"}');
