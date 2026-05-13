#!/usr/bin/env python3
"""
Agent Sam deterministic tool-routing alignment + validation + optional deploy.

Purpose
-------
1) Inspect the live D1 schema for:
   - agentsam_prompt_routes
   - agentsam_route_requirements
   - v_agentsam_mcp_tools_branded
2) Generate/fix migration (WIP sidecar — **not** `migrations/333_*.sql`; merge into
   `migrations/333_agentsam_route_tool_routing_priority_alignment.sql` when promoting):
   - migrations/_wip_generated_agentsam_route_requirements_specialized_routes.sql
3) Validate that migration SQL is compatible with the current D1 shape.
4) Dry-run by default:
   - prints the planned migration
   - checks parent route coverage
   - checks branded view capability coverage
   - checks route priority ordering
5) With --apply:
   - applies migration 333 to remote D1
   - reruns D1 verification
6) With --deploy:
   - runs build/syntax checks
   - runs npm run deploy:full:safe
   - reruns HTTP/catalog + audit checks after deploy

Usage
-----
Dry run only:
  python3 scripts/audit/agentsam_route_tool_alignment_e2e.py

Apply migration, no deploy:
  python3 scripts/audit/agentsam_route_tool_alignment_e2e.py --apply

Apply + deploy:
  python3 scripts/audit/agentsam_route_tool_alignment_e2e.py --apply --deploy

Use custom DB/config:
  python3 scripts/audit/agentsam_route_tool_alignment_e2e.py \
    --db inneranimalmedia-business \
    --wrangler-config wrangler.production.toml

Notes
-----
- This script intentionally does NOT create route keys that do not exist in agentsam_prompt_routes.
- agentsam_route_requirements currently has UNIQUE(route_key), so it uses UPDATE + INSERT one row per route_key.
- It is safe to run repeatedly.
- It does not print secrets.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_WRANGLER_CONFIG = "wrangler.production.toml"
# Never write migrations/333_*.sql — that prefix is reserved for the authoritative Worker migration
# `333_agentsam_route_tool_routing_priority_alignment.sql`. Generator output is a WIP sidecar only.
MIGRATION_PATH = ROOT / "migrations" / "_wip_generated_agentsam_route_requirements_specialized_routes.sql"
AUTHORITATIVE_MIGRATION_333 = ROOT / "migrations" / "333_agentsam_route_tool_routing_priority_alignment.sql"

SPECIAL_ROUTE_KEYS = [
    "agent_cloudflare",
    "agent_code",
    "agent_cost_audit",
    "agent_database",
    "agent_debug",
    "agent_frontend",
    "agent_general",
    "agent_planning",
    "agent_research",
    "agent_smoke_test",
    "agent_terminal",
    "agent_tool_orchestration",
    "cms_live_editor.design_template_library",
    "cms_live_editor.discover_cms_schema",
    "cms_live_editor.generate_dev_app_manifest",
    "cms_live_editor.promotion_gate",
    "cms_live_editor.verify_contract",
    "cms_live_editor.write_r2_artifacts",
    "ollama-local-workflow-pinstest",
]

APPROVAL_DEFAULT = {
    "default": "allow",
    "read": "allow",
    "mutation": "approval_required",
    "dangerous": "deny",
}

APPROVAL_LOCAL_DEV = {
    "default": "approval_required",
    "read": "allow",
    "mutation": "approval_required",
    "dangerous": "approval_required",
}

ROUTE_SPECS: dict[str, dict[str, Any]] = {
    "agent_cloudflare": {
        "task_type": "deploy",
        "mode": "approved_mutation",
        "allowed_lanes": ["develop", "observe", "operate"],
        "required": [],
        "optional": ["worker.preview", "logs.read", "r2.read", "r2.write", "d1.read", "github.read", "github.write", "terminal.execute"],
        "blocked": ["email.broadcast", "secret.write"],
        "max_tools": 10,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_code": {
        "task_type": "develop",
        "mode": "default",
        "allowed_lanes": ["develop", "inspect", "observe"],
        "required": ["code.search"],
        "optional": ["github.read", "github.write", "terminal.execute", "d1.read", "r2.read"],
        "blocked": ["worker.deploy", "email.broadcast", "secret.write"],
        "max_tools": 12,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_frontend": {
        "task_type": "develop",
        "mode": "default",
        "allowed_lanes": ["develop", "inspect", "observe", "design"],
        "required": ["code.search"],
        "optional": ["browser.inspect", "github.read", "github.write", "r2.read", "r2.write", "worker.preview"],
        "blocked": ["email.broadcast", "secret.write"],
        "max_tools": 12,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_database": {
        "task_type": "database",
        "mode": "approved_mutation",
        "allowed_lanes": ["develop", "inspect", "observe"],
        "required": ["d1.read"],
        "optional": ["d1.write", "d1.batch_write", "schema.inspect", "logs.read"],
        "blocked": ["worker.deploy", "email.broadcast", "secret.write"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_terminal": {
        "task_type": "deploy",
        "mode": "approved_mutation",
        "allowed_lanes": ["develop", "observe", "operate"],
        "required": [],
        "optional": ["terminal.execute", "logs.read", "github.read", "d1.read", "r2.read"],
        "blocked": ["email.broadcast", "secret.write"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_debug": {
        "task_type": "debug",
        "mode": "default",
        "allowed_lanes": ["inspect", "observe", "develop"],
        "required": [],
        "optional": ["browser.inspect", "logs.read", "d1.read", "r2.read", "github.read", "code.search", "mcp.catalog.read"],
        "blocked": ["worker.deploy", "email.broadcast", "secret.write"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_tool_orchestration": {
        "task_type": "tool_use",
        "mode": "default",
        "allowed_lanes": ["think", "research", "inspect", "observe", "develop", "operate", "integrate", "admin"],
        "required": ["mcp.catalog.read"],
        "optional": ["mcp.tool.inspect", "workflow.run", "agent.run", "d1.read", "logs.read"],
        "blocked": ["worker.deploy", "secret.write", "email.broadcast"],
        "max_tools": 24,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_smoke_test": {
        "task_type": "tool_use",
        "mode": "default_safe",
        "allowed_lanes": ["inspect", "observe", "develop"],
        "required": ["mcp.catalog.read"],
        "optional": ["d1.read", "logs.read", "mcp.tool.inspect"],
        "blocked": ["worker.deploy", "d1.write", "d1.batch_write", "terminal.execute", "secret.write", "email.broadcast"],
        "max_tools": 12,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_cost_audit": {
        "task_type": "finance",
        "mode": "default",
        "allowed_lanes": ["inspect", "observe", "integrate"],
        "required": [],
        "optional": ["d1.read", "logs.read", "context.search", "mcp.catalog.read"],
        "blocked": ["worker.deploy", "d1.write", "terminal.execute", "secret.write", "email.broadcast", "billing.mutate"],
        "max_tools": 6,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_research": {
        "task_type": "research",
        "mode": "default",
        "allowed_lanes": ["research", "inspect", "think"],
        "required": [],
        "optional": ["context.search", "memory.read", "browser.inspect", "mcp.catalog.read"],
        "blocked": ["worker.deploy", "d1.write", "terminal.execute", "secret.write", "email.broadcast"],
        "max_tools": 6,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_planning": {
        "task_type": "plan",
        "mode": "default",
        "allowed_lanes": ["think", "research", "inspect"],
        "required": [],
        "optional": ["context.search", "memory.read", "d1.read", "mcp.catalog.read"],
        "blocked": ["worker.deploy", "d1.write", "terminal.execute", "secret.write", "email.broadcast"],
        "max_tools": 6,
        "approval": APPROVAL_DEFAULT,
    },
    "agent_general": {
        "task_type": "chat",
        "mode": "default",
        "allowed_lanes": ["think", "research", "inspect"],
        "required": [],
        "optional": ["memory.read", "context.search", "browser.inspect", "d1.read", "mcp.catalog.read"],
        "blocked": ["worker.deploy", "d1.write", "terminal.execute", "secret.write", "email.broadcast"],
        "max_tools": 4,
        "approval": APPROVAL_DEFAULT,
    },
    "cms_live_editor.discover_cms_schema": {
        "task_type": "cms_schema",
        "mode": "default",
        "allowed_lanes": ["inspect", "develop", "design"],
        "required": ["d1.read"],
        "optional": ["cms.schema.read", "r2.read", "context.search"],
        "blocked": ["worker.deploy", "d1.write", "terminal.execute", "secret.write", "email.broadcast"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "cms_live_editor.design_template_library": {
        "task_type": "cms_design",
        "mode": "default",
        "allowed_lanes": ["design", "inspect", "develop"],
        "required": [],
        "optional": ["cms.template.read", "r2.read", "browser.inspect", "context.search"],
        "blocked": ["worker.deploy", "d1.write", "terminal.execute", "secret.write", "email.broadcast"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "cms_live_editor.generate_dev_app_manifest": {
        "task_type": "cms_manifest",
        "mode": "default",
        "allowed_lanes": ["develop", "design", "inspect"],
        "required": [],
        "optional": ["cms.manifest.write", "r2.read", "r2.write", "d1.read"],
        "blocked": ["worker.deploy", "secret.write", "email.broadcast"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "cms_live_editor.write_r2_artifacts": {
        "task_type": "cms_publish",
        "mode": "approved_mutation",
        "allowed_lanes": ["develop", "design", "operate"],
        "required": ["r2.write"],
        "optional": ["r2.read", "d1.read", "cms.artifact.write"],
        "blocked": ["worker.deploy", "secret.write", "email.broadcast"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "cms_live_editor.verify_contract": {
        "task_type": "cms_verify",
        "mode": "default",
        "allowed_lanes": ["inspect", "observe", "develop"],
        "required": [],
        "optional": ["browser.inspect", "r2.read", "d1.read", "logs.read"],
        "blocked": ["worker.deploy", "d1.write", "terminal.execute", "secret.write", "email.broadcast"],
        "max_tools": 8,
        "approval": APPROVAL_DEFAULT,
    },
    "cms_live_editor.promotion_gate": {
        "task_type": "cms_approval",
        "mode": "approved_mutation",
        "allowed_lanes": ["inspect", "observe", "operate"],
        "required": ["approval.request"],
        "optional": ["d1.read", "logs.read", "r2.read"],
        "blocked": ["worker.deploy", "secret.write", "email.broadcast"],
        "max_tools": 6,
        "approval": APPROVAL_DEFAULT,
    },
    "ollama-local-workflow-pinstest": {
        "task_type": "local_test",
        "mode": "local_dev_dangerous",
        "allowed_lanes": ["develop", "observe"],
        "required": [],
        "optional": ["terminal.execute", "logs.read", "workflow.run"],
        "blocked": ["worker.deploy", "secret.write", "email.broadcast"],
        "max_tools": 8,
        "approval": APPROVAL_LOCAL_DEV,
    },
}


@dataclass
class Check:
    name: str
    status: str
    detail: str = ""

    def print(self) -> None:
        marker = {"OK": "[OK]", "WARN": "[WARN]", "FAIL": "[FAIL]", "SKIP": "[SKIP]"}.get(self.status, "[?]")
        print(f"{marker} {self.name}: {self.detail}")


def redact(s: str) -> str:
    s = re.sub(r"(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+", r"\1[REDACTED]", s, flags=re.I)
    s = re.sub(r"(Cookie:\s*session=)[^\\s]+", r"\1[REDACTED]", s, flags=re.I)
    s = re.sub(r"(session=)[A-Za-z0-9._~+/=-]+", r"\1[REDACTED]", s)
    return s


def run(cmd: list[str], *, check: bool = False, capture: bool = True, env: dict[str, str] | None = None, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    printable = " ".join(shlex.quote(x) for x in cmd)
    print(f"$ {printable}")
    cp = subprocess.run(
        cmd,
        cwd=str(cwd or ROOT),
        env={**os.environ, **(env or {})},
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if capture:
        if cp.stdout:
            print(redact(cp.stdout.rstrip()))
        if cp.stderr:
            print(redact(cp.stderr.rstrip()), file=sys.stderr)
    if check and cp.returncode != 0:
        raise SystemExit(f"command failed ({cp.returncode}): {printable}")
    return cp


def d1_json(db: str, config: str, sql: str) -> list[dict[str, Any]]:
    cp = run([
        "npx", "wrangler", "d1", "execute", db,
        "--remote", "-c", config,
        "--json", "--command", sql,
    ], check=True)
    try:
        return json.loads(cp.stdout or "[]")
    except json.JSONDecodeError as e:
        raise SystemExit(f"Could not parse wrangler JSON: {e}")


def d1_results(db: str, config: str, sql: str) -> list[dict[str, Any]]:
    payload = d1_json(db, config, sql)
    if not payload:
        return []
    return payload[0].get("results") or []


def sql_str(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def json_str(value: Any) -> str:
    return sql_str(json.dumps(value, separators=(",", ":")))


def build_migration_sql(parent_keys: set[str]) -> tuple[str, list[str]]:
    missing_parents = [key for key in ROUTE_SPECS if key not in parent_keys]
    usable_specs = {k: v for k, v in ROUTE_SPECS.items() if k in parent_keys}

    lines: list[str] = []
    lines.append("-- WIP: specialized agentsam_route_requirements (merge into 333_agentsam_route_tool_routing_priority_alignment.sql)")
    lines.append("-- Generated by agentsam_route_tool_alignment_e2e.py")
    lines.append("-- Safe to re-run. Uses UPDATE + INSERT one row per route_key because route_key is UNIQUE.")
    lines.append("")
    lines.append("BEGIN TRANSACTION;")
    lines.append("")

    if missing_parents:
        lines.append("-- Skipped specs because these route_keys do not exist in agentsam_prompt_routes:")
        for key in missing_parents:
            lines.append(f"--   - {key}")
        lines.append("")

    for route_key, spec in usable_specs.items():
        task = spec["task_type"]
        mode = spec["mode"]
        requires_tools = 1
        requires_streaming = 1
        preferred_tier = "standard" if spec["max_tools"] > 6 else "mini"
        max_tier = "pro" if spec["max_tools"] >= 8 else "standard"
        budget_priority = "quality" if spec["max_tools"] >= 8 else "balanced"
        preferred_providers = ["openai", "google", "anthropic", "workers_ai"]
        blocked_providers: list[str] = []

        set_clause = f"""
  task_type = {sql_str(task)},
  mode = {sql_str(mode)},
  requires_tools = {requires_tools},
  requires_streaming = {requires_streaming},
  preferred_tier = {sql_str(preferred_tier)},
  max_tier = {sql_str(max_tier)},
  budget_priority = {sql_str(budget_priority)},
  preferred_providers = {json_str(preferred_providers)},
  blocked_providers = {json_str(blocked_providers)},
  allowed_lanes_json = {json_str(spec["allowed_lanes"])},
  required_capability_keys_json = {json_str(spec["required"])},
  optional_capability_keys_json = {json_str(spec["optional"])},
  blocked_capability_keys_json = {json_str(spec["blocked"])},
  approval_policy_json = {json_str(spec["approval"])},
  max_tools = {int(spec["max_tools"])},
  is_active = 1
""".rstrip()

        lines.append(f"-- {route_key}")
        lines.append("UPDATE agentsam_route_requirements")
        lines.append("SET")
        lines.append(set_clause)
        lines.append(f"WHERE route_key = {sql_str(route_key)};")
        lines.append("")
        lines.append("INSERT INTO agentsam_route_requirements (")
        lines.append("  route_key, task_type, mode, requires_tools, requires_streaming, preferred_tier, max_tier,")
        lines.append("  budget_priority, preferred_providers, blocked_providers, allowed_lanes_json,")
        lines.append("  required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json,")
        lines.append("  approval_policy_json, max_tools, is_active")
        lines.append(")")
        lines.append("SELECT")
        vals = [
            sql_str(route_key),
            sql_str(task),
            sql_str(mode),
            str(requires_tools),
            str(requires_streaming),
            sql_str(preferred_tier),
            sql_str(max_tier),
            sql_str(budget_priority),
            json_str(preferred_providers),
            json_str(blocked_providers),
            json_str(spec["allowed_lanes"]),
            json_str(spec["required"]),
            json_str(spec["optional"]),
            json_str(spec["blocked"]),
            json_str(spec["approval"]),
            str(int(spec["max_tools"])),
            "1",
        ]
        lines.append("  " + ",\n  ".join(vals))
        lines.append(f"WHERE EXISTS (SELECT 1 FROM agentsam_prompt_routes WHERE route_key = {sql_str(route_key)})")
        lines.append(f"  AND NOT EXISTS (SELECT 1 FROM agentsam_route_requirements WHERE route_key = {sql_str(route_key)});")
        lines.append("")

    lines.append("COMMIT;")
    lines.append("")
    lines.append("-- Verification")
    lines.append("SELECT route_key, task_type, mode, max_tools, allowed_lanes_json, required_capability_keys_json, optional_capability_keys_json, blocked_capability_keys_json")
    lines.append("FROM agentsam_route_requirements")
    lines.append("WHERE route_key IN (")
    lines.append("  " + ",\n  ".join(sql_str(k) for k in SPECIAL_ROUTE_KEYS))
    lines.append(")")
    lines.append("ORDER BY route_key;")
    lines.append("")

    return "\n".join(lines), missing_parents


def ensure_migration_file(db: str, config: str) -> Check:
    parent_rows = d1_results(db, config, """
SELECT route_key
FROM agentsam_prompt_routes
WHERE is_active = 1;
""")
    parent_keys = {r["route_key"] for r in parent_rows if r.get("route_key")}
    sql, missing = build_migration_sql(parent_keys)

    MIGRATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    old = MIGRATION_PATH.read_text() if MIGRATION_PATH.exists() else None
    MIGRATION_PATH.write_text(sql)
    detail = f"wrote {MIGRATION_PATH.relative_to(ROOT)}; specs={len(ROUTE_SPECS)} usable={len(ROUTE_SPECS)-len(missing)} missing_parent_specs={len(missing)}"
    if old == sql:
        detail = f"unchanged {MIGRATION_PATH.relative_to(ROOT)}; specs={len(ROUTE_SPECS)} usable={len(ROUTE_SPECS)-len(missing)} missing_parent_specs={len(missing)}"
    return Check("migration.333.generated", "OK" if not missing else "WARN", detail)


def check_required_local_files() -> list[Check]:
    checks: list[Check] = []
    required = [
        "src/api/agent.js",
        "src/api/mcp.js",
        "src/core/mcp-tools-branded.js",
        "src/core/agentsam-route-tool-resolver.js",
        "src/core/agentsam-ops-ledger.js",
        "package.json",
    ]
    missing = [p for p in required if not (ROOT / p).exists()]
    checks.append(Check("preflight.local_files", "OK" if not missing else "FAIL", f"missing={missing or 'none'}"))
    return checks


def check_d1_schema(db: str, config: str) -> list[Check]:
    checks: list[Check] = []
    required_tables = [
        "agentsam_prompt_routes",
        "agentsam_route_requirements",
        "agentsam_tool_call_log",
        "agentsam_mcp_tool_execution",
        "mcp_workspace_tokens",
        "v_agentsam_mcp_tools_branded",
    ]
    rows = d1_results(db, config, f"""
SELECT name, type
FROM sqlite_master
WHERE name IN ({','.join(sql_str(x) for x in required_tables)})
ORDER BY name;
""")
    found = {r["name"] for r in rows}
    missing = [x for x in required_tables if x not in found]
    checks.append(Check("d1.schema.required_objects", "OK" if not missing else "FAIL", f"missing={missing or 'none'}"))

    rr_cols = d1_results(db, config, "PRAGMA table_info(agentsam_route_requirements);")
    rr_col_names = {r["name"] for r in rr_cols}
    needed = {
        "mode",
        "allowed_lanes_json",
        "required_capability_keys_json",
        "optional_capability_keys_json",
        "blocked_capability_keys_json",
        "approval_policy_json",
        "max_tools",
    }
    missing_cols = sorted(needed - rr_col_names)
    checks.append(Check("d1.route_requirements.deterministic_columns", "OK" if not missing_cols else "FAIL", f"missing={missing_cols or 'none'}"))

    view_cols = d1_results(db, config, "PRAGMA table_info(v_agentsam_mcp_tools_branded);")
    view_col_names = {r["name"] for r in view_cols}
    wanted_identity = {"id", "tool_name", "tool_key", "capability_lane", "handler_brand", "handler_type", "risk_level", "requires_approval"}
    missing_identity = sorted(wanted_identity - view_col_names)
    capability_status = "OK" if "capability_key" in view_col_names else "FAIL"
    checks.append(Check("d1.branded_view.identity_columns", "OK" if not missing_identity else "WARN", f"missing={missing_identity or 'none'}"))
    checks.append(Check("d1.branded_view.capability_key_column", capability_status, f"columns={sorted(view_col_names)}"))

    return checks


def check_route_alignment(db: str, config: str) -> list[Check]:
    checks: list[Check] = []

    missing = d1_results(db, config, f"""
SELECT pr.route_key, pr.display_name, pr.priority
FROM agentsam_prompt_routes pr
LEFT JOIN agentsam_route_requirements rr ON rr.route_key = pr.route_key
WHERE pr.is_active = 1
  AND (
    pr.route_key LIKE 'agent_%'
    OR pr.route_key LIKE 'cms_live_editor.%'
    OR pr.route_key IN ('simple_ask_greeting','ollama-local-workflow-pinstest')
  )
  AND rr.route_key IS NULL
ORDER BY pr.priority ASC, pr.route_key ASC;
""")
    unexpected = [r["route_key"] for r in missing if r["route_key"] != "simple_ask_greeting"]
    checks.append(Check(
        "d1.route_requirements.parent_missing",
        "OK" if not unexpected else "WARN",
        f"unexpected_missing={len(unexpected)} keys={unexpected[:25]}",
    ))

    unconfigured = d1_results(db, config, """
SELECT route_key, task_type, mode, max_tools, allowed_lanes_json
FROM agentsam_route_requirements
WHERE is_active = 1
  AND (
    task_type IS NULL
    OR mode IS NULL
    OR max_tools IS NULL
    OR allowed_lanes_json IS NULL
    OR allowed_lanes_json = '[]'
  )
ORDER BY route_key;
""")
    allowed_unconfigured = {"simple_ask_greeting"}
    bad = [r for r in unconfigured if r.get("route_key") not in allowed_unconfigured]
    checks.append(Check("d1.route_requirements.unconfigured", "OK" if not bad else "WARN", f"bad={len(bad)} sample={bad[:10]}"))

    dup = d1_results(db, config, """
SELECT priority, COUNT(*) AS n, group_concat(route_key) AS route_keys
FROM agentsam_prompt_routes
WHERE is_active = 1
GROUP BY priority
HAVING COUNT(*) > 1
ORDER BY priority ASC;
""")
    # Duplicate priority buckets are not fatal globally; they are only a problem if specialized buckets are flat.
    checks.append(Check("d1.prompt_routes.duplicate_priority_buckets", "OK", f"buckets={len(dup)} sample={dup[:8]}"))

    ladder = d1_results(db, config, """
SELECT route_key, display_name, max_tools, priority
FROM agentsam_prompt_routes
WHERE route_key LIKE 'agent_%'
   OR route_key LIKE 'cms_live_editor.%'
   OR route_key IN ('simple_ask_greeting','ollama-local-workflow-pinstest')
ORDER BY priority ASC, route_key ASC;
""")
    priorities = [r["priority"] for r in ladder if r.get("route_key") in SPECIAL_ROUTE_KEYS or r.get("route_key") == "simple_ask_greeting"]
    flat = len(set(priorities)) <= 3 and len(priorities) > 6
    checks.append(Check("d1.prompt_routes.specialized_priority_ladder", "OK" if not flat else "WARN", f"routes={len(ladder)} unique_priorities={len(set(priorities))}"))

    return checks


def check_branded_tools(db: str, config: str) -> list[Check]:
    checks: list[Check] = []

    summary = d1_results(db, config, """
SELECT
  COALESCE(capability_lane, 'null') AS capability_lane,
  COALESCE(handler_brand, 'null') AS handler_brand,
  COUNT(*) AS tools,
  SUM(CASE WHEN COALESCE(requires_approval,0)=1 THEN 1 ELSE 0 END) AS approval_tools
FROM v_agentsam_mcp_tools_branded
GROUP BY COALESCE(capability_lane, 'null'), COALESCE(handler_brand, 'null')
ORDER BY tools DESC
LIMIT 100;
""")
    unknown = [r for r in summary if r.get("capability_lane") in (None, "null", "general") or r.get("handler_brand") in (None, "null", "Unknown Runtime")]
    checks.append(Check("d1.branded_tools.summary", "OK" if summary else "FAIL", f"groups={len(summary)} null_or_unknown_groups={len(unknown)}"))

    view_cols = d1_results(db, config, "PRAGMA table_info(v_agentsam_mcp_tools_branded);")
    view_col_names = {r["name"] for r in view_cols}
    if "capability_key" not in view_col_names:
        checks.append(Check("d1.branded_tools.capability_coverage", "FAIL", "v_agentsam_mcp_tools_branded missing capability_key"))
        return checks

    coverage = d1_results(db, config, """
SELECT
  COALESCE(capability_key, 'null') AS capability_key,
  COUNT(*) AS tools,
  SUM(CASE WHEN COALESCE(enabled,1)=1 THEN 1 ELSE 0 END) AS enabled_tools
FROM v_agentsam_mcp_tools_branded
GROUP BY COALESCE(capability_key, 'null')
ORDER BY tools DESC
LIMIT 200;
""")
    empty = [r for r in coverage if r.get("capability_key") in (None, "", "null")]
    checks.append(Check(
        "d1.branded_tools.capability_coverage",
        "OK" if coverage and not empty else "WARN",
        f"capability_groups={len(coverage)} empty_capability_groups={len(empty)}",
    ))
    return checks


def apply_migration(db: str, config: str) -> Check:
    path = AUTHORITATIVE_MIGRATION_333
    if not path.exists():
        return Check("migration.333.apply", "FAIL", f"missing {path}")
    cp = run([
        "npx", "wrangler", "d1", "execute", db,
        "--remote", "-c", config,
        "--file", str(path),
    ], check=False, capture=True)
    return Check("migration.333.apply", "OK" if cp.returncode == 0 else "FAIL", f"exit={cp.returncode} file={path.name}")


def run_syntax_and_build() -> list[Check]:
    checks: list[Check] = []
    files = [
        "src/api/agent.js",
        "src/api/mcp.js",
        "src/core/mcp-tools-branded.js",
        "src/core/agentsam-route-tool-resolver.js",
        "src/core/agentsam-ops-ledger.js",
    ]
    for p in files:
        cp = run(["node", "--check", p], check=False)
        checks.append(Check(f"node.check.{p}", "OK" if cp.returncode == 0 else "FAIL", f"exit={cp.returncode}"))

    cp = run(["npm", "run", "build:vite-only"], check=False)
    checks.append(Check("npm.build_vite_only", "OK" if cp.returncode == 0 else "FAIL", f"exit={cp.returncode}"))
    return checks


def deploy_full_safe() -> Check:
    cp = run(["npm", "run", "deploy:full:safe"], check=False, capture=False)
    return Check("deploy.full_safe", "OK" if cp.returncode == 0 else "FAIL", f"exit={cp.returncode}")


def read_session_cookie() -> str | None:
    env = os.environ.get("IAM_SESSION")
    if env:
        return env.replace("session=", "").strip()
    cookie_path = Path.home() / ".iam-session-cookie"
    if cookie_path.exists():
        raw = cookie_path.read_text().strip()
        return raw.replace("session=", "").strip()
    return None


def http_json(url: str, session: str | None) -> tuple[int, Any]:
    cmd = ["curl", "-sS", "-w", "\n%{http_code}", url]
    if session:
        cmd.extend(["-H", f"Cookie: session={session}"])
    cp = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = cp.stdout or ""
    if "\n" not in out:
        return (0, None)
    body, status_s = out.rsplit("\n", 1)
    try:
        status = int(status_s.strip())
    except ValueError:
        status = 0
    try:
        data = json.loads(body) if body.strip() else None
    except json.JSONDecodeError:
        data = body[:500]
    return status, data


def check_http_catalog(base_url: str) -> list[Check]:
    checks: list[Check] = []
    session = read_session_cookie()
    if not session:
        checks.append(Check("http.session", "WARN", "IAM_SESSION and ~/.iam-session-cookie missing; HTTP auth checks may be 403"))
    else:
        checks.append(Check("http.session", "OK", "session cookie found but not printed"))

    lanes = ["think", "research", "inspect", "observe", "develop", "design", "operate", "integrate", "admin"]
    unique_tools: set[str] = set()
    failed = 0
    for lane in lanes:
        url = f"{base_url.rstrip('/')}/api/mcp/tools/catalog?lane={lane}&limit=24&include_schema=false"
        status, data = http_json(url, session)
        ok = isinstance(data, dict) and data.get("ok") is True
        tools = data.get("tools", []) if isinstance(data, dict) else []
        for t in tools:
            if isinstance(t, dict) and t.get("tool_name"):
                unique_tools.add(t["tool_name"])
        if status != 200 or not ok:
            failed += 1
            checks.append(Check(f"http.catalog.{lane}", "WARN", f"status={status} ok={data.get('ok') if isinstance(data, dict) else None} count={len(tools)}"))
        else:
            checks.append(Check(f"http.catalog.{lane}", "OK", f"status={status} count={len(tools)}"))

    checks.append(Check("http.catalog.aggregate_coverage", "OK" if unique_tools else "WARN", f"unique_tools={len(unique_tools)} failed_lanes={failed}"))
    return checks


def run_existing_sprint_audit(include_tool_smoke: bool, include_agent_chat_dry_run: bool) -> Check:
    audit = ROOT / "scripts" / "audit" / "agentsam_mcp_tool_e2e_sprint.py"
    if not audit.exists():
        return Check("audit.existing_mcp_tool_e2e_sprint", "SKIP", "scripts/audit/agentsam_mcp_tool_e2e_sprint.py not found")
    cmd = ["python3", str(audit)]
    if include_tool_smoke:
        cmd.append("--include-tool-smoke")
    if include_agent_chat_dry_run:
        cmd.append("--include-agent-chat-dry-run")
    cp = run(cmd, check=False, capture=False)
    return Check("audit.existing_mcp_tool_e2e_sprint", "OK" if cp.returncode == 0 else "WARN", f"exit={cp.returncode}")


def print_section(title: str) -> None:
    print("\n" + "=" * 92)
    print(title)
    print("=" * 92)


def fail_if_needed(checks: list[Check], *, allow_warnings: bool = True) -> None:
    fails = [c for c in checks if c.status == "FAIL"]
    warns = [c for c in checks if c.status == "WARN"]
    if fails:
        print_section("FAILURES")
        for c in fails:
            c.print()
        raise SystemExit(1)
    if warns and not allow_warnings:
        print_section("WARNINGS BLOCKING")
        for c in warns:
            c.print()
        raise SystemExit(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("IAM_D1_DB", DEFAULT_DB))
    ap.add_argument("--wrangler-config", default=os.environ.get("IAM_WRANGLER_CONFIG", DEFAULT_WRANGLER_CONFIG))
    ap.add_argument("--base-url", default=os.environ.get("IAM_BASE_URL", "https://inneranimalmedia.com"))
    ap.add_argument("--apply", action="store_true", help="Apply migration 333 to remote D1.")
    ap.add_argument("--deploy", action="store_true", help="Run deploy:full:safe after apply + checks pass.")
    ap.add_argument("--include-tool-smoke", action="store_true", help="Pass through to existing sprint audit.")
    ap.add_argument("--include-agent-chat-dry-run", action="store_true", help="Pass through to existing sprint audit.")
    ap.add_argument("--strict-warnings", action="store_true", help="Treat warnings as blocking.")
    args = ap.parse_args()

    print_section("Agent Sam route/tool alignment E2E")
    print(f"repo={ROOT}")
    print(f"db={args.db}")
    print(f"wrangler_config={args.wrangler_config}")
    print(f"mode={'APPLY' if args.apply else 'DRY_RUN'} deploy={args.deploy}")

    all_checks: list[Check] = []

    print_section("0. local preflight")
    all_checks.extend(check_required_local_files())
    for c in all_checks[-1:]:
        c.print()
    fail_if_needed(all_checks, allow_warnings=not args.strict_warnings)

    print_section("1. generate migration 333")
    c = ensure_migration_file(args.db, args.wrangler_config)
    all_checks.append(c)
    c.print()
    print(f"\n--- {MIGRATION_PATH.relative_to(ROOT)} preview ---")
    preview = MIGRATION_PATH.read_text().splitlines()
    for line in preview[:220]:
        print(line)
    if len(preview) > 220:
        print(f"-- ... truncated preview; total_lines={len(preview)}")

    print_section("2. D1 schema checks")
    checks = check_d1_schema(args.db, args.wrangler_config)
    all_checks.extend(checks)
    for c in checks:
        c.print()
    # Missing capability_key is allowed to be visible in dry run, but it must be fixed before deployment.
    schema_fails = [c for c in checks if c.status == "FAIL" and c.name != "d1.branded_view.capability_key_column"]
    if schema_fails:
        fail_if_needed(schema_fails, allow_warnings=not args.strict_warnings)

    print_section("3. D1 route/tool checks before apply")
    checks = []
    checks.extend(check_route_alignment(args.db, args.wrangler_config))
    checks.extend(check_branded_tools(args.db, args.wrangler_config))
    all_checks.extend(checks)
    for c in checks:
        c.print()

    if not args.apply:
        print_section("DRY RUN COMPLETE")
        print("No D1 writes or deploy were performed.")
        print("Next:")
        print(f"  python3 {Path(__file__).name if '__file__' in globals() else 'agentsam_route_tool_alignment_e2e.py'} --apply")
        print("Then, after D1 checks pass:")
        print(f"  python3 {Path(__file__).name if '__file__' in globals() else 'agentsam_route_tool_alignment_e2e.py'} --apply --deploy")
        return 0

    print_section("4. apply migration 333")
    c = apply_migration(args.db, args.wrangler_config)
    all_checks.append(c)
    c.print()
    fail_if_needed([c], allow_warnings=False)

    print_section("5. D1 route/tool checks after apply")
    checks = []
    checks.extend(check_d1_schema(args.db, args.wrangler_config))
    checks.extend(check_route_alignment(args.db, args.wrangler_config))
    checks.extend(check_branded_tools(args.db, args.wrangler_config))
    all_checks.extend(checks)
    for c in checks:
        c.print()

    # At this point, route coverage must pass. capability_key fail means tell Cursor to fix the view before deploying.
    blocking = [
        c for c in checks
        if c.status == "FAIL"
        or (c.name == "d1.route_requirements.parent_missing" and c.status == "WARN")
    ]
    if blocking:
        print_section("BLOCKED BEFORE DEPLOY")
        for c in blocking:
            c.print()
        print("\nFix these before deploy. Most likely: add capability_key to v_agentsam_mcp_tools_branded if capability coverage failed.")
        return 1

    print_section("6. syntax/build checks")
    checks = run_syntax_and_build()
    all_checks.extend(checks)
    for c in checks:
        c.print()
    fail_if_needed(checks, allow_warnings=not args.strict_warnings)

    print_section("7. HTTP catalog checks before deploy")
    checks = check_http_catalog(args.base_url)
    all_checks.extend(checks)
    for c in checks:
        c.print()

    if not args.deploy:
        print_section("APPLY COMPLETE; DEPLOY SKIPPED")
        print("D1 migration applied and validation passed. Run again with --apply --deploy to deploy.")
        return 0

    print_section("8. deploy full safe")
    c = deploy_full_safe()
    all_checks.append(c)
    c.print()
    fail_if_needed([c], allow_warnings=False)

    print_section("9. post-deploy HTTP checks")
    time.sleep(2)
    checks = check_http_catalog(args.base_url)
    all_checks.extend(checks)
    for c in checks:
        c.print()

    print_section("10. optional existing sprint audit")
    c = run_existing_sprint_audit(args.include_tool_smoke, args.include_agent_chat_dry_run)
    all_checks.append(c)
    c.print()

    print_section("FINAL SUMMARY")
    counts: dict[str, int] = {}
    for c in all_checks:
        counts[c.status] = counts.get(c.status, 0) + 1
    print(json.dumps(counts, indent=2, sort_keys=True))
    fail_if_needed(all_checks, allow_warnings=not args.strict_warnings)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
