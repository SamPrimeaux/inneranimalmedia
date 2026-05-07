#!/usr/bin/env python3
"""
audit_tenant_workspace_hardcoding.py
────────────────────────────────────
Find tenant_* / ws_* literals that look like hardcoded org/workspace IDs in:
  • Repo SQL (migrations/*.sql and optional paths)
  • Live D1 DDL (sqlite_master), via Wrangler — optional

Why: multi-tenant platforms should avoid DEFAULT 'tenant_…' / DEFAULT 'ws_…' and seed INSERTs
that pin one customer in schema; align defaults with NULL + triggers or app-layer resolution.

Usage (repo only — fast, no Cloudflare):
  python3 scripts/audit_tenant_workspace_hardcoding.py --repo-only

Usage (repo + remote D1 DDL — requires Wrangler auth):
  ./scripts/with-cloudflare-env.sh python3 scripts/audit_tenant_workspace_hardcoding.py \\
    --wrangler-config wrangler.production.toml --database inneranimalmedia-business --remote

Exit codes:
  0 — no findings (after exclusions)
  1 — findings printed (treat as CI warning/fail based on your policy)
  2 — tooling error (wrangler missing, query failed)

Environment:
  IAM_AUDIT_EXCLUDE_IDS   Comma-separated quoted ids to ignore (e.g. tenant_sam_primeaux)
  IAM_AUDIT_FAIL_ON_FIND  If set to 1, exit 1 when findings exist (default: 1)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


# Quoted string literals that look like IAM scope ids (tenant_*, ws_*).
RE_SCOPE_LITERAL = re.compile(
    r"['\"](?P<id>(?:tenant_[a-z0-9_]+|ws_[a-z0-9_]+))['\"]",
    re.IGNORECASE,
)

# Structural / meta tokens — not org identifiers (reduce noise).
DEFAULT_EXCLUDE_IDS: frozenset[str] = frozenset(
    {
        "tenant_id",
        "workspace_id",
        "tenant_slug",
        "workspace_slug",
        "tenant_ref_id",
    }
)


@dataclass(frozen=True)
class Finding:
    source: str  # file path or "d1:sqlite_master:<name>"
    line: int
    severity: str  # default | insert | seed | ddl_other
    snippet: str
    matched_id: str


def load_exclude_ids(extra: list[str] | None) -> set[str]:
    out = set(DEFAULT_EXCLUDE_IDS)
    env = os.environ.get("IAM_AUDIT_EXCLUDE_IDS", "").strip()
    if env:
        out.update(x.strip() for x in env.split(",") if x.strip())
    if extra:
        out.update(x.strip() for x in extra if x.strip())
    return out


def line_severity(line: str) -> str:
    """Heuristic: DEFAULT literals worst; COALESCE fallbacks and seeds next."""
    lu = line.upper()
    if "DEFAULT" in lu and RE_SCOPE_LITERAL.search(line):
        return "high"
    if "COALESCE" in lu and RE_SCOPE_LITERAL.search(line):
        return "medium"
    if "INSERT" in lu or "REPLACE" in lu:
        return "medium"
    return "low"


def scan_text(text: str, source_label: str, exclude_ids: set[str]) -> list[Finding]:
    """Scan SQL text (handles multiline CREATE TABLE from sqlite_master)."""
    findings: list[Finding] = []
    lines = text.splitlines()
    exclude_lower = {x.lower() for x in exclude_ids}

    for m in RE_SCOPE_LITERAL.finditer(text):
        vid = m.group("id")
        if vid.lower() in exclude_lower:
            continue
        pos = m.start()
        line_no = text.count("\n", 0, pos) + 1
        line_text = lines[line_no - 1] if 0 < line_no <= len(lines) else ""
        sev = line_severity(line_text)
        findings.append(
            Finding(
                source=source_label,
                line=line_no,
                severity=sev,
                snippet=line_text.strip()[:240],
                matched_id=vid,
            )
        )
    return findings


def scan_file(path: Path, exclude_ids: set[str]) -> list[Finding]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        print(f"[audit] skip read {path}: {e}", file=sys.stderr)
        return []
    return scan_text(text, str(path), exclude_ids)


def iter_sql_files(roots: list[Path], extensions: tuple[str, ...]) -> Iterable[Path]:
    for root in roots:
        if not root.exists():
            continue
        if root.is_file():
            if root.suffix.lower() in extensions:
                yield root
            continue
        for ext in extensions:
            yield from root.rglob(f"*{ext}")


def wrangler_fetch_sqlite_master(
    database: str,
    wrangler_config: Path,
    remote: bool,
) -> list[dict]:
    cmd = ["npx", "wrangler", "d1", "execute", database]
    if remote:
        cmd.append("--remote")
    cmd.extend(
        [
            "--json",
            "-c",
            str(wrangler_config),
            "--command",
            "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL "
            "ORDER BY type, name;",
        ]
    )

    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=os.getcwd())
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        raise RuntimeError(f"wrangler failed with exit {proc.returncode}")

    raw = proc.stdout.strip()
    try:
        batches = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"invalid JSON from wrangler: {e}\n{raw[:500]}") from e

    rows: list[dict] = []
    for batch in batches:
        for row in batch.get("results") or []:
            rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Audit tenant_/ws_ hardcoding in SQL + D1 DDL.")
    ap.add_argument(
        "--repo-only",
        action="store_true",
        help="Only scan repo files (no Wrangler / D1).",
    )
    ap.add_argument(
        "--migrations-dir",
        type=Path,
        default=Path("migrations"),
        help="Directory of *.sql migrations (default: migrations/).",
    )
    ap.add_argument(
        "--extra-path",
        action="append",
        default=[],
        type=Path,
        help="Additional file or directory to scan (repeatable).",
    )
    ap.add_argument(
        "--database",
        default=os.environ.get("D1_DATABASE_NAME", "inneranimalmedia-business"),
        help="D1 database name for Wrangler (default: inneranimalmedia-business).",
    )
    ap.add_argument(
        "--wrangler-config",
        type=Path,
        default=Path("wrangler.production.toml"),
        help="Wrangler config path.",
    )
    ap.add_argument(
        "--remote",
        action="store_true",
        help="Query remote D1 (omit for --local).",
    )
    ap.add_argument(
        "--exclude-id",
        action="append",
        default=[],
        help="Ignore this tenant_* / ws_* literal value (repeatable).",
    )
    ap.add_argument(
        "--json-out",
        action="store_true",
        help="Print findings as JSON lines to stdout.",
    )
    args = ap.parse_args()

    exclude_ids = load_exclude_ids(args.exclude_id)
    all_findings: list[Finding] = []

    scan_roots: list[Path] = [args.migrations_dir] + list(args.extra_path)
    for path in iter_sql_files(scan_roots, (".sql",)):
        all_findings.extend(scan_file(path, exclude_ids))

    if not args.repo_only:
        cfg = args.wrangler_config
        if not cfg.is_file():
            print(f"[audit] wrangler config not found: {cfg} — use --repo-only", file=sys.stderr)
            return 2
        try:
            rows = wrangler_fetch_sqlite_master(
                args.database,
                cfg,
                remote=args.remote,
            )
        except RuntimeError as e:
            print(f"[audit] D1 DDL fetch failed: {e}", file=sys.stderr)
            return 2
        for row in rows:
            name = row.get("name") or ""
            typ = row.get("type") or ""
            sql = row.get("sql") or ""
            if not sql:
                continue
            label = f"d1:{typ}:{name}"
            all_findings.extend(scan_text(sql, label, exclude_ids))

    # Dedupe identical findings
    seen: set[tuple[str, int, str, str]] = set()
    deduped: list[Finding] = []
    for f in all_findings:
        key = (f.source, f.line, f.matched_id, f.snippet)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(f)

    deduped.sort(key=lambda x: (x.severity, x.source, x.line))

    fail_on = os.environ.get("IAM_AUDIT_FAIL_ON_FIND", "1") == "1"

    if args.json_out:
        for f in deduped:
            print(
                json.dumps(
                    {
                        "severity": f.severity,
                        "matched_id": f.matched_id,
                        "source": f.source,
                        "line": f.line,
                        "snippet": f.snippet,
                    }
                )
            )
    else:
        print(f"audit_tenant_workspace_hardcoding — {len(deduped)} finding(s)")
        print(f"excluded ids: {sorted(exclude_ids)}")
        print()
        for f in deduped:
            print(f"[{f.severity:6}] {f.matched_id}")
            print(f"         {f.source}:{f.line}")
            print(f"         {f.snippet}")
            print()

    if deduped and fail_on:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
