# AGENTSAM_CLOUDCODEMODE_TOOLSET

Review status: proposal for review, not runtime policy yet.

Purpose: shrink Agent Sam's visible tool surface, reduce model confusion, and make Cloudflare/D1/R2/code work more reliable without adding new tables or creating a second runtime.

## Core operating law

Agent Sam should have one runtime contract.

- `inneranimalmedia` is the main platform runtime.
- `inneranimalmedia-mcp-server` is the external MCP doorway for ChatGPT, Claude, Cursor, and future teammate clients.
- The main app should not depend on the MCP server for in-app execution.
- The MCP server should not become a second full Agent Sam runtime.
- `agentsam_tools` remains the canonical tool contract table.
- Existing policy/allowlist/telemetry tables should be refined before adding any new tables.

Preferred path:

```text
ChatGPT / Claude / Cursor
  -> inneranimalmedia-mcp-server
  -> auth + tools/list + risk/approval/scope
  -> direct simple tools when safe
  -> main inneranimalmedia runtime when full app context/bindings are needed
```

In-app path:

```text
inneranimalmedia dashboard
  -> Agent Sam lane/mode
  -> src/core/catalog-tool-executor.js
  -> D1 / R2 / GitHub / Terminal / Browser / AI / Memory
```

Avoid:

```text
inneranimalmedia dashboard -> inneranimalmedia-mcp-server -> inneranimalmedia dashboard/runtime
```

That circular path adds latency and failure points.

## Why this exists

The current system can expose too many semi-overlapping tools. That creates loops like:

```text
tool surface too large
  -> model chooses wrong/nearby tool
  -> tool fails with auth/schema/runtime issue
  -> model retries another tool
  -> more calls, more tokens, more cost
```

The fix is not more tools. The fix is fewer visible tools, stricter contracts, clearer grouping, and better use of existing telemetry.

## No-new-table constraint

Use existing structures first:

- `agentsam_tools`
- `agentsam_mcp_tools`
- `agentsam_mcp_servers`
- `agentsam_mcp_oauth_tool_allowlist`
- `agentsam_capability_aliases`
- `agentsam_prompt_routes`
- `agentsam_tool_call_log`
- `agentsam_tool_chain`
- `agentsam_tool_cache`
- `agentsam_error_log`
- `agentsam_performance_eto_events`
- approval / guardrail tables already present

If a table already represents tool identity, external exposure, route templates, telemetry, or policy, refine that table's data and queries before creating another table.

## Public tool surface targets

Default external MCP surface should be compact.

Recommended caps:

```text
ChatGPT default: 12-16 tools
Claude default: 12-20 tools
Cursor/dev: 20-32 tools
Owner/admin expanded: only when explicitly requested, still approval-gated
```

A tool exposed in `tools/list` must be callable. If it is not reliably callable, set existing fields such as:

```text
expose_on_connector = 0
is_degraded = 1
connector_priority = higher/lower as needed
requires_approval = 1 for risky actions
risk_level = low | medium | high | critical
```

## CloudCodeMode default toolset

This is the proposed default external development toolset. Names can be mapped to existing internal tool keys with `runtime_contract_key`, aliases, or existing catalog rows.

### Core orientation

Always visible.

```text
agentsam_health_check
agentsam_workspace_context
agentsam_search_tools
agentsam_plan
agentsam_recent_errors
agentsam_tool_diagnose
```

Purpose:

- prove auth/workspace
- load workspace/tenant/project context
- search hidden tools without exposing all schemas
- plan work before executing
- diagnose broken catalog/tool rows

### Code lane

Visible for Cursor/dev and code tasks.

```text
agentsam_code_search
agentsam_code_read
agentsam_code_diff
agentsam_code_patch_plan
```

Internal routes may use GitHub, filesystem, repo search, active-file context, or main app runtime.

Write operations should not be default-visible unless approval-gated:

```text
agentsam_code_apply_patch
agentsam_github_create_pr
```

### Database lane

Default external DB tools should be read-first.

```text
agentsam_db_schema
agentsam_db_query_readonly
agentsam_db_explain
```

Approval-gated / owner-only:

```text
agentsam_db_write
agentsam_migration_apply
```

Rule: DB write/migration actions require approval and should return a plan/diff before execution.

### R2 / storage lane

Do not create one tool per bucket.

Use generic bucket + key tools:

```text
agentsam_r2_read
agentsam_r2_write
agentsam_r2_delete
agentsam_r2_upload_knowledge
```

Recommended contract:

```json
{
  "bucket": "string",
  "key": "string",
  "content": "string optional for writes",
  "file_ref": "string optional for writes",
  "content_type": "string optional",
  "workspace_id": "string optional; must match auth context when provided",
  "dry_run": true
}
```

Policy decides if a workspace/user may touch a bucket/path.

R2 action rules:

```text
read = low risk if bucket/path policy allows
write to knowledge/staging = medium risk or auto-allowed only under strict policy
delete = high risk, approval required
production static/dashboard/site paths = approval required
```

Avoid exposing unsupported list/search tools as default. If object listing is not supported in the chosen Wrangler/agent path, keep `r2_list`, `agentsam_r2_list`, and `r2_search` hidden/degraded.

### Terminal / Wrangler lane

Visible mainly for Cursor/dev/owner.

```text
agentsam_terminal_plan
agentsam_run_safe_command
agentsam_wrangler_status
agentsam_deploy_check
```

Owner/approval-gated:

```text
agentsam_run_command
agentsam_deploy_worker
agentsam_r2_mutate_prod
agentsam_d1_migration_apply
```

Rule: terminal tools should prefer prepared command templates, dry-runs, and explicit approval over raw shell access.

### Memory lane

Keep small and stable.

```text
agentsam_memory_search
agentsam_memory_save
```

Important distinction:

```text
agentsam_memory_save = managed operational memory / policy / state / decision / project / skill / preference / error / fact
agentsam_memory_write = semantic/vector/RAG lane only, not default operational memory
```

Default external clients should not see both unless the difference is obvious in descriptions.

### Browser/UI lane

Only expose when inspecting UI.

```text
agentsam_browser_screenshot
agentsam_browser_inspect
agentsam_browser_console
```

Do not include browser tools in default non-UI toolsets.

### Research/docs lane

Useful, but should not crowd dev/default tools.

```text
agentsam_knowledge_search
agentsam_docs_fetch
agentsam_cloudflare_docs_search
```

For current Cloudflare/Wrangler commands, prefer web/doc retrieval before relying on stale memory.

## Tool grouping policy

Do not expose the whole catalog to every model.

Use modes/lanes:

```text
core
code
database
storage
terminal
memory
browser
research
admin
```

External clients should get a small default surface and use `agentsam_search_tools` to find hidden tools when needed.

Example:

```text
User asks about R2 upload
  -> visible tools include agentsam_search_tools and agentsam_r2_upload_knowledge
  -> hidden generic r2_write can be returned only if relevant and permitted
```

## Direct MCP execution vs main runtime execution

Direct execution in `inneranimalmedia-mcp-server` is okay when the MCP Worker has the binding, policy, and simple deterministic behavior.

Good direct candidates:

```text
health_check
tools/list
tools/search
workspace_context
simple db schema/read diagnostics
simple r2 read/write if binding and policy are identical
memory search/save only if same managed memory lane is available
```

Proxy or delegate to main app runtime when full platform context is needed:

```text
browser / MYBROWSER
PTY / terminal sessions
workflow runs
dashboard/session operations
complex GitHub writes
production deploys
production R2 writes
data-plane operations needing dashboard auth context
```

The point is one runtime contract, not forcing every call through two Workers.

## Normalized tool result envelope

Every tool should return a predictable shape:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "user_message": "short human-readable result",
  "next_action": "optional recommended next step",
  "diagnostic": {
    "tool_key": "agentsam_db_schema",
    "handler_type": "d1",
    "execution_mode": "direct_mcp | main_runtime | blocked",
    "policy_decision": "allowed | approval_required | denied",
    "duration_ms": 123
  }
}
```

Failed tools should clearly distinguish:

```text
auth_failed
insufficient_scope
approval_required
schema_invalid
handler_config_invalid
missing_binding
unsupported_operation
policy_denied
runtime_error
```

Vague failures cause retry loops and AI spend.

## R2 command reality check

Current safe Agent Sam design should assume explicit bucket + key object operations:

```bash
npx wrangler r2 object put <bucket>/<key> --file <local-file>
npx wrangler r2 object get <bucket>/<key> --file <local-file>
npx wrangler r2 object delete <bucket>/<key>
```

Use current Cloudflare docs before hardcoding any Wrangler command. The repo rule already says Wrangler command knowledge can become stale and should be retrieved before finalizing commands.

## D1 command patterns

Production pattern used in this repo:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "SELECT 1"
```

File apply pattern:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file ./migrations/XXX_name.sql
```

Migration apply pattern:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 migrations apply inneranimalmedia-business --remote -c wrangler.production.toml
```

## Existing-field cleanup strategy

Use current fields to shape the external surface:

```text
agentsam_tools.is_degraded
agentsam_tools.is_active
agentsam_tools.risk_level
agentsam_tools.requires_approval
agentsam_tools.tool_category
agentsam_tools.handler_type
agentsam_tools.handler_config
agentsam_tools.workspace_scope
agentsam_mcp_oauth_tool_allowlist.expose_on_connector
agentsam_mcp_oauth_tool_allowlist.connector_priority
agentsam_mcp_oauth_tool_allowlist.access_class
agentsam_mcp_oauth_tool_allowlist.runtime_contract_key
```

Recommended review classifications:

```text
KEEP_DEFAULT
KEEP_CURSOR_DEV
KEEP_OWNER_ONLY
HIDE_UNTIL_SEARCHED
APPROVAL_ONLY
DEGRADE_BROKEN
DEPRECATED_ALIAS
```

## First audit queries to run tomorrow

### Exposed external tools

```sql
SELECT
  a.client_id,
  a.tool_key,
  COALESCE(NULLIF(trim(a.runtime_contract_key), ''), a.tool_key) AS runtime_contract_key,
  a.access_class,
  a.expose_on_connector,
  a.connector_priority,
  t.handler_type,
  t.tool_category,
  t.risk_level,
  t.requires_approval,
  t.is_degraded,
  substr(t.handler_config, 1, 180) AS config_preview
FROM agentsam_mcp_oauth_tool_allowlist a
LEFT JOIN agentsam_tools t
  ON lower(t.tool_key) = lower(COALESCE(NULLIF(trim(a.runtime_contract_key), ''), a.tool_key))
WHERE COALESCE(a.is_active, 1) = 1
ORDER BY a.client_id, COALESCE(a.connector_priority, 999), a.tool_key;
```

### Allowlist rows with missing catalog targets

```sql
SELECT
  a.client_id,
  a.tool_key,
  a.runtime_contract_key,
  a.access_class,
  a.expose_on_connector
FROM agentsam_mcp_oauth_tool_allowlist a
LEFT JOIN agentsam_tools t
  ON lower(t.tool_key) = lower(COALESCE(NULLIF(trim(a.runtime_contract_key), ''), a.tool_key))
WHERE COALESCE(a.is_active, 1) = 1
  AND t.tool_key IS NULL
ORDER BY a.client_id, a.tool_key;
```

### Tools visible but likely not callable

```sql
SELECT
  tool_key,
  display_name,
  tool_category,
  handler_type,
  risk_level,
  requires_approval,
  is_degraded,
  substr(handler_config, 1, 220) AS config_preview
FROM agentsam_tools
WHERE COALESCE(is_active, 1) = 1
  AND (
    handler_config IS NULL
    OR trim(handler_config) = ''
    OR trim(handler_config) = '{}'
  )
ORDER BY tool_category, handler_type, tool_key;
```

### Cost/noise query

```sql
SELECT
  tool_key,
  COUNT(*) AS calls,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
  ROUND(AVG(duration_ms), 1) AS avg_ms,
  ROUND(SUM(COALESCE(cost_usd, 0)), 6) AS cost_usd
FROM agentsam_tool_call_log
WHERE datetime(created_at) >= datetime('now', '-7 days')
GROUP BY tool_key
ORDER BY cost_usd DESC, errors DESC, calls DESC;
```

## Success criteria

The CloudCodeMode toolset is working when:

```text
ChatGPT sees <= 16 high-confidence tools by default.
Cursor sees <= 32 dev tools by default.
Every listed tool is callable or intentionally approval-gated.
R2 works with generic bucket+key tools, not one tool per bucket.
D1 read tools are fast and cached.
Write/deploy/delete tools require approval.
Errors explain exactly what failed.
Tool call logs show fewer retries and fewer wrong-tool attempts.
```

## Final review note

This proposal intentionally favors boring reliability over cleverness.

Agent Sam should not impress models with a huge toolbox. It should give them the smallest set of dependable levers needed to do the job.
