# Agent Sam Workstation — Master Plan (Steps A–E + Deliverables)

**Goal:** Turn `/dashboard/agent` into a full-control “Agent Sam Workstation” with:
- Role/capability-gated tools
- Command registry + MCP services registry
- Audited read/write/deploy
- Safe defaults (deny-by-default, staged writes)
- Multi-provider AI routing (OpenAI/Anthropic/Workers AI/Gemini/Vertex etc.)

---

## STEP A — Inventory (code + DB)

### 1) Worker codebase search results

| Search term | Where used |
|-------------|------------|
| **agent_ai_sam** | `getAgentContextFromD1()`: SELECT id, name, role_name, mode, description for system context. `/api/agent/models`: SELECT id, name, role_name, mode, description, cost_policy_json for UI model list. |
| **agent_roles** | Not referenced in worker route handlers. Table exists in D1. |
| **agent_capabilities** | `getAgentContextFromD1()`: SELECT DISTINCT capability_key for system context. No runtime gating; capabilities are injected into prompt only. |
| **agent_commands** | `getAgentContextFromD1()`: SELECT id, name, slug, description, category (limit 10) for system context. No endpoint that lists or executes by command_key. |
| **mcp_services** | GET `/api/mcp/services`, `/api/mcp/summary`, `/api/mcp/health`. Read-only; no CRUD in agent routes. |
| **tool / tools / capability / permissions** | capability_key list in context. No tool_permissions_json used for gating in agent routes. |
| **/api/agent/** | See Deliverable 1 table below. |

### 2) Map of /api/agent/* endpoints (method, auth, inputs, outputs, tables)

| Endpoint | Method | Auth | Inputs | Outputs | Tables touched |
|----------|--------|------|--------|---------|----------------|
| `/api/agent/generate-image` | POST | None | prompt, size, quality | ok, url, revised_prompt, provider, cost_usd | spend_ledger |
| `/api/agent/generate-video` | POST | None | prompt, duration, resolution | ok, video_url, status | spend_ledger |
| `/api/agent/preview-compile` | POST | None | code, type | ok, html | — |
| `/api/agent/context` | GET | None | — | context (time_utc, tenant_id, current_page, etc.) | deployments, spend_ledger, kanban_cards |
| `/api/agent/sync-context` | POST | — | — | 501 NOT_READY | — |
| `/api/agent/runs` | GET | None | mode, limit | runs[] | agent_runs |
| `/api/agent/run` | POST | — | — | — | — |
| `/api/agent/workspace-config` | GET | None | — | brief, modes, capabilities, rules from settings | settings (agent.*) |
| `/api/agent/models` | GET | None | — | total, models[] | agent_ai_sam |
| `/api/agent/context-refs` | GET | **Session** | — | boards[], projects[] | kanban_boards, time_projects |
| `/api/agent/usage-log` | POST | Optional session | model, tokens_input, tokens_output, cost_usd, task_type | ok | agent_costs |
| `/api/agent/usage-stats` | GET | **Session** | days | daily, byTaskType, byModel, totalCost | agent_costs |
| `/api/agent/db-schema` | GET | **Session** | — | tables, relationships, indexes | sqlite_master, PRAGMA |
| `/api/agent/db-table-count` | GET | **Session** | — | table_count | sqlite_master |
| `/api/agent/db-context` | GET | **Session** | — | database, tables, rowCount | sqlite_master, PRAGMA |
| `/api/agent/conversations` | GET | **Session** | — | conversations[] | agent_conversations |
| `/api/agent/conversations/:id` | GET | **Session** | id (path) | conversation + messages[] | agent_conversations, agent_messages |
| `/api/agent/chat` | POST | **Session** | messages[], conversation_id?, model_id?, prefer_provider?, ... | ok, conversation_id, message, usage | agent_conversations, agent_messages, agent_telemetry, spend_ledger |
| `/api/agent/run-sql` | POST | **Session** | query | ok, results or meta, changes | DB (direct) |
| `/api/agent/execute-request` | POST | **Session** | url, method?, headers?, body?, useSecret? | ok, status, body | — (external fetch) |
| `/api/agent/upload-attachment` | POST | None | multipart file | ok, url, key | R2 (DASHBOARD) |
| `/api/agent/save-draft` | POST | None | content, filename? | ok, url, key | R2 (DASHBOARD) |

---

## STEP B — Agent Sam model/config + table summaries

### agent_ai_sam

- **Schema:** id, tenant_id, is_global, name, role_name, description, status, mode, safety_level, tenant_scope, allowed/blocked_tenants_json, auth_strategy, required_roles_json, requires_human_approval, approvals_policy_json, integrations_json, mcp_services_json, tool_permissions_json, rate_limits_json, budgets_json, model_policy_json, cost_policy_json, pii_policy_json, security_policy_json, telemetry_enabled, telemetry_policy_json, last_health_check, last_run_at, last_error, config_version, config_hash, notes, created_by, created_at, updated_at, user_email, additional_alert_emails_json, owner_user_id, backup_user_email, alert_escalation_email, memory_policy_json, total_runs, total_cost_usd, avg_response_ms, success_rate. Optional: **provider** (migration 063).
- **Runtime use:** `getAgentContextFromD1()` reads id, name, role_name, mode, description. GET `/api/agent/models` reads id, name, role_name, mode, description, cost_policy_json. No per-request lookup by model_id in chat; model_id is passed as a string to fallback (no id→provider mapping).
- **Model selection today:** By `prefer_provider` (workers_ai, openai, anthropic, gemini, cursor). Default is Anthropic. No mapping from agent_ai_sam.id to (provider, model).
- **Missing for multi-provider:** (1) Map agent_ai_sam.id → provider + model (column or JSON). (2) In chat, resolve body.model_id via agent_ai_sam and pass (provider, model) to runAgentChatWithFallback. (3) Vertex/other providers in runAgentChatWithFallback. (4) Use model_policy_json / budgets_json for routing and limits.

### Other AI/agent tables — plain-English summaries and improvements

| Table | What it is | Suggested implementation / improvement |
|-------|------------|----------------------------------------|
| **ai_prompts_library** | Reusable prompt templates (name, category, prompt_template, variables_json, tool_role, stage). | Use as single source for system/stage prompts. Wire workspace-config or chat to pull by category/stage; support variable substitution from session/workspace. |
| **ai_services** | Registry of AI services per tenant (name, provider, type, status, config_json, usage_count). | Drive provider list and “which service can do what.” Sync with agent_ai_sam and ai_models; add “lane” (e.g. general, sql, deploy) for routing. |
| **ai_tool_roles** | Tool-centric role descriptions (tool_name, role_description, responsibilities_json, strengths/limitations, preferred_stages). | Use for prompt-building. Link to governance capability keys so tool_roles only appear if user has the capability. |
| **ai_project_context_config** | (Empty.) Per-route or per-project context. | Seed one row per key dashboard route (/dashboard/agent, /dashboard/meauxsql) with context_json describing tools and scope. Use in chat to inject route-specific context. |
| **ai_models** | Provider + model_key + display_name, context limits, supports_cache, supports_tools. | Add missing models (latest Claude, GPT-4o, Gemini, Workers AI). Add column or JSON for “allowed_for_roles” or “lane” so model_policies can reference it. |
| **ai_model_policies** | Per-tenant default_provider, default_lane, policy_json. | Define policy_json: e.g. lanes (general, sql), max_tokens, budget_per_day_usd. Use in chat to choose provider/model and enforce limits. |
| **ai_guardrails** | Name, slug, rules, validations, scope/scope_id. | Before running a command/tool, evaluate rules. Add “phase” (before_chat, before_tool, after_tool) and call from middleware. |
| **ai_knowledge_base** | Tenant-scoped docs (title, content, content_type, category, source_url). | Use for RAG. Index into Vectorize or vector table; add last_updated; only surface when capability allows. |
| **agent_telemetry** | Fine-grained usage (provider, model_used, tokens, agent_email, metadata_json). | Add workspace_id/tenant_id; add optional command_key when call is for a tool so you can join to audit_log. |
| **agent_recipe_prompts** | Pre-built recipes (name, slug, prompt_text, parameters_json, category). | Use as templates in agent UI; tag with required_capability_key so only allowed capabilities see them. |
| **agent_prompts** | Versioned prompts by role (role_id, prompt_kind, version, title, content, status). | Override system prompt per agent_roles. When resolving role from session, load agent_prompts for that role. |
| **agent_policy_templates** | Mode/tier templates (tool_permissions_json, rate_limits_json, budgets_json, model_policy_json). | Default policies for new agent_ai_sam rows or lanes. Add governance_role_id so each template maps to OWNER_ADMIN vs READ_ONLY. |
| **agent_platform_context** | Key-value context per agent (agent_id, memory_key, memory_value, category). | Persist “last used bucket,” “last project.” Scope by workspace_id; TTL or max keys per agent to avoid bloat. |
| **agent_messages** | One row per message (conversation_id, role, content, provider, file_url, created_at, message_type, metadata_json). | **Risk:** DB grows unbounded. **Options:** (1) **Summarize + archive:** After N messages, summarize convo into agent_conversations.summary_json, move/delete to agent_messages_archive. (2) **Cap + rotate:** Keep last K messages in D1; older in R2/archive. (3) **Lazy load:** Store message_ids in D1; full content in R2 keyed by conversation_id + message_id; fetch when loading thread. (4) **Tiered:** Last 7 days in D1, older in R2; agent_chat reads/writes D1 only. |

---

## STEP C — Governance layer (deny-by-default)

### Minimal schema

- **governance_roles** — role_id (PK), role_name, description.
- **governance_capabilities** — capability_id (PK), key (UNIQUE), description, risk_level.
- **role_capabilities** — role_id, capability_key; PK(role_id, capability_key).
- **user_governance_roles** — user_id, role_id, workspace_id ('' = all), tenant_id ('' = all); PK(user_id, role_id, workspace_id, tenant_id).
- **agent_commands** (extend) — Add: command_key (UNIQUE), required_capability_key, handler, validation_schema_json.
- **mcp_services** (extend) — Add: service_key (UNIQUE), allowed_commands (TEXT/JSON array).

### Defaults

- **Default role for you (e.g. sam_primeaux@icloud.com):** OWNER_ADMIN (full capabilities).
- **Default role for everyone else:** READ_ONLY (D1_QUERY, R2_READ, AGENT_CHAT; no R2 write, no deploy).
- **Workspace/tenant scope:** Resolve workspace_id and tenant_id from session; check user’s role for that scope allows the capability.

### Capability keys (examples)

R2_READ, R2_WRITE_STAGED, R2_WRITE_DIRECT | D1_QUERY, D1_WRITE, D1_MIGRATE_STAGED | DEPLOY, SECRETS_READ, SECRETS_ROTATE | AGENT_CHAT, AGENT_IMAGE, AGENT_VIDEO.

---

## STEP D — Session + capability everywhere

- **getSession() REQUIRED** for every `/api/agent/*` route. Return 401 if no session.
- **requireCapability(session, capability_key, { workspace_id?, tenant_id? })** — Resolve roles from user_governance_roles for scope; if any role has the capability (role_capabilities), allow; else 403.
- **agent_command_audit_log** — One row per tool/command: timestamp, user_id, workspace_id, tenant_id, command_key, target, result, result_json, cost, error_text, request_id.

---

## STEP E — Tool execution architecture

1. **Chat response:** assistant_message + actions[]: `[{ type: "command", command_key: "r2.write", args: {...}, dry_run: true, change_set_id: "cs_xxx" }]`.
2. **UI:** Action cards; user clicks Apply/Execute (or Reject). On Apply: POST `/api/agent/execute-action` with change_set_id, action_index, execute: true.
3. **Server:** Resolve command_key → agent_commands → required_capability_key; requireCapability(session, key). If dry_run/staged: append to change_set_items, return preview. If execute: run handler, write to change_set_items and agent_command_audit_log, optionally append tool_result to conversation.
4. **Staged writes:** change_sets (id, user_id, workspace_id, conversation_id, status: draft|applied|rejected); change_set_items (id, change_set_id, command_key, args_json, dry_run, result_json, status, applied_at).

---

## Deliverable 1 — Every agent route and session enforcement today

| Route | Method | Session enforced today? |
|-------|--------|--------------------------|
| /api/agent/generate-image | POST | **No** |
| /api/agent/generate-video | POST | **No** |
| /api/agent/preview-compile | POST | **No** |
| /api/agent/context | GET | **No** |
| /api/agent/sync-context | POST | **No** (501) |
| /api/agent/runs | GET | **No** |
| /api/agent/run | POST | **No** |
| /api/agent/workspace-config | GET | **No** |
| /api/agent/models | GET | **No** |
| /api/agent/upload-attachment | POST | **No** |
| /api/agent/save-draft | POST | **No** |
| /api/agent/context-refs | GET | Yes |
| /api/agent/usage-log | POST | Optional (user_id only) |
| /api/agent/usage-stats | GET | Yes |
| /api/agent/db-schema | GET | Yes |
| /api/agent/db-table-count | GET | Yes |
| /api/agent/db-context | GET | Yes |
| /api/agent/conversations | GET | Yes |
| /api/agent/conversations/:id | GET | Yes |
| /api/agent/chat | POST | Yes |
| /api/agent/run-sql | POST | Yes |
| /api/agent/execute-request | POST | Yes |

**Summary:** 11 routes with no session; 11 with session (or optional). All must require session (no exceptions).

---

## Deliverable 2 — All agent-related tables (concise schemas)

- **agent_ai_sam** — id, tenant_id, name, role_name, mode, status, requires_human_approval, cost_policy_json, model_policy_json, tool_permissions_json, mcp_services_json, provider (optional), …
- **agent_roles** — id, name, purpose, description, agent_id, tier, scope, is_admin, is_active, …
- **agent_capabilities** — id, agent_role_id, capability_key, capability_scope, allowed_account_ids, config_json.
- **agent_commands** — id, tenant_id, name, slug, description, category, command_text, parameters_json, implementation_type, implementation_ref, status, usage_count; extend with command_key, required_capability_key, handler, validation_schema_json.
- **agent_conversations** — id, user_id, title, created_at, updated_at; optional summary_json for archive strategy.
- **agent_messages** — id, conversation_id, role, content, provider, file_url, created_at, message_type, metadata_json.
- **agent_costs** — model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at.
- **agent_telemetry** — id, tenant_id, metric_type, metric_name, metric_value, unit, timestamp, metadata_json, provider, model_used, input_tokens, output_tokens, agent_email, …
- **agent_runs** — id, mode, prompt_preview, created_at, status.
- **agent_recipe_prompts** — id, tenant_id, name, slug, prompt_text, parameters_json, category, …
- **agent_prompts** — id, role_id, prompt_kind, version, title, content, status, tenant_id, …
- **agent_policy_templates** — id, mode, tier, tool_permissions_json, rate_limits_json, budgets_json, model_policy_json, …
- **agent_platform_context** — id, agent_id, memory_key, memory_value, category, created_at, updated_at.
- **mcp_services** — id, service_name, service_type, endpoint_url, authentication_type, is_active, entity_status; extend with service_key, allowed_commands.
- **ai_prompts_library** — id, name, category, prompt_template, variables_json, tool_role, stage, …
- **ai_services** — id, tenant_id, name, provider, type, status, config_json, usage_count, …
- **ai_tool_roles** — id, tool_name, role_description, responsibilities_json, strengths_json, limitations_json, …
- **ai_project_context_config** — id, tenant_id, project_id, route_pattern, context_type, context_json, model_policy_ref, agent_sam_config_ref, version.
- **ai_models** — id, provider, model_key, display_name, context_default_tokens, context_max_tokens, supports_cache, supports_tools, …
- **ai_model_policies** — id, tenant_id, default_provider, default_lane, policy_json, …
- **ai_guardrails** — id, name, slug, rules, validations, scope, scope_id, …
- **ai_knowledge_base** — id, tenant_id, title, content, content_type, category, source_url, metadata_json, …
- **governance_roles** — role_id, role_name, description (migration 106).
- **governance_capabilities** — capability_id, key, description, risk_level (migration 106).
- **role_capabilities** — role_id, capability_key (migration 106).
- **user_governance_roles** — user_id, role_id, workspace_id, tenant_id, created_at (migration 106).
- **agent_command_audit_log** — id, timestamp, user_id, workspace_id, tenant_id, command_key, target, result, result_json, cost, error_text, request_id (migration 106).
- **change_sets** — id, user_id, workspace_id, tenant_id, conversation_id, status, created_at (migration 106).
- **change_set_items** — id, change_set_id, command_key, args_json, dry_run, result_json, status, applied_at (migration 106).

---

## Deliverable 3 — D1 migration (governance + audit + change_sets)

See **migrations/106_agent_governance_audit_changesets.sql** in this repo. Summary:

- Creates: governance_roles, governance_capabilities, role_capabilities, user_governance_roles, agent_command_audit_log, change_sets, change_set_items.
- Seeds OWNER_ADMIN and READ_ONLY; OWNER_ADMIN gets all capabilities; READ_ONLY gets R2_READ, D1_QUERY, AGENT_CHAT.
- Indexes on agent_command_audit_log (user_id, command_key, timestamp) and change_set_items(change_set_id).
- Optional ALTERs for agent_commands (command_key, required_capability_key, handler, validation_schema_json) and mcp_services (service_key, allowed_commands) after confirming existing schema.

---

## Deliverable 4 — Patch plan (worker that serves /api/agent/*)

**Where:** In the worker that handles `/api/agent/*` (e.g. dist/worker-dos.js or the source that builds it, e.g. inneranimalmedia-worker or the “dos” bundle).

1. **Single entry for /api/agent/***  
   Right after identifying the path as an agent route (`path.startsWith('/api/agent')` or equivalent), call a shared helper that (1) requires session and (2) optionally requires capability.

2. **Location**  
   At the top of the block that handles `/api/agent/*` (first `if (path === "/api/agent/...")` or a single `if (path.startsWith("/api/agent"))` branch). Before any route-specific logic:
   - Call `requireAgentSession(request, env)` → returns session or returns 401.
   - For write/execute routes, call `requireAgentCapability(env, session, capabilityKey, opts)`.

3. **New helpers**  
   - `async function requireAgentSession(request, env)` → getSession(env, request); if missing, return 401 JSON.  
   - `async function requireAgentCapability(env, session, capabilityKey, opts)` → load user_governance_roles for session.user_id and opts.workspace_id/tenant_id (or ''); load role_capabilities for those roles; if any role has capabilityKey, return; else return 403.

4. **Order of endpoint updates**  
   - **First:** chat, run-sql, execute-request — require session + capability (D1_QUERY for SELECT, D1_WRITE for writes; e.g. EXECUTE_REQUEST or DEPLOY for execute-request).  
   - **Second:** upload-attachment, save-draft — require session + R2_WRITE or R2_WRITE_STAGED.  
   - **Third:** generate-image, generate-video — require session + AGENT_IMAGE (or AGENT_MEDIA).  
   - **Fourth:** context, workspace-config, models, runs, usage-log, usage-stats, db-schema, db-table-count, db-context, conversations, context-refs — require session only (base “can use agent” implied by having a role).

5. **Default tenant**  
   Never use DEFAULT_TENANT or a privileged tenant when session is missing. All agent routes must resolve tenant_id and workspace_id from session after requireAgentSession.

---

## Deliverable 5 — Security risks

1. **Routes with default tenant / no session**  
   context, workspace-config, models, runs, generate-image, generate-video, preview-compile, upload-attachment, save-draft run without session or with optional session. **Risk:** Anonymous or forged requests can trigger spend, write to R2, or read config/models. **Mitigation:** Require session for every agent route; scope upload/draft keys by user_id or workspace_id.

2. **execute-request**  
   Allows arbitrary URL + method + optional useSecret. **Risk:** Session holder can proxy requests and use your secrets. **Mitigation:** requireCapability(session, 'EXECUTE_REQUEST' or 'DEPLOY'); allowlist URLs/hosts in policy; log every call in agent_command_audit_log with target (no query/body in log).

3. **run-sql**  
   Only session today; no capability. **Risk:** Any authenticated user can run DROP/DELETE. **Mitigation:** requireCapability(session, D1_QUERY) for SELECT; requireCapability(session, D1_WRITE) for INSERT/UPDATE/DELETE/DDL; consider D1_MIGRATE_STAGED for DDL with staged flow.

4. **Stored messages and PII**  
   agent_messages.content and agent_conversations may contain sensitive data. **Risk:** Breach or over-privileged DB access. **Mitigation:** Scope reads by user_id; consider encryption at rest or redaction in audit; limit who can query agent_messages.

5. **MCP and external services**  
   mcp_services stores endpoint_url and auth config. **Risk:** SSRF or credential abuse if MCP is called with user-controlled input. **Mitigation:** allowed_commands per service; validate command_key and args against validation_schema_json before calling MCP; do not forward raw user input to MCP without validation.

---

## Next steps

1. **Run the migration** (from repo root or ai-cli):  
   `npx wrangler d1 execute inneranimalmedia-business --remote --file=./migrations/106_agent_governance_audit_changesets.sql`

2. **Assign yourself OWNER_ADMIN:**  
   `INSERT INTO user_governance_roles (user_id, role_id, workspace_id, tenant_id) VALUES ('<your-auth-user-id>', 'OWNER_ADMIN', '', '');`

3. **In the worker:** Add requireAgentSession for all agent routes; add requireAgentCapability for write/execute routes; log tool/command runs to agent_command_audit_log.

4. **Optional:** Add POST `/api/agent/execute-action` for STEP E; extend chat response with actions[] and wire UI to action cards and change_sets.
