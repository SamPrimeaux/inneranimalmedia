#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from textwrap import dedent
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

DEFAULT_COURSE_ID = "course_software_engineering_builder_os"
DEFAULT_COURSE_SLUG = "software-engineering-builder-os"
DEFAULT_COURSE_TITLE = "Software Engineering Builder OS"
DEFAULT_R2_BUCKET = "inneranimalmedia"
DEFAULT_PUBLIC_BASE = "https://assets.inneranimalmedia.com"

LESSONS = [
    {
        "n": 1,
        "module_id": "module_sebo_foundations",
        "title": "The Software Engineering Map: How Modern Apps Actually Fit Together",
        "slug": "software-engineering-map",
        "minutes": 75,
        "objective": "Understand the full map of modern software engineering: frontend, backend, databases, APIs, cloud runtime, storage, auth, deployment, observability, and AI tooling.",
        "description": "A panoramic orientation lesson that gives learners the mental model they need before touching code.",
        "lab": [
            "Draw the architecture of a basic SaaS app.",
            "Label frontend, API, database, object storage, auth, and deployment layers.",
            "Identify where Cloudflare Workers, D1, R2, Supabase, GitHub, and Agent Sam fit.",
            "Write a short explanation of what each layer owns."
        ],
        "commands": [
            "pwd",
            "ls -la",
            "find . -maxdepth 2 -type d | sort"
        ],
        "files": ["README.md", "docs/", "src/", "dashboard/", "worker.js or src/index.js"],
        "tables": ["courses", "course_modules", "lessons", "lesson_assets", "agentsam_project_context"],
        "evidence": [
            "Architecture sketch or markdown diagram",
            "Repo folder map",
            "Short explanation of each major system layer"
        ],
    },
    {
        "n": 2,
        "module_id": "module_sebo_terminal_ide_git",
        "title": "Terminal Mastery: Commands, Files, Paths, Processes, and Safe Execution",
        "slug": "terminal-command-line",
        "minutes": 90,
        "objective": "Become comfortable using the terminal as a real production tool for navigation, inspection, setup, and safe command execution.",
        "description": "Learners build terminal fluency without reckless copy-paste habits.",
        "lab": [
            "Navigate the repo using pwd, ls, cd, find, and tree-style commands.",
            "Inspect files with cat, head, tail, sed, grep, and wc.",
            "Run a harmless command and capture output.",
            "Classify commands by risk: safe read, write, destructive, deploy, secret-sensitive.",
            "Explain why command governance matters in Agent Sam."
        ],
        "commands": [
            "pwd",
            "ls -lah",
            "find . -maxdepth 3 -type f | sort | head -n 80",
            "grep -R \"TODO\" -n docs src dashboard | head -n 50"
        ],
        "files": ["scripts/", "docs/", "src/", "dashboard/"],
        "tables": ["agentsam_commands", "agentsam_command_run", "agentsam_command_allowlist", "agentsam_guardrail_events"],
        "evidence": [
            "Terminal output from repo inspection",
            "A command risk classification table",
            "Notes explaining which commands should require approval"
        ],
    },
    {
        "n": 3,
        "module_id": "module_sebo_terminal_ide_git",
        "title": "IDE Workflow: Monaco, Cursor, File Trees, Search, Refactors, and Review Loops",
        "slug": "ide-workflow-monaco-cursor",
        "minutes": 100,
        "objective": "Learn how to use an IDE like a software engineer: search first, inspect context, make focused edits, validate, and avoid accidental regressions.",
        "description": "A practical lesson on professional editing workflows across Cursor, Monaco, and the in-dashboard editor.",
        "lab": [
            "Open the project file tree.",
            "Search for a route, component, and API handler.",
            "Trace a frontend route to backend API call.",
            "Write a small non-invasive doc/comment improvement.",
            "Review the git diff and explain what changed."
        ],
        "commands": [
            "git status --short",
            "grep -R \"dashboard/learn\" -n dashboard src | head -n 50",
            "git diff --stat"
        ],
        "files": ["dashboard/App.tsx", "dashboard/components/", "src/api/", "src/core/production-dispatch.js"],
        "tables": ["agentsam_workspace_state", "agentsam_project_context", "agentsam_plan_tasks"],
        "evidence": [
            "Search path showing route/component/API relationship",
            "A focused diff",
            "Explanation of how the change was validated"
        ],
    },
    {
        "n": 4,
        "module_id": "module_sebo_terminal_ide_git",
        "title": "Git and GitHub: Branches, Commits, Pull Requests, Rollback Thinking, and Repo Hygiene",
        "slug": "git-github-repo-hygiene",
        "minutes": 105,
        "objective": "Use Git and GitHub safely for real project work: inspect state, stage changes, commit intentionally, push, and understand rollback options.",
        "description": "A practical Git workflow lesson for builders who need confidence before shipping.",
        "lab": [
            "Inspect git status and recent commits.",
            "Create a small docs-only change.",
            "Stage only the intended file.",
            "Commit with a clean message.",
            "Explain how to revert or recover if the wrong file is changed."
        ],
        "commands": [
            "git status --short",
            "git log --oneline -n 10",
            "git diff -- docs | head -n 120"
        ],
        "files": [".gitignore", "README.md", "docs/", "scripts/"],
        "tables": ["agentsam_command_run", "agentsam_tool_call_log"],
        "evidence": [
            "git status before and after",
            "commit hash",
            "rollback/recovery explanation"
        ],
    },
    {
        "n": 5,
        "module_id": "module_sebo_frontend_ux",
        "title": "Frontend Foundations: React, Routes, Components, State, and Dashboard UX",
        "slug": "frontend-react-dashboard-ux",
        "minutes": 120,
        "objective": "Understand how a modern dashboard frontend is structured and how routes, components, state, and styling combine into a usable product.",
        "description": "Learners trace and improve a real dashboard UI without redesigning the whole app.",
        "lab": [
            "Find a dashboard route in App.tsx.",
            "Trace the route to its page component.",
            "Identify child components, state, and API calls.",
            "Suggest a focused UX improvement.",
            "Write a small component-level improvement plan."
        ],
        "commands": [
            "grep -R \"Route path\" -n dashboard | head -n 60",
            "grep -R \"fetch('/api\" -n dashboard/components | head -n 80"
        ],
        "files": ["dashboard/App.tsx", "dashboard/components/", "dashboard/components/learn/", "dashboard/components/DatabaseBrowser.tsx"],
        "tables": ["agentsam_workspace_state", "cms_themes", "cms_assets"],
        "evidence": [
            "Route-to-component map",
            "UX issue list",
            "Focused improvement plan"
        ],
    },
    {
        "n": 6,
        "module_id": "module_sebo_cloudflare_runtime",
        "title": "Cloudflare Runtime: Workers, Routes, Bindings, Wrangler, and Deployment Flow",
        "slug": "cloudflare-workers-runtime",
        "minutes": 130,
        "objective": "Understand Cloudflare Workers as the application runtime and learn how Wrangler, bindings, routes, and deployments fit together.",
        "description": "A hands-on Cloudflare runtime lesson for real Workers-based SaaS architecture.",
        "lab": [
            "Inspect wrangler config.",
            "Identify bindings for D1, R2, KV, Durable Objects, Hyperdrive, and browser services.",
            "Trace one dashboard API route from request to handler.",
            "Run a safe Wrangler inspection command.",
            "Explain how a deploy should be validated."
        ],
        "commands": [
            "npx wrangler --version",
            "grep -n \"binding\\|database_name\\|bucket_name\\|durable_objects\\|hyperdrive\" wrangler*.toml",
            "grep -R \"handleLearnApi\\|handleDashboard\" -n src worker.js | head -n 80"
        ],
        "files": ["wrangler.toml", "wrangler.production.toml", "src/index.js", "src/core/production-dispatch.js", "src/api/"],
        "tables": ["agentsam_commands", "agentsam_guardrails", "agentsam_command_run"],
        "evidence": [
            "Binding inventory",
            "Route trace",
            "Deployment validation checklist"
        ],
    },
    {
        "n": 7,
        "module_id": "module_sebo_data_storage",
        "title": "Data and Storage: D1, SQLite, R2, KV, Durable Objects, Hyperdrive, and Supabase",
        "slug": "data-storage-d1-r2-hyperdrive-supabase",
        "minutes": 150,
        "objective": "Learn the different responsibilities of relational tables, object storage, key-value state, durable sessions, and external Postgres/Supabase access.",
        "description": "A deep database/storage orientation lesson for the Inner Animal Media platform.",
        "lab": [
            "Inspect D1 schema groups.",
            "Explain when data belongs in D1 vs R2 vs KV vs Durable Objects vs Supabase.",
            "Trace a course lesson from D1 row to R2 asset.",
            "Design a simple storage plan for a new feature.",
            "Identify which operations require approval."
        ],
        "commands": [
            "npx wrangler d1 execute inneranimalmedia-business --remote --command \"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 50;\"",
            "npx wrangler r2 object list inneranimalmedia --prefix learn/ --remote"
        ],
        "files": ["docs/db/", "sql/", "src/api/database.js", "src/api/hyperdrive.js", "src/api/learn.js"],
        "tables": ["lessons", "lesson_assets", "agentsam_db_snippets", "agentsam_db_query_history", "agentsam_execution_performance_metrics"],
        "evidence": [
            "Storage responsibility matrix",
            "Course lesson asset trace",
            "Safe query/mutation checklist"
        ],
    },
    {
        "n": 8,
        "module_id": "module_sebo_ai_agents",
        "title": "AI Engineering: OpenAI, Claude, Gemini, Workers AI, Routing, Cost, and Agent Sam",
        "slug": "ai-engineering-agent-sam-routing",
        "minutes": 135,
        "objective": "Understand how modern AI applications route tasks across providers, track cost, manage model quality, and use tool calls safely.",
        "description": "A practical AI engineering lesson built around Agent Sam’s routing, model, and telemetry tables.",
        "lab": [
            "Inspect model/routing tables.",
            "Map task types to model tiers.",
            "Explain when local/fallback models are acceptable.",
            "Trace one Agent Sam run through messages, command runs, tool logs, and usage.",
            "Design a routing policy for Learn labs."
        ],
        "commands": [
            "npx wrangler d1 execute inneranimalmedia-business --remote --command \"SELECT task_type, mode, model_key, provider, priority FROM agentsam_routing_arms ORDER BY task_type, priority LIMIT 80;\"",
            "npx wrangler d1 execute inneranimalmedia-business --remote --command \"SELECT provider, model_key, is_enabled FROM agentsam_ai LIMIT 80;\""
        ],
        "files": ["src/api/agent.js", "src/api/agentsamCommandGovernance.js", "docs/db/agentsam-d1-context/agentsam_commands.md"],
        "tables": ["agentsam_ai", "agentsam_routing_arms", "agentsam_usage_events", "agentsam_analytics", "agentsam_tool_call_log"],
        "evidence": [
            "Routing matrix",
            "Cost/quality notes",
            "Agent Sam run trace"
        ],
    },
    {
        "n": 9,
        "module_id": "module_sebo_database_studio",
        "title": "Database Studio: Building an In-House D1, SQLite, Hyperdrive, and Supabase Workbench",
        "slug": "database-studio-workbench",
        "minutes": 160,
        "objective": "Design and understand the in-house database editor that replaces day-to-day D1 Studio/Supabase Studio workflows inside the dashboard.",
        "description": "A product-building lesson that turns database operations into a safe dashboard-native workflow.",
        "lab": [
            "Map the current DatabaseBrowser frontend.",
            "Identify missing tables or broken assumptions.",
            "Design canonical agentsam DB snippets and query history.",
            "Define safe read vs mutation behavior.",
            "Draft the API contract for schema browser, query runner, snippets, history, and result grid."
        ],
        "commands": [
            "grep -R \"agent_db_snippets\\|agent_db_query_history\\|DatabaseBrowser\" -n src dashboard | head -n 120",
            "npx wrangler d1 execute inneranimalmedia-business --remote --command \"PRAGMA table_info(agentsam_tool_call_log);\""
        ],
        "files": ["dashboard/components/DatabaseBrowser.tsx", "src/api/agent.js", "src/api/database.js", "src/api/hyperdrive.js"],
        "tables": ["agentsam_db_snippets", "agentsam_db_query_history", "agentsam_guardrails", "agentsam_guardrail_events"],
        "evidence": [
            "Database Studio gap map",
            "Canonical table proposal",
            "API contract draft"
        ],
    },
    {
        "n": 10,
        "module_id": "module_sebo_shipping_quality",
        "title": "Capstone: Ship, Test, Review, Measure, and Improve a Real Dashboard Feature",
        "slug": "capstone-ship-review-measure",
        "minutes": 180,
        "objective": "Complete an end-to-end feature workflow: plan, implement, test, deploy, measure, document, and review with Agent Sam.",
        "description": "The capstone lesson where learners prove they can operate the full builder workflow.",
        "lab": [
            "Pick a small dashboard improvement.",
            "Create a plan and task breakdown.",
            "Make a focused implementation.",
            "Run build/type/lint/smoke checks where available.",
            "Capture command/tool metrics.",
            "Submit evidence and request Agent Sam review."
        ],
        "commands": [
            "git status --short",
            "npm run build",
            "git diff --stat",
            "npx wrangler d1 execute inneranimalmedia-business --remote --command \"SELECT source_table, execution_count, success_count, failure_count FROM agentsam_execution_performance_metrics ORDER BY metric_date DESC LIMIT 20;\""
        ],
        "files": ["dashboard/", "src/api/", "scripts/", "docs/"],
        "tables": ["agentsam_plans", "agentsam_plan_tasks", "agentsam_command_run", "agentsam_execution_performance_metrics", "course_submissions", "course_grades"],
        "evidence": [
            "Plan ID or task list",
            "Code diff",
            "Validation output",
            "Deployment or preview URL",
            "Agent Sam feedback summary"
        ],
    },
]

def slug_to_id(slug: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", slug.lower()).strip("_")

def ensure_dirs(course_slug: str) -> None:
    for d in [
        f"learn/{course_slug}",
        f"learn/{course_slug}/lessons",
        f"learn/{course_slug}/sql",
        f"learn/{course_slug}/assets",
        f"learn/{course_slug}/assets/images",
        f"learn/{course_slug}/assets/diagrams",
        f"learn/{course_slug}/assets/starter-files",
        f"learn/{course_slug}/assets/solution-files",
        f"learn/{course_slug}/rubrics",
        f"learn/{course_slug}/qa",
        "docs/learn",
        "docs/learn/courses",
        "docs/learn/templates",
        "sql/learn",
    ]:
        Path(d).mkdir(parents=True, exist_ok=True)

def md_for_lesson(course_id: str, course_slug: str, public_base: str, lesson: dict) -> str:
    lesson_id = f"lesson_sebo_{lesson['n']:03d}_{slug_to_id(lesson['slug'])}"
    asset_base = f"{public_base}/learn/{course_slug}"

    lab = "\n".join([f"{i+1}. {x}" for i, x in enumerate(lesson["lab"])])
    commands = "\n".join(lesson["commands"])
    files = "\n".join([f"- `{x}`" for x in lesson["files"]])
    tables = "\n".join([f"- `{x}`" for x in lesson["tables"]])
    evidence = "\n".join([f"- {x}" for x in lesson["evidence"]])

    return dedent(f"""
    # {lesson['title']}

    ## Metadata

    ```yaml
    course_id: {course_id}
    module_id: {lesson['module_id']}
    lesson_id: {lesson_id}
    slug: {lesson['slug']}
    content_type: markdown
    content_url: {asset_base}/lessons/{lesson['n']:03d}_{lesson['slug']}.md
    estimated_minutes: {lesson['minutes']}
    required: true
    published: true
    ```

    ## Lesson Summary

    {lesson['description']}

    ## Objective

    {lesson['objective']}

    ## Why This Matters

    This lesson exists because real software builders need practical operating knowledge, not passive theory. The learner should leave with a clearer map of what the system is doing, what tools are involved, what files/tables/routes matter, and how to validate work safely.

    ## Concept Map

    ```txt
    Understand the concept
      -> inspect the real project
      -> run safe commands
      -> use the editor/browser/terminal
      -> capture evidence
      -> ask Agent Sam for review
      -> submit and improve
    ```

    ## Read

    Study the topic and connect it directly to the Inner Animal Media dashboard/platform.

    Key questions:

    ```txt
    What problem does this solve?
    What files or tables does it touch?
    What can break if this is done wrong?
    What commands are safe?
    What actions require approval?
    What evidence proves the work is complete?
    ```

    ## Lab

    {lab}

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    {commands}
    ```

    ## Files to Inspect or Edit

    {files}

    ## Tables to Understand

    {tables}

    ## Dashboard Tooling

    This lesson should be usable inside `/dashboard/learn` with real workspace tools:

    ```txt
    Read tab      -> markdown renderer
    Lab tab       -> checklist and guided tasks
    Editor tab    -> Monaco/editor workspace
    Browser tab   -> BrowserView/preview
    Terminal tab  -> XTermShell command cockpit
    Submit tab    -> evidence submission
    Feedback tab  -> rubric and Agent Sam review
    ```

    ## Expected Evidence

    {evidence}

    ## Agent Sam Prompts

    ```txt
    Explain this lesson in plain English.
    Help me start the lab.
    Check my command output.
    Review my evidence before I submit.
    Grade this against the rubric.
    Quiz me on the important parts.
    Give me a harder challenge.
    ```

    ## Rubric

    | Criterion | Excellent | Solid | Needs Work |
    |---|---|---|---|
    | Correctness | Work is accurate and verified. | Mostly accurate with minor gaps. | Incomplete or incorrect. |
    | Safety | Risky actions are identified and gated. | Most risky actions are handled. | Unsafe or unclear execution. |
    | Evidence | Evidence clearly proves completion. | Evidence is present but thin. | Evidence missing or weak. |
    | Understanding | Learner can explain the system. | Learner can explain pieces. | Learner is mostly copying steps. |
    | Independence | Learner can repeat the workflow. | Learner needs some help. | Learner cannot repeat without guidance. |

    ## Completion Checklist

    ```txt
    [ ] I understand the concept.
    [ ] I inspected the relevant files.
    [ ] I inspected the relevant tables or routes.
    [ ] I ran safe commands or requested approval for risky commands.
    [ ] I captured evidence.
    [ ] I asked Agent Sam for review.
    [ ] I submitted the lesson work.
    ```
    """)

def course_readme(course_title: str, course_slug: str, public_base: str) -> str:
    lesson_lines = "\n".join([f"{x['n']:03d}. {x['title']}" for x in LESSONS])
    return dedent(f"""
    # {course_title}

    Generated: {NOW}

    This course is a reusable, multi-user Software Engineering and Builder OS curriculum. It is not Connor-specific. It is the baseline course for teaching developers, operators, founders, and internal users how to build with the Inner Animal Media platform.

    ## Course Goal

    Teach the learner how modern software products are built end to end:

    ```txt
    software architecture
    terminal
    IDE/editor workflow
    Git/GitHub
    frontend/dashboard UX
    Cloudflare Workers
    D1/R2/KV/Durable Objects
    Hyperdrive/Supabase
    AI provider routing
    Agent Sam command governance
    database workbench
    testing/deploy/review loops
    ```

    ## R2 Prefix

    ```txt
    learn/{course_slug}/
    ```

    ## Public Base URL

    ```txt
    {public_base}/learn/{course_slug}/
    ```

    ## The 10 Lesson Plans

    ```txt
    {lesson_lines}
    ```

    ## Required Dashboard Behavior

    Each lesson should work as a focused session inside `/dashboard/learn`.

    ```txt
    Course Library
      -> Course Session
        -> Lesson Lab
          -> Read / Lab / Editor / Browser / Terminal / Submit / Feedback
    ```

    ## Required Data Tables

    ```txt
    lessons
    lesson_assets
    lesson_versions
    lesson_progress
    course_assignments
    course_submissions
    course_grades
    agentsam_workspace_state
    agentsam_command_run
    agentsam_tool_call_log
    agentsam_guardrail_events
    ```

    ## Build Standard

    No placeholders. No fake terminal. No fake browser. No fake editor.

    If a tab exists, it must connect to the existing Agent workspace tooling.
    """)

def course_rubric() -> str:
    return dedent("""
    # Course Rubric

    ## Mastery Criteria

    | Area | Excellent | Solid | Needs Work |
    |---|---|---|---|
    | Software map | Can explain the full app stack clearly. | Understands most layers. | Confuses major layers. |
    | Terminal | Runs and explains commands safely. | Runs common commands. | Copies commands without understanding. |
    | IDE workflow | Searches, edits, reviews, validates. | Can make focused edits. | Edits blindly. |
    | Git/GitHub | Commits cleanly and understands rollback. | Can commit and push. | Does not understand repo hygiene. |
    | Cloudflare runtime | Understands Workers, D1, R2, bindings. | Understands basics. | Cannot trace runtime behavior. |
    | Database/storage | Chooses correct storage layer. | Understands common use cases. | Mixes storage responsibilities. |
    | AI/Agent Sam | Uses routing, tools, and governance safely. | Uses Agent help productively. | Treats AI as magic. |
    | QA/shipping | Validates and provides evidence. | Runs basic checks. | Ships without proof. |
    """)

def todo() -> str:
    return dedent("""
    # Course Buildout TO-DO

    ```txt
    [ ] Upload lesson markdown files to R2.
    [ ] Apply 003_lessons.sql to D1.
    [ ] Apply 006_lesson_assets.sql to D1.
    [ ] Add lesson_versions rows after markdown stabilizes.
    [ ] Add course_assignments rows for each lesson.
    [ ] Add rubrics for each module.
    [ ] Build /dashboard/learn lesson renderer.
    [ ] Bridge Editor tab to Monaco.
    [ ] Bridge Browser tab to BrowserView.
    [ ] Bridge Terminal tab to XTermShell.
    [ ] Bridge Submit tab to course_submissions.
    [ ] Bridge Feedback tab to course_grades.
    [ ] Add admin-only curriculum editing.
    [ ] Add QA script for content_url and asset_url health.
    ```
    """)

def manifest(course_id: str, course_slug: str, course_title: str, public_base: str, bucket: str) -> str:
    data = {
        "course_id": course_id,
        "course_slug": course_slug,
        "course_title": course_title,
        "r2_bucket": bucket,
        "r2_prefix": f"learn/{course_slug}/",
        "public_base_url": f"{public_base}/learn/{course_slug}/",
        "generated_at": NOW,
        "lesson_count": len(LESSONS),
        "lessons": [
            {
                "lesson_id": f"lesson_sebo_{x['n']:03d}_{slug_to_id(x['slug'])}",
                "module_id": x["module_id"],
                "title": x["title"],
                "slug": x["slug"],
                "estimated_minutes": x["minutes"],
                "markdown_path": f"lessons/{x['n']:03d}_{x['slug']}.md",
                "content_url": f"{public_base}/learn/{course_slug}/lessons/{x['n']:03d}_{x['slug']}.md",
            }
            for x in LESSONS
        ],
    }
    return json.dumps(data, indent=2)

def sql_string(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"

def lessons_sql(course_id: str, course_slug: str, public_base: str) -> str:
    rows = []
    for x in LESSONS:
        lesson_id = f"lesson_sebo_{x['n']:03d}_{slug_to_id(x['slug'])}"
        content_url = f"{public_base}/learn/{course_slug}/lessons/{x['n']:03d}_{x['slug']}.md"
        rows.append(
            "("
            + ", ".join([
                sql_string(lesson_id),
                sql_string(x["module_id"]),
                sql_string(course_id),
                sql_string(x["title"]),
                sql_string(x["slug"]),
                sql_string(x["description"]),
                sql_string("markdown"),
                sql_string(content_url),
                "NULL",
                str(x["n"]),
                str(x["minutes"]),
                "1",
                "1",
                "unixepoch()",
                "unixepoch()",
                "unixepoch()",
            ])
            + ")"
        )

    return dedent("""
    -- 003_lessons.sql
    -- Canonical lessons seed for Software Engineering Builder OS.

    INSERT OR REPLACE INTO lessons (
      id,
      module_id,
      course_id,
      title,
      slug,
      description,
      content_type,
      content_url,
      content_text,
      order_index,
      estimated_minutes,
      is_required,
      is_published,
      published_at,
      created_at,
      updated_at
    ) VALUES
    """).strip() + "\n" + ",\n".join(rows) + ";\n"

def lesson_assets_sql(course_slug: str, bucket: str, public_base: str) -> str:
    rows = []
    for x in LESSONS:
        lesson_id = f"lesson_sebo_{x['n']:03d}_{slug_to_id(x['slug'])}"
        file_name = f"{x['n']:03d}_{x['slug']}.md"
        r2_key = f"learn/{course_slug}/lessons/{file_name}"
        asset_url = f"{public_base}/{r2_key}"
        asset_id = f"asset_sebo_{x['n']:03d}_{slug_to_id(x['slug'])}_markdown"
        rows.append(
            "("
            + ", ".join([
                sql_string(asset_id),
                sql_string(lesson_id),
                sql_string("lesson_markdown"),
                sql_string(asset_url),
                sql_string(r2_key),
                sql_string(bucket),
                sql_string(file_name),
                "NULL",
                sql_string("text/markdown"),
                str(x["n"]),
                "unixepoch()",
                "unixepoch()",
            ])
            + ")"
        )

    return dedent("""
    -- 006_lesson_assets.sql
    -- Lesson markdown asset seed for Software Engineering Builder OS.

    INSERT OR REPLACE INTO lesson_assets (
      id,
      lesson_id,
      asset_type,
      asset_url,
      r2_key,
      r2_bucket,
      file_name,
      file_size,
      mime_type,
      order_index,
      created_at,
      updated_at
    ) VALUES
    """).strip() + "\n" + ",\n".join(rows) + ";\n"

def write(path: Path, content: str, force: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not force:
        print(f"skip existing: {path}")
        return
    path.write_text(content.strip() + "\n")
    print(f"wrote: {path}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--course-id", default=DEFAULT_COURSE_ID)
    ap.add_argument("--course-slug", default=DEFAULT_COURSE_SLUG)
    ap.add_argument("--course-title", default=DEFAULT_COURSE_TITLE)
    ap.add_argument("--r2-bucket", default=DEFAULT_R2_BUCKET)
    ap.add_argument("--public-base", default=DEFAULT_PUBLIC_BASE)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    ensure_dirs(args.course_slug)

    write(Path(f"learn/{args.course_slug}/README.md"), course_readme(args.course_title, args.course_slug, args.public_base), args.force)
    write(Path(f"learn/{args.course_slug}/COURSE.md"), course_readme(args.course_title, args.course_slug, args.public_base), args.force)
    write(Path(f"learn/{args.course_slug}/RUBRIC.md"), course_rubric(), args.force)
    write(Path(f"learn/{args.course_slug}/TO-DO.md"), todo(), args.force)
    write(Path(f"learn/{args.course_slug}/manifest.json"), manifest(args.course_id, args.course_slug, args.course_title, args.public_base, args.r2_bucket), args.force)

    for x in LESSONS:
        file_name = f"{x['n']:03d}_{x['slug']}.md"
        write(Path(f"learn/{args.course_slug}/lessons/{file_name}"), md_for_lesson(args.course_id, args.course_slug, args.public_base, x), args.force)

    write(Path(f"learn/{args.course_slug}/sql/003_lessons.sql"), lessons_sql(args.course_id, args.course_slug, args.public_base), args.force)
    write(Path(f"learn/{args.course_slug}/sql/006_lesson_assets.sql"), lesson_assets_sql(args.course_slug, args.r2_bucket, args.public_base), args.force)

    write(Path("docs/learn/courses/software-engineering-builder-os.md"), course_readme(args.course_title, args.course_slug, args.public_base), args.force)

    print("")
    print("Generated 10 expansive lesson plans.")
    print("Next:")
    print(f"  find learn/{args.course_slug} -maxdepth 3 -type f | sort")
    print(f"  npx wrangler r2 object put {args.r2_bucket}/learn/{args.course_slug}/README.md --file learn/{args.course_slug}/README.md --remote")

if __name__ == "__main__":
    main()
