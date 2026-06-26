#!/usr/bin/env python3
"""
Agent Sam Python Operator Cockpit

A dependency-light CLI for saving model spend by inspecting, narrowing,
exporting, and validating platform state before expensive code-generation calls.

Run from repo root:

  python3 tools_py/iam_cli.py commands doctor
  python3 tools_py/iam_cli.py commands export
  python3 tools_py/iam_cli.py commands pollution
  python3 tools_py/iam_cli.py context pack "fix command-run pollution"
  python3 tools_py/iam_cli.py costs report --last 7d
  python3 tools_py/iam_cli.py proto mobile command-palette
  python3 tools_py/iam_cli.py verify patch

This file intentionally uses only Python stdlib so it can run on a clean repo.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
DEFAULT_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
ARTIFACTS = ROOT / "artifacts" / "operator_cockpit"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = val


def load_default_env() -> None:
    for rel in (".env.cloudflare", ".env.agentsam.local", ".env.local"):
        load_env_file(ROOT / rel)


@dataclass
class D1Config:
    db: str = DEFAULT_DB
    config: str = DEFAULT_CONFIG
    remote: bool = True
    with_env: bool = True


def run(cmd: list[str], *, timeout: int = 180, cwd: Path = ROOT, check: bool = False) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr or proc.stdout}")
    return proc


def d1_command(sql: str, cfg: D1Config, *, json_mode: bool = True) -> list[str]:
    cmd = ["npx", "wrangler", "d1", "execute", cfg.db]
    if cfg.remote:
        cmd.append("--remote")
    if cfg.config:
        cmd += ["-c", cfg.config]
    if json_mode:
        cmd.append("--json")
    cmd += ["--command", sql]
    wrapper = ROOT / "scripts" / "with-cloudflare-env.sh"
    if cfg.with_env and wrapper.exists():
        return [str(wrapper), *cmd]
    return cmd


def strip_json(stdout: str) -> str:
    s = stdout.strip()
    if not s:
        return s
    if s.startswith("[") or s.startswith("{"):
        return s
    starts = [i for i in (s.find("["), s.find("{")) if i >= 0]
    return s[min(starts):].strip() if starts else s


def d1_query(sql: str, cfg: D1Config) -> list[dict[str, Any]]:
    proc = run(d1_command(sql, cfg), timeout=180)
    if proc.returncode != 0:
        return [{"__error__": proc.stderr.strip() or proc.stdout.strip(), "sql": sql}]
    try:
        payload = json.loads(strip_json(proc.stdout))
    except Exception as exc:
        return [{"__error__": f"JSON parse failed: {exc}", "stdout": proc.stdout[:4000], "sql": sql}]
    if isinstance(payload, list) and payload and isinstance(payload[0], dict) and "results" in payload[0]:
        return payload[0].get("results") or []
    if isinstance(payload, dict) and "results" in payload:
        return payload.get("results") or []
    if isinstance(payload, list):
        return payload
    return []


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    path.write_text(text, encoding="utf-8")


def md_escape(v: Any) -> str:
    s = "" if v is None else str(v)
    return s.replace("|", "\\|").replace("\n", " ")


def md_table(rows: list[dict[str, Any]], headers: list[str] | None = None) -> str:
    if not rows:
        return "_No rows._"
    headers = headers or list(rows[0].keys())
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        out.append("| " + " | ".join(md_escape(row.get(h)) for h in headers) + " |")
    return "\n".join(out)


def print_paths(paths: Iterable[Path]) -> None:
    for path in paths:
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)


def cfg_from_args(args: argparse.Namespace) -> D1Config:
    return D1Config(
        db=getattr(args, "db", DEFAULT_DB),
        config=getattr(args, "config", DEFAULT_CONFIG),
        remote=not getattr(args, "local", False),
        with_env=not getattr(args, "no_env_wrapper", False),
    )


COMMAND_DOCTOR_QUERIES: dict[str, str] = {
    "registry_summary": """
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN COALESCE(is_active, 1) = 1 THEN 1 ELSE 0 END) AS active,
  SUM(CASE WHEN COALESCE(is_active, 1) = 1 AND (slug IS NULL OR slug = '') THEN 1 ELSE 0 END) AS active_missing_slug,
  SUM(CASE WHEN COALESCE(is_active, 1) = 1 AND (mapped_command IS NULL OR mapped_command = '') THEN 1 ELSE 0 END) AS active_missing_mapped_command,
  SUM(CASE WHEN COALESCE(is_active, 1) = 1 AND risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS active_high_or_critical,
  SUM(CASE WHEN COALESCE(is_active, 1) = 1 AND (requires_approval = 1 OR requires_confirmation = 1) THEN 1 ELSE 0 END) AS active_approval_or_confirmation
FROM agentsam_commands;
""",
    "duplicate_active_slugs": """
SELECT workspace_id, slug, COUNT(*) AS n
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
GROUP BY workspace_id, slug
HAVING COUNT(*) > 1
ORDER BY n DESC, workspace_id, slug;
""",
    "missing_executor_targets": """
SELECT id, slug, router_type, tool_key, workflow_key, mapped_command, risk_level
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
AND (
  (router_type = 'tool' AND COALESCE(tool_key, '') = '')
  OR (router_type = 'workflow' AND COALESCE(workflow_key, '') = '')
  OR (router_type = 'script' AND COALESCE(tool_key, slug, '') = '')
)
ORDER BY router_type, slug;
""",
    "risky_without_gate": """
SELECT id, slug, display_name, risk_level, requires_confirmation, requires_approval, mapped_command
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
AND risk_level IN ('high', 'critical')
AND COALESCE(requires_confirmation, 0) = 0
AND COALESCE(requires_approval, 0) = 0
ORDER BY risk_level DESC, slug;
""",
    "visible_without_description": """
SELECT id, slug, display_name, category, risk_level
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
AND COALESCE(show_in_palette, 1) = 1
AND COALESCE(description, '') = ''
ORDER BY category, slug
LIMIT 100;
""",
    "workflow_target_missing": """
SELECT c.id, c.slug, c.workflow_key, c.display_name
FROM agentsam_commands c
LEFT JOIN agentsam_workflows w
  ON w.workflow_key = c.workflow_key
 AND COALESCE(w.is_active, 1) = 1
WHERE COALESCE(c.is_active, 1) = 1
  AND c.router_type = 'workflow'
  AND w.workflow_key IS NULL
ORDER BY c.slug;
""",
    "top_failing_commands": """
SELECT id, slug, display_name, risk_level, use_count, success_count, failure_count, avg_duration_ms
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
  AND COALESCE(failure_count, 0) > 0
ORDER BY failure_count DESC, use_count DESC
LIMIT 25;
""",
    "top_slow_commands": """
SELECT id, slug, display_name, risk_level, use_count, avg_duration_ms
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
  AND COALESCE(avg_duration_ms, 0) > 0
ORDER BY avg_duration_ms DESC
LIMIT 25;
""",
}


POLLUTION_QUERY = """
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN commands_json IS NULL OR commands_json = '[]' THEN 1 ELSE 0 END) AS empty_commands_json,
  SUM(CASE WHEN selected_command_id IS NULL AND selected_command_slug IS NULL THEN 1 ELSE 0 END) AS no_selected_command,
  SUM(CASE WHEN intent_category IS NULL OR intent_category = 'misc' THEN 1 ELSE 0 END) AS null_or_misc_intent,
  SUM(CASE WHEN approval_status = 'not_required' THEN 1 ELSE 0 END) AS not_required_approval,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS success_zero
FROM agentsam_command_run;
"""


RECENT_SUSPICIOUS_RUNS_QUERY = """
SELECT
  id,
  substr(user_input, 1, 140) AS user_input_preview,
  intent_category,
  commands_json,
  selected_command_id,
  selected_command_slug,
  risk_level,
  requires_confirmation,
  approval_status,
  success,
  exit_code,
  created_at
FROM agentsam_command_run
WHERE selected_command_id IS NULL
   OR selected_command_slug IS NULL
   OR commands_json IS NULL
   OR commands_json = '[]'
ORDER BY created_at DESC
LIMIT 50;
"""


def commands_doctor(args: argparse.Namespace) -> int:
    load_default_env()
    cfg = cfg_from_args(args)
    stamp = utc_stamp()
    out_dir = ARTIFACTS / "commands" / stamp
    diagnostics: dict[str, Any] = {}
    for name, sql in COMMAND_DOCTOR_QUERIES.items():
        diagnostics[name] = d1_query(sql, cfg)
    diagnostics["command_run_pollution_summary"] = d1_query(POLLUTION_QUERY, cfg)
    diagnostics["recent_suspicious_command_runs"] = d1_query(RECENT_SUSPICIOUS_RUNS_QUERY, cfg)

    report = {
        "generated_at": stamp,
        "db": cfg.db,
        "config": cfg.config,
        "remote": cfg.remote,
        "diagnostics": diagnostics,
    }
    json_path = out_dir / "commands-doctor.json"
    md_path = out_dir / "commands-doctor.md"
    write_json(json_path, report)

    lines = [
        "# Agent Sam Commands Doctor",
        "",
        f"Generated: `{stamp}`",
        f"DB: `{cfg.db}` remote=`{cfg.remote}`",
        "",
        "## Doctrine",
        "",
        "```text",
        "agentsam_commands = canonical command/action/capability registry",
        "agentsam_command_run = actual command/tool/workflow/script proposal or execution ledger",
        "Plain chat must not create command_run rows.",
        "```",
        "",
    ]
    for name, rows in diagnostics.items():
        lines.append(f"## {name.replace('_', ' ').title()}")
        lines.append("")
        lines.append(md_table(rows if isinstance(rows, list) else []))
        lines.append("")
    write_text(md_path, "\n".join(lines))

    print("Wrote:")
    print_paths([md_path, json_path])
    return 0


def commands_export(args: argparse.Namespace) -> int:
    load_default_env()
    cfg = cfg_from_args(args)
    stamp = utc_stamp()
    out_dir = ARTIFACTS / "commands" / stamp
    commands = d1_query(
        """
SELECT
  id, workspace_id, tenant_id, slug, display_name, description, mapped_command,
  command_args, category, subcategory, task_type, risk_level,
  requires_confirmation, requires_approval, show_in_palette, timeout_seconds,
  estimated_cost_usd, allowed_models_json, retry_policy, router_type,
  tool_key, workflow_key, subagent_slug, server_key, execution_mode,
  is_global, route_key, use_count, success_count, failure_count, avg_duration_ms,
  last_used_at
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
ORDER BY category, subcategory, risk_level, slug;
""",
        cfg,
    )
    summary = d1_query(
        """
SELECT
  COALESCE(category, 'uncategorized') AS category,
  COALESCE(subcategory, 'general') AS subcategory,
  COALESCE(router_type, 'unknown') AS router_type,
  COALESCE(task_type, 'unknown') AS task_type,
  COALESCE(risk_level, 'unknown') AS risk_level,
  requires_confirmation,
  requires_approval,
  COUNT(*) AS command_count
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
GROUP BY category, subcategory, router_type, task_type, risk_level, requires_confirmation, requires_approval
ORDER BY category, subcategory, risk_level;
""",
        cfg,
    )
    json_path = out_dir / "agentsam_commands.json"
    summary_path = out_dir / "agentsam_commands_summary.json"
    md_path = out_dir / "agentsam_commands_catalog.md"
    write_json(json_path, commands)
    write_json(summary_path, summary)

    groups: dict[str, list[dict[str, Any]]] = {}
    for cmd in commands:
        key = f"{cmd.get('category') or 'uncategorized'}/{cmd.get('subcategory') or 'general'}"
        groups.setdefault(key, []).append(cmd)

    lines = ["# Agent Sam Command Catalog", "", f"Generated: `{stamp}`", f"Total active commands: `{len(commands)}`", "", "## Summary", "", md_table(summary), "", "## Commands By Group", ""]
    for group in sorted(groups):
        lines.append(f"### {group}")
        lines.append("")
        for cmd in groups[group]:
            lines.append(f"#### {cmd.get('slug')} — {cmd.get('display_name')}")
            lines.append(f"- id: `{cmd.get('id')}`")
            lines.append(f"- risk: `{cmd.get('risk_level')}` approval=`{cmd.get('requires_approval')}` confirmation=`{cmd.get('requires_confirmation')}`")
            lines.append(f"- router: `{cmd.get('router_type')}` tool=`{cmd.get('tool_key')}` workflow=`{cmd.get('workflow_key')}` route=`{cmd.get('route_key')}`")
            lines.append(f"- mapped_command: `{cmd.get('mapped_command')}`")
            if cmd.get("description"):
                lines.append(f"- description: {cmd.get('description')}")
            lines.append("")
    write_text(md_path, "\n".join(lines))
    print("Wrote:")
    print_paths([md_path, json_path, summary_path])
    return 0


def commands_pollution(args: argparse.Namespace) -> int:
    load_default_env()
    cfg = cfg_from_args(args)
    stamp = utc_stamp()
    out_dir = ARTIFACTS / "commands" / stamp
    summary = d1_query(POLLUTION_QUERY, cfg)
    recent = d1_query(RECENT_SUSPICIOUS_RUNS_QUERY, cfg)
    payload = {"generated_at": stamp, "summary": summary, "recent_suspicious_rows": recent}
    json_path = out_dir / "command-run-pollution.json"
    md_path = out_dir / "command-run-pollution.md"
    write_json(json_path, payload)
    write_text(md_path, "\n".join([
        "# Agent Sam Command Run Pollution Audit",
        "",
        f"Generated: `{stamp}`",
        "",
        "## Summary",
        "",
        md_table(summary),
        "",
        "## Recent Suspicious Rows",
        "",
        md_table(recent),
        "",
        "## Rule",
        "",
        "```text",
        "No selected command, no command_run row.",
        "Plain chat must not create agentsam_command_run rows.",
        "```",
    ]))
    print("Wrote:")
    print_paths([md_path, json_path])
    return 0


def collect_candidate_files(query: str, limit: int = 24) -> list[Path]:
    tokens = [t.lower() for t in re.findall(r"[a-zA-Z0-9_./:-]{3,}", query)]
    priority_terms = tokens + ["agentsam_commands", "agentsam_command_run", "command", "approval", "dispatch"]
    exts = {".js", ".mjs", ".ts", ".tsx", ".py", ".sql", ".md", ".json", ".toml"}
    roots = [ROOT / p for p in ("src", "dashboard", "scripts", "migrations", "docs", "tools_py") if (ROOT / p).exists()]
    scored: list[tuple[int, Path]] = []
    for root in roots:
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in exts:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore").lower()
            except Exception:
                continue
            hay = f"{path.as_posix().lower()}\n{text[:200000]}"
            score = sum(1 for term in priority_terms if term and term in hay)
            if score:
                scored.append((score, path))
    scored.sort(key=lambda x: (-x[0], str(x[1])))
    return [p for _, p in scored[:limit]]


def excerpt_file(path: Path, terms: list[str], max_lines: int = 120) -> str:
    rel = path.relative_to(ROOT)
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception as exc:
        return f"## {rel}\n\nCould not read: {exc}\n"
    hits: list[int] = []
    lower_terms = [t.lower() for t in terms if len(t) >= 3]
    for i, line in enumerate(lines):
        low = line.lower()
        if any(t in low for t in lower_terms):
            hits.append(i)
    selected: list[int] = []
    if hits:
        for hit in hits[:20]:
            selected.extend(range(max(0, hit - 4), min(len(lines), hit + 8)))
    else:
        selected.extend(range(min(len(lines), 60)))
    selected = sorted(set(selected))[:max_lines]
    body = "\n".join(f"{i+1}: {lines[i]}" for i in selected)
    return f"## {rel}\n\n```text\n{body}\n```\n"


def context_pack(args: argparse.Namespace) -> int:
    stamp = utc_stamp()
    query = args.query
    terms = re.findall(r"[a-zA-Z0-9_./:-]{3,}", query)
    files = collect_candidate_files(query, limit=args.limit)
    out_dir = ARTIFACTS / "context_packs"
    safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", query.lower()).strip("-")[:60] or "context"
    md_path = out_dir / f"{stamp}-{safe_name}.md"
    lines = [
        "# Agent Sam Context Pack",
        "",
        f"Generated: `{stamp}`",
        f"Task: `{query}`",
        "",
        "## Use This With A Coding Model",
        "",
        "```text",
        "Patch only the files needed for this task.",
        "Do not broaden scope without evidence from this pack.",
        "Prefer small, reviewable changes.",
        "Run the relevant doctor/smoke command after patching.",
        "```",
        "",
        "## Candidate Files",
        "",
    ]
    for path in files:
        lines.append(f"- `{path.relative_to(ROOT)}`")
    lines.append("")
    lines.append("## Excerpts")
    lines.append("")
    for path in files:
        lines.append(excerpt_file(path, terms))
        lines.append("")
    write_text(md_path, "\n".join(lines))
    print("Wrote:")
    print_paths([md_path])
    return 0


def costs_report(args: argparse.Namespace) -> int:
    load_default_env()
    cfg = cfg_from_args(args)
    stamp = utc_stamp()
    out_dir = ARTIFACTS / "costs" / stamp
    interval = args.last
    where = "created_at >= datetime('now', ?)"
    param = f"-{interval}"
    # D1 CLI does not bind params here; safely constrain accepted interval format.
    if not re.fullmatch(r"\d+[dhm]", interval):
        raise SystemExit("--last must look like 24h, 7d, or 60m")
    sqlite_modifier = f"-{interval[:-1]} {'days' if interval.endswith('d') else 'hours' if interval.endswith('h') else 'minutes'}"
    base_where = f"created_at >= datetime('now', '{sqlite_modifier}')"
    queries = {
        "by_model": f"""
SELECT provider, model, model_key, COUNT(*) AS n,
       ROUND(SUM(COALESCE(cost_usd, 0)), 6) AS cost_usd,
       SUM(COALESCE(tokens_in, 0)) AS tokens_in,
       SUM(COALESCE(tokens_out, 0)) AS tokens_out,
       ROUND(AVG(COALESCE(duration_ms, 0)), 1) AS avg_duration_ms
FROM agentsam_usage_events
WHERE {base_where}
GROUP BY provider, model, model_key
ORDER BY cost_usd DESC
LIMIT 50;
""",
        "by_tool": f"""
SELECT COALESCE(tool_name, 'unknown') AS tool_name, COUNT(*) AS n,
       ROUND(SUM(COALESCE(cost_usd, 0)), 6) AS cost_usd,
       ROUND(AVG(COALESCE(duration_ms, 0)), 1) AS avg_duration_ms
FROM agentsam_usage_events
WHERE {base_where}
GROUP BY tool_name
ORDER BY cost_usd DESC
LIMIT 50;
""",
        "failed_cost": f"""
SELECT COALESCE(status, 'unknown') AS status, COALESCE(tool_name, 'unknown') AS tool_name,
       COALESCE(model, model_key, 'unknown') AS model, COUNT(*) AS n,
       ROUND(SUM(COALESCE(cost_usd, 0)), 6) AS cost_usd
FROM agentsam_usage_events
WHERE {base_where}
  AND LOWER(COALESCE(status, '')) NOT IN ('ok', 'success', 'succeeded')
GROUP BY status, tool_name, model
ORDER BY cost_usd DESC
LIMIT 50;
""",
    }
    data = {name: d1_query(sql, cfg) for name, sql in queries.items()}
    json_path = out_dir / "cost-report.json"
    md_path = out_dir / "cost-report.md"
    write_json(json_path, {"generated_at": stamp, "last": interval, "data": data})
    lines = ["# Agent Sam Cost Report", "", f"Generated: `{stamp}`", f"Window: `{interval}`", ""]
    for name, rows in data.items():
        lines.append(f"## {name.replace('_', ' ').title()}")
        lines.append("")
        lines.append(md_table(rows))
        lines.append("")
    write_text(md_path, "\n".join(lines))
    print("Wrote:")
    print_paths([md_path, json_path])
    return 0


def proto_mobile(args: argparse.Namespace) -> int:
    name = re.sub(r"[^a-zA-Z0-9_-]+", "-", args.name.lower()).strip("-") or "prototype"
    out_dir = ROOT / "prototypes" / name
    ensure_dir(out_dir)
    index = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" />
  <title>{args.name} Prototype</title>
  <link rel=\"stylesheet\" href=\"./styles.css\" />
</head>
<body>
  <main class=\"phone\" aria-label=\"iPhone 13 Pro prototype frame\">
    <header class=\"topbar\">
      <div>
        <p class=\"eyebrow\">Agent Sam Prototype</p>
        <h1>{args.name}</h1>
      </div>
      <button class=\"pill\">Review</button>
    </header>

    <section class=\"search\">
      <input value=\"command doctor\" aria-label=\"Command search\" />
    </section>

    <section class=\"stack\" id=\"cards\"></section>

    <footer class=\"dock\">
      <button>Safe Read</button>
      <button>Mutation</button>
      <button>Danger</button>
    </footer>
  </main>

  <script type=\"module\">
    const data = await fetch('./mock-data.json').then(r => r.json());
    const cards = document.querySelector('#cards');
    cards.innerHTML = data.commands.map(cmd => `
      <article class=\"card ${'{'}cmd.risk{'}'}\">
        <div>
          <p class=\"eyebrow\">${'{'}cmd.group{'}'}</p>
          <h2>${'{'}cmd.name{'}'}</h2>
          <p>${'{'}cmd.description{'}'}</p>
        </div>
        <span>${'{'}cmd.risk{'}'}</span>
      </article>
    `).join('');
  </script>
</body>
</html>
"""
    styles = """:root {
  color-scheme: dark;
  --bg: #0d0d10;
  --panel: rgba(255,255,255,.075);
  --panel-strong: rgba(255,255,255,.12);
  --border: rgba(255,255,255,.12);
  --text: #f6f7fb;
  --muted: #a9afc2;
  --accent: #5a7df7;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 20% 0%, rgba(90,125,247,.22), transparent 32rem),
    linear-gradient(180deg, #111119, #08080b);
  color: var(--text);
}
.phone {
  width: min(390px, 100vw);
  min-height: min(844px, 100vh);
  padding: max(18px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 14px;
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
  border: 1px solid var(--border);
  box-shadow: 0 24px 80px rgba(0,0,0,.45);
}
.topbar, .card, .dock, .search input {
  border: 1px solid var(--border);
  background: var(--panel);
  backdrop-filter: blur(22px);
  border-radius: 24px;
}
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px; }
h1, h2, p { margin: 0; }
h1 { font-size: 22px; letter-spacing: -.04em; }
h2 { font-size: 16px; letter-spacing: -.02em; }
.eyebrow { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 6px; }
.pill { border: 0; color: var(--text); background: var(--accent); border-radius: 999px; padding: 9px 12px; }
.search input { width: 100%; color: var(--text); padding: 14px 16px; font: inherit; outline: none; }
.stack { display: flex; flex-direction: column; gap: 12px; overflow: auto; padding-bottom: 8px; }
.card { padding: 16px; display: flex; justify-content: space-between; gap: 16px; }
.card p:not(.eyebrow) { color: var(--muted); margin-top: 6px; line-height: 1.35; }
.card span { align-self: flex-start; border: 1px solid var(--border); border-radius: 999px; padding: 5px 8px; font-size: 12px; }
.card.critical { border-color: rgba(255,100,100,.55); }
.card.high { border-color: rgba(255,180,90,.55); }
.card.low { border-color: rgba(90,125,247,.45); }
.dock { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 8px; }
.dock button { border: 0; border-radius: 16px; padding: 11px 8px; background: var(--panel-strong); color: var(--text); }
"""
    mock = {
        "commands": [
            {"group": "Safe Read", "name": "/d1-list", "risk": "low", "description": "Inspect D1 databases without mutation."},
            {"group": "Mutation", "name": "cms-theme-audit", "risk": "medium", "description": "Run a controlled CMS theme audit and produce a report."},
            {"group": "Danger Zone", "name": "/r2-bucket-delete", "risk": "critical", "description": "Destructive action. Approval required before execution."},
        ]
    }
    write_text(out_dir / "index.html", index)
    write_text(out_dir / "styles.css", styles)
    write_json(out_dir / "mock-data.json", mock)
    print("Wrote prototype:")
    print_paths([out_dir / "index.html", out_dir / "styles.css", out_dir / "mock-data.json"])
    return 0


def verify_patch(args: argparse.Namespace) -> int:
    checks = [
        ["npm", "run", "build:vite-only"],
        ["python3", "tools_py/iam_cli.py", "commands", "doctor"],
    ]
    if args.quick:
        checks = [["python3", "-m", "py_compile", "tools_py/iam_cli.py"]]
    failures = []
    for cmd in checks:
        print(f"\n$ {' '.join(cmd)}")
        proc = run(cmd, timeout=args.timeout)
        print(proc.stdout[-4000:])
        if proc.returncode != 0:
            print(proc.stderr[-4000:])
            failures.append({"cmd": cmd, "returncode": proc.returncode})
            if not args.keep_going:
                break
    if failures:
        print(f"\nFAILED {len(failures)} check(s)")
        return 1
    print("\nAll selected checks passed.")
    return 0


def smoke_command_pipeline(args: argparse.Namespace) -> int:
    script = ROOT / "scripts" / "smoke" / "smoke_command_pipeline.py"
    if not script.exists():
        print(f"Missing {script.relative_to(ROOT)}")
        return 1
    if not args.write:
        print("Refusing to run write smoke by default.")
        print("Run with --write to execute scripts/smoke/smoke_command_pipeline.py against D1.")
        return 0
    proc = run(["python3", str(script)], timeout=args.timeout)
    print(proc.stdout)
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
    return proc.returncode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="iam", description="Agent Sam Python Operator Cockpit")
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--local", action="store_true", help="Use local D1 instead of --remote")
    parser.add_argument("--no-env-wrapper", action="store_true", help="Do not prefix wrangler with scripts/with-cloudflare-env.sh")
    sub = parser.add_subparsers(dest="area", required=True)

    commands = sub.add_parser("commands", help="Audit/export/smoke Agent Sam command fabric")
    csub = commands.add_subparsers(dest="command_action", required=True)
    csub.add_parser("doctor", help="Run command registry + pollution diagnostics").set_defaults(func=commands_doctor)
    csub.add_parser("export", help="Export active command catalog").set_defaults(func=commands_export)
    csub.add_parser("pollution", help="Audit command_run pollution only").set_defaults(func=commands_pollution)
    smoke = csub.add_parser("smoke", help="Run command pipeline smoke; write-gated")
    smoke.add_argument("--write", action="store_true")
    smoke.add_argument("--timeout", type=int, default=240)
    smoke.set_defaults(func=smoke_command_pipeline)

    context = sub.add_parser("context", help="Build focused context packs for coding models")
    ctxsub = context.add_subparsers(dest="context_action", required=True)
    pack = ctxsub.add_parser("pack", help="Create a narrowed Markdown context pack")
    pack.add_argument("query")
    pack.add_argument("--limit", type=int, default=24)
    pack.set_defaults(func=context_pack)

    costs = sub.add_parser("costs", help="Report model/tool spend")
    costsub = costs.add_subparsers(dest="cost_action", required=True)
    report = costsub.add_parser("report")
    report.add_argument("--last", default="7d", help="Window like 24h, 7d, 60m")
    report.set_defaults(func=costs_report)

    proto = sub.add_parser("proto", help="Generate cheap prototypes before model refinement")
    protosub = proto.add_subparsers(dest="proto_action", required=True)
    mobile = protosub.add_parser("mobile")
    mobile.add_argument("name")
    mobile.set_defaults(func=proto_mobile)

    verify = sub.add_parser("verify", help="Run local validation checks")
    vsub = verify.add_subparsers(dest="verify_action", required=True)
    patch = vsub.add_parser("patch")
    patch.add_argument("--quick", action="store_true")
    patch.add_argument("--keep-going", action="store_true")
    patch.add_argument("--timeout", type=int, default=300)
    patch.set_defaults(func=verify_patch)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
