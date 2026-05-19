#!/usr/bin/env python3
"""
audit_github_account_repo_scoping_clean.py
-------------------------------------------
Source-only audit. Scans: src/, dashboard/, worker.js, scripts/
Excludes:            artifacts/, analytics/, node_modules, dist

Writes SOURCE_HITS.md to repo root.

Usage:
    python3 scripts/audit_github_account_repo_scoping_clean.py
    python3 scripts/audit_github_account_repo_scoping_clean.py --root /path/to/repo
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

DEFAULT_ROOT = Path("/Users/samprimeaux/inneranimalmedia")

SOURCE_DIRS       = {"src", "dashboard", "scripts"}
SOURCE_ROOT_FILES = {"worker.js", "worker.ts"}
SCAN_EXTENSIONS   = {".js", ".ts", ".tsx", ".jsx", ".py", ".sql"}
SKIP_DIRS = {
    "node_modules", ".git", "dist", ".wrangler", "__pycache__",
    ".venv", "venv", ".next", "coverage", ".turbo",
    "artifacts", "analytics",
}

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "INFO": 3}


@dataclass
class Finding:
    priority: int
    pattern_id: str
    severity: str
    file: str
    line: int
    snippet: str
    detail: str
    recommendation: str


# ---------------------------------------------------------------------------
# Compiled patterns — all verified to compile cleanly
# ---------------------------------------------------------------------------

RE_TOKEN_NO_USER = re.compile(
    r"(SELECT|prepare|query|first|all)\b[^;`\n]{0,120}"
    r"(oauth_tokens|github_tokens|provider_tokens|user_oauth|integrations)",
    re.IGNORECASE,
)

RE_LIMIT1 = re.compile(r"LIMIT\s+1\b", re.IGNORECASE)

RE_ENV_GITHUB_TOKEN = re.compile(r"\benv\.GITHUB_TOKEN\b")

RE_GITHUB_REPOS_ROUTE = re.compile(
    r"['\"`]/api/integrations/github/repos['\"`]"
    r"|router\.(get|post)\s*\(['\"`][^'\"` ]*github[^'\"` ]*repos[^'\"` ]*['\"`]",
    re.IGNORECASE,
)

RE_CACHE_KEY = re.compile(
    r"['\"`]github[:\-_]repos?['\"`]|cache\.(set|get|put)\s*\(['\"`]github",
    re.IGNORECASE,
)

RE_OAUTH_CALLBACK = re.compile(
    r"(github.*callback|callback.*github|/auth/github|oauth.*complete|token.*store)",
    re.IGNORECASE,
)

RE_404 = re.compile(
    r"status\s*[=!]==?\s*404|\.status\s*===?\s*404",
    re.IGNORECASE,
)

RE_RECONNECT_ACTION = re.compile(
    r"reconnect|startOAuth|initOAuth|clearRepo|setRepos\s*\(\s*\[\s*\)",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# File collector
# ---------------------------------------------------------------------------

def collect_files(root: Path) -> list[Path]:
    results = []
    for name in SOURCE_ROOT_FILES:
        p = root / name
        if p.exists():
            results.append(p)
    for dirname in SOURCE_DIRS:
        d = root / dirname
        if not d.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(d):
            dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
            for fn in filenames:
                p = Path(dirpath) / fn
                if p.suffix in SCAN_EXTENSIONS:
                    results.append(p)
    return results


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def scan_file(path: Path, root: Path) -> list[Finding]:
    rel = str(path.relative_to(root))
    findings: list[Finding] = []

    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return findings

    lines = raw.splitlines()
    is_frontend = "dashboard" in rel or path.suffix in {".tsx", ".jsx"}

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("#"):
            continue

        low = line.lower()

        # ── P1A: token table access without user_id ──────────────────────
        if RE_TOKEN_NO_USER.search(line):
            block = " ".join(lines[max(0, i-3):min(len(lines), i+6)])
            if "user_id" not in block.lower() and "userid" not in block.lower():
                has_limit1 = bool(RE_LIMIT1.search(block))
                findings.append(Finding(
                    priority=1,
                    pattern_id="P1A-TOKEN-NO-USER-FILTER",
                    severity="CRITICAL" if has_limit1 else "HIGH",
                    file=rel, line=i, snippet=stripped[:120],
                    detail=(
                        "OAuth/token table access with no user_id filter"
                        + (" + LIMIT 1 — returns any token" if has_limit1 else "")
                    ),
                    recommendation="WHERE provider='github' AND user_id=currentUser.id AND provider_account_id=?",
                ))

        # ── P1B: env.GITHUB_TOKEN fallback ───────────────────────────────
        if RE_ENV_GITHUB_TOKEN.search(line):
            block = " ".join(lines[max(0, i-5):min(len(lines), i+5)])
            is_admin = "admin" in block.lower() or "internal" in block.lower()
            findings.append(Finding(
                priority=1,
                pattern_id="P1B-ENV-GITHUB-TOKEN-FALLBACK",
                severity="CRITICAL" if not is_admin else "MEDIUM",
                file=rel, line=i, snippet=stripped[:120],
                detail=(
                    "env.GITHUB_TOKEN used"
                    + (" — Connor will see Sam's repos" if not is_admin else " (admin context)")
                ),
                recommendation=(
                    "Remove fallback for user-facing routes. "
                    "Return 401 if user token missing. "
                    "Only allow in clearly-marked admin routes."
                ),
            ))

        # ── P1C: /api/integrations/github/repos route definition ─────────
        if RE_GITHUB_REPOS_ROUTE.search(line):
            block = " ".join(lines[max(0, i-2):min(len(lines), i+20)])
            low_block = block.lower()
            missing = []
            if "user_id" not in low_block and "userid" not in low_block:
                missing.append("user_id from session")
            if "provider_account" not in low_block and "account_id" not in low_block:
                missing.append("provider_account_id filter")
            if "workspace" not in low_block:
                missing.append("workspace_id check")
            if "env.github_token" in low_block:
                missing.append("USES env.GITHUB_TOKEN FALLBACK")
            sev = "CRITICAL" if missing else "INFO"
            findings.append(Finding(
                priority=1,
                pattern_id="P1C-REPOS-ROUTE-MISSING-GUARDS" if missing else "P1C-REPOS-ROUTE-FOUND",
                severity=sev,
                file=rel, line=i, snippet=stripped[:120],
                detail=(
                    f"Handler missing: {', '.join(missing)}." if missing
                    else "Route found — guards appear present. Verify full handler body."
                ),
                recommendation=(
                    "(1) Resolve user from session. "
                    "(2) SELECT token WHERE provider='github' AND user_id=user.id. "
                    "(3) Return 401 if no token. "
                    "(4) Never fall back to env.GITHUB_TOKEN."
                ),
            ))

        # ── P2: cache key scoping ─────────────────────────────────────────
        if RE_CACHE_KEY.search(line):
            block = " ".join(lines[max(0, i-3):min(len(lines), i+3)])
            low_block = block.lower()
            missing = []
            if "user_id" not in low_block and "userid" not in low_block:
                missing.append("user_id")
            if "provider_account" not in low_block and "account_id" not in low_block:
                missing.append("provider_account_id")
            if "workspace" not in low_block:
                missing.append("workspace_id")
            if missing:
                findings.append(Finding(
                    priority=2,
                    pattern_id="P2-CACHE-KEY-UNSCOPED",
                    severity="CRITICAL",
                    file=rel, line=i, snippet=stripped[:120],
                    detail=f"Cache key missing: {', '.join(missing)}.",
                    recommendation="Key: `github:repos:${user_id}:${provider_account_id}:${workspace_id}`",
                ))

        # ── P3: OAuth callback identity validation ────────────────────────
        if RE_OAUTH_CALLBACK.search(line) and not is_frontend:
            block = " ".join(lines[max(0, i-2):min(len(lines), i+25)])
            low_block = block.lower()
            issues = []
            if "state" not in low_block:
                issues.append("state param not validated")
            if "user_id" not in low_block and "userid" not in low_block:
                issues.append("user_id not bound to token")
            if "provider_account_id" not in low_block and "account_id" not in low_block:
                issues.append("provider_account_id not stored")
            if "account_login" not in low_block and "login" not in low_block:
                issues.append("account_login not stored")
            if issues:
                findings.append(Finding(
                    priority=3,
                    pattern_id="P3-OAUTH-CALLBACK-BINDING",
                    severity="HIGH",
                    file=rel, line=i, snippet=stripped[:120],
                    detail=f"OAuth callback: {'; '.join(issues)}.",
                    recommendation=(
                        "Store token with user_id, provider_account_id, account_login, provider='github'. "
                        "Validate state param contains user_id."
                    ),
                ))

        # ── P4: 404 triggers reconnect ────────────────────────────────────
        if is_frontend and RE_404.search(line):
            block = " ".join(lines[max(0, i-1):min(len(lines), i+10)])
            if RE_RECONNECT_ACTION.search(block):
                findings.append(Finding(
                    priority=4,
                    pattern_id="P4-404-RECONNECT",
                    severity="HIGH",
                    file=rel, line=i, snippet=stripped[:120],
                    detail="Frontend 404 handler triggers reconnect or clears repo state.",
                    recommendation=(
                        "404 = path not found, not auth failure. "
                        "Only 401/403 triggers auth flow. "
                        "Show error in UI, do not clear state."
                    ),
                ))

    return findings


# ---------------------------------------------------------------------------
# SOURCE_HITS.md writer
# ---------------------------------------------------------------------------

PRIORITY_LABELS = {
    1: "Backend token selection (/api/integrations/github/repos)",
    2: "Repo list cache key scoping",
    3: "OAuth callback token binding",
    4: "Frontend 404/reconnect behavior",
}


def write_source_hits(findings: list[Finding], out_path: Path) -> None:
    findings.sort(key=lambda f: (f.priority, SEVERITY_ORDER.get(f.severity, 9), f.file, f.line))

    by_priority: dict[int, list[Finding]] = {}
    for f in findings:
        by_priority.setdefault(f.priority, []).append(f)

    counts: dict[str, int] = {}
    for f in findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1

    out = [
        "# SOURCE_HITS.md — GitHub Account/Repo Scoping Audit",
        "",
        "Scanned: `src/`, `dashboard/`, `worker.js`, `scripts/`",
        "Excluded: `artifacts/`, `analytics/`, `node_modules`, `dist`",
        "",
        "## Summary",
        "",
    ]
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "INFO"]:
        if sev in counts:
            out.append(f"- {sev}: {counts[sev]}")

    out += ["", "---", ""]

    for p in sorted(by_priority.keys()):
        group = by_priority[p]
        out.append(f"## Priority {p} — {PRIORITY_LABELS.get(p, '')}")
        out.append("")

        by_pattern: dict[str, list[Finding]] = {}
        for f in group:
            by_pattern.setdefault(f.pattern_id, []).append(f)

        for pid, pgroup in by_pattern.items():
            sev = pgroup[0].severity
            out.append(f"### [{sev}] {pid}  ({len(pgroup)} hit{'s' if len(pgroup) != 1 else ''})")
            out.append("")
            out.append(f"**Fix:** {pgroup[0].recommendation}")
            out.append("")
            for f in pgroup:
                out.append(f"- `{f.file}:{f.line}`")
                out.append(f"  `{f.snippet}`")
                out.append(f"  {f.detail}")
            out.append("")

    out += [
        "---",
        "",
        "## Patch order",
        "",
        "1. **P1C hit** — open that file, inspect the full token selection block.",
        "   If CRITICAL: fix token query first.",
        "2. Fix cache key: `github:repos:${user_id}:${provider_account_id}:${workspace_id}`",
        "3. OAuth callback: confirm user_id, provider_account_id, account_login all stored.",
        "4. Frontend 404: no reconnect, no state clear.",
        "",
        "## Noise ignored",
        "",
        "- `inneranimalmedia` strings — project/bucket name, not a scoping bug.",
        "- Everything in `artifacts/` and `analytics/`.",
    ]

    out_path.write_text("\n".join(out), encoding="utf-8")
    print(f"SOURCE_HITS.md written: {out_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--out", default="SOURCE_HITS.md")
    parser.add_argument("--json", metavar="FILE")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists():
        print(f"ERROR: {root} does not exist", file=sys.stderr)
        sys.exit(1)

    files = collect_files(root)
    print(f"Scanning {len(files)} source files ...", file=sys.stderr)

    all_findings: list[Finding] = []
    for path in files:
        all_findings.extend(scan_file(path, root))

    seen: set[tuple] = set()
    deduped: list[Finding] = []
    for f in all_findings:
        key = (f.pattern_id, f.file, f.line)
        if key not in seen:
            seen.add(key)
            deduped.append(f)

    write_source_hits(deduped, Path(args.out))

    if args.json:
        Path(args.json).write_text(
            json.dumps([asdict(f) for f in deduped], indent=2),
            encoding="utf-8",
        )

    print(f"\nTotal findings: {len(deduped)}")
    by_p: dict[int, int] = {}
    for f in deduped:
        by_p[f.priority] = by_p.get(f.priority, 0) + 1
    for p in sorted(by_p):
        print(f"  Priority {p}: {by_p[p]}")

    sys.exit(1 if any(f.severity == "CRITICAL" for f in deduped) else 0)


if __name__ == "__main__":
    main()
