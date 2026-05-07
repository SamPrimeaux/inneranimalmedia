---
doc_type: agentsam_schema_index
scope: agentsam-platform
database: inneranimalmedia-business
generated_at: 2026-05-07T05:17:18.222090+00:00
date: 2026-05-07
autorag_ready: true
tags: [d1, schema, agentsam, index, cursor-context]
---

# agentsam_* Schema Index

This is the master index for the Agent Sam D1 namespace.

- Database: `inneranimalmedia-business`
- Pattern: `agentsam_%`
- Tables: `70`

## Cursor rule

Use the context file before writing agentsam SQL. Do not guess columns.

## CI/CD Scripts and Automation

| table | rows | purpose |
|---|---:|---|
| `agentsam_scripts` | 96 | Registry of automation scripts, runners, safety flags, owner-only requirements, and preferred usage. |

## Commands and Intent Routing

| table | rows | purpose |
|---|---:|---|
| `agentsam_command_allowlist` | 155 | agentsam table in the Commands and Intent Routing domain. Use the actual columns listed here before writing API SQL. Leading columns: id, us |
| `agentsam_command_pattern` | 10 | agentsam table in the Commands and Intent Routing domain. Use the actual columns listed here before writing API SQL. Leading columns: id, wo |
| `agentsam_commands` | 372 | Canonical command registry for Agent Sam actions and command routing. |
| `agentsam_slash_commands` | 22 | agentsam table in the Commands and Intent Routing domain. Use the actual columns listed here before writing API SQL. Leading columns: id, sl |

## Agent Execution

| table | rows | purpose |
|---|---:|---|
| `agentsam_agent_run` | 312 | High-level agent invocation/run record for status, model, cost, token, and workflow tracking. |
| `agentsam_command_run` | 69 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workspace_id,  |
| `agentsam_compaction_events` | 0 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, ses |
| `agentsam_cron_runs` | 156 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, job_name, cron |
| `agentsam_escalation` | 0 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, wor |
| `agentsam_eval_runs` | 12 | Evaluation run results and quality/cost/latency scoring. |
| `agentsam_execution_context` | 59 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, wor |
| `agentsam_executions` | 12 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, wor |
| `agentsam_hook_execution` | 78 | Execution records for triggered hooks. |
| `agentsam_mcp_tool_execution` | 13 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tool_id, tool_ |
| `agentsam_project_context` | 51 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, wor |
| `agentsam_script_runs` | 0 | Execution history for registered scripts, including branch/SHA, environment, status, and output summaries. |
| `agentsam_tool_chain` | 19 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id, wor |
| `agentsam_workflow_runs` | 0 | agentsam table in the Agent Execution domain. Use the actual columns listed here before writing API SQL. Leading columns: id, workflow_id, w |

## Hooks and Webhooks

| table | rows | purpose |
|---|---:|---|
| `agentsam_hook` | 14 | Hook definitions connecting events to workflows, tools, or commands. |
| `agentsam_webhook_events` | 1277 | Inbound webhook event log and processing state. |
| `agentsam_webhook_weekly` | 1 | agentsam table in the Hooks and Webhooks domain. Use the actual columns listed here before writing API SQL. Leading columns: id, tenant_id,  |

## MCP Tools, Servers, and Tool Logs

| table | rows | purpose |
|---|---:|---|
| `agentsam_mcp_allowlist` | 412 | agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |
| `agentsam_mcp_servers` | 3 | Registry of MCP servers and health/routing metadata. |
| `agentsam_mcp_tools` | 392 | Registry of MCP tools and tool schema/risk/health metadata. |
| `agentsam_mcp_workflows` | 86 | agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |
| `agentsam_tool_call_log` | 18 | agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |
| `agentsam_tool_stats_compacted` | 74 | agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |
| `agentsam_tools` | 40 | agentsam table in the MCP Tools, Servers, and Tool Logs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |

## Memory, Skills, Rules, and Ignore Patterns

| table | rows | purpose |
|---|---:|---|
| `agentsam_ignore_pattern` | 10 | agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading  |
| `agentsam_memory` | 80 | Persistent memory/facts/preferences used for Agent Sam context. |
| `agentsam_rules_document` | 4 | agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading  |
| `agentsam_skill` | 47 | agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading  |
| `agentsam_skill_invocation` | 303 | agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading  |
| `agentsam_skill_revision` | 7 | agentsam table in the Memory, Skills, Rules, and Ignore Patterns domain. Use the actual columns listed here before writing API SQL. Leading  |

## AI Models, Routing, Prompts, and Evals

| table | rows | purpose |
|---|---:|---|
| `agentsam_ai` | 112 | AI model/provider catalog and model capability metadata. |
| `agentsam_eval_cases` | 12 | Evaluation cases for model/tool/prompt quality testing. |
| `agentsam_eval_suites` | 8 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_fetch_domain_allowlist` | 18 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_guardrail_events` | 0 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_guardrail_rulesets` | 2 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_guardrails` | 13 | Guardrail rule definitions for safety, governance, and tool/action blocking. |
| `agentsam_health_daily` | 3 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_model_drift_signals` | 3 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_model_tier` | 5 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_prompt_cache_keys` | 0 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |
| `agentsam_prompt_versions` | 11 | Versioned system/role/prompt records for rollback and prompt governance. |
| `agentsam_routing_arms` | 57 | Model routing state used for provider/model selection and performance tuning. |
| `agentsam_usage_rollups_daily` | 26 | agentsam table in the AI Models, Routing, Prompts, and Evals domain. Use the actual columns listed here before writing API SQL. Leading colu |

## Observability, Analytics, Health, and Errors

| table | rows | purpose |
|---|---:|---|
| `agentsam_analytics` | 3 | Analytics snapshot/rollup table for Agent Sam usage, costs, tools, and system health. |
| `agentsam_deployment_health` | 7 | agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leadin |
| `agentsam_error_log` | 1 | agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leadin |
| `agentsam_task_slos` | 3 | agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leadin |
| `agentsam_usage_events` | 393 | agentsam table in the Observability, Analytics, Health, and Errors domain. Use the actual columns listed here before writing API SQL. Leadin |

## Other agentsam_* Tables

| table | rows | purpose |
|---|---:|---|
| `agentsam_artifacts` | 3 | agentsam table in the Other agentsam_* Tables domain. Use the actual columns listed here before writing API SQL. Leading columns: id, user_i |

## Security, Guardrails, Policy, and Approvals

| table | rows | purpose |
|---|---:|---|
| `agentsam_approval_queue` | 2 | Human approval queue for risky or gated tool/command actions. |
| `agentsam_browser_trusted_origin` | 10 | agentsam table in the Security, Guardrails, Policy, and Approvals domain. Use the actual columns listed here before writing API SQL. Leading |
| `agentsam_user_feature_override` | 0 | agentsam table in the Security, Guardrails, Policy, and Approvals domain. Use the actual columns listed here before writing API SQL. Leading |
| `agentsam_user_policy` | 4 | agentsam table in the Security, Guardrails, Policy, and Approvals domain. Use the actual columns listed here before writing API SQL. Leading |

## Settings, Feature Flags, and Jobs

| table | rows | purpose |
|---|---:|---|
| `agentsam_cad_jobs` | 2 | agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |
| `agentsam_code_index_job` | 8 | agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |
| `agentsam_feature_flag` | 13 | agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |
| `agentsam_subscription_registry` | 16 | agentsam table in the Settings, Feature Flags, and Jobs domain. Use the actual columns listed here before writing API SQL. Leading columns:  |

## Workflows, Plans, Tasks, and Todos

| table | rows | purpose |
|---|---:|---|
| `agentsam_plan_tasks` | 75 | agentsam table in the Workflows, Plans, Tasks, and Todos domain. Use the actual columns listed here before writing API SQL. Leading columns: |
| `agentsam_plans` | 13 | agentsam table in the Workflows, Plans, Tasks, and Todos domain. Use the actual columns listed here before writing API SQL. Leading columns: |
| `agentsam_todo` | 75 | agentsam table in the Workflows, Plans, Tasks, and Todos domain. Use the actual columns listed here before writing API SQL. Leading columns: |

## Workspaces, Projects, and Subagents

| table | rows | purpose |
|---|---:|---|
| `agentsam_bootstrap` | 12 | agentsam table in the Workspaces, Projects, and Subagents domain. Use the actual columns listed here before writing API SQL. Leading columns |
| `agentsam_subagent_profile` | 41 | agentsam table in the Workspaces, Projects, and Subagents domain. Use the actual columns listed here before writing API SQL. Leading columns |
| `agentsam_workspace` | 24 | Workspace-level configuration for Agent Sam, including project/repo/R2/model/subagent context. |
| `agentsam_workspace_state` | 6 | agentsam table in the Workspaces, Projects, and Subagents domain. Use the actual columns listed here before writing API SQL. Leading columns |

