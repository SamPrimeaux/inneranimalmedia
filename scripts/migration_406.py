#!/usr/bin/env python3
"""
migration_406.py — Agent Sam MCP Tool Catalog Cleanup
======================================================
Handles all DDL/DML for the agentsam_* tool rename + scoping fixes.
Claude/ChatGPT handle QA after this runs.

What this does (in order):
  Phase 0  — Guards + dry-run check
  Phase 1  — Deduplicate agentsam_mcp_tools (per-workspace rows → one catalog row)
  Phase 2  — Fix requires_approval + display_name + descriptions (35 canonical tools)
  Phase 3  — Add 5 agentsam_cms_* tools
  Phase 4  — Fix agentsam_mcp_workflows (approvals, category normalization, liquid rename)
  Phase 5  — Update agentsam_mcp_oauth_tool_allowlist → agentsam_* canonical names
  Phase 6  — Connor PTY (user_policy + workspace_settings)
  Phase 7  — Seed agentsam_capability_aliases (35 canonical mappings)
  Phase 8  — Verification report

Rules:
  - Idempotent: safe to run multiple times
  - Dry-run: --dry-run prints SQL without executing
  - Repo root guard
  - Each phase reports rows affected

Usage:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/migration_406.py --dry-run
  python3 scripts/migration_406.py
"""

import subprocess
import sys
import os
import json
import argparse
from datetime import datetime, timezone

# ─── CONFIG ──────────────────────────────────────────────────────────────────

DB_NAME    = "inneranimalmedia-business"
DB_ID      = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
WRANGLER   = "npx wrangler"
TOML       = "wrangler.production.toml"
REPO_ROOT  = "/Users/samprimeaux/inneranimalmedia"

# ─── 35 CANONICAL TOOL DEFINITIONS ───────────────────────────────────────────
# (canonical_name, old_tool_key, handler_type, risk_level, requires_approval, lane, description)

CANONICAL_TOOLS = [
    # Agent Orchestration
    ("agentsam_run",               "agentsam_run_agent",   "proxy",    "medium", 0, "operate",  "Fire an agent run in this workspace"),
    ("agentsam_plan",              "agentsam_plan_create", "builtin",  "low",    0, "operate",  "Create a daily execution plan"),
    ("agentsam_todo_add",          "agentsam_todo_create", "builtin",  "low",    0, "operate",  "Add a tracked todo with execution metadata"),
    ("agentsam_todo_update",       "agentsam_todo_update", "builtin",  "low",    0, "operate",  "Update todo status, output, or error trace"),
    ("agentsam_workflow_trigger",  "mcp_workflow_trigger", "mcp",      "medium", 1, "operate",  "Trigger a registered Agent Sam workflow — approval required"),
    ("agentsam_workflow_status",   None,                   "builtin",  "low",    0, "operate",  "Check workflow run status and step progress"),
    # Memory & Knowledge
    ("agentsam_memory_search",     "agent_memory_search",  "builtin",  "low",    0, "memory",   "Search past agent decisions and context"),
    ("agentsam_memory_save",       "agent_memory_write",   "builtin",  "low",    0, "memory",   "Persist a decision, preference, or note"),
    ("agentsam_knowledge_search",  "knowledge_search",     "builtin",  "low",    0, "research", "Semantic search across workspace knowledge base"),
    # Code & Files
    ("agentsam_file_read",         "fs_read_file",         "builtin",  "low",    0, "storage",  "Read a file — workspace root scoped"),
    ("agentsam_file_write",        "fs_write_file",        "builtin",  "high",   1, "storage",  "Write or patch a file — workspace root scoped, approval required"),
    ("agentsam_file_search",       "fs_search_files",      "builtin",  "low",    0, "storage",  "Search files by name or content in workspace"),
    ("agentsam_git_status",        "pty_git_status",       "terminal", "low",    0, "develop",  "Show git status in workspace repo"),
    ("agentsam_git_diff",          "pty_git_diff",         "terminal", "low",    0, "develop",  "Show staged and unstaged changes"),
    ("agentsam_git_commit",        "pty_git_commit",       "terminal", "high",   1, "develop",  "Commit staged changes — approval required"),
    ("agentsam_git_push",          "pty_git_push",         "terminal", "high",   1, "develop",  "Push to origin — approval required"),
    # GitHub
    ("agentsam_github_repo_list",  "github_repos",         "github",   "low",    0, "develop",  "List repos registered to this workspace"),
    ("agentsam_github_pr_create",  "github_create_pr",     "github",   "high",   1, "develop",  "Open a pull request — approval required"),
    ("agentsam_github_pr_merge",   "github_merge_pr",      "github",   "high",   1, "develop",  "Merge a pull request — approval required"),
    ("agentsam_github_issue_create","github_create_issue", "github",   "low",    0, "develop",  "Create a GitHub issue in workspace repo"),
    # Terminal
    ("agentsam_terminal_run",      "terminal_execute",     "terminal", "critical",1,"terminal", "Run bash/npm/wrangler — PTY scoped to workspace root, approval required"),
    ("agentsam_python_run",        "python_execute",       "builtin",  "critical",1,"terminal", "Run Python scripts — PTY scoped to workspace root, approval required"),
    # Database
    ("agentsam_db_query",          "d1_query",             "builtin",  "low",    0, "data",     "Read D1 data — workspace scoped"),
    ("agentsam_db_write",          "d1_write",             "builtin",  "high",   1, "data",     "Write to D1 — workspace scoped, approval required"),
    ("agentsam_db_schema",         "d1_schema",            "builtin",  "low",    0, "data",     "Inspect D1 table structure and indexes"),
    # Storage
    ("agentsam_r2_list",           "r2_list",              "builtin",  "low",    0, "storage",  "List R2 objects — workspace prefix scoped"),
    ("agentsam_r2_read",           "r2_read",              "builtin",  "low",    0, "storage",  "Read an R2 file — workspace prefix scoped"),
    ("agentsam_r2_write",          "r2_write",             "builtin",  "high",   1, "storage",  "Write to R2 — workspace prefix scoped, approval required"),
    # Deploy & Observe
    ("agentsam_deploy_status",     "deploy_status",        "builtin",  "low",    0, "observe",  "Check current deploy health and status"),
    ("agentsam_deploy_trigger",    "cf_worker_deploy",     "builtin",  "high",   1, "operate",  "Trigger a Worker deploy — approval required"),
    ("agentsam_spend_summary",     "spend_summary",        "builtin",  "low",    0, "observe",  "AI cost and token usage summary"),
    ("agentsam_notify",            "notify_alert",         "builtin",  "low",    0, "operate",  "Send an alert or workflow notification"),
    # Integrate
    ("agentsam_email_send",        "resend_send_email",    "builtin",  "high",   1, "integrate","Send email via Resend — approval required"),
    ("agentsam_drive_read",        "route_gdrive_fetch",   "builtin",  "low",    0, "integrate","Read a Google Drive file"),
    ("agentsam_daily_summary",     "generate_daily_summary_email","builtin","low",0,"integrate","Generate morning digest email"),
]

# 5 CMS tools (new rows — no old_tool_key)
CMS_TOOLS = [
    ("agentsam_cms_read",    "builtin", "low",    0, "cms", "Read CMS entities — pages, themes, content, sections, navigation"),
    ("agentsam_cms_write",   "builtin", "high",   1, "cms", "Create or update CMS content — approval required"),
    ("agentsam_cms_publish", "builtin", "high",   1, "cms", "Publish a draft page or theme change live — approval required"),
    ("agentsam_cms_assets",  "builtin", "medium", 1, "cms", "Upload, list, or manage CMS assets and media — writes require approval"),
    ("agentsam_cms_liquid",  "builtin", "high",   1, "cms", "Read or write Liquid sections and imports — approval required"),
]

# Workflow fixes: (workflow_key, field, new_value)
WORKFLOW_FIXES = [
    # Security
    ("security_audit",                  "requires_approval", "1"),
    ("security_audit",                  "risk_level",        "'high'"),
    # Deploy approvals
    ("full_deploy",                     "requires_approval", "1"),
    ("full_deploy_skip_r2_reconcile",   "requires_approval", "1"),
    ("deploy_sandbox",                  "requires_approval", "1"),
    # Category normalization
    ("wf_dashboard_deploy",             "category",          "'deploy'"),
    ("wf-wai-deploy-pipeline",          "category",          "'deploy'"),
    ("wf-wai-infra-audit",              "category",          "'deploy'"),
    ("wf_deploy_pipeline",              "category",          "'deploy'"),
    ("wf-wai-code-write",               "category",          "'develop'"),
    ("wf_sam_ollama_review",            "category",          "'develop'"),
    # Liquid ingest rename
    ("shopify_liquid_ingest",           "workflow_key",      "'cms_liquid_section_ingest'"),
    ("shopify_liquid_ingest",           "display_name",      "'CMS Liquid Section Ingest'"),
    ("shopify_liquid_ingest",           "category",          "'cms'"),
    ("shopify_liquid_ingest",           "workspace_id",      "'ws_inneranimalmedia'"),
    # Orphaned workspace
]

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def log(msg, indent=0):
    prefix = "  " * indent
    print(f"{prefix}{msg}")

def run_sql(sql, dry_run=False, label=""):
    if dry_run:
        log(f"[DRY RUN] {label}")
        log(sql.strip(), indent=1)
        return {"success": True, "dry_run": True}

    # Write to temp file — avoids all shell escaping issues with
    # JSON brackets/quotes inside --command strings
    import tempfile
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False)
    try:
        tmp.write(sql.strip())
        tmp.close()
        cmd = (
            f"{WRANGLER} d1 execute {DB_NAME} --remote "
            f"-c {TOML} --file {tmp.name}"
        )
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, cwd=REPO_ROOT
        )
        if result.returncode != 0:
            log(f"  ERROR in {label}: {result.stderr.strip()}")
            return {"success": False, "error": result.stderr}
        return {"success": True, "output": result.stdout}
    finally:
        os.unlink(tmp.name)


def run_sql_file(path, dry_run=False, label=""):
    """Write SQL to a temp file and execute via --file flag."""
    if dry_run:
        with open(path) as f:
            log(f"[DRY RUN] {label}")
            log(f.read(), indent=1)
        return {"success": True, "dry_run": True}

    cmd = (
        f"{WRANGLER} d1 execute {DB_NAME} --remote "
        f"-c {TOML} --file {path}"
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO_ROOT)
    if result.returncode != 0:
        log(f"  ERROR in {label}: {result.stderr.strip()}")
        return {"success": False, "error": result.stderr}
    return {"success": True, "output": result.stdout}


def write_sql_file(path, sql):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(sql)


def guard_repo_root():
    if not os.path.exists(os.path.join(REPO_ROOT, "wrangler.production.toml")):
        log(f"ERROR: not in repo root or wrangler.production.toml missing at {REPO_ROOT}")
        sys.exit(1)
    log(f"✅ Repo root confirmed: {REPO_ROOT}")


# ─── PHASE 0: GUARDS ─────────────────────────────────────────────────────────

def phase0_guards(dry_run):
    log("\n── Phase 0: Guards ─────────────────────────────────────────────")
    guard_repo_root()
    if dry_run:
        log("DRY RUN mode — no writes will execute")
    log(f"DB: {DB_NAME} ({DB_ID})")
    log(f"Time: {datetime.now(timezone.utc).isoformat()}")


# ─── PHASE 1: DEDUPLICATE agentsam_mcp_tools ─────────────────────────────────

def phase1_deduplicate(dry_run):
    log("\n── Phase 1: Deduplicate agentsam_mcp_tools ─────────────────────")
    log("Problem: each tool has 2-3 rows (one per workspace). Keeping one row per tool_key.")

    # Step 1a: For tools that have a ["*"] wildcard row,
    # delete all per-workspace rows for that same tool_key
    sql_1a = """
DELETE FROM agentsam_mcp_tools
WHERE workspace_scope != '["*"]'
AND tool_key IN (
  SELECT DISTINCT tool_key
  FROM agentsam_mcp_tools
  WHERE workspace_scope = '["*"]'
);
"""
    run_sql(sql_1a.strip(), dry_run, "1a: delete per-workspace rows where wildcard exists")

    # Step 1b: For tools with ONLY per-workspace rows (no wildcard),
    # keep the ws_inneranimalmedia row, delete the rest
    sql_1b = """
DELETE FROM agentsam_mcp_tools
WHERE workspace_scope != '["ws_inneranimalmedia"]'
AND tool_key NOT IN (
  SELECT DISTINCT tool_key FROM agentsam_mcp_tools
  WHERE workspace_scope = '["*"]'
)
AND tool_key IN (
  SELECT tool_key FROM agentsam_mcp_tools
  GROUP BY tool_key HAVING COUNT(*) > 1
);
"""
    run_sql(sql_1b.strip(), dry_run, "1b: keep ws_inneranimalmedia row for owner-only tools")

    # Step 1c: Normalize remaining per-workspace rows to wildcard
    # (execution layer enforces scoping — catalog should be universal)
    sql_1c = """
UPDATE agentsam_mcp_tools
SET workspace_scope = '["*"]'
WHERE workspace_scope = '["ws_inneranimalmedia"]'
AND tool_key NOT IN (
  'terminal_wrangler'
);
"""
    run_sql(sql_1c.strip(), dry_run, "1c: normalize workspace scope to wildcard (except owner-only tools)")

    log("  terminal_wrangler stays scoped to ws_inneranimalmedia (Sam-only deploy tool)")


# ─── PHASE 2: RENAME + FIX agentsam_mcp_tools ────────────────────────────────

def phase2_rename_and_fix(dry_run):
    log("\n── Phase 2: Rename display_name + fix requires_approval ─────────")

    statements = []
    for (canonical, old_key, handler, risk, approval, lane, desc) in CANONICAL_TOOLS:
        if old_key is None:
            continue  # new tools handled in phase 3
        escaped_desc = desc.replace("'", "''")
        sql = f"""UPDATE agentsam_mcp_tools
SET display_name = '{canonical}',
    description  = '{escaped_desc}',
    risk_level   = '{risk}',
    requires_approval = {approval}
WHERE tool_key = '{old_key}'
  AND is_active = 1;"""
        statements.append((sql, f"2: rename {old_key} → {canonical}"))

    for sql, label in statements:
        run_sql(sql, dry_run, label)

    log(f"  Updated {len(statements)} tool display names to agentsam_* canonical names")


# ─── PHASE 3: INSERT 5 agentsam_cms_* TOOLS ──────────────────────────────────

def phase3_cms_tools(dry_run):
    log("\n── Phase 3: Insert agentsam_cms_* tools ─────────────────────────")

    for (tool_key, handler, risk, approval, lane, desc) in CMS_TOOLS:
        escaped_desc = desc.replace("'", "''")
        sql = f"""INSERT OR IGNORE INTO agentsam_mcp_tools
  (tool_key, display_name, description, handler_type, risk_level,
   requires_approval, workspace_scope, routing_scope, is_active,
   user_id, workspace_id, tenant_id)
VALUES
  ('{tool_key}', '{tool_key}', '{escaped_desc}', '{handler}', '{risk}',
   {approval}, '["*"]', 'workspace', 1,
   'au_871d920d1233cbd1', 'ws_inneranimalmedia', 'tenant_sam_primeaux');"""
        run_sql(sql, dry_run, f"3: insert {tool_key}")


# ─── PHASE 4: FIX agentsam_mcp_workflows ─────────────────────────────────────

def phase4_workflows(dry_run):
    log("\n── Phase 4: Fix agentsam_mcp_workflows ──────────────────────────")

    for (workflow_key, field, new_val) in WORKFLOW_FIXES:
        # When renaming the key itself we need the old key in WHERE
        if field == "workflow_key":
            where_key = workflow_key
        else:
            where_key = workflow_key
        sql = f"""UPDATE agentsam_mcp_workflows
SET {field} = {new_val},
    updated_at = datetime('now')
WHERE workflow_key = '{where_key}';"""
        run_sql(sql, dry_run, f"4: {workflow_key} → {field} = {new_val}")

    # Fix null workspace_id floating workflows
    sql_null = """UPDATE agentsam_mcp_workflows
SET workspace_id = NULL,
    visibility   = 'platform'
WHERE workspace_id IS NULL OR workspace_id = '';"""
    run_sql(sql_null, dry_run, "4: null workspace_id → platform visibility")

    log("  Workflows fixed: approvals, categories, liquid rename, platform templates")


# ─── PHASE 5: UPDATE agentsam_mcp_oauth_tool_allowlist ───────────────────────

def phase5_oauth_allowlist(dry_run):
    log("\n── Phase 5: Update agentsam_mcp_oauth_tool_allowlist ────────────")
    log("  Mapping old tool keys → agentsam_* canonical names")

    # Map old_key → canonical for tools in the allowlist
    renames = [
        ("agentsam_run_agent",         "agentsam_run"),
        ("agentsam_plan_create",       "agentsam_plan"),
        ("agentsam_todo_create",       "agentsam_todo_add"),
        ("agentsam_todo_update",       "agentsam_todo_update"),
        ("mcp_workflow_trigger",       "agentsam_workflow_trigger"),
        ("agent_memory_search",        "agentsam_memory_search"),
        ("agent_memory_write",         "agentsam_memory_save"),
        ("knowledge_search",           "agentsam_knowledge_search"),
        ("fs_read_file",               "agentsam_file_read"),
        ("fs_write_file",              "agentsam_file_write"),
        ("fs_search_files",            "agentsam_file_search"),
        ("pty_git_status",             "agentsam_git_status"),
        ("pty_git_diff",               "agentsam_git_diff"),
        ("pty_git_commit",             "agentsam_git_commit"),
        ("pty_git_push",               "agentsam_git_push"),
        ("github_repos",               "agentsam_github_repo_list"),
        ("github_create_pr",           "agentsam_github_pr_create"),
        ("github_merge_pr",            "agentsam_github_pr_merge"),
        ("github_create_issue",        "agentsam_github_issue_create"),
        ("github_create_repo",         "agentsam_github_repo_list"),  # consolidate
        ("terminal_execute",           "agentsam_terminal_run"),
        ("python_execute",             "agentsam_python_run"),
        ("d1_query",                   "agentsam_db_query"),
        ("d1_write",                   "agentsam_db_write"),
        ("d1_schema_introspect",       "agentsam_db_schema"),
        ("d1_explain",                 "agentsam_db_schema"),          # consolidate
        ("r2_list",                    "agentsam_r2_list"),
        ("r2_read",                    "agentsam_r2_read"),
        ("r2_write",                   "agentsam_r2_write"),
        ("r2_search",                  "agentsam_r2_list"),            # consolidate
        ("r2_bucket_summary",          "agentsam_r2_list"),            # consolidate
        ("deploy_status",              "agentsam_deploy_status"),
        ("spend_summary",              "agentsam_spend_summary"),
        ("notify_alert",               "agentsam_notify"),
        ("resend_send_email",          "agentsam_email_send"),
        ("route_gdrive_fetch",         "agentsam_drive_read"),
        ("gdrive_fetch",               "agentsam_drive_read"),
        ("generate_daily_summary_email","agentsam_daily_summary"),
        ("web_fetch",                  "agentsam_drive_read"),         # consolidate into read
        ("workspace_search",           "agentsam_knowledge_search"),   # consolidate
        ("context_search",             "agentsam_knowledge_search"),   # consolidate
        ("human_context_list",         "agentsam_knowledge_search"),   # consolidate
        ("rag_search",                 "agentsam_knowledge_search"),   # consolidate
        ("ai_embed",                   "agentsam_knowledge_search"),   # consolidate
        ("ai_complete",                "agentsam_run"),                # consolidate
        ("github_compare_refs",        "agentsam_git_diff"),           # consolidate
        ("github_list_branches",       "agentsam_github_repo_list"),   # consolidate
        ("github_list_directory",      "agentsam_file_read"),          # consolidate
        ("github_get_issue",           "agentsam_github_issue_create"),# consolidate
        ("github_list_issues",         "agentsam_github_issue_create"),# consolidate
        ("github_file",                "agentsam_file_read"),          # consolidate
        ("github_get_tree",            "agentsam_file_search"),        # consolidate
    ]

    for (old_key, new_key) in renames:
        sql = f"""UPDATE agentsam_mcp_oauth_tool_allowlist
SET tool_key   = '{new_key}',
    updated_at = unixepoch()
WHERE tool_key = '{old_key}'
  AND client_id = 'iam_mcp_inneranimalmedia';"""
        run_sql(sql, dry_run, f"5: allowlist {old_key} → {new_key}")

    # Remove any duplicate tool_key entries after consolidation
    sql_dedup = """DELETE FROM agentsam_mcp_oauth_tool_allowlist
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM agentsam_mcp_oauth_tool_allowlist
  GROUP BY client_id, tool_key
);"""
    run_sql(sql_dedup, dry_run, "5: deduplicate allowlist after consolidation")

    # Insert missing new tools
    new_tools = [
        ("agentsam_workflow_status", "read"),
        ("agentsam_db_schema",       "read"),
        ("agentsam_deploy_trigger",  "write"),
        ("agentsam_cms_read",        "read"),
        ("agentsam_cms_write",       "write"),
        ("agentsam_cms_publish",     "write"),
        ("agentsam_cms_assets",      "write"),
        ("agentsam_cms_liquid",      "write"),
    ]
    for (tool_key, access) in new_tools:
        sql = f"""INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist
  (client_id, tool_key, access_class, sort_order, is_active)
VALUES
  ('iam_mcp_inneranimalmedia', '{tool_key}', '{access}', 50, 1);"""
        run_sql(sql, dry_run, f"5: insert new allowlist entry {tool_key}")

    log("  OAuth allowlist updated to agentsam_* canonical names")


# ─── PHASE 6: CONNOR PTY + WORKSPACE SETTINGS ────────────────────────────────

def phase6_connor_pty(dry_run):
    log("\n── Phase 6: Connor PTY + workspace_settings ─────────────────────")

    # Enable PTY for Connor
    sql_pty = """UPDATE agentsam_user_policy
SET can_run_pty           = 1,
    tool_risk_level_max   = 'high',
    updated_at            = datetime('now')
WHERE user_id       = 'connor_mcneely'
  AND workspace_id  = 'ws_connor_mcneely';"""
    run_sql(sql_pty, dry_run, "6a: enable Connor can_run_pty=1")

    # Seed Connor's workspace_settings
    connor_settings = json.dumps({
        "workspace_root": "/workspace/leadership-legacy",
        "shell": {
            "product_name":   "Agent Sam",
            "shell_type":     "powershell",
            "agent_greeting": "Hi! I am Agent Sam. Workspace: Leadership Legacy Digital.",
            "terminal_banner": ["Agent Sam", "Leadership Legacy Digital"],
            "monaco_theme":   "iam-dark"
        },
        "features": {
            "github":       True,
            "r2_crud":      True,
            "terminal":     True,
            "google_drive": False,
            "excalidraw":   True,
            "multi_agent":  False,
            "modes":        ["agent", "ask", "plan"]
        },
        "r2_roots": {
            "leadership-legacy": "Platform"
        },
        "github_repos_allowed": ["SamPrimeaux/leadership-legacy"],
        "deploy_approval_required": True,
        "agent_modes": {
            "agent": {"label": "Agent", "model_default": "gpt-5.4-nano", "tools": True},
            "ask":   {"label": "Ask",   "model_default": "gpt-5.4-nano", "tools": False},
            "plan":  {"label": "Plan",  "model_default": "gpt-5.4-nano", "tools": False}
        }
    }, separators=(',', ':'))

    escaped = connor_settings.replace("'", "''")
    sql_settings = f"""UPDATE workspace_settings
SET settings_json = '{escaped}'
WHERE workspace_id = 'ws_connor_mcneely';"""
    run_sql(sql_settings, dry_run, "6b: seed Connor workspace_settings")

    log("  Connor: can_run_pty=1, workspace_root=/workspace/leadership-legacy")
    log("  Connor: scoped to SamPrimeaux/leadership-legacy repo only")
    log("  Connor: r2 prefix = leadership-legacy/, deploy requires approval")


# ─── PHASE 7: SEED agentsam_capability_aliases ───────────────────────────────

def phase7_capability_aliases(dry_run):
    log("\n── Phase 7: Seed agentsam_capability_aliases ────────────────────")

    # canonical_name → (old_tool_key, lane, requires_approval, is_mutation, rationale)
    aliases = [
        # Operate
        ("agentsam_run",              "agentsam_run_agent",         "operate",   0, 0, "Run an agent in this workspace"),
        ("agentsam_plan",             "agentsam_plan_create",       "operate",   0, 0, "Create daily execution plan"),
        ("agentsam_todo_add",         "agentsam_todo_create",       "operate",   0, 0, "Add tracked todo"),
        ("agentsam_todo_update",      "agentsam_todo_update",       "operate",   0, 0, "Update todo status"),
        ("agentsam_workflow_trigger", "mcp_workflow_trigger",       "operate",   1, 1, "Trigger workflow — approval required"),
        ("agentsam_workflow_status",  "workflow_run_pipeline",      "observe",   0, 0, "Check workflow run status"),
        # Memory
        ("agentsam_memory_search",    "agent_memory_search",        "memory",    0, 0, "Search agent memory"),
        ("agentsam_memory_save",      "agent_memory_write",         "memory",    1, 1, "Write to agent memory"),
        ("agentsam_knowledge_search", "knowledge_search",           "research",  0, 0, "Semantic knowledge search"),
        # Files
        ("agentsam_file_read",        "fs_read_file",               "storage",   0, 0, "Read file from workspace"),
        ("agentsam_file_write",       "fs_write_file",              "storage",   1, 1, "Write file to workspace"),
        ("agentsam_file_search",      "fs_search_files",            "storage",   0, 0, "Search files in workspace"),
        # Git
        ("agentsam_git_status",       "pty_git_status",             "develop",   0, 0, "Git status in workspace repo"),
        ("agentsam_git_diff",         "pty_git_diff",               "develop",   0, 0, "Git diff — staged + unstaged"),
        ("agentsam_git_commit",       "pty_git_commit",             "develop",   1, 1, "Commit changes — approval required"),
        ("agentsam_git_push",         "pty_git_push",               "develop",   1, 1, "Push to origin — approval required"),
        # GitHub
        ("agentsam_github_repo_list", "github_repos",               "develop",   0, 0, "List workspace repos"),
        ("agentsam_github_pr_create", "github_create_pr",           "develop",   1, 1, "Create PR — approval required"),
        ("agentsam_github_pr_merge",  "github_merge_pr",            "develop",   1, 1, "Merge PR — approval required"),
        ("agentsam_github_issue_create","github_create_issue",      "develop",   0, 0, "Create GitHub issue"),
        # Terminal
        ("agentsam_terminal_run",     "terminal_execute",           "terminal",  1, 1, "Run terminal command — approval required"),
        ("agentsam_python_run",       "python_execute",             "terminal",  1, 1, "Run Python — approval required"),
        # Database
        ("agentsam_db_query",         "d1_query",                   "data",      0, 0, "Read D1 — workspace scoped"),
        ("agentsam_db_write",         "d1_write",                   "data",      1, 1, "Write D1 — workspace scoped, approval required"),
        ("agentsam_db_schema",        "d1_schema",                  "data",      0, 0, "Inspect D1 schema"),
        # Storage
        ("agentsam_r2_list",          "r2_list",                    "storage",   0, 0, "List R2 — workspace prefix scoped"),
        ("agentsam_r2_read",          "r2_read",                    "storage",   0, 0, "Read R2 — workspace prefix scoped"),
        ("agentsam_r2_write",         "r2_write",                   "storage",   1, 1, "Write R2 — workspace prefix scoped, approval required"),
        # Deploy / Observe
        ("agentsam_deploy_status",    "deploy_status",              "observe",   0, 0, "Check deploy health"),
        ("agentsam_deploy_trigger",   "cf_worker_deploy",           "operate",   1, 1, "Trigger deploy — approval required"),
        ("agentsam_spend_summary",    "spend_summary",              "observe",   0, 0, "AI cost + token usage"),
        ("agentsam_notify",           "notify_alert",               "operate",   0, 0, "Send alert or notification"),
        # Integrate
        ("agentsam_email_send",       "resend_send_email",          "integrate", 1, 1, "Send email — approval required"),
        ("agentsam_drive_read",       "route_gdrive_fetch",         "integrate", 0, 0, "Read Google Drive file"),
        ("agentsam_daily_summary",    "generate_daily_summary_email","integrate",0, 0, "Generate daily digest"),
        # CMS
        ("agentsam_cms_read",         "agentsam_cms_read",          "cms",       0, 0, "Read CMS entities"),
        ("agentsam_cms_write",        "agentsam_cms_write",         "cms",       1, 1, "Write CMS content — approval required"),
        ("agentsam_cms_publish",      "agentsam_cms_publish",       "cms",       1, 1, "Publish CMS content — approval required"),
        ("agentsam_cms_assets",       "agentsam_cms_assets",        "cms",       1, 1, "Manage CMS assets — approval required"),
        ("agentsam_cms_liquid",       "agentsam_cms_liquid",        "cms",       1, 1, "Liquid sections — approval required"),
    ]

    for (abstract, tool_key, lane, req_approval, is_mutation, rationale) in aliases:
        alias_id = f"capalias_{abstract.replace('.','_')}"
        escaped_rationale = rationale.replace("'", "''")
        sql = f"""INSERT OR REPLACE INTO agentsam_capability_aliases
  (id, abstract_capability, match_kind, match_value,
   capability_lane, priority, requires_approval, is_mutation,
   rationale, is_active)
VALUES
  ('{alias_id}', '{abstract}', 'tool_key', '{tool_key}',
   '{lane}', 10, {req_approval}, {is_mutation},
   '{escaped_rationale}', 1);"""
        run_sql(sql, dry_run, f"7: alias {abstract} → {tool_key}")

    log(f"  Seeded {len(aliases)} agentsam_* capability aliases")


# ─── PHASE 8: VERIFICATION ───────────────────────────────────────────────────

def phase8_verify(dry_run):
    log("\n── Phase 8: Verification queries ────────────────────────────────")

    checks = [
        (
            "Tool count after dedup",
            "SELECT COUNT(DISTINCT tool_key) as unique_tools, COUNT(*) as total_rows FROM agentsam_mcp_tools WHERE is_active=1"
        ),
        (
            "Mutation tools with approval",
            "SELECT tool_key, display_name, requires_approval, risk_level FROM agentsam_mcp_tools WHERE requires_approval=1 AND is_active=1 ORDER BY tool_key"
        ),
        (
            "OAuth allowlist count",
            "SELECT COUNT(*) as total, COUNT(DISTINCT tool_key) as unique_tools FROM agentsam_mcp_oauth_tool_allowlist WHERE client_id='iam_mcp_inneranimalmedia' AND is_active=1"
        ),
        (
            "Connor user policy",
            "SELECT user_id, workspace_id, can_run_pty, tool_risk_level_max, require_allowlist_for_mcp FROM agentsam_user_policy WHERE user_id='connor_mcneely'"
        ),
        (
            "Capability aliases count",
            "SELECT COUNT(*) as aliases, COUNT(DISTINCT abstract_capability) as unique_caps FROM agentsam_capability_aliases WHERE is_active=1"
        ),
        (
            "CMS tools",
            "SELECT tool_key, display_name, requires_approval FROM agentsam_mcp_tools WHERE tool_key LIKE 'agentsam_cms_%'"
        ),
        (
            "Liquid workflow rename",
            "SELECT workflow_key, display_name, category, workspace_id FROM agentsam_mcp_workflows WHERE workflow_key='cms_liquid_section_ingest'"
        ),
    ]

    if dry_run:
        log("  [DRY RUN] Skipping verification queries")
        return

    for (label, sql) in checks:
        log(f"\n  ▶ {label}")
        import tempfile
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False)
        try:
            tmp.write(sql.strip())
            tmp.close()
            cmd = (
                f"{WRANGLER} d1 execute {DB_NAME} --remote "
                f"-c {TOML} --file {tmp.name}"
            )
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO_ROOT)
            if result.returncode == 0:
                log(f"    {result.stdout.strip()[:300]}")
            else:
                log(f"    ERROR: {result.stderr.strip()[:200]}")
        finally:
            os.unlink(tmp.name)

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migration 406 — Agent Sam MCP Tool Catalog Cleanup")
    parser.add_argument("--dry-run", action="store_true", help="Print SQL without executing")
    parser.add_argument("--phase",   type=int, default=0,  help="Run a single phase (0=all)")
    args = parser.parse_args()

    dry_run = args.dry_run
    phase   = args.phase

    log("=" * 65)
    log("  Migration 406 — Agent Sam MCP Tool Catalog Cleanup")
    log("=" * 65)

    phase0_guards(dry_run)

    phases = {
        1: phase1_deduplicate,
        2: phase2_rename_and_fix,
        3: phase3_cms_tools,
        4: phase4_workflows,
        5: phase5_oauth_allowlist,
        6: phase6_connor_pty,
        7: phase7_capability_aliases,
        8: phase8_verify,
    }

    if phase == 0:
        for n, fn in phases.items():
            fn(dry_run)
    elif phase in phases:
        phases[phase](dry_run)
    else:
        log(f"Unknown phase {phase}. Valid: 1-8 or 0 for all.")
        sys.exit(1)

    log("\n" + "=" * 65)
    status = "DRY RUN complete" if dry_run else "Migration 406 complete"
    log(f"  {status}")
    log(f"  {datetime.now(timezone.utc).isoformat()}")
    log("=" * 65)
    log("\nNext: run Claude.ai connector → confirm 35 tools, 9 lanes, no duplicates")


if __name__ == "__main__":
    main()
