#!/usr/bin/env python3
"""
d1_schema_audit.py  —  agentsam_* RAG-quality schema docs
──────────────────────────────────────────────────────────
Queries all agentsam_* tables from D1, then writes chunked
markdown files into db/ — one file per logical feature group.
Each file is self-contained and RAG/agent-assistant friendly.

Output files (in OUTPUT_DIR, default: db/):
  agentsam-index.md              master table index
  agentsam-agent-execution.md   agent runs, tool chains, executions
  agentsam-commands.md           commands, patterns, slash, allowlist
  agentsam-mcp.md                MCP tools, servers, workflows
  agentsam-ai-models.md          AI model catalog, routing, evals
  agentsam-workspace.md          workspaces, bootstrap, project context
  agentsam-memory-skills.md      memory, skills, prompts
  agentsam-observability.md      analytics, telemetry, health, errors
  agentsam-workflows.md          workflow runs, plans, todos
  agentsam-security.md           guardrails, policies, trusted origins
  agentsam-hooks.md              hooks, webhooks, events
  agentsam-settings.md           feature flags, rules, ignore patterns
  agentsam-cicd.md               scripts, cron, deploy health
  agentsam-approvals.md          approval queue, escalation

Setup:
  export CF_API_TOKEN=<D1:Read token>
  export CF_ACCOUNT_ID=<account id>
  python3 scripts/d1_schema_audit.py
"""

import os, sys, json, datetime, urllib.request, urllib.error

CF_API_TOKEN   = os.environ.get("CF_API_TOKEN", "")
CF_ACCOUNT_ID  = os.environ.get("CF_ACCOUNT_ID", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
OUTPUT_DIR     = os.environ.get("OUTPUT_DIR", "db")
INCLUDE_COUNTS = os.environ.get("INCLUDE_ROW_COUNTS", "0") == "1"

API_URL = (f"https://api.cloudflare.com/client/v4/accounts"
           f"/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query")

# ── Table → feature group + human purpose annotations ─────────────────────────
# Each entry: (group_key, purpose_string, [related_tables])

TABLE_META = {
  # ── Agent execution
  "agentsam_agent_run": (
    "agent-execution",
    "One row per agent invocation. Tracks status, model used, cost, token counts, "
    "SLA breach, and timeout state. Central join point for session replay and billing rollup.",
    ["agentsam_workspace","agentsam_subagent_profile","agentsam_routing_arms",
     "agentsam_commands","agentsam_tool_chain"]),
  "agentsam_tool_chain": (
    "agent-execution",
    "Tracks every tool call within an agent run as a linked chain. Supports depth tracking "
    "for nested subagent spawns, approval gating, retry logic, and SLA enforcement per call.",
    ["agentsam_agent_run","agentsam_mcp_tools","agentsam_approval_queue"]),
  "agentsam_executions": (
    "agent-execution",
    "Records discrete execution events (file writes, commands, subagent dispatches) "
    "attached to a plan task or todo. Separate from tool_chain — captures PTY/terminal output.",
    ["agentsam_agent_run","agentsam_plan_tasks","agentsam_todo"]),
  "agentsam_execution_context": (
    "agent-execution",
    "Snapshot of the working context at the moment of a command run: cwd, open files, "
    "recent errors, goal string. Used for context injection into agent prompts.",
    ["agentsam_command_run","agentsam_todo"]),
  "agentsam_compaction_events": (
    "agent-execution",
    "Logs context window compaction events — when and how much context was summarized "
    "to stay within token limits. Tracks cost savings and compaction strategy used.",
    ["agentsam_agent_run"]),
  "agentsam_escalation": (
    "agent-execution",
    "Records model escalations: when a lower-tier model failed or lacked confidence "
    "and was escalated to a higher-tier model. Feeds routing arm adjustment logic.",
    ["agentsam_routing_arms","agentsam_agent_run"]),

  # ── Commands
  "agentsam_commands": (
    "commands",
    "Canonical command registry. Each command has a slug, risk level, routing type "
    "(tool/workflow/subagent), and mode availability. The source of truth for what "
    "Agent Sam can do.",
    ["agentsam_command_pattern","agentsam_command_allowlist","agentsam_slash_commands"]),
  "agentsam_command_run": (
    "commands",
    "Execution log for each command resolution attempt. Records how the user intent "
    "was normalized, which tier resolved it, which command was selected, and outcome.",
    ["agentsam_commands","agentsam_execution_context"]),
  "agentsam_command_pattern": (
    "commands",
    "Pattern-to-command mapping rules used by the command resolver. Supports exact, "
    "prefix, and regex match types. Powers the intent-to-command pipeline.",
    ["agentsam_commands"]),
  "agentsam_command_allowlist": (
    "commands",
    "Per-user/workspace allowlist of permitted commands. Enforced before any command "
    "executes. Separate from MCP allowlist — this gates slash/agent commands.",
    ["agentsam_commands"]),
  "agentsam_slash_commands": (
    "commands",
    "UI-facing slash command definitions shown in the command palette. Maps slugs "
    "to handler types (builtin, sql, workflow). Subset of agentsam_commands.",
    ["agentsam_commands"]),

  # ── MCP
  "agentsam_mcp_tools": (
    "mcp",
    "Full MCP tool registry. Each row is one tool with its schema, risk level, "
    "approval requirements, health state, and routing scope. Runtime tool catalog.",
    ["agentsam_mcp_servers","agentsam_mcp_allowlist","agentsam_tool_call_log"]),
  "agentsam_mcp_servers": (
    "mcp",
    "Registered MCP server endpoints. Tracks URL, auth type, health check status, "
    "avg latency, and error rate. Used to route tool calls to the correct server.",
    ["agentsam_mcp_tools"]),
  "agentsam_mcp_allowlist": (
    "mcp",
    "Per-agent/workspace MCP tool allowlist. Controls which tools each agent or "
    "user can invoke, with optional approval requirements and daily call limits.",
    ["agentsam_mcp_tools","agentsam_subagent_profile"]),
  "agentsam_mcp_tool_execution": (
    "mcp",
    "Execution record for individual MCP tool calls — input/output JSON, duration, "
    "cost, success flag. More granular than tool_call_log; includes retry count.",
    ["agentsam_mcp_tools","agentsam_tool_chain"]),
  "agentsam_mcp_workflows": (
    "mcp",
    "Workflow definitions: ordered steps, tool requirements, acceptance criteria, "
    "retry/failure policy. Reusable multi-step agent workflows triggered manually "
    "or by hooks.",
    ["agentsam_workflow_runs","agentsam_subagent_profile"]),
  "agentsam_tools": (
    "mcp",
    "Platform-level tool registry (broader than mcp_tools). Includes builtin tools, "
    "linked MCP tools, and intent tags for routing. Source of truth for tool health "
    "and workspace scope.",
    ["agentsam_mcp_tools","agentsam_tool_stats_compacted"]),
  "agentsam_tool_call_log": (
    "mcp",
    "High-frequency log of all tool invocations: name, status, duration, cost, "
    "SLA breach flag. Primary source for tool health dashboards and stats compaction.",
    ["agentsam_tools","agentsam_mcp_tools"]),
  "agentsam_tool_stats_compacted": (
    "mcp",
    "Pre-aggregated tool stats rolled up from tool_call_log. Stores success rate, "
    "avg duration, p95, total cost per tool. Avoids scanning the full log for dashboards.",
    ["agentsam_tools"]),

  # ── AI models
  "agentsam_ai": (
    "ai-models",
    "Master AI model catalog. Each row is one model with provider, pricing rates, "
    "capability flags (vision, tools, cache, thinking), token limits, and picker "
    "eligibility. No hardcoded model strings anywhere — all resolved from this table.",
    ["agentsam_routing_arms","agentsam_model_tier"]),
  "agentsam_routing_arms": (
    "ai-models",
    "Thompson Sampling routing state per model/task_type/mode combination. Tracks "
    "alpha/beta for success probability, cost and latency rolling stats, and pause "
    "state. Drives dynamic model selection.",
    ["agentsam_ai","agentsam_model_drift_signals"]),
  "agentsam_model_tier": (
    "ai-models",
    "Workspace-level model tier configuration: which model sits at each tier level "
    "(0=nano, 1=fast, 2=balanced, 3=power, 4=max). Controls escalation ladder.",
    ["agentsam_ai","agentsam_routing_arms"]),
  "agentsam_model_drift_signals": (
    "ai-models",
    "Detected quality drift events: when a model's eval score drops significantly "
    "vs baseline. Can trigger routing arm pause. Used for model monitoring.",
    ["agentsam_ai","agentsam_routing_arms","agentsam_eval_runs"]),
  "agentsam_eval_suites": (
    "ai-models",
    "Eval suite definitions: named sets of test cases for a specific provider/task "
    "type. Used to benchmark models before routing arm promotion.",
    ["agentsam_eval_cases","agentsam_eval_runs"]),
  "agentsam_eval_cases": (
    "ai-models",
    "Individual eval test cases: prompt, expected output, grading criteria. "
    "Organized by suite. Can be tagged as edge cases.",
    ["agentsam_eval_suites","agentsam_eval_runs"]),
  "agentsam_eval_runs": (
    "ai-models",
    "Results for one model run against one eval case. Stores quality/latency/cost "
    "scores, pass/fail, grader notes. Aggregated to detect model drift.",
    ["agentsam_eval_cases","agentsam_ai","agentsam_model_drift_signals"]),
  "agentsam_prompt_versions": (
    "ai-models",
    "Version history for agent prompts. Each row is one version of a named prompt "
    "key with hash, token count, and active flag. Enables prompt rollback.",
    ["agentsam_ai","agentsam_prompt_cache_keys"]),
  "agentsam_prompt_cache_keys": (
    "ai-models",
    "Tracks prompt cache entries per provider/model: write cost, read count, "
    "total savings, expiry. Used to measure cache ROI and optimize prompt structure.",
    ["agentsam_ai","agentsam_prompt_versions"]),

  # ── Workspace
  "agentsam_workspace": (
    "workspace",
    "Per-workspace configuration: R2 bucket/prefix, GitHub repo, default model, "
    "primary subagent. The top-level container for all agent activity.",
    ["agentsam_workspace_state","agentsam_subagent_profile","agentsam_bootstrap"]),
  "agentsam_workspace_state": (
    "workspace",
    "Current editor/agent state for a workspace session: open files, active file, "
    "file lock ownership, agent session ID, checkpoint SHA. One live row per "
    "active session.",
    ["agentsam_workspace","agentsam_agent_run"]),
  "agentsam_bootstrap": (
    "workspace",
    "Session bootstrap configuration: capabilities, execution modes, feature flags, "
    "UI preferences, API paths, resume token. Loaded once on dashboard init.",
    ["agentsam_workspace"]),
  "agentsam_project_context": (
    "workspace",
    "Active project context injected into agent prompts: goals, constraints, "
    "blockers, linked tables/routes/files. Used by Agent Sam to stay on-task.",
    ["agentsam_workspace","agentsam_plans","agentsam_todo"]),

  # ── Memory & skills
  "agentsam_memory": (
    "memory-skills",
    "Agent memory store: keyed facts, summaries, and user preferences with "
    "decay scoring and recall count. Source of persistent agent context across sessions.",
    ["agentsam_agent_run","agentsam_subagent_profile"]),
  "agentsam_skill": (
    "memory-skills",
    "Skill registry: each skill has a markdown body (or R2 file_path), trigger "
    "conditions (slash_trigger, globs, always_apply), and version. Injected into "
    "agent context when matched.",
    ["agentsam_skill_revision","agentsam_skill_invocation"]),
  "agentsam_skill_revision": (
    "memory-skills",
    "Version history for skill content. Each revision stores full markdown body "
    "and change note. Enables skill rollback.",
    ["agentsam_skill"]),
  "agentsam_skill_invocation": (
    "memory-skills",
    "Log of each skill invocation: which skill, how triggered, tokens/cost, "
    "success flag. Used to measure skill effectiveness.",
    ["agentsam_skill"]),
  "agentsam_rules_document": (
    "memory-skills",
    "Rules documents (markdown) injected into agent system prompts. Per-workspace, "
    "versioned, toggleable. Similar to .cursorrules but DB-driven.",
    ["agentsam_workspace"]),
  "agentsam_ignore_pattern": (
    "memory-skills",
    "File ignore patterns (gitignore-style) applied by the agent when browsing "
    "or indexing the workspace. DB-driven alternative to .agentignore files.",
    ["agentsam_workspace"]),

  # ── Observability
  "agentsam_analytics": (
    "observability",
    "Pre-computed analytics snapshots per tenant/period: top tool, top model, "
    "success rates, cost totals, cache hit rate, SLA breaches. Dashboard summary source.",
    ["agentsam_usage_rollups_daily"]),
  "agentsam_usage_events": (
    "observability",
    "Per-call usage events: provider, model, tokens, cost, status. Fine-grained "
    "telemetry feed. Do not add new writes — use agent_telemetry instead.",
    ["agentsam_ai"]),
  "agentsam_usage_rollups_daily": (
    "observability",
    "Daily rolled-up usage stats per tenant/workspace: AI calls, tokens, cost, "
    "tool calls, deployments, errors. Primary source for billing and trend charts.",
    ["agentsam_analytics"]),
  "agentsam_health_daily": (
    "observability",
    "Daily health snapshot: green/yellow/red counts, avg degraded tools, worst "
    "status, SLA breach count. Rolled up from deployment_health checks.",
    ["agentsam_deployment_health"]),
  "agentsam_deployment_health": (
    "observability",
    "Individual deployment health check results: HTTP status, response time, "
    "check type (ping/api/auth). One row per check run per worker.",
    ["agentsam_health_daily"]),
  "agentsam_error_log": (
    "observability",
    "Structured error log: error_code, error_type, source, context JSON, stack "
    "trace, resolved flag. Central error capture across all platform subsystems.",
    []),
  "agentsam_cron_runs": (
    "observability",
    "Cron job execution log: job name, expression, status, duration, rows "
    "read/written. Tracks all scheduled platform maintenance jobs.",
    []),
  "agentsam_task_slos": (
    "observability",
    "SLA definitions per task_type: p95 latency, avg cost, min quality score, "
    "min tool success rate. Referenced at runtime to flag SLA breaches.",
    ["agentsam_agent_run","agentsam_tool_chain"]),

  # ── Workflows & planning
  "agentsam_workflow_runs": (
    "workflows",
    "Execution records for agentsam_mcp_workflows. Tracks steps completed, "
    "input/output JSON, git branch/SHA, cost, Supabase sync status.",
    ["agentsam_mcp_workflows","agentsam_agent_run"]),
  "agentsam_plans": (
    "workflows",
    "Daily/sprint agent plans: morning brief, budget snapshot, linked todos, "
    "token budget, carry-over count. Organizes agent work across a session.",
    ["agentsam_plan_tasks","agentsam_todo","agentsam_project_context"]),
  "agentsam_plan_tasks": (
    "workflows",
    "Individual tasks within a plan: title, category, status, files/tables/routes "
    "involved, dependencies, cost. The granular unit of agent work tracking.",
    ["agentsam_plans","agentsam_todo","agentsam_agent_run"]),
  "agentsam_todo": (
    "workflows",
    "General todo/task queue: status (open/in_progress/done), priority, execution "
    "status (queued/running/done), approval gating, retry logic, Kanban linkage.",
    ["agentsam_plans","agentsam_plan_tasks"]),

  # ── Security
  "agentsam_guardrails": (
    "security",
    "Guardrail rule definitions: category, severity, action (warn/block/log), "
    "matcher JSON, applies_to scope. Runtime safety rules checked on every agent action.",
    ["agentsam_guardrail_rulesets","agentsam_guardrail_events"]),
  "agentsam_guardrail_rulesets": (
    "security",
    "Named collections of guardrail rules. A ruleset bundles multiple guardrail_keys "
    "and can be scoped to tenant/workspace/user.",
    ["agentsam_guardrails"]),
  "agentsam_guardrail_events": (
    "security",
    "Fired guardrail events: which rule triggered, what decision was made, input "
    "preview, route/tool context. Audit trail for all safety interventions.",
    ["agentsam_guardrails"]),
  "agentsam_user_policy": (
    "security",
    "Per-user agent policy: auto-run mode, protection flags (browser/MCP/file), "
    "cost limits, tool risk ceiling, max spawn depth. Governs what a user can do.",
    ["agentsam_workspace"]),
  "agentsam_browser_trusted_origin": (
    "security",
    "Trusted browser origins per user: cert fingerprint, trust scope (session/ "
    "persistent). Prevents CSRF and unauthorized cross-origin agent actions.",
    ["agentsam_user_policy"]),
  "agentsam_fetch_domain_allowlist": (
    "security",
    "Allowlisted domains the agent can fetch from. Enforced on all outbound HTTP "
    "requests made by the agent or MCP browser tools.",
    ["agentsam_user_policy"]),
  "agentsam_user_feature_override": (
    "security",
    "Per-user feature flag overrides. Takes precedence over agentsam_feature_flag "
    "global settings. Used for early access and support overrides.",
    ["agentsam_feature_flag"]),

  # ── Hooks
  "agentsam_hook": (
    "hooks",
    "Hook definitions: trigger event, command, target, provider (system/github/stripe). "
    "Connects external events to agent actions or workflows.",
    ["agentsam_hook_execution","agentsam_mcp_workflows"]),
  "agentsam_hook_execution": (
    "hooks",
    "Execution log for each hook fire: payload, status, duration, output/error. "
    "One row per hook invocation. Used for debugging and retry analysis.",
    ["agentsam_hook"]),
  "agentsam_webhook_events": (
    "hooks",
    "Inbound webhook events from external providers (GitHub, Stripe, etc). Stores "
    "raw payload, signature validation, processing status, and extracted metadata.",
    ["agentsam_hook"]),
  "agentsam_webhook_weekly": (
    "hooks",
    "Weekly rollup of webhook event counts per provider: received, processed, "
    "failed, cost. Dashboard summary for webhook health.",
    ["agentsam_webhook_events"]),

  # ── Settings
  "agentsam_feature_flag": (
    "settings",
    "Platform-wide feature flag registry: enabled globally, per-tenant, per-user, "
    "or by rollout percentage. Supports boolean and value flag types with expiry.",
    ["agentsam_user_feature_override"]),
  "agentsam_code_index_job": (
    "settings",
    "Codebase indexing job state: progress, file manifest, symbol/chunk counts, "
    "vector backend (Supabase pgvector). Tracks the RAG codebase index pipeline.",
    ["agentsam_workspace"]),
  "agentsam_cad_jobs": (
    "settings",
    "CAD/3D generation job records: engine, prompt, mode, external task ID, "
    "result URL and R2 key. Tracks Meshy or similar 3D generation pipelines.",
    []),
  "agentsam_subscription_registry": (
    "settings",
    "External subscription tracking: AI provider subscriptions (Anthropic, OpenAI, "
    "etc), tier, linked email. Reference table for cost attribution.",
    []),

  # ── CI/CD
  "agentsam_scripts": (
    "cicd",
    "Script catalog: path, runner, safety flags (owner_only, safe_to_run), "
    "run ordering constraints. The registry of all platform automation scripts.",
    ["agentsam_script_runs"]),
  "agentsam_script_runs": (
    "cicd",
    "Script execution history: triggered_by, git branch/SHA, environment, "
    "exit code, duration, output summary. Audit trail for all script runs.",
    ["agentsam_scripts"]),

  # ── Approvals
  "agentsam_approval_queue": (
    "approvals",
    "Pending human approval requests for high-risk tool/command actions. Stores "
    "the action summary, input JSON, risk level, expiry, and decision outcome.",
    ["agentsam_tool_chain","agentsam_commands"]),

  # ── Subagents
  "agentsam_subagent_profile": (
    "workspace",
    "Subagent (MCP cloud agent) profile registry: slug, instructions, allowed tool "
    "globs, default model, sandbox_mode, spawn limits, MCP server JSON. The agent "
    "identity record used by /dashboard/mcp/:slug.",
    ["agentsam_workspace","agentsam_mcp_allowlist","agentsam_skill"]),
}

GROUP_TITLES = {
    "agent-execution": "Agent Execution — Runs, Tool Chains & Context",
    "commands":        "Commands — Registry, Patterns & Allowlists",
    "mcp":             "MCP — Tools, Servers, Workflows & Stats",
    "ai-models":       "AI Models — Catalog, Routing & Evals",
    "workspace":       "Workspace — Config, State & Subagents",
    "memory-skills":   "Memory, Skills & Rules",
    "observability":   "Observability — Analytics, Health & Errors",
    "workflows":       "Workflows — Plans, Tasks & Todos",
    "security":        "Security — Guardrails, Policies & Origins",
    "hooks":           "Hooks & Webhooks",
    "settings":        "Settings — Feature Flags & Jobs",
    "cicd":            "CI/CD — Scripts & Runs",
    "approvals":       "Approvals & Escalation",
}

# ── D1 helpers ────────────────────────────────────────────────────────────────

def d1(sql):
    data = json.dumps({"sql": sql}).encode()
    req  = urllib.request.Request(
        API_URL, data=data,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read())
            if not body.get("success"):
                raise RuntimeError(f"D1: {body.get('errors')}")
            return body["result"][0]["results"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()}")

def get_tables():
    rows = d1("SELECT name FROM sqlite_master WHERE type='table' "
              "AND name LIKE 'agentsam_%' ORDER BY name")
    return [r["name"] for r in rows]

def get_schema(t):
    try:    return d1(f"PRAGMA table_info('{t}')")
    except RuntimeError as e:
        if "SQLITE_AUTH" in str(e): return []
        raise

def get_indexes(t):
    try:    return d1(f"PRAGMA index_list('{t}')")
    except: return []

def get_count(t):
    try:    return d1(f'SELECT COUNT(*) as n FROM "{t}"')[0]["n"]
    except: return None

# ── Terminal helpers ──────────────────────────────────────────────────────────

TTY = sys.stdout.isatty()
def clr(c,s): return f"\033[{c}m{s}\033[0m" if TTY else str(s)
def bold(s):   return clr("1",  s)
def dim(s):    return clr("2",  s)
def cyan(s):   return clr("36", s)
def green(s):  return clr("32", s)
def yellow(s): return clr("33", s)
def red(s):    return clr("31", s)

def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

# ── Markdown generation ───────────────────────────────────────────────────────

def fmt_default(v):
    if v is None: return ""
    s = str(v)
    return s[:60]+"…" if len(s) > 60 else s

def table_section(tname, cols, idxs, count, meta):
    group, purpose, related = meta
    lines = [
        f"## `{tname}`",
        "",
        f"**Group:** {GROUP_TITLES.get(group, group)}  ",
        f"**Rows:** {f'{count:,}' if count is not None else 'unknown'}",
        "",
        f"**Purpose:** {purpose}",
        "",
    ]
    if related:
        lines += ["**Key relationships:**", ""]
        for r in related:
            lines.append(f"- `{r}`")
        lines.append("")

    lines += [
        "| Column | Type | PK | Required | Default |",
        "|--------|------|----|----------|---------|",
    ]
    for c in cols:
        pk   = "✓" if c["pk"]      else ""
        req  = "✓" if c["notnull"] else ""
        dflt = fmt_default(c["dflt_value"])
        lines.append(f"| `{c['name']}` | `{c['type'] or '?'}` | {pk} | {req} | `{dflt}` |")
    lines.append("")

    named = [i["name"] for i in idxs if not i["name"].startswith("sqlite_")]
    if named:
        lines += [f"**Indexes:** {', '.join(f'`{i}`' for i in named)}", ""]

    lines.append("---")
    lines.append("")
    return "\n".join(lines)

def group_file(group_key, tables_in_group, schemas, idxs, counts):
    title = GROUP_TITLES.get(group_key, group_key)
    ts    = now()
    lines = [
        f"# {title}",
        f"> `db/agentsam-{group_key}.md` — agentsam_* schema reference",
        f"> Generated: {ts} | Database: inneranimalmedia-business",
        "",
        "<!-- RAG-CONTEXT: This document describes Cloudflare D1 database tables",
        f"for the IAM platform's {title.lower()} subsystem.",
        "Each section covers one table: purpose, relationships, and full column schema.",
        "Use this to answer questions about data structure, API design, and backend gaps. -->",
        "",
        "## Tables in this group",
        "",
    ]
    for t in sorted(tables_in_group):
        meta    = TABLE_META.get(t, (group_key, "No description available.", []))
        purpose = meta[1].split(".")[0]  # first sentence only for index
        lines.append(f"- [`{t}`](#{t.replace('_', '-')}) — {purpose}.")
    lines += ["", "---", ""]

    for t in sorted(tables_in_group):
        if t not in schemas:
            continue
        meta = TABLE_META.get(t, (group_key, "No description available.", []))
        lines.append(table_section(t, schemas[t], idxs.get(t,[]),
                                   counts.get(t), meta))
    return "\n".join(lines)

def index_file(all_tables, schemas, counts, groups):
    ts = now()
    lines = [
        "# agentsam_* Schema Index",
        f"> Master index of all `agentsam_*` D1 tables — inneranimalmedia-business",
        f"> Generated: {ts}",
        "",
        "<!-- RAG-CONTEXT: Master index for the IAM platform agentsam_* table namespace.",
        "Contains every table name, its feature group, row count, and link to full schema doc.",
        "Use this to orient to the database structure before diving into specific groups. -->",
        "",
        f"**Total tables:** {len(all_tables)}  ",
        f"**Database:** `inneranimalmedia-business` (cf87b717-d4e2-4cf8-bab0-a81268e32d49)",
        "",
    ]

    for gk, gtitle in sorted(GROUP_TITLES.items()):
        group_tables = sorted(t for t, (g,_,_) in TABLE_META.items()
                              if g == gk and t in schemas)
        if not group_tables:
            continue
        lines += [f"## {gtitle}", "",
                  f"> `db/agentsam-{gk}.md`", "",
                  "| Table | Rows | Purpose (brief) |",
                  "|-------|------|-----------------|"]
        for t in group_tables:
            meta    = TABLE_META.get(t, (gk, "", []))
            purpose = meta[1].split(".")[0][:80]
            cnt     = f"{counts[t]:,}" if t in counts and counts[t] is not None else "—"
            lines.append(f"| `{t}` | {cnt} | {purpose} |")
        lines.append("")

    # Tables in DB but not in TABLE_META
    unmapped = sorted(t for t in all_tables if t in schemas and t not in TABLE_META)
    if unmapped:
        lines += ["## Unmapped Tables", "",
                  "These tables exist in D1 but have no feature group or description yet.", "",
                  "| Table | Rows |",
                  "|-------|------|"]
        for t in unmapped:
            cnt = f"{counts[t]:,}" if t in counts and counts[t] is not None else "—"
            lines.append(f"| `{t}` | {cnt} |")
        lines.append("")

    return "\n".join(lines)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not CF_API_TOKEN:  sys.exit("ERROR: CF_API_TOKEN not set.")
    if not CF_ACCOUNT_ID: sys.exit("ERROR: CF_ACCOUNT_ID not set.")

    print(); print(bold("  D1 Schema Audit — agentsam_* → db/"))
    print(dim(f"  {D1_DATABASE_ID}  |  {now()}")); print()

    print(cyan("→ Fetching agentsam_* table list..."))
    all_tables = get_tables()
    print(green(f"  {len(all_tables)} tables found")); print()

    print(cyan("→ Pulling schemas..."))
    schemas, idxs, counts = {}, {}, {}
    for i, t in enumerate(all_tables):
        sys.stdout.write(f"\r  [{i+1:>3}/{len(all_tables)}] {t:<65}")
        sys.stdout.flush()
        s = get_schema(t)
        if not s: continue
        schemas[t] = s
        idxs[t]    = get_indexes(t)
        if INCLUDE_COUNTS: counts[t] = get_count(t)

    skipped = len(all_tables) - len(schemas)
    print(green(f"\r  {len(schemas)} schemas pulled"
                + (f"  ({skipped} skipped)" if skipped else "")
                + " "*30))

    # Group tables
    groups = {}
    for t in schemas:
        gk = TABLE_META.get(t, ("settings","",""))[0]
        groups.setdefault(gk, []).append(t)

    # ── Output to dated folder structure ─────────────────────────────────────
    today    = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    ctx_dir  = os.path.join(OUTPUT_DIR, "agentsam-d1-context")
    os.makedirs(ctx_dir, exist_ok=True)

    ctx_path  = os.path.join(ctx_dir, f"{today}_agentsam-schema.context.md")
    rag_path  = os.path.join(ctx_dir, f"{today}_agentsam-schema.autorag.md")
    json_path = os.path.join(ctx_dir, f"{today}_agentsam-schema.json")
    gaps_path = os.path.join(ctx_dir, f"{today}_agentsam-frontend-gaps.md")

    # .context.md — rich grouped reference (human + agent readable)
    with open(ctx_path, "w") as f: f.write(context_doc(all_tables, schemas, idxs, counts, groups))

    # .autorag.md — flat RAG-optimized, one chunk per table
    with open(rag_path, "w") as f: f.write(autorag_doc(schemas, idxs, counts))

    # .json — raw schema for programmatic / tooling use
    json_out = {}
    for t in sorted(schemas):
        json_out[t] = {
            "group":     TABLE_META.get(t, ("unknown","",""))[0],
            "purpose":   TABLE_META.get(t, ("","No description.",""))[1],
            "row_count": counts.get(t),
            "columns": [{"name": c["name"], "type": c["type"] or "?",
                         "pk": bool(c["pk"]), "not_null": bool(c["notnull"]),
                         "default": c["dflt_value"]} for c in schemas[t]],
            "indexes": [i["name"] for i in idxs.get(t,[])
                        if not i["name"].startswith("sqlite_")],
        }
    with open(json_path, "w") as f:
        json.dump({"generated": now(), "database": D1_DATABASE_ID,
                   "table_count": len(schemas), "tables": json_out}, f, indent=2)

    # frontend gaps
    with open(gaps_path, "w") as f: f.write(gaps_doc(set(schemas)))

    # ── Hardcoded tenant/workspace DEFAULT audit ───────────────────────────
    BAD = ["ws_inneranimalmedia","tenant_sam_primeaux",
           "tenant_inneranimalmedia","sam_primeaux"]
    hc = [(t, c["name"], str(c["dflt_value"]))
          for t, cols in schemas.items()
          for c in cols
          if any(p in str(c["dflt_value"] or "") for p in BAD)]

    all_mapped = {t for info in ROUTE_TABLE_MAP.values() for t in info["tables"]}
    present = [t for t in all_mapped if t in schemas]
    missing = [t for t in all_mapped if t not in schemas]
    orphans = [t for t in schemas   if t not in all_mapped]

    print(); print(bold("═"*74)); print(bold("  FRONTEND GAP SUMMARY")); print(bold("═"*74))
    print(green( f"  ✅ {len(present)} mapped tables EXIST"))
    print(red(   f"  ❌ {len(missing)} mapped tables MISSING"))
    print(yellow(f"  ⚠️  {len(orphans)} agentsam_* tables not mapped to any route"))
    if missing:
        print(); print(red("  Missing:"))
        for t in sorted(missing): print(f"    ❌ {t}")
    if orphans:
        print(); print(yellow("  Unmapped (needs UI home or confirmed backend-only):"))
        for t in sorted(orphans): print(f"    ⚠️  {t}")

    if hc:
        print(); print(bold("═"*74))
        print(red(bold("  ⚠️  HARDCODED IDENTITY DEFAULTS — MULTI-TENANCY RISK")))
        print(bold("═"*74))
        print(dim("  These columns have a specific tenant/workspace/user baked into DEFAULT."))
        print(dim("  Any INSERT omitting the field silently scopes to the hardcoded identity."))
        print(dim("  Fix: DEFAULT NULL + enforce at application layer."))
        print()
        for t, col, dflt in sorted(hc):
            print(f"    {red('●')} {t}.{col}")
            print(f"        DEFAULT = {red(dflt)}")

    print(); print(bold("═"*74)); print(bold("  FILES WRITTEN")); print(bold("═"*74))
    for p in [ctx_path, rag_path, json_path, gaps_path]:
        sz = os.path.getsize(p)
        print(green(f"  ✓ {p}") + dim(f"  ({sz/1024:.1f} KB)"))
    print()
    print(dim(f"  git add docs/db/agentsam-d1-context/"))
    print(dim(f'  git commit -m "docs: agentsam schema audit {today}"'))
    print(dim( "  git push"))
    print()

if __name__ == "__main__":
    main()

# ── Additional markdown builders ──────────────────────────────────────────────

def context_doc(all_tables, schemas, idxs, counts, groups):
    """Rich grouped .context.md — human + agent reference."""
    ts = now()
    lines = [
        "# agentsam_* Schema Reference",
        f"> `docs/db/agentsam-d1-context/` — {ts}",
        f"> Database: `inneranimalmedia-business` ({D1_DATABASE_ID})",
        "",
        "<!-- RAG-CONTEXT: Full schema reference for IAM platform agentsam_* tables.",
        "Grouped by feature domain. Each table includes purpose, relationships,",
        "and annotated column schema. Use for API design, backend gap analysis,",
        "and understanding data flow across platform subsystems. -->",
        "",
        f"**{len(schemas)} tables** across {len(groups)} feature groups.",
        "",
    ]
    for gk in sorted(groups):
        lines.append(f"## {GROUP_TITLES.get(gk, gk)}")
        lines.append("")
        for t in sorted(groups[gk]):
            if t not in schemas: continue
            meta    = TABLE_META.get(t, (gk, "No description.", []))
            purpose = meta[1].split(".")[0]
            lines.append(f"- [`{t}`](#{t.replace('_','-')}) — {purpose}.")
        lines += [""]
        for t in sorted(groups[gk]):
            if t not in schemas: continue
            meta = TABLE_META.get(t, (gk, "No description.", []))
            lines.append(table_section(t, schemas[t], idxs.get(t,[]),
                                       counts.get(t), meta))
    return "\n".join(lines)

def autorag_doc(schemas, idxs, counts):
    """Flat .autorag.md — one self-contained chunk per table, max RAG signal density."""
    ts = now()
    lines = [
        "# agentsam_* Schema — AutoRAG Format",
        f"> Generated: {ts} | DB: inneranimalmedia-business",
        "",
        "<!-- FORMAT: Each table is a self-contained chunk separated by ---.",
        "Each chunk includes: table name, group, purpose, relationships, column list.",
        "Optimized for embedding and retrieval. Do not reformat. -->",
        "",
    ]
    for t in sorted(schemas):
        meta    = TABLE_META.get(t, ("unknown", "No description.", []))
        group, purpose, related = meta
        cnt     = f"{counts[t]:,} rows" if t in counts and counts[t] is not None else "unknown rows"
        cols    = schemas[t]
        named_idx = [i["name"] for i in idxs.get(t,[]) if not i["name"].startswith("sqlite_")]

        lines += [
            f"## TABLE: {t}",
            f"GROUP: {GROUP_TITLES.get(group, group)}",
            f"ROWS: {cnt}",
            f"PURPOSE: {purpose}",
        ]
        if related:
            lines.append(f"RELATED: {', '.join(related)}")
        if named_idx:
            lines.append(f"INDEXES: {', '.join(named_idx)}")
        lines.append("")
        lines.append("COLUMNS:")
        for c in cols:
            flags = []
            if c["pk"]:      flags.append("PK")
            if c["notnull"]: flags.append("NN")
            dflt  = f" DEFAULT={c['dflt_value']}" if c["dflt_value"] is not None else ""
            flag_s = f" [{','.join(flags)}]" if flags else ""
            lines.append(f"  {c['name']} {c['type'] or '?'}{flag_s}{dflt}")
        lines += ["", "---", ""]
    return "\n".join(lines)

def gaps_doc(all_tables_set):
    """Frontend gap analysis doc."""
    ts = now()
    lines = [
        "# Frontend ↔ Backend Gap Analysis — agentsam_*",
        f"> Generated: {ts}",
        "",
        "## Legend",
        "- ✅ Table exists  ❌ Missing  🔲 Endpoint to verify",
        "", "---", "",
    ]
    all_mapped = set()
    for route, info in sorted(ROUTE_TABLE_MAP.items()):
        lines += [f"## `{route}`", f"**{info['desc']}**", "", "### Tables", ""]
        for t in info["tables"]:
            all_mapped.add(t)
            lines.append(f"- {'✅' if t in all_tables_set else '❌'} `{t}`")
        lines += ["", "### Endpoints", ""]
        for ep in info["endpoints"]:
            lines.append(f"- 🔲 `{ep}`")
        lines += ["", "---", ""]
    orphans = sorted(t for t in all_tables_set if t not in all_mapped)
    if orphans:
        lines += ["## Unmapped Tables", "",
                  "Exist in D1 but not assigned to a dashboard route.", ""]
        for t in orphans: lines.append(f"- `{t}`")
    return "\n".join(lines)
