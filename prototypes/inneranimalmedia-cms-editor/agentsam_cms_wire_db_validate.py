import json
import hashlib
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

APP_DIR = Path.cwd()
REPO_ROOT = Path("/Users/samprimeaux/inneranimalmedia")
WRANGLER_CONFIG = REPO_ROOT / "wrangler.production.toml"
DB_NAME = "inneranimalmedia-business"

RUN_ID = "cms_wire_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
ARTIFACT_DIR = APP_DIR / "artifacts" / RUN_ID
BRIDGE_DIR = APP_DIR / "bridge" / RUN_ID

CMS_TABLES = [
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
]

ASSET_CANDIDATES = {
    "design_studio": [
        "DesignStudioCMS.html",
        "Design Studio.html",
        "index.html",
    ],
    "studio_jsx": [
        "studio.jsx",
    ],
    "tweaks_panel": [
        "tweaks-panel.jsx",
    ],
    "analytics_dashboard": [
        "Analytics Dashboard.html",
        "Analytics Dashboard _Standalone_.html",
        "AnalyticsDashboard.html",
        "analytics-dashboard.html",
        "analytics-dashboard.jsx",
        "Analytics Dashboard.jsx",
    ],
}

CONTRACT_TERMS = [
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
    "sort_order",
    "is_visible",
    "section_data",
    "component_data",
    "tokens_json",
    "css_vars_json",
    "compiled_css_hash",
    "r2_key",
    "r2_url",
    "publish",
    "draft",
    "rollback",
    "drag",
    "drop",
    "reorder",
    "analytics",
]

PLAN_ID = "plan_agentsam_cms_editor_wire_validate_20260513"

TASKS = [
    {
        "id": "task_cms_wire_001_assets",
        "order_index": 1,
        "title": "Wire Claude CMS editor assets into isolated bridge",
        "description": "Validate Design Studio, studio.jsx, tweaks-panel.jsx, and analytics dashboard exist and are copied into a traceable bridge folder.",
        "priority": "P0",
        "category": "frontend",
        "risk_level": "low",
        "requires_approval": 0,
    },
    {
        "id": "task_cms_wire_002_contract",
        "order_index": 2,
        "title": "Validate CMS editor contract against cms_* D1 tables",
        "description": "Confirm the prototype references the real cms_* table contract and identify missing terms before deeper wiring.",
        "priority": "P0",
        "category": "db",
        "risk_level": "medium",
        "requires_approval": 0,
    },
    {
        "id": "task_cms_wire_003_db_write",
        "order_index": 3,
        "title": "Prove AgentSam D1 plan/task write path for CMS editor sprint",
        "description": "Write and verify agentsam_plans plus agentsam_plan_tasks rows without touching production UI files.",
        "priority": "P0",
        "category": "db",
        "risk_level": "medium",
        "requires_approval": 0,
    },
    {
        "id": "task_cms_wire_004_next",
        "order_index": 4,
        "title": "Prepare next implementation pass for real CMS editor hydration",
        "description": "Create markdown and JSON handoff showing exact files, table gaps, and next wiring order.",
        "priority": "P1",
        "category": "other",
        "risk_level": "low",
        "requires_approval": 0,
    },
]

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def die(msg):
    print("[FAIL] " + msg)
    sys.exit(1)

def ok(msg):
    print("[OK] " + msg)

def warn(msg):
    print("[WARN] " + msg)

def run_cmd(args, cwd=None, check=True):
    print("$ " + " ".join(str(a) for a in args))
    proc = subprocess.run(
        [str(a) for a in args],
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
    )
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.stderr.strip():
        print(proc.stderr.strip(), file=sys.stderr)
    if check and proc.returncode != 0:
        die("command failed with exit=" + str(proc.returncode))
    return proc

def wrangler_json(sql):
    if not WRANGLER_CONFIG.exists():
        die("missing wrangler config: " + str(WRANGLER_CONFIG))
    proc = run_cmd(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB_NAME,
            "--remote",
            "-c",
            str(WRANGLER_CONFIG),
            "--json",
            "--command",
            sql,
        ],
        cwd=REPO_ROOT,
        check=True,
    )
    try:
        return json.loads(proc.stdout)
    except Exception as exc:
        die("could not parse wrangler JSON: " + str(exc))

def sql_quote(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"

def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def find_asset(candidates):
    for name in candidates:
        p = APP_DIR / name
        if p.exists() and p.is_file():
            return p
    return None

def collect_assets():
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    found = {}
    missing = []
    for key, candidates in ASSET_CANDIDATES.items():
        p = find_asset(candidates)
        if p:
            dst = BRIDGE_DIR / p.name
            shutil.copy2(p, dst)
            found[key] = {
                "source": str(p),
                "bridge_copy": str(dst),
                "name": p.name,
                "bytes": p.stat().st_size,
                "sha256": file_hash(p),
            }
            ok("asset." + key + ": " + p.name)
        else:
            missing.append(key)
            warn("asset missing: " + key + " candidates=" + ",".join(candidates))
    return found, missing

def scan_contract(asset_map):
    combined = ""
    per_file = {}
    for item in asset_map.values():
        p = Path(item["source"])
        text = p.read_text(encoding="utf-8", errors="replace")
        combined += "\n" + text
        per_file[p.name] = {
            "bytes": len(text.encode("utf-8")),
            "terms": sorted([t for t in CONTRACT_TERMS if t.lower() in text.lower()]),
        }

    found = sorted([t for t in CONTRACT_TERMS if t.lower() in combined.lower()])
    missing = sorted([t for t in CONTRACT_TERMS if t.lower() not in combined.lower()])
    score = round((len(found) / len(CONTRACT_TERMS)) * 100, 2)
    return {
        "score": score,
        "found": found,
        "missing": missing,
        "per_file": per_file,
    }

def pull_d1_contract():
    schema = {}
    existing = []
    for table in CMS_TABLES:
        payload = wrangler_json("SELECT name, type FROM sqlite_master WHERE name = " + sql_quote(table) + ";")
        rows = payload[0].get("results", []) if payload else []
        if rows:
            existing.append(table)
            cols = wrangler_json("PRAGMA table_info(" + table + ");")[0].get("results", [])
            try:
                count_rows = wrangler_json("SELECT COUNT(*) AS n FROM " + table + ";")[0].get("results", [])
            except Exception:
                count_rows = [{"n": None}]
            schema[table] = {
                "exists": True,
                "columns": cols,
                "row_count": count_rows[0].get("n") if count_rows else None,
            }
            ok("d1.table." + table + ": exists rows=" + str(schema[table]["row_count"]))
        else:
            schema[table] = {"exists": False, "columns": [], "row_count": None}
            warn("d1.table." + table + ": missing")
    return schema, existing

def write_agentsam_tracking(asset_map, scan, schema):
    files_json = json.dumps(asset_map, sort_keys=True)
    linked_tables = [t for t, v in schema.items() if v.get("exists")]
    notes = {
        "run_id": RUN_ID,
        "app_dir": str(APP_DIR),
        "bridge_dir": str(BRIDGE_DIR),
        "contract_score": scan["score"],
        "contract_found": scan["found"],
        "contract_missing": scan["missing"],
        "linked_cms_tables": linked_tables,
        "generated_at": now_iso(),
    }

    morning_brief = (
        "CMS editor bridge validation for Claude-built Design Studio assets. "
        "Goal: wire existing files together, prove D1 tracking writes, validate cms_* contract coverage, "
        "and prepare next hydration pass without modifying main app."
    )

    session_notes = json.dumps(notes, ensure_ascii=False)

    plan_sql = f"""
INSERT OR REPLACE INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  morning_brief, session_notes, available_providers, blocked_providers,
  budget_snapshot, default_model, token_budget, tasks_total, tasks_done,
  tasks_blocked, linked_project_keys, linked_todo_ids, linked_context_ids,
  graph_mode, risk_level, requires_approval, r2_prefix, plan_md_url, plan_map_url, updated_at
)
VALUES (
  {sql_quote(PLAN_ID)},
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  '2026-05-13',
  'sprint',
  'CMS Editor Asset Wiring + D1 Validation',
  'active',
  {sql_quote(morning_brief)},
  {sql_quote(session_notes)},
  '["openai","google","workers_ai","ollama"]',
  '[]',
  {sql_quote(json.dumps({"mode":"test_metrics","models":["gpt-5.4-mini","gpt-5.4-nano","ollama"]}))},
  'gpt-5.4-nano',
  50000,
  {len(TASKS)},
  0,
  0,
  '["inneranimalmedia","cms_editor","agentsam"]',
  '[]',
  '[]',
  1,
  'medium',
  0,
  {sql_quote("artifacts/" + RUN_ID)},
  {sql_quote(str(ARTIFACT_DIR / "report.md"))},
  {sql_quote(str(ARTIFACT_DIR / "report.json"))},
  unixepoch()
);
"""
    wrangler_json(plan_sql)
    ok("d1.write.agentsam_plans: " + PLAN_ID)

    wrangler_json("DELETE FROM agentsam_plan_tasks WHERE plan_id = " + sql_quote(PLAN_ID) + ";")
    ok("d1.cleanup.agentsam_plan_tasks: previous tasks removed")

    values = []
    for task in TASKS:
        qgate = {
            "run_id": RUN_ID,
            "must_not_modify_main_app": True,
            "requires_artifacts": True,
            "asset_contract_score": scan["score"],
            "files_json_sha256": hashlib.sha256(files_json.encode("utf-8")).hexdigest(),
        }
        files_involved = [v["name"] for v in asset_map.values()]
        tables_involved = ["agentsam_plans", "agentsam_plan_tasks"] + [t for t, v in schema.items() if v.get("exists")]
        values.append(f"""(
  {sql_quote(task["id"])},
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  {sql_quote(PLAN_ID)},
  'agent_sam',
  'gpt-5.4-nano',
  {task["order_index"]},
  {sql_quote(task["title"])},
  {sql_quote(task["description"])},
  {sql_quote(task["priority"])},
  {sql_quote(task["category"])},
  'todo',
  {sql_quote(json.dumps(files_involved))},
  {sql_quote(json.dumps(tables_involved))},
  {sql_quote(json.dumps(["/dashboard/designstudio","/dashboard/cms","/api/cms/*"]))},
  '[]',
  {30 if task["priority"] == "P0" else 20},
  {sql_quote("Generated by " + RUN_ID + ". " + task["title"])},
  'python',
  'script',
  {sql_quote(task["risk_level"])},
  {task["requires_approval"]},
  {sql_quote(json.dumps(qgate))},
  unixepoch()
)""")

    task_sql = """
INSERT INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, agent_id, assigned_model,
  order_index, title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, handler_key, handler_type,
  risk_level, requires_approval, quality_gate_json, created_at
)
VALUES
""" + ",\n".join(values) + ";"

    wrangler_json(task_sql)
    ok("d1.write.agentsam_plan_tasks: " + str(len(TASKS)) + " tasks")

    verify = wrangler_json(f"""
SELECT
  p.id,
  p.title,
  p.status,
  p.tasks_total,
  COUNT(t.id) AS actual_tasks
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id = p.id
WHERE p.id = {sql_quote(PLAN_ID)}
GROUP BY p.id, p.title, p.status, p.tasks_total;
""")
    rows = verify[0].get("results", []) if verify else []
    if not rows:
        die("D1 verify failed: plan not found")
    row = rows[0]
    if int(row.get("actual_tasks", 0)) != len(TASKS):
        die("D1 verify failed: task count mismatch " + json.dumps(row))
    ok("d1.verify.plan_tasks: " + json.dumps(row))
    return row

def write_reports(asset_map, missing_assets, scan, schema, verify_row):
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "run_id": RUN_ID,
        "generated_at": now_iso(),
        "app_dir": str(APP_DIR),
        "repo_root": str(REPO_ROOT),
        "db_name": DB_NAME,
        "bridge_dir": str(BRIDGE_DIR),
        "assets": asset_map,
        "missing_assets": missing_assets,
        "contract_scan": scan,
        "d1_schema": schema,
        "agentsam_verify": verify_row,
        "next_order": [
            "Keep current Claude files as source of truth.",
            "Patch the existing files only after this report identifies missing CMS contract terms.",
            "Next pass should wire real fetch('/api/cms/pages'), fetch('/api/cms/themes'), and analytics panel data, not create a new UI.",
            "Promote only after D1 read/write validation and AgentSam scoring rows are visible.",
        ],
    }
    (ARTIFACT_DIR / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    md = []
    md.append("# CMS Editor Wiring + D1 Validation")
    md.append("")
    md.append("Run ID: `" + RUN_ID + "`")
    md.append("")
    md.append("## Result")
    md.append("")
    md.append("- Bridge folder: `" + str(BRIDGE_DIR) + "`")
    md.append("- Contract score: `" + str(scan["score"]) + "%`")
    md.append("- D1 plan: `" + PLAN_ID + "`")
    md.append("- D1 task rows: `" + str(verify_row.get("actual_tasks")) + "`")
    md.append("")
    md.append("## Assets")
    for key, item in asset_map.items():
        md.append("- `" + key + "` → `" + item["name"] + "` `" + str(item["bytes"]) + " bytes` `" + item["sha256"][:16] + "...`")
    if missing_assets:
        md.append("")
        md.append("Missing assets: `" + ", ".join(missing_assets) + "`")
    md.append("")
    md.append("## Contract found")
    md.append("")
    md.append("`" + "`, `".join(scan["found"]) + "`")
    md.append("")
    md.append("## Contract missing")
    md.append("")
    md.append("`" + "`, `".join(scan["missing"]) + "`")
    md.append("")
    md.append("## Existing cms_* tables")
    md.append("")
    for table, meta in schema.items():
        md.append("- `" + table + "` exists=" + str(meta.get("exists")) + " rows=" + str(meta.get("row_count")))
    md.append("")
    md.append("## Next")
    md.append("")
    for n in report["next_order"]:
        md.append("- " + n)
    (ARTIFACT_DIR / "report.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    ok("report.json: " + str(ARTIFACT_DIR / "report.json"))
    ok("report.md: " + str(ARTIFACT_DIR / "report.md"))

def main():
    print("=" * 88)
    print("AgentSam CMS editor asset wiring + D1 validation")
    print("=" * 88)
    print("app=" + str(APP_DIR))
    print("repo=" + str(REPO_ROOT))
    print("db=" + DB_NAME)
    print("run_id=" + RUN_ID)

    if not APP_DIR.exists():
        die("app dir missing")
    if not REPO_ROOT.exists():
        die("repo root missing")
    if not WRANGLER_CONFIG.exists():
        die("wrangler.production.toml missing at " + str(WRANGLER_CONFIG))

    asset_map, missing_assets = collect_assets()
    if not asset_map:
        die("no assets found in " + str(APP_DIR))

    scan = scan_contract(asset_map)
    ok("contract.scan.score: " + str(scan["score"]) + "%")
    if scan["missing"]:
        warn("contract.missing: " + ", ".join(scan["missing"]))

    schema, existing = pull_d1_contract()
    if "cms_pages" not in existing or "cms_page_sections" not in existing or "cms_section_components" not in existing:
        die("core cms tables missing; refusing tracking write")

    verify_row = write_agentsam_tracking(asset_map, scan, schema)
    write_reports(asset_map, missing_assets, scan, schema, verify_row)

    print("=" * 88)
    print("DONE")
    print("=" * 88)
    print("Bridge folder: " + str(BRIDGE_DIR))
    print("Markdown: " + str(ARTIFACT_DIR / "report.md"))
    print("JSON: " + str(ARTIFACT_DIR / "report.json"))

main()
