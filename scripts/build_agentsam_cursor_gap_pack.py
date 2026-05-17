#!/usr/bin/env python3
"""
build_agentsam_cursor_gap_pack.py
=================================

Agent Sam Cursor Gap Pack Builder

Read-only repo intelligence generator for:
- Agent Sam /dashboard/agent architecture
- backend route/tool/executor/routing surfaces
- D1 agentsam_* closed-loop mapping
- OpenAI-generated recommendations
- Ollama local embedding corpus, chunked for vector planning

Default behavior:
- Scans repo files.
- Writes markdown + JSON artifacts.
- Does not modify source.
- Does not write D1.
- Does not deploy.

Optional:
- --with-d1: read remote D1 schema/counts via wrangler.
- --with-openai: call OpenAI Responses API for recommendations.
- --with-ollama: call local Ollama embeddings endpoint.
- --with-vectorize-ndjson: emit Cloudflare Vectorize-style NDJSON payload.

Expected local embedding model:
- mxbai-embed-large:latest
- Common output dimension is 1024, but script records actual dimension and warns if different.

Usage:
  python3 scripts/build_agentsam_cursor_gap_pack.py

  OPENAI_API_KEY=... python3 scripts/build_agentsam_cursor_gap_pack.py --with-openai --openai-model gpt-5.4-mini

  python3 scripts/build_agentsam_cursor_gap_pack.py --with-ollama --ollama-model mxbai-embed-large:latest

  python3 scripts/build_agentsam_cursor_gap_pack.py --with-d1 --with-openai --with-ollama --with-vectorize-ndjson
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
import textwrap
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


DEFAULT_OUT = "artifacts/agentsam_cursor_gap_pack"
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
DEFAULT_OLLAMA_MODEL = "mxbai-embed-large:latest"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"

MAX_TEXT_FILE_BYTES = 850_000
MAX_SNIPPET_LINES = 80
CHUNK_TARGET_CHARS = 5200
CHUNK_OVERLAP_CHARS = 700

IGNORE_DIRS = {
    ".git",
    "node_modules",
    ".next",
    ".turbo",
    ".wrangler",
    ".cache",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    "vendor",
    ".DS_Store",
}

IGNORE_FILE_GLOBS = [
    "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.ico", "*.pdf",
    "*.zip", "*.tar", "*.gz", "*.mp4", "*.mov", "*.webm", "*.mp3",
    "*.woff", "*.woff2", "*.ttf", "*.otf", "*.sqlite", "*.db",
    "package-lock.json",
]

CODE_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".sql", ".md", ".json", ".toml", ".yaml", ".yml",
    ".css", ".html", ".sh", ".txt",
}

FOCUS_PATH_HINTS = [
    "src/api/agent.js",
    "src/index.js",
    "src/core/routing.js",
    "src/core/agent-run-routing.js",
    "src/core/capability-router.js",
    "src/core/workflow-executor.js",
    "src/core/dashboard-r2-assets.js",
    "dashboard/App.tsx",
    "dashboard/features/agent-chat",
    "dashboard/components/ChatAssistant.tsx",
    "dashboard/src/EditorContext.tsx",
    "dashboard/src/ideWorkspace.ts",
    "dashboard/src/components",
    "scripts",
    "migrations",
    ".cursor/rules",
]

SYMBOL_GROUPS: Dict[str, List[str]] = {
    "agent_entrypoints": [
        r"/api/agent", r"/api/agent/chat", r"AgentChatSqlV1",
        r"handleAgent", r"agent chat", r"sessions", r"conversation",
    ],
    "streaming_sse": [
        r"ReadableStream", r"TransformStream", r"text/event-stream",
        r"event:", r"data:", r"writer.write", r"SSE",
        r"onThinkingEvent", r"handleThinkingEvent",
    ],
    "tool_executor": [
        r"executeToolCall", r"runTool", r"dispatchTool", r"tool_call",
        r"toolCall", r"tool_name", r"toolName", r"registerTool",
        r"availableTools", r"agentsam_mcp_tools", r"agentsam_commands",
        r"runTerminalCommandViaHttpExec", r"terminal_execute",
    ],
    "surface_router": [
        r"classifyWorkflowSurface", r"resolveAgentSurfaceRoute",
        r"surface", r"workflowNode", r"mode", r"excalidraw",
        r"browser", r"monaco", r"code", r"image", r"diagram",
    ],
    "monaco_context": [
        r"monaco", r"editorRef", r"activeFile", r"selectedFile",
        r"selection", r"languageId", r"dirty", r"openTabs",
        r"tabs", r"sendMessage", r"context_bundle", r"contextBundle",
        r"dirty_files", r"open_tabs",
    ],
    "read_write_tools": [
        r"read_file", r"readFile", r"write_file", r"writeFile",
        r"str_replace", r"apply_patch", r"patch", r"diff",
        r"grep", r"glob", r"list_files",
    ],
    "samseek_hooks": [
        r"agentsam_execution_steps", r"output_json", r"approval_queue",
        r"agentsam_approval_queue", r"assertPathAllowedByIgnorePatterns",
        r"ignorePatterns", r"patch_results", r"backups", r"iam_patch_agent",
    ],
    "ai_routing": [
        r"classifyIntent", r"selectAutoModel", r"gateRewriteAndClassify",
        r"resolveModel", r"agentsam_routing_arms", r"agentsam_prompt_routes",
        r"agentsam_route_requirements", r"agentsam_model_catalog",
        r"agentsam_ai", r"model_routing_rules", r"task_type",
        r"api_platform", r"openai_model_id", r"workers_ai_model_id",
    ],
    "verification_smokes": [
        r"npm run", r"build:vite-only", r"wrangler d1 execute",
        r"playwright", r"node --test", r"python3 -m py_compile",
        r"smoke", r"health", r"curl -sf",
    ],
    "forbidden_expensive_models": [
        r"gpt-5.5", r"gpt-5.5-pro", r"gpt-5.4-pro",
        r"claude.*opus", r"opus",
    ],
}

CRITICAL_TABLES = [
    "agentsam_compaction_events",
    "agentsam_guardrail_events",
    "agentsam_skill_revision",
    "agentsam_user_feature_override",
    "agentsam_skill_invocation",
    "agentsam_webhook_events",
    "agentsam_execution_performance_metrics",
    "agentsam_deployment_health",
    "agentsam_eval_runs",
    "agentsam_tool_stats_compacted",
    "agentsam_route_requirements",
    "agentsam_usage_rollups_daily",
    "agentsam_prompt_cache_keys",
    "agentsam_health_daily",
    "agentsam_model_drift_signals",
    "agentsam_webhook_weekly",
    "agentsam_execution_steps",
    "agentsam_workflow_runs",
    "agentsam_routing_arms",
    "agentsam_prompt_routes",
    "agentsam_model_catalog",
    "agentsam_mcp_tools",
    "agentsam_commands",
    "agentsam_tool_call_log",
    "agentsam_command_run",
    "agentsam_error_log",
    "agentsam_feature_flag",
    "agentsam_guardrails",
    "agentsam_guardrail_rulesets",
]


@dataclasses.dataclass
class Hit:
    group: str
    pattern: str
    path: str
    line: int
    text: str


@dataclasses.dataclass
class FileInfo:
    path: str
    bytes: int
    lines: int
    ext: str
    is_focus: bool


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16]


def read_text(path: Path) -> Optional[str]:
    try:
        if path.stat().st_size > MAX_TEXT_FILE_BYTES:
            return None
        data = path.read_bytes()
        if b"\x00" in data[:4096]:
            return None
        return data.decode("utf-8", errors="replace")
    except Exception:
        return None


def should_ignore(path: Path, root: Path) -> bool:
    rel_parts = path.relative_to(root).parts
    for part in rel_parts:
        if part in IGNORE_DIRS:
            return True
    name = path.name
    for glob_pat in IGNORE_FILE_GLOBS:
        if fnmatch.fnmatch(name, glob_pat):
            return True
    return False


def is_text_candidate(path: Path) -> bool:
    if path.suffix.lower() in CODE_EXTS:
        return True
    if path.name in {
        "README", "Makefile", "Dockerfile", ".env.example",
        ".cursorrules",
    }:
        return True
    return False


def walk_repo(root: Path) -> List[Path]:
    files: List[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if should_ignore(p, root):
            continue
        if not is_text_candidate(p):
            continue
        files.append(p)
    return sorted(files, key=lambda x: str(x.relative_to(root)))


def line_count(text: str) -> int:
    if not text:
        return 0
    return text.count("\n") + 1


def is_focus_path(rel: str) -> bool:
    return any(rel == h or rel.startswith(h.rstrip("/") + "/") for h in FOCUS_PATH_HINTS)


def collect_file_infos(root: Path, files: List[Path]) -> List[FileInfo]:
    infos: List[FileInfo] = []
    for p in files:
        rel = str(p.relative_to(root))
        txt = read_text(p)
        infos.append(FileInfo(
            path=rel,
            bytes=p.stat().st_size,
            lines=line_count(txt or ""),
            ext=p.suffix.lower(),
            is_focus=is_focus_path(rel),
        ))
    return infos


def regex_find_hits(root: Path, files: List[Path]) -> List[Hit]:
    compiled: Dict[str, List[Tuple[str, re.Pattern[str]]]] = {}
    for group, patterns in SYMBOL_GROUPS.items():
        compiled[group] = []
        for pat in patterns:
            try:
                compiled[group].append((pat, re.compile(pat, re.IGNORECASE)))
            except re.error:
                compiled[group].append((pat, re.compile(re.escape(pat), re.IGNORECASE)))

    hits: List[Hit] = []
    for p in files:
        rel = str(p.relative_to(root))
        txt = read_text(p)
        if txt is None:
            continue
        for lineno, line in enumerate(txt.splitlines(), start=1):
            for group, pats in compiled.items():
                for raw_pat, rx in pats:
                    if rx.search(line):
                        hits.append(Hit(
                            group=group,
                            pattern=raw_pat,
                            path=rel,
                            line=lineno,
                            text=line.strip()[:400],
                        ))
    return hits


def extract_snippet(root: Path, rel: str, line: int, radius: int = 12) -> str:
    p = root / rel
    txt = read_text(p)
    if not txt:
        return ""
    lines = txt.splitlines()
    start = max(1, line - radius)
    end = min(len(lines), line + radius)
    out = []
    for i in range(start, end + 1):
        prefix = ">" if i == line else " "
        out.append(f"{prefix}{i:5d}: {lines[i-1]}")
    return "\n".join(out)


def run_cmd(
    cmd: List[str],
    cwd: Path,
    timeout: int = 60,
    env: Optional[Dict[str, str]] = None,
) -> Tuple[int, str, str]:
    try:
        p = subprocess.run(
            cmd,
            cwd=str(cwd),
            text=True,
            capture_output=True,
            timeout=timeout,
            env=env or os.environ.copy(),
        )
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired as e:
        return 124, e.stdout or "", e.stderr or f"timeout after {timeout}s"
    except Exception as e:
        return 1, "", str(e)


def d1_command(root: Path, sql: str, timeout: int = 60) -> Tuple[int, str, str]:
    wrapper = root / "scripts" / "with-cloudflare-env.sh"
    base = []
    if wrapper.exists():
        base = [str(wrapper), "npx", "wrangler"]
    else:
        base = ["npx", "wrangler"]

    cmd = base + [
        "d1", "execute", "inneranimalmedia-business",
        "--remote",
        "-c", "wrangler.production.toml",
        "--command", sql,
    ]
    return run_cmd(cmd, cwd=root, timeout=timeout)


def try_parse_wranger_table_output(stdout: str) -> List[Dict[str, str]]:
    # Wrangler often prints box tables. Keep raw text primarily; this best-effort parser is intentionally conservative.
    rows: List[Dict[str, str]] = []
    for line in stdout.splitlines():
        if "│" not in line:
            continue
        parts = [p.strip() for p in line.split("│")[1:-1]]
        if not parts or any(p.startswith("─") for p in parts):
            continue
        rows.append({str(i): val for i, val in enumerate(parts)})
    return rows


def inspect_d1_tables(root: Path, tables: List[str]) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for table in tables:
        count_sql = f"SELECT COUNT(*) AS row_count FROM {table};"
        info_sql = f"PRAGMA table_info({table});"
        rc1, out1, err1 = d1_command(root, count_sql)
        rc2, out2, err2 = d1_command(root, info_sql)
        result[table] = {
            "count_returncode": rc1,
            "count_stdout": out1[-4000:],
            "count_stderr": err1[-4000:],
            "pragma_returncode": rc2,
            "pragma_stdout": out2[-8000:],
            "pragma_stderr": err2[-4000:],
            "pragma_rows_best_effort": try_parse_wranger_table_output(out2),
        }
    return result


def table_code_usage(hits: List[Hit]) -> Dict[str, Dict[str, Any]]:
    usage: Dict[str, Dict[str, Any]] = {}
    for table in CRITICAL_TABLES:
        usage[table] = {
            "insert_hits": [],
            "update_hits": [],
            "select_hits": [],
            "delete_hits": [],
            "all_hits": [],
            "classification": "not_found",
        }

    for table in CRITICAL_TABLES:
        table_rx = re.compile(re.escape(table), re.IGNORECASE)
        insert_rx = re.compile(r"INSERT\s+INTO\s+[\"'`]?" + re.escape(table), re.IGNORECASE)
        update_rx = re.compile(r"UPDATE\s+[\"'`]?" + re.escape(table), re.IGNORECASE)
        select_rx = re.compile(r"FROM\s+[\"'`]?" + re.escape(table), re.IGNORECASE)
        delete_rx = re.compile(r"DELETE\s+FROM\s+[\"'`]?" + re.escape(table), re.IGNORECASE)

        for h in hits:
            if not table_rx.search(h.text):
                continue
            mini = {"path": h.path, "line": h.line, "text": h.text}
            usage[table]["all_hits"].append(mini)
            if insert_rx.search(h.text):
                usage[table]["insert_hits"].append(mini)
            if update_rx.search(h.text):
                usage[table]["update_hits"].append(mini)
            if select_rx.search(h.text):
                usage[table]["select_hits"].append(mini)
            if delete_rx.search(h.text):
                usage[table]["delete_hits"].append(mini)

        has_read = bool(usage[table]["select_hits"])
        has_write = bool(usage[table]["insert_hits"] or usage[table]["update_hits"] or usage[table]["delete_hits"])
        has_any = bool(usage[table]["all_hits"])

        if has_read and has_write:
            cls = "read_write"
        elif has_read:
            cls = "read_only"
        elif has_write:
            cls = "write_only"
        elif has_any:
            cls = "mentioned_only"
        else:
            cls = "not_found"
        usage[table]["classification"] = cls

    return usage


def hits_by_group(hits: List[Hit]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for h in hits:
        grouped.setdefault(h.group, []).append(dataclasses.asdict(h))
    return grouped


def summarize_group_hits(grouped: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    summary: Dict[str, Any] = {}
    for group, rows in grouped.items():
        files = sorted({r["path"] for r in rows})
        summary[group] = {
            "hit_count": len(rows),
            "file_count": len(files),
            "top_files": sorted(
                [{"path": f, "hits": sum(1 for r in rows if r["path"] == f)} for f in files],
                key=lambda x: x["hits"],
                reverse=True,
            )[:20],
        }
    return summary


def classify_scripts(root: Path) -> List[Dict[str, Any]]:
    scripts_dir = root / "scripts"
    out: List[Dict[str, Any]] = []
    if not scripts_dir.exists():
        return out

    categories = {
        "audit": ["audit", "inspect", "probe", "report"],
        "seed": ["seed", "upsert", "insert"],
        "migrate": ["migration", "migrate", "schema"],
        "deploy": ["deploy", "wrangler deploy"],
        "smoke": ["smoke", "test", "verify", "health"],
        "patch": ["patch", "diff", "repair", "fix"],
        "rag_vectorize": ["rag", "vector", "embed", "chunk"],
        "cms": ["cms", "theme", "section"],
        "oauth": ["oauth", "auth"],
        "mcp": ["mcp"],
        "moviemode": ["moviemode", "remotion"],
        "key_hygiene": ["key", "secret", "env"],
    }

    for p in sorted(scripts_dir.rglob("*")):
        if not p.is_file() or should_ignore(p, root):
            continue
        if p.suffix.lower() not in {".py", ".js", ".mjs", ".sh", ".sql", ".md", ".txt"}:
            continue
        rel = str(p.relative_to(root))
        txt = read_text(p) or ""
        hay = (rel + "\n" + txt[:20000]).lower()
        found = [cat for cat, needles in categories.items() if any(n in hay for n in needles)]
        out.append({
            "path": rel,
            "bytes": p.stat().st_size,
            "lines": line_count(txt),
            "categories": found or ["uncategorized"],
            "uses_openai": "openai" in hay or "responses" in hay,
            "uses_ollama": "ollama" in hay,
            "uses_wrangler": "wrangler" in hay,
            "uses_d1": "d1 execute" in hay or "inneranimalmedia-business" in hay,
            "mentions_deploy": "wrangler deploy" in hay or "deploy:full" in hay,
            "writes_files": any(x in hay for x in ["write_text", "open(", "cat >", "tee ", "fs.writefile"]),
        })
    return out


def derive_findings(
    file_infos: List[FileInfo],
    grouped: Dict[str, List[Dict[str, Any]]],
    table_usage: Dict[str, Dict[str, Any]],
    d1: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []

    def add(fid: str, sev: str, cat: str, title: str, evidence: Any, rec: str, safe: bool = False) -> None:
        findings.append({
            "id": fid,
            "severity": sev,
            "category": cat,
            "title": title,
            "evidence": evidence,
            "recommendation": rec,
            "safe_to_auto_patch": safe,
        })

    large = [dataclasses.asdict(fi) for fi in file_infos if fi.lines >= 1800 or fi.bytes >= 180_000]
    if large:
        add(
            "large_files_require_scoped_context",
            "P1",
            "repo_shape",
            "Large files detected; Cursor-level edits need line-bounded context and read-before-edit enforcement.",
            large[:30],
            "Require grep/read range before edits in these files. Prefer SamSeek exact FIND/REPLACE over whole-file writes.",
        )

    if not grouped.get("monaco_context"):
        add(
            "monaco_context_not_detected",
            "P0",
            "situated_context",
            "No Monaco/context-bundle signals detected.",
            {},
            "Wire dashboard active file/path/selection/dirty tabs into /api/agent/chat payload.",
        )
    else:
        add(
            "monaco_context_candidates_found",
            "P2",
            "situated_context",
            "Monaco/context-bundle candidate paths found.",
            summarize_group_hits({"monaco_context": grouped.get("monaco_context", [])})["monaco_context"],
            "Inspect top files and confirm context_bundle is sent, persisted, and injected into model context.",
            safe=False,
        )

    ai_hits = grouped.get("ai_routing", [])
    has_classify = any("classifyIntent" in h["text"] for h in ai_hits)
    has_select = any("selectAutoModel" in h["text"] for h in ai_hits)
    if not has_classify or not has_select:
        add(
            "ai_routing_core_symbols_missing",
            "P0",
            "ai_routing",
            "classifyIntent/selectAutoModel evidence incomplete.",
            {"has_classifyIntent": has_classify, "has_selectAutoModel": has_select},
            "Inspect src/api/agent.js and src/core/routing.js; routing cannot be trusted until call order is proven.",
        )
    else:
        add(
            "ai_routing_core_symbols_found",
            "P1",
            "ai_routing",
            "classifyIntent and selectAutoModel are present; call order still needs verification.",
            summarize_group_hits({"ai_routing": ai_hits})["ai_routing"],
            "Generate a route trace proving classify -> route requirements -> arm selection -> model catalog/provider resolution.",
        )

    rw_hits = grouped.get("read_write_tools", [])
    has_write = any(re.search(r"write_file|writeFile|str_replace|apply_patch|patch", h["text"], re.I) for h in rw_hits)
    has_read = any(re.search(r"read_file|readFile", h["text"], re.I) for h in rw_hits)
    if has_write and has_read:
        add(
            "read_before_edit_enforcement_needed",
            "P0",
            "executor_safety",
            "Read and write tools exist; script cannot prove same-run read-before-edit enforcement.",
            summarize_group_hits({"read_write_tools": rw_hits})["read_write_tools"],
            "Add executor-level run_id path read set. Block writes unless path was read or seeded from context_bundle.",
        )

    for table, u in table_usage.items():
        cls = u["classification"]
        if cls in {"not_found", "mentioned_only", "read_only"} and table in {
            "agentsam_guardrail_events",
            "agentsam_compaction_events",
            "agentsam_skill_revision",
            "agentsam_user_feature_override",
        }:
            add(
                f"{table}_missing_writer",
                "P0",
                "d1_closed_loop",
                f"{table} appears to lack a reliable writer path.",
                {
                    "classification": cls,
                    "hits": u["all_hits"][:20],
                },
                "Use PRAGMA table_info and wire an INSERT at the upstream event. Trigger once and verify row count > 0.",
            )

    forbidden_hits = grouped.get("forbidden_expensive_models", [])
    if forbidden_hits:
        add(
            "forbidden_expensive_model_references",
            "P1",
            "model_policy",
            "Forbidden/expensive model references found.",
            forbidden_hits[:50],
            "Do not route to these models by default. Gate behind explicit owner approval or tiny manual smoke tests only.",
        )

    if d1:
        # Best-effort flag if D1 command failed.
        failed = [
            {"table": t, "count_returncode": v.get("count_returncode"), "pragma_returncode": v.get("pragma_returncode")}
            for t, v in d1.items()
            if v.get("count_returncode") != 0 or v.get("pragma_returncode") != 0
        ]
        if failed:
            add(
                "d1_probe_failures",
                "P1",
                "d1",
                "Some D1 table probes failed.",
                failed[:50],
                "Check Cloudflare auth/wrangler config before relying on table counts/schema.",
            )

    return findings


def markdown_table(rows: List[Dict[str, Any]], cols: List[str], max_rows: int = 200) -> str:
    if not rows:
        return "_None._\n"
    head = "| " + " | ".join(cols) + " |\n"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |\n"
    body = []
    for r in rows[:max_rows]:
        vals = []
        for c in cols:
            v = r.get(c, "")
            if isinstance(v, (dict, list)):
                v = json.dumps(v, ensure_ascii=False)[:140]
            s = str(v).replace("\n", " ").replace("|", "\\|")
            vals.append(s[:240])
        body.append("| " + " | ".join(vals) + " |")
    extra = ""
    if len(rows) > max_rows:
        extra = f"\n\n_Truncated: showing {max_rows} of {len(rows)} rows._\n"
    return head + sep + "\n".join(body) + extra + "\n"


def write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_md(path: Path, title: str, body: str) -> None:
    path.write_text(f"# {title}\n\n{body.rstrip()}\n", encoding="utf-8")


def make_reports(
    out_dir: Path,
    root: Path,
    file_infos: List[FileInfo],
    grouped: Dict[str, List[Dict[str, Any]]],
    group_summary: Dict[str, Any],
    table_usage: Dict[str, Dict[str, Any]],
    scripts: List[Dict[str, Any]],
    findings: List[Dict[str, Any]],
    d1: Optional[Dict[str, Any]],
    openai_result: Optional[Dict[str, Any]],
    chunks_meta: Optional[Dict[str, Any]],
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    p0 = [f for f in findings if f["severity"] == "P0"]
    p1 = [f for f in findings if f["severity"] == "P1"]

    index_body = f"""
Generated: `{now_iso()}`
Repo root: `{root}`

## Summary

| Metric | Value |
|---|---:|
| Files studied | {len(file_infos)} |
| Symbol groups | {len(grouped)} |
| Findings P0 | {len(p0)} |
| Findings P1 | {len(p1)} |
| Critical D1 tables mapped | {len(table_usage)} |
| Scripts inventoried | {len(scripts)} |
| OpenAI commentary | {"yes" if openai_result else "no"} |
| Ollama chunks/embeddings | {chunks_meta.get("embedded_chunks") if chunks_meta else "not run"} |

## Highest-priority findings

{markdown_table(p0 + p1, ["id", "severity", "category", "title", "recommendation"], max_rows=80)}

## Recommended next batch

1. Fix P0 closed-loop blockers first.
2. Do not implement auto-apply until read-before-edit hook points are confirmed.
3. Do not wire SamSeek auto-apply until parser/apply dry-run stats exist.
4. Use Cursor only to review/apply the smallest verified patch pack.
"""
    write_md(out_dir / "00_INDEX.md", "Agent Sam Cursor Gap Pack", index_body)

    repo_rows = [dataclasses.asdict(fi) for fi in sorted(file_infos, key=lambda x: (not x.is_focus, -x.lines, x.path))]
    write_md(
        out_dir / "01_repo_shape.md",
        "Repo Shape",
        markdown_table(repo_rows, ["path", "bytes", "lines", "ext", "is_focus"], max_rows=400),
    )

    for i, group in enumerate([
        "agent_entrypoints",
        "streaming_sse",
        "tool_executor",
        "surface_router",
        "monaco_context",
        "read_write_tools",
        "samseek_hooks",
        "ai_routing",
        "verification_smokes",
        "forbidden_expensive_models",
    ], start=2):
        rows = grouped.get(group, [])
        write_md(
            out_dir / f"{i:02d}_{group}.md",
            group.replace("_", " ").title(),
            "## Summary\n\n"
            + "```json\n"
            + json.dumps(group_summary.get(group, {}), indent=2, ensure_ascii=False)
            + "\n```\n\n"
            + "## Hits\n\n"
            + markdown_table(rows, ["path", "line", "pattern", "text"], max_rows=500),
        )

    table_rows = []
    for table, u in table_usage.items():
        table_rows.append({
            "table": table,
            "classification": u["classification"],
            "insert_hits": len(u["insert_hits"]),
            "update_hits": len(u["update_hits"]),
            "select_hits": len(u["select_hits"]),
            "delete_hits": len(u["delete_hits"]),
            "all_hits": len(u["all_hits"]),
        })
    write_md(
        out_dir / "12_d1_closed_loop_tables.md",
        "D1 Closed Loop Tables",
        markdown_table(table_rows, ["table", "classification", "insert_hits", "update_hits", "select_hits", "delete_hits", "all_hits"], max_rows=200),
    )

    empty_targets = [r for r in table_rows if r["table"] in {
        "agentsam_guardrail_events",
        "agentsam_compaction_events",
        "agentsam_skill_revision",
        "agentsam_user_feature_override",
    }]
    write_md(
        out_dir / "13_empty_table_write_paths.md",
        "Empty Table Write Path Candidates",
        markdown_table(empty_targets, ["table", "classification", "insert_hits", "update_hits", "select_hits", "delete_hits", "all_hits"], max_rows=50)
        + "\n\n## Evidence\n\n"
        + "\n\n".join(
            f"### {t}\n\n```json\n{json.dumps(table_usage[t], indent=2, ensure_ascii=False)[:12000]}\n```"
            for t in sorted(table_usage)
            if t in {x['table'] for x in empty_targets}
        ),
    )

    write_md(
        out_dir / "14_existing_scripts_inventory.md",
        "Existing Scripts Inventory",
        markdown_table(
            scripts,
            ["path", "bytes", "lines", "categories", "uses_openai", "uses_ollama", "uses_wrangler", "uses_d1", "mentions_deploy", "writes_files"],
            max_rows=800,
        ),
    )

    write_md(
        out_dir / "15_cursor_quality_gap_summary.md",
        "Cursor Quality Gap Summary",
        markdown_table(findings, ["id", "severity", "category", "title", "recommendation", "safe_to_auto_patch"], max_rows=200),
    )

    if d1:
        write_md(
            out_dir / "16_d1_remote_probe_raw.md",
            "D1 Remote Probe Raw",
            "\n\n".join(
                f"## {table}\n\n### count\n\n```text\n{v.get('count_stdout','')}\n{v.get('count_stderr','')}\n```\n\n### pragma\n\n```text\n{v.get('pragma_stdout','')}\n{v.get('pragma_stderr','')}\n```"
                for table, v in d1.items()
            ),
        )

    if openai_result:
        write_md(
            out_dir / "17_openai_recommendations.md",
            "OpenAI Recommendations",
            openai_result.get("text", "_No text returned._"),
        )

    write_json(out_dir / "symbols.json", grouped)
    write_json(out_dir / "findings.json", {"generated_at": now_iso(), "findings": findings})
    write_json(out_dir / "table_usage.json", table_usage)
    write_json(out_dir / "scripts_inventory.json", scripts)
    write_json(out_dir / "index.json", {
        "generated_at": now_iso(),
        "repo_root": str(root),
        "summary": {
            "files_scanned": len(file_infos),
            "findings_p0": len(p0),
            "findings_p1": len(p1),
            "groups": group_summary,
            "d1_probe": bool(d1),
            "openai": bool(openai_result),
            "chunks": chunks_meta,
        },
        "outputs": sorted(str(p.relative_to(out_dir)) for p in out_dir.glob("*")),
    })


def build_context_digest(
    root: Path,
    file_infos: List[FileInfo],
    grouped: Dict[str, List[Dict[str, Any]]],
    table_usage: Dict[str, Dict[str, Any]],
    findings: List[Dict[str, Any]],
    max_chars: int = 80_000,
) -> str:
    focus_files = [fi for fi in file_infos if fi.is_focus]
    pieces = []
    pieces.append("# Agent Sam Cursor Gap Pack Context Digest")
    pieces.append(f"Generated: {now_iso()}")
    pieces.append("")
    pieces.append("## Top findings")
    for f in findings[:40]:
        pieces.append(f"- [{f['severity']}] {f['id']}: {f['title']} -> {f['recommendation']}")

    pieces.append("\n## Focus files")
    for fi in sorted(focus_files, key=lambda x: (-x.lines, x.path))[:80]:
        pieces.append(f"- {fi.path} ({fi.lines} lines, {fi.bytes} bytes)")

    pieces.append("\n## Group summaries")
    for group, rows in grouped.items():
        files = sorted({r["path"] for r in rows})
        pieces.append(f"### {group}: {len(rows)} hits in {len(files)} files")
        for r in rows[:50]:
            pieces.append(f"- {r['path']}:{r['line']} `{r['text'][:180]}`")

    pieces.append("\n## Critical table usage")
    for table, u in table_usage.items():
        pieces.append(f"- {table}: {u['classification']} insert={len(u['insert_hits'])} update={len(u['update_hits'])} select={len(u['select_hits'])} all={len(u['all_hits'])}")

    text = "\n".join(pieces)
    return text[:max_chars]


def call_openai_responses(
    model: str,
    context: str,
    api_key: str,
    timeout: int = 120,
) -> Dict[str, Any]:
    prompt = f"""
You are reviewing a repo intelligence digest for Agent Sam, a Cloudflare/D1/R2/React dashboard agent system.

Goal: produce extensive but practical recommendations that help close Cursor-level quality gaps:
- situated context
- read-before-edit
- surgical patch apply
- tool surface gating
- D1 closed-loop writes
- routing/model selection proof
- smoke/verification ledger

Rules:
- Do not invent files not shown in evidence.
- Be explicit about uncertainty.
- Prefer Python-first audit/verification steps before Cursor edits.
- Identify P0/P1 work.
- Suggest next scripts only when they are read-only or validation-oriented.
- Do not suggest gpt-5.5, gpt-5.5-pro, or gpt-5.4-pro as normal routes.

Context digest:
{context}
""".strip()

    payload = {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": "You are a senior repo architect and agent-systems reviewer. Return concrete, evidence-grounded recommendations.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {"ok": False, "error": f"HTTP {e.code}: {body}", "text": ""}
    except Exception as e:
        return {"ok": False, "error": str(e), "text": ""}

    # Responses API commonly returns output[].content[].text.
    texts: List[str] = []
    for item in data.get("output", []):
        for c in item.get("content", []):
            if isinstance(c, dict) and "text" in c:
                texts.append(c.get("text") or "")
    text = "\n".join(t for t in texts if t).strip()
    return {"ok": True, "raw": data, "text": text}


def chunk_text(text: str, source: str, target_chars: int = CHUNK_TARGET_CHARS, overlap: int = CHUNK_OVERLAP_CHARS) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    clean = text.replace("\r\n", "\n")
    if not clean.strip():
        return chunks

    start = 0
    idx = 0
    n = len(clean)
    while start < n:
        end = min(n, start + target_chars)
        # Prefer breaking at paragraph boundary.
        if end < n:
            boundary = clean.rfind("\n\n", start, end)
            if boundary > start + target_chars // 2:
                end = boundary
        chunk = clean[start:end].strip()
        if chunk:
            chunk_id = f"{Path(source).stem}_{idx:04d}_{sha16(source + ':' + str(idx) + ':' + chunk)}"
            chunks.append({
                "id": chunk_id,
                "source": source,
                "index": idx,
                "start_char": start,
                "end_char": end,
                "text": chunk,
                "chars": len(chunk),
            })
            idx += 1
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks


def build_corpus_chunks(root: Path, out_dir: Path, markdown_reports: bool = True) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []

    # First chunk all generated markdown/json reports, because they are compressed truth.
    for p in sorted(out_dir.glob("*.md")) + sorted(out_dir.glob("*.json")):
        txt = read_text(p)
        if txt:
            chunks.extend(chunk_text(txt, str(p.relative_to(root))))

    # Then chunk high-value source files only.
    for hint in FOCUS_PATH_HINTS:
        p = root / hint
        if p.is_file():
            txt = read_text(p)
            if txt:
                chunks.extend(chunk_text(txt, hint))
        elif p.is_dir():
            for child in sorted(p.rglob("*")):
                if child.is_file() and not should_ignore(child, root) and is_text_candidate(child):
                    txt = read_text(child)
                    if txt:
                        chunks.extend(chunk_text(txt, str(child.relative_to(root))))

    # Deduplicate by id.
    seen = set()
    deduped = []
    for c in chunks:
        if c["id"] in seen:
            continue
        seen.add(c["id"])
        deduped.append(c)
    return deduped


def ollama_embed(
    text: str,
    model: str,
    base_url: str,
    timeout: int = 120,
) -> Tuple[bool, Optional[List[float]], str]:
    # Prefer /api/embeddings for broad Ollama compatibility.
    payload = {"model": model, "prompt": text}
    req = urllib.request.Request(
        base_url.rstrip("/") + "/api/embeddings",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        emb = data.get("embedding")
        if isinstance(emb, list):
            return True, [float(x) for x in emb], ""
        return False, None, f"No embedding in response keys={list(data.keys())}"
    except Exception as e:
        return False, None, str(e)


def embed_chunks_ollama(
    chunks: List[Dict[str, Any]],
    model: str,
    base_url: str,
    out_dir: Path,
    vectorize_ndjson: bool,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    embeddings_path = out_dir / "embeddings_ollama.local.jsonl"
    vectorize_path = out_dir / "embeddings_ollama.vectorize.ndjson"

    ok = 0
    failed = 0
    dims: Dict[int, int] = {}
    errors: List[Dict[str, Any]] = []

    selected = chunks[:limit] if limit else chunks

    with embeddings_path.open("w", encoding="utf-8") as f_local:
        f_vec = vectorize_path.open("w", encoding="utf-8") if vectorize_ndjson else None
        try:
            for i, c in enumerate(selected, start=1):
                success, emb, err = ollama_embed(c["text"], model=model, base_url=base_url)
                if not success or emb is None:
                    failed += 1
                    errors.append({"id": c["id"], "source": c["source"], "error": err})
                    continue

                ok += 1
                dims[len(emb)] = dims.get(len(emb), 0) + 1

                rec = {
                    "id": c["id"],
                    "source": c["source"],
                    "index": c["index"],
                    "chars": c["chars"],
                    "dimension": len(emb),
                    "text": c["text"],
                    "embedding": emb,
                    "metadata": {
                        "source": c["source"],
                        "index": c["index"],
                        "start_char": c["start_char"],
                        "end_char": c["end_char"],
                        "generated_at": now_iso(),
                        "model": model,
                    },
                }
                f_local.write(json.dumps(rec, ensure_ascii=False) + "\n")

                if f_vec:
                    vec = {
                        "id": c["id"],
                        "values": emb,
                        "metadata": {
                            "source": c["source"],
                            "index": c["index"],
                            "chars": c["chars"],
                            "text": c["text"][:3000],
                        },
                    }
                    f_vec.write(json.dumps(vec, ensure_ascii=False) + "\n")
        finally:
            if f_vec:
                f_vec.close()

    return {
        "model": model,
        "base_url": base_url,
        "chunks_total": len(chunks),
        "chunks_attempted": len(selected),
        "embedded_chunks": ok,
        "failed_chunks": failed,
        "dimensions": dims,
        "local_jsonl": str(embeddings_path),
        "vectorize_ndjson": str(vectorize_path) if vectorize_ndjson else None,
        "errors": errors[:50],
        "dimension_warning": "expected 1024 for mxbai-embed-large; check dimensions map" if 1024 not in dims and ok else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--with-d1", action="store_true")
    ap.add_argument("--with-openai", action="store_true")
    ap.add_argument("--openai-model", default=DEFAULT_OPENAI_MODEL)
    ap.add_argument("--with-ollama", action="store_true")
    ap.add_argument("--ollama-model", default=DEFAULT_OLLAMA_MODEL)
    ap.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    ap.add_argument("--with-vectorize-ndjson", action="store_true")
    ap.add_argument("--embedding-limit", type=int, default=None)
    args = ap.parse_args()

    root = Path(args.repo_root).resolve()
    out_dir = (root / args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[pack] repo={root}")
    print(f"[pack] out={out_dir}")

    files = walk_repo(root)
    file_infos = collect_file_infos(root, files)
    print(f"[pack] files={len(files)}")

    hits = regex_find_hits(root, files)
    grouped = hits_by_group(hits)
    group_summary = summarize_group_hits(grouped)
    print(f"[pack] hits={len(hits)} groups={len(grouped)}")

    table_usage = table_code_usage(hits)
    scripts = classify_scripts(root)

    d1 = None
    if args.with_d1:
        print("[pack] probing D1 schemas/counts read-only...")
        d1 = inspect_d1_tables(root, CRITICAL_TABLES)

    findings = derive_findings(file_infos, grouped, table_usage, d1=d1)
    findings.sort(key=lambda f: ({"P0": 0, "P1": 1, "P2": 2, "P3": 3}.get(f["severity"], 9), f["category"], f["id"]))

    openai_result = None
    if args.with_openai:
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            openai_result = {"ok": False, "error": "OPENAI_API_KEY not set", "text": ""}
            print("[openai] skipped: OPENAI_API_KEY not set")
        else:
            context = build_context_digest(root, file_infos, grouped, table_usage, findings)
            print(f"[openai] calling model={args.openai_model} digest_chars={len(context)}")
            openai_result = call_openai_responses(args.openai_model, context, api_key)
            print(f"[openai] ok={openai_result.get('ok')} chars={len(openai_result.get('text',''))}")

    # Write initial reports before chunking, so chunker includes them.
    make_reports(
        out_dir=out_dir,
        root=root,
        file_infos=file_infos,
        grouped=grouped,
        group_summary=group_summary,
        table_usage=table_usage,
        scripts=scripts,
        findings=findings,
        d1=d1,
        openai_result=openai_result,
        chunks_meta=None,
    )

    chunks_meta = None
    chunks = build_corpus_chunks(root, out_dir)
    chunks_path = out_dir / "chunks.jsonl"
    with chunks_path.open("w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    chunks_meta = {
        "chunk_count": len(chunks),
        "chunks_jsonl": str(chunks_path),
        "target_chars": CHUNK_TARGET_CHARS,
        "overlap_chars": CHUNK_OVERLAP_CHARS,
    }

    if args.with_ollama:
        print(f"[ollama] embedding chunks={len(chunks)} model={args.ollama_model}")
        emb_meta = embed_chunks_ollama(
            chunks,
            model=args.ollama_model,
            base_url=args.ollama_url,
            out_dir=out_dir,
            vectorize_ndjson=args.with_vectorize_ndjson,
            limit=args.embedding_limit,
        )
        chunks_meta.update(emb_meta)
        print(f"[ollama] embedded={emb_meta['embedded_chunks']} failed={emb_meta['failed_chunks']} dims={emb_meta['dimensions']}")

    # Rewrite final reports with chunk metadata included.
    make_reports(
        out_dir=out_dir,
        root=root,
        file_infos=file_infos,
        grouped=grouped,
        group_summary=group_summary,
        table_usage=table_usage,
        scripts=scripts,
        findings=findings,
        d1=d1,
        openai_result=openai_result,
        chunks_meta=chunks_meta,
    )

    print("")
    print(f"Done: {out_dir}")
    print(f"Index: {out_dir / '00_INDEX.md'}")
    print(f"Findings: {out_dir / 'findings.json'}")
    print(f"Chunks: {chunks_path}")
    if args.with_ollama:
        print(f"Embeddings: {out_dir / 'embeddings_ollama.local.jsonl'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
