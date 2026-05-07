---
doc_type: agentsam_frontend_backend_gap_checklist
scope: agentsam-platform
database: inneranimalmedia-business
generated_at: 2026-05-07T05:17:18.222090+00:00
date: 2026-05-07
tags: [d1, schema, agentsam, frontend-gaps, dashboard]
---

# Agent Sam Frontend ↔ Backend Gap Checklist

This file is a lightweight checklist. It does not assume routes exist. Use it to decide which dashboard pages need UI/API coverage for each agentsam table group.

## CI/CD Scripts and Automation

Suggested dashboard surfaces:
- `/dashboard/settings/cicd`
- `/dashboard/agent`

Tables:

- `agentsam_scripts` — rows: `96`

## Commands and Intent Routing

Suggested dashboard surfaces:
- `/dashboard/agent`
- `/dashboard/settings/tools`
- `/dashboard/settings/rules`

Tables:

- `agentsam_command_allowlist` — rows: `155`
- `agentsam_command_pattern` — rows: `10`
- `agentsam_commands` — rows: `372`
- `agentsam_slash_commands` — rows: `22`

## Agent Execution

Suggested dashboard surfaces:
- `/dashboard/agent`
- `/dashboard/overview`
- `/dashboard/health`

Tables:

- `agentsam_agent_run` — rows: `312`
- `agentsam_command_run` — rows: `69`
- `agentsam_compaction_events` — rows: `0`
- `agentsam_cron_runs` — rows: `156`
- `agentsam_escalation` — rows: `0`
- `agentsam_eval_runs` — rows: `12`
- `agentsam_execution_context` — rows: `59`
- `agentsam_executions` — rows: `12`
- `agentsam_hook_execution` — rows: `78`
- `agentsam_mcp_tool_execution` — rows: `13`
- `agentsam_project_context` — rows: `51`
- `agentsam_script_runs` — rows: `0`
- `agentsam_tool_chain` — rows: `19`
- `agentsam_workflow_runs` — rows: `0`

## Hooks and Webhooks

Suggested dashboard surfaces:
- `/dashboard/settings/hooks`
- `/dashboard/settings/integrations`

Tables:

- `agentsam_hook` — rows: `14`
- `agentsam_webhook_events` — rows: `1277`
- `agentsam_webhook_weekly` — rows: `1`

## MCP Tools, Servers, and Tool Logs

Suggested dashboard surfaces:
- `/dashboard/mcp`
- `/dashboard/settings/tools`

Tables:

- `agentsam_mcp_allowlist` — rows: `412`
- `agentsam_mcp_servers` — rows: `3`
- `agentsam_mcp_tools` — rows: `392`
- `agentsam_mcp_workflows` — rows: `86`
- `agentsam_tool_call_log` — rows: `18`
- `agentsam_tool_stats_compacted` — rows: `74`
- `agentsam_tools` — rows: `40`

## Memory, Skills, Rules, and Ignore Patterns

Suggested dashboard surfaces:
- `/dashboard/settings/rules`
- `/dashboard/agent`

Tables:

- `agentsam_ignore_pattern` — rows: `10`
- `agentsam_memory` — rows: `80`
- `agentsam_rules_document` — rows: `4`
- `agentsam_skill` — rows: `47`
- `agentsam_skill_invocation` — rows: `303`
- `agentsam_skill_revision` — rows: `7`

## AI Models, Routing, Prompts, and Evals

Suggested dashboard surfaces:
- `/dashboard/settings/ai-models`
- `/dashboard/agent`

Tables:

- `agentsam_ai` — rows: `112`
- `agentsam_eval_cases` — rows: `12`
- `agentsam_eval_suites` — rows: `8`
- `agentsam_fetch_domain_allowlist` — rows: `18`
- `agentsam_guardrail_events` — rows: `0`
- `agentsam_guardrail_rulesets` — rows: `2`
- `agentsam_guardrails` — rows: `13`
- `agentsam_health_daily` — rows: `3`
- `agentsam_model_drift_signals` — rows: `3`
- `agentsam_model_tier` — rows: `5`
- `agentsam_prompt_cache_keys` — rows: `0`
- `agentsam_prompt_versions` — rows: `11`
- `agentsam_routing_arms` — rows: `57`
- `agentsam_usage_rollups_daily` — rows: `26`

## Observability, Analytics, Health, and Errors

Suggested dashboard surfaces:
- `/dashboard/overview`
- `/dashboard/health`
- `/dashboard/analytics`

Tables:

- `agentsam_analytics` — rows: `3`
- `agentsam_deployment_health` — rows: `7`
- `agentsam_error_log` — rows: `1`
- `agentsam_task_slos` — rows: `3`
- `agentsam_usage_events` — rows: `393`

## Other agentsam_* Tables

Suggested dashboard surfaces:
- `/dashboard/settings/docs`

Tables:

- `agentsam_artifacts` — rows: `3`

## Security, Guardrails, Policy, and Approvals

Suggested dashboard surfaces:
- `/dashboard/settings/security`
- `/dashboard/settings/rules`

Tables:

- `agentsam_approval_queue` — rows: `2`
- `agentsam_browser_trusted_origin` — rows: `10`
- `agentsam_user_feature_override` — rows: `0`
- `agentsam_user_policy` — rows: `4`

## Settings, Feature Flags, and Jobs

Suggested dashboard surfaces:
- `/dashboard/settings/general`
- `/dashboard/settings/tools`

Tables:

- `agentsam_cad_jobs` — rows: `2`
- `agentsam_code_index_job` — rows: `8`
- `agentsam_feature_flag` — rows: `13`
- `agentsam_subscription_registry` — rows: `16`

## Workflows, Plans, Tasks, and Todos

Suggested dashboard surfaces:
- `/dashboard/agent`
- `/dashboard/overview`

Tables:

- `agentsam_plan_tasks` — rows: `75`
- `agentsam_plans` — rows: `13`
- `agentsam_todo` — rows: `75`

## Workspaces, Projects, and Subagents

Suggested dashboard surfaces:
- `/dashboard/settings/workspace`
- `/dashboard/agent`

Tables:

- `agentsam_bootstrap` — rows: `12`
- `agentsam_subagent_profile` — rows: `41`
- `agentsam_workspace` — rows: `24`
- `agentsam_workspace_state` — rows: `6`

