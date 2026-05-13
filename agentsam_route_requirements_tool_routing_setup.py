#!/usr/bin/env python3
"""
agentsam_route_requirements_tool_routing_setup.py

Creates a safe D1 migration for agentsam_route_requirements deterministic tool routing.

What it does:
1. Optionally inspects the live D1 table columns with wrangler.
2. Writes migrations/332_agentsam_route_requirements_tool_routing.sql.
3. Avoids duplicate ALTER TABLE ADD COLUMN statements when live schema inspection works.
4. Can optionally apply the migration with --apply.

Usage:
  cd /Users/samprimeaux/inneranimalmedia

  python3 agentsam_route_requirements_tool_routing_setup.py

  python3 agentsam_route_requirements_tool_routing_setup.py --apply

  python3 agentsam_route_requirements_tool_routing_setup.py \
    --db inneranimalmedia-business \
    --config wrangler.production.toml \
    --migration migrations/332_agentsam_route_requirements_tool_routing.sql \
    --apply
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable
from textwrap import dedent


DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
DEFAULT_MIGRATION = "migrations/332_agentsam_route_requirements_tool_routing.sql"

REQUIRED_COLUMNS: dict[str, str] = {
    "mode": "ALTER TABLE agentsam_route_requirements ADD COLUMN mode TEXT DEFAULT 'default';",
    "allowed_lanes_json": "ALTER TABLE agentsam_route_requirements ADD COLUMN allowed_lanes_json TEXT DEFAULT '[]';",
    "required_capability_keys_json": "ALTER TABLE agentsam_route_requirements ADD COLUMN required_capability_keys_json TEXT DEFAULT '[]';",
    "optional_capability_keys_json": "ALTER TABLE agentsam_route_requirements ADD COLUMN optional_capability_keys_json TEXT DEFAULT '[]';",
    "blocked_capability_keys_json": "ALTER TABLE agentsam_route_requirements ADD COLUMN blocked_capability_keys_json TEXT DEFAULT '[]';",
    "approval_policy_json": "ALTER TABLE agentsam_route_requirements ADD COLUMN approval_policy_json TEXT DEFAULT '{}';",
    "max_tools": "ALTER TABLE agentsam_route_requirements ADD COLUMN max_tools INTEGER;",
}


def run(cmd: list[str], *, capture: bool = True, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        check=check,
    )


def require_wrangler() -> None:
    if shutil.which("npx") is None:
        raise SystemExit("Missing npx. Run this inside the repo/dev machine where Node/npm are installed.")


def get_existing_columns(db: str, config: str) -> set[str] | None:
    """Return live columns if wrangler JSON inspection works; otherwise None."""
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        db,
        "--remote",
        "-c",
        config,
        "--json",
        "--command",
        "PRAGMA table_info(agentsam_route_requirements);",
    ]
    try:
        proc = run(cmd, capture=True, check=True)
        payload = json.loads(proc.stdout)
        results = payload[0].get("results", []) if payload else []
        return {str(row.get("name")) for row in results if row.get("name")}
    except Exception as exc:
        print(f"[warn] Could not inspect live D1 columns; writing all ALTER statements. Reason: {exc}", file=sys.stderr)
        return None


def sql_literal(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def insert_row_sql(
    *,
    route_key: str,
    task_type: str,
    mode: str,
    requires_tools: int,
    requires_streaming: int,
    preferred_tier: str,
    max_tier: str,
    budget_priority: str,
    preferred_providers: str,
    blocked_providers: str,
    allowed_lanes_json: str,
    required_capability_keys_json: str,
    optional_capability_keys_json: str,
    blocked_capability_keys_json: str,
    approval_policy_json: str,
    max_tools: int,
) -> str:
    values = [
        route_key,
        task_type,
        mode,
        str(requires_tools),
        str(requires_streaming),
        preferred_tier,
        max_tier,
        budget_priority,
        preferred_providers,
        blocked_providers,
        allowed_lanes_json,
        required_capability_keys_json,
        optional_capability_keys_json,
        blocked_capability_keys_json,
        approval_policy_json,
        str(max_tools),
        "1",
    ]

    sql_values = [
        sql_literal(v) if i not in {3, 4, 15, 16} else v
        for i, v in enumerate(values)
    ]

    return f"""
INSERT INTO agentsam_route_requirements (
  route_key,
  task_type,
  mode,
  requires_tools,
  requires_streaming,
  preferred_tier,
  max_tier,
  budget_priority,
  preferred_providers,
  blocked_providers,
  allowed_lanes_json,
  required_capability_keys_json,
  optional_capability_keys_json,
  blocked_capability_keys_json,
  approval_policy_json,
  max_tools,
  is_active
)
SELECT
  {",\n  ".join(sql_values)}
WHERE NOT EXISTS (
  SELECT 1
  FROM agentsam_route_requirements
  WHERE route_key = {sql_literal(route_key)}
    AND task_type = {sql_literal(task_type)}
    AND mode = {sql_literal(mode)}
);
""".strip()


def build_sql(existing_columns: set[str] | None) -> str:
    missing_alters: Iterable[str]
    if existing_columns is None:
        missing_alters = REQUIRED_COLUMNS.values()
    else:
        missing_alters = [
            alter_sql
            for column_name, alter_sql in REQUIRED_COLUMNS.items()
            if column_name not in existing_columns
        ]

    rows = [
        dict(
            route_key="agent_chat",
            task_type="ask",
            mode="default",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="mini",
            max_tier="standard",
            budget_priority="balanced",
            preferred_providers='["openai","google","anthropic","workers_ai"]',
            blocked_providers="[]",
            allowed_lanes_json='["think","research","inspect"]',
            required_capability_keys_json="[]",
            optional_capability_keys_json='["memory.read","context.search","browser.inspect","d1.read"]',
            blocked_capability_keys_json='["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
            approval_policy_json='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=4,
        ),
        dict(
            route_key="agent_chat",
            task_type="chat",
            mode="default",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="mini",
            max_tier="standard",
            budget_priority="balanced",
            preferred_providers='["openai","google","anthropic","workers_ai"]',
            blocked_providers="[]",
            allowed_lanes_json='["think","research","inspect"]',
            required_capability_keys_json="[]",
            optional_capability_keys_json='["memory.read","context.search","browser.inspect","d1.read","mcp.catalog.read"]',
            blocked_capability_keys_json='["worker.deploy","d1.write","terminal.execute","secret.write","email.broadcast"]',
            approval_policy_json='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=4,
        ),
        dict(
            route_key="agent_chat",
            task_type="debug",
            mode="default",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="standard",
            max_tier="pro",
            budget_priority="quality",
            preferred_providers='["openai","google","anthropic"]',
            blocked_providers="[]",
            allowed_lanes_json='["inspect","observe","develop"]',
            required_capability_keys_json="[]",
            optional_capability_keys_json='["browser.inspect","logs.read","d1.read","r2.read","github.read","code.search"]',
            blocked_capability_keys_json='["worker.deploy","email.broadcast","secret.write"]',
            approval_policy_json='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=8,
        ),
        dict(
            route_key="agent_chat",
            task_type="develop",
            mode="default",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="standard",
            max_tier="pro",
            budget_priority="quality",
            preferred_providers='["openai","google","anthropic"]',
            blocked_providers="[]",
            allowed_lanes_json='["develop","inspect","observe"]',
            required_capability_keys_json='["code.search"]',
            optional_capability_keys_json='["github.read","github.write","d1.read","d1.write","r2.read","r2.write","terminal.execute","worker.preview"]',
            blocked_capability_keys_json='["email.broadcast","secret.write"]',
            approval_policy_json='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=12,
        ),
        dict(
            route_key="agent_chat",
            task_type="build",
            mode="default",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="standard",
            max_tier="pro",
            budget_priority="quality",
            preferred_providers='["openai","google","anthropic"]',
            blocked_providers="[]",
            allowed_lanes_json='["develop","inspect","observe","design"]',
            required_capability_keys_json='["code.search"]',
            optional_capability_keys_json='["github.read","github.write","d1.read","d1.write","r2.read","r2.write","terminal.execute","browser.inspect","worker.preview"]',
            blocked_capability_keys_json='["email.broadcast","secret.write"]',
            approval_policy_json='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=12,
        ),
        dict(
            route_key="mcp_panel",
            task_type="tool_use",
            mode="default",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="mini",
            max_tier="standard",
            budget_priority="balanced",
            preferred_providers='["openai","google","anthropic","workers_ai"]',
            blocked_providers="[]",
            allowed_lanes_json='["think","research","inspect","observe","develop","design","operate","integrate","admin"]',
            required_capability_keys_json="[]",
            optional_capability_keys_json='["mcp.catalog.read","mcp.tool.inspect","d1.read","logs.read","context.search"]',
            blocked_capability_keys_json='["worker.deploy","secret.write","email.broadcast"]',
            approval_policy_json='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=24,
        ),
        dict(
            route_key="agent_chat",
            task_type="deploy",
            mode="approved_mutation",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="standard",
            max_tier="pro",
            budget_priority="quality",
            preferred_providers='["openai","google","anthropic"]',
            blocked_providers="[]",
            allowed_lanes_json='["develop","observe","operate"]',
            required_capability_keys_json='["worker.deploy"]',
            optional_capability_keys_json='["github.read","github.write","d1.read","r2.read","logs.read","worker.preview"]',
            blocked_capability_keys_json='["email.broadcast","secret.write"]',
            approval_policy_json='{"default":"approval_required","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=10,
        ),
        dict(
            route_key="agent_chat",
            task_type="database",
            mode="approved_mutation",
            requires_tools=1,
            requires_streaming=1,
            preferred_tier="standard",
            max_tier="pro",
            budget_priority="quality",
            preferred_providers='["openai","google","anthropic"]',
            blocked_providers="[]",
            allowed_lanes_json='["develop","inspect","observe"]',
            required_capability_keys_json='["d1.read"]',
            optional_capability_keys_json='["d1.write","d1.batch_write","schema.inspect","logs.read"]',
            blocked_capability_keys_json='["worker.deploy","email.broadcast","secret.write"]',
            approval_policy_json='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
            max_tools=8,
        ),
    ]

    alter_block = "\n".join(missing_alters).strip()
    if not alter_block:
        alter_block = "-- All required tool-routing columns already exist; no ALTER statements needed."

    insert_block = "\n\n".join(insert_row_sql(**row) for row in rows)

    return dedent(f"""
    -- 332: agentsam_route_requirements deterministic tool routing setup
    -- Generated by agentsam_route_requirements_tool_routing_setup.py.
    -- Purpose:
    --   Add mode/tool-routing columns if missing and seed route/task/mode rows
    --   so Agent Sam chooses tools deterministically instead of broad guessing.

    {alter_block}

    -- Normalize existing active rows so resolver has no null ambiguity.
    UPDATE agentsam_route_requirements
    SET
      mode = COALESCE(mode, 'default'),
      allowed_lanes_json = COALESCE(NULLIF(allowed_lanes_json, ''), '[]'),
      required_capability_keys_json = COALESCE(NULLIF(required_capability_keys_json, ''), '[]'),
      optional_capability_keys_json = COALESCE(NULLIF(optional_capability_keys_json, ''), '[]'),
      blocked_capability_keys_json = COALESCE(NULLIF(blocked_capability_keys_json, ''), '[]'),
      approval_policy_json = COALESCE(NULLIF(approval_policy_json, ''), '{{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}}'),
      max_tools = COALESCE(max_tools, 4)
    WHERE is_active = 1;

    {insert_block}

    -- Verification result.
    SELECT
      route_key,
      task_type,
      mode,
      requires_tools,
      allowed_lanes_json,
      required_capability_keys_json,
      optional_capability_keys_json,
      blocked_capability_keys_json,
      approval_policy_json,
      max_tools,
      is_active
    FROM agentsam_route_requirements
    WHERE is_active = 1
    ORDER BY route_key, task_type, mode;
    """).strip() + "\n"


def apply_migration(db: str, config: str, migration_path: Path) -> None:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        db,
        "--remote",
        "-c",
        config,
        "--file",
        str(migration_path),
    ]
    print("[apply] " + " ".join(cmd))
    run(cmd, capture=False, check=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--migration", default=DEFAULT_MIGRATION)
    parser.add_argument("--no-inspect", action="store_true", help="Do not inspect D1 columns; write all ALTER statements.")
    parser.add_argument("--apply", action="store_true", help="Apply the generated migration to remote D1.")
    args = parser.parse_args()

    require_wrangler()

    root = Path.cwd()
    migration_path = root / args.migration
    migration_path.parent.mkdir(parents=True, exist_ok=True)

    existing_columns = None if args.no_inspect else get_existing_columns(args.db, args.config)
    sql = build_sql(existing_columns)
    migration_path.write_text(sql, encoding="utf-8")

    print(f"[ok] wrote {migration_path}")
    if existing_columns is not None:
        missing = sorted(set(REQUIRED_COLUMNS) - existing_columns)
        print(f"[schema] existing_columns={len(existing_columns)} missing_tool_columns={missing}")

    print("[next] review:")
    print(f"  sed -n '1,260p' {migration_path}")

    if args.apply:
        apply_migration(args.db, args.config, migration_path)
        print("[ok] applied migration")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
