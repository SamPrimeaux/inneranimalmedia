# Frontend ↔ Backend Gap Analysis (agentsam_*)
> `scripts/d1_schema_audit.py` — 2026-05-07 04:43 UTC

## Legend
- ✅ Table exists in D1
- ❌ Table MISSING — needs migration or name check
- 🔲 Endpoint — verify in `src/api/` + `worker.js`

---

## `/dashboard/agent`
**Agent Sam chat, Monaco editor, GitHub panel**

### Tables

- ✅ `agentsam_agent_run`
- ✅ `agentsam_tool_chain`
- ✅ `agentsam_execution_context`
- ✅ `agentsam_workspace_state`
- ✅ `agentsam_memory`
- ✅ `agentsam_compaction_events`
- ✅ `agentsam_command_run`
- ✅ `agentsam_commands`
- ✅ `agentsam_slash_commands`

### Endpoints

- 🔲 `POST /api/agent/chat (SSE)`
- 🔲 `GET /api/agent/history`
- 🔲 `GET /api/agent/workspace-state`
- 🔲 `PUT /api/agent/workspace-state`

---

## `/dashboard/health`
**System health, deployment checks, cron runs, error log**

### Tables

- ✅ `agentsam_deployment_health`
- ✅ `agentsam_health_daily`
- ✅ `agentsam_error_log`
- ✅ `agentsam_cron_runs`

### Endpoints

- 🔲 `GET /api/health/status`
- 🔲 `GET /api/health/deployments`
- 🔲 `GET /api/health/errors`
- 🔲 `GET /api/health/crons`

---

## `/dashboard/mcp`
**MCP cloud agents — 4-agent parallel workspaces**

### Tables

- ✅ `agentsam_subagent_profile`
- ✅ `agentsam_workspace`
- ✅ `agentsam_workspace_state`
- ✅ `agentsam_mcp_allowlist`
- ✅ `agentsam_mcp_tools`
- ✅ `agentsam_mcp_servers`
- ✅ `agentsam_mcp_workflows`
- ✅ `agentsam_workflow_runs`
- ✅ `agentsam_tool_chain`
- ✅ `agentsam_agent_run`
- ✅ `agentsam_approval_queue`

### Endpoints

- 🔲 `GET /api/mcp/agents`
- 🔲 `GET /api/mcp/agents/:slug`
- 🔲 `POST /api/mcp/agents/:slug/session`
- 🔲 `POST /api/mcp/agents/:slug/chat (SSE)`
- 🔲 `GET /api/mcp/agents/:slug/session/:id/tool-log`
- 🔲 `POST /api/mcp/agents/:slug/session/:id/checkpoint`

---

## `/dashboard/overview`
**Platform health summary, spend, usage rollups**

### Tables

- ✅ `agentsam_analytics`
- ✅ `agentsam_usage_rollups_daily`
- ✅ `agentsam_health_daily`
- ✅ `agentsam_deployment_health`

### Endpoints

- 🔲 `GET /api/overview/summary`
- 🔲 `GET /api/overview/spend`
- 🔲 `GET /api/overview/health`

---

## `/dashboard/settings/agents`
**Subagent profiles, skills, rules, tool allowlists**

### Tables

- ✅ `agentsam_subagent_profile`
- ✅ `agentsam_skill`
- ✅ `agentsam_skill_revision`
- ✅ `agentsam_skill_invocation`
- ✅ `agentsam_rules_document`
- ✅ `agentsam_mcp_allowlist`
- ✅ `agentsam_command_allowlist`
- ✅ `agentsam_user_policy`

### Endpoints

- 🔲 `GET /api/settings/agents`
- 🔲 `POST /api/settings/agents`
- 🔲 `PUT /api/settings/agents/:id`
- 🔲 `GET /api/settings/agents/:id/skills`
- 🔲 `GET /api/settings/agents/:id/tools`

---

## `/dashboard/settings/ai-models`
**AI model catalog, pricing, routing arms, model tiers**

### Tables

- ✅ `agentsam_ai`
- ✅ `agentsam_routing_arms`
- ✅ `agentsam_model_tier`
- ✅ `agentsam_model_drift_signals`
- ✅ `agentsam_eval_suites`
- ✅ `agentsam_eval_cases`
- ✅ `agentsam_eval_runs`

### Endpoints

- 🔲 `GET /api/settings/ai-models`
- 🔲 `POST /api/settings/ai-models`
- 🔲 `PUT /api/settings/ai-models/:id`
- 🔲 `GET /api/settings/ai-models/routing-arms`
- 🔲 `GET /api/settings/ai-models/tiers`

---

## `/dashboard/settings/cicd`
**CI/CD — script catalog, run history, deploy health**

### Tables

- ✅ `agentsam_scripts`
- ✅ `agentsam_script_runs`
- ✅ `agentsam_deployment_health`
- ✅ `agentsam_cron_runs`

### Endpoints

- 🔲 `GET /api/settings/cicd/scripts`
- 🔲 `POST /api/settings/cicd/scripts/:id/run`
- 🔲 `GET /api/settings/cicd/runs`

---

## `/dashboard/settings/github`
**GitHub webhook events, deploy tracking**

### Tables

- ✅ `agentsam_webhook_events`
- ✅ `agentsam_script_runs`
- ✅ `agentsam_scripts`

### Endpoints

- 🔲 `GET /api/settings/github/webhooks`
- 🔲 `GET /api/settings/github/deployments`

---

## `/dashboard/settings/hooks`
**Webhooks, hook executions, webhook events**

### Tables

- ✅ `agentsam_hook`
- ✅ `agentsam_hook_execution`
- ✅ `agentsam_webhook_events`
- ✅ `agentsam_webhook_weekly`

### Endpoints

- 🔲 `GET /api/settings/hooks`
- 🔲 `POST /api/settings/hooks`
- 🔲 `PUT /api/settings/hooks/:id`
- 🔲 `DEL /api/settings/hooks/:id`
- 🔲 `GET /api/settings/hooks/:id/executions`

---

## `/dashboard/settings/notifications`
**Escalation config, hook triggers, notification policy**

### Tables

- ✅ `agentsam_escalation`
- ✅ `agentsam_hook`
- ✅ `agentsam_user_policy`

### Endpoints

- 🔲 `GET /api/settings/notifications`
- 🔲 `PUT /api/settings/notifications`

---

## `/dashboard/settings/rules`
**Rules docs, guardrails, rulesets, command patterns**

### Tables

- ✅ `agentsam_rules_document`
- ✅ `agentsam_guardrails`
- ✅ `agentsam_guardrail_rulesets`
- ✅ `agentsam_guardrail_events`
- ✅ `agentsam_command_pattern`

### Endpoints

- 🔲 `GET /api/settings/rules`
- 🔲 `POST /api/settings/rules`
- 🔲 `PUT /api/settings/rules/:id`
- 🔲 `GET /api/settings/guardrails`
- 🔲 `POST /api/settings/guardrails`

---

## `/dashboard/settings/security`
**Security scan, trusted origins, domain allowlist**

### Tables

- ✅ `agentsam_browser_trusted_origin`
- ✅ `agentsam_fetch_domain_allowlist`
- ✅ `agentsam_guardrail_events`
- ✅ `agentsam_error_log`
- ✅ `agentsam_user_policy`

### Endpoints

- 🔲 `GET /api/settings/security/scan`
- 🔲 `GET /api/settings/security/trusted-origins`
- 🔲 `POST /api/settings/security/trusted-origins`
- 🔲 `GET /api/settings/security/domain-allowlist`

---

## `/dashboard/settings/tools`
**MCP tool registry, server config, tool stats**

### Tables

- ✅ `agentsam_tools`
- ✅ `agentsam_mcp_tools`
- ✅ `agentsam_mcp_servers`
- ✅ `agentsam_mcp_allowlist`
- ✅ `agentsam_tool_stats_compacted`
- ✅ `agentsam_tool_call_log`

### Endpoints

- 🔲 `GET /api/settings/tools`
- 🔲 `PUT /api/settings/tools/:id/toggle`
- 🔲 `GET /api/settings/tools/stats`
- 🔲 `GET /api/settings/mcp-servers`
- 🔲 `POST /api/settings/mcp-servers`

---

## `/dashboard/settings/workspace`
**Workspace config, bootstrap, project context, feature flags**

### Tables

- ✅ `agentsam_workspace`
- ✅ `agentsam_workspace_state`
- ✅ `agentsam_bootstrap`
- ✅ `agentsam_project_context`
- ✅ `agentsam_feature_flag`
- ✅ `agentsam_user_feature_override`

### Endpoints

- 🔲 `GET /api/settings/workspace`
- 🔲 `PUT /api/settings/workspace`
- 🔲 `GET /api/settings/workspace/projects`
- 🔲 `GET /api/settings/feature-flags`

---

## Unmapped agentsam_* Tables

Exist in D1 but not assigned to any dashboard route.

- `agentsam_artifacts`
- `agentsam_cad_jobs`
- `agentsam_code_index_job`
- `agentsam_executions`
- `agentsam_ignore_pattern`
- `agentsam_mcp_tool_execution`
- `agentsam_plan_tasks`
- `agentsam_plans`
- `agentsam_prompt_cache_keys`
- `agentsam_prompt_versions`
- `agentsam_subscription_registry`
- `agentsam_task_slos`
- `agentsam_todo`
- `agentsam_usage_events`
