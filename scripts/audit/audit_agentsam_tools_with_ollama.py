#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_NAME = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
EXPECTED_TOOL_COUNT = int(os.getenv("EXPECTED_AGENTSAM_TOOLS", "43"))
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
RUN_OLLAMA = os.getenv("RUN_OLLAMA", "1").strip().lower() not in {"0", "false", "no"}

ROOT = Path.cwd()
OUT_DIR = ROOT / "artifacts" / "agentsam_tools_audit"
OUT_DIR.mkdir(parents=True, exist_ok=True)

STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
RAW_TOOLS_JSON = OUT_DIR / f"agentsam_tools_raw_{STAMP}.json"
AUDIT_JSON = OUT_DIR / f"agentsam_tools_audit_{STAMP}.json"
TODO_MD = OUT_DIR / f"agentsam_tools_bulletproof_todo_{STAMP}.md"
BACKFILL_SQL = OUT_DIR / f"agentsam_tools_backfill_suggested_{STAMP}.sql"
PROMPT_MD = OUT_DIR / f"agentsam_tools_ollama_prompt_{STAMP}.md"


def run_cmd(cmd: list[str], *, stdin: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("\n$ " + " ".join(cmd), flush=True)
    proc = subprocess.run(cmd, input=stdin, text=True, capture_output=True)
    if proc.stdout.strip():
        print(proc.stdout)
    if proc.stderr.strip():
        print(proc.stderr, file=sys.stderr)
    if check and proc.returncode != 0:
        raise SystemExit(proc.returncode)
    return proc


def d1(command: str) -> list[dict[str, Any]]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--json",
        "--command",
        command,
    ]
    proc = run_cmd(cmd)
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print("ERROR: Wrangler did not return parseable JSON.", file=sys.stderr)
        print(proc.stdout, file=sys.stderr)
        raise SystemExit(1) from exc
    if not payload:
        return []
    return payload[0].get("results", []) or []


def jsonish(value: Any, fallback: Any) -> tuple[Any, bool]:
    if value is None:
        return fallback, False
    if isinstance(value, (dict, list)):
        return value, True
    text = str(value).strip()
    if not text:
        return fallback, False
    try:
        return json.loads(text), True
    except Exception:
        return fallback, False


def clean_key(text: str) -> str:
    text = (text or "").strip().lower()
    text = re.sub(r"[^a-z0-9_.:-]+", "_", text)
    text = re.sub(r"_+", "_", text)
    return text.strip("_")


DIRECT_TOOL_KEYS = {
    "cloudflare_command_registry": "tool.cloudflare.commands.registry",
    "d1_query": "tool.cloudflare.d1.query_remote",
    "d1_schema": "tool.cloudflare.d1.schema_inspect",
    "r2_read": "tool.cloudflare.r2.object_read",
    "r2_write": "tool.cloudflare.r2.object_write",
    "r2_list": "tool.cloudflare.r2.object_list",
    "r2_delete": "tool.cloudflare.r2.object_delete",
    "github_file": "tool.github.file.read",
    "github_commit": "tool.github.commit.create",
    "github_pr": "tool.github.pr.create",
    "github_search": "tool.github.repo.search",
    "terminal_run": "tool.local.terminal.exec",
    "terminal_wrangler": "tool.cloudflare.wrangler.exec",
    "bridge_key_auth_test": "tool.terminal.bridge.health_check",
    "mcp_tool_call": "tool.mcp.invoke_tool",
    "mcp_workflow_trigger": "tool.mcp.workflow.trigger",
    "ai_completion": "tool.ai.completion",
    "ai_classify": "tool.ai.intent_classify",
    "ai_embed": "tool.ai.embedding",
    "http_fetch": "tool.network.http.fetch",
    "proxy_dispatch": "tool.network.proxy.dispatch",
    "cf_worker_deploy": "tool.cloudflare.worker.deploy",
    "cf_kv_read": "tool.cloudflare.kv.read",
    "cf_kv_write": "tool.cloudflare.kv.write",
    "cf_do_fetch": "tool.cloudflare.durable_object.fetch",
    "telemetry_write": "tool.observability.telemetry.write",
    "quality_gate_run": "tool.observability.quality_gate.run",
    "notify_deploy": "tool.notification.deploy",
    "notify_alert": "tool.notification.alert",
    "browser_navigate": "tool.browser.navigate",
    "workspace_read": "tool.workspace.context.read",
    "browser_content": "tool.browser.content.extract",
    "playwright_screenshot": "tool.browser.screenshot.capture",
    "agentsam_plan_create": "tool.planning.plan.create",
    "agentsam_todo_create": "tool.planning.todo.create",
    "agentsam_todo_update": "tool.planning.todo.update",
    "meauxcad_design_brief_create": "tool.design.cad.brief.create",
    "meauxcad_excalidraw_sketch_create": "tool.design.diagram.excalidraw.create",
    "meauxcad_openscad_generate": "tool.design.cad.openscad.generate",
    "meauxcad_openscad_export_stl": "tool.terminal.cad.openscad.export_stl",
    "meauxcad_blender_stl_to_glb": "tool.terminal.cad.blender.stl_to_glb",
    "meauxcad_asset_register": "tool.artifact.cad.register",
    "meauxcad_run_trace_log": "tool.observability.cad.trace_log",
}

DANGEROUS_NAMES = {
    "r2_write",
    "r2_delete",
    "github_commit",
    "github_pr",
    "terminal_run",
    "terminal_wrangler",
    "cf_worker_deploy",
    "cf_kv_write",
    "meauxcad_openscad_export_stl",
    "meauxcad_blender_stl_to_glb",
}

CORE_NAMES = {
    "cloudflare_command_registry",
    "d1_query",
    "d1_schema",
    "terminal_run",
    "terminal_wrangler",
    "mcp_tool_call",
    "ai_classify",
    "workspace_read",
    "agentsam_plan_create",
    "agentsam_todo_create",
    "agentsam_todo_update",
}

COMMON_NAMES = {
    "r2_read",
    "r2_list",
    "github_file",
    "github_search",
    "http_fetch",
    "browser_content",
    "playwright_screenshot",
    "browser_navigate",
    "quality_gate_run",
    "telemetry_write",
}


def expected_tool_key(tool: dict[str, Any]) -> str:
    name = str(tool.get("tool_name") or "").strip()
    category = str(tool.get("tool_category") or "").strip()
    if name in DIRECT_TOOL_KEYS:
        return DIRECT_TOOL_KEYS[name]
    if category:
        return "tool." + clean_key(category)
    return "tool." + clean_key(name)


def expected_capability_key(tool: dict[str, Any]) -> str:
    return expected_tool_key(tool).replace("tool.", "cap.", 1)


def expected_domain(tool: dict[str, Any]) -> str:
    text = f"{tool.get('tool_name') or ''} {tool.get('tool_category') or ''} {tool.get('description') or ''}".lower()
    if "d1" in text or "database" in text:
        return "database"
    if "r2" in text or "storage" in text or ".kv." in text:
        return "storage"
    if "github" in text:
        return "github"
    if "terminal" in text or "wrangler" in text:
        return "terminal"
    if "mcp" in text:
        return "mcp"
    if "ai" in text or "embedding" in text or "classify" in text:
        return "ai"
    if "cloudflare" in text or "worker" in text or "durable_object" in text:
        return "cloudflare"
    if "browser" in text or "playwright" in text:
        return "browser"
    if "observability" in text or "telemetry" in text or "quality_gate" in text:
        return "observability"
    if "planning" in text or "todo" in text or "plan" in text:
        return "planning"
    if "notification" in text or "notify" in text:
        return "notification"
    if "network" in text or "http" in text or "proxy" in text:
        return "network"
    if "design" in text or "cad" in text or "openscad" in text or "blender" in text:
        return "design"
    if "artifact" in text:
        return "artifact"
    if "workspace" in text:
        return "workspace"
    return "general"


def expected_task_type(tool: dict[str, Any]) -> str:
    domain = expected_domain(tool)
    name = str(tool.get("tool_name") or "").lower()
    category = str(tool.get("tool_category") or "").lower()
    if domain == "database":
        return "db_debug"
    if domain == "storage":
        return "storage_ops"
    if domain == "github":
        return "git_ops"
    if domain == "terminal":
        return "terminal_ops"
    if domain == "mcp":
        return "mcp_tool"
    if domain == "ai":
        return "ai_task"
    if "deploy" in name or "deploy" in category:
        return "deploy"
    if domain == "browser":
        return "browser_ops"
    if domain == "planning":
        return "planning"
    if domain == "observability":
        return "observability"
    if domain == "design":
        return "design_cad"
    return "tool_use"


def expected_tier(tool: dict[str, Any]) -> str:
    name = str(tool.get("tool_name") or "")
    if name in DANGEROUS_NAMES:
        return "dangerous"
    if str(tool.get("risk_level") or "").lower() in {"high", "critical"}:
        return "dangerous"
    if int(tool.get("requires_approval") or 0) == 1:
        return "dangerous"
    if name in CORE_NAMES:
        return "core"
    if name in COMMON_NAMES:
        return "common"
    if "cad" in str(tool.get("tool_category") or "").lower():
        return "specialized"
    return "common"


def expected_route_key(tool: dict[str, Any]) -> str:
    task_type = expected_task_type(tool)
    mapping = {
        "db_debug": "route.agent.db.audit",
        "storage_ops": "route.agent.storage.ops",
        "git_ops": "route.agent.git.ops",
        "terminal_ops": "route.agent.terminal.ops",
        "mcp_tool": "route.agent.mcp.ops",
        "ai_task": "route.agent.ai.ops",
        "deploy": "route.agent.infra.deploy",
        "browser_ops": "route.agent.browser.ops",
        "planning": "route.agent.planning.ops",
        "observability": "route.agent.observability.ops",
        "design_cad": "route.agent.design.cad",
    }
    return mapping.get(task_type, "route.agent.tool_use.safe")


def expected_handler_key(tool: dict[str, Any]) -> str:
    name = str(tool.get("tool_name") or "")
    handler_type = str(tool.get("handler_type") or "").lower()
    if name == "terminal_wrangler":
        return "handler.wrangler.exec"
    if name == "cf_worker_deploy":
        return "handler.cloudflare.worker.deploy"
    if name == "cloudflare_command_registry":
        return "handler.d1.commands.registry_search"
    if handler_type == "d1":
        return "handler.d1.query"
    if handler_type == "r2":
        return "handler.r2.object"
    if handler_type == "github":
        return "handler.github.api"
    if handler_type == "terminal":
        return "handler.terminal.exec"
    if handler_type == "mcp":
        return "handler.mcp.invoke"
    if handler_type == "http":
        return "handler.http.fetch"
    if handler_type == "proxy":
        return "handler.proxy.dispatch"
    if handler_type == "ai":
        return "handler.ai.invoke"
    return "handler.builtin.invoke"


def sql_quote(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def audit_tool(tool: dict[str, Any], columns: set[str]) -> dict[str, Any]:
    name = str(tool.get("tool_name") or "")
    issues: list[str] = []
    recommendations: list[str] = []

    for field in ["id", "tool_name", "display_name", "tool_category", "handler_type", "description"]:
        if not str(tool.get(field) or "").strip():
            issues.append(f"missing_{field}")

    if str(tool.get("handler_type") or "") not in {"builtin", "mcp", "r2", "github", "terminal", "http", "proxy", "ai", "d1"}:
        issues.append("invalid_handler_type")

    if str(tool.get("risk_level") or "") not in {"low", "medium", "high", "critical"}:
        issues.append("invalid_risk_level")

    for field, fallback in [
        ("input_schema", {}),
        ("output_schema", {}),
        ("handler_config", {}),
        ("intent_tags", []),
        ("modes_json", []),
    ]:
        _, ok = jsonish(tool.get(field), fallback)
        if not ok:
            issues.append(f"invalid_or_missing_json_{field}")

    expected = {
        "tool_key": expected_tool_key(tool),
        "capability_key": expected_capability_key(tool),
        "handler_key": expected_handler_key(tool),
        "domain": expected_domain(tool),
        "task_type": expected_task_type(tool),
        "capability_tier": expected_tier(tool),
        "route_key": expected_route_key(tool),
    }

    for field, expected_value in expected.items():
        if field in columns:
            actual = tool.get(field)
            if actual is None or str(actual).strip() == "":
                issues.append(f"missing_{field}")
                recommendations.append(f"backfill_{field}={expected_value}")
            elif str(actual).strip() != expected_value:
                recommendations.append(f"review_{field}: actual={actual}; expected={expected_value}")

    mutating = name in DANGEROUS_NAMES or any(x in name.lower() for x in ["delete", "write", "deploy", "commit"])
    if mutating and int(tool.get("requires_approval") or 0) != 1:
        issues.append("mutating_tool_missing_requires_approval")
    if mutating and int(tool.get("requires_confirmation") or 0) != 1:
        recommendations.append("mutating_tool_should_require_confirmation")
    if mutating and str(tool.get("risk_level") or "") not in {"high", "critical"}:
        recommendations.append("mutating_tool_should_be_high_or_critical_risk")

    score = max(0, 100 - len(issues) * 8 - len(recommendations) * 3)

    return {
        "id": tool.get("id"),
        "tool_name": name,
        "display_name": tool.get("display_name"),
        "tool_category": tool.get("tool_category"),
        "handler_type": tool.get("handler_type"),
        "risk_level": tool.get("risk_level"),
        "requires_approval": tool.get("requires_approval"),
        "requires_confirmation": tool.get("requires_confirmation"),
        "is_active": tool.get("is_active"),
        "is_degraded": tool.get("is_degraded"),
        "sort_priority": tool.get("sort_priority"),
        "expected": expected,
        "issues": issues,
        "recommendations": recommendations,
        "score": score,
    }


def build_backfill_sql(audited: list[dict[str, Any]], columns: set[str]) -> str:
    desired_cols = ["tool_key", "capability_key", "handler_key", "domain", "task_type", "capability_tier", "route_key"]
    lines: list[str] = []
    lines.append("-- Suggested agentsam_tools routing identity backfill.")
    lines.append("-- Review before running. Generated by audit_agentsam_tools_with_ollama.py.")
    lines.append("BEGIN TRANSACTION;")
    for item in audited:
        sets = []
        for col in desired_cols:
            if col in columns:
                sets.append(f"{col} = {sql_quote(item['expected'][col])}")
        if "internal_seo" in columns:
            seo = " ".join([
                str(item.get("tool_name") or ""),
                str(item.get("display_name") or ""),
                str(item.get("tool_category") or ""),
                item["expected"]["tool_key"],
                item["expected"]["capability_key"],
                item["expected"]["domain"],
                item["expected"]["task_type"],
            ]).strip()
            sets.append(f"internal_seo = {sql_quote(seo)}")
        if "updated_at" in columns:
            sets.append("updated_at = unixepoch()")
        if sets:
            lines.append("")
            lines.append(f"-- {item['tool_name']}")
            lines.append("UPDATE agentsam_tools")
            lines.append("SET " + ",\n    ".join(sets))
            lines.append(f"WHERE id = {sql_quote(str(item['id']))};")
    lines.append("")
    lines.append("-- Approval/risk hardening for clearly mutating tools.")
    lines.append("UPDATE agentsam_tools")
    lines.append("SET requires_approval = 1, requires_confirmation = 1,")
    lines.append("    risk_level = CASE WHEN risk_level = 'critical' THEN 'critical' ELSE 'high' END")
    lines.append("WHERE tool_name IN (" + ", ".join(sql_quote(x) for x in sorted(DANGEROUS_NAMES)) + ");")
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def fallback_todo(audit: dict[str, Any]) -> str:
    summary = audit["summary"]
    return f"""# Agent Sam Tools Bulletproofing To-Do

Generated without Ollama or after Ollama fallback.

## P0 — must fix before agent auto-use

- Backfill stable routing identity for all 43 tools.
  - Why it matters: your current verification shows `tool_key`, `capability_key`, `handler_key`, and `route_key` are null, so agents cannot deterministically resolve tools.
  - Table/fields: `agentsam_tools.tool_key`, `capability_key`, `handler_key`, `domain`, `task_type`, `capability_tier`, `route_key`, `internal_seo`.
  - Smoke test:
    ```sql
    SELECT COUNT(*) AS missing_identity
    FROM agentsam_tools
    WHERE tool_key IS NULL OR capability_key IS NULL OR handler_key IS NULL OR route_key IS NULL;
    ```

- Enforce approval gates for mutating tools.
  - Why it matters: write/delete/deploy/terminal tools can alter production state.
  - Table/fields: `agentsam_tools.risk_level`, `requires_approval`, `requires_confirmation`.
  - Smoke test:
    ```sql
    SELECT tool_name, risk_level, requires_approval, requires_confirmation
    FROM agentsam_tools
    WHERE tool_name IN ('r2_write','r2_delete','github_commit','github_pr','terminal_run','terminal_wrangler','cf_worker_deploy','cf_kv_write');
    ```

- Add missing output schemas.
  - Why it matters: only {summary.get("tools_with_output_schema")} of {summary.get("actual_tool_count")} tools have output schemas, so UI rendering and execution validation stay fragile.
  - Table/fields: `agentsam_tools.output_schema`.
  - Smoke test:
    ```sql
    SELECT tool_name
    FROM agentsam_tools
    WHERE output_schema IS NULL OR trim(output_schema) = '' OR output_schema = '{{}}';
    ```

## P1 — required for reliable routing

- Generate `agentsam_capability_index` rows from `agentsam_tools`.
  - Why it matters: the model should see 3-7 selected capabilities, not scan all tools.
  - Tables: `agentsam_tools`, `agentsam_capability_index`.
  - Smoke test:
    ```sql
    SELECT source_kind, COUNT(*)
    FROM agentsam_capability_index
    GROUP BY source_kind;
    ```

- Add or verify indexes on routing columns.
  - Why it matters: routing must be quick and deterministic.
  - Table/fields: `agentsam_tools(tool_key)`, `agentsam_tools(capability_key)`, `agentsam_tools(route_key, task_type)`.
  - Smoke test:
    ```sql
    SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'agentsam_tools';
    ```

## P2 — required for good UI/UX and analytics

- Feed usage metrics back into `agentsam_tools`.
  - Why it matters: the router should down-rank degraded/failing tools automatically.
  - Fields: `use_count`, `failure_rate`, `avg_latency_ms`, `last_used_at`, `last_health_check`, `is_degraded`.

- Link tool execution logs to canonical identity.
  - Why it matters: analytics need to join execution records to `tool_key` / `capability_key`.
  - Tables: `agentsam_mcp_tool_execution`, `agentsam_tool_call_log`, `agentsam_execution_steps`.

## P3 — polish / future hardening

- Add per-tool docs/examples into `handler_config` or `metadata_json`.
- Add UI badges for capability tier, risk, health, approval, and last run.
- Add nightly audit job to regenerate this report.

## Audit Summary

```json
{json.dumps(summary, indent=2)}
```
"""


def ollama_todo(prompt: str, fallback: str) -> str:
    if not RUN_OLLAMA:
        return fallback
    if shutil.which("ollama") is None:
        return fallback + "\n\n_Ollama was not found on PATH, so fallback to-do was used._\n"
    proc = run_cmd(["ollama", "run", OLLAMA_MODEL], stdin=prompt, check=False)
    if proc.returncode != 0 or not proc.stdout.strip():
        return fallback + f"\n\n_Ollama failed with model `{OLLAMA_MODEL}`, so fallback to-do was used._\n"
    return proc.stdout.strip() + "\n"


def main() -> int:
    print("Agent Sam tools audit starting...")
    print(f"DB_NAME={DB_NAME}")
    print(f"WRANGLER_CONFIG={WRANGLER_CONFIG}")
    print(f"EXPECTED_TOOL_COUNT={EXPECTED_TOOL_COUNT}")
    print(f"OLLAMA_MODEL={OLLAMA_MODEL}")
    print(f"RUN_OLLAMA={RUN_OLLAMA}")

    columns_rows = d1("PRAGMA table_info(agentsam_tools);")
    columns = {str(row.get("name")) for row in columns_rows}

    tools = d1("SELECT * FROM agentsam_tools ORDER BY sort_priority ASC, tool_name ASC;")
    RAW_TOOLS_JSON.write_text(json.dumps(tools, indent=2), encoding="utf-8")

    audited = [audit_tool(tool, columns) for tool in tools]

    summary = {
        "db_name": DB_NAME,
        "wrangler_config": WRANGLER_CONFIG,
        "actual_tool_count": len(tools),
        "expected_tool_count": EXPECTED_TOOL_COUNT,
        "count_matches_expected": len(tools) == EXPECTED_TOOL_COUNT,
        "active_tools": sum(1 for t in tools if int(t.get("is_active") or 0) == 1),
        "degraded_tools": sum(1 for t in tools if int(t.get("is_degraded") or 0) == 1),
        "approval_required_tools": sum(1 for t in tools if int(t.get("requires_approval") or 0) == 1),
        "confirmation_required_tools": sum(1 for t in tools if int(t.get("requires_confirmation") or 0) == 1),
        "tools_with_output_schema": sum(1 for t in tools if str(t.get("output_schema") or "").strip() not in {"", "{}"}),
        "issue_count": sum(len(x["issues"]) for x in audited),
        "recommendation_count": sum(len(x["recommendations"]) for x in audited),
        "avg_score": round(sum(x["score"] for x in audited) / max(len(audited), 1), 2),
        "columns_present": sorted(columns),
        "generated_at": STAMP,
    }

    audit = {
        "summary": summary,
        "tools": audited,
    }

    AUDIT_JSON.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    BACKFILL_SQL.write_text(build_backfill_sql(audited, columns), encoding="utf-8")

    prompt = "# agentsam_tools audit\n\n"
    prompt += "Write a prioritized markdown to-do list to bulletproof this AI agent tool catalog.\n\n"
    prompt += "Use headings P0, P1, P2, P3. Include exact fields and validation SQL.\n\n"
    prompt += "Summary:\n"
    prompt += json.dumps(summary, indent=2)
    prompt += "\n\nTool audit:\n"
    prompt += json.dumps(audited, indent=2)
    PROMPT_MD.write_text(prompt, encoding="utf-8")

    TODO_MD.write_text(ollama_todo(prompt, fallback_todo(audit)), encoding="utf-8")

    print("\nAudit complete.")
    print(json.dumps(summary, indent=2))
    print("\nFiles written:")
    print(f"- {RAW_TOOLS_JSON}")
    print(f"- {AUDIT_JSON}")
    print(f"- {BACKFILL_SQL}")
    print(f"- {PROMPT_MD}")
    print(f"- {TODO_MD}")

    if len(tools) != EXPECTED_TOOL_COUNT:
        print(f"\nWARNING: expected {EXPECTED_TOOL_COUNT} tools but found {len(tools)}", file=sys.stderr)

    # Always exit 0 so the audit artifacts are usable even when issues are found.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
