#!/usr/bin/env python3
"""
analyze_handler_types.py
Inner Animal Media — Handler Type Audit
----------------------------------------
Queries the live D1 database (inneranimalmedia-business) to produce a full
audit of handler_type distribution in agentsam_mcp_tools, isolates every
'builtin' row, cross-references it against OAuth allowlists, capability
aliases, workflow definitions, and user allowlists, then writes a
migration-ready report Cursor can act on without guessing.

Stdlib only. No pip installs required.

Env load order (first file found wins per key):
  agentsam.local.env → cloudflare.env → .env

Required env keys:
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN

D1 database: inneranimalmedia-business
Database ID: cf87b717-d4e2-4cf8-bab0-a81268e32d49

Usage:
  python3 analyze_handler_types.py
  python3 analyze_handler_types.py --json          # also write JSON output
  python3 analyze_handler_types.py --out ./reports  # custom output directory
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
import argparse
import datetime
import re
from pathlib import Path
from collections import defaultdict

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

D1_DATABASE_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
D1_DATABASE_NAME = "inneranimalmedia-business"
REPO_ROOT_MARKERS = ["wrangler.production.toml", "package.json", "src/index.js"]
ENV_FILES = ["agentsam.local.env", "cloudflare.env", ".env"]

# These are the categories we expect to exist after cleanup.
# Used to suggest a real handler_type for each builtin tool
# based on its tool_key, tool_category, and mcp_service_url patterns.
CATEGORY_PATTERNS = [
    ("d1",          ["d1_", "d1."]),
    ("r2",          ["r2_", "r2."]),
    ("github",      ["github_", "github."]),
    ("google",      ["google_", "gdrive_", "gcal_", "gmail_"]),
    ("supabase",    ["supabase_", "supabase."]),
    ("cloudflare",  ["cf_", "cloudflare_", "worker_", "workers_", "kv_", "wrangler_"]),
    ("browser",     ["browser_", "cdt_", "playwright_", "web_fetch", "web_search", "navigate"]),
    ("terminal",    ["terminal_", "pty_", "shell_", "bash_", "command_"]),
    ("agent",       ["agentsam_", "agent_", "spawn_", "subagent_"]),
    ("workflow",    ["workflow_", "wf_"]),
    ("deploy",      ["deploy_", "deployment_"]),
    ("resend",      ["resend_", "email_", "mail_"]),
    ("image",       ["image_", "img_", "imgx_", "veo_", "cf_images"]),
    ("rag",         ["rag_", "knowledge_", "embed_"]),
    ("memory",      ["memory_", "agent_memory"]),
    ("stripe",      ["stripe_"]),
    ("hubspot",     ["hubspot_"]),
    ("notion",      ["notion_"]),
    ("slack",       ["slack_"]),
    ("fs",          ["fs_", "file_", "workspace_file", "workspace_read"]),
    ("ai",          ["ai_", "gemini_", "openai_", "anthropic_"]),
    ("time",        ["time_", "clock_"]),
    ("mcp",         ["mcp_", "mcp."]),
]

# ─────────────────────────────────────────────────────────────────────────────
# REPO ROOT GUARD
# ─────────────────────────────────────────────────────────────────────────────

def find_repo_root() -> Path:
    """Walk up from cwd until we find a known repo root marker."""
    current = Path.cwd()
    for _ in range(10):
        for marker in REPO_ROOT_MARKERS:
            if (current / marker).exists():
                return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    # Not fatal for an analysis script — just warn
    print("WARNING: Could not confirm repo root. Running from:", Path.cwd(), file=sys.stderr)
    return Path.cwd()


# ─────────────────────────────────────────────────────────────────────────────
# ENV LOADING
# ─────────────────────────────────────────────────────────────────────────────

def load_env_file(path: Path) -> dict:
    """Parse a simple KEY=VALUE env file. Ignores comments and blank lines."""
    result = {}
    if not path.exists():
        return result
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        result[key] = value
    return result


def load_env(repo_root: Path) -> dict:
    """Load env vars in priority order. First file found per key wins."""
    env = {}
    for filename in reversed(ENV_FILES):  # reversed so first-in-list wins
        file_env = load_env_file(repo_root / filename)
        env.update(file_env)
    # OS environment overrides file env
    for key in ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]:
        if key in os.environ:
            env[key] = os.environ[key]
    return env


# ─────────────────────────────────────────────────────────────────────────────
# D1 REST API
# ─────────────────────────────────────────────────────────────────────────────

def d1_query(account_id: str, api_token: str, sql: str, params: list = None) -> list:
    """
    Execute a SQL query against Cloudflare D1 REST API.
    Returns list of row dicts. Raises on HTTP or D1 error.
    """
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/d1/database/{D1_DATABASE_ID}/query"
    )
    payload = json.dumps({"sql": sql, "params": params or []}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"D1 HTTP {e.code}: {error_body}") from e

    if not body.get("success"):
        errors = body.get("errors", [])
        raise RuntimeError(f"D1 query failed: {errors}")

    results = body.get("result", [])
    if not results:
        return []

    # D1 returns result as list of {results: [...], success: bool}
    rows = []
    for result_block in results:
        rows.extend(result_block.get("results", []))
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# CATEGORY SUGGESTION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def suggest_handler_type(tool_key: str, tool_category: str, mcp_service_url: str,
                         server_key: str, description: str) -> str:
    """
    Suggest a real handler_type for a builtin tool based on naming patterns.
    Returns a suggestion string or 'needs_manual_review'.
    """
    candidates = [
        (tool_key or "").lower(),
        (tool_category or "").lower(),
        (mcp_service_url or "").lower(),
        (server_key or "").lower(),
        (description or "").lower()[:80],
    ]
    combined = " ".join(candidates)

    for category, patterns in CATEGORY_PATTERNS:
        for pattern in patterns:
            if pattern in combined:
                return category

    return "needs_manual_review"


# ─────────────────────────────────────────────────────────────────────────────
# QUERIES
# ─────────────────────────────────────────────────────────────────────────────

def q_handler_type_distribution(account_id, api_token):
    sql = """
        SELECT
            COALESCE(handler_type, 'NULL') AS handler_type,
            COUNT(*) AS total,
            SUM(CASE WHEN COALESCE(is_active, 1) = 1 THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN COALESCE(is_active, 1) = 0 THEN 1 ELSE 0 END) AS inactive,
            SUM(CASE WHEN last_used_at IS NOT NULL THEN 1 ELSE 0 END) AS ever_used,
            ROUND(AVG(CASE WHEN failure_rate IS NOT NULL THEN failure_rate ELSE 0 END), 4)
                AS avg_failure_rate
        FROM agentsam_mcp_tools
        GROUP BY handler_type
        ORDER BY total DESC
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_full_inventory(account_id, api_token):
    sql = """
        SELECT
            id,
            tool_key,
            display_name,
            tool_category,
            tool_name,
            handler_type,
            mcp_service_url,
            server_key,
            server_id,
            description,
            risk_level,
            requires_approval,
            workspace_scope,
            routing_scope,
            is_active,
            enabled,
            is_degraded,
            failure_rate,
            avg_latency_ms,
            health_status,
            last_used_at,
            cost_per_call_usd,
            estimated_cost_usd,
            input_tokens,
            output_tokens,
            duration_ms,
            intent_category_tags,
            intent_tags,
            tenant_id,
            workspace_id,
            user_id,
            sort_priority,
            created_at
        FROM agentsam_mcp_tools
        WHERE COALESCE(handler_type, 'builtin') = 'builtin'
        ORDER BY
            COALESCE(is_active, 1) DESC,
            COALESCE(last_used_at, '1970-01-01') DESC,
            tool_key ASC
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_in_oauth_allowlist(account_id, api_token):
    sql = """
        SELECT
            t.tool_key,
            t.display_name,
            t.tool_category,
            t.risk_level,
            t.requires_approval,
            a.client_id,
            a.access_class,
            a.is_active AS allowlist_active
        FROM agentsam_mcp_tools t
        INNER JOIN agentsam_mcp_oauth_tool_allowlist a
            ON t.tool_key = a.tool_key
        WHERE COALESCE(t.handler_type, 'builtin') = 'builtin'
        ORDER BY t.tool_key, a.client_id
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_in_user_allowlist(account_id, api_token):
    sql = """
        SELECT
            t.tool_key,
            t.display_name,
            t.tool_category,
            al.user_id,
            al.workspace_id,
            al.is_allowed,
            al.risk_level_override,
            al.requires_approval AS user_requires_approval,
            al.max_calls_per_day,
            al.granted_by
        FROM agentsam_mcp_tools t
        INNER JOIN agentsam_mcp_allowlist al
            ON t.tool_key = al.tool_key
        WHERE COALESCE(t.handler_type, 'builtin') = 'builtin'
        ORDER BY t.tool_key
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_capability_aliases(account_id, api_token):
    sql = """
        SELECT
            ca.abstract_capability,
            ca.match_kind,
            ca.match_value,
            ca.capability_lane,
            ca.priority,
            ca.requires_approval,
            ca.is_mutation,
            ca.rationale
        FROM agentsam_capability_aliases ca
        WHERE ca.match_kind = 'tool_key'
          AND EXISTS (
              SELECT 1 FROM agentsam_mcp_tools t
              WHERE t.tool_key = ca.match_value
                AND COALESCE(t.handler_type, 'builtin') = 'builtin'
          )
        ORDER BY ca.capability_lane, ca.abstract_capability
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_in_workflows(account_id, api_token):
    """
    Find workflow definitions whose tools_json contains any builtin tool key.
    Returns workflow metadata + the matched tool keys.
    Note: tools_json is stored as a JSON string in D1 — we use LIKE for the match.
    """
    sql = """
        SELECT
            w.id AS workflow_id,
            w.workflow_key,
            w.display_name,
            w.category,
            w.risk_level,
            w.requires_approval,
            w.status,
            w.is_active,
            w.workspace_id,
            w.tools_json
        FROM agentsam_mcp_workflows w
        WHERE w.is_active = 1
          AND EXISTS (
              SELECT 1 FROM agentsam_mcp_tools t
              WHERE COALESCE(t.handler_type, 'builtin') = 'builtin'
                AND w.tools_json LIKE '%' || t.tool_key || '%'
          )
        ORDER BY w.workflow_key
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_server_breakdown(account_id, api_token):
    """
    For builtin tools that have a server_key or server_id,
    show what MCP server they point to.
    """
    sql = """
        SELECT
            t.tool_key,
            t.display_name,
            t.server_key,
            t.server_id,
            t.mcp_service_url,
            s.url AS server_url,
            s.auth_type AS server_auth_type,
            s.health_status AS server_health,
            s.is_active AS server_active
        FROM agentsam_mcp_tools t
        LEFT JOIN agentsam_mcp_servers s
            ON t.server_key = s.server_key
        WHERE COALESCE(t.handler_type, 'builtin') = 'builtin'
          AND (t.server_key IS NOT NULL OR t.server_id IS NOT NULL)
        ORDER BY t.server_key, t.tool_key
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_never_used_active(account_id, api_token):
    sql = """
        SELECT
            tool_key,
            display_name,
            tool_category,
            risk_level,
            requires_approval,
            workspace_scope,
            created_at
        FROM agentsam_mcp_tools
        WHERE COALESCE(handler_type, 'builtin') = 'builtin'
          AND COALESCE(is_active, 1) = 1
          AND last_used_at IS NULL
        ORDER BY created_at DESC
    """
    return d1_query(account_id, api_token, sql)


def q_builtin_high_risk(account_id, api_token):
    sql = """
        SELECT
            tool_key,
            display_name,
            tool_category,
            risk_level,
            requires_approval,
            is_active,
            last_used_at,
            workspace_scope
        FROM agentsam_mcp_tools
        WHERE COALESCE(handler_type, 'builtin') = 'builtin'
          AND risk_level IN ('high', 'critical')
        ORDER BY risk_level DESC, tool_key
    """
    return d1_query(account_id, api_token, sql)


def q_all_handler_types_non_builtin(account_id, api_token):
    """
    Shows what non-builtin handler types already exist as reference
    for what the migration should look like.
    """
    sql = """
        SELECT
            handler_type,
            COUNT(*) AS n,
            GROUP_CONCAT(DISTINCT tool_category) AS categories_seen
        FROM agentsam_mcp_tools
        WHERE handler_type IS NOT NULL
          AND handler_type != 'builtin'
        GROUP BY handler_type
        ORDER BY n DESC
    """
    return d1_query(account_id, api_token, sql)


def q_workspace_scope_breakdown_builtin(account_id, api_token):
    sql = """
        SELECT
            COALESCE(workspace_scope, 'NULL') AS workspace_scope,
            COUNT(*) AS n,
            SUM(CASE WHEN COALESCE(is_active,1)=1 THEN 1 ELSE 0 END) AS active
        FROM agentsam_mcp_tools
        WHERE COALESCE(handler_type, 'builtin') = 'builtin'
        GROUP BY workspace_scope
        ORDER BY n DESC
    """
    return d1_query(account_id, api_token, sql)


# ─────────────────────────────────────────────────────────────────────────────
# REPORT BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def build_report(data: dict, timestamp: str) -> str:
    lines = []

    def h1(s): lines.append(f"\n{'='*72}\n{s}\n{'='*72}")
    def h2(s): lines.append(f"\n{'-'*60}\n{s}\n{'-'*60}")
    def h3(s): lines.append(f"\n  [ {s} ]")
    def row(*cols): lines.append("  " + "  |  ".join(str(c) for c in cols))
    def blank(): lines.append("")
    def note(s): lines.append(f"  NOTE: {s}")
    def warn(s): lines.append(f"  *** WARNING: {s}")
    def item(s): lines.append(f"  - {s}")

    h1(f"HANDLER TYPE AUDIT — {D1_DATABASE_NAME}")
    lines.append(f"  Generated: {timestamp}")
    lines.append(f"  Database:  {D1_DATABASE_ID}")
    lines.append(f"  Purpose:   Isolate builtin handlers for Cursor migration")

    # ── 1. Overall distribution ───────────────────────────────────────────────
    h1("1. HANDLER TYPE DISTRIBUTION — ALL TOOLS")
    dist = data.get("distribution", [])
    if not dist:
        warn("No rows returned from agentsam_mcp_tools. Check DB connection.")
    else:
        row("HANDLER_TYPE", "TOTAL", "ACTIVE", "INACTIVE", "EVER_USED", "AVG_FAIL_RATE")
        row("-"*20, "-"*7, "-"*7, "-"*8, "-"*9, "-"*13)
        total_all = sum(r.get("total", 0) for r in dist)
        for r in dist:
            row(
                r.get("handler_type", "NULL"),
                r.get("total", 0),
                r.get("active", 0),
                r.get("inactive", 0),
                r.get("ever_used", 0),
                r.get("avg_failure_rate", 0),
            )
        blank()
        lines.append(f"  TOTAL TOOLS IN TABLE: {total_all}")
        builtin_row = next((r for r in dist if r.get("handler_type") in ("builtin", "NULL")), None)
        if builtin_row:
            pct = round(builtin_row["total"] / total_all * 100, 1) if total_all else 0
            lines.append(f"  BUILTIN COUNT:        {builtin_row['total']} ({pct}% of all tools)")

    # ── 2. Non-builtin reference ──────────────────────────────────────────────
    h1("2. EXISTING NON-BUILTIN HANDLER TYPES (migration reference)")
    non_builtin = data.get("non_builtin", [])
    if not non_builtin:
        note("No non-builtin handler types found yet. Migration starts from scratch.")
    else:
        row("HANDLER_TYPE", "COUNT", "TOOL_CATEGORIES_SEEN")
        row("-"*20, "-"*7, "-"*40)
        for r in non_builtin:
            row(r.get("handler_type"), r.get("n"), r.get("categories_seen", ""))
        blank()
        note("These are the approved handler_type values to migrate toward.")

    # ── 3. Full builtin inventory ─────────────────────────────────────────────
    h1("3. FULL BUILTIN TOOL INVENTORY")
    inventory = data.get("builtin_inventory", [])
    if not inventory:
        note("No builtin tools found.")
    else:
        lines.append(f"  Total builtin tools: {len(inventory)}")
        blank()

        # Build category suggestion map
        suggestion_map = {}
        category_buckets = defaultdict(list)
        for tool in inventory:
            suggestion = suggest_handler_type(
                tool.get("tool_key", ""),
                tool.get("tool_category", ""),
                tool.get("mcp_service_url", ""),
                tool.get("server_key", ""),
                tool.get("description", ""),
            )
            suggestion_map[tool.get("tool_key")] = suggestion
            category_buckets[suggestion].append(tool.get("tool_key"))

        h2("3a. SUGGESTED MIGRATION GROUPINGS")
        note("These suggestions are pattern-based. Cursor must verify each one before migration.")
        blank()
        for suggested_type, tool_keys in sorted(category_buckets.items()):
            h3(f"Suggest handler_type = '{suggested_type}'  ({len(tool_keys)} tools)")
            for tk in sorted(tool_keys):
                item(tk)

        h2("3b. FULL DETAIL — EACH BUILTIN TOOL")
        for tool in inventory:
            tk = tool.get("tool_key", "UNKNOWN")
            is_active = tool.get("is_active", 1)
            active_label = "ACTIVE" if is_active else "INACTIVE"
            suggestion = suggestion_map.get(tk, "needs_manual_review")
            blank()
            lines.append(f"  ┌── {tk}  [{active_label}]")
            lines.append(f"  │   display_name:       {tool.get('display_name') or '—'}")
            lines.append(f"  │   tool_category:      {tool.get('tool_category') or '—'}")
            lines.append(f"  │   tool_name:          {tool.get('tool_name') or '—'}")
            lines.append(f"  │   risk_level:         {tool.get('risk_level') or '—'}")
            lines.append(f"  │   requires_approval:  {tool.get('requires_approval', 0)}")
            lines.append(f"  │   workspace_scope:    {tool.get('workspace_scope') or '—'}")
            lines.append(f"  │   routing_scope:      {tool.get('routing_scope') or '—'}")
            lines.append(f"  │   server_key:         {tool.get('server_key') or '—'}")
            lines.append(f"  │   mcp_service_url:    {tool.get('mcp_service_url') or '—'}")
            lines.append(f"  │   health_status:      {tool.get('health_status') or '—'}")
            lines.append(f"  │   failure_rate:       {tool.get('failure_rate', 0)}")
            lines.append(f"  │   avg_latency_ms:     {tool.get('avg_latency_ms') or '—'}")
            lines.append(f"  │   last_used_at:       {tool.get('last_used_at') or 'NEVER'}")
            lines.append(f"  │   is_degraded:        {tool.get('is_degraded', 0)}")
            lines.append(f"  │   enabled:            {tool.get('enabled', 1)}")
            lines.append(f"  │   intent_category:    {tool.get('intent_category_tags') or '—'}")
            lines.append(f"  │   description:        {(tool.get('description') or '—')[:80]}")
            lines.append(f"  └── SUGGESTED TYPE:     {suggestion}")

    # ── 4. OAuth exposure ─────────────────────────────────────────────────────
    h1("4. BUILTIN TOOLS EXPOSED IN OAUTH ALLOWLIST")
    note("These are the ones external clients (Claude, Cursor, ChatGPT) can actually call.")
    oauth = data.get("oauth_exposed", [])
    if not oauth:
        note("No builtin tools found in agentsam_mcp_oauth_tool_allowlist.")
    else:
        lines.append(f"  Count: {len(oauth)} rows (may include multiple client_id entries per tool)")
        blank()
        row("TOOL_KEY", "CLIENT_ID", "ACCESS_CLASS", "ALLOWLIST_ACTIVE", "RISK", "NEEDS_APPROVAL")
        row("-"*30, "-"*25, "-"*12, "-"*16, "-"*8, "-"*14)
        for r in oauth:
            row(
                r.get("tool_key"),
                r.get("client_id"),
                r.get("access_class"),
                r.get("allowlist_active"),
                r.get("risk_level"),
                r.get("requires_approval", 0),
            )
        blank()
        exposed_keys = list({r.get("tool_key") for r in oauth})
        warn(f"{len(exposed_keys)} BUILTIN tool(s) are currently externally exposed via OAuth.")
        note("These MUST be correctly categorized before the OAuth allowlist is considered clean.")
        for k in sorted(exposed_keys):
            item(k)

    # ── 5. User allowlist ─────────────────────────────────────────────────────
    h1("5. BUILTIN TOOLS IN USER/WORKSPACE ALLOWLIST")
    user_al = data.get("user_allowlist", [])
    if not user_al:
        note("No builtin tools found in agentsam_mcp_allowlist.")
    else:
        lines.append(f"  Count: {len(user_al)}")
        blank()
        row("TOOL_KEY", "USER_ID", "WORKSPACE_ID", "IS_ALLOWED", "RISK_OVERRIDE",
            "MAX_CALLS/DAY", "NEEDS_APPROVAL", "GRANTED_BY")
        row("-"*30, "-"*20, "-"*15, "-"*10, "-"*13, "-"*13, "-"*14, "-"*15)
        for r in user_al:
            row(
                r.get("tool_key"),
                (r.get("user_id") or "")[:18],
                (r.get("workspace_id") or "")[:13],
                r.get("is_allowed", 1),
                r.get("risk_level_override") or "—",
                r.get("max_calls_per_day") or "—",
                r.get("user_requires_approval", 0),
                (r.get("granted_by") or "—")[:13],
            )

    # ── 6. Capability aliases ─────────────────────────────────────────────────
    h1("6. BUILTIN TOOLS WITH CAPABILITY ALIASES")
    aliases = data.get("capability_aliases", [])
    if not aliases:
        note("No capability aliases found pointing at builtin tools.")
    else:
        lines.append(f"  Count: {len(aliases)}")
        blank()
        row("ABSTRACT_CAPABILITY", "MATCH_VALUE", "LANE", "PRIORITY",
            "IS_MUTATION", "NEEDS_APPROVAL", "RATIONALE")
        row("-"*30, "-"*25, "-"*10, "-"*8, "-"*11, "-"*14, "-"*35)
        for r in aliases:
            row(
                r.get("abstract_capability"),
                r.get("match_value"),
                r.get("capability_lane"),
                r.get("priority"),
                r.get("is_mutation", 0),
                r.get("requires_approval", 0),
                (r.get("rationale") or "—")[:33],
            )

    # ── 7. Workflows referencing builtins ─────────────────────────────────────
    h1("7. WORKFLOWS REFERENCING BUILTIN TOOLS")
    workflows = data.get("workflow_refs", [])
    if not workflows:
        note("No active workflows found referencing builtin tools in tools_json.")
    else:
        lines.append(f"  Count: {len(workflows)} workflow(s)")
        blank()
        warn("These workflows will be affected by handler_type migration. Review tools_json.")
        blank()
        for w in workflows:
            h3(f"{w.get('workflow_key')} — {w.get('display_name')}")
            item(f"category:         {w.get('category') or '—'}")
            item(f"risk_level:       {w.get('risk_level') or '—'}")
            item(f"requires_approval:{w.get('requires_approval', 0)}")
            item(f"status:           {w.get('status')}")
            item(f"workspace_id:     {w.get('workspace_id') or 'global'}")
            # Parse tools_json to show which specific tools are referenced
            try:
                tools_in_workflow = json.loads(w.get("tools_json") or "[]")
            except (json.JSONDecodeError, TypeError):
                tools_in_workflow = []
            if tools_in_workflow:
                item(f"tools_json:       {', '.join(str(t) for t in tools_in_workflow[:10])}")

    # ── 8. Server breakdown ───────────────────────────────────────────────────
    h1("8. BUILTIN TOOLS WITH SERVER ASSIGNMENTS")
    servers = data.get("server_breakdown", [])
    if not servers:
        note("No builtin tools have a server_key or server_id assigned.")
    else:
        lines.append(f"  Count: {len(servers)}")
        blank()
        note("Tools with server assignments are likely MCP-proxied, not truly 'builtin'.")
        note("These are strong candidates for handler_type = their server's category.")
        blank()
        row("TOOL_KEY", "SERVER_KEY", "SERVER_URL", "AUTH_TYPE", "SERVER_HEALTH")
        row("-"*30, "-"*20, "-"*35, "-"*10, "-"*13)
        for r in servers:
            row(
                r.get("tool_key"),
                r.get("server_key") or "—",
                (r.get("server_url") or r.get("mcp_service_url") or "—")[:33],
                r.get("server_auth_type") or "—",
                r.get("server_health") or "—",
            )

    # ── 9. Never-used active builtins ─────────────────────────────────────────
    h1("9. ACTIVE BUILTIN TOOLS NEVER USED")
    never_used = data.get("never_used", [])
    if not never_used:
        note("All active builtin tools have been used at least once.")
    else:
        lines.append(f"  Count: {len(never_used)}")
        blank()
        warn(f"{len(never_used)} active builtin tool(s) have NEVER been called.")
        note("These are candidates for deactivation during migration rather than recategorization.")
        blank()
        row("TOOL_KEY", "TOOL_CATEGORY", "RISK", "NEEDS_APPROVAL", "WORKSPACE_SCOPE", "CREATED_AT")
        row("-"*30, "-"*15, "-"*8, "-"*14, "-"*16, "-"*20)
        for r in never_used:
            row(
                r.get("tool_key"),
                r.get("tool_category") or "—",
                r.get("risk_level") or "—",
                r.get("requires_approval", 0),
                r.get("workspace_scope") or "—",
                r.get("created_at") or "—",
            )

    # ── 10. High-risk builtins ────────────────────────────────────────────────
    h1("10. HIGH-RISK AND CRITICAL BUILTIN TOOLS")
    high_risk = data.get("high_risk", [])
    if not high_risk:
        note("No builtin tools with risk_level = high or critical found.")
    else:
        warn(f"{len(high_risk)} builtin tool(s) are HIGH or CRITICAL risk.")
        note("These must have requires_approval=1 confirmed before migration ships.")
        blank()
        row("TOOL_KEY", "RISK_LEVEL", "NEEDS_APPROVAL", "IS_ACTIVE",
            "LAST_USED", "WORKSPACE_SCOPE")
        row("-"*30, "-"*10, "-"*14, "-"*9, "-"*20, "-"*16)
        for r in high_risk:
            row(
                r.get("tool_key"),
                r.get("risk_level"),
                r.get("requires_approval", 0),
                r.get("is_active", 1),
                r.get("last_used_at") or "NEVER",
                r.get("workspace_scope") or "—",
            )

    # ── 11. Workspace scope breakdown ─────────────────────────────────────────
    h1("11. BUILTIN TOOLS BY WORKSPACE SCOPE")
    ws_break = data.get("workspace_scope_breakdown", [])
    if ws_break:
        row("WORKSPACE_SCOPE", "TOTAL", "ACTIVE")
        row("-"*20, "-"*7, "-"*7)
        for r in ws_break:
            row(r.get("workspace_scope"), r.get("n"), r.get("active"))

    # ── 12. Cursor migration instructions ────────────────────────────────────
    h1("12. CURSOR INSTRUCTIONS — DO NOT SKIP")
    blank()
    lines.append("  This section is a direct QC handoff to Cursor.")
    lines.append("  Read every point before writing any migration SQL.")
    blank()
    lines.append("  STEP 1 — CONFIRM LIVE DATA")
    lines.append("    The queries above were run against the live D1 database.")
    lines.append("    Before writing any migration, Cursor must re-run Section 1")
    lines.append("    (handler type distribution) and confirm the numbers still match.")
    lines.append("    If they differ, stop and ask Sam.")
    blank()
    lines.append("  STEP 2 — USE SECTION 3a AS YOUR MIGRATION MAP")
    lines.append("    The suggested groupings in Section 3a are pattern-based estimates.")
    lines.append("    For every tool_key listed under 'needs_manual_review', do not")
    lines.append("    assign a handler_type without Sam confirming the correct one.")
    lines.append("    Never assign 'builtin' as the migration target. It is the problem.")
    blank()
    lines.append("  STEP 3 — MIGRATION MUST BE IDEMPOTENT")
    lines.append("    The migration SQL must be safe to run twice without corrupting data.")
    lines.append("    Use UPDATE ... WHERE handler_type = 'builtin' AND tool_key = '...'")
    lines.append("    Never use a blanket UPDATE without a WHERE clause on tool_key.")
    blank()
    lines.append("  STEP 4 — BACKUP BEFORE ANY WRITE")
    lines.append("    Follow the rule: .bak snapshot before any patch touches these rows.")
    lines.append("    Recommended: SELECT * INTO a staging query first, review, then UPDATE.")
    blank()
    lines.append("  STEP 5 — HIGH-RISK TOOLS (Section 10)")
    lines.append("    Any tool in Section 10 must have requires_approval=1 CONFIRMED")
    lines.append("    before its handler_type is changed. Do not touch risk without")
    lines.append("    Sam's explicit sign-off.")
    blank()
    lines.append("  STEP 6 — OAUTH-EXPOSED TOOLS (Section 4)")
    lines.append("    Every tool in Section 4 is live and externally callable right now.")
    lines.append("    Their migration must not change their tool_key or is_active status.")
    lines.append("    Only handler_type and tool_category should change in this pass.")
    blank()
    lines.append("  STEP 7 — NEVER-USED TOOLS (Section 9)")
    lines.append("    Do not auto-activate or auto-categorize never-used tools.")
    lines.append("    Recommend deactivating them (is_active=0) instead of migrating.")
    lines.append("    Present the list to Sam before touching them.")
    blank()
    lines.append("  STEP 8 — DO NOT INVENT HANDLER TYPES")
    lines.append("    Only use handler_type values that appear in Section 2 (existing)")
    lines.append("    or that Sam explicitly approves from the Section 3a suggestions.")
    lines.append("    Do not create new handler_type values without confirmation.")

    # ── 13. Summary stats ─────────────────────────────────────────────────────
    h1("13. SUMMARY")
    inv = data.get("builtin_inventory", [])
    oauth_exposed = data.get("oauth_exposed", [])
    never = data.get("never_used", [])
    hr = data.get("high_risk", [])
    srv = data.get("server_breakdown", [])
    wf = data.get("workflow_refs", [])

    exposed_unique = len({r.get("tool_key") for r in oauth_exposed})

    lines.append(f"  Total builtin tools found:          {len(inv)}")
    lines.append(f"  Currently externally OAuth-exposed: {exposed_unique}")
    lines.append(f"  Active but never used:              {len(never)}")
    lines.append(f"  High/critical risk:                 {len(hr)}")
    lines.append(f"  Have server assignments:            {len(srv)}")
    lines.append(f"  Referenced in active workflows:     {len(wf)}")
    blank()

    # Suggestion summary
    buckets = defaultdict(int)
    for tool in inv:
        s = suggest_handler_type(
            tool.get("tool_key",""), tool.get("tool_category",""),
            tool.get("mcp_service_url",""), tool.get("server_key",""),
            tool.get("description",""))
        buckets[s] += 1

    lines.append("  SUGGESTED MIGRATION BREAKDOWN:")
    for suggested_type, count in sorted(buckets.items(), key=lambda x: -x[1]):
        bar = "█" * min(count, 40)
        lines.append(f"    {suggested_type:<28} {count:>4}  {bar}")

    blank()
    lines.append(f"  Report complete. Attach this file to the migration PR.")
    lines.append(f"  File written: {timestamp}")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Audit handler_type in agentsam_mcp_tools against live D1"
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Also write raw query results as JSON alongside the report"
    )
    parser.add_argument(
        "--out", default=".",
        help="Output directory for report files (default: current directory)"
    )
    args = parser.parse_args()

    repo_root = find_repo_root()
    env = load_env(repo_root)

    account_id = env.get("CLOUDFLARE_ACCOUNT_ID")
    api_token = env.get("CLOUDFLARE_API_TOKEN")

    if not account_id or not api_token:
        print("ERROR: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.", file=sys.stderr)
        print(f"  Searched env files: {[str(repo_root / f) for f in ENV_FILES]}", file=sys.stderr)
        sys.exit(1)

    timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%SZ")

    print(f"Connecting to D1: {D1_DATABASE_NAME} ({D1_DATABASE_ID})")
    print(f"Account: {account_id[:8]}...{account_id[-4:]}")
    print()

    queries = [
        ("distribution",              "handler type distribution",              q_handler_type_distribution),
        ("non_builtin",               "non-builtin handler types",              q_all_handler_types_non_builtin),
        ("builtin_inventory",         "full builtin inventory",                 q_builtin_full_inventory),
        ("oauth_exposed",             "builtin tools in OAuth allowlist",       q_builtin_in_oauth_allowlist),
        ("user_allowlist",            "builtin tools in user allowlist",        q_builtin_in_user_allowlist),
        ("capability_aliases",        "builtin capability aliases",             q_builtin_capability_aliases),
        ("workflow_refs",             "workflows referencing builtins",         q_builtin_in_workflows),
        ("server_breakdown",          "builtin tools with server assignments",  q_builtin_server_breakdown),
        ("never_used",                "active builtins never used",             q_builtin_never_used_active),
        ("high_risk",                 "high-risk builtins",                     q_builtin_high_risk),
        ("workspace_scope_breakdown", "workspace scope breakdown",              q_workspace_scope_breakdown_builtin),
    ]

    data = {}
    for key, label, query_fn in queries:
        print(f"  Querying: {label}...", end="", flush=True)
        try:
            result = query_fn(account_id, api_token)
            data[key] = result
            print(f" {len(result)} rows")
        except RuntimeError as e:
            print(f" FAILED: {e}")
            data[key] = []

    print()
    print("Building report...")

    report_text = build_report(data, timestamp)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    report_path = out_dir / f"handler_type_audit_{timestamp}.txt"
    report_path.write_text(report_text, encoding="utf-8")
    print(f"Report written: {report_path}")

    if args.json:
        json_path = out_dir / f"handler_type_audit_{timestamp}.json"
        json_path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        print(f"JSON written:   {json_path}")

    print()
    # Print summary to stdout for quick read
    for line in report_text.splitlines():
        if any(line.strip().startswith(x) for x in ["===", "Total builtin", "Currently externally", "  SUGGESTED", "  ***"]):
            print(line)

    print()
    print("Done.")


if __name__ == "__main__":
    main()
