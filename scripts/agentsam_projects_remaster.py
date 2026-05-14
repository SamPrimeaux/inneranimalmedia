#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path.cwd()
ARTIFACT_DIR = ROOT / "artifacts" / "projects_remaster"
AUDIT_MD = ARTIFACT_DIR / "projects_remaster_audit.md"
PROMPT_MD = ARTIFACT_DIR / "projects_remaster_model_prompt.md"
PATCH_FILE = ARTIFACT_DIR / "projects_remaster.patch"
MODEL_RESPONSE = ARTIFACT_DIR / "projects_remaster_model_response.txt"
RESULT_MD = ARTIFACT_DIR / "projects_remaster_result.md"

ENV_CANDIDATES = [
    ROOT / "agentsam.local.env",
    ROOT / ".env.local",
    ROOT / ".env",
]

DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_WRANGLER_CONFIG = "wrangler.production.toml"
DEFAULT_ORIGIN = "https://inneranimalmedia.com"

TARGET_TABLES = [
    "projects",
    "workspace_projects",
    "project_goals",
    "project_costs",
    "project_metrics",
    "project_issues",
    "project_quality_summary",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_workflow_runs",
    "agentsam_usage_events",
]

TARGET_FILES = [
    "src/core/production-dispatch.js",
    "src/api/finance.js",
    "src/api/projects.js",
    "dashboard/pages/projects/ProjectManagement.tsx",
    "dashboard/api/artifacts.ts",
    "dashboard/api/projects.ts",
    "dashboard/components/projects/NewProjectModal.tsx",
    "dashboard/App.tsx",
    "package.json",
]

THEME_RED_FLAGS = [
    "bg-slate-",
    "bg-zinc-",
    "bg-neutral-",
    "bg-gray-",
    "text-slate-",
    "border-white/",
    "bg-[#",
    "background:",
    "#020617",
    "#0f172a",
    "#111827",
]

MOCK_PATTERNS = [
    r"\bconst\s+projects\s*=",
    r"\bconst\s+tasks\s*=",
    r"\bconst\s+milestones\s*=",
    r"\bconst\s+velocityData\s*=",
    r"\bconst\s+burnData\s*=",
    r"\bconst\s+workloadData\s*=",
    r"\bmock\b",
    r"\bhardcoded\b",
]


@dataclass
class CmdResult:
    ok: bool
    code: int
    stdout: str
    stderr: str
    cmd: str


def log(msg: str) -> None:
    print(msg, flush=True)


def fail(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def shell_join(cmd: list[str]) -> str:
    return " ".join(shlex.quote(x) for x in cmd)


def run_cmd(cmd: list[str], *, timeout: int = 120, check: bool = False) -> CmdResult:
    log(f"$ {shell_join(cmd)}")
    try:
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        result = CmdResult(False, 127, "", str(exc), shell_join(cmd))
        if check:
            fail(result.stderr, result.code)
        return result
    except subprocess.TimeoutExpired as exc:
        result = CmdResult(
            False,
            124,
            exc.stdout or "",
            exc.stderr or f"Timed out after {timeout}s",
            shell_join(cmd),
        )
        if check:
            fail(result.stderr, result.code)
        return result

    result = CmdResult(proc.returncode == 0, proc.returncode, proc.stdout, proc.stderr, shell_join(cmd))
    if check and not result.ok:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        fail(f"Command failed: {result.cmd}", result.code)
    return result


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue

        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()

        if not key:
            continue

        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]

        values[key] = val

    return values


def load_runtime_env() -> dict[str, str]:
    merged = dict(os.environ)

    loaded = []
    for path in ENV_CANDIDATES:
        vals = load_env_file(path)
        if vals:
            loaded.append(str(path))
            merged.update(vals)

    if loaded:
        log("Loaded env files:")
        for p in loaded:
            log(f"  - {p}")
    else:
        log("No local env file found; using process environment only.")

    return merged


def read_text(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def d1_json(sql: str, env: dict[str, str], *, timeout: int = 120) -> tuple[bool, list[dict[str, Any]], str]:
    db = env.get("IAM_D1_DB", DEFAULT_DB)
    config = env.get("IAM_WRANGLER_CONFIG", DEFAULT_WRANGLER_CONFIG)

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
        sql,
    ]
    res = run_cmd(cmd, timeout=timeout)

    if not res.ok:
        return False, [], res.stderr or res.stdout

    try:
        payload = json.loads(res.stdout)
    except json.JSONDecodeError as exc:
        return False, [], f"Could not parse wrangler JSON: {exc}\n{res.stdout[:3000]}"

    if not payload:
        return True, [], ""

    first = payload[0] if isinstance(payload, list) else payload
    rows = first.get("results", []) if isinstance(first, dict) else []
    return True, rows, ""


def table_audit(table: str, env: dict[str, str]) -> dict[str, Any]:
    safe = table.replace("'", "''")
    info: dict[str, Any] = {
        "name": table,
        "exists": False,
        "type": None,
        "row_count": None,
        "columns": [],
        "sample": [],
        "create_sql": None,
        "errors": [],
    }

    ok, rows, err = d1_json(
        f"""
SELECT name, type, sql
FROM sqlite_master
WHERE name = '{safe}'
  AND type IN ('table','view');
""",
        env,
    )
    if not ok:
        info["errors"].append(err)
        return info

    if not rows:
        return info

    info["exists"] = True
    info["type"] = rows[0].get("type")
    info["create_sql"] = rows[0].get("sql")

    ok, rows, err = d1_json(f'SELECT COUNT(*) AS count FROM "{table}";', env)
    if ok and rows:
        info["row_count"] = rows[0].get("count")
    elif err:
        info["errors"].append(err)

    ok, rows, err = d1_json(f'PRAGMA table_info("{table}");', env)
    if ok:
        info["columns"] = rows
    elif err:
        info["errors"].append(err)

    ok, rows, err = d1_json(f'SELECT * FROM "{table}" LIMIT 3;', env)
    if ok:
        info["sample"] = rows
    elif err:
        info["errors"].append(err)

    return info


def curl_status(path: str, env: dict[str, str]) -> dict[str, Any]:
    origin = env.get("IAM_PROD_ORIGIN", DEFAULT_ORIGIN).rstrip("/")
    url = f"{origin}{path}"

    res = run_cmd(["curl", "-sS", "-i", url], timeout=45)
    first = res.stdout.splitlines()[0] if res.stdout else ""
    status = None
    m = re.search(r"HTTP/\S+\s+(\d+)", first)
    if m:
        status = int(m.group(1))

    return {
        "url": url,
        "ok": res.ok,
        "status": status,
        "head": "\n".join(res.stdout.splitlines()[:40]),
        "stderr": res.stderr,
    }


def scan_file(rel: str) -> dict[str, Any]:
    text = read_text(rel)
    lines = text.splitlines()

    red_flags = []
    for idx, line in enumerate(lines, 1):
        if any(flag in line for flag in THEME_RED_FLAGS):
            red_flags.append(f"{idx}: {line.rstrip()}")

    mock_signals = []
    compiled = [re.compile(p, re.IGNORECASE) for p in MOCK_PATTERNS]
    for idx, line in enumerate(lines, 1):
        if any(p.search(line) for p in compiled):
            mock_signals.append(f"{idx}: {line.rstrip()}")

    return {
        "exists": bool(text),
        "line_count": len(lines),
        "theme_red_flags": red_flags[:100],
        "mock_signals": mock_signals[:100],
        "mentions_projects_overview": "/api/projects/overview" in text or "fetchProjectsOverview" in text,
        "mentions_new_project_modal": "NewProjectModal" in text,
    }


def route_detection() -> dict[str, Any]:
    production = read_text("src/core/production-dispatch.js")
    finance = read_text("src/api/finance.js")
    projects = read_text("src/api/projects.js")

    return {
        "production_dispatch_exists": bool(production),
        "finance_exists": bool(finance),
        "projects_api_exists": bool(projects),
        "production_mentions_api_projects": "/api/projects" in production,
        "production_mentions_handleFinanceApi": "handleFinanceApi" in finance,
        "finance_exact_projects_branch": "pathLower === '/api/projects'" in finance or 'pathLower === "/api/projects"' in finance,
        "finance_prefix_projects_branch": "startsWith('/api/projects')" in finance or 'startsWith("/api/projects")' in finance,
        "finance_has_handleProjectsRequest": "handleProjectsRequest" in finance,
        "finance_imports_handleProjectsApi": "handleProjectsApi" in finance,
        "projects_exports_handleProjectsApi": "handleProjectsApi" in projects,
    }


def col_type(table_info: dict[str, Any], column: str) -> str | None:
    for col in table_info.get("columns", []):
        if col.get("name") == column:
            return col.get("type")
    return None


def compact(value: Any, max_chars: int = 6000) -> str:
    text = json.dumps(value, indent=2, sort_keys=True, default=str)
    if len(text) > max_chars:
        return text[:max_chars] + "\n... truncated ..."
    return text


def build_audit(env: dict[str, str]) -> dict[str, Any]:
    log("Running git status...")
    git_status = run_cmd(["git", "status", "-sb"], timeout=30)

    log("Detecting route wiring...")
    routing = route_detection()

    log("Scanning frontend...")
    project_page_scan = scan_file("dashboard/pages/projects/ProjectManagement.tsx")

    log("Auditing D1 tables...")
    tables = {}
    for table in TARGET_TABLES:
        log(f"  D1: {table}")
        tables[table] = table_audit(table, env)

    log("Checking existing prod endpoints...")
    endpoints = {
        "/api/projects": curl_status("/api/projects", env),
        "/api/projects/overview": curl_status("/api/projects/overview", env),
    }

    warnings = []
    projects_id = col_type(tables.get("projects", {}), "id")
    costs_project_id = col_type(tables.get("project_costs", {}), "project_id")
    metrics_project_id = col_type(tables.get("project_metrics", {}), "project_id")

    if projects_id and costs_project_id and projects_id.upper() != costs_project_id.upper():
        warnings.append(
            f"projects.id is {projects_id}, but project_costs.project_id is {costs_project_id}; do not blindly join."
        )
    if projects_id and metrics_project_id and projects_id.upper() != metrics_project_id.upper():
        warnings.append(
            f"projects.id is {projects_id}, but project_metrics.project_id is {metrics_project_id}; do not blindly join."
        )

    file_snapshots = {}
    for rel in TARGET_FILES:
        text = read_text(rel)
        if text:
            file_snapshots[rel] = text

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(ROOT),
        "git_status": {
            "ok": git_status.ok,
            "stdout": git_status.stdout,
            "stderr": git_status.stderr,
        },
        "routing": routing,
        "project_page_scan": project_page_scan,
        "tables": tables,
        "endpoints": endpoints,
        "warnings": warnings,
        "file_snapshots": file_snapshots,
    }


def render_audit_md(audit: dict[str, Any], env: dict[str, str]) -> str:
    table_rows = []
    for name, info in audit["tables"].items():
        table_rows.append(
            f"| `{name}` | {info.get('exists')} | {info.get('type')} | {info.get('row_count')} | {len(info.get('columns') or [])} |"
        )

    endpoint_rows = []
    for path, info in audit["endpoints"].items():
        endpoint_rows.append(f"| `{path}` | `{info.get('status')}` | `{info.get('ok')}` |")

    return f"""# Agent Sam Projects Remaster Audit

Generated: `{audit["generated_at"]}`

Repo: `{audit["root"]}`  
D1: `{env.get("IAM_D1_DB", DEFAULT_DB)}`  
Wrangler config: `{env.get("IAM_WRANGLER_CONFIG", DEFAULT_WRANGLER_CONFIG)}`  
Origin: `{env.get("IAM_PROD_ORIGIN", DEFAULT_ORIGIN)}`

## Git

```txt
{audit["git_status"]["stdout"] or audit["git_status"]["stderr"]}
```

## Routing detection

```json
{compact(audit["routing"], 4000)}
```

## Project page scan

```json
{compact(audit["project_page_scan"], 8000)}
```

## D1 table summary

| Table | Exists | Type | Rows | Columns |
|-------|--------|------|------|---------|
{chr(10).join(table_rows)}

## Endpoint summary

| Endpoint | Status | Curl OK |
|----------|--------|---------|
{chr(10).join(endpoint_rows)}

## Warnings

{chr(10).join("- " + w for w in audit["warnings"]) or "- None"}

## Table schemas and samples

```json
{compact(audit["tables"], 30000)}
```
"""


def file_block(rel: str, text: str, max_chars: int = 45000) -> str:
    if len(text) > max_chars:
        return (
            f"### {rel}\n\n```txt\n{text[:max_chars]}\n... truncated because file is large ...\n```\n"
        )
    return f"### {rel}\n\n```txt\n{text}\n```\n"


def build_model_prompt(audit: dict[str, Any]) -> str:
    selected_files = []
    for rel in TARGET_FILES:
        text = audit["file_snapshots"].get(rel, "")
        if text:
            selected_files.append(file_block(rel, text))

    return f"""You are Agent Sam's repo-local Python orchestrated coding pass.

Task:
Complete Sprint C2: fully remaster /dashboard/projects end-to-end.

Output format:
Return ONLY a unified git diff patch.
Do not wrap in markdown.
Do not include commentary.
The patch must be applicable with git apply.

Repo facts:

Stack: Cloudflare Worker + D1 backend, Vite + React + React Router frontend.
Existing dashboard shell is in dashboard/App.tsx.
Existing /dashboard/projects route uses dashboard/pages/projects/ProjectManagement.tsx.
src/core/production-dispatch.js routes /api/projects* into finance handling today.
Correct architecture: add src/api/projects.js, then make src/api/finance.js delegate /api/projects* to it.
D1 is canonical.
Do not use Supabase for this page.
Do not hardcode workspace IDs, tenant IDs, user IDs, or project defaults.
Do not fabricate project data.
Empty DB states must render zero KPIs or empty states.
Preserve /dashboard/library and /dashboard/agent.

Required backend:

Add src/api/projects.js.
Export handleProjectsApi(request, url, env, ctx).
Modify src/api/finance.js so /api/projects* delegates to handleProjectsApi.
Implement:
GET /api/projects
GET /api/projects/overview
POST /api/projects
Use {{ ok: true }} envelopes for new project endpoints.
Use defensive D1 SQL.
Do not blindly join project_costs.project_id or project_metrics.project_id to projects.id.

Required /api/projects/overview shape:
{{
  "ok": true,
  "kpis": {{
    "active_projects": 0,
    "open_tasks": 0,
    "blocked": 0,
    "avg_health": 0,
    "budget_burn": 0,
    "budget_allocated": 0,
    "this_week_hours": 0
  }},
  "projects": [],
  "milestones": [],
  "workload_mix": [],
  "status_counts": [],
  "updated_at": "ISO string"
}}

Required frontend:

Add dashboard/api/projects.ts.
Add dashboard/components/projects/NewProjectModal.tsx.
Update dashboard/pages/projects/ProjectManagement.tsx.
Replace hardcoded mock arrays as production data source.
Fetch /api/projects/overview.
Wire + New Project to modal.
Submit modal to POST /api/projects.
Refetch overview after success.
Add loading, error, and empty states.
Make page scrollable.
Prevent status bar overlap.

Theme rules:
Use dashboard variables:

var(--dashboard-bg)
var(--dashboard-card)
var(--dashboard-panel)
var(--dashboard-text)
var(--dashboard-muted)
var(--dashboard-border)

Do not add page shell styling using:

bg-slate-*
bg-zinc-*
bg-neutral-*
bg-[#020617]
hardcoded chart tooltip hex backgrounds

Audit summary:

{compact({k: v for k, v in audit.items() if k != "file_snapshots"}, 50000)}

Current relevant file contents:
{chr(10).join(selected_files)}
"""


def openai_response(prompt: str, env: dict[str, str]) -> str:
    api_key = (
        env.get("OPENAI_API_KEY")
        or env.get("OPENAI_KEY")
        or env.get("AGENTSAM_OPENAI_API_KEY")
    )
    if not api_key:
        fail("Missing OPENAI_API_KEY in agentsam.local.env or process env.")

    model = env.get("OPENAI_MODEL") or env.get("AGENTSAM_OPENAI_MODEL") or DEFAULT_MODEL

    payload = {
        "model": model,
        "input": prompt,
        "max_output_tokens": int(env.get("AGENTSAM_REMASTER_MAX_OUTPUT_TOKENS", "24000")),
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    log(f"Calling OpenAI Responses API with model={model} ...")
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        fail(f"OpenAI HTTP {exc.code}: {body[:4000]}")
    except urllib.error.URLError as exc:
        fail(f"OpenAI request failed: {exc}")

    parsed = json.loads(raw)
    text = extract_response_text(parsed)

    if not text.strip():
        write_text(MODEL_RESPONSE.with_suffix(".raw.json"), raw)
        fail(f"OpenAI returned no text. Raw saved to {MODEL_RESPONSE.with_suffix('.raw.json')}")

    return text


def extract_response_text(parsed: dict[str, Any]) -> str:
    if isinstance(parsed.get("output_text"), str):
        return parsed["output_text"]

    chunks: list[str] = []

    for item in parsed.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) or []:
            if not isinstance(content, dict):
                continue
            if isinstance(content.get("text"), str):
                chunks.append(content["text"])
            elif isinstance(content.get("output_text"), str):
                chunks.append(content["output_text"])

    return "\n".join(chunks)


def clean_patch(text: str) -> str:
    s = text.strip()

    if s.startswith("```"):
        s = re.sub(r"^```(?:diff|patch)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)

    start_candidates = [
        s.find("diff --git "),
        s.find("--- a/"),
    ]
    starts = [x for x in start_candidates if x >= 0]
    if starts:
        s = s[min(starts) :]

    return s.rstrip() + "\n"


def validate_patch(patch_path: Path) -> CmdResult:
    return run_cmd(["git", "apply", "--check", str(patch_path)], timeout=120)


def repair_patch(
    bad_patch: str,
    error: str,
    audit: dict[str, Any],
    env: dict[str, str],
) -> str:
    repair_prompt = f"""The previous unified diff patch did not apply.

Return ONLY a corrected unified git diff patch.
Do not include markdown.
Do not include commentary.

git apply --check error:

{error[:8000]}

Bad patch:

{bad_patch[:30000]}

Audit summary:

{compact({k: v for k, v in audit.items() if k != "file_snapshots"}, 30000)}

"""
    return openai_response(repair_prompt, env)


def apply_patch(patch_path: Path) -> None:
    run_cmd(["git", "apply", str(patch_path)], timeout=180, check=True)


def npm_script_exists(script_name: str) -> bool:
    try:
        pkg = json.loads(read_text("package.json"))
    except Exception:
        return False
    return script_name in (pkg.get("scripts") or {})


def run_checks() -> list[tuple[str, CmdResult | None]]:
    checks: list[tuple[str, CmdResult | None]] = []

    checks.append((
        "python_compile",
        run_cmd(["python3", "-m", "py_compile", "scripts/agentsam_projects_remaster.py"], timeout=60),
    ))

    if npm_script_exists("typecheck"):
        checks.append(("npm_typecheck", run_cmd(["npm", "run", "typecheck"], timeout=300)))
    else:
        checks.append(("npm_typecheck", None))

    if npm_script_exists("build"):
        checks.append(("npm_build", run_cmd(["npm", "run", "build"], timeout=600)))
    else:
        checks.append(("npm_build", None))

    return checks


def deploy() -> CmdResult:
    if not npm_script_exists("deploy:full"):
        fail("package.json has no deploy:full script. Refusing to use raw wrangler deploy.")
    return run_cmd(["npm", "run", "deploy:full"], timeout=900)


def smoke(env: dict[str, str]) -> dict[str, Any]:
    return {
        "/api/projects": curl_status("/api/projects", env),
        "/api/projects/overview": curl_status("/api/projects/overview", env),
        "/dashboard/projects": curl_status("/dashboard/projects", env),
        "/dashboard/library": curl_status("/dashboard/library", env),
        "/dashboard/agent": curl_status("/dashboard/agent", env),
    }


def git_commit_push(do_commit: bool, do_push: bool) -> dict[str, Any]:
    result: dict[str, Any] = {}

    status_before = run_cmd(["git", "status", "-sb"], timeout=30)
    result["status_before"] = status_before.stdout or status_before.stderr

    if do_commit:
        paths = [
            "scripts/agentsam_projects_remaster.py",
            "artifacts/projects_remaster",
            "src/api/projects.js",
            "src/api/finance.js",
            "dashboard/api/projects.ts",
            "dashboard/pages/projects/ProjectManagement.tsx",
            "dashboard/components/projects/NewProjectModal.tsx",
        ]
        existing = [p for p in paths if (ROOT / p).exists()]
        run_cmd(["git", "add", *existing], timeout=60, check=True)

        staged = run_cmd(["git", "diff", "--cached", "--name-only"], timeout=30, check=True)
        result["staged"] = staged.stdout

        if not staged.stdout.strip():
            fail("Nothing staged. Refusing empty commit.")

        commit = run_cmd(
            ["git", "commit", "-m", "feat(projects): wire D1-backed project command center"],
            timeout=120,
        )
        result["commit_stdout"] = commit.stdout
        result["commit_stderr"] = commit.stderr
        result["commit_ok"] = commit.ok

        if not commit.ok:
            fail("Commit failed.")

        rev = run_cmd(["git", "rev-parse", "--short", "HEAD"], timeout=30, check=True)
        result["commit_hash"] = rev.stdout.strip()

    if do_push:
        push = run_cmd(["git", "push", "origin", "main"], timeout=240)
        result["push_stdout"] = push.stdout
        result["push_stderr"] = push.stderr
        result["push_ok"] = push.ok

        if not push.ok:
            fail("Push failed.")

    return result


def render_result(
    audit: dict[str, Any],
    patch_check: CmdResult,
    checks: list[tuple[str, CmdResult | None]] | None,
    deploy_result: CmdResult | None,
    smoke_result: dict[str, Any] | None,
    git_result: dict[str, Any] | None,
) -> str:
    check_lines = []
    if checks is not None:
        for name, res in checks:
            if res is None:
                check_lines.append(f"- {name}: SKIPPED")
            else:
                check_lines.append(f"- {name}: {'PASS' if res.ok else 'FAIL'} code={res.code}")

    smoke_lines = []
    if smoke_result:
        for path, info in smoke_result.items():
            smoke_lines.append(f"- {path}: status={info.get('status')} ok={info.get('ok')}")

    return f"""# Projects Remaster Result

Generated: {datetime.now(timezone.utc).isoformat()}

Patch validation
git apply --check: {'PASS' if patch_check.ok else 'FAIL'}
code: {patch_check.code}
{patch_check.stdout}
{patch_check.stderr}
Checks

{chr(10).join(check_lines) if check_lines else "- Not run"}

Deploy

{f"- deploy: {'PASS' if deploy_result and deploy_result.ok else 'FAIL'} code={deploy_result.code if deploy_result else 'n/a'}" if deploy_result else "- Not run"}

Smoke

{chr(10).join(smoke_lines) if smoke_lines else "- Not run"}

Git
{compact(git_result or {}, 8000)}
Audit warnings

{chr(10).join("- " + w for w in audit.get("warnings", [])) or "- None"}
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent Sam Projects C2 remaster orchestrator")
    parser.add_argument("--dry-run", action="store_true", help="Audit + generate patch only. Do not apply.")
    parser.add_argument("--apply", action="store_true", help="Apply generated patch after validation.")
    parser.add_argument("--run-checks", action="store_true", help="Run py_compile/npm checks after apply.")
    parser.add_argument("--deploy", action="store_true", help="Run npm run deploy:full after checks.")
    parser.add_argument("--commit", action="store_true", help="Stage and commit sprint files after success.")
    parser.add_argument("--push", action="store_true", help="Push main after commit.")
    parser.add_argument("--max-repairs", type=int, default=2, help="Patch repair attempts if git apply --check fails.")
    args = parser.parse_args()

    if not (ROOT / ".git").exists():
        fail("Run from repo root. .git not found.")

    if args.push and not args.commit:
        fail("--push requires --commit.")

    if args.deploy and not args.run_checks:
        fail("--deploy requires --run-checks.")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    env = load_runtime_env()

    audit = build_audit(env)
    write_text(AUDIT_MD, render_audit_md(audit, env))
    log(f"Wrote audit: {AUDIT_MD}")

    prompt = build_model_prompt(audit)
    write_text(PROMPT_MD, prompt)
    log(f"Wrote model prompt: {PROMPT_MD}")

    response = openai_response(prompt, env)
    write_text(MODEL_RESPONSE, response)
    log(f"Wrote model response: {MODEL_RESPONSE}")

    patch = clean_patch(response)
    write_text(PATCH_FILE, patch)
    log(f"Wrote patch: {PATCH_FILE}")

    patch_check = validate_patch(PATCH_FILE)
    repair_count = 0

    while not patch_check.ok and repair_count < args.max_repairs:
        repair_count += 1
        log(f"Patch failed validation. Repair attempt {repair_count}/{args.max_repairs}...")
        repaired = repair_patch(patch, patch_check.stderr or patch_check.stdout, audit, env)
        write_text(MODEL_RESPONSE.with_name(f"projects_remaster_model_response_repair_{repair_count}.txt"), repaired)
        patch = clean_patch(repaired)
        write_text(PATCH_FILE, patch)
        patch_check = validate_patch(PATCH_FILE)

    if not patch_check.ok:
        write_text(
            RESULT_MD,
            render_result(audit, patch_check, None, None, None, None),
        )
        fail(f"Patch did not validate. See {PATCH_FILE} and {RESULT_MD}")

    log("Patch validates.")

    checks: list[tuple[str, CmdResult | None]] | None = None
    deploy_result: CmdResult | None = None
    smoke_result: dict[str, Any] | None = None
    git_result: dict[str, Any] | None = None

    if args.dry_run and not args.apply:
        log("Dry run complete. Patch was generated and validated but not applied.")
        write_text(RESULT_MD, render_result(audit, patch_check, checks, deploy_result, smoke_result, git_result))
        log(f"Wrote result: {RESULT_MD}")
        return 0

    if not args.apply:
        log("No --apply provided. Stopping after validated patch generation.")
        write_text(RESULT_MD, render_result(audit, patch_check, checks, deploy_result, smoke_result, git_result))
        return 0

    apply_patch(PATCH_FILE)
    log("Patch applied.")

    if args.run_checks:
        checks = run_checks()
        failed = [name for name, res in checks if res is not None and not res.ok]
        if failed:
            write_text(RESULT_MD, render_result(audit, patch_check, checks, deploy_result, smoke_result, git_result))
            fail(f"Checks failed: {', '.join(failed)}")

    if args.deploy:
        deploy_result = deploy()
        if not deploy_result.ok:
            write_text(RESULT_MD, render_result(audit, patch_check, checks, deploy_result, smoke_result, git_result))
            fail("Deploy failed.")

        time.sleep(5)
        smoke_result = smoke(env)

    if args.commit or args.push:
        git_result = git_commit_push(args.commit, args.push)

    write_text(RESULT_MD, render_result(audit, patch_check, checks, deploy_result, smoke_result, git_result))
    log(f"Wrote result: {RESULT_MD}")
    log("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
