"""
Agent Sam micro-interaction audit.

Purpose:
- Audit the Vite + React dashboard shell and /dashboard/agent workspace.
- Locate the files/components involved in the top bar, left rail, center workspace, bottom status bar.
- Find existing UI patterns for tool calls, workflow steps, request/result previews, collapsible panels, SSE, logs, and artifacts.
- Produce chunked markdown reports instead of one massive blob.
- Optionally ask a local Ollama model to review the compact audit digest.

Run from repo root:
    python3 scripts/audit_agent_microinteractions.py

Optional local Ollama review:
    python3 scripts/audit_agent_microinteractions.py --ollama --model qwen2.5-coder:7b

No source files are modified.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


DEFAULT_TARGETS = [
    "dashboard/index.tsx",
    "dashboard/App.tsx",
    "dashboard/components/UnifiedSearchBar.tsx",
    "dashboard/components/StatusBar.tsx",
    "dashboard/components/WorkspaceDashboard.tsx",
    "dashboard/components/ChatAssistant.tsx",
    "dashboard/features/agent-chat",
    "dashboard/components/analytics/AnalyticsShell.tsx",
    "dashboard/components/HealthShell.tsx",
]

IGNORE_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".vite",
    ".wrangler",
    ".turbo",
    "__pycache__",
    "coverage",
    ".cache",
    "vendor",
}

SOURCE_EXTENSIONS = {
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".css",
    ".html",
    ".md",
    ".mdx",
    ".json",
}

MICRO_PATTERNS = {
    "tool_call_ui": [
        r"\btool\b",
        r"\btoolCall\b",
        r"\btool_call\b",
        r"\bToolCall\b",
        r"\btoolsUsed\b",
        r"\btoolName\b",
    ],
    "workflow_step_ui": [
        r"\bworkflow\b",
        r"\bWorkflow\b",
        r"\bstep\b",
        r"\bStep\b",
        r"\bstep_key\b",
        r"\bstepIndex\b",
    ],
    "request_result_preview": [
        r"\bRequest\b",
        r"\bResult\b",
        r"\bresponse\b",
        r"\brequest\b",
        r"\bstdout\b",
        r"\bstderr\b",
        r"\bpayload\b",
        r"\boutput\b",
        r"\binput\b",
    ],
    "expand_collapse": [
        r"\bexpanded\b",
        r"\bisExpanded\b",
        r"\bcollapsed\b",
        r"\bAccordion\b",
        r"\bCollapsible\b",
        r"\bDetails\b",
        r"<details",
        r"<summary",
        r"aria-expanded",
        r"\btoggle\b",
    ],
    "live_streaming": [
        r"\bEventSource\b",
        r"\bSSE\b",
        r"\bReadableStream\b",
        r"\bstream\b",
        r"\bchunk\b",
        r"\bonmessage\b",
        r"\btext/event-stream\b",
    ],
    "proof_artifacts": [
        r"\bartifact\b",
        r"\bArtifact\b",
        r"\bproof\b",
        r"\bEvidence\b",
        r"\bevidence\b",
        r"\bscreenshot\b",
        r"\bcommit\b",
        r"\bdiff\b",
        r"\bpatch\b",
    ],
    "status_quality": [
        r"\bstatus\b",
        r"\bsuccess\b",
        r"\bfailed\b",
        r"\berror\b",
        r"\brunning\b",
        r"\bpassed\b",
        r"\bblocked\b",
        r"\bdone\b",
    ],
    "cost_tokens": [
        r"\bcost\b",
        r"\btokens\b",
        r"\binput_tokens\b",
        r"\boutput_tokens\b",
        r"\blatency\b",
        r"\bduration\b",
        r"\bmodel\b",
        r"\bprovider\b",
    ],
    "agent_workspace": [
        r"\bWorkspaceDashboard\b",
        r"\bChatAssistant\b",
        r"\bagent\b",
        r"\bAgent\b",
        r"/dashboard/agent",
        r"\bAgent Sam\b",
        r"\bagentsam\b",
    ],
    "shell_chrome": [
        r"\bUnifiedSearchBar\b",
        r"\bStatusBar\b",
        r"\bActivityRailItem\b",
        r"\bsidebarRailExpanded\b",
        r"\bleftRail\b",
        r"\btopbar\b",
        r"\bbottom\b",
        r"\bBrowserRouter\b",
        r"\bEditorProvider\b",
    ],
}

SHELL_ANCHORS = {
    "boot": ["BrowserRouter", "EditorProvider", "createRoot", "App"],
    "main_shell": ["ActivityRailItem", "sidebarRailExpanded", "UnifiedSearchBar", "StatusBar"],
    "route_content": ["Routes", "Route", "WorkspaceDashboard", "ChatAssistant", "/dashboard/agent"],
    "bottom_status": ["StatusBar"],
    "search": ["UnifiedSearchBar", "Ctrl+K", "cmd+k", "Command"],
}


@dataclass
class FileSummary:
    path: str
    exists: bool
    is_dir: bool
    bytes: int = 0
    lines: int = 0
    sha256_12: str = ""
    imports: list[str] | None = None
    exports: list[str] | None = None
    components: list[str] | None = None
    route_hits: list[str] | None = None
    pattern_scores: dict[str, int] | None = None


@dataclass
class PatternHit:
    group: str
    pattern: str
    path: str
    line: int
    text: str


def repo_root_from(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "package.json").exists() and (candidate / "dashboard").exists():
            return candidate
        if (candidate / ".git").exists() and (candidate / "dashboard").exists():
            return candidate
    return current


def safe_read(path: Path, max_bytes: int = 2_500_000) -> str:
    try:
        if path.stat().st_size > max_bytes:
            return path.read_text(encoding="utf-8", errors="replace")[:max_bytes]
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def sha12(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:12]


def rel(root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except Exception:
        return str(path)


def is_ignored(path: Path) -> bool:
    return any(part in IGNORE_DIRS for part in path.parts)


def source_files(root: Path, max_files: int) -> list[Path]:
    out: list[Path] = []
    for path in root.rglob("*"):
        if len(out) >= max_files:
            break
        if is_ignored(path):
            continue
        if not path.is_file():
            continue
        if path.suffix not in SOURCE_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > 2_500_000:
                continue
        except Exception:
            continue
        out.append(path)
    return sorted(out, key=lambda p: str(p))


def extract_imports(text: str) -> list[str]:
    imports: list[str] = []
    for match in re.finditer(r"""import\s+(?:.+?\s+from\s+)?["']([^"']+)["']""", text):
        imports.append(match.group(1))
    return sorted(set(imports))


def extract_exports(text: str) -> list[str]:
    exports: list[str] = []
    patterns = [
        r"export\s+default\s+function\s+([A-Za-z0-9_]+)",
        r"export\s+function\s+([A-Za-z0-9_]+)",
        r"export\s+const\s+([A-Za-z0-9_]+)",
        r"export\s+class\s+([A-Za-z0-9_]+)",
        r"export\s+default\s+([A-Za-z0-9_]+)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            exports.append(match.group(1))
    return sorted(set(exports))


def extract_components(text: str) -> list[str]:
    names: list[str] = []
    patterns = [
        r"function\s+([A-Z][A-Za-z0-9_]*)\s*\(",
        r"const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(",
        r"const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*React\.memo",
        r"export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            names.append(match.group(1))
    return sorted(set(names))


def extract_route_hits(text: str) -> list[str]:
    hits: list[str] = []
    route_patterns = [
        r"""path\s*=\s*["']([^"']+)["']""",
        r"""to\s*=\s*["'](/dashboard/[^"']+)["']""",
        r"""["'](/dashboard/[^"']+)["']""",
    ]
    for pattern in route_patterns:
        for match in re.finditer(pattern, text):
            hits.append(match.group(1))
    return sorted(set(hits))


def score_patterns(text: str) -> dict[str, int]:
    scores: dict[str, int] = {}
    for group, patterns in MICRO_PATTERNS.items():
        total = 0
        for pattern in patterns:
            total += len(re.findall(pattern, text, flags=re.IGNORECASE))
        scores[group] = total
    return scores


def summarize_path(root: Path, target: str) -> FileSummary:
    path = root / target
    if not path.exists():
        return FileSummary(path=target, exists=False, is_dir=False)
    if path.is_dir():
        child_files = [
            p for p in path.rglob("*")
            if p.is_file() and p.suffix in SOURCE_EXTENSIONS and not is_ignored(p)
        ]
        total_bytes = sum(p.stat().st_size for p in child_files if p.exists())
        return FileSummary(
            path=target,
            exists=True,
            is_dir=True,
            bytes=total_bytes,
            lines=sum(len(safe_read(p).splitlines()) for p in child_files),
            imports=[],
            exports=[],
            components=[],
            route_hits=[],
            pattern_scores={},
        )

    text = safe_read(path)
    return FileSummary(
        path=target,
        exists=True,
        is_dir=False,
        bytes=path.stat().st_size,
        lines=len(text.splitlines()),
        sha256_12=sha12(text),
        imports=extract_imports(text),
        exports=extract_exports(text),
        components=extract_components(text),
        route_hits=extract_route_hits(text),
        pattern_scores=score_patterns(text),
    )


def collect_pattern_hits(root: Path, files: list[Path], max_hits_per_group: int) -> list[PatternHit]:
    hits: list[PatternHit] = []
    group_counts = {group: 0 for group in MICRO_PATTERNS}
    for path in files:
        text = safe_read(path)
        if not text:
            continue
        lines = text.splitlines()
        for group, patterns in MICRO_PATTERNS.items():
            if group_counts[group] >= max_hits_per_group:
                continue
            for pattern in patterns:
                if group_counts[group] >= max_hits_per_group:
                    break
                regex = re.compile(pattern, flags=re.IGNORECASE)
                for idx, line in enumerate(lines, start=1):
                    if group_counts[group] >= max_hits_per_group:
                        break
                    if regex.search(line):
                        cleaned = " ".join(line.strip().split())
                        if len(cleaned) > 220:
                            cleaned = cleaned[:217] + "..."
                        hits.append(PatternHit(group, pattern, rel(root, path), idx, cleaned))
                        group_counts[group] += 1
    return hits


def find_relevant_files(root: Path, files: list[Path]) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for path in files:
        text = safe_read(path)
        if not text:
            continue
        scores = score_patterns(text)
        weighted = (
            scores.get("agent_workspace", 0) * 4
            + scores.get("tool_call_ui", 0) * 3
            + scores.get("workflow_step_ui", 0) * 3
            + scores.get("request_result_preview", 0) * 2
            + scores.get("expand_collapse", 0) * 2
            + scores.get("live_streaming", 0) * 3
            + scores.get("proof_artifacts", 0) * 2
            + scores.get("shell_chrome", 0) * 3
        )
        if weighted <= 0:
            continue
        ranked.append(
            {
                "path": rel(root, path),
                "weighted_score": weighted,
                "lines": len(text.splitlines()),
                "bytes": path.stat().st_size,
                "scores": scores,
                "components": extract_components(text)[:25],
                "exports": extract_exports(text)[:25],
                "routes": extract_route_hits(text)[:25],
            }
        )
    ranked.sort(key=lambda item: (-item["weighted_score"], item["path"]))
    return ranked[:80]


def shell_anchor_map(root: Path) -> dict[str, list[dict[str, Any]]]:
    files_to_check = [
        root / "dashboard" / "index.tsx",
        root / "dashboard" / "App.tsx",
        root / "dashboard" / "components" / "UnifiedSearchBar.tsx",
        root / "dashboard" / "components" / "StatusBar.tsx",
    ]
    result: dict[str, list[dict[str, Any]]] = {}
    for anchor_group, anchors in SHELL_ANCHORS.items():
        result[anchor_group] = []
        for path in files_to_check:
            if not path.exists():
                continue
            lines = safe_read(path).splitlines()
            for idx, line in enumerate(lines, start=1):
                for anchor in anchors:
                    if anchor.lower() in line.lower():
                        result[anchor_group].append(
                            {
                                "path": rel(root, path),
                                "line": idx,
                                "anchor": anchor,
                                "text": " ".join(line.strip().split())[:240],
                            }
                        )
    return result


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    def clean(value: Any) -> str:
        text = str(value)
        text = text.replace("|", "\\|")
        text = text.replace("\n", " ")
        return text

    lines = [
        "| " + " | ".join(clean(h) for h in headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(clean(v) for v in row) + " |")
    return "\n".join(lines)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def json_dump(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def compact_digest(
    target_summaries: list[FileSummary],
    ranked_files: list[dict[str, Any]],
    shell_map: dict[str, Any],
    pattern_hits: list[PatternHit],
) -> str:
    top_files = ranked_files[:20]
    grouped_hits: dict[str, list[PatternHit]] = {}
    for hit in pattern_hits:
        grouped_hits.setdefault(hit.group, [])
        if len(grouped_hits[hit.group]) < 8:
            grouped_hits[hit.group].append(hit)

    payload = {
        "stack_assumption": "Vite + React + React Router, dashboard/index.tsx wraps App with BrowserRouter + EditorProvider",
        "main_shell_assumption": "dashboard/App.tsx composes IDE-style chrome; no separate AppShell file expected",
        "target_summaries": [asdict(s) for s in target_summaries],
        "top_relevant_files": top_files,
        "shell_anchor_map": shell_map,
        "sample_hits": {
            group: [asdict(hit) for hit in hits]
            for group, hits in grouped_hits.items()
        },
        "desired_microinteraction": {
            "primitive": "Agent execution step row with expandable request/result/stdout/stderr/artifact previews",
            "default_behavior": "Collapsed timeline row; work continues uninterrupted",
            "inspection_behavior": "Scrollable preview opens inline without hijacking the run",
            "quality_rule": "No fake done; every action needs status and proof",
        },
    }
    return json.dumps(payload, indent=2)[:16000]


def call_ollama(model: str, prompt: str, timeout_seconds: int) -> dict[str, Any]:
    body = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_ctx": 8192,
            },
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return {"ok": True, "raw": json.loads(raw)}
    except urllib.error.URLError as exc:
        return {"ok": False, "error": f"Could not reach Ollama: {exc}"}
    except TimeoutError:
        return {"ok": False, "error": "Ollama request timed out"}
    except Exception as exc:
        return {"ok": False, "error": f"Ollama request failed: {exc}"}


def generate_reports(
    root: Path,
    out_dir: Path,
    target_summaries: list[FileSummary],
    ranked_files: list[dict[str, Any]],
    shell_map: dict[str, Any],
    pattern_hits: list[PatternHit],
    ollama_result: dict[str, Any] | None,
) -> None:
    json_dump(out_dir / "raw" / "target_summaries.json", [asdict(s) for s in target_summaries])
    json_dump(out_dir / "raw" / "ranked_files.json", ranked_files)
    json_dump(out_dir / "raw" / "shell_anchor_map.json", shell_map)
    json_dump(out_dir / "raw" / "pattern_hits.json", [asdict(h) for h in pattern_hits])
    if ollama_result is not None:
        json_dump(out_dir / "raw" / "ollama_review.json", ollama_result)

    existing_targets = [s for s in target_summaries if s.exists]
    missing_targets = [s for s in target_summaries if not s.exists]

    index_rows = [
        ["Repo root", str(root)],
        ["Output dir", str(out_dir)],
        ["Existing named targets", len(existing_targets)],
        ["Missing named targets", len(missing_targets)],
        ["Relevant files ranked", len(ranked_files)],
        ["Pattern hits captured", len(pattern_hits)],
        ["Generated at", dt.datetime.now().isoformat(timespec="seconds")],
    ]

    write_text(
        out_dir / "00_INDEX.md",
        "# Agent Sam Micro-Interaction Audit\n\n"
        + markdown_table(["Metric", "Value"], index_rows)
        + "\n\n## Read order\n\n"
        + "\n".join(
            [
                "1. 01_shell_map.md",
                "2. 02_agent_workspace_map.md",
                "3. 03_microinteraction_hits.md",
                "4. 04_recommended_primitives.md",
                "5. 05_patch_plan_for_cursor.md",
                "6. 06_ollama_review.md, only when Ollama was enabled",
                "7. raw/*.json for machine-readable evidence",
            ]
        )
        + "\n",
    )

    target_rows = []
    for summary in target_summaries:
        score_preview = ""
        if summary.pattern_scores:
            top_scores = sorted(summary.pattern_scores.items(), key=lambda x: -x[1])[:4]
            score_preview = ", ".join(f"{k}:{v}" for k, v in top_scores if v)
        target_rows.append(
            [
                summary.path,
                "yes" if summary.exists else "no",
                "dir" if summary.is_dir else "file",
                summary.lines,
                summary.bytes,
                summary.sha256_12,
                ", ".join((summary.components or [])[:8]),
                score_preview,
            ]
        )

    shell_sections = []
    for group, entries in shell_map.items():
        shell_sections.append(f"## {group}\n")
        if not entries:
            shell_sections.append("No anchors found.\n")
            continue
        rows = [[e["path"], e["line"], e["anchor"], e["text"]] for e in entries[:80]]
        shell_sections.append(markdown_table(["Path", "Line", "Anchor", "Text"], rows))
        shell_sections.append("")

    write_text(
        out_dir / "01_shell_map.md",
        "# Shell Map\n\n"
        "This confirms where the IDE-style dashboard shell appears to be composed.\n\n"
        "## Named targets\n\n"
        + markdown_table(
            ["Path", "Exists", "Kind", "Lines", "Bytes", "SHA", "Components", "Top scores"],
            target_rows,
        )
        + "\n\n"
        + "\n".join(shell_sections),
    )

    ranked_rows = []
    for item in ranked_files[:50]:
        scores = item["scores"]
        ranked_rows.append(
            [
                item["path"],
                item["weighted_score"],
                item["lines"],
                scores.get("shell_chrome", 0),
                scores.get("agent_workspace", 0),
                scores.get("tool_call_ui", 0),
                scores.get("workflow_step_ui", 0),
                scores.get("request_result_preview", 0),
                scores.get("expand_collapse", 0),
                scores.get("live_streaming", 0),
            ]
        )

    write_text(
        out_dir / "02_agent_workspace_map.md",
        "# Agent Workspace Map\n\n"
        "Ranked files most likely involved in /dashboard/agent, Agent Sam, workflow traces, tool calls, and shell chrome.\n\n"
        + markdown_table(
            [
                "Path",
                "Score",
                "Lines",
                "Shell",
                "Agent",
                "Tool",
                "Step",
                "Req/Result",
                "Expand",
                "Stream",
            ],
            ranked_rows,
        )
        + "\n\n## Top file details\n\n"
        + "\n\n".join(
            [
                "### "
                + item["path"]
                + "\n\n"
                + markdown_table(
                    ["Field", "Value"],
                    [
                        ["weighted_score", item["weighted_score"]],
                        ["components", ", ".join(item["components"][:20])],
                        ["exports", ", ".join(item["exports"][:20])],
                        ["routes", ", ".join(item["routes"][:20])],
                    ],
                )
                for item in ranked_files[:20]
            ]
        ),
    )

    hits_by_group: dict[str, list[PatternHit]] = {}
    for hit in pattern_hits:
        hits_by_group.setdefault(hit.group, []).append(hit)

    hit_sections = []
    for group in MICRO_PATTERNS:
        group_hits = hits_by_group.get(group, [])
        hit_sections.append(f"## {group}\n")
        if not group_hits:
            hit_sections.append("No hits captured.\n")
            continue
        rows = [
            [hit.path, hit.line, hit.pattern, hit.text]
            for hit in group_hits[:80]
        ]
        hit_sections.append(markdown_table(["Path", "Line", "Pattern", "Text"], rows))
        hit_sections.append("")

    write_text(
        out_dir / "03_microinteraction_hits.md",
        "# Micro-Interaction Hits\n\n"
        "These are evidence points for existing UI/logic related to tool traces, workflow steps, previews, collapsibles, streaming, proof, status, cost, and Agent workspace chrome.\n\n"
        + "\n".join(hit_sections),
    )

    recommended = """
# Recommended Agent Sam Primitives

## 1. AgentRunHeader

Purpose:
Show company identity, active workspace, plan, task, model, status, elapsed time, and cost without taking over the page.

Suggested fields:
- logo
- workspace_id
- plan_id
- task_id
- session_id
- run_group_id
- status
- selected_model
- provider
- elapsed_ms
- cost_usd

## 2. ExecutionTimeline

Purpose:
Render the live vertical stream of work. This is the Claude-like calm execution ledger.

Required behavior:
- New steps append without scroll-jumping the user.
- Passed steps stay collapsed.
- Running step shows live state.
- Failed step opens the minimum useful error context.
- User can expand any step while the run continues.

## 3. ToolTraceRow

Purpose:
One row per tool call, command, query, migration, patch, upload, smoke test, model route, or workflow step.

Collapsed row:
- icon
- title
- one-line summary
- status badge
- duration
- tiny Request / Result / Artifact indicators

Expanded row:
- request tab
- result tab
- stdout tab
- stderr tab
- sql/diff tab when relevant
- artifact links
- copy raw payload button

## 4. ScrollablePreviewPanel

Purpose:
Contain raw proof without flooding the main chat.

Rules:
- Internal max-height with independent scroll.
- Monospace.
- Preserve JSON/SQL/log readability.
- Never block ongoing execution.
- Default truncate huge payloads with full expand option.

## 5. ProofCard

Purpose:
Summarize final evidence.

Examples:
- Migration applied
- D1 query passed
- Supabase mirror row found
- Build passed
- Playwright screenshot captured
- Git commit created

## 6. FailureExplainer

Purpose:
A failure should produce the next safe action, not just an error blob.

Fields:
- failed_step
- likely_cause
- raw_error
- retryable
- next_safe_action
- related_file_or_table
""".strip()

    write_text(out_dir / "04_recommended_primitives.md", recommended)

    patch_plan = """
# Cursor Patch Plan

Use this after reading the audit outputs.

## Goal

Build the smallest reusable execution UI primitive first:
ToolTraceRow + ScrollablePreviewPanel + ExecutionTimeline.

Do not redesign the dashboard shell.
Do not touch cms_themes.
Do not create a new route.
Do not replace App.tsx wholesale.

## Likely target areas

Start from the ranked files in 02_agent_workspace_map.md.

Expected areas:
- dashboard/App.tsx for shell placement and route context only
- dashboard/components/ChatAssistant.tsx or dashboard/features/agent-chat/* for agent stream rendering
- dashboard/components/WorkspaceDashboard.tsx if it owns the center workspace
- dashboard/components/StatusBar.tsx only for tiny status reflection
- existing SSE/stream parser files if already extracted

## First implementation slice

1. Add a typed execution event shape.
2. Add ToolTraceRow.
3. Add ScrollablePreviewPanel.
4. Render existing tool/workflow events through the row.
5. Preserve current chat behavior.
6. Add minimal empty states.
7. Add one proof summary block at run completion.

## Acceptance criteria

- A tool call appears as a collapsed row.
- Clicking Request opens a scrollable request preview.
- Clicking Result opens a scrollable result preview.
- Long JSON does not stretch the whole page.
- Expanding a row does not stop live streaming.
- Failed tool calls show useful failure context.
- Existing /dashboard/agent route still loads.
- No unrelated visual redesign.
- No cms_themes rewrite.
- No fake static demo data unless clearly gated as demo.

## Validation commands to run locally

These are reminders, not executed by this audit script:
- npm run build
- npm run typecheck, if available
- npm run lint, if available
- curl /dashboard/agent after local dev server is running
- Playwright screenshot check if your repo already has a capture script
""".strip()

    write_text(out_dir / "05_patch_plan_for_cursor.md", patch_plan)

    if ollama_result is None:
        write_text(
            out_dir / "06_ollama_review.md",
            "# Ollama Review\n\nOllama was not enabled. Re-run with --ollama to add a local model review.\n",
        )
    elif not ollama_result.get("ok"):
        write_text(
            out_dir / "06_ollama_review.md",
            "# Ollama Review\n\n"
            + str(ollama_result.get("error", "Unknown Ollama error"))
            + "\n",
        )
    else:
        raw = ollama_result.get("raw", {})
        response = raw.get("response", "")
        write_text(
            out_dir / "06_ollama_review.md",
            "# Ollama Review\n\n"
            + response.strip()
            + "\n",
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Agent Sam dashboard micro-interactions.")
    parser.add_argument("--root", default="", help="Repo root. Defaults to auto-detect from cwd.")
    parser.add_argument("--out", default="", help="Output directory. Defaults to artifacts/agent_microinteraction_audit/<timestamp>.")
    parser.add_argument("--ollama", action="store_true", help="Enable local Ollama review.")
    parser.add_argument("--model", default=os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b"), help="Ollama model name.")
    parser.add_argument("--ollama-timeout", type=int, default=90, help="Ollama timeout seconds.")
    parser.add_argument("--max-files", type=int, default=2500, help="Maximum source files to scan.")
    parser.add_argument("--max-hits-per-group", type=int, default=120, help="Maximum pattern hits per group.")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else repo_root_from(Path.cwd())
    if not root.exists():
        print(f"FAIL: root does not exist: {root}", file=sys.stderr)
        return 1

    timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.out).resolve() if args.out else root / "artifacts" / "agent_microinteraction_audit" / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Repo root: {root}")
    print(f"Output:    {out_dir}")
    print("Scanning source files...")

    files = source_files(root, max_files=args.max_files)
    target_summaries = [summarize_path(root, target) for target in DEFAULT_TARGETS]
    ranked_files = find_relevant_files(root, files)
    shell_map = shell_anchor_map(root)
    pattern_hits = collect_pattern_hits(root, files, max_hits_per_group=args.max_hits_per_group)

    digest = compact_digest(target_summaries, ranked_files, shell_map, pattern_hits)
    write_text(out_dir / "raw" / "compact_digest.json", digest)

    ollama_result = None
    if args.ollama:
        print(f"Asking local Ollama model for compact review: {args.model}")
        prompt = textwrap.dedent(
            f"""
            You are reviewing a Vite + React dashboard audit for Agent Sam micro-interactions.

            Product goal:
            Build a Fortune-500-quality execution UI for autonomous agents. The desired interaction is a clean live timeline of tool/workflow steps with expandable, scrollable Request/Result previews. The run must continue while the user inspects details. No massive log blobs. No fake success.

            Constraints:
            - Do not redesign the whole dashboard shell.
            - Do not rewrite cms_themes.
            - Focus on the smallest reusable primitive: ToolTraceRow + ScrollablePreviewPanel + ExecutionTimeline.
            - Produce concise, actionable recommendations.
            - Mention files/components only when supported by the digest.

            Audit digest:
            {digest}

            Return:
            1. Highest-leverage files to inspect first.
            2. Smallest safe implementation slice.
            3. Risks.
            4. Acceptance checklist.
            """
        ).strip()
        ollama_result = call_ollama(args.model, prompt, timeout_seconds=args.ollama_timeout)

    generate_reports(
        root=root,
        out_dir=out_dir,
        target_summaries=target_summaries,
        ranked_files=ranked_files,
        shell_map=shell_map,
        pattern_hits=pattern_hits,
        ollama_result=ollama_result,
    )

    print("")
    print("PASS: audit complete")
    print(f"Open: {out_dir / '00_INDEX.md'}")
    print(f"Cursor plan: {out_dir / '05_patch_plan_for_cursor.md'}")
    print("")
    print("Generated files:")
    for path in sorted(out_dir.glob("*.md")):
        print(f"  - {path.relative_to(root)}")
    print(f"  - {out_dir.relative_to(root) / 'raw'}/*.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())