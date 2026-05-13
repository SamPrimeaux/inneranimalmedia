#!/usr/bin/env python3
"""
Inner Animal Media CMS + AgentSam D1 Structure Auditor

Goal:
  End-to-end audit your live Cloudflare D1 tables for:
    - cms_* tables
    - agentsam_* tables
    - key views that touch CMS / AgentSam / MCP
  Then produce:
    - JSON report
    - Markdown report
    - compact schema map
    - relationship/FK map
    - AI-ready prompt pack
    - optional OpenAI or local Ollama synthesis

Default behavior is read-only:
  - Uses wrangler d1 execute --remote SELECT / PRAGMA only.
  - No schema mutation.
  - No inserts/updates/deletes.
  - Does not print secrets.
  - AI synthesis is optional and receives a compact report, not raw secrets.

Recommended:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/audit/iam_cms_agentsam_structure_audit.py --ai auto

No AI:
  python3 scripts/audit/iam_cms_agentsam_structure_audit.py

OpenAI only:
  OPENAI_API_KEY=... python3 scripts/audit/iam_cms_agentsam_structure_audit.py --ai openai --openai-model gpt-5.4-mini

Ollama only:
  python3 scripts/audit/iam_cms_agentsam_structure_audit.py --ai ollama --ollama-model llama3.1:8b
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
DEFAULT_TENANT = "tenant_sam_primeaux"
DEFAULT_WORKSPACE = "ws_inneranimalmedia"


@dataclasses.dataclass
class CmdResult:
    ok: bool
    stdout: str
    stderr: str
    code: int


class AuditRunner:
    def __init__(self, repo: Path, db: str, config: str, out_dir: Path, verbose: bool = True) -> None:
        self.repo = repo
        self.db = db
        self.config = config
        self.out_dir = out_dir
        self.verbose = verbose
        self.events: list[dict[str, Any]] = []
        self.failures: list[str] = []

    def log(self, msg: str = "") -> None:
        print(msg, flush=True)

    def event(self, status: str, name: str, detail: str = "", data: Any = None) -> None:
        row = {
            "ts": dt.datetime.utcnow().isoformat() + "Z",
            "status": status,
            "name": name,
            "detail": detail,
        }
        if data is not None:
            row["data"] = data
        self.events.append(row)
        prefix = {"ok": "[OK]", "warn": "[WARN]", "fail": "[FAIL]", "info": "[INFO]"}.get(status, f"[{status.upper()}]")
        self.log(f"{prefix} {name}: {detail}")
        if status == "fail":
            self.failures.append(f"{name}: {detail}")

    def run(self, cmd: list[str], timeout: int = 120, cwd: Path | None = None) -> CmdResult:
        cwd = cwd or self.repo
        if self.verbose:
            self.log("$ " + " ".join(cmd))
        try:
            cp = subprocess.run(
                cmd,
                cwd=str(cwd),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
            )
            return CmdResult(cp.returncode == 0, cp.stdout, cp.stderr, cp.returncode)
        except subprocess.TimeoutExpired as e:
            return CmdResult(False, e.stdout or "", e.stderr or f"timeout after {timeout}s", 124)

    def wrangler_json(self, sql: str, timeout: int = 180) -> list[dict[str, Any]]:
        cmd = [
            "npx", "wrangler", "d1", "execute", self.db,
            "--remote", "-c", self.config, "--json",
            "--command", sql,
        ]
        res = self.run(cmd, timeout=timeout)
        if not res.ok:
            self.event("fail", "wrangler.d1", (res.stderr or res.stdout)[-1200:])
            return []
        try:
            parsed = json.loads(res.stdout)
            if not isinstance(parsed, list):
                self.event("fail", "wrangler.parse", "expected list JSON")
                return []
            return parsed
        except json.JSONDecodeError as e:
            self.event("fail", "wrangler.parse", f"{e}: {(res.stdout or '')[:500]}")
            return []

    def wrangler_rows(self, sql: str, timeout: int = 180) -> list[dict[str, Any]]:
        payload = self.wrangler_json(sql, timeout=timeout)
        if not payload:
            return []
        first = payload[0]
        if first.get("success") is False:
            self.event("fail", "wrangler.query", json.dumps(first.get("error") or first)[:1200])
            return []
        rows = first.get("results") or []
        if not isinstance(rows, list):
            return []
        return rows


def utc_stamp() -> str:
    return dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def safe_filename(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", s).strip("_") or "file"


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def parse_jsonish(value: Any, fallback: Any = None) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return fallback
    s = value.strip()
    if not s:
        return fallback
    try:
        return json.loads(s)
    except Exception:
        return fallback


def q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def get_tables_and_views(r: AuditRunner) -> dict[str, Any]:
    rows = r.wrangler_rows("""
SELECT name, type, sql
FROM sqlite_master
WHERE (name LIKE 'cms_%' OR name LIKE 'agentsam_%' OR name IN (
  'v_agentsam_mcp_tools_branded',
  'v_agentsam_mcp_tools',
  'v_agentsam_route_tool_matrix',
  'v_agentsam_health_daily'
))
  AND type IN ('table','view')
ORDER BY type, name;
""")
    objects = {
        "tables": [x for x in rows if x.get("type") == "table"],
        "views": [x for x in rows if x.get("type") == "view"],
        "all": rows,
    }
    r.event("ok", "d1.objects.discovery", f"tables={len(objects['tables'])} views={len(objects['views'])}")
    return objects


def get_table_info(r: AuditRunner, name: str) -> list[dict[str, Any]]:
    return r.wrangler_rows(f"PRAGMA table_info({q(name)});")


def get_fk_info(r: AuditRunner, name: str) -> list[dict[str, Any]]:
    return r.wrangler_rows(f"PRAGMA foreign_key_list({q(name)});")


def get_index_info(r: AuditRunner, name: str) -> list[dict[str, Any]]:
    return r.wrangler_rows(f"""
SELECT name, sql
FROM sqlite_master
WHERE type = 'index'
  AND tbl_name = {json.dumps(name)}
ORDER BY name;
""")


def get_row_count(r: AuditRunner, name: str) -> int | None:
    rows = r.wrangler_rows(f"SELECT COUNT(*) AS n FROM {q(name)};", timeout=120)
    if rows and "n" in rows[0]:
        return rows[0]["n"]
    return None


def get_sample_rows(r: AuditRunner, name: str, columns: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    # Avoid dumping huge/raw fields unless useful.
    skip_patterns = re.compile(r"(secret|token_hash|raw|encrypted|password|key_value|cookie|authorization)", re.I)
    col_names = [c["name"] for c in columns if c.get("name") and not skip_patterns.search(str(c.get("name")))]
    if not col_names:
        return []
    selected = col_names[:18]
    sql = f"SELECT {', '.join(q(c) for c in selected)} FROM {q(name)} LIMIT {int(limit)};"
    return r.wrangler_rows(sql, timeout=120)


def classify_columns(columns: list[dict[str, Any]]) -> dict[str, list[str]]:
    names = [str(c.get("name", "")) for c in columns]
    groups = {
        "identity": [],
        "tenant_scope": [],
        "time": [],
        "status": [],
        "json": [],
        "routing": [],
        "cost_tokens": [],
        "risk_approval": [],
        "files_routes": [],
        "potential_secret": [],
    }
    for n in names:
        low = n.lower()
        if low in {"id", "uuid"} or low.endswith("_id") or low.endswith("_key") or low in {"slug", "name", "title"}:
            groups["identity"].append(n)
        if low in {"tenant_id", "workspace_id", "user_id", "agent_id", "session_id", "client_id"}:
            groups["tenant_scope"].append(n)
        if low.endswith("_at") or low in {"created_at", "updated_at", "started_at", "completed_at", "plan_date"}:
            groups["time"].append(n)
        if low in {"status", "state", "enabled", "is_active", "is_public", "is_degraded"}:
            groups["status"].append(n)
        if low.endswith("_json") or low in {"metadata", "tags", "notes"}:
            groups["json"].append(n)
        if "route" in low or "lane" in low or "capability" in low or "handler" in low or "mode" in low:
            groups["routing"].append(n)
        if "token" in low or "cost" in low or "budget" in low:
            groups["cost_tokens"].append(n)
        if "risk" in low or "approval" in low or "policy" in low:
            groups["risk_approval"].append(n)
        if "file" in low or "route" in low or "r2" in low or "url" in low or "domain" in low:
            groups["files_routes"].append(n)
        if any(x in low for x in ["secret", "token_hash", "encrypted", "password", "cookie", "authorization"]):
            groups["potential_secret"].append(n)
    return {k: v for k, v in groups.items() if v}


def audit_objects(r: AuditRunner, objects: dict[str, Any], sample_limit: int) -> dict[str, Any]:
    out: dict[str, Any] = {
        "tables": {},
        "views": {},
        "relationships": [],
        "indexes": {},
        "row_counts": {},
    }

    for obj in objects["all"]:
        name = obj["name"]
        typ = obj["type"]
        cols = get_table_info(r, name)
        fks = get_fk_info(r, name) if typ == "table" else []
        idx = get_index_info(r, name) if typ == "table" else []
        row_count = get_row_count(r, name) if typ == "table" else None
        sample = get_sample_rows(r, name, cols, sample_limit) if typ == "table" and sample_limit > 0 else []

        entry = {
            "name": name,
            "type": typ,
            "sql": obj.get("sql"),
            "columns": cols,
            "column_count": len(cols),
            "column_groups": classify_columns(cols),
            "foreign_keys": fks,
            "indexes": idx,
            "row_count": row_count,
            "sample_rows_sanitized": sample,
        }

        if typ == "table":
            out["tables"][name] = entry
            out["indexes"][name] = idx
            out["row_counts"][name] = row_count
        else:
            out["views"][name] = entry

        for fk in fks:
            out["relationships"].append({
                "from_table": name,
                "from_column": fk.get("from"),
                "to_table": fk.get("table"),
                "to_column": fk.get("to"),
                "on_delete": fk.get("on_delete"),
                "on_update": fk.get("on_update"),
            })

        r.event("ok", f"d1.object.{typ}.{name}", f"cols={len(cols)} rows={row_count if row_count is not None else 'view'} fks={len(fks)} indexes={len(idx)}")

    return out


def analyze_domains(audit: dict[str, Any]) -> dict[str, Any]:
    tables = audit["tables"]
    cms = {k: v for k, v in tables.items() if k.startswith("cms_")}
    agentsam = {k: v for k, v in tables.items() if k.startswith("agentsam_")}

    def top_by_rows(group: dict[str, Any], n: int = 20) -> list[dict[str, Any]]:
        rows = []
        for name, entry in group.items():
            rows.append({"table": name, "rows": entry.get("row_count"), "columns": entry.get("column_count")})
        return sorted(rows, key=lambda x: (-1 if x["rows"] is None else -int(x["rows"]), x["table"]))[:n]

    def missing_scope(group: dict[str, Any]) -> list[str]:
        bad = []
        for name, entry in group.items():
            cols = {c["name"] for c in entry.get("columns", [])}
            if "tenant_id" not in cols and "workspace_id" not in cols:
                bad.append(name)
        return bad

    def json_heavy(group: dict[str, Any]) -> list[dict[str, Any]]:
        rows = []
        for name, entry in group.items():
            json_cols = entry.get("column_groups", {}).get("json", [])
            if json_cols:
                rows.append({"table": name, "json_columns": json_cols})
        return rows

    route_tables = []
    for name, entry in tables.items():
        cols = {c["name"] for c in entry.get("columns", [])}
        if any("route" in c or "path" in c or "url" in c for c in cols):
            route_tables.append(name)

    risk_tables = []
    for name, entry in tables.items():
        groups = entry.get("column_groups", {})
        if groups.get("risk_approval") or groups.get("potential_secret"):
            risk_tables.append({
                "table": name,
                "risk_approval": groups.get("risk_approval", []),
                "potential_secret": groups.get("potential_secret", []),
            })

    return {
        "cms": {
            "table_count": len(cms),
            "top_by_rows": top_by_rows(cms),
            "missing_tenant_or_workspace_scope": missing_scope(cms),
            "json_heavy_tables": json_heavy(cms),
        },
        "agentsam": {
            "table_count": len(agentsam),
            "top_by_rows": top_by_rows(agentsam),
            "missing_tenant_or_workspace_scope": missing_scope(agentsam),
            "json_heavy_tables": json_heavy(agentsam),
        },
        "cross_domain": {
            "relationship_count": len(audit.get("relationships", [])),
            "route_or_url_tables": sorted(route_tables),
            "risk_or_secret_touching_tables": risk_tables,
        },
    }


def d1_deep_checks(r: AuditRunner, audit: dict[str, Any]) -> dict[str, Any]:
    checks: dict[str, Any] = {}

    # CMS table health.
    if "cms_pages" in audit["tables"]:
        checks["cms_pages_status"] = r.wrangler_rows("""
SELECT COALESCE(status,'null') AS status, COUNT(*) AS n
FROM cms_pages
GROUP BY COALESCE(status,'null')
ORDER BY n DESC;
""")
        checks["cms_pages_route_fields"] = r.wrangler_rows("""
SELECT COUNT(*) AS pages,
       SUM(CASE WHEN slug IS NULL OR trim(slug)='' THEN 1 ELSE 0 END) AS missing_slug,
       SUM(CASE WHEN title IS NULL OR trim(title)='' THEN 1 ELSE 0 END) AS missing_title
FROM cms_pages;
""")

    if "cms_themes" in audit["tables"]:
        checks["cms_themes_status"] = r.wrangler_rows("""
SELECT COALESCE(status,'null') AS status, COUNT(*) AS n
FROM cms_themes
GROUP BY COALESCE(status,'null')
ORDER BY n DESC;
""")

    # AgentSam route/tool health.
    if "agentsam_route_requirements" in audit["tables"]:
        checks["agentsam_route_requirements_unconfigured"] = r.wrangler_rows("""
SELECT route_key, task_type, mode, max_tools, allowed_lanes_json
FROM agentsam_route_requirements
WHERE is_active = 1
  AND (
    task_type IS NULL
    OR mode IS NULL
    OR max_tools IS NULL
    OR allowed_lanes_json IS NULL
    OR trim(allowed_lanes_json) IN ('', '[]')
  )
ORDER BY route_key
LIMIT 100;
""")
    if "agentsam_prompt_routes" in audit["tables"] and "agentsam_route_requirements" in audit["tables"]:
        checks["agentsam_prompt_routes_missing_requirements"] = r.wrangler_rows("""
SELECT pr.route_key, pr.display_name, pr.max_tools, pr.priority
FROM agentsam_prompt_routes pr
LEFT JOIN agentsam_route_requirements rr ON rr.route_key = pr.route_key
WHERE pr.is_active = 1 AND rr.route_key IS NULL
ORDER BY pr.priority ASC, pr.route_key ASC
LIMIT 200;
""")
        checks["agentsam_prompt_routes_duplicate_priorities"] = r.wrangler_rows("""
SELECT priority, COUNT(*) AS n, group_concat(route_key) AS route_keys
FROM agentsam_prompt_routes
WHERE is_active = 1
GROUP BY priority
HAVING COUNT(*) > 1
ORDER BY priority ASC;
""")

    if "v_agentsam_mcp_tools_branded" in audit["views"]:
        view_cols = {c.get("name") for c in audit["views"]["v_agentsam_mcp_tools_branded"].get("columns", [])}
        if "capability_key" in view_cols:
            checks["mcp_capability_key_coverage"] = r.wrangler_rows("""
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN capability_key IS NULL OR trim(capability_key) = '' THEN 1 ELSE 0 END) AS missing_capability_key,
  COUNT(DISTINCT capability_key) AS distinct_capability_keys
FROM v_agentsam_mcp_tools_branded;
""")
        checks["mcp_brand_lane_summary"] = r.wrangler_rows("""
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

    if "agentsam_tool_call_log" in audit["tables"]:
        checks["tool_call_log_recent_identity"] = r.wrangler_rows("""
SELECT
  COUNT(*) AS recent_rows,
  SUM(CASE WHEN tool_name IS NULL OR trim(tool_name)='' THEN 1 ELSE 0 END) AS missing_tool_name,
  SUM(CASE WHEN route_key IS NULL OR trim(route_key)='' THEN 1 ELSE 0 END) AS missing_route_key,
  SUM(CASE WHEN capability_key IS NULL OR trim(capability_key)='' THEN 1 ELSE 0 END) AS missing_capability_key
FROM (
  SELECT *
  FROM agentsam_tool_call_log
  ORDER BY created_at DESC
  LIMIT 100
);
""")

    return checks


def build_compact_schema(audit: dict[str, Any], analysis: dict[str, Any], deep_checks: dict[str, Any]) -> dict[str, Any]:
    compact_tables = {}
    for name, entry in audit["tables"].items():
        compact_tables[name] = {
            "rows": entry.get("row_count"),
            "columns": [c.get("name") for c in entry.get("columns", [])],
            "groups": entry.get("column_groups", {}),
            "foreign_keys": entry.get("foreign_keys", []),
            "indexes": [x.get("name") for x in entry.get("indexes", [])],
        }

    compact_views = {}
    for name, entry in audit["views"].items():
        compact_views[name] = {
            "columns": [c.get("name") for c in entry.get("columns", [])],
            "groups": entry.get("column_groups", {}),
        }

    return {
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
        "summary": {
            "table_count": len(audit["tables"]),
            "view_count": len(audit["views"]),
            "relationship_count": len(audit["relationships"]),
            "cms_table_count": analysis["cms"]["table_count"],
            "agentsam_table_count": analysis["agentsam"]["table_count"],
        },
        "tables": compact_tables,
        "views": compact_views,
        "relationships": audit["relationships"],
        "analysis": analysis,
        "deep_checks": deep_checks,
    }


def markdown_report(compact: dict[str, Any], ai_summary: str | None = None) -> str:
    s = compact["summary"]
    lines = [
        "# Inner Animal Media CMS + AgentSam Structure Audit",
        "",
        f"- Generated: `{compact['generated_at']}`",
        f"- Tables: `{s['table_count']}`",
        f"- Views: `{s['view_count']}`",
        f"- Relationships: `{s['relationship_count']}`",
        f"- CMS tables: `{s['cms_table_count']}`",
        f"- AgentSam tables: `{s['agentsam_table_count']}`",
        "",
    ]

    if ai_summary:
        lines += ["## AI synthesis", "", ai_summary.strip(), ""]

    lines += [
        "## CMS overview",
        "",
        "### Largest CMS tables",
        "",
        "| Table | Rows | Columns |",
        "|---|---:|---:|",
    ]
    for row in compact["analysis"]["cms"]["top_by_rows"]:
        lines.append(f"| `{row['table']}` | {row['rows']} | {row['columns']} |")

    lines += [
        "",
        "### CMS tables missing tenant/workspace scope",
        "",
    ]
    missing = compact["analysis"]["cms"]["missing_tenant_or_workspace_scope"]
    lines.append(", ".join(f"`{x}`" for x in missing) if missing else "None detected.")

    lines += [
        "",
        "## AgentSam overview",
        "",
        "### Largest AgentSam tables",
        "",
        "| Table | Rows | Columns |",
        "|---|---:|---:|",
    ]
    for row in compact["analysis"]["agentsam"]["top_by_rows"]:
        lines.append(f"| `{row['table']}` | {row['rows']} | {row['columns']} |")

    lines += [
        "",
        "### AgentSam tables missing tenant/workspace scope",
        "",
    ]
    missing = compact["analysis"]["agentsam"]["missing_tenant_or_workspace_scope"]
    lines.append(", ".join(f"`{x}`" for x in missing) if missing else "None detected.")

    lines += [
        "",
        "## Deep checks",
        "",
    ]
    for name, rows in compact.get("deep_checks", {}).items():
        lines += [f"### `{name}`", "", "```json", json.dumps(rows, indent=2, default=str)[:6000], "```", ""]

    lines += [
        "## Relationship map",
        "",
        "| From | Column | To | On delete |",
        "|---|---|---|---|",
    ]
    for rel in compact["relationships"][:300]:
        lines.append(
            f"| `{rel.get('from_table')}` | `{rel.get('from_column')}` | `{rel.get('to_table')}.{rel.get('to_column')}` | `{rel.get('on_delete')}` |"
        )

    lines += [
        "",
        "## Full table map",
        "",
    ]
    for name, entry in sorted(compact["tables"].items()):
        cols = ", ".join(f"`{c}`" for c in entry["columns"])
        lines += [
            f"### `{name}`",
            "",
            f"- Rows: `{entry['rows']}`",
            f"- Columns: {cols}",
            "",
        ]

    lines += [
        "",
        "## Views",
        "",
    ]
    for name, entry in sorted(compact["views"].items()):
        cols = ", ".join(f"`{c}`" for c in entry["columns"])
        lines += [f"### `{name}`", "", f"- Columns: {cols}", ""]

    return "\n".join(lines) + "\n"


def build_ai_prompt(compact: dict[str, Any]) -> str:
    trimmed = json.dumps(compact, indent=2, default=str)
    if len(trimmed) > 120_000:
        # Keep high-signal sections for model context.
        compact2 = {
            "generated_at": compact["generated_at"],
            "summary": compact["summary"],
            "analysis": compact["analysis"],
            "deep_checks": compact["deep_checks"],
            "relationships": compact["relationships"][:200],
            "tables": {},
            "views": compact["views"],
        }
        for name, entry in compact["tables"].items():
            compact2["tables"][name] = {
                "rows": entry["rows"],
                "columns": entry["columns"],
                "groups": entry["groups"],
                "foreign_keys": entry["foreign_keys"],
            }
        trimmed = json.dumps(compact2, indent=2, default=str)

    return f"""
You are auditing a Cloudflare D1 database backing Inner Animal Media.

The user wants to understand and prepare the internal structure of:
- cms_* tables for a lightweight customizable CMS / Design Studio runtime
- agentsam_* tables for Agent Sam routing, workflows, tools, plans, execution, telemetry
- relationships between CMS runtime, Agent Sam execution, MCP tools, and future UI/UX panels

Please produce:
1. A plain-English architecture overview.
2. The core CMS table groups and what each group probably owns.
3. The core AgentSam table groups and what each group probably owns.
4. Data gaps or ambiguity that could cause agents to guess incorrectly.
5. Recommended next D1 views or dashboard panels.
6. A low-risk migration/cleanup plan for tomorrow’s sprint.
7. Suggested knowledge_edges triples for Supabase graph memory without duplicating D1 execution rows.
8. Highest-risk tables/columns to protect with approvals.

Use the JSON below as source of truth. Do not invent tables that are not listed.

AUDIT_JSON:
{trimmed}
""".strip()


def call_openai(prompt: str, model: str, timeout: int = 180) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    payload = {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": "You are a senior database/platform architect. Be concrete, concise, and implementation-focused."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))

    # Responses API common shape.
    if isinstance(data, dict):
        text = data.get("output_text")
        if text:
            return text
        parts = []
        for item in data.get("output", []) or []:
            for content in item.get("content", []) or []:
                if content.get("type") in {"output_text", "text"} and content.get("text"):
                    parts.append(content["text"])
        if parts:
            return "\n".join(parts)
    return json.dumps(data, indent=2)[:8000]


def call_ollama(prompt: str, model: str, base_url: str, timeout: int = 240) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_ctx": 32768,
        },
    }
    req = urllib.request.Request(
        base_url.rstrip("/") + "/api/generate",
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
    return data.get("response") or json.dumps(data, indent=2)[:8000]


def maybe_ai_synthesis(r: AuditRunner, compact: dict[str, Any], ai: str, openai_model: str, ollama_model: str, ollama_url: str) -> tuple[str | None, dict[str, str]]:
    if ai == "none":
        r.event("info", "ai.synthesis", "skipped")
        return None, {}

    prompt = build_ai_prompt(compact)
    meta: dict[str, str] = {}

    def try_openai() -> str | None:
        if not os.environ.get("OPENAI_API_KEY"):
            return None
        try:
            r.event("info", "ai.openai", f"calling model={openai_model}")
            txt = call_openai(prompt, openai_model)
            meta["provider"] = "openai"
            meta["model"] = openai_model
            r.event("ok", "ai.openai", f"chars={len(txt)}")
            return txt
        except Exception as e:
            r.event("warn", "ai.openai", str(e)[:1000])
            return None

    def try_ollama() -> str | None:
        try:
            r.event("info", "ai.ollama", f"calling model={ollama_model}")
            txt = call_ollama(prompt, ollama_model, ollama_url)
            meta["provider"] = "ollama"
            meta["model"] = ollama_model
            r.event("ok", "ai.ollama", f"chars={len(txt)}")
            return txt
        except Exception as e:
            r.event("warn", "ai.ollama", str(e)[:1000])
            return None

    if ai == "openai":
        return try_openai(), meta
    if ai == "ollama":
        return try_ollama(), meta
    if ai == "auto":
        return try_openai() or try_ollama(), meta

    r.event("warn", "ai.synthesis", f"unknown ai mode={ai}")
    return None, meta


def repo_static_scan(r: AuditRunner) -> dict[str, Any]:
    scan: dict[str, Any] = {}
    if not shutil.which("rg"):
        r.event("warn", "static.rg", "ripgrep not installed")
        return scan

    patterns = {
        "cms_table_mentions": r"cms_[a-zA-Z0-9_]+",
        "agentsam_table_mentions": r"agentsam_[a-zA-Z0-9_]+",
        "routes_touching_cms": r"/api/(cms|themes|pages|sections)|cms_",
        "routes_touching_agentsam": r"/api/agent|agentsam_|mcp",
    }
    for name, pattern in patterns.items():
        res = r.run([
            "rg", "-n", "--hidden",
            "--glob", "!node_modules",
            "--glob", "!dist",
            "--glob", "!dashboard/dist",
            "--glob", "!artifacts",
            pattern,
            "src", "dashboard", "scripts", "migrations"
        ], timeout=120)
        lines = res.stdout.splitlines()[:500]
        scan[name] = {
            "returncode": res.code,
            "matches_count_capped": len(lines),
            "sample": lines[:80],
        }
        r.event("ok", f"static.{name}", f"sample_matches={len(lines)}")
    return scan


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit cms_* and agentsam_* D1 structures and optionally synthesize with OpenAI/Ollama.")
    parser.add_argument("--repo", default=os.getcwd())
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--out", default="")
    parser.add_argument("--sample-limit", type=int, default=2)
    parser.add_argument("--ai", choices=["none", "auto", "openai", "ollama"], default="none")
    parser.add_argument("--openai-model", default=os.environ.get("IAM_OPENAI_AUDIT_MODEL", "gpt-5.4-mini"))
    parser.add_argument("--ollama-model", default=os.environ.get("IAM_OLLAMA_AUDIT_MODEL", "llama3.1:8b"))
    parser.add_argument("--ollama-url", default=os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"))
    parser.add_argument("--skip-static-scan", action="store_true")
    args = parser.parse_args()

    repo = Path(args.repo).expanduser().resolve()
    out_dir = Path(args.out).expanduser().resolve() if args.out else repo / "artifacts" / f"cms_agentsam_structure_audit_{utc_stamp()}"
    out_dir.mkdir(parents=True, exist_ok=True)

    r = AuditRunner(repo, args.db, args.config, out_dir)

    print("=" * 100)
    print("Inner Animal Media CMS + AgentSam D1 Structure Auditor")
    print("=" * 100)
    print(f"repo={repo}")
    print(f"db={args.db}")
    print(f"config={args.config}")
    print(f"out={out_dir}")
    print(f"read_only=true")
    print("=" * 100)

    if not repo.exists():
        print(f"[FAIL] repo does not exist: {repo}")
        return 2

    if not (repo / args.config).exists():
        r.event("warn", "repo.config", f"missing {args.config}; wrangler may still resolve defaults")
    else:
        r.event("ok", "repo.config", args.config)

    if not shutil.which("npx"):
        r.event("fail", "tool.npx", "npx not found")
        return 2
    r.event("ok", "tool.npx", shutil.which("npx") or "")

    static_scan = {} if args.skip_static_scan else repo_static_scan(r)

    objects = get_tables_and_views(r)
    audit = audit_objects(r, objects, sample_limit=max(0, args.sample_limit))
    analysis = analyze_domains(audit)
    deep_checks = d1_deep_checks(r, audit)
    compact = build_compact_schema(audit, analysis, deep_checks)
    compact["static_scan"] = static_scan

    write_json(out_dir / "raw_audit.json", audit)
    write_json(out_dir / "compact_schema_map.json", compact)
    write_json(out_dir / "static_scan.json", static_scan)

    prompt = build_ai_prompt(compact)
    write_text(out_dir / "ai_prompt_pack.md", prompt + "\n")

    ai_summary, ai_meta = maybe_ai_synthesis(r, compact, args.ai, args.openai_model, args.ollama_model, args.ollama_url)
    if ai_summary:
        write_text(out_dir / "ai_synthesis.md", ai_summary.strip() + "\n")
        compact["ai"] = ai_meta
    else:
        compact["ai"] = {"provider": "none"}

    md = markdown_report(compact, ai_summary=ai_summary)
    write_text(out_dir / "report.md", md)
    write_json(out_dir / "events.json", r.events)

    # CSV-ish quick maps for spreadsheets or quick review.
    table_lines = ["type,name,rows,column_count,columns"]
    for typ in ["tables", "views"]:
        for name, entry in compact[typ].items():
            table_lines.append(",".join([
                "table" if typ == "tables" else "view",
                json.dumps(name),
                json.dumps(entry.get("rows", "")),
                json.dumps(len(entry.get("columns", []))),
                json.dumps("|".join(entry.get("columns", []))),
            ]))
    write_text(out_dir / "table_inventory.csv", "\n".join(table_lines) + "\n")

    rel_lines = ["from_table,from_column,to_table,to_column,on_delete,on_update"]
    for rel in compact["relationships"]:
        rel_lines.append(",".join(json.dumps(rel.get(k, "")) for k in ["from_table", "from_column", "to_table", "to_column", "on_delete", "on_update"]))
    write_text(out_dir / "relationship_map.csv", "\n".join(rel_lines) + "\n")

    print("=" * 100)
    print("DONE")
    print("=" * 100)
    print(f"report={out_dir / 'report.md'}")
    print(f"compact={out_dir / 'compact_schema_map.json'}")
    print(f"raw={out_dir / 'raw_audit.json'}")
    print(f"ai_prompt={out_dir / 'ai_prompt_pack.md'}")
    print(f"events={out_dir / 'events.json'}")
    print(f"failures={len(r.failures)}")
    if r.failures:
        print("Failures:")
        for f in r.failures:
            print(f" - {f}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
