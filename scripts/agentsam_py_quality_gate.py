#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import py_compile
import re
import sys
import time
from pathlib import Path
from typing import Any

BAD_TOKENS = [
    "cmdand",
    "heredoc>",
    "quote>",
    "zsh:",
    "samprimeaux@",
    "SyntaxError: invalid syntax",
    "event not found",
]

SHELL_START_RE = re.compile(r"^\s*(cd|mkdir|chmod|cat|open|pbpaste|set -a|source|git|npx|curl)\b")
WRITE_HINTS = [
    ".write_text(",
    ".write_bytes(",
    "open(",
    "shutil.copy",
    "subprocess.run(",
    "os.remove(",
    "unlink(",
    "rmtree(",
    "rename(",
    "replace(",
]

SAFETY_HINTS = [
    "--apply",
    "dry",
    "backup",
    "rollback",
    "git status",
    "manifest",
    "artifacts",
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def is_probably_generated_script(path: Path) -> bool:
    if path.suffix != ".py":
        return False
    if "__pycache__" in path.parts:
        return False
    if path.name.startswith("."):
        return False
    return True


def py_compile_check(path: Path) -> dict[str, Any]:
    try:
        py_compile.compile(str(path), doraise=True)
        return {"ok": True, "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def ast_check(path: Path, text: str) -> dict[str, Any]:
    try:
        ast.parse(text, filename=str(path))
        return {"ok": True, "error": None}
    except SyntaxError as exc:
        return {
            "ok": False,
            "error": {
                "message": exc.msg,
                "line": exc.lineno,
                "offset": exc.offset,
                "text": exc.text,
            },
        }


def content_smell_check(path: Path, text: str) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    lines = text.splitlines()

    for token in BAD_TOKENS:
        if token in text:
            issues.append({
                "severity": "critical",
                "kind": "shell_or_terminal_garbage",
                "message": f"Found terminal/heredoc garbage token: {token}",
            })

    for idx, line in enumerate(lines[:20], start=1):
        if idx == 1 and line.startswith("#!"):
            continue
        if SHELL_START_RE.search(line):
            issues.append({
                "severity": "critical",
                "kind": "shell_pasted_into_python",
                "line": idx,
                "message": f"Line looks like shell, not Python: {line[:160]}",
            })

    if "\\n    " in text or "\\n\n" in text:
        issues.append({
            "severity": "high",
            "kind": "literal_newline_escape",
            "message": "Found literal backslash-n patterns that may indicate a broken patch inserted escaped newlines.",
        })

    if text.count("def main(") == 0 and "argparse" in text:
        issues.append({
            "severity": "medium",
            "kind": "missing_main_function",
            "message": "argparse script has no def main function.",
        })

    if 'if __name__ == "__main__"' not in text:
        issues.append({
            "severity": "medium",
            "kind": "missing_main_guard",
            "message": "Missing standard main guard.",
        })

    lower = text.lower()
    has_write_or_exec = any(hint in text for hint in WRITE_HINTS)

    # Ingestion/vectorization tools are allowed to be write-capable if they have
    # explicit remote-write gates and artifact output. They are not repo patchers,
    # so requiring git-status language creates noisy warnings.
    looks_like_ingester = (
        "vectorize" in lower
        or "embedding" in lower
        or "upsert" in lower
        or "ollama" in lower
    )
    has_safe_remote_gate = (
        "--upsert" in text
        and ("dry run" in lower or "dry-run" in lower or "dry_run" in lower)
        and "artifact" in lower
        and "manifest" in lower
    )

    # Repo patchers / migration scripts need the full safety contract.
    looks_like_repo_patcher = (
        "apply_patch" in lower
        or "migration" in lower
        or "write_file" in lower
        or "repo" in lower and "--apply" in text
        or "git status" in lower
    )

    if has_write_or_exec and looks_like_ingester and has_safe_remote_gate:
        pass
    elif has_write_or_exec and looks_like_repo_patcher:
        missing = [hint for hint in SAFETY_HINTS if hint not in lower]
        if missing:
            issues.append({
                "severity": "high",
                "kind": "repo_patch_script_missing_safety_contract",
                "message": "Repo patch/migration style script appears to lack required dry-run, backup, rollback, git, manifest, or artifact safety terms.",
                "missing_safety_terms": missing,
            })
    elif has_write_or_exec and "--apply" in text and ("backup" not in lower or "rollback" not in lower):
        issues.append({
            "severity": "high",
            "kind": "apply_script_missing_backup_or_rollback",
            "message": "Script has apply mode but lacks obvious backup or rollback handling.",
        })

    return issues


def audit(root: Path, targets: list[Path]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []

    for path in targets:
        text = read(path)
        compile_result = py_compile_check(path)
        ast_result = ast_check(path, text)
        smell_issues = content_smell_check(path, text)

        status = "pass"
        if not compile_result["ok"] or not ast_result["ok"]:
            status = "fail"
        elif any(i["severity"] in {"critical", "high"} for i in smell_issues):
            status = "warn"

        rows.append({
            "path": str(path.relative_to(root)),
            "status": status,
            "bytes": path.stat().st_size,
            "py_compile": compile_result,
            "ast_parse": ast_result,
            "issues": smell_issues,
        })

    failed = [r for r in rows if r["status"] == "fail"]
    warned = [r for r in rows if r["status"] == "warn"]

    return {
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "root": str(root),
        "checked": len(rows),
        "failed": len(failed),
        "warned": len(warned),
        "passed": len(rows) - len(failed) - len(warned),
        "rows": rows,
    }


def main() -> int:
    root = Path.cwd().resolve()
    args = sys.argv[1:]

    if args:
        targets = [Path(a).resolve() for a in args]
    else:
        targets = [p for p in sorted((root / "scripts").rglob("*.py")) if is_probably_generated_script(p)]

    targets = [p for p in targets if p.exists() and p.is_file()]

    outdir = root / "artifacts" / "agentsam_py_quality_gate" / time.strftime("%Y%m%d_%H%M%S")
    outdir.mkdir(parents=True, exist_ok=True)

    result = audit(root, targets)

    (outdir / "summary.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = [
        "# Agent Sam Python Quality Gate",
        "",
        f"- Checked: {result['checked']}",
        f"- Passed: {result['passed']}",
        f"- Warned: {result['warned']}",
        f"- Failed: {result['failed']}",
        "",
        "## Non-pass Files",
        "",
    ]

    for row in result['rows']:
        if row['status'] != "pass":
            lines.append(f"### {row['path']}")
            lines.append(f"- Status: {row['status']}")
            if not row['py_compile']['ok']:
                lines.append(f"- py_compile: {row['py_compile']['error']}")
            if not row['ast_parse']['ok']:
                lines.append(f"- ast_parse: {row['ast_parse']['error']}")
            for issue in row['issues']:
                lines.append(f"- {issue['severity']}: {issue['kind']} — {issue['message']}")
            lines.append("")

    (outdir / "INDEX.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    print(f"Quality gate artifacts: {outdir}")
    print(f"checked={result['checked']} passed={result['passed']} warned={result['warned']} failed={result['failed']}")

    for row in result['rows']:
        if row['status'] != 'pass':
            print(f"\\n{row['status'].upper()}: {row['path']}")
            if not row['py_compile']['ok']:
                print(f"  py_compile: {row['py_compile']['error']}")
            if not row['ast_parse']['ok']:
                print(f"  ast_parse: {row['ast_parse']['error']}")
            for issue in row['issues']:
                print(f"  {issue['severity']}: {issue['kind']} — {issue['message']}")

    return 1 if result['failed'] else 0


if __name__ == "__main__":
    raise SystemExit(main())
