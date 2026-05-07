#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from textwrap import dedent
from datetime import datetime, timezone
from typing import Any


DB_NAME = "inneranimalmedia-business"
COURSE_ID = "course_software_engineering_builder_os"
COURSE_SLUG = "software-engineering-builder-os"
COURSE_TITLE = "Software Engineering Builder OS"
TENANT_ID = "tenant_sam_primeaux"
WORKSPACE_ID = "ws_inneranimalmedia"
R2_BASE = "https://assets.inneranimalmedia.com/learn/software-engineering-builder-os"

MODULES = [
    {
        "id": "module_sebo_foundations",
        "slug": "foundations",
        "title": "Software Engineering Foundations",
        "description": "Mental models for modern software architecture, project structure, and how the full stack fits together.",
        "order_index": 1,
        "estimated_minutes": 75,
    },
    {
        "id": "module_sebo_terminal_ide_git",
        "slug": "terminal-ide-git",
        "title": "Terminal, IDE, and Git Workflow",
        "description": "Practical command-line, editor, repository, and review workflows.",
        "order_index": 2,
        "estimated_minutes": 295,
    },
    {
        "id": "module_sebo_frontend_ux",
        "slug": "frontend-dashboard-ux",
        "title": "Frontend Dashboard UX",
        "description": "React, routes, components, state, and dashboard product design.",
        "order_index": 3,
        "estimated_minutes": 120,
    },
    {
        "id": "module_sebo_cloudflare_runtime",
        "slug": "cloudflare-runtime",
        "title": "Cloudflare Runtime",
        "description": "Workers, routes, bindings, Wrangler, deployment flow, and runtime validation.",
        "order_index": 4,
        "estimated_minutes": 130,
    },
    {
        "id": "module_sebo_data_storage",
        "slug": "data-storage",
        "title": "Data and Storage",
        "description": "D1, SQLite, R2, KV, Durable Objects, Hyperdrive, and Supabase responsibilities.",
        "order_index": 5,
        "estimated_minutes": 150,
    },
    {
        "id": "module_sebo_ai_agents",
        "slug": "ai-agents",
        "title": "AI Engineering and Agent Sam",
        "description": "OpenAI, Claude, Gemini, Workers AI, routing, cost, telemetry, and tool governance.",
        "order_index": 6,
        "estimated_minutes": 135,
    },
    {
        "id": "module_sebo_database_studio",
        "slug": "database-studio",
        "title": "Database Studio Workbench",
        "description": "Designing and building the in-house D1, SQLite, Hyperdrive, and Supabase database editor.",
        "order_index": 7,
        "estimated_minutes": 160,
    },
    {
        "id": "module_sebo_shipping_quality",
        "slug": "shipping-quality",
        "title": "Shipping, QA, and Review",
        "description": "Capstone workflow for shipping, testing, reviewing, measuring, and improving a real feature.",
        "order_index": 8,
        "estimated_minutes": 180,
    },
]

LESSONS = [
    ("lesson_sebo_001_software_engineering_map", "module_sebo_foundations", "The Software Engineering Map: How Modern Apps Actually Fit Together", "software-engineering-map", 1, 75),
    ("lesson_sebo_002_terminal_command_line", "module_sebo_terminal_ide_git", "Terminal Mastery: Commands, Files, Paths, Processes, and Safe Execution", "terminal-command-line", 2, 90),
    ("lesson_sebo_003_ide_workflow_monaco_cursor", "module_sebo_terminal_ide_git", "IDE Workflow: Monaco, Cursor, File Trees, Search, Refactors, and Review Loops", "ide-workflow-monaco-cursor", 3, 100),
    ("lesson_sebo_004_git_github_repo_hygiene", "module_sebo_terminal_ide_git", "Git and GitHub: Branches, Commits, Pull Requests, Rollback Thinking, and Repo Hygiene", "git-github-repo-hygiene", 4, 105),
    ("lesson_sebo_005_frontend_react_dashboard_ux", "module_sebo_frontend_ux", "Frontend Foundations: React, Routes, Components, State, and Dashboard UX", "frontend-react-dashboard-ux", 5, 120),
    ("lesson_sebo_006_cloudflare_workers_runtime", "module_sebo_cloudflare_runtime", "Cloudflare Runtime: Workers, Routes, Bindings, Wrangler, and Deployment Flow", "cloudflare-workers-runtime", 6, 130),
    ("lesson_sebo_007_data_storage_d1_r2_hyperdrive_supabase", "module_sebo_data_storage", "Data and Storage: D1, SQLite, R2, KV, Durable Objects, Hyperdrive, and Supabase", "data-storage-d1-r2-hyperdrive-supabase", 7, 150),
    ("lesson_sebo_008_ai_engineering_agent_sam_routing", "module_sebo_ai_agents", "AI Engineering: OpenAI, Claude, Gemini, Workers AI, Routing, Cost, and Agent Sam", "ai-engineering-agent-sam-routing", 8, 135),
    ("lesson_sebo_009_database_studio_workbench", "module_sebo_database_studio", "Database Studio: Building an In-House D1, SQLite, Hyperdrive, and Supabase Workbench", "database-studio-workbench", 9, 160),
    ("lesson_sebo_010_capstone_ship_review_measure", "module_sebo_shipping_quality", "Capstone: Ship, Test, Review, Measure, and Improve a Real Dashboard Feature", "capstone-ship-review-measure", 10, 180),
]


@dataclass(frozen=True)
class Raw:
    sql: str


def sh(cmd: list[str], *, capture: bool = False) -> str:
    print(" ".join(cmd))
    if capture:
        return subprocess.check_output(cmd, text=True)
    subprocess.run(cmd, check=True)
    return ""


def d1_json(sql: str, db: str = DB_NAME) -> list[dict[str, Any]]:
    out = sh(
        ["npx", "wrangler", "d1", "execute", db, "--remote", "--json", "--command", sql],
        capture=True,
    )
    try:
        payload = json.loads(out)
    except json.JSONDecodeError as exc:
        print(out)
        raise SystemExit(f"Could not parse Wrangler JSON output: {exc}") from exc

    rows: list[dict[str, Any]] = []

    def walk(x: Any) -> None:
        if isinstance(x, dict):
            if isinstance(x.get("results"), list):
                for row in x["results"]:
                    if isinstance(row, dict):
                        rows.append(row)
            for value in x.values():
                walk(value)
        elif isinstance(x, list):
            for item in x:
                walk(item)

    walk(payload)
    return rows


def table_exists(table: str, db: str = DB_NAME) -> bool:
    rows = d1_json(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name = {sql_lit(table)};",
        db=db,
    )
    return bool(rows)


def table_columns(table: str, db: str = DB_NAME) -> dict[str, dict[str, Any]]:
    rows = d1_json(f"PRAGMA table_info({quote_ident(table)});", db=db)
    return {str(row["name"]): row for row in rows if "name" in row}


def quote_ident(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Unsafe identifier: {name}")
    return name


def sql_lit(value: Any) -> str:
    if isinstance(value, Raw):
        return value.sql
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int | float):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def adaptive_insert_or_replace(table: str, data: dict[str, Any], cols: dict[str, dict[str, Any]]) -> str:
    selected = {k: v for k, v in data.items() if k in cols}
    if not selected:
        return f"-- skipped {table}: no matching columns for data keys\n"

    col_sql = ", ".join(selected.keys())
    val_sql = ", ".join(sql_lit(v) for v in selected.values())

    return f"INSERT OR REPLACE INTO {table} ({col_sql}) VALUES ({val_sql});\n"


def adaptive_update(table: str, key_col: str, key_val: str, data: dict[str, Any], cols: dict[str, dict[str, Any]]) -> str:
    if key_col not in cols:
        return f"-- skipped update {table}: missing key column {key_col}\n"

    selected = {k: v for k, v in data.items() if k in cols and k != key_col}
    if not selected:
        return f"-- skipped update {table}: no matching update columns\n"

    set_sql = ", ".join(f"{k} = {sql_lit(v)}" for k, v in selected.items())
    return f"UPDATE {table} SET {set_sql} WHERE {key_col} = {sql_lit(key_val)};\n"


def build_course_data(cols: dict[str, dict[str, Any]]) -> dict[str, Any]:
    metadata = {
        "source": "scripts/reconcile_learning_os_course.py",
        "course_slug": COURSE_SLUG,
        "r2_prefix": f"learn/{COURSE_SLUG}/",
        "public_base_url": f"{R2_BASE}/",
        "lesson_count": len(LESSONS),
        "course_type": "reusable_subscription_curriculum",
    }

    data = {
        "id": COURSE_ID,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "slug": COURSE_SLUG,
        "course_slug": COURSE_SLUG,
        "title": COURSE_TITLE,
        "name": COURSE_TITLE,
        "display_name": COURSE_TITLE,
        "description": "Reusable Software Engineering / Builder OS curriculum for teaching modern development, dashboard building, Cloudflare, data/storage, AI routing, Agent Sam, Database Studio, QA, and shipping workflows.",
        "summary": "A reusable multi-user builder curriculum for the Inner Animal Media Learning OS.",
        "level": "beginner-to-intermediate",
        "difficulty": "beginner-to-intermediate",
        "status": "published",
        "visibility": "public",
        "category": "software-engineering",
        "course_type": "learning_os",
        "estimated_hours": 20,
        "estimated_minutes": sum(x[5] for x in LESSONS),
        "module_count": len(MODULES),
        "lesson_count": len(LESSONS),
        "is_published": 1,
        "published_at": Raw("unixepoch()"),
        "created_at": Raw("COALESCE((SELECT created_at FROM courses WHERE id = 'course_software_engineering_builder_os'), unixepoch())") if "created_at" in cols else None,
        "updated_at": Raw("unixepoch()"),
        "metadata_json": json_text(metadata),
    }
    return data


def build_module_data(module: dict[str, Any], cols: dict[str, dict[str, Any]]) -> dict[str, Any]:
    data = {
        "id": module["id"],
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "course_id": COURSE_ID,
        "slug": module["slug"],
        "module_slug": module["slug"],
        "title": module["title"],
        "name": module["title"],
        "display_name": module["title"],
        "description": module["description"],
        "order_index": module["order_index"],
        "sort_order": module["order_index"],
        "position": module["order_index"],
        "estimated_minutes": module["estimated_minutes"],
        "is_required": 1,
        "is_published": 1,
        "status": "published",
        "published_at": Raw("unixepoch()"),
        "created_at": Raw("unixepoch()"),
        "updated_at": Raw("unixepoch()"),
        "metadata_json": json_text({"source": "reconcile_learning_os_course", "course_slug": COURSE_SLUG}),
    }
    return data


def build_course_lessons_data(lesson: tuple[str, str, str, str, int, int], cols: dict[str, dict[str, Any]]) -> dict[str, Any]:
    lesson_id, module_id, title, slug, order_index, minutes = lesson
    content_url = f"{R2_BASE}/lessons/{order_index:03d}_{slug}.md"

    data = {
        "id": lesson_id,
        "lesson_id": lesson_id,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "course_id": COURSE_ID,
        "module_id": module_id,
        "title": title,
        "name": title,
        "slug": slug,
        "lesson_slug": slug,
        "description": f"Learning OS lesson: {title}",
        "content_type": "markdown",
        "content_url": content_url,
        "content_text": None,
        "order_index": order_index,
        "sort_order": order_index,
        "position": order_index,
        "estimated_minutes": minutes,
        "is_required": 1,
        "is_published": 1,
        "status": "published",
        "published_at": Raw("unixepoch()"),
        "created_at": Raw("unixepoch()"),
        "updated_at": Raw("unixepoch()"),
        "metadata_json": json_text({"source": "lessons table compatibility backfill", "r2_key": f"learn/{COURSE_SLUG}/lessons/{order_index:03d}_{slug}.md"}),
    }
    return data


def write_sql_and_docs(args: argparse.Namespace, db: str = DB_NAME) -> Path:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    schema: dict[str, dict[str, dict[str, Any]]] = {}

    for table in ["courses", "course_modules", "course_lessons", "lessons", "lesson_assets"]:
        if table_exists(table, db=db):
            schema[table] = table_columns(table, db=db)
        else:
            schema[table] = {}

    out_dir = Path("sql/learn")
    out_dir.mkdir(parents=True, exist_ok=True)

    sql_path = out_dir / "010_reconcile_software_engineering_builder_os.sql"

    chunks: list[str] = []
    chunks.append(f"-- Generated by scripts/reconcile_learning_os_course.py at {generated_at}\n")
    chunks.append("-- Purpose: reconcile Software Engineering Builder OS course/modules/lesson compatibility without assuming missing columns.\n\n")

    if schema["courses"]:
        chunks.append("-- Upsert canonical course row. Uses only columns that exist in your courses table.\n")
        chunks.append(adaptive_insert_or_replace("courses", build_course_data(schema["courses"]), schema["courses"]))
        chunks.append("\n")
    else:
        chunks.append("-- skipped courses: table does not exist\n\n")

    if schema["course_modules"]:
        chunks.append("-- Upsert canonical module rows. Uses only columns that exist in your course_modules table.\n")
        for module in MODULES:
            chunks.append(adaptive_insert_or_replace("course_modules", build_module_data(module, schema["course_modules"]), schema["course_modules"]))
        chunks.append("\n")
    else:
        chunks.append("-- skipped course_modules: table does not exist\n\n")

    if schema["course_lessons"]:
        chunks.append("-- Compatibility backfill for Cursor v1 / older Learn API paths that still read course_lessons.\n")
        chunks.append("-- These rows mirror the canonical lessons table and R2 markdown URLs.\n")
        for lesson in LESSONS:
            chunks.append(adaptive_insert_or_replace("course_lessons", build_course_lessons_data(lesson, schema["course_lessons"]), schema["course_lessons"]))
        chunks.append("\n")
    else:
        chunks.append("-- skipped course_lessons compatibility backfill: table does not exist\n\n")

    if table_exists("agentsam_plan_tasks", db=db):
        chunks.append("-- Mark the relevant planning tasks as in_progress now that the course reconciliation seed exists.\n")
        chunks.append("""
UPDATE agentsam_plan_tasks
SET
  status = CASE
    WHEN order_index IN (1, 4) AND status = 'todo' THEN 'in_progress'
    ELSE status
  END,
  notes = COALESCE(notes, '') || char(10) || 'Course/module/lesson reconciliation SQL generated at """ + generated_at + """.',
  created_at = created_at
WHERE plan_id = 'plan_platform_remaster_sprint_20260507'
  AND order_index IN (1, 4);
""")
        chunks.append("\n")

    sql_path.write_text("".join(chunks), encoding="utf-8")

    docs_dir = Path("docs/learn")
    docs_dir.mkdir(parents=True, exist_ok=True)

    schema_report = {
        table: sorted(cols.keys())
        for table, cols in schema.items()
    }

    doc_path = docs_dir / "LEARNING_OS_RECONCILIATION.md"
    doc_path.write_text(dedent(f"""
    # Learning OS Reconciliation Plan

    Generated: {generated_at}

    This document explains how the Software Engineering Builder OS course ties Cursor's v1 Learn implementation to the new R2-backed `lessons` and `lesson_assets` system.

    ## Why this exists

    The verification queries failed because they selected `is_published` from `courses` and `course_modules`, but those columns do not exist in the current D1 schema.

    This is the exact failure class we need to avoid going forward:

    ```txt
    no such column: is_published
    ```

    The fix is not to guess columns. The fix is to introspect the schema with `PRAGMA table_info(...)` and generate SQL/API selectors that only reference real columns.

    ## Generated SQL

    ```txt
    {sql_path}
    ```

    ## Current schema columns discovered by the script

    ```json
    {json.dumps(schema_report, indent=2)}
    ```

    ## Course package

    ```txt
    learn/software-engineering-builder-os/
      README.md
      COURSE.md
      RUBRIC.md
      TO-DO.md
      manifest.json
      lessons/
      sql/
    ```

    ## R2 package

    ```txt
    inneranimalmedia/learn/software-engineering-builder-os/
    ```

    ## D1 canonical lesson source

    ```txt
    lessons
    lesson_assets
    ```

    ## Compatibility layer

    Cursor's v1 Learn work may still read:

    ```txt
    courses
    course_modules
    course_lessons
    ```

    The generated SQL ensures:

    ```txt
    courses has the Software Engineering Builder OS parent row.
    course_modules has module rows if the table exists.
    course_lessons is backfilled if that table exists.
    lessons remains the canonical lesson table.
    lesson_assets remains the canonical R2 asset table.
    ```

    ## Required `/api/learn/dashboard` behavior

    `src/api/learn.js` must return a normalized view model, regardless of whether a row came from `lessons` or `course_lessons`.

    Required shape:

    ```ts
    type NormalizedLesson = {{
      id: string;
      course_id: string;
      module_id: string;
      title: string;
      slug: string;
      description?: string;
      content_type: 'markdown' | 'text' | 'video' | string;
      content_url?: string;
      content_text?: string;
      order_index: number;
      estimated_minutes?: number;
      is_required?: number;
      is_published?: number;
      assets: LessonAsset[];
      progress?: LessonProgress;
      assignments: CourseAssignment[];
    }};
    ```

    ## No fake workspace tooling

    `/dashboard/learn` must reuse the real Agent workspace systems:

    ```txt
    ChatAssistant
    MonacoEditorView
    BrowserView
    XTermShell
    WorkspaceExplorerPanel
    agentsam_workspace_state
    agentsam_command_run
    agentsam_tool_call_log
    agentsam_guardrail_events
    ```

    ## Cursor implementation instruction

    ```txt
    Refactor /dashboard/learn so it consumes the reconciled Learning OS data model.

    Do not assume courses.is_published or course_modules.is_published exist.
    Use API-side normalization and safe SELECTs.
    Prefer canonical lessons + lesson_assets.
    Use course_lessons only as compatibility fallback.
    Reuse existing Agent workspace tooling from /dashboard/agent:
    ChatAssistant, MonacoEditorView, BrowserView, XTermShell, workspace state, command governance, and telemetry.
    Do not build fake terminal/editor/browser panels.
    Admin/superadmin can edit/reorder curriculum.
    Students can read, run labs, submit evidence, and get feedback.
    ```
    """).strip() + "\n", encoding="utf-8")

    print(f"wrote: {sql_path}")
    print(f"wrote: {doc_path}")

    return sql_path


def verify_queries() -> list[str]:
    return [
        f"""
SELECT
  id,
  title,
  slug,
  status
FROM courses
WHERE id = '{COURSE_ID}'
   OR slug = '{COURSE_SLUG}';
""",
        f"""
SELECT
  id,
  course_id,
  title,
  order_index
FROM course_modules
WHERE course_id = '{COURSE_ID}'
ORDER BY order_index;
""",
        f"""
SELECT
  id,
  course_id,
  module_id,
  title,
  slug,
  content_url,
  is_published
FROM lessons
WHERE course_id = '{COURSE_ID}'
ORDER BY order_index;
""",
        f"""
SELECT
  lesson_id,
  asset_type,
  r2_key,
  file_name,
  mime_type
FROM lesson_assets
WHERE lesson_id LIKE 'lesson_sebo_%'
ORDER BY lesson_id, order_index;
""",
    ]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_NAME)
    ap.add_argument("--apply", action="store_true", help="Apply generated SQL to remote D1.")
    ap.add_argument("--verify", action="store_true", help="Run safe verification queries after generating/applying.")
    args = ap.parse_args()

    db_name = args.db

    sql_path = write_sql_and_docs(args, db=db_name)

    if args.apply:
        sh(["npx", "wrangler", "d1", "execute", db_name, "--remote", "--file", str(sql_path)])

    if args.verify:
        for query in verify_queries():
            print("")
            sh(["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", query])

    print("")
    print("Next:")
    print(f"  npx wrangler d1 execute {db_name} --remote --file {sql_path}")
    print("  python3 scripts/reconcile_learning_os_course.py --verify")
    print("")
    print("Commit:")
    print("  git add scripts/reconcile_learning_os_course.py sql/learn/010_reconcile_software_engineering_builder_os.sql docs/learn/LEARNING_OS_RECONCILIATION.md")
    print('  git commit -m "tools: reconcile Learning OS course schema"')
    print("  git push")


if __name__ == "__main__":
    main()
