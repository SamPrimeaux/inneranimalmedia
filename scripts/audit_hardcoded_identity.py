#!/usr/bin/env python3
"""
audit_hardcoded_identity.py
Scans the inneranimalmedia repo for any hardcoded tenant, workspace,
user identity, or personal values that should be runtime-resolved.
Run from repo root:
  python3 scripts/audit_hardcoded_identity.py
Outputs: scripts/audit_hardcoded_identity_report.md
"""

import subprocess
import os
import re
from datetime import datetime

REPO_ROOT = os.getcwd()
REPORT_PATH = os.path.join(REPO_ROOT, "scripts", "audit_hardcoded_identity_report.md")

# ── Targets ──────────────────────────────────────────────────────────────────
# Add any personal values you want to sweep for.
# Each entry: (label, pattern, is_regex)
HARDCODED_TARGETS = [
    # Tenant / workspace IDs
    ("tenant_id literal",           "ws_inneranimalmedia",          False),
    ("tenant_id literal",           "inneranimalmedia",             False),
    ("workspace_id literal",        "ws_inneranimalmedia",          False),

    # Personal identifiers
    ("user email",                  "samprimeaux",                  False),
    ("user email domain",           "@inneranimalmedia.com",        False),
    ("user name literal",           '"sam"',                        False),
    ("user name literal",           "'sam'",                        False),

    # Common hardcoded fallback patterns in JS/TS
    ("|| hardcoded tenant",         r"\|\|\s*['\"]ws_",             True),
    ("|| hardcoded user",           r"\|\|\s*['\"]sam",             True),
    ("fallback tenant string",      r"tenant_id\s*=\s*['\"]",       True),
    ("fallback workspace string",   r"workspace_id\s*=\s*['\"]",    True),
    ("hardcoded auth_id",           r"auth_id\s*=\s*['\"]",         True),
    ("hardcoded user_id",           r"user_id\s*=\s*['\"][^{]",     True),

    # Default= patterns that sneak in
    ("DEFAULT tenant",              "DEFAULT 'ws_",                 False),
    ("DEFAULT user",                "DEFAULT 'sam",                 False),

    # Supabase / D1 known personal project IDs
    ("supabase project id",         "dpmuvynqixblxsilnlut",         False),

    # R2 / KV / DO personal bucket names
    ("r2 bucket literal",           "inneranimalmedia",             False),

    # EIN (nonprofit, should never be in code)
    ("EIN hardcoded",               "33-4214907",                   False),
]

# File extensions to scan
INCLUDE_EXTS = {".js", ".ts", ".tsx", ".jsx", ".py", ".toml", ".json", ".sql", ".env", ".md"}

# Paths to exclude (build artifacts, deps, reports)
EXCLUDE_DIRS = {
    "node_modules", ".git", "dist", "build", ".wrangler",
    "__pycache__", ".cache", "coverage",
}
EXCLUDE_FILES = {
    "audit_hardcoded_identity.py",
    "audit_hardcoded_identity_report.md",
    "audit_agent_remaster.py",
    "audit_agent_remaster_report.md",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def should_scan(path: str) -> bool:
    parts = path.replace(REPO_ROOT, "").split(os.sep)
    for part in parts:
        if part in EXCLUDE_DIRS:
            return False
    _, ext = os.path.splitext(path)
    if ext not in INCLUDE_EXTS:
        return False
    if os.path.basename(path) in EXCLUDE_FILES:
        return False
    return True


def scan_file(filepath: str, label: str, pattern: str, is_regex: bool):
    hits = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            for lineno, line in enumerate(f, 1):
                if is_regex:
                    if re.search(pattern, line):
                        hits.append((lineno, line.rstrip()))
                else:
                    if pattern in line:
                        hits.append((lineno, line.rstrip()))
    except Exception:
        pass
    return hits


def git_status():
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        return result.stdout.strip()
    except Exception:
        return "git unavailable"


def git_log_short():
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-5"],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        return result.stdout.strip()
    except Exception:
        return ""

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    lines = []
    lines.append(f"# Hardcoded Identity Audit")
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Git state
    status = git_status()
    tree_clean = status == ""
    lines.append("## Git State")
    lines.append(f"- Working tree clean: {'YES' if tree_clean else 'NO — dirty files present'}")
    if not tree_clean:
        lines.append(f"```\n{status}\n```")
    lines.append(f"\n**Recent commits:**\n```\n{git_log_short()}\n```\n")

    # Collect all scannable files
    all_files = []
    for root, dirs, files in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for fname in files:
            fpath = os.path.join(root, fname)
            if should_scan(fpath):
                all_files.append(fpath)

    lines.append(f"## Scope\n- Files scanned: {len(all_files)}\n- Patterns checked: {len(HARDCODED_TARGETS)}\n")

    # Run every target against every file
    findings = {}  # label -> list of (relpath, lineno, line)

    for label, pattern, is_regex in HARDCODED_TARGETS:
        key = f"{label} :: `{pattern}`"
        findings[key] = []
        for fpath in all_files:
            hits = scan_file(fpath, label, pattern, is_regex)
            for lineno, line in hits:
                relpath = os.path.relpath(fpath, REPO_ROOT)
                findings[key].append((relpath, lineno, line))

    # Write findings
    total_hits = sum(len(v) for v in findings.values())
    lines.append(f"## Results — {total_hits} total hits\n")

    clean_patterns = []
    flagged_patterns = []

    for key, hits in findings.items():
        if hits:
            flagged_patterns.append((key, hits))
        else:
            clean_patterns.append(key)

    if flagged_patterns:
        lines.append("### Flagged (require review)\n")
        for key, hits in flagged_patterns:
            lines.append(f"#### {key}")
            lines.append(f"_Occurrences: {len(hits)}_\n")
            lines.append("| File | Line | Content |")
            lines.append("|------|------|---------|")
            for relpath, lineno, content in hits:
                safe = content.strip().replace("|", "\\|")[:120]
                lines.append(f"| `{relpath}` | {lineno} | `{safe}` |")
            lines.append("")

    if clean_patterns:
        lines.append("### Clean (no hits)\n")
        for key in clean_patterns:
            lines.append(f"- {key}")
        lines.append("")

    # Checklist summary
    lines.append("\n## Checklist Summary\n")
    checks = [
        ("Git working tree is clean", tree_clean),
        ("No hardcoded ws_inneranimalmedia in JS/TS", not any(
            "ws_inneranimalmedia" in h[2]
            for hits in findings.values() for h in hits
            if h[0].endswith((".js", ".ts", ".tsx", ".jsx"))
        )),
        ("No hardcoded samprimeaux in JS/TS", not any(
            "samprimeaux" in h[2]
            for hits in findings.values() for h in hits
            if h[0].endswith((".js", ".ts", ".tsx", ".jsx"))
        )),
        ("No hardcoded tenant fallbacks (|| 'ws_)", not any(
            hits for key, hits in findings.items() if "|| hardcoded tenant" in key
        )),
        ("No hardcoded user_id/auth_id string literals", not any(
            hits for key, hits in findings.items()
            if "hardcoded auth_id" in key or "hardcoded user_id" in key
        )),
        ("No EIN in codebase", not any(
            hits for key, hits in findings.items() if "EIN" in key
        )),
    ]

    for label, passed in checks:
        icon = "PASS" if passed else "FAIL"
        lines.append(f"- [{icon}] {label}")

    report = "\n".join(lines)

    os.makedirs(os.path.join(REPO_ROOT, "scripts"), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\nReport written to: {REPORT_PATH}\n")
    print("--- CHECKLIST SUMMARY ---")
    for label, passed in checks:
        icon = "PASS" if passed else "FAIL"
        print(f"  {'✅' if passed else '❌'} {label}")


if __name__ == "__main__":
    main()
