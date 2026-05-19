#!/usr/bin/env python3
"""
Shared helpers for Plans 1–7 audit scripts (read-only D1 + repo grep + reports).

Copy pattern from: scripts/audit_run_spine_linkage.py, scripts/audit_agentsam_table_usage.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
ARTIFACTS_ROOT = Path("artifacts/plan_audits")

IGNORE_DIRS = frozenset({
    ".git",
    "node_modules",
    ".wrangler",
    "dist",
    "build",
    ".next",
    "coverage",
    ".cache",
    "dashboard/dist",
})

CODE_SCAN_EXTENSIONS = frozenset({
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".sql", ".md", ".json", ".toml",
})

DEFAULT_SCAN_ROOTS = ("src", "dashboard", "migrations", "scripts")


def repo_root() -> Path:
    """Resolve repo root from scripts/lib or scripts/plan*.py location."""
    here = Path(__file__).resolve()
    if here.parent.name == "lib" and here.parent.parent.name == "scripts":
        return here.parent.parent.parent
    return Path.cwd()


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def qident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


@dataclass
class AuditConfig:
    db: str = DEFAULT_DB
    config: str = DEFAULT_CONFIG
    remote: bool = True
    root: Path = field(default_factory=repo_root)

    def wrangler_base(self) -> List[str]:
        cmd: List[str] = []
        wrapper = self.root / "scripts" / "with-cloudflare-env.sh"
        if wrapper.is_file():
            cmd.append(str(wrapper))
        cmd.extend(["npx", "wrangler", "d1", "execute", self.db])
        if self.remote:
            cmd.append("--remote")
        if self.config:
            cmd.extend(["-c", self.config])
        cmd.append("--json")
        return cmd


def run_cmd(cmd: Sequence[str], *, cwd: Optional[Path] = None, timeout: int = 300) -> Tuple[int, str, str]:
    proc = subprocess.run(
        list(cmd),
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )
    return proc.returncode, proc.stdout, proc.stderr


def strip_json(stdout: str) -> str:
    s = stdout.strip()
    if not s:
        return s
    if s.startswith("[") or s.startswith("{"):
        return s
    starts = [x for x in (s.find("["), s.find("{")) if x >= 0]
    return s[min(starts) :].strip() if starts else s


def d1_query(cfg: AuditConfig, sql: str) -> List[Dict[str, Any]]:
    cmd = cfg.wrangler_base() + ["--command", sql]
    rc, out, err = run_cmd(cmd, cwd=cfg.root)
    if rc != 0:
        raise RuntimeError(
            "D1 query failed\n"
            f"SQL: {sql}\n"
            f"CMD: {' '.join(shlex.quote(c) for c in cmd)}\n"
            f"STDERR:\n{err}\n"
            f"STDOUT:\n{out}"
        )
    raw = strip_json(out)
    if not raw:
        return []
    payload = json.loads(raw)
    if isinstance(payload, list):
        if payload and isinstance(payload[0], dict) and "results" in payload[0]:
            return payload[0].get("results") or []
        return payload
    if isinstance(payload, dict):
        if "results" in payload:
            return payload.get("results") or []
        if "result" in payload and isinstance(payload["result"], list):
            return payload["result"]
    return []


def safe_d1_query(cfg: AuditConfig, sql: str) -> Tuple[bool, Any]:
    try:
        return True, d1_query(cfg, sql)
    except Exception as e:
        return False, str(e)


def table_columns(cfg: AuditConfig, table: str) -> List[str]:
    ok, res = safe_d1_query(cfg, f"PRAGMA table_info({qident(table)});")
    if not ok or not isinstance(res, list):
        return []
    return [str(r.get("name") or "") for r in res if r.get("name")]


def table_exists(cfg: AuditConfig, table: str) -> bool:
    ok, res = safe_d1_query(
        cfg,
        f"""
        SELECT 1 AS ok FROM sqlite_master
        WHERE type IN ('table','view') AND name = '{table.replace("'", "''")}'
        LIMIT 1;
        """,
    )
    return bool(ok and res)


def finding(
    severity: str,
    category: str,
    title: str,
    evidence: str,
    suggestion: str = "",
    targets: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "severity": severity,
        "category": category,
        "title": title,
        "evidence": evidence,
        "suggestion": suggestion,
        "targets": targets or [],
    }


@dataclass
class GrepHit:
    path: str
    line_no: int
    line: str

    def as_target(self) -> str:
        return f"{self.path}:{self.line_no}"


def should_scan_file(path: Path, root: Path) -> bool:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return False
    if any(part in IGNORE_DIRS for part in rel.parts):
        return False
    if "patch_results" in rel.parts:
        return False
    return path.suffix in CODE_SCAN_EXTENSIONS


def grep_repo(
    cfg: AuditConfig,
    terms: Sequence[str],
    *,
    scan_roots: Sequence[str] = DEFAULT_SCAN_ROOTS,
    max_hits_per_term: int = 200,
) -> Dict[str, List[GrepHit]]:
    """Fixed-string grep per term under scan_roots."""
    out: Dict[str, List[GrepHit]] = {t: [] for t in terms}
    root = cfg.root

    for term in terms:
        if not term:
            continue
        collected: List[GrepHit] = []
        rg = shutil.which("rg")
        if rg:
            for scan in scan_roots:
                base = root / scan
                if not base.exists():
                    continue
                glob_args: List[str] = []
                for d in IGNORE_DIRS:
                    glob_args.extend(["--glob", f"!{d}/**"])
                proc = run_cmd(
                    [
                        rg,
                        "--fixed-strings",
                        "--line-number",
                        "--no-heading",
                        *glob_args,
                        term,
                        str(base),
                    ],
                    cwd=root,
                    timeout=120,
                )
                if proc[0] != 0 and not proc[1]:
                    continue
                for ln in proc[1].splitlines():
                    if len(collected) >= max_hits_per_term:
                        break
                    parts = ln.split(":", 2)
                    if len(parts) >= 3:
                        try:
                            collected.append(
                                GrepHit(
                                    path=str(Path(parts[0]).relative_to(root)),
                                    line_no=int(parts[1]),
                                    line=parts[2][:500],
                                )
                            )
                        except (ValueError, TypeError):
                            pass
        else:
            for scan in scan_roots:
                base = root / scan
                if not base.is_dir():
                    continue
                for dirpath, dirnames, filenames in os.walk(base):
                    dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
                    for fn in filenames:
                        p = Path(dirpath) / fn
                        if not should_scan_file(p, root):
                            continue
                        try:
                            text = p.read_text(encoding="utf-8", errors="ignore")
                        except OSError:
                            continue
                        if term not in text:
                            continue
                        rel = str(p.relative_to(root))
                        for i, line in enumerate(text.splitlines(), start=1):
                            if term in line:
                                collected.append(GrepHit(rel, i, line[:500]))
                                break
                        if len(collected) >= max_hits_per_term:
                            break
                    if len(collected) >= max_hits_per_term:
                        break

        out[term] = collected
    return out


def summarize_grep(hits: Mapping[str, List[GrepHit]], *, max_files: int = 25) -> Dict[str, Any]:
    summary: Dict[str, Any] = {}
    for term, rows in hits.items():
        files = sorted({h.path for h in rows})
        summary[term] = {
            "hit_count": len(rows),
            "file_count": len(files),
            "files": files[:max_files],
            "targets": [h.as_target() for h in rows[:40]],
        }
    return summary


def count_findings(findings: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {"blocker": 0, "warning": 0, "info": 0}
    for f in findings:
        sev = str(f.get("severity") or "info").lower()
        if sev in counts:
            counts[sev] += 1
        else:
            counts["info"] += 1
    return counts


def build_report_payload(
    plan_id: int,
    plan_slug: str,
    cfg: AuditConfig,
    *,
    summary: Dict[str, Any],
    findings: List[Dict[str, Any]],
    metrics: Optional[Dict[str, Any]] = None,
    grep_summary: Optional[Dict[str, Any]] = None,
    suggested_patches: Optional[List[str]] = None,
) -> Dict[str, Any]:
    counts = count_findings(findings)
    return {
        "plan_id": plan_id,
        "plan_slug": plan_slug,
        "generated_at": now_iso(),
        "repo_root": str(cfg.root.resolve()),
        "d1": {"db": cfg.db, "config": cfg.config, "remote": cfg.remote},
        "summary": {
            **summary,
            "blocker_count": counts["blocker"],
            "warning_count": counts["warning"],
            "info_count": counts["info"],
            "pass": counts["blocker"] == 0,
        },
        "metrics": metrics or {},
        "grep": grep_summary or {},
        "findings": findings,
        "suggested_patches": suggested_patches or [],
    }


def render_markdown(report: Dict[str, Any]) -> str:
    s = report.get("summary") or {}
    lines = [
        f"# Plan {report.get('plan_id')} audit — `{report.get('plan_slug')}`",
        "",
        f"- **Generated:** {report.get('generated_at')}",
        f"- **Repo:** `{report.get('repo_root')}`",
        f"- **D1:** `{report['d1']['db']}` remote={report['d1']['remote']}",
        f"- **Pass:** {s.get('pass')} (blockers={s.get('blocker_count')}, warnings={s.get('warning_count')})",
        "",
        "## Summary",
        "",
    ]
    for k, v in (report.get("summary") or {}).items():
        if k in ("pass", "blocker_count", "warning_count", "info_count"):
            continue
        lines.append(f"- **{k}:** {v}")
    lines.append("")

    metrics = report.get("metrics") or {}
    if metrics:
        lines.append("## Metrics")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(metrics, indent=2)[:12000])
        lines.append("```")
        lines.append("")

    findings = report.get("findings") or []
    if findings:
        lines.append("## Findings")
        lines.append("")
        lines.append("| Sev | Cat | Title |")
        lines.append("|-----|-----|-------|")
        for f in findings:
            title = str(f.get("title", "")).replace("|", "\\|")[:80]
            lines.append(
                f"| {f.get('severity')} | {f.get('category')} | {title} |"
            )
        lines.append("")
        for f in findings:
            lines.append(f"### [{f.get('severity')}] {f.get('title')}")
            lines.append("")
            if f.get("evidence"):
                lines.append(f"**Evidence:** {f.get('evidence')}")
                lines.append("")
            if f.get("suggestion"):
                lines.append(f"**Suggestion:** {f.get('suggestion')}")
                lines.append("")
            tg = f.get("targets") or []
            if tg:
                lines.append("**Targets:**")
                for t in tg[:30]:
                    lines.append(f"- `{t}`")
                lines.append("")

    patches = report.get("suggested_patches") or []
    if patches:
        lines.append("## Suggested patches (order)")
        lines.append("")
        for i, p in enumerate(patches, start=1):
            lines.append(f"{i}. {p}")
        lines.append("")

    grep = report.get("grep") or {}
    if grep:
        lines.append("## Grep appendix")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(grep, indent=2)[:16000])
        lines.append("```")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_plan_report(
    plan_id: int,
    plan_slug: str,
    report: Dict[str, Any],
    *,
    root: Optional[Path] = None,
) -> Tuple[Path, Path]:
    base = (root or repo_root()) / ARTIFACTS_ROOT / f"plan{plan_id:02d}_{plan_slug}"
    base.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = base / f"audit_{stamp}.json"
    md_path = base / f"audit_{stamp}.md"
    latest_json = base / f"LATEST_PLAN{plan_id:02d}_{plan_slug.upper()}.json"
    latest_md = base / f"LATEST_PLAN{plan_id:02d}_{plan_slug.upper()}.md"

    text = json.dumps(report, indent=2, ensure_ascii=False)
    md = render_markdown(report)
    json_path.write_text(text, encoding="utf-8")
    md_path.write_text(md, encoding="utf-8")
    latest_json.write_text(text, encoding="utf-8")
    latest_md.write_text(md, encoding="utf-8")
    return latest_json, latest_md


def add_base_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--local", action="store_true", help="Use local D1 instead of --remote")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit 1 when any blocker finding exists",
    )
    parser.add_argument(
        "--no-d1",
        action="store_true",
        help="Skip remote D1 queries (code/grep only)",
    )


def config_from_args(args: argparse.Namespace) -> AuditConfig:
    root = repo_root()
    os.chdir(root)
    return AuditConfig(
        db=args.db,
        config=args.config,
        remote=not args.local,
        root=root,
    )
