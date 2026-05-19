#!/usr/bin/env python3
"""
audit_github_account_repo_scoping.py
-------------------------------------
Scans the inneranimalmedia codebase for GitHub OAuth/token/repo scoping bugs.
Targets the six known failure patterns from the P0-B spec.

Usage:
    python scripts/audit_github_account_repo_scoping.py
    python scripts/audit_github_account_repo_scoping.py --root /path/to/repo
    python scripts/audit_github_account_repo_scoping.py --json findings.json
"""

import argparse
import ast
import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_ROOT = Path("/Users/samprimeaux/inneranimalmedia")

SCAN_EXTENSIONS = {".js", ".ts", ".tsx", ".jsx", ".py", ".sql", ".json", ".toml"}

SKIP_DIRS = {
    "node_modules", ".git", "dist", ".wrangler", "__pycache__",
    ".venv", "venv", ".next", "coverage", ".turbo",
}

# ---------------------------------------------------------------------------
# Finding model
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    pattern_id: str
    severity: str           # CRITICAL / HIGH / MEDIUM / INFO
    file: str
    line: int
    snippet: str
    detail: str
    recommendation: str


# ---------------------------------------------------------------------------
# Pattern registry
# ---------------------------------------------------------------------------

@dataclass
class Pattern:
    id: str
    name: str
    severity: str
    description: str
    recommendation: str
    # Each checker is (compiled_regex | None, custom_fn | None)
    # custom_fn signature: (path, lines) -> list[Finding]


PATTERNS: list[Pattern] = [

    Pattern(
        id="P1-TOKEN-FALLBACK",
        name="Global GitHub token fallback",
        severity="CRITICAL",
        description=(
            "Token query lacks user_id filter — backend may fall back to any "
            "stored GitHub token (e.g. Sam's) when Connor's token is missing."
        ),
        recommendation=(
            "All GitHub token lookups must filter by user_id AND provider='github'. "
            "Never use LIMIT 1 without a user_id WHERE clause."
        ),
    ),

    Pattern(
        id="P2-SHARED-CACHE-KEY",
        name="Shared repo cache key (missing user/account scope)",
        severity="CRITICAL",
        description=(
            "Cache key for GitHub repo list does not include user_id or "
            "provider_account_id, so all users share the same cached list."
        ),
        recommendation=(
            "Cache key must be composed as: "
            "github:repos:{user_id}:{provider_account_id} or equivalent."
        ),
    ),

    Pattern(
        id="P3-MISSING-USER-FILTER",
        name="SQL/query missing user_id or workspace_id filter",
        severity="CRITICAL",
        description=(
            "Database query on oauth_tokens or github_sync tables does not "
            "scope by user_id or workspace_id."
        ),
        recommendation=(
            "Every query touching oauth/token/github tables must include "
            "WHERE user_id = ? and WHERE workspace_id = ? as appropriate."
        ),
    ),

    Pattern(
        id="P4-LOCALSTORAGE-BLEED",
        name="Frontend localStorage GitHub owner/repo stored globally",
        severity="HIGH",
        description=(
            "GitHubExplorer or SourcePanel stores selected owner or repo in "
            "localStorage without a user-scoped key, causing state bleed "
            "between users/accounts."
        ),
        recommendation=(
            "Namespace all localStorage keys with user_id or workspace_id: "
            "e.g. github:selected_repo:{user_id}."
        ),
    ),

    Pattern(
        id="P5-OAUTH-CALLBACK-BINDING",
        name="OAuth callback may bind token to wrong identity",
        severity="HIGH",
        description=(
            "OAuth callback does not validate that the returning GitHub identity "
            "matches the session user, or stores the token against the active "
            "workspace/session without confirming user identity."
        ),
        recommendation=(
            "On OAuth callback: verify state param includes user_id, compare "
            "returned GitHub login against expected account, store token with "
            "explicit user_id + provider_account_id."
        ),
    ),

    Pattern(
        id="P6-HARDCODED-OWNER-REPO",
        name="Hardcoded GitHub owner or repo default",
        severity="HIGH",
        description=(
            "A hardcoded owner name (e.g. 'SamPrimeaux', 'inneranimalmedia') or "
            "repo default appears in API routes or frontend components, bypassing "
            "per-user scoping."
        ),
        recommendation=(
            "Remove all hardcoded owner/repo defaults. Resolve owner from the "
            "authenticated user's provider account record."
        ),
    ),

    Pattern(
        id="P7-REPO-LISTING-UNSCOPED",
        name="GitHub API repo listing not scoped to authenticated user",
        severity="HIGH",
        description=(
            "GitHub API call to /repos or /user/repos does not use the "
            "per-user token or does not verify the response owner matches "
            "the requesting user."
        ),
        recommendation=(
            "Use user-specific token for all GitHub API calls. "
            "Filter returned repos to those owned by or explicitly granted to "
            "the requesting user/workspace."
        ),
    ),

    Pattern(
        id="P8-404-RECONNECT-LOOP",
        name="404/403 error triggers reconnect or clears repo state",
        severity="MEDIUM",
        description=(
            "Error handler on GitHub API 404 or 403 response triggers an "
            "OAuth reconnect flow or clears cached repo state, which could "
            "loop or bleed state."
        ),
        recommendation=(
            "On 403/404, surface the error to the UI without clearing "
            "shared state or starting a new OAuth flow. Log the user_id and "
            "provider_account_id for debugging."
        ),
    ),

    Pattern(
        id="P9-MISSING-SYNC-COLUMNS",
        name="GitHub sync rows missing user_id / workspace_id / provider_account_id",
        severity="HIGH",
        description=(
            "INSERT or UPDATE on a github_sync or github_repos table does not "
            "include all of: user_id, workspace_id, provider_account_id, account_login."
        ),
        recommendation=(
            "Every GitHub sync write must record user_id, workspace_id, "
            "provider_account_id, and account_login."
        ),
    ),
]


# ---------------------------------------------------------------------------
# Regex-based checks
# ---------------------------------------------------------------------------

# P1: token queries with LIMIT 1 but no user_id
RE_TOKEN_NO_USER = re.compile(
    r"(SELECT\s+.+FROM\s+\w*[Oo]auth\w*|SELECT\s+.+token.+FROM\s+\w+)"
    r"(?!.*WHERE.*user_id).*LIMIT\s+1",
    re.IGNORECASE | re.DOTALL,
)

# P1: JS/TS: db.prepare / db.query / db.first without user_id on oauth table
RE_JS_TOKEN_NO_USER = re.compile(
    r"(oauth_tokens|github_tokens|provider_tokens)"
    r"(?!.*user_id)",
    re.IGNORECASE,
)

# P2: cache key patterns without user_id/account_id
RE_CACHE_KEY_REPOS = re.compile(
    r"['\"`]github[:\-_]repos?['\"`]",
    re.IGNORECASE,
)

# P4: localStorage set/get with github-related key, no user scope variable nearby
RE_LOCALSTORAGE_GITHUB = re.compile(
    r"localStorage\.(setItem|getItem)\s*\(\s*['\"`][^'\"` ]*github[^'\"` ]*['\"`]",
    re.IGNORECASE,
)

# P5: OAuth callback handling
RE_OAUTH_CALLBACK = re.compile(
    r"(callback|oauth_callback|github_callback|/auth/github)",
    re.IGNORECASE,
)

# P6: hardcoded owner names
HARDCODED_OWNERS = ["SamPrimeaux", "samprimeaux", "inneranimalmedia", "sam-primeaux"]
RE_HARDCODED_OWNER = re.compile(
    r"['\"`](" + "|".join(re.escape(o) for o in HARDCODED_OWNERS) + r")['\"`]",
)

# P7: GitHub API calls to /repos or /user/repos
RE_GITHUB_REPOS_API = re.compile(
    r"(api\.github\.com/(?:repos|users?/[^/]+/repos|user/repos)"
    r"|octokit\.rest\.repos\.(list|get)"
    r"|fetch\(['\"`][^'\"` ]*github[^'\"` ]*repos?['\"`])",
    re.IGNORECASE,
)

# P8: 404/403 triggers reconnect or clearRepo
RE_ERROR_RECONNECT = re.compile(
    r"(status\s*===?\s*40[34]|\.status\s*==\s*40[34]|res\.status\s*==\s*40[34])"
    r".*?(reconnect|clearRepo|clear_repo|startOAuth|initOAuth|redirect.*?oauth|setRepos\s*\(\s*\[?\s*\]?\s*\))",
    re.IGNORECASE | re.DOTALL,
)

# P9: INSERT missing required columns
RE_INSERT_GITHUB_SYNC = re.compile(
    r"INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w*github\w*",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# File walker
# ---------------------------------------------------------------------------

def walk_files(root: Path) -> list[Path]:
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix in SCAN_EXTENSIONS:
                results.append(p)
    return results


# ---------------------------------------------------------------------------
# Line-level scanner
# ---------------------------------------------------------------------------

def scan_file(path: Path, root: Path) -> list[Finding]:
    rel = str(path.relative_to(root))
    findings: list[Finding] = []

    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return findings

    lines = raw.splitlines()

    # ------------------------------------------------------------------
    # P1: SQL token query without user_id
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if (
            ("oauth" in low or "github_token" in low or "provider_token" in low)
            and ("select" in low or "prepare" in low or "query" in low or "first" in low)
            and "user_id" not in low
        ):
            findings.append(Finding(
                pattern_id="P1-TOKEN-FALLBACK",
                severity="CRITICAL",
                file=rel,
                line=i,
                snippet=line.strip(),
                detail="Token/OAuth table access without user_id filter.",
                recommendation="Add WHERE user_id = ? to this query.",
            ))

    # ------------------------------------------------------------------
    # P2: Shared cache key for repos
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_CACHE_KEY_REPOS.search(line):
            # Check window of 5 lines for user_id/account_id
            window = " ".join(lines[max(0, i-3):min(len(lines), i+3)])
            if "user_id" not in window and "account_id" not in window and "userId" not in window:
                findings.append(Finding(
                    pattern_id="P2-SHARED-CACHE-KEY",
                    severity="CRITICAL",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail="github:repos cache key with no user_id/account_id in scope.",
                    recommendation="Compose key as github:repos:{user_id}:{provider_account_id}.",
                ))

    # ------------------------------------------------------------------
    # P3: SQL missing user_id/workspace_id on github tables
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if re.search(r"\b(github_sync|github_repos|github_installations)\b", low):
            if re.search(r"\b(select|insert|update|delete)\b", low):
                if "user_id" not in low and "workspace_id" not in low:
                    # Look at block of 6 lines for the WHERE clause
                    block = " ".join(lines[max(0, i-1):min(len(lines), i+5)])
                    if "user_id" not in block.lower() and "workspace_id" not in block.lower():
                        findings.append(Finding(
                            pattern_id="P3-MISSING-USER-FILTER",
                            severity="CRITICAL",
                            file=rel,
                            line=i,
                            snippet=line.strip(),
                            detail="Query on github table without user_id or workspace_id filter.",
                            recommendation="Add WHERE user_id = ? AND workspace_id = ?.",
                        ))

    # ------------------------------------------------------------------
    # P4: localStorage GitHub key without user scope
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_LOCALSTORAGE_GITHUB.search(line):
            # Check if user_id or workspace_id appears in the key string
            key_match = re.search(
                r"localStorage\.\w+\(\s*['\"`]([^'\"` ]+)['\"`]", line
            )
            if key_match:
                key = key_match.group(1)
                if "user" not in key and "workspace" not in key and "account" not in key:
                    findings.append(Finding(
                        pattern_id="P4-LOCALSTORAGE-BLEED",
                        severity="HIGH",
                        file=rel,
                        line=i,
                        snippet=line.strip(),
                        detail=f"localStorage key '{key}' lacks user/workspace scope.",
                        recommendation="Namespace key: e.g. `github:selected_repo:${{userId}}`.",
                    ))

    # ------------------------------------------------------------------
    # P5: OAuth callback without identity validation
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_OAUTH_CALLBACK.search(line):
            block = " ".join(lines[max(0, i-1):min(len(lines), i+20)])
            low_block = block.lower()
            # Flag if state param or user_id not validated in callback
            if (
                "state" not in low_block or
                ("user_id" not in low_block and "userid" not in low_block)
            ):
                findings.append(Finding(
                    pattern_id="P5-OAUTH-CALLBACK-BINDING",
                    severity="HIGH",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail="OAuth callback handler may not validate state param or user identity.",
                    recommendation=(
                        "Verify state param includes user_id; compare GitHub login "
                        "against expected identity before storing token."
                    ),
                ))

    # ------------------------------------------------------------------
    # P6: Hardcoded owner name
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        m = RE_HARDCODED_OWNER.search(line)
        if m:
            # Skip if it's in a comment-only line or .md file context
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("*"):
                continue
            findings.append(Finding(
                pattern_id="P6-HARDCODED-OWNER-REPO",
                severity="HIGH",
                file=rel,
                line=i,
                snippet=line.strip(),
                detail=f"Hardcoded owner string '{m.group(1)}' in non-comment code.",
                recommendation="Resolve owner from authenticated user's provider_account record.",
            ))

    # ------------------------------------------------------------------
    # P7: GitHub API repo listing (spot-check for missing token param)
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_GITHUB_REPOS_API.search(line):
            block = " ".join(lines[max(0, i-3):min(len(lines), i+5)])
            low_block = block.lower()
            if (
                "authorization" not in low_block
                and "token" not in low_block
                and "headers" not in low_block
                and "bearer" not in low_block
            ):
                findings.append(Finding(
                    pattern_id="P7-REPO-LISTING-UNSCOPED",
                    severity="HIGH",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail="GitHub repo API call with no Authorization header in nearby context.",
                    recommendation="Pass user-specific token as Authorization: Bearer <token>.",
                ))

    # ------------------------------------------------------------------
    # P8: 404/403 triggers reconnect/clear
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if re.search(r"40[34]", line):
            block = " ".join(lines[max(0, i-1):min(len(lines), i+10)])
            if re.search(
                r"(reconnect|clearRepo|clear_repo|startOAuth|initOAuth"
                r"|redirect.*?oauth|setRepos\s*\(\s*\[?\s*\]?\s*\))",
                block, re.IGNORECASE
            ):
                findings.append(Finding(
                    pattern_id="P8-404-RECONNECT-LOOP",
                    severity="MEDIUM",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail="403/404 error handler appears to trigger reconnect or clear repos.",
                    recommendation=(
                        "Surface error to UI without clearing shared state or "
                        "starting new OAuth flow."
                    ),
                ))

    # ------------------------------------------------------------------
    # P9: INSERT on github_sync missing required columns
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_INSERT_GITHUB_SYNC.search(line):
            # Collect the INSERT statement (up to 10 lines)
            block = " ".join(lines[i-1:min(len(lines), i+10)])
            low_block = block.lower()
            missing = []
            for col in ["user_id", "workspace_id", "provider_account_id", "account_login"]:
                if col not in low_block:
                    missing.append(col)
            if missing:
                findings.append(Finding(
                    pattern_id="P9-MISSING-SYNC-COLUMNS",
                    severity="HIGH",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail=f"GitHub sync INSERT missing columns: {', '.join(missing)}.",
                    recommendation=(
                        "Include user_id, workspace_id, provider_account_id, "
                        "account_login in every github_sync write."
                    ),
                ))

    return findings


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "INFO": 3}


def print_report(findings: list[Finding], root: Path) -> None:
    findings.sort(key=lambda f: (SEVERITY_ORDER.get(f.severity, 9), f.file, f.line))

    counts = {}
    for f in findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1

    print("\n" + "=" * 72)
    print("GITHUB ACCOUNT / REPO SCOPING AUDIT")
    print(f"Root: {root}")
    print("=" * 72)
    print(f"Total findings: {len(findings)}")
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "INFO"]:
        if sev in counts:
            print(f"  {sev}: {counts[sev]}")
    print()

    by_pattern: dict[str, list[Finding]] = {}
    for f in findings:
        by_pattern.setdefault(f.pattern_id, []).append(f)

    for pid, group in sorted(by_pattern.items(), key=lambda kv: SEVERITY_ORDER.get(kv[1][0].severity, 9)):
        p = next((p for p in PATTERNS if p.id == pid), None)
        label = p.name if p else pid
        sev = group[0].severity
        print(f"[{sev}] {pid} — {label}")
        print(f"  Recommendation: {group[0].recommendation}")
        print(f"  Occurrences ({len(group)}):")
        for f in group[:20]:  # cap display at 20 per pattern
            print(f"    {f.file}:{f.line}")
            print(f"      {f.snippet[:120]}")
            print(f"      → {f.detail}")
        if len(group) > 20:
            print(f"    ... and {len(group) - 20} more")
        print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Audit GitHub account/repo scoping.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Repo root path.")
    parser.add_argument("--json", metavar="FILE", help="Also write findings to JSON file.")
    parser.add_argument("--severity", choices=["CRITICAL", "HIGH", "MEDIUM", "INFO"],
                        help="Only show findings at this severity or above.")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists():
        print(f"ERROR: root path does not exist: {root}", file=sys.stderr)
        sys.exit(1)

    files = walk_files(root)
    print(f"Scanning {len(files)} files under {root} ...", file=sys.stderr)

    all_findings: list[Finding] = []
    for path in files:
        all_findings.extend(scan_file(path, root))

    # Deduplicate exact duplicates (same file+line+pattern)
    seen = set()
    deduped = []
    for f in all_findings:
        key = (f.pattern_id, f.file, f.line)
        if key not in seen:
            seen.add(key)
            deduped.append(f)

    # Severity filter
    if args.severity:
        threshold = SEVERITY_ORDER[args.severity]
        deduped = [f for f in deduped if SEVERITY_ORDER.get(f.severity, 9) <= threshold]

    print_report(deduped, root)

    if args.json:
        out = Path(args.json)
        out.write_text(
            json.dumps([asdict(f) for f in deduped], indent=2),
            encoding="utf-8",
        )
        print(f"JSON written to {out}")

    # Exit code: non-zero if any CRITICAL found
    has_critical = any(f.severity == "CRITICAL" for f in deduped)
    sys.exit(1 if has_critical else 0)


if __name__ == "__main__":
    main()
