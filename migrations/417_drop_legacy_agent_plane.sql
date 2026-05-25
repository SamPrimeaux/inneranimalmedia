-- Drop legacy agent_* plane tables superseded by agentsam_* (policy: must never exist).
-- Idempotent: IF EXISTS only. Canonical replacements documented in agentsam_rules / session handoff.
-- Run after Worker paths no longer INSERT into these tables.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS agent_db_query_history;
DROP TABLE IF EXISTS agent_db_snippets;

DROP TABLE IF EXISTS agent_command_audit_log;
DROP TABLE IF EXISTS agent_command_executions;
DROP TABLE IF EXISTS agent_intent_execution_log;
DROP TABLE IF EXISTS agent_commands;

DROP TABLE IF EXISTS agent_messages;
DROP TABLE IF EXISTS agent_sessions;

DROP TABLE IF EXISTS agent_tool_chain;
DROP TABLE IF EXISTS agent_tools;
DROP TABLE IF EXISTS agent_intent_patterns;

DROP TABLE IF EXISTS agent_cost_ledger;
DROP TABLE IF EXISTS agent_costs;

DROP TABLE IF EXISTS agent_prompt_provider_profiles;
DROP TABLE IF EXISTS agent_prompts;
DROP TABLE IF EXISTS agent_mode_configs;
DROP TABLE IF EXISTS agent_model_registry;

DROP TABLE IF EXISTS agent_policy_templates;
DROP TABLE IF EXISTS agent_rules;

DROP TABLE IF EXISTS agent_execution_plans;
DROP TABLE IF EXISTS agent_memory_index;
DROP TABLE IF EXISTS agent_platform_context;
DROP TABLE IF EXISTS agent_recipe_prompts;

DROP TABLE IF EXISTS agent_runtime_configs;
DROP TABLE IF EXISTS agent_scopes;
DROP TABLE IF EXISTS agent_roles;
DROP TABLE IF EXISTS agent_capabilities;
DROP TABLE IF EXISTS agent_configs;

PRAGMA foreign_keys = ON;
