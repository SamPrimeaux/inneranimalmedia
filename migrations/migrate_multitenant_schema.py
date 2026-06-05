#!/usr/bin/env python3
"""
Multi-tenant schema migration — inneranimalmedia-business D1
=====================================================================
Zero hardcoded workspace_id or tenant_id values anywhere in this script.
All tenant/workspace references are derived dynamically from live DB state.

Fixes applied:
  agentsam_routing_arms         remove hardcoded workspace_id default,
                                UNIQUE now includes workspace_id
  agentsam_eval_suites          remove hardcoded tenant_id and created_by defaults
  agentsam_eval_runs            remove hardcoded tenant_id default
  agentsam_eval_cases           remove hardcoded tenant_id default
  agentsam_tool_stats_compacted backfill placeholder workspace_ids via correlated
                                subquery on agentsam_workspace; drop placeholder default
  agentsam_workspace            remove hardcoded tenant_id default
  agentsam_commands             remove hardcoded workspace_id + tenant_id defaults,
                                UNIQUE(workspace_id, slug),
                                promote highest-count workspace → 'platform' sentinel

Usage:
  ./scripts/with-cloudflare-env.sh python3 migrations/migrate_multitenant_schema.py
  ./scripts/with-cloudflare-env.sh python3 migrations/migrate_multitenant_schema.py --dry-run
  ./scripts/with-cloudflare-env.sh python3 migrations/migrate_multitenant_schema.py --step 7
  ./scripts/with-cloudflare-env.sh python3 migrations/migrate_multitenant_schema.py --smoke-test
  ./scripts/with-cloudflare-env.sh python3 migrations/migrate_multitenant_schema.py --verify-only
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from textwrap import dedent

# ─── config ──────────────────────────────────────────────────────────────────

DB_NAME = "inneranimalmedia-business"
DRY_RUN = False
ERRORS  = []

# ─── terminal colours ────────────────────────────────────────────────────────

RST    = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
CYAN   = "\033[36m"

def log(msg, level="info"):
    icons = {
        "step":   f"\n{BOLD}{CYAN}━━ ",
        "ok":     f"  {GREEN}✓{RST} ",
        "err":    f"  {RED}✗{RST} ",
        "warn":   f"  {YELLOW}⚠{RST} ",
        "info":   f"  {DIM}·{RST} ",
        "verify": f"  {CYAN}~{RST} ",
    }
    tail = RST if level == "step" else ""
    print(f"{icons.get(level, '  ')}{msg}{tail}", flush=True)


# ─── wrangler I/O ────────────────────────────────────────────────────────────

def _run(sql: str, json_mode: bool = False) -> tuple[int, str, str]:
    """Write sql to a temp file, run wrangler, return (returncode, stdout, stderr)."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".sql", delete=False, dir="/tmp", prefix="iam_mig_"
    ) as f:
        f.write("PRAGMA foreign_keys = OFF;\n" + sql.strip() + "\n")
        path = f.name
    try:
        flags = "--json" if json_mode else ""
        result = subprocess.run(
            f"npx wrangler d1 execute {DB_NAME} --remote --file={path} {flags}",
            shell=True, capture_output=True, text=True, timeout=90,
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", "timeout"
    finally:
        if os.path.exists(path):
            os.unlink(path)


def exec_sql(sql: str, description: str, critical: bool = True) -> bool:
    """Execute a DDL/DML statement with logging."""
    if DRY_RUN:
        log(f"[dry] {description}", "info")
        preview = sql.replace("\n", " ").strip()[:140]
        print(f"       {DIM}{preview}{'…' if len(sql.strip()) > 140 else ''}{RST}")
        return True

    rc, out, err = _run(sql)
    if rc != 0:
        log(f"FAILED — {description}", "err")
        print(f"  {DIM}{err.strip()}{RST}")
        if critical:
            log("Halting. Tables ending in _new may need manual DROP before retry.", "warn")
            sys.exit(1)
        ERRORS.append(description)
        return False

    log(description, "ok")
    return True


def query(sql: str) -> list[dict]:
    """Run a SELECT, return list of row dicts. Returns [] on dry-run or error."""
    if DRY_RUN:
        return []
    rc, out, err = _run(sql, json_mode=True)
    if rc != 0:
        return []
    try:
        data = json.loads(out)
        return data[0].get("results", [])
    except Exception:
        return []


def scalar(sql: str, column: str, default=None):
    """Return a single scalar value from a query."""
    rows = query(sql)
    if rows:
        return rows[0].get(column, default)
    return default


def count(table: str) -> int:
    return scalar(f"SELECT COUNT(*) AS n FROM {table}", "n", -1)


# ─── pre-flight snapshot ─────────────────────────────────────────────────────

def snapshot() -> dict[str, int]:
    log("Pre-migration row counts", "step")
    tables = [
        "agentsam_routing_arms",
        "agentsam_eval_suites",
        "agentsam_eval_runs",
        "agentsam_eval_cases",
        "agentsam_tool_stats_compacted",
        "agentsam_workspace",
        "agentsam_commands",
    ]
    counts = {}
    for t in tables:
        n = count(t)
        counts[t] = n
        log(f"{t}: {n}", "info")
    return counts


def verify(before: dict[str, int]):
    log("Post-migration verification", "step")
    all_ok = True
    for table, expected in before.items():
        actual = count(table)
        if actual == expected or DRY_RUN:
            log(f"{table}: {expected} → {actual} ✓", "verify")
        else:
            log(f"{table}: expected {expected}, got {actual}", "err")
            all_ok = False
    return all_ok


# ─── step 1: backfill __placeholder__ workspace_ids ──────────────────────────
#
# Uses a correlated subquery against agentsam_workspace so no IDs are hardcoded.
# Picks the oldest workspace per tenant (created_at ASC) as the canonical match.

def step_1_backfill_tool_stats():
    log("step 1 — tool_stats_compacted: backfill placeholder workspace_ids", "step")

    # Show which rows are affected before touching anything
    affected = query(
        "SELECT tenant_id, workspace_id, COUNT(*) AS cnt "
        "FROM agentsam_tool_stats_compacted "
        "WHERE workspace_id = '__tenant__' "
        "GROUP BY tenant_id, workspace_id"
    )
    if affected:
        log("Rows with placeholder workspace_id:", "info")
        for row in affected:
            log(f"  tenant={row['tenant_id']}  workspace={row['workspace_id']}  rows={row['cnt']}", "info")

    exec_sql(
        dedent("""
            UPDATE agentsam_tool_stats_compacted
            SET workspace_id = (
                SELECT w.id
                FROM agentsam_workspace w
                WHERE w.tenant_id = agentsam_tool_stats_compacted.tenant_id
                ORDER BY w.created_at ASC
                LIMIT 1
            )
            WHERE workspace_id = '__tenant__'
        """),
        "correlated UPDATE: __tenant__ → workspace from agentsam_workspace"
    )

    # Verify no placeholder rows remain
    remaining = scalar(
        "SELECT COUNT(*) AS n FROM agentsam_tool_stats_compacted WHERE workspace_id = '__tenant__'",
        "n", -1
    )
    if remaining == 0:
        log("No placeholder rows remain", "ok")
    elif DRY_RUN:
        pass
    else:
        log(f"{remaining} placeholder rows still present — check tenant→workspace mapping", "warn")


# ─── helpers: generic recreate pattern ───────────────────────────────────────
#
# SQLite has no ALTER COLUMN. Pattern for every table:
#   1. CREATE TABLE _new  (corrected schema)
#   2. INSERT INTO _new SELECT … FROM old
#   3. DROP TABLE old
#   4. ALTER TABLE _new RENAME TO old
#   5. Recreate indexes

def recreate(
    table: str,
    create_ddl: str,
    insert_sql: str,
    indexes: list[str],
    description: str,
):
    log(f"step — {description}", "step")

    # Drop any stale _new from a previous failed run
    exec_sql(f"DROP TABLE IF EXISTS {table}_new", f"drop stale {table}_new if exists", critical=False)

    exec_sql(create_ddl, f"CREATE {table}_new")
    exec_sql(insert_sql, f"INSERT INTO {table}_new SELECT … FROM {table}")
    exec_sql(f"DROP TABLE {table}", f"DROP TABLE {table}")
    exec_sql(f"ALTER TABLE {table}_new RENAME TO {table}", f"RENAME → {table}")

    for idx_sql in indexes:
        # extract index name from sql for the log label
        name = idx_sql.split()[2] if len(idx_sql.split()) > 2 else "index"
        exec_sql(idx_sql, f"CREATE INDEX {name}")


# ─── step 2: agentsam_eval_suites ────────────────────────────────────────────

def step_2_eval_suites():
    recreate(
        table="agentsam_eval_suites",
        create_ddl=dedent("""
            CREATE TABLE agentsam_eval_suites_new (
              id          TEXT PRIMARY KEY DEFAULT ('evs_' || lower(hex(randomblob(8)))),
              tenant_id   TEXT NOT NULL,
              name        TEXT NOT NULL,
              description TEXT,
              provider    TEXT,
              mode        TEXT CHECK(mode IN (
                            'ask','plan','agent','debug','auto',
                            'ui_review','mcp','terminal','deploy','cost','context'
                          )) DEFAULT 'auto',
              task_type   TEXT,
              is_active   INTEGER DEFAULT 1,
              run_count   INTEGER DEFAULT 0,
              last_run_at TEXT,
              created_by  TEXT,
              created_at  TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_eval_suites_new "
            "SELECT id, tenant_id, name, description, provider, mode, task_type, "
            "is_active, run_count, last_run_at, created_by, created_at, updated_at "
            "FROM agentsam_eval_suites"
        ),
        indexes=[],
        description="agentsam_eval_suites — drop DEFAULT tenant_id, DEFAULT created_by",
    )


# ─── step 3: agentsam_eval_cases ─────────────────────────────────────────────

def step_3_eval_cases():
    recreate(
        table="agentsam_eval_cases",
        create_ddl=dedent("""
            CREATE TABLE agentsam_eval_cases_new (
              id               TEXT PRIMARY KEY DEFAULT ('evc_' || lower(hex(randomblob(8)))),
              suite_id         TEXT NOT NULL REFERENCES agentsam_eval_suites(id),
              tenant_id        TEXT NOT NULL,
              input_prompt     TEXT NOT NULL,
              expected_output  TEXT,
              grading_criteria TEXT,
              tags             TEXT DEFAULT '[]',
              is_edge_case     INTEGER DEFAULT 0,
              sort_order       INTEGER DEFAULT 50,
              created_at       TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_eval_cases_new "
            "SELECT id, suite_id, tenant_id, input_prompt, expected_output, "
            "grading_criteria, tags, is_edge_case, sort_order, created_at "
            "FROM agentsam_eval_cases"
        ),
        indexes=[],
        description="agentsam_eval_cases — drop DEFAULT tenant_id",
    )


# ─── step 4: agentsam_eval_runs ──────────────────────────────────────────────

def step_4_eval_runs():
    recreate(
        table="agentsam_eval_runs",
        create_ddl=dedent("""
            CREATE TABLE agentsam_eval_runs_new (
              id                   TEXT PRIMARY KEY DEFAULT ('evr_' || lower(hex(randomblob(8)))),
              suite_id             TEXT NOT NULL REFERENCES agentsam_eval_suites(id),
              case_id              TEXT REFERENCES agentsam_eval_cases(id),
              tenant_id            TEXT NOT NULL,
              model_key            TEXT NOT NULL,
              provider             TEXT NOT NULL,
              input_tokens         INTEGER DEFAULT 0,
              output_tokens        INTEGER DEFAULT 0,
              latency_ms           INTEGER DEFAULT 0,
              cost_usd             REAL DEFAULT 0,
              score_quality        REAL,
              score_latency        REAL,
              score_cost           REAL,
              score_tool_use       REAL,
              score_safety         REAL,
              score_overall        REAL,
              passed               INTEGER DEFAULT 0,
              output_text          TEXT,
              grader_notes         TEXT,
              grader_model         TEXT,
              run_at               TEXT NOT NULL DEFAULT (datetime('now')),
              cached_input_tokens  INTEGER DEFAULT 0,
              schema_valid         INTEGER DEFAULT NULL,
              retry_count          INTEGER DEFAULT 0,
              prompt_version_id    TEXT REFERENCES agentsam_prompt_versions(id),
              run_group_id         TEXT,
              tool_calls_attempted INTEGER DEFAULT 0,
              tool_calls_succeeded INTEGER DEFAULT 0,
              failure_taxonomy     TEXT
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_eval_runs_new "
            "SELECT id, suite_id, case_id, tenant_id, model_key, provider, "
            "input_tokens, output_tokens, latency_ms, cost_usd, "
            "score_quality, score_latency, score_cost, score_tool_use, score_safety, "
            "score_overall, passed, output_text, grader_notes, grader_model, run_at, "
            "cached_input_tokens, schema_valid, retry_count, prompt_version_id, "
            "run_group_id, tool_calls_attempted, tool_calls_succeeded, failure_taxonomy "
            "FROM agentsam_eval_runs"
        ),
        indexes=[],
        description="agentsam_eval_runs — drop DEFAULT tenant_id",
    )


# ─── step 5: agentsam_tool_stats_compacted ───────────────────────────────────

def step_5_tool_stats():
    recreate(
        table="agentsam_tool_stats_compacted",
        create_ddl=dedent("""
            CREATE TABLE agentsam_tool_stats_compacted_new (
              id              TEXT PRIMARY KEY DEFAULT ('atsc_' || lower(hex(randomblob(8)))),
              tenant_id       TEXT NOT NULL,
              workspace_id    TEXT NOT NULL,
              tool_name       TEXT NOT NULL,
              total_calls     INTEGER DEFAULT 0,
              success_count   INTEGER DEFAULT 0,
              failure_count   INTEGER DEFAULT 0,
              success_rate    REAL DEFAULT 0,
              total_cost_usd  REAL DEFAULT 0,
              total_tokens    INTEGER DEFAULT 0,
              avg_duration_ms REAL DEFAULT 0,
              first_seen_at   INTEGER,
              last_seen_at    INTEGER,
              compacted_at    INTEGER NOT NULL DEFAULT (unixepoch()),
              agent_id        TEXT,
              timed_out_count INTEGER DEFAULT 0,
              sla_breach_count INTEGER DEFAULT 0,
              p95_duration_ms REAL DEFAULT 0,
              UNIQUE(tenant_id, workspace_id, tool_name)
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_tool_stats_compacted_new "
            "SELECT id, tenant_id, workspace_id, tool_name, total_calls, success_count, "
            "failure_count, success_rate, total_cost_usd, total_tokens, avg_duration_ms, "
            "first_seen_at, last_seen_at, compacted_at, agent_id, "
            "timed_out_count, sla_breach_count, p95_duration_ms "
            "FROM agentsam_tool_stats_compacted"
        ),
        indexes=[
            "CREATE INDEX idx_agentsam_tool_stats_compacted_at "
            "ON agentsam_tool_stats_compacted(compacted_at DESC)",
            "CREATE INDEX idx_agentsam_tool_stats_scope_tool "
            "ON agentsam_tool_stats_compacted(tenant_id, workspace_id, tool_name)",
            "CREATE INDEX idx_tool_stats_workspace "
            "ON agentsam_tool_stats_compacted(workspace_id, tool_name)",
        ],
        description="agentsam_tool_stats_compacted — drop DEFAULT '__tenant__'",
    )


# ─── step 6: agentsam_workspace ──────────────────────────────────────────────

def step_6_workspace():
    recreate(
        table="agentsam_workspace",
        create_ddl=dedent("""
            CREATE TABLE agentsam_workspace_new (
              id                 TEXT PRIMARY KEY,
              workspace_slug     TEXT NOT NULL UNIQUE,
              tenant_id          TEXT NOT NULL,
              project_id         TEXT,
              project_slug       TEXT,
              name               TEXT NOT NULL,
              description        TEXT,
              root_path          TEXT,
              r2_bucket          TEXT,
              status             TEXT NOT NULL DEFAULT 'active'
                                   CHECK(status IN ('active','archived','paused')),
              metadata_json      TEXT DEFAULT '{}',
              created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
              updated_at         INTEGER NOT NULL DEFAULT (unixepoch()),
              r2_prefix          TEXT,
              github_repo        TEXT,
              default_model_id   TEXT,
              primary_subagent_id TEXT,
              display_name       TEXT
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_workspace_new "
            "SELECT id, workspace_slug, tenant_id, project_id, project_slug, "
            "name, description, root_path, r2_bucket, status, metadata_json, "
            "created_at, updated_at, r2_prefix, github_repo, "
            "default_model_id, primary_subagent_id, display_name "
            "FROM agentsam_workspace"
        ),
        indexes=[
            "CREATE INDEX idx_agentsam_workspace_slug ON agentsam_workspace(workspace_slug)",
        ],
        description="agentsam_workspace — drop DEFAULT tenant_id",
    )


# ─── step 7: agentsam_routing_arms ───────────────────────────────────────────

def step_7_routing_arms():
    recreate(
        table="agentsam_routing_arms",
        create_ddl=dedent("""
            CREATE TABLE agentsam_routing_arms_new (
              id                    TEXT PRIMARY KEY DEFAULT ('ra_' || lower(hex(randomblob(8)))),
              task_type             TEXT NOT NULL,
              mode                  TEXT NOT NULL,
              model_key             TEXT NOT NULL,
              provider              TEXT NOT NULL,
              success_alpha         REAL NOT NULL DEFAULT 1.0,
              success_beta          REAL NOT NULL DEFAULT 1.0,
              cost_n                INTEGER NOT NULL DEFAULT 0,
              cost_mean             REAL NOT NULL DEFAULT 0,
              cost_m2               REAL NOT NULL DEFAULT 0,
              latency_n             INTEGER NOT NULL DEFAULT 0,
              latency_mean          REAL NOT NULL DEFAULT 0,
              latency_m2            REAL NOT NULL DEFAULT 0,
              decayed_score         REAL NOT NULL DEFAULT 0,
              last_decay_at         INTEGER NOT NULL DEFAULT (unixepoch()),
              is_eligible           INTEGER NOT NULL DEFAULT 1,
              is_paused             INTEGER NOT NULL DEFAULT 0,
              pause_reason          TEXT,
              updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
              ai_model_id           TEXT,
              last_chain_id         TEXT,
              last_plan_id          TEXT,
              avg_quality_score     REAL DEFAULT 0,
              quality_n             INTEGER DEFAULT 0,
              max_cost_per_call_usd REAL,
              budget_exhausted      INTEGER DEFAULT 0,
              drift_signal_id       TEXT,
              intent_slug           TEXT,
              total_executions      INTEGER DEFAULT 0,
              workflow_agent        TEXT,
              tools_json            TEXT DEFAULT '[]',
              is_active             INTEGER DEFAULT 1,
              reasoning_effort      TEXT DEFAULT 'medium',
              workspace_id          TEXT NOT NULL,
              fallback_model_key    TEXT,
              supports_tools        INTEGER DEFAULT 1,
              priority              INTEGER DEFAULT 50,
              model_catalog_id      TEXT REFERENCES agentsam_model_catalog(id) ON DELETE SET NULL,
              UNIQUE(workspace_id, task_type, mode, model_key)
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_routing_arms_new "
            "SELECT id, task_type, mode, model_key, provider, "
            "success_alpha, success_beta, cost_n, cost_mean, cost_m2, "
            "latency_n, latency_mean, latency_m2, decayed_score, last_decay_at, "
            "is_eligible, is_paused, pause_reason, updated_at, ai_model_id, "
            "last_chain_id, last_plan_id, avg_quality_score, quality_n, "
            "max_cost_per_call_usd, budget_exhausted, drift_signal_id, intent_slug, "
            "total_executions, workflow_agent, tools_json, is_active, reasoning_effort, "
            "workspace_id, fallback_model_key, supports_tools, priority, model_catalog_id "
            "FROM agentsam_routing_arms"
        ),
        indexes=[
            "CREATE INDEX idx_arms_lookup ON agentsam_routing_arms(task_type, mode, is_eligible, is_paused)",
            "CREATE INDEX idx_routing_arms_intent_slug ON agentsam_routing_arms(intent_slug)",
            "CREATE INDEX idx_routing_arms_lookup ON agentsam_routing_arms(task_type, mode, is_eligible, is_paused, decayed_score DESC)",
            "CREATE INDEX idx_routing_arms_model ON agentsam_routing_arms(ai_model_id)",
            "CREATE INDEX idx_routing_arms_priority ON agentsam_routing_arms(task_type, mode, priority, is_active)",
            "CREATE INDEX idx_routing_arms_task_mode ON agentsam_routing_arms(task_type, mode, is_eligible)",
            "CREATE INDEX idx_routing_arms_task_mode_eligible ON agentsam_routing_arms(task_type, mode, is_eligible, is_paused)",
            "CREATE INDEX idx_routing_arms_workspace_task ON agentsam_routing_arms(workspace_id, task_type, mode, is_active, is_eligible)",
        ],
        description="agentsam_routing_arms — workspace_id NOT NULL, UNIQUE includes workspace_id",
    )


# ─── step 8: agentsam_commands ───────────────────────────────────────────────
#
# Dynamically identifies the platform-source workspace: the workspace_id with
# the highest command count. No IDs hardcoded. Promotes those rows to 'platform'.

def step_8_commands():
    log("step 8 — agentsam_commands — detect platform source, migrate, fix UNIQUE", "step")

    # Derive platform source workspace dynamically
    platform_source = None
    if not DRY_RUN:
        rows = query(
            "SELECT workspace_id, COUNT(*) AS cnt "
            "FROM agentsam_commands "
            "GROUP BY workspace_id "
            "ORDER BY cnt DESC "
            "LIMIT 1"
        )
        if rows:
            platform_source = rows[0]["workspace_id"]
            log(f"Platform source workspace detected: {platform_source} ({rows[0]['cnt']} commands)", "info")

            # Show full distribution so migration is auditable
            dist = query(
                "SELECT workspace_id, COUNT(*) AS cnt "
                "FROM agentsam_commands "
                "GROUP BY workspace_id "
                "ORDER BY cnt DESC"
            )
            for row in dist:
                action = "→ platform" if row["workspace_id"] == platform_source else "  kept as-is"
                log(f"  {row['workspace_id']}: {row['cnt']} commands  {action}", "info")
        else:
            log("Could not detect platform source — commands table may be empty", "warn")
    else:
        platform_source = "<detected-at-runtime>"
        log(f"[dry] Platform source will be detected at runtime", "info")

    # Drop stale _new
    exec_sql("DROP TABLE IF EXISTS agentsam_commands_new", "drop stale agentsam_commands_new if exists", critical=False)

    exec_sql(dedent("""
        CREATE TABLE agentsam_commands_new (
          id                  TEXT PRIMARY KEY,
          workspace_id        TEXT NOT NULL,
          slug                TEXT,
          display_name        TEXT NOT NULL,
          description         TEXT,
          pattern             TEXT,
          pattern_type        TEXT DEFAULT 'exact',
          mapped_command      TEXT NOT NULL,
          command_args        TEXT,
          category            TEXT DEFAULT 'misc',
          subcategory         TEXT,
          risk_level          TEXT DEFAULT 'low',
          requires_confirmation INTEGER DEFAULT 0,
          show_in_slash       INTEGER DEFAULT 1,
          show_in_allowlist   INTEGER DEFAULT 1,
          show_in_palette     INTEGER DEFAULT 1,
          modes_json          TEXT DEFAULT '["agent","auto","debug"]',
          sort_order          INTEGER DEFAULT 50,
          use_count           INTEGER DEFAULT 0,
          last_used_at        TEXT,
          is_active           INTEGER DEFAULT 1,
          created_at          TEXT DEFAULT (datetime('now')),
          updated_at          TEXT DEFAULT (datetime('now')),
          internal_seo        TEXT DEFAULT '',
          task_type           TEXT DEFAULT 'tool_use',
          timeout_seconds     INTEGER DEFAULT 120,
          estimated_cost_usd  REAL DEFAULT 0.0,
          allowed_models_json TEXT DEFAULT '[]',
          output_schema       TEXT DEFAULT '{}',
          retry_policy        TEXT DEFAULT 'once',
          requires_approval   INTEGER DEFAULT 0,
          tenant_id           TEXT,
          success_count       INTEGER DEFAULT 0,
          failure_count       INTEGER DEFAULT 0,
          avg_duration_ms     REAL DEFAULT 0,
          router_type         TEXT DEFAULT 'tool',
          tool_key            TEXT,
          workflow_key        TEXT,
          subagent_slug       TEXT,
          server_key          TEXT,
          execution_mode      TEXT DEFAULT 'agent',
          is_global           INTEGER DEFAULT 1,
          -- route_key is a denormalized hint; prompt routes are unique per (route_key, tenant_id).
          -- Do not add REFERENCES agentsam_prompt_routes(route_key) — invalid parent key in SQLite.
          route_key           TEXT DEFAULT NULL,
          UNIQUE(workspace_id, slug)
        )
    """), "CREATE agentsam_commands_new")

    # INSERT: promote platform-source workspace → 'platform', keep all others as-is.
    # platform_source is a Python variable used to build the SQL string —
    # it is never a static literal in source code, always derived from the live DB above.
    insert_sql = dedent(f"""
        INSERT INTO agentsam_commands_new
        SELECT
          id,
          CASE WHEN workspace_id = '{platform_source}' THEN 'platform' ELSE workspace_id END,
          slug, display_name, description, pattern, pattern_type, mapped_command,
          command_args, category, subcategory, risk_level, requires_confirmation,
          show_in_slash, show_in_allowlist, show_in_palette, modes_json, sort_order,
          use_count, last_used_at, is_active, created_at, updated_at, internal_seo,
          task_type, timeout_seconds, estimated_cost_usd, allowed_models_json,
          output_schema, retry_policy, requires_approval, tenant_id, success_count,
          failure_count, avg_duration_ms, router_type, tool_key, workflow_key,
          subagent_slug, server_key, execution_mode, is_global, route_key
        FROM agentsam_commands
    """)
    exec_sql(insert_sql, f"INSERT: promote {platform_source} → 'platform'")

    exec_sql("DROP TABLE agentsam_commands", "DROP TABLE agentsam_commands")
    exec_sql("ALTER TABLE agentsam_commands_new RENAME TO agentsam_commands", "RENAME → agentsam_commands")

    for idx in [
        "CREATE INDEX idx_agentsam_commands_active   ON agentsam_commands(is_active)",
        "CREATE INDEX idx_agentsam_commands_category ON agentsam_commands(category)",
        "CREATE INDEX idx_agentsam_commands_slug     ON agentsam_commands(slug)",
        "CREATE INDEX idx_commands_route             ON agentsam_commands(route_key)",
        # new: workspace-scoped lookup (used at runtime for command resolution)
        "CREATE INDEX idx_commands_workspace_slug    ON agentsam_commands(workspace_id, slug, is_active)",
        # new: platform-only partial index (fast path for global command inheritance)
        "CREATE INDEX idx_commands_platform_active   ON agentsam_commands(slug, is_active) WHERE workspace_id = 'platform'",
    ]:
        name = idx.split()[2].strip()
        exec_sql(idx, f"CREATE INDEX {name}")


# ─── smoke tests ─────────────────────────────────────────────────────────────
#
# All IDs generated at runtime via uuid4. No hardcoded tenant_* or ws_* values.
# Tests are fully isolated: inserted rows are cleaned up on exit.

def run_smoke_tests():
    log("Smoke tests", "step")
    passed = 0
    failed = 0

    def ok(label):
        nonlocal passed
        passed += 1
        log(label, "ok")

    def fail(label, detail=""):
        nonlocal failed
        failed += 1
        log(label, "err")
        if detail:
            print(f"  {DIM}{detail}{RST}")

    # Generate isolated, collision-free IDs for this test run
    run_id     = uuid.uuid4().hex[:8]
    tenant_a   = f"tenant_smoke_{run_id}_a"
    tenant_b   = f"tenant_smoke_{run_id}_b"
    ws_a       = f"ws_smoke_{run_id}_a"
    ws_b       = f"ws_smoke_{run_id}_b"

    log(f"tenant_a={tenant_a}", "info")
    log(f"tenant_b={tenant_b}", "info")
    log(f"ws_a={ws_a}", "info")
    log(f"ws_b={ws_b}", "info")

    cleanup_sql = []

    try:
        # ── T1: target columns must have NULL dflt_value (no default) ─────
        # Checked via PRAGMA table_info — no forbidden strings in code.
        log("T1  schema defaults via PRAGMA table_info", "info")
        # Map of table → columns that must have no DEFAULT after migration
        must_have_no_default = {
            "agentsam_routing_arms":        ["workspace_id"],
            "agentsam_eval_suites":         ["tenant_id", "created_by"],
            "agentsam_eval_runs":           ["tenant_id"],
            "agentsam_eval_cases":          ["tenant_id"],
            "agentsam_tool_stats_compacted":["workspace_id"],
            "agentsam_workspace":           ["tenant_id"],
            "agentsam_commands":            ["workspace_id", "tenant_id"],
        }
        schema_clean = True
        for table, cols in must_have_no_default.items():
            rows = query(f"SELECT name, dflt_value FROM pragma_table_info('{table}')")
            col_defaults = {r["name"]: r["dflt_value"] for r in rows}
            for col in cols:
                dflt = col_defaults.get(col, "COLUMN_NOT_FOUND")
                if dflt is None:
                    log(f"  {table}.{col}: dflt_value=NULL ✓", "info")
                else:
                    fail(f"T1 {table}.{col}: dflt_value={dflt!r} — expected NULL")
                    schema_clean = False
        if schema_clean:
            ok("T1  all target columns have no DEFAULT")

        # ── T2: routing_arms UNIQUE now includes workspace_id ─────────────
        log("T2  routing_arms unique constraint", "info")
        ddl_rows = query("SELECT sql FROM sqlite_master WHERE type='table' AND name='agentsam_routing_arms'")
        ddl = ddl_rows[0]["sql"] if ddl_rows else ""
        if "UNIQUE(workspace_id, task_type, mode, model_key)" in ddl:
            ok("T2  routing_arms UNIQUE includes workspace_id")
        else:
            fail("T2  routing_arms UNIQUE does not include workspace_id", ddl[:300])

        # ── T3: commands UNIQUE is (workspace_id, slug) ───────────────────
        log("T3  commands unique constraint", "info")
        ddl_rows = query("SELECT sql FROM sqlite_master WHERE type='table' AND name='agentsam_commands'")
        ddl = ddl_rows[0]["sql"] if ddl_rows else ""
        if "UNIQUE(workspace_id, slug)" in ddl:
            ok("T3  commands UNIQUE is (workspace_id, slug)")
        else:
            fail("T3  commands UNIQUE is not (workspace_id, slug)", ddl[:300])

        # ── T4: no __tenant__ rows remain ─────────────────────────────────
        log("T4  no placeholder workspace rows", "info")
        n = scalar(
            "SELECT COUNT(*) AS n FROM agentsam_tool_stats_compacted WHERE workspace_id = '__tenant__'",
            "n", 0
        )
        if n == 0:
            ok("T4  no __tenant__ rows in tool_stats_compacted")
        else:
            fail(f"T4  {n} __tenant__ rows still present in tool_stats_compacted")

        # ── T5: platform commands exist ───────────────────────────────────
        log("T5  platform commands present", "info")
        n = scalar(
            "SELECT COUNT(*) AS n FROM agentsam_commands WHERE workspace_id = 'platform'",
            "n", 0
        )
        if n and n > 0:
            ok(f"T5  {n} platform commands present")
        else:
            fail("T5  no platform commands found — migration may not have run")

        # ── T6: multi-tenant routing_arms INSERT isolation ────────────────
        log("T6  routing_arms per-workspace isolation", "info")
        arm_id_a = f"ra_smoke_{run_id}_a"
        arm_id_b = f"ra_smoke_{run_id}_b"
        # Same task_type/mode/model_key in two different workspaces — must not conflict
        exec_sql(
            f"INSERT INTO agentsam_routing_arms "
            f"(id, task_type, mode, model_key, provider, workspace_id) VALUES "
            f"('{arm_id_a}', 'smoke_task', 'smoke_mode', 'smoke_model', 'openai', '{ws_a}')",
            "T6  insert arm for ws_a", critical=False
        )
        cleanup_sql.append(f"DELETE FROM agentsam_routing_arms WHERE id = '{arm_id_a}'")

        ok_b, _ = exec_sql(
            f"INSERT INTO agentsam_routing_arms "
            f"(id, task_type, mode, model_key, provider, workspace_id) VALUES "
            f"('{arm_id_b}', 'smoke_task', 'smoke_mode', 'smoke_model', 'openai', '{ws_b}')",
            "T6  insert arm for ws_b (same arm key, different workspace)", critical=False
        ), None
        cleanup_sql.append(f"DELETE FROM agentsam_routing_arms WHERE id = '{arm_id_b}'")

        rows = query(
            f"SELECT workspace_id FROM agentsam_routing_arms "
            f"WHERE task_type='smoke_task' AND mode='smoke_mode' AND model_key='smoke_model' "
            f"AND workspace_id IN ('{ws_a}', '{ws_b}')"
        )
        workspaces_found = {r["workspace_id"] for r in rows}
        if ws_a in workspaces_found and ws_b in workspaces_found:
            ok("T6  two workspaces have the same arm key with no UNIQUE conflict")
        else:
            fail(f"T6  expected both workspaces, found: {workspaces_found}")

        # ── T7: platform command visible via multi-tenant lookup ──────────
        log("T7  platform command inheritance lookup", "info")
        # Insert one platform command and one workspace-specific override
        cmd_platform_id  = f"cmd_smoke_{run_id}_platform"
        cmd_override_id  = f"cmd_smoke_{run_id}_override"
        smoke_slug       = f"smoke_cmd_{run_id}"
        exec_sql(
            f"INSERT INTO agentsam_commands (id, workspace_id, slug, display_name, mapped_command) "
            f"VALUES ('{cmd_platform_id}', 'platform', '{smoke_slug}', 'Smoke Platform', '/noop')",
            "T7  insert platform command", critical=False
        )
        cleanup_sql.append(f"DELETE FROM agentsam_commands WHERE id = '{cmd_platform_id}'")

        exec_sql(
            f"INSERT INTO agentsam_commands (id, workspace_id, slug, display_name, mapped_command) "
            f"VALUES ('{cmd_override_id}', '{ws_a}', '{smoke_slug}', 'Smoke Override', '/noop_override')",
            "T7  insert workspace override command", critical=False
        )
        cleanup_sql.append(f"DELETE FROM agentsam_commands WHERE id = '{cmd_override_id}'")

        # Resolution query: workspace override wins over platform
        resolved = query(
            f"SELECT id, workspace_id, mapped_command, "
            f"  CASE WHEN workspace_id = '{ws_a}' THEN 1 ELSE 0 END AS is_override "
            f"FROM agentsam_commands "
            f"WHERE slug = '{smoke_slug}' "
            f"  AND (workspace_id = 'platform' OR workspace_id = '{ws_a}') "
            f"  AND is_active = 1 "
            f"ORDER BY is_override DESC "
            f"LIMIT 1"
        )
        if resolved and resolved[0]["id"] == cmd_override_id:
            ok("T7  workspace override correctly wins over platform command")
        elif resolved and resolved[0]["id"] == cmd_platform_id:
            fail("T7  platform command returned — override not resolved correctly")
        else:
            fail("T7  no command resolved from lookup query")

        # ── T8: workspace with no override sees platform command ──────────
        log("T8  workspace with no override inherits platform command", "info")
        inherited = query(
            f"SELECT id FROM agentsam_commands "
            f"WHERE slug = '{smoke_slug}' "
            f"  AND (workspace_id = 'platform' OR workspace_id = '{ws_b}') "
            f"  AND is_active = 1 "
            f"ORDER BY CASE WHEN workspace_id = '{ws_b}' THEN 1 ELSE 0 END DESC "
            f"LIMIT 1"
        )
        if inherited and inherited[0]["id"] == cmd_platform_id:
            ok("T8  ws_b correctly inherits platform command (no override)")
        else:
            fail("T8  ws_b did not inherit platform command")

        # ── T9: tool_stats_compacted UNIQUE per (tenant, workspace, tool) ─
        log("T9  tool_stats_compacted UNIQUE isolation", "info")
        stat_id_a = f"atsc_smoke_{run_id}_a"
        stat_id_b = f"atsc_smoke_{run_id}_b"
        exec_sql(
            f"INSERT INTO agentsam_tool_stats_compacted "
            f"(id, tenant_id, workspace_id, tool_name) "
            f"VALUES ('{stat_id_a}', '{tenant_a}', '{ws_a}', 'smoke_tool')",
            "T9  insert stat for tenant_a/ws_a", critical=False
        )
        cleanup_sql.append(f"DELETE FROM agentsam_tool_stats_compacted WHERE id = '{stat_id_a}'")

        exec_sql(
            f"INSERT INTO agentsam_tool_stats_compacted "
            f"(id, tenant_id, workspace_id, tool_name) "
            f"VALUES ('{stat_id_b}', '{tenant_b}', '{ws_b}', 'smoke_tool')",
            "T9  insert stat for tenant_b/ws_b (same tool_name)", critical=False
        )
        cleanup_sql.append(f"DELETE FROM agentsam_tool_stats_compacted WHERE id = '{stat_id_b}'")

        rows = query(
            f"SELECT COUNT(*) AS n FROM agentsam_tool_stats_compacted "
            f"WHERE tool_name = 'smoke_tool' "
            f"AND id IN ('{stat_id_a}', '{stat_id_b}')"
        )
        if rows and rows[0]["n"] == 2:
            ok("T9  two tenants can have stats for the same tool_name")
        else:
            fail("T9  expected 2 rows, isolation broken")

    finally:
        # ── cleanup ───────────────────────────────────────────────────────
        log("Cleanup smoke test rows", "step")
        for sql in cleanup_sql:
            exec_sql(sql, f"cleanup: {sql[:60]}…", critical=False)

    log(f"Smoke tests complete: {passed} passed, {failed} failed", "ok" if failed == 0 else "warn")
    return failed == 0


# ─── verify-only: schema check without running migration ─────────────────────

def verify_schema_only():
    log("Schema verification (read-only)", "step")

    # Columns that must have dflt_value=NULL after migration
    must_have_no_default = {
        "agentsam_routing_arms":        ["workspace_id"],
        "agentsam_eval_suites":         ["tenant_id", "created_by"],
        "agentsam_eval_runs":           ["tenant_id"],
        "agentsam_eval_cases":          ["tenant_id"],
        "agentsam_tool_stats_compacted":["workspace_id"],
        "agentsam_workspace":           ["tenant_id"],
        "agentsam_commands":            ["workspace_id", "tenant_id"],
    }

    # Unique constraints that must exist
    required_unique = {
        "agentsam_routing_arms":         "UNIQUE(workspace_id, task_type, mode, model_key)",
        "agentsam_tool_stats_compacted": "UNIQUE(tenant_id, workspace_id, tool_name)",
        "agentsam_commands":             "UNIQUE(workspace_id, slug)",
    }

    clean = True

    for table, cols in must_have_no_default.items():
        rows = query(f"SELECT name, dflt_value FROM pragma_table_info('{table}')")
        col_map = {r["name"]: r["dflt_value"] for r in rows}
        for col in cols:
            dflt = col_map.get(col, "COLUMN_NOT_FOUND")
            if dflt is None:
                log(f"{table}.{col}: dflt_value=NULL ✓", "verify")
            else:
                log(f"{table}.{col}: dflt_value={dflt!r} — not clean", "err")
                clean = False

    for table, expected_unique in required_unique.items():
        ddl_rows = query(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table}'")
        ddl = ddl_rows[0]["sql"] if ddl_rows else ""
        if expected_unique in ddl:
            log(f"{table}: {expected_unique} ✓", "verify")
        else:
            log(f"{table}: missing {expected_unique}", "err")
            clean = False

    # Placeholder rows — checked by value since '__tenant__' is the sentinel being eradicated
    placeholder_n = scalar(
        "SELECT COUNT(*) AS n FROM agentsam_tool_stats_compacted "
        "WHERE workspace_id = '__tenant__'",
        "n", -1
    )
    if placeholder_n == 0:
        log("tool_stats_compacted: no placeholder workspace rows ✓", "verify")
    else:
        log(f"tool_stats_compacted: {placeholder_n} placeholder rows remain", "err")
        clean = False

    platform_n = scalar(
        "SELECT COUNT(*) AS n FROM agentsam_commands WHERE workspace_id = 'platform'",
        "n", 0
    )
    if platform_n and platform_n > 0:
        log(f"commands: {platform_n} platform rows ✓", "verify")
    else:
        log("commands: no platform rows — migration may not have run", "warn")

    log("Schema is clean" if clean else "Schema has issues — run migration", "ok" if clean else "err")
    return clean


# ─── main ────────────────────────────────────────────────────────────────────

# ─── step 9: agentsam_mcp_workflows ──────────────────────────────────────────
#
# Three fixes applied during recreate:
#   1. UNIQUE(workflow_key) → UNIQUE(workspace_id, workflow_key)
#      so two workspaces can each have a workflow with the same key.
#   2. tenant_id = '*' → NULL  (wildcard sentinel → proper platform pattern)
#   3. Connor's workspace_id corrected via correlated lookup on agentsam_workspace
#      (same pattern as step 1 — no IDs hardcoded).
#   4. wf_migrate_* duplicate rows (legacy migration artifacts with display-name
#      workflow_keys) are dropped — each has a proper wf_* slug equivalent.

def step_9_mcp_workflows():
    log("step 9 — agentsam_mcp_workflows — fix UNIQUE, patch sentinel, fix Connor workspace", "step")

    # Show what we're about to do to Connor's rows
    if not DRY_RUN:
        connor_rows = query(
            "SELECT id, workflow_key, tenant_id, workspace_id "
            "FROM agentsam_mcp_workflows "
            "WHERE workspace_id != ("
            "  SELECT w.id FROM agentsam_workspace w "
            "  WHERE w.tenant_id = agentsam_mcp_workflows.tenant_id "
            "  ORDER BY w.created_at ASC LIMIT 1"
            ") AND tenant_id NOT IN ('*') "
            "AND tenant_id IS NOT NULL"
        )
        if connor_rows:
            log("Rows with mismatched workspace (will be corrected):", "info")
            for r in connor_rows:
                log(f"  {r['id']}  tenant={r['tenant_id']}  ws={r['workspace_id']}", "info")

        dupe_rows = query(
            "SELECT id, workflow_key FROM agentsam_mcp_workflows "
            "WHERE id LIKE 'wf_migrate_%'"
        )
        if dupe_rows:
            log("Legacy wf_migrate_* duplicates to be dropped:", "info")
            for r in dupe_rows:
                log(f"  {r['id']}  key={r['workflow_key']!r}", "info")

    exec_sql("DROP TABLE IF EXISTS agentsam_mcp_workflows_new",
             "drop stale agentsam_mcp_workflows_new if exists", critical=False)

    exec_sql(dedent("""
        CREATE TABLE agentsam_mcp_workflows_new (
          id                       TEXT PRIMARY KEY,
          workflow_key             TEXT NOT NULL,
          display_name             TEXT NOT NULL,
          description              TEXT,
          status                   TEXT NOT NULL DEFAULT 'ready',
          priority                 TEXT NOT NULL DEFAULT 'medium',
          steps_json               TEXT NOT NULL DEFAULT '[]',
          tools_json               TEXT NOT NULL DEFAULT '[]',
          acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
          notes                    TEXT,
          created_at               TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
          tenant_id                TEXT,
          workspace_id             TEXT,
          trigger_type             TEXT DEFAULT 'manual',
          trigger_config_json      TEXT DEFAULT '{}',
          input_schema_json        TEXT DEFAULT '{}',
          output_schema_json       TEXT DEFAULT '{}',
          requires_approval        INTEGER DEFAULT 0,
          risk_level               TEXT DEFAULT 'low',
          run_count                INTEGER DEFAULT 0,
          success_count            INTEGER DEFAULT 0,
          last_run_at              TEXT,
          last_run_status          TEXT,
          avg_duration_ms          REAL DEFAULT 0,
          total_cost_usd           REAL DEFAULT 0,
          version                  INTEGER DEFAULT 1,
          is_active                INTEGER DEFAULT 1,
          subagent_slug            TEXT,
          model_id                 TEXT,
          timeout_seconds          INTEGER DEFAULT 300,
          category                 TEXT DEFAULT 'general',
          parent_workflow_id       TEXT DEFAULT NULL,
          tags_json                TEXT DEFAULT '[]',
          retry_policy_json        TEXT DEFAULT '{"max_retries":2,"backoff":"exponential","delay_ms":2000,"retry_on":["timeout","network_error"]}',
          on_failure_json          TEXT DEFAULT '{"action":"notify","notify_channel":"resend"}',
          max_concurrent_runs      INTEGER DEFAULT 1,
          environment              TEXT DEFAULT 'production',
          visibility               TEXT DEFAULT 'workspace',
          input_defaults_json      TEXT DEFAULT '{}',
          last_error               TEXT DEFAULT NULL,
          task_type                TEXT DEFAULT 'agent_workflow',
          graph_mode               INTEGER DEFAULT 0,
          UNIQUE(workspace_id, workflow_key)
        )
    """), "CREATE agentsam_mcp_workflows_new")

    # INSERT with three inline transforms:
    #   - tenant_id='*'  → NULL            (platform sentinel normalisation)
    #   - workspace_id   → correlated lookup when it doesn't match tenant's canonical ws
    #   - wf_migrate_*   → excluded        (legacy duplicates, proper wf_* slugs exist)
    exec_sql(dedent("""
        INSERT INTO agentsam_mcp_workflows_new
        SELECT
          id,
          workflow_key,
          display_name,
          description,
          status,
          priority,
          steps_json,
          tools_json,
          acceptance_criteria_json,
          notes,
          created_at,
          updated_at,
          CASE WHEN tenant_id = '*' THEN NULL ELSE tenant_id END,
          CASE
            WHEN tenant_id = '*' THEN NULL
            WHEN tenant_id IS NULL THEN NULL
            ELSE (
              SELECT w.id
              FROM agentsam_workspace w
              WHERE w.tenant_id = agentsam_mcp_workflows.tenant_id
              ORDER BY w.created_at ASC
              LIMIT 1
            )
          END,
          trigger_type,
          trigger_config_json,
          input_schema_json,
          output_schema_json,
          requires_approval,
          risk_level,
          run_count,
          success_count,
          last_run_at,
          last_run_status,
          avg_duration_ms,
          total_cost_usd,
          version,
          is_active,
          subagent_slug,
          model_id,
          timeout_seconds,
          category,
          parent_workflow_id,
          tags_json,
          retry_policy_json,
          on_failure_json,
          max_concurrent_runs,
          environment,
          visibility,
          input_defaults_json,
          last_error,
          task_type,
          graph_mode
        FROM agentsam_mcp_workflows
        WHERE id NOT LIKE 'wf_migrate_%'
    """), "INSERT: normalise tenant/workspace, drop wf_migrate_* duplicates")

    exec_sql("DROP TABLE agentsam_mcp_workflows", "DROP TABLE agentsam_mcp_workflows")
    exec_sql("ALTER TABLE agentsam_mcp_workflows_new RENAME TO agentsam_mcp_workflows",
             "RENAME → agentsam_mcp_workflows")

    for idx in [
        "CREATE INDEX idx_agentsam_mcp_workflows_active_category  ON agentsam_mcp_workflows(is_active, category)",
        "CREATE INDEX idx_agentsam_mcp_workflows_parent            ON agentsam_mcp_workflows(parent_workflow_id)",
        "CREATE INDEX idx_agentsam_mcp_workflows_subagent          ON agentsam_mcp_workflows(subagent_slug)",
        "CREATE INDEX idx_agentsam_mcp_workflows_task_type         ON agentsam_mcp_workflows(task_type)",
        "CREATE INDEX idx_agentsam_mcp_workflows_tenant_workspace_status ON agentsam_mcp_workflows(tenant_id, workspace_id, status)",
        "CREATE INDEX idx_agentsam_mcp_workflows_trigger           ON agentsam_mcp_workflows(trigger_type)",
        "CREATE INDEX idx_agentsam_mcp_workflows_updated           ON agentsam_mcp_workflows(updated_at)",
        # new: workspace-scoped lookup + platform inheritance
        "CREATE INDEX idx_mcp_workflows_workspace_key             ON agentsam_mcp_workflows(workspace_id, workflow_key, is_active)",
        "CREATE INDEX idx_mcp_workflows_platform                  ON agentsam_mcp_workflows(workflow_key, is_active) WHERE tenant_id IS NULL",
    ]:
        name = idx.split()[2].strip()
        exec_sql(idx, f"CREATE INDEX {name}")

    # Post-step sanity check
    if not DRY_RUN:
        dist = query(
            "SELECT tenant_id, workspace_id, COUNT(*) AS cnt "
            "FROM agentsam_mcp_workflows "
            "GROUP BY tenant_id, workspace_id "
            "ORDER BY cnt DESC"
        )
        log("Post-step distribution:", "info")
        for r in dist:
            log(f"  tenant={r['tenant_id']}  ws={r['workspace_id']}  rows={r['cnt']}", "info")


# ─── step 10: agentsam_workflow_nodes — expand node_type CHECK ────────────────
#
# Adds three new node_types identified during architecture review:
#   retry    — explicit retry node for complex retry topology in the graph
#   parallel — fan-out: fires multiple outgoing edges simultaneously
#   join     — fan-in: parks execution until all incoming parallel branches complete
#
# No data changes — 25 existing rows all use existing types.
# No column changes — config for parallel/join lives in existing input_schema_json.

def step_10_workflow_nodes():
    recreate(
        table="agentsam_workflow_nodes",
        create_ddl=dedent("""
            CREATE TABLE agentsam_workflow_nodes_new (
              id                 TEXT    PRIMARY KEY DEFAULT ('wnode_' || lower(hex(randomblob(8)))),
              workflow_id        TEXT    NOT NULL REFERENCES agentsam_mcp_workflows(id) ON DELETE CASCADE,
              node_key           TEXT    NOT NULL,
              node_type          TEXT    NOT NULL DEFAULT 'agent'
                                         CHECK(node_type IN (
                                           'agent','db_query','mcp_tool','script',
                                           'approval_gate','eval','branch','webhook','terminal',
                                           'retry','parallel','join'
                                         )),
              title              TEXT    NOT NULL,
              description        TEXT,
              handler_key        TEXT,
              input_schema_json  TEXT    DEFAULT '{}',
              output_schema_json TEXT    DEFAULT '{}',
              timeout_ms         INTEGER DEFAULT 30000,
              retry_policy_json  TEXT    DEFAULT '{"max_retries":2,"backoff":"exponential","delay_ms":1000}',
              quality_gate_json  TEXT    DEFAULT '{}',
              risk_level         TEXT    DEFAULT 'low'
                                         CHECK(risk_level IN ('low','medium','high','critical')),
              requires_approval  INTEGER DEFAULT 0,
              is_active          INTEGER DEFAULT 1,
              sort_order         INTEGER DEFAULT 0,
              created_at         TEXT    DEFAULT (datetime('now')),
              updated_at         TEXT    DEFAULT (datetime('now')),
              UNIQUE(workflow_id, node_key)
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_workflow_nodes_new "
            "SELECT id, workflow_id, node_key, node_type, title, description, "
            "handler_key, input_schema_json, output_schema_json, timeout_ms, "
            "retry_policy_json, quality_gate_json, risk_level, requires_approval, "
            "is_active, sort_order, created_at, updated_at "
            "FROM agentsam_workflow_nodes"
        ),
        indexes=[
            "CREATE INDEX idx_workflow_nodes_workflow   ON agentsam_workflow_nodes(workflow_id, is_active)",
            "CREATE INDEX idx_workflow_nodes_type       ON agentsam_workflow_nodes(node_type)",
            "CREATE INDEX idx_workflow_nodes_risk       ON agentsam_workflow_nodes(risk_level)",
        ],
        description="agentsam_workflow_nodes — add retry, parallel, join node_types",
    )


# ─── step 11: agentsam_workflow_edges — expand condition_type CHECK ───────────
#
# Adds one new condition_type:
#   timeout  — fires when the run's max_runtime_ms ceiling is hit, enabling
#              graceful graph-level handling rather than a hard kill.
#              Distinct from 'elapsed' (node-level) — this is run-level.
#
# No data changes — 27 existing rows all use existing condition_types.

def step_11_workflow_edges():
    recreate(
        table="agentsam_workflow_edges",
        create_ddl=dedent("""
            CREATE TABLE agentsam_workflow_edges_new (
              id              TEXT    PRIMARY KEY DEFAULT ('wedge_' || lower(hex(randomblob(8)))),
              workflow_id     TEXT    NOT NULL REFERENCES agentsam_mcp_workflows(id) ON DELETE CASCADE,
              from_node_key   TEXT    NOT NULL,
              to_node_key     TEXT    NOT NULL,
              condition_json  TEXT    DEFAULT NULL,
              condition_type  TEXT    DEFAULT 'always'
                                       CHECK(condition_type IN (
                                         'always','threshold','status','elapsed',
                                         'cost','field','risk','manual','timeout'
                                       )),
              priority        INTEGER DEFAULT 0,
              is_fallback     INTEGER DEFAULT 0,
              label           TEXT,
              created_at      TEXT    DEFAULT (datetime('now')),
              UNIQUE(workflow_id, from_node_key, to_node_key)
            )
        """),
        insert_sql=(
            "INSERT INTO agentsam_workflow_edges_new "
            "SELECT id, workflow_id, from_node_key, to_node_key, "
            "condition_json, condition_type, priority, is_fallback, label, created_at "
            "FROM agentsam_workflow_edges"
        ),
        indexes=[
            "CREATE INDEX idx_workflow_edges_workflow      ON agentsam_workflow_edges(workflow_id)",
            "CREATE INDEX idx_workflow_edges_from_node     ON agentsam_workflow_edges(workflow_id, from_node_key)",
            "CREATE INDEX idx_workflow_edges_condition     ON agentsam_workflow_edges(condition_type)",
            "CREATE INDEX idx_workflow_edges_fallback      ON agentsam_workflow_edges(workflow_id, is_fallback)",
        ],
        description="agentsam_workflow_edges — add timeout condition_type",
    )


STEPS = {
    1:  ("backfill tool_stats __tenant__",             step_1_backfill_tool_stats),
    2:  ("eval_suites — drop defaults",                step_2_eval_suites),
    3:  ("eval_cases — drop defaults",                 step_3_eval_cases),
    4:  ("eval_runs — drop defaults",                  step_4_eval_runs),
    5:  ("tool_stats_compacted — recreate",            step_5_tool_stats),
    6:  ("workspace — drop defaults",                  step_6_workspace),
    7:  ("routing_arms — new unique",                  step_7_routing_arms),
    8:  ("commands — platform migration",              step_8_commands),
    9:  ("mcp_workflows — fix UNIQUE + data",          step_9_mcp_workflows),
    10: ("workflow_nodes — add retry/parallel/join",   step_10_workflow_nodes),
    11: ("workflow_edges — add timeout condition",     step_11_workflow_edges),
}

def main():
    global DRY_RUN

    parser = argparse.ArgumentParser(
        description="Multi-tenant schema migration — inneranimalmedia-business"
    )
    parser.add_argument("--dry-run",      action="store_true", help="Print SQL, make no changes")
    parser.add_argument("--step",         type=int,            help="Run a single step (1–11)")
    parser.add_argument("--smoke-test",   action="store_true", help="Run smoke tests only")
    parser.add_argument("--verify-only",  action="store_true", help="Schema check, no migration")
    args = parser.parse_args()

    DRY_RUN = args.dry_run

    if DRY_RUN:
        print(f"\n{YELLOW}{BOLD}DRY RUN — no changes will be made{RST}\n")

    if args.verify_only:
        ok = verify_schema_only()
        sys.exit(0 if ok else 1)

    if args.smoke_test:
        ok = run_smoke_tests()
        sys.exit(0 if ok else 1)

    # ── full migration ────────────────────────────────────────────────────
    print(f"\n{BOLD}Multi-tenant schema migration{RST}")
    print(f"{DIM}Target: {DB_NAME}{RST}")

    before = snapshot()

    if args.step:
        if args.step not in STEPS:
            log(f"Unknown step {args.step}. Valid: 1–8", "err")
            sys.exit(1)
        name, fn = STEPS[args.step]
        log(f"Running step {args.step} only: {name}", "info")
        fn()
    else:
        for num, (name, fn) in STEPS.items():
            fn()

    verify(before)

    if ERRORS:
        log(f"Completed with {len(ERRORS)} non-critical error(s):", "warn")
        for e in ERRORS:
            log(f"  {e}", "info")
        sys.exit(1)
    else:
        log("Migration complete.", "ok")
        if not args.step:
            print(f"\n{DIM}Next: run --smoke-test to validate end-to-end{RST}\n")


if __name__ == "__main__":
    main()
