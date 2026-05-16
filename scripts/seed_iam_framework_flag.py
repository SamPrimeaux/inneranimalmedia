#!/usr/bin/env python3
"""
seed_iam_framework_flag.py — fixed (no .format on markdown with braces)
Run: python3 scripts/seed_iam_framework_flag.py
"""

import subprocess, json
from datetime import datetime, timezone
from pathlib import Path

DB = "inneranimalmedia-business"
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")

FRAMEWORK_MD = (
"# IAM Framework — Architectural Plan\n"
"*Authored: " + TODAY + " | Owner: Sam Primeaux | Agent: Agent Sam*\n\n"
"## Vision\n\n"
"Inner Animal Media builds its own web framework. Purpose-built rendering engine,\n"
"build pipeline, and component system designed around Cloudflare edge stack,\n"
"D1 as configuration source of truth, Agent Sam as primary builder and operator.\n\n"
"Agent Sam builds it, tests it, deploys it, evolves it — using PTY terminal,\n"
"GitHub access, Ollama for local inference, and the full MCP tool surface.\n\n"
"---\n\n"
"## Core Principles\n\n"
"1. D1 is the framework config — routes, components, templates, feature flags\n"
"   all live in D1. Changing behavior never requires a code deploy.\n"
"2. The Worker is the application server — every request hits a Cloudflare Worker.\n"
"3. Two rendering modes — server-side for public pages, React for dashboard.\n"
"4. Python is the build orchestrator — one build.py entry point, all targets.\n"
"5. Agent Sam builds Agent Sam — Ollama drafts, Workers AI embeds, power models decide.\n\n"
"---\n\n"
"## Architecture\n\n"
"### Layer 1 — Rendering Engine (Worker)\n\n"
"    Request -> Worker -> D1 (page + sections + components)\n"
"            -> renderEngine(template, data) -> HTML string\n"
"            -> Response (complete HTML, no JS required)\n\n"
"### Layer 2 — Component System (D1-driven)\n\n"
"Every component is a D1 row: html_template, css_class, props_schema,\n"
"version (semver, auto-incremented by Agent Sam), owner_agent.\n\n"
"### Layer 3 — Build Pipeline (Python)\n\n"
"    build_public()    # D1 -> render -> R2 HTML\n"
"    build_dashboard() # Vite -> dist/ -> R2\n"
"    build_worker()    # src/ -> git push -> CF Builds\n\n"
"### Layer 4 — Agentic Build Loop\n\n"
"    1. Receive task: build landing page for Pelican Peptides\n"
"    2. Query D1 for matching components\n"
"    3. Ollama drafts template + component definitions\n"
"    4. Write D1 rows via d1.write MCP tool\n"
"    5. Trigger build_public() for that page\n"
"    6. Screenshot via Browser tool\n"
"    7. Iterate until quality gate passes\n"
"    8. Commit to GitHub via github.write MCP\n"
"    9. Write record to agentsam_workflow_runs\n\n"
"---\n\n"
"## Tech Stack\n\n"
"| Layer              | Technology          |\n"
"|--------------------|---------------------|\n"
"| Edge runtime       | Cloudflare Workers  |\n"
"| Database / config  | D1 (SQLite)         |\n"
"| Static assets      | R2                  |\n"
"| Build orchestration| Python              |\n"
"| Dashboard SPA      | React + Vite        |\n"
"| Local inference    | Ollama / Qwen       |\n"
"| Embedding          | Workers AI (bge)    |\n"
"| Semantic retrieval | Vectorize           |\n"
"| Version control    | GitHub (via MCP)    |\n"
"| Terminal access    | PTY server          |\n\n"
"---\n\n"
"## Phases\n\n"
"Phase 0 Foundation: routing fixed, dist fixed, PTY verified, build.py scaffold\n"
"Phase 1 Renderer: renderEngine in Worker, cms_templates seeded, first page live\n"
"Phase 2 Components: Agent Sam CREATE/EDIT/version components, Browser quality gate\n"
"Phase 3 Build Pipeline: build.py all targets, incremental, dev server, run records\n"
"Phase 4 Agentic Loop: end-to-end page build, Ollama draft, GitHub PR, approval gate\n"
"Phase 5 Intelligence: vectorized component library, cross-client reuse, auto-improve\n\n"
"---\n\n"
"## Ollama Optimization\n\n"
"Ollama (free, local, private): template drafts, component HTML, CSS suggestions,\n"
"copy generation, code review before commit.\n\n"
"Workers AI: embedding, edge classification.\n\n"
"Power models (GPT-4o, Gemini): architecture decisions, quality gate scoring.\n\n"
"---\n\n"
"## What Makes This Different\n\n"
"Most frameworks are tools humans use. This one is a tool an AI operates.\n"
"Component system is queryable by meaning. Build pipeline triggered by Agent Sam.\n"
"Quality gate is automated. Iteration loop runs at machine speed.\n\n"
"Sam describes what he wants. Agent Sam builds it.\n"
"The framework is the infrastructure that makes that possible.\n"
)

CONFIG_JSON = json.dumps({
    "phases": [
        {"id": 0, "name": "Foundation",            "status": "in_progress"},
        {"id": 1, "name": "Renderer",              "status": "planned"},
        {"id": 2, "name": "Component System",       "status": "planned"},
        {"id": 3, "name": "Build Pipeline",         "status": "planned"},
        {"id": 4, "name": "Agentic Loop",           "status": "planned"},
        {"id": 5, "name": "Framework Intelligence", "status": "planned"},
    ],
    "tech_stack": {
        "edge_runtime": "cloudflare_workers", "database": "d1",
        "static_assets": "r2", "build_tool": "python",
        "dashboard": "react_vite", "local_inference": "ollama_qwen",
        "embedding": "workers_ai_bge", "retrieval": "vectorize",
        "vcs": "github", "terminal": "pty_server",
    },
    "primary_builder": "agent_sam",
    "ollama_tasks": ["template_draft","component_html","css_suggestions","copy_gen","code_review"],
    "human_touchpoints": ["pr_review","production_deploy_approval"],
    "r2_md_key": "agentsam/framework/iam_framework_plan.md",
})

TAGS = json.dumps(["framework","build-tool","agentic","ollama","renderer","components","python"])

def d1(sql):
    r = subprocess.run(
        ["wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True, timeout=30
    )
    raw = r.stdout.strip()
    if r.returncode != 0:
        print(f"\n  ERR: {r.stderr.strip()[:200] or raw[:200]}")
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, list) and data:
            if data[0].get("success") is False:
                print(f"\n  D1 ERR: {data[0].get('error','')}")
                return None
            return data[0].get("results", [])
        return []
    except Exception as ex:
        print(f"\n  JSON ERR: {ex}")
        return None

def e(s): return str(s).replace("'","''")
def run(label, sql):
    print(f"  {label}...", end=" ", flush=True)
    r = d1(sql.strip())
    print("OK" if r is not None else "FAILED")
    return r

def main():
    print("="*60)
    print("  seed_iam_framework_flag.py")
    print("="*60)

    print("\n[1] agentsam_feature_flag")
    run("iam_custom_framework", f"""
INSERT INTO agentsam_feature_flag (
  flag_key, description, enabled_globally, config_json,
  flag_type, environment, tags, created_by, rollout_pct, is_archived
) VALUES (
  'iam_custom_framework',
  'IAM custom web framework — Agent Sam builds its own rendering engine, build pipeline, and component system. D1-driven, Worker-rendered, Python-orchestrated.',
  0, '{e(CONFIG_JSON)}', 'feature', 'all', '{e(TAGS)}', 'sam_primeaux', 0, 0
) ON CONFLICT(flag_key) DO UPDATE SET
  config_json = excluded.config_json, tags = excluded.tags,
  updated_at = datetime('now');
""")

    print("\n[2] agentsam_plans")
    plan_id = f"plan_iam_framework_{TODAY.replace('-','')}"
    run("plan", f"""
INSERT INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  morning_brief, tasks_total, risk_level, default_model
) VALUES (
  '{plan_id}', 'iam', 'agentsam', '{TODAY}', 'feature',
  'IAM Custom Framework — Agent Sam Builds Its Own Build Tool', 'active',
  'Agent Sam designs and builds a purpose-built web framework. D1-driven component system, Worker-side renderer, Python build pipeline. Ollama handles local drafting. Agent Sam operates the full build loop.',
  18, 'high', 'gpt-4o'
) ON CONFLICT(id) DO UPDATE SET status=''active'', updated_at=unixepoch();
""")

    tasks = [
        ("P0","infra",   "Verify Agent Sam PTY write access — run test command via terminal tool"),
        ("P0","backend", "Scaffold build.py with three targets: build_public, build_dashboard, build_worker"),
        ("P0","db",      "Seed cms_templates with base layout templates (html_shell, hero, text, cta)"),
        ("P0","db",      "Seed cms_components with first 5 components from existing IAM pages"),
        ("P1","backend", "Build renderEngine() in Worker — D1 page+sections+components -> HTML string"),
        ("P1","backend", "Wire renderEngine to Worker: GET /slug -> server-rendered HTML if cms_pages row exists"),
        ("P1","infra",   "First server-rendered page live — Pelican Peptides or IAM marketing page"),
        ("P1","backend", "Incremental build: only re-render pages where updated_at > last_built_at"),
        ("P2","backend", "Agent Sam CREATE component via chat — Ollama drafts, writes D1 row, triggers build"),
        ("P2","backend", "Agent Sam EDIT component — diff-aware, bumps version, screenshots via Browser tool"),
        ("P2","db",      "Component versioning — semver auto-increment on every Agent Sam edit"),
        ("P2","backend", "Quality gate — Browser screenshot + Workers AI score, iterate max 3 rounds"),
        ("P3","backend", "Agent Sam GitHub workflow — branch, commit, push, open PR via github.write MCP"),
        ("P3","backend", "Dev server — Python + wrangler dev, file watch, hot reload"),
        ("P3","backend", "Build records — agentsam_workflow_runs row for every build with cost + outcome"),
        ("P4","backend", "End-to-end agentic loop: Sam describes page -> Agent Sam builds -> ships"),
        ("P4","backend", "Component library vectorized — semantic search by description"),
        ("P4","backend", "Cross-client component reuse — Agent Sam suggests similar components"),
    ]

    print("\n[3] agentsam_plan_tasks")
    for i, (priority, category, title) in enumerate(tasks, 1):
        run(f"  task {i:02d}", f"""
INSERT INTO agentsam_plan_tasks (
  plan_id, tenant_id, workspace_id, order_index, title, priority, category, status
) VALUES (
  '{plan_id}', 'iam', 'agentsam', {i}, '{e(title)}', '{priority}', '{category}', 'todo'
) ON CONFLICT DO NOTHING;
""")

    print("\n[4] Writing .md")
    out = Path("/tmp/iam_framework.md")
    out.write_text(FRAMEWORK_MD)
    print(f"  {out} ({len(FRAMEWORK_MD):,} chars)")

    print("\n  Upload to R2:")
    print("  wrangler r2 object put inneranimalmedia/agentsam/framework/iam_framework_plan.md \\")
    print("    --file=/tmp/iam_framework.md --remote")
    print("\n  Then fix selectAutoModel import:")
    print("  grep -n \"from '../core/routing.js'\" src/api/agent.js")
    print("="*60)

if __name__ == "__main__":
    main()
