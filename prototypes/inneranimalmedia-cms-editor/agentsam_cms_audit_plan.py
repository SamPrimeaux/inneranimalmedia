#!/usr/bin/env python3
"""
Audit AgentSam + CMS artifacts/tables and generate a practical implementation plan.

This is intentionally READ-ONLY by default:
- Reads local audit artifacts under artifacts/
- Optionally pulls live D1 schema/samples through wrangler
- Writes a markdown plan + JSON report under artifacts/agentsam_cms_plan_<timestamp>/

Usage:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/audit/agentsam_cms_audit_plan.py

Optional live D1 pull:
  python3 agentsam_cms_audit_plan.py --repo-root /Users/samprimeaux/inneranimalmedia --pull-d1

Optional focus on the Claude prototype folder:
  python3 scripts/audit/agentsam_cms_audit_plan.py --prototype prototypes/inneranimalmedia-cms-editor
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any


RUN_DIR = Path.cwd()


def find_repo_root(start: Path) -> Path:
    """Find the inneranimalmedia repo root from the current isolated prototype folder."""
    cur = start.resolve()
    for candidate in [cur, *cur.parents]:
        if (candidate / "wrangler.production.toml").exists() and (candidate / "migrations").exists():
            return candidate
    # Common layout: repo/prototypes/inneranimalmedia-cms-editor
    maybe = cur.parents[1] if len(cur.parents) > 1 else cur
    return maybe


ROOT = find_repo_root(RUN_DIR)


CMS_TABLES_EXPECTED = [
    "cms_pages",
    "cms_page_sections",
    "cms_section_components",
    "cms_component_templates",
    "cms_liquid_sections",
    "cms_themes",
    "cms_page_drafts",
    "cms_page_overrides",
    "cms_override_versions",
    "cms_live_edit_sessions",
    "cms_live_rollbacks",
    "cms_assets",
    "cms_folders",
    "cms_navigation_menus",
    "cms_tenants",
]

AGENTSAM_TABLES_EXPECTED = [
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_todo",
    "agentsam_prompt_routes",
    "agentsam_route_requirements",
    "agentsam_tools",
    "agentsam_tool_call_log",
    "agentsam_mcp_tool_execution",
    "agentsam_execution_steps",
    "agentsam_workflows",
    "agentsam_workflow_runs",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_model_catalog",
    "agentsam_usage_events",
    "agentsam_artifacts",
]

DESIGN_STUDIO_REQUIRED_TERMS = [
    "cms_pages",
    "cms_page_sections",
    "cms_section_components",
    "cms_component_templates",
    "cms_liquid_sections",
    "cms_themes",
    "cms_page_drafts",
    "cms_override_versions",
    "cms_live_edit_sessions",
    "cms_live_rollbacks",
    "sort_order",
    "draggable",
    "drag",
    "drop",
    "publish",
    "rollback",
    "monaco",
    "preview",
    "browser",
    "analytics",
]


def now() -> str:
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())


def read_text(path: Path, max_chars: int = 2_000_000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return text[:max_chars]
    except Exception as exc:
        return f"__READ_ERROR__ {exc}"


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run(cmd: list[str], check: bool = False) -> dict[str, Any]:
    print("$", " ".join(cmd))
    p = subprocess.run(cmd, text=True, capture_output=True)
    if p.stdout.strip():
        print(p.stdout[:4000])
    if p.stderr.strip():
        print(p.stderr[:4000])
    if check and p.returncode != 0:
        raise SystemExit(p.returncode)
    return {
        "cmd": cmd,
        "returncode": p.returncode,
        "stdout": p.stdout,
        "stderr": p.stderr,
    }


def wrangler_json(sql: str, db: str, cfg: str) -> dict[str, Any]:
    result = run([
        "npx", "wrangler", "d1", "execute", db,
        "--remote",
        "-c", cfg,
        "--json",
        "--command", sql,
    ])
    try:
        parsed = json.loads(result["stdout"])
    except Exception as exc:
        return {"ok": False, "error": str(exc), "raw": result}
    return {"ok": result["returncode"] == 0, "data": parsed, "raw": result}


def newest_dirs(pattern: str, limit: int = 8) -> list[Path]:
    items = [p for p in ROOT.glob(pattern) if p.exists()]
    items.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return items[:limit]


def summarize_artifact_dir(path: Path) -> dict[str, Any]:
    files = [p for p in path.rglob("*") if p.is_file()]
    names = [str(p.relative_to(path)) for p in files[:80]]
    report_md = path / "report.md"
    inspection_json = path / "inspection.json"
    report_json = path / "report.json"

    summary: dict[str, Any] = {
        "path": str(path),
        "file_count": len(files),
        "files": names,
        "has_report_md": report_md.exists(),
        "has_inspection_json": inspection_json.exists(),
        "has_report_json": report_json.exists(),
        "mtime": path.stat().st_mtime,
    }

    if report_md.exists():
        text = read_text(report_md, 80_000)
        summary["report_head"] = "\n".join(text.splitlines()[:80])
        summary["ok_count"] = len(re.findall(r"\[OK\]", text))
        summary["warn_count"] = len(re.findall(r"\[WARN\]", text))
        summary["fail_count"] = len(re.findall(r"\[FAIL\]", text))

    for json_path in [inspection_json, report_json]:
        if json_path.exists():
            try:
                summary[json_path.name] = json.loads(read_text(json_path, 500_000))
            except Exception as exc:
                summary[json_path.name + "_error"] = str(exc)

    return summary


def scan_local_audits() -> dict[str, Any]:
    groups = {
        "cms_audits": newest_dirs("artifacts/cms_audit_*"),
        "design_studio_inspections": newest_dirs("artifacts/design_studio_inspection_*") + newest_dirs("artifacts/design_studio_existing_refine_*"),
        "mcp_sprints": newest_dirs("artifacts/agentsam_mcp_tool_sprint_*"),
        "other_agentsam": newest_dirs("artifacts/agentsam_*"),
    }

    return {
        key: [summarize_artifact_dir(p) for p in paths]
        for key, paths in groups.items()
    }


def scan_prototype(path: Path | None) -> dict[str, Any]:
    if not path:
        default = ROOT / "prototypes" / "inneranimalmedia-cms-editor"
        path = default if default.exists() else None

    if not path or not path.exists():
        return {"found": False, "path": str(path) if path else ""}

    files = [
        p for p in path.rglob("*")
        if p.is_file() and p.suffix.lower() in {".html", ".jsx", ".tsx", ".js", ".ts", ".css", ".json"}
    ]
    text = "\n".join(read_text(p, 400_000).lower() for p in files)

    found_terms = [t for t in DESIGN_STUDIO_REQUIRED_TERMS if t.lower() in text]
    missing_terms = [t for t in DESIGN_STUDIO_REQUIRED_TERMS if t.lower() not in text]
    score = round(100 * len(found_terms) / max(1, len(DESIGN_STUDIO_REQUIRED_TERMS)), 2)

    return {
        "found": True,
        "path": str(path),
        "file_count": len(files),
        "files": [str(p.relative_to(path)) for p in files],
        "score": score,
        "found_terms": found_terms,
        "missing_terms": missing_terms,
        "recommendation": (
            "keep and refine existing prototype in place"
            if score >= 55 else
            "use as visual reference, but require stronger CMS contract wiring before app integration"
        ),
    }


def pull_d1_schema(args: argparse.Namespace) -> dict[str, Any]:
    if not args.pull_d1:
        return {"skipped": True, "reason": "pass --pull-d1"}

    schema_sql = """
SELECT name, type, sql
FROM sqlite_master
WHERE (name LIKE 'cms_%' OR name LIKE 'agentsam_%' OR name = 'v_agentsam_mcp_tools_branded')
  AND type IN ('table','view')
ORDER BY name;
"""
    schema = wrangler_json(schema_sql, args.d1_db, args.wrangler_config)
    if not schema.get("ok"):
        return {"skipped": False, "ok": False, "schema": schema}

    rows = schema["data"][0]["results"] if schema["data"] else []
    names = [r["name"] for r in rows]
    out: dict[str, Any] = {
        "skipped": False,
        "ok": True,
        "object_count": len(names),
        "names": names,
        "cms_expected_missing": [t for t in CMS_TABLES_EXPECTED if t not in names],
        "agentsam_expected_missing": [t for t in AGENTSAM_TABLES_EXPECTED if t not in names],
        "objects": rows,
        "table_info": {},
        "samples": {},
        "health_queries": {},
    }

    for name in names:
        if name.startswith("cms_") or name in {"agentsam_plans", "agentsam_plan_tasks", "agentsam_route_requirements", "v_agentsam_mcp_tools_branded"}:
            out["table_info"][name] = wrangler_json(f"PRAGMA table_info({name});", args.d1_db, args.wrangler_config)

    health_sqls = {
        "cms_draggable_readiness": """
SELECT
  'sections' AS layer,
  COUNT(*) AS total,
  SUM(CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END) AS missing_sort_order,
  SUM(CASE WHEN is_visible IS NULL THEN 1 ELSE 0 END) AS missing_visibility
FROM cms_page_sections
UNION ALL
SELECT
  'components' AS layer,
  COUNT(*) AS total,
  SUM(CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END) AS missing_sort_order,
  SUM(CASE WHEN is_visible IS NULL THEN 1 ELSE 0 END) AS missing_visibility
FROM cms_section_components;
""",
        "cms_orphans": """
SELECT 'sections_without_page' AS issue, COUNT(*) AS n
FROM cms_page_sections s
LEFT JOIN cms_pages p ON p.id = s.page_id
WHERE p.id IS NULL
UNION ALL
SELECT 'components_without_section' AS issue, COUNT(*) AS n
FROM cms_section_components c
LEFT JOIN cms_page_sections s ON s.id = c.section_id
WHERE s.id IS NULL;
""",
        "agentsam_route_requirements_gaps": """
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
""",
        "branded_mcp_capability_coverage": """
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN capability_key IS NULL OR trim(capability_key) = '' THEN 1 ELSE 0 END) AS missing_capability_key,
  COUNT(DISTINCT capability_key) AS distinct_capability_keys
FROM v_agentsam_mcp_tools_branded;
""",
    }

    for key, sql in health_sqls.items():
        out["health_queries"][key] = wrangler_json(sql, args.d1_db, args.wrangler_config)

    samples = {
        "cms_pages": "SELECT id, title, route_path, status, updated_at FROM cms_pages ORDER BY updated_at DESC LIMIT 20;",
        "cms_page_sections": "SELECT id, page_id, section_type, section_name, sort_order, is_visible, updated_at FROM cms_page_sections ORDER BY updated_at DESC LIMIT 30;",
        "cms_section_components": "SELECT id, section_id, component_type, sort_order, is_visible, updated_at FROM cms_section_components ORDER BY updated_at DESC LIMIT 30;",
        "cms_component_templates": "SELECT id, template_name, template_type, category, tenant_id, shopify_section_key, updated_at FROM cms_component_templates ORDER BY updated_at DESC LIMIT 30;",
        "cms_themes": "SELECT id, name, slug, status, theme_family, workspace_id, css_r2_key, compiled_css_hash, updated_at FROM cms_themes ORDER BY updated_at DESC LIMIT 30;",
        "agentsam_plans": "SELECT id, title, status, plan_date, tasks_total, tasks_done, updated_at FROM agentsam_plans ORDER BY updated_at DESC LIMIT 20;",
        "agentsam_plan_tasks": "SELECT id, plan_id, order_index, title, priority, category, status, risk_level, requires_approval FROM agentsam_plan_tasks ORDER BY created_at DESC LIMIT 40;",
    }

    for key, sql in samples.items():
        if key in names:
            out["samples"][key] = wrangler_json(sql, args.d1_db, args.wrangler_config)

    return out


def build_plan(report: dict[str, Any]) -> dict[str, Any]:
    prototype = report["prototype"]
    d1 = report["d1"]
    local = report["local_audits"]

    priorities: list[dict[str, Any]] = []

    priorities.append({
        "id": "P0-01",
        "title": "Freeze the current CMS editor prototype as a local refinement target",
        "category": "ux",
        "why": "The prototype is visually useful, but should be refined in place instead of being replaced by a new scaffold.",
        "acceptance": [
            "prototype folder lives under prototypes/inneranimalmedia-cms-editor",
            "every script patches existing HTML/JSX instead of generating a competing app",
            "inspection report records before/after score and changed files",
        ],
        "source": prototype,
    })

    priorities.append({
        "id": "P0-02",
        "title": "Define the CMS editor contract around real cms_* rows",
        "category": "db",
        "why": "The editor must map directly to cms_pages → cms_page_sections → cms_section_components, plus templates/themes/drafts/history.",
        "acceptance": [
            "Pages rail reads cms_pages",
            "Structure tree reads cms_page_sections ordered by sort_order",
            "Nested components read cms_section_components ordered by sort_order",
            "Template library reads cms_component_templates and cms_liquid_sections",
            "Theme inspector reads cms_themes tokens_json/css_vars_json/compiled_css_hash",
        ],
    })

    priorities.append({
        "id": "P0-03",
        "title": "Keep AgentSam tracking canonical in D1 and graph meaning in Supabase",
        "category": "agent",
        "why": "D1 is the execution store. Supabase knowledge_edges should describe architecture relationships and outcomes, not become a second source of truth for tasks.",
        "acceptance": [
            "agentsam_plans/agentsam_plan_tasks track sprint work in D1",
            "knowledge_edges only stores architecture/decision relationships",
            "scripts include optional --write-d1 and --write-supabase flags",
        ],
    })

    priorities.append({
        "id": "P0-04",
        "title": "Add real interaction checks before app integration",
        "category": "frontend",
        "why": "The UI only matters if drag, edit, save draft, publish, rollback, preview, and Monaco/browser viewer can be verified.",
        "acceptance": [
            "drag/drop updates local sort_order model first",
            "save draft writes a dry-run payload matching cms_page_drafts",
            "publish preflight checks orphans, missing sort_order, theme tokens, and R2 fields",
            "Monaco is loaded as real Monaco, not a fake code box",
            "Browser viewer is a real iframe/preview shell",
        ],
    })

    priorities.append({
        "id": "P1-01",
        "title": "Turn audit outputs into a dashboard-ready scoring model",
        "category": "analytics",
        "why": "Model/tool performance needs visible scoring: tokens, cost, latency, pass/fail, file changes, table writes, and task completion.",
        "acceptance": [
            "report.json contains normalized checks with status OK/WARN/FAIL",
            "agentsam_plan_tasks can link to report paths",
            "future analytics dashboard can read one report shape",
        ],
    })

    risks = []
    if prototype.get("found") and prototype.get("score", 0) < 55:
        risks.append("Prototype still has weak CMS contract coverage; do not wire as production app yet.")
    if not d1.get("skipped") and d1.get("ok") is False:
        risks.append("Live D1 pull failed; local plan may be missing current table truth.")
    for group, dirs in local.items():
        for item in dirs:
            if item.get("fail_count", 0) > 0:
                risks.append(f"{group} report has FAIL count: {item.get('path')}")

    if not risks:
        risks.append("No hard blockers found from available local audit artifacts.")

    return {
        "summary": "Build the CMS editor by refining the existing Claude prototype in place, backed by the real cms_* contract and tracked through agentsam_* plans/tasks.",
        "priorities": priorities,
        "risks": risks,
        "next_commands": [
            "python3 agentsam_cms_audit_plan.py --repo-root /Users/samprimeaux/inneranimalmedia --pull-d1",
            "python3 scripts/audit/inspect_design_studio_app.py --target prototypes/inneranimalmedia-cms-editor --cms-audit-dir \"$(ls -td artifacts/cms_audit_* | head -1)\"",
            "git status -sb",
        ],
    }


def render_markdown(report: dict[str, Any]) -> str:
    plan = report["plan"]
    lines = [
        "# AgentSam + CMS Audit Plan",
        "",
        f"Generated: `{report['generated_at']}`",
        f"Repo: `{report['repo']}`\nRun dir: `{report.get("run_dir", "")}`",
        "",
        "## Summary",
        "",
        plan["summary"],
        "",
        "## Local audit inputs found",
        "",
    ]

    for group, dirs in report["local_audits"].items():
        lines.append(f"### {group}")
        if not dirs:
            lines.append("- none found")
        for item in dirs[:5]:
            lines.append(
                f"- `{item['path']}` files={item['file_count']} "
                f"OK={item.get('ok_count','n/a')} WARN={item.get('warn_count','n/a')} FAIL={item.get('fail_count','n/a')}"
            )
        lines.append("")

    proto = report["prototype"]
    lines += [
        "## Prototype scan",
        "",
    ]
    if proto.get("found"):
        lines += [
            f"- path: `{proto['path']}`",
            f"- files: `{proto['file_count']}`",
            f"- contract score: `{proto['score']}/100`",
            f"- recommendation: **{proto['recommendation']}**",
            f"- found terms: `{', '.join(proto['found_terms'])}`",
            f"- missing terms: `{', '.join(proto['missing_terms'])}`",
        ]
    else:
        lines.append("- prototype folder not found")
    lines.append("")

    d1 = report["d1"]
    lines += ["## D1 status", ""]
    if d1.get("skipped"):
        lines.append(f"- skipped: {d1.get('reason')}")
    elif d1.get("ok"):
        lines += [
            f"- objects found: `{d1['object_count']}`",
            f"- missing expected cms tables: `{', '.join(d1['cms_expected_missing']) or 'none'}`",
            f"- missing expected agentsam tables: `{', '.join(d1['agentsam_expected_missing']) or 'none'}`",
        ]
    else:
        lines.append("- D1 pull failed; see JSON report.")
    lines.append("")

    lines += ["## Implementation priorities", ""]
    for p in plan["priorities"]:
        lines += [
            f"### {p['id']} — {p['title']}",
            "",
            f"- category: `{p['category']}`",
            f"- why: {p['why']}",
            "- acceptance:",
        ]
        for a in p["acceptance"]:
            lines.append(f"  - {a}")
        lines.append("")

    lines += ["## Risks / blockers", ""]
    for r in plan["risks"]:
        lines.append(f"- {r}")

    lines += ["", "## Next commands", ""]
    for cmd in plan["next_commands"]:
        lines.append(f"```bash\n{cmd}\n```")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pull-d1", action="store_true", help="Pull live D1 schema/samples through wrangler.")
    parser.add_argument("--prototype", default="", help="Prototype folder to scan.")
    parser.add_argument("--d1-db", default=os.getenv("IAM_D1_DB", "inneranimalmedia-business"))
    parser.add_argument("--wrangler-config", default=os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml"))
    parser.add_argument("--repo-root", default="", help="Path to inneranimalmedia repo root. Useful when running from prototypes/inneranimalmedia-cms-editor.")
    parser.add_argument("--out-dir", default="", help="Output directory.")
    args = parser.parse_args()

    out_dir = Path(args.out_dir).expanduser() if args.out_dir else RUN_DIR / "artifacts" / f"agentsam_cms_plan_{now()}"
    out_dir.mkdir(parents=True, exist_ok=True)

    global ROOT
    if args.repo_root:
        ROOT = Path(args.repo_root).expanduser().resolve()

    # When running inside the isolated prototype folder, scan the current folder by default.
    if args.prototype:
        prototype_path = Path(args.prototype).expanduser()
    elif (RUN_DIR / "DesignStudioCMS.html").exists() or (RUN_DIR / "Design Studio.html").exists():
        prototype_path = RUN_DIR
    else:
        prototype_path = None

    report: dict[str, Any] = {
        "generated_at": now(),
        "repo": str(ROOT),
        "run_dir": str(RUN_DIR),
        "local_audits": scan_local_audits(),
        "prototype": scan_prototype(prototype_path),
        "d1": pull_d1_schema(args),
    }
    report["plan"] = build_plan(report)

    write_json(out_dir / "agentsam_cms_audit_plan.json", report)
    write_text(out_dir / "agentsam_cms_audit_plan.md", render_markdown(report))

    print("=" * 88)
    print("AgentSam + CMS audit plan complete")
    print("=" * 88)
    print(f"[done] markdown: {out_dir / 'agentsam_cms_audit_plan.md'}")
    print(f"[done] json:     {out_dir / 'agentsam_cms_audit_plan.json'}")
    print("")
    print("Top plan:")
    for item in report["plan"]["priorities"][:4]:
        print(f"- {item['id']}: {item['title']}")


if __name__ == "__main__":
    main()
