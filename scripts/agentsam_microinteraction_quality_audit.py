"""
Agent Sam Micro-Interaction Quality Audit

Purpose:
- Practice the correct workflow: write Python in a text editor, run it from Mac terminal.
- Audit /dashboard/agent micro-interaction implementation quality.
- Check for Agent Presence Layer files, execution trace primitives, script draft UI, artifact chips, queue-readiness, and plan/task anchor readiness.
- Produce chunked markdown reports under artifacts/agentsam_microinteraction_quality_audit/<timestamp>/.
- Optionally ask local Ollama for a compact review.

Run from repo root:
    python3 scripts/agentsam_microinteraction_quality_audit.py

Optional:
    python3 scripts/agentsam_microinteraction_quality_audit.py --ollama --model qwen2.5-coder:7b

This script is read-only. It does not patch source files.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


IGNORE_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".vite",
    ".wrangler",
    ".turbo",
    ".cache",
    "__pycache__",
    "coverage",
    "vendor",
}

SOURCE_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".md",
    ".mdx",
    ".json",
    ".html",
    ".py",
}

EXPECTED_FILES = {
    "presence": [
        "dashboard/features/agent-presence/presenceTypes.ts",
        "dashboard/features/agent-presence/presenceCopy.ts",
        "dashboard/features/agent-presence/presenceMotion.css",
        "dashboard/features/agent-presence/deriveAgentPresence.ts",
        "dashboard/features/agent-presence/useAgentPresence.ts",
        "dashboard/features/agent-presence/AgentPresenceLogo.tsx",
        "dashboard/features/agent-presence/AgentPresenceStatus.tsx",
        "dashboard/features/agent-presence/index.ts",
    ],
    "execution": [
        "dashboard/features/agent-chat/execution/ScrollablePreviewPanel.tsx",
        "dashboard/features/agent-chat/execution/ToolTraceRow.tsx",
        "dashboard/features/agent-chat/execution/ExecutionTimeline.tsx",
        "dashboard/features/agent-chat/execution/ArtifactChipList.tsx",
        "dashboard/features/agent-chat/execution/ScriptDraftPanel.tsx",
        "dashboard/features/agent-chat/execution/index.ts",
    ],
    "chat_wiring": [
        "dashboard/features/agent-chat/ChatAssistant.tsx",
        "dashboard/features/agent-chat/AgentMessageList.tsx",
        "dashboard/features/agent-chat/useAgentChatStream.ts",
    ],
    "terminal_gate": [
        "src/core/agent-terminal-run.js",
    ],
}

QUALITY_PATTERNS = {
    "presence_state_machine": [
        r"AgentPresenceState",
        r"AgentPresence",
        r"deriveAgentPresence",
        r"useAgentPresence",
        r"logoMotion",
        r"AgentLogoMotion",
    ],
    "presence_real_state": [
        r"isLoading",
        r"pendingToolApproval",
        r"toolTraceRows",
        r"workflow",
        r"running",
        r"thinking",
        r"draft",
    ],
    "presence_motion": [
        r"prefers-reduced-motion",
        r"@keyframes",
        r"agent-breathe",
        r"agent-orbit",
        r"agent-complete",
        r"agent-shake",
        r"data-motion",
    ],
    "tool_trace_rows": [
        r"ToolTraceRow",
        r"ExecutionTimeline",
        r"ScrollablePreviewPanel",
        r"ArtifactChipList",
        r"ScriptDraftPanel",
        r"tool_start",
        r"tool_output",
        r"tool_done",
        r"tool_error",
    ],
    "scroll_safety": [
        r"overscroll-behavior",
        r"stopPropagation",
        r"max-height",
        r"overflow",
        r"preventDefault",
    ],
    "script_safety": [
        r"py_compile",
        r"python3 -m py_compile",
        r"shellSingleQuote",
        r"one-line",
        r"low-risk",
        r"approval",
        r"unsafe",
    ],
    "artifact_proof": [
        r"preview_artifact",
        r"artifact",
        r"Artifact",
        r"proof",
        r"stdout",
        r"stderr",
        r"exit_code",
        r"duration",
    ],
    "plan_task_anchors": [
        r"planId",
        r"plan_id",
        r"taskId",
        r"task_id",
        r"sessionId",
        r"session_id",
        r"runGroupId",
        r"run_group_id",
        r"traceId",
    ],
    "queue_readiness": [
        r"queuedFollowUps",
        r"queued",
        r"follow-up",
        r"checkpoint",
        r"Add follow-up",
        r"queued note",
    ],
    "no_fake_success": [
        r"fake success",
        r"no fake",
        r"HTTP errors",
        r"error",
        r"failed",
        r"refuses",
        r"status",
    ],
}

RISK_PATTERNS = {
    "multiline_terminal_paste_risk": [
        r"Run in Terminal",
        r"fenced",
        r"```",
        r"bash",
        r"zsh",
        r"sh",
        r"terminal/run",
    ],
    "fake_or_demo_state_risk": [
        r"mock",
        r"demo",
        r"sample",
        r"fake",
        r"placeholder",
        r"setTimeout",
        r"Math\.random",
    ],
    "shell_rewrite_risk": [
        r"dashboard/App\.tsx",
        r"cms_themes",
        r"AppShell",
    ],
}


@dataclass
class FileCheck:
    group: str
    path: str
    exists: bool
    lines: int
    bytes: int
    sha256_12: str
    components: list[str]
    exports: list[str]
    imports: list[str]


@dataclass
class PatternHit:
    group: str
    pattern: str
    path: str
    line: int
    text: str


@dataclass
class QualityScore:
    category: str
    hits: int
    files: int
    score: int
    status: str


def repo_root_from(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "package.json").exists() and (candidate / "dashboard").exists():
            return candidate
        if (candidate / ".git").exists() and (candidate / "dashboard").exists():
            return candidate
    return current


def rel(root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except Exception:
        return str(path)


def safe_read(path: Path, max_bytes: int = 3_000_000) -> str:
    try:
        if not path.exists() or not path.is_file():
            return ""
        data = path.read_bytes()
        if len(data) > max_bytes:
            data = data[:max_bytes]
        return data.decode("utf-8", errors="replace")
    except Exception:
        return ""


def sha12(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:12]


def is_ignored(path: Path) -> bool:
    return any(part in IGNORE_DIRS for part in path.parts)


def source_files(root: Path, max_files: int = 4000) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if len(files) >= max_files:
            break
        if is_ignored(path):
            continue
        if not path.is_file():
            continue
        if path.suffix not in SOURCE_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > 3_000_000:
                continue
        except Exception:
            continue
        files.append(path)
    return sorted(files, key=lambda p: str(p))


def extract_imports(text: str) -> list[str]:
    out: list[str] = []
    for match in re.finditer(r"""import\s+(?:.+?\s+from\s+)?["']([^"']+)["']""", text):
        out.append(match.group(1))
    return sorted(set(out))


def extract_exports(text: str) -> list[str]:
    out: list[str] = []
    patterns = [
        r"export\s+type\s+([A-Za-z0-9_]+)",
        r"export\s+interface\s+([A-Za-z0-9_]+)",
        r"export\s+function\s+([A-Za-z0-9_]+)",
        r"export\s+const\s+([A-Za-z0-9_]+)",
        r"export\s+class\s+([A-Za-z0-9_]+)",
        r"export\s+default\s+function\s+([A-Za-z0-9_]+)",
        r"export\s+default\s+([A-Za-z0-9_]+)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            out.append(match.group(1))
    return sorted(set(out))


def extract_components(text: str) -> list[str]:
    out: list[str] = []
    patterns = [
        r"function\s+([A-Z][A-Za-z0-9_]*)\s*\(",
        r"const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(",
        r"const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*React\.memo",
        r"export\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(",
        r"export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            out.append(match.group(1))
    return sorted(set(out))


def check_expected_files(root: Path) -> list[FileCheck]:
    checks: list[FileCheck] = []
    for group, paths in EXPECTED_FILES.items():
        for item in paths:
            path = root / item
            text = safe_read(path)
            checks.append(
                FileCheck(
                    group=group,
                    path=item,
                    exists=path.exists(),
                    lines=len(text.splitlines()) if text else 0,
                    bytes=path.stat().st_size if path.exists() and path.is_file() else 0,
                    sha256_12=sha12(text) if text else "",
                    components=extract_components(text)[:20],
                    exports=extract_exports(text)[:20],
                    imports=extract_imports(text)[:20],
                )
            )
    return checks


def collect_hits(
    root: Path,
    files: list[Path],
    patterns_by_group: dict[str, list[str]],
    max_hits_per_group: int,
) -> list[PatternHit]:
    hits: list[PatternHit] = []
    counts = {group: 0 for group in patterns_by_group}

    for path in files:
        text = safe_read(path)
        if not text:
            continue
        lines = text.splitlines()

        for group, patterns in patterns_by_group.items():
            if counts[group] >= max_hits_per_group:
                continue

            for pattern in patterns:
                if counts[group] >= max_hits_per_group:
                    break

                regex = re.compile(pattern, flags=re.IGNORECASE)
                for line_no, line in enumerate(lines, start=1):
                    if counts[group] >= max_hits_per_group:
                        break
                    if regex.search(line):
                        cleaned = " ".join(line.strip().split())
                        if len(cleaned) > 240:
                            cleaned = cleaned[:237] + "..."
                        hits.append(
                            PatternHit(
                                group=group,
                                pattern=pattern,
                                path=rel(root, path),
                                line=line_no,
                                text=cleaned,
                            )
                        )
                        counts[group] += 1

    return hits


def score_quality(hits: list[PatternHit]) -> list[QualityScore]:
    by_group: dict[str, list[PatternHit]] = {}
    for hit in hits:
        by_group.setdefault(hit.group, []).append(hit)

    scores: list[QualityScore] = []
    for group in QUALITY_PATTERNS:
        group_hits = by_group.get(group, [])
        files = len({hit.path for hit in group_hits})
        hit_count = len(group_hits)

        if hit_count >= 20 and files >= 3:
            status = "strong"
            score = 5
        elif hit_count >= 8 and files >= 2:
            status = "present"
            score = 4
        elif hit_count >= 3:
            status = "partial"
            score = 3
        elif hit_count >= 1:
            status = "thin"
            score = 2
        else:
            status = "missing"
            score = 1

        scores.append(QualityScore(category=group, hits=hit_count, files=files, score=score, status=status))

    return scores


def run_command(root: Path, command: list[str], timeout_seconds: int = 60) -> dict[str, Any]:
    started = dt.datetime.now()
    try:
        proc = subprocess.run(
            command,
            cwd=root,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        ended = dt.datetime.now()
        return {
            "command": command,
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "duration_ms": int((ended - started).total_seconds() * 1000),
            "stdout": proc.stdout[-4000:],
            "stderr": proc.stderr[-4000:],
        }
    except FileNotFoundError as exc:
        return {
            "command": command,
            "ok": False,
            "returncode": None,
            "duration_ms": 0,
            "stdout": "",
            "stderr": f"Command not found: {exc}",
        }
    except subprocess.TimeoutExpired:
        return {
            "command": command,
            "ok": False,
            "returncode": None,
            "duration_ms": timeout_seconds * 1000,
            "stdout": "",
            "stderr": f"Timed out after {timeout_seconds}s",
        }


def detect_build_command(root: Path) -> list[str] | None:
    package_json = root / "package.json"
    text = safe_read(package_json)
    if not text:
        return None
    try:
        data = json.loads(text)
    except Exception:
        return None
    scripts = data.get("scripts", {})
    if "build:vite-only" in scripts:
        return ["npm", "run", "build:vite-only"]
    if "build" in scripts:
        return ["npm", "run", "build"]
    return None


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    def clean(value: Any) -> str:
        text = str(value)
        text = text.replace("|", "\\|").replace("\n", " ")
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


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def compact_digest(
    root: Path,
    file_checks: list[FileCheck],
    quality_scores: list[QualityScore],
    quality_hits: list[PatternHit],
    risk_hits: list[PatternHit],
    build_result: dict[str, Any] | None,
) -> str:
    payload = {
        "repo_root": str(root),
        "goal": "Audit Agent Sam micro-interaction layer: execution traces, script draft UI, presence layer, anchors, queue-readiness.",
        "expected_files": [asdict(item) for item in file_checks],
        "quality_scores": [asdict(item) for item in quality_scores],
        "sample_quality_hits": [asdict(item) for item in quality_hits[:120]],
        "sample_risk_hits": [asdict(item) for item in risk_hits[:80]],
        "build_result": build_result,
        "north_star": {
            "product": "Agent Sam as live operator inside professional workspace.",
            "interaction": "Visible presence, traceable tool actions, script/editor/terminal handoff, proof artifacts, queued follow-up context.",
            "constraints": [
                "No shell redesign",
                "No cms_themes rewrite",
                "No fake success",
                "Motion must be subtle and reduced-motion safe",
                "Python belongs in files, not direct multiline zsh paste",
            ],
        },
    }
    return json.dumps(payload, indent=2)[:18000]


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
        return {"ok": False, "error": "Ollama timed out"}
    except Exception as exc:
        return {"ok": False, "error": f"Ollama failed: {exc}"}


def generate_reports(
    root: Path,
    out_dir: Path,
    file_checks: list[FileCheck],
    quality_scores: list[QualityScore],
    quality_hits: list[PatternHit],
    risk_hits: list[PatternHit],
    build_result: dict[str, Any] | None,
    ollama_result: dict[str, Any] | None,
) -> None:
    write_json(out_dir / "raw" / "file_checks.json", [asdict(item) for item in file_checks])
    write_json(out_dir / "raw" / "quality_scores.json", [asdict(item) for item in quality_scores])
    write_json(out_dir / "raw" / "quality_hits.json", [asdict(item) for item in quality_hits])
    write_json(out_dir / "raw" / "risk_hits.json", [asdict(item) for item in risk_hits])
    if build_result is not None:
        write_json(out_dir / "raw" / "build_result.json", build_result)
    if ollama_result is not None:
        write_json(out_dir / "raw" / "ollama_review.json", ollama_result)

    present = sum(1 for item in file_checks if item.exists)
    missing = sum(1 for item in file_checks if not item.exists)
    total_score = sum(item.score for item in quality_scores)
    max_score = len(quality_scores) * 5
    score_pct = round((total_score / max_score) * 100, 1) if max_score else 0

    index_rows = [
        ["Repo root", str(root)],
        ["Output directory", str(out_dir)],
        ["Expected files present", present],
        ["Expected files missing", missing],
        ["Quality score", f"{total_score}/{max_score} ({score_pct}%)"],
        ["Quality hits", len(quality_hits)],
        ["Risk hits", len(risk_hits)],
        ["Build checked", "yes" if build_result is not None else "no"],
        ["Build passed", build_result.get("ok") if build_result else "not run"],
        ["Generated", dt.datetime.now().isoformat(timespec="seconds")],
    ]

    write_text(
        out_dir / "00_INDEX.md",
        "# Agent Sam Micro-Interaction Quality Audit\n\n"
        + markdown_table(["Metric", "Value"], index_rows)
        + "\n\n## Reports\n\n"
        + "\n".join(
            [
                "1. `01_expected_files.md` — confirms presence/execution primitives exist.",
                "2. `02_quality_scores.md` — scores implementation coverage by category.",
                "3. `03_quality_hits.md` — evidence lines for state, motion, traces, artifacts, safety.",
                "4. `04_risk_hits.md` — risk signals to inspect manually.",
                "5. `05_next_slice_plan.md` — recommended next implementation slice.",
                "6. `06_ollama_review.md` — optional local model review.",
                "7. `raw/*.json` — machine-readable evidence.",
            ]
        )
        + "\n",
    )

    file_rows = []
    for item in file_checks:
        file_rows.append(
            [
                item.group,
                item.path,
                "yes" if item.exists else "no",
                item.lines,
                item.bytes,
                item.sha256_12,
                ", ".join(item.components[:8]),
                ", ".join(item.exports[:8]),
            ]
        )

    write_text(
        out_dir / "01_expected_files.md",
        "# Expected Files\n\n"
        + markdown_table(
            ["Group", "Path", "Exists", "Lines", "Bytes", "SHA", "Components", "Exports"],
            file_rows,
        ),
    )

    score_rows = [
        [item.category, item.status, item.score, item.hits, item.files]
        for item in quality_scores
    ]

    write_text(
        out_dir / "02_quality_scores.md",
        "# Quality Scores\n\n"
        + markdown_table(["Category", "Status", "Score", "Hits", "Files"], score_rows)
        + "\n\n## Interpretation\n\n"
        + "\n".join(
            [
                "- `strong`: enough signals across multiple files.",
                "- `present`: likely implemented but still worth reviewing.",
                "- `partial`: exists but might not be fully wired.",
                "- `thin`: one-off mention only.",
                "- `missing`: no evidence found.",
            ]
        ),
    )

    hits_by_group: dict[str, list[PatternHit]] = {}
    for hit in quality_hits:
        hits_by_group.setdefault(hit.group, []).append(hit)

    quality_sections: list[str] = ["# Quality Hits\n"]
    for group in QUALITY_PATTERNS:
        group_hits = hits_by_group.get(group, [])
        quality_sections.append(f"## {group}\n")
        if not group_hits:
            quality_sections.append("No hits captured.\n")
            continue
        rows = [[hit.path, hit.line, hit.pattern, hit.text] for hit in group_hits[:100]]
        quality_sections.append(markdown_table(["Path", "Line", "Pattern", "Text"], rows))
        quality_sections.append("")

    write_text(out_dir / "03_quality_hits.md", "\n".join(quality_sections))

    risk_by_group: dict[str, list[PatternHit]] = {}
    for hit in risk_hits:
        risk_by_group.setdefault(hit.group, []).append(hit)

    risk_sections: list[str] = ["# Risk Hits\n\nThese are not automatic failures. They are places to inspect manually.\n"]
    for group in RISK_PATTERNS:
        group_hits = risk_by_group.get(group, [])
        risk_sections.append(f"## {group}\n")
        if not group_hits:
            risk_sections.append("No hits captured.\n")
            continue
        rows = [[hit.path, hit.line, hit.pattern, hit.text] for hit in group_hits[:80]]
        risk_sections.append(markdown_table(["Path", "Line", "Pattern", "Text"], rows))
        risk_sections.append("")

    write_text(out_dir / "04_risk_hits.md", "\n".join(risk_sections))

    next_plan = """
# Next Slice Plan

## Current foundation

The product direction is now:

Agent Sam is a live operator inside a professional workspace, not just chat next to tools.

Core primitives:
- Agent Presence Layer
- ToolTraceRow
- ScrollablePreviewPanel
- ExecutionTimeline
- ArtifactChipList
- ScriptDraftPanel
- Terminal/editor/browser/database handoff

## Recommended next slice: plan/task anchors

Goal:
Thread real planId/taskId/sessionId/runGroupId into AgentPresence and ToolTraceRow metadata when available.

Why:
This turns subtle UI presence into traceable enterprise bookkeeping.

Acceptance:
- If a running tool/workflow/script has real metadata, AgentPresenceStatus shows a compact anchor.
- Format: plan_id · task_id
- Low contrast, monospace, truncates with title tooltip.
- If no IDs exist, the UI looks unchanged.
- No fake IDs.

## Recommended following slice: queued follow-ups

Goal:
When an agent run is active, user messages become queued context instead of interrupting the current workflow.

Acceptance:
- Composer placeholder changes to “Add follow-up…”
- Queue chip appears: “1 queued”
- User can expand/dismiss queued notes.
- Presence says: “1 queued note will be applied at the next checkpoint.”
- Do not claim the note was applied unless it was actually included in a real request/workflow payload.

## Recommended hardening slice: multiline command safety

Goal:
Prevent Python or long fenced code from being pasted directly into zsh.

Acceptance:
- Python goes to .py file.
- Shell command runner rejects multiline Python-looking payloads.
- Suggests ScriptDraftPanel flow instead.
- Syntax check before run.
- Mutating script runs still go through existing approval policy.

## Recommended telemetry slice

Goal:
Persist trace rows and presence states with plan/task/session/run IDs.

Acceptance:
- Tool calls have trace_id.
- Script drafts have file_path, command, exit_code, stdout/stderr preview, artifact paths.
- Workflow steps and terminal runs can be joined by run_group_id.
""".strip()

    write_text(out_dir / "05_next_slice_plan.md", next_plan)

    if build_result is None:
        build_md = "# Build Check\n\nBuild check was skipped.\n"
    else:
        build_md = (
            "# Build Check\n\n"
            + markdown_table(
                ["Field", "Value"],
                [
                    ["Command", " ".join(build_result.get("command", []))],
                    ["OK", build_result.get("ok")],
                    ["Return code", build_result.get("returncode")],
                    ["Duration ms", build_result.get("duration_ms")],
                ],
            )
            + "\n\n## stdout tail\n\n```text\n"
            + str(build_result.get("stdout", ""))[-4000:]
            + "\n```\n\n## stderr tail\n\n```text\n"
            + str(build_result.get("stderr", ""))[-4000:]
            + "\n```\n"
        )
    write_text(out_dir / "07_build_check.md", build_md)

    if ollama_result is None:
        write_text(out_dir / "06_ollama_review.md", "# Ollama Review\n\nOllama review was not requested.\n")
    elif not ollama_result.get("ok"):
        write_text(out_dir / "06_ollama_review.md", "# Ollama Review\n\n" + ollama_result.get("error", "Unknown error") + "\n")
    else:
        response = ollama_result.get("raw", {}).get("response", "")
        write_text(out_dir / "06_ollama_review.md", "# Ollama Review\n\n" + response.strip() + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Agent Sam micro-interaction implementation quality.")
    parser.add_argument("--root", default="", help="Repo root. Defaults to auto-detect from cwd.")
    parser.add_argument("--out", default="", help="Output directory.")
    parser.add_argument("--max-files", type=int, default=5000, help="Max source files to scan.")
    parser.add_argument("--max-hits-per-group", type=int, default=140, help="Max hits per pattern group.")
    parser.add_argument("--build", action="store_true", help="Run npm build check if a build script is detected.")
    parser.add_argument("--no-build", action="store_true", help="Skip build check.")
    parser.add_argument("--ollama", action="store_true", help="Ask local Ollama for compact review.")
    parser.add_argument("--model", default=os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b"), help="Ollama model.")
    parser.add_argument("--ollama-timeout", type=int, default=90, help="Ollama timeout seconds.")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else repo_root_from(Path.cwd())
    if not root.exists():
        print(f"FAIL: root does not exist: {root}", file=sys.stderr)
        return 1

    timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.out).resolve() if args.out else root / "artifacts" / "agentsam_microinteraction_quality_audit" / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Repo root: {root}")
    print(f"Output:    {out_dir}")
    print("Scanning source files...")

    files = source_files(root, max_files=args.max_files)
    file_checks = check_expected_files(root)
    quality_hits = collect_hits(root, files, QUALITY_PATTERNS, max_hits_per_group=args.max_hits_per_group)
    risk_hits = collect_hits(root, files, RISK_PATTERNS, max_hits_per_group=args.max_hits_per_group)
    quality_scores = score_quality(quality_hits)

    build_result: dict[str, Any] | None = None
    should_build = args.build and not args.no_build
    if should_build:
        build_command = detect_build_command(root)
        if build_command:
            print(f"Running build check: {' '.join(build_command)}")
            build_result = run_command(root, build_command, timeout_seconds=180)
        else:
            build_result = {
                "command": [],
                "ok": False,
                "returncode": None,
                "duration_ms": 0,
                "stdout": "",
                "stderr": "No build script detected in package.json",
            }

    ollama_result: dict[str, Any] | None = None
    if args.ollama:
        print(f"Asking Ollama for review: {args.model}")
        digest = compact_digest(root, file_checks, quality_scores, quality_hits, risk_hits, build_result)
        prompt = textwrap.dedent(
            f"""
            You are reviewing an audit digest for Agent Sam's /dashboard/agent micro-interaction layer.

            Product target:
            Fortune-500-quality agent workspace. Agent Sam should feel like a live operator, not a generic chatbot.
            It has tool traces, script draft panel, scrollable previews, artifact chips, presence motion/copy, and terminal/editor/browser/database handoff.

            Give a concise implementation review:
            1. What looks strong.
            2. What is missing or thin.
            3. Highest-leverage next slice.
            4. Risks to avoid.
            5. Concrete acceptance checklist.

            Audit digest:
            {digest}
            """
        ).strip()
        ollama_result = call_ollama(args.model, prompt, timeout_seconds=args.ollama_timeout)

    generate_reports(
        root=root,
        out_dir=out_dir,
        file_checks=file_checks,
        quality_scores=quality_scores,
        quality_hits=quality_hits,
        risk_hits=risk_hits,
        build_result=build_result,
        ollama_result=ollama_result,
    )

    total_score = sum(item.score for item in quality_scores)
    max_score = len(quality_scores) * 5
    score_pct = round((total_score / max_score) * 100, 1) if max_score else 0

    print("")
    print("PASS: audit complete")
    print(f"Quality score: {total_score}/{max_score} ({score_pct}%)")
    print(f"Open: {out_dir / '00_INDEX.md'}")
    print(f"Next plan: {out_dir / '05_next_slice_plan.md'}")
    print("")
    print("Generated files:")
    for path in sorted(out_dir.glob("*.md")):
        print(f"  - {path.relative_to(root)}")
    print(f"  - {out_dir.relative_to(root) / 'raw'}/*.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())