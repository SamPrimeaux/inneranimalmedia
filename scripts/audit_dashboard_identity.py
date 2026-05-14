#!/usr/bin/env python3
"""
audit_dashboard_identity.py
Scans ONLY dashboard source files + live dashboard pages for hardcoded
tenant/workspace/user identity that should be runtime-resolved.

Setup:
  export IAM_SESSION_COOKIE="<your session cookie value>"

Run from repo root:
  python3 scripts/audit_dashboard_identity.py

Outputs: scripts/audit_dashboard_identity_report.md
"""

import subprocess
import os
import re
import urllib.request
import urllib.error
from datetime import datetime

REPO_ROOT   = os.getcwd()
REPORT_PATH = os.path.join(REPO_ROOT, "scripts", "audit_dashboard_identity_report.md")
BASE_URL    = "https://inneranimalmedia.com"
COOKIE_VAR  = "IAM_SESSION_COOKIE"

# ── Dashboard source paths to target ─────────────────────────────────────────
# Maps route label -> list of repo-relative glob prefixes to scan
DASHBOARD_SOURCE_PATHS = [
    "dashboard/App.tsx",
    "dashboard/components/WorkspaceDashboard.tsx",
    "dashboard/components/ChatAssistant.tsx",
    "dashboard/features/agent-chat/",
    "dashboard/pages/workflows/",
    "dashboard/pages/library/",
    "dashboard/pages/learn/",
    "dashboard/pages/mail/",
    "dashboard/pages/mcp/",
    "dashboard/pages/settings/",
    "dashboard/pages/overview/",
    "dashboard/features/settings/",
    "dashboard/features/workspace/",
    "dashboard/features/github/",
    "dashboard/features/integrations/",
    "dashboard/features/security/",
    "dashboard/features/agents/",
    "dashboard/hooks/",
    "dashboard/lib/",
    "dashboard/utils/",
    "dashboard/context/",
    "dashboard/store/",
    "src/core/",           # worker core — tenant resolution lives here
    "src/routes/",         # worker routes
    "src/middleware/",     # auth middleware
    "src/handlers/",
]

# ── Live dashboard pages to request + scan response ──────────────────────────
DASHBOARD_ROUTES = [
    "/dashboard/overview",
    "/dashboard/library",
    "/dashboard/agent",
    "/dashboard/learn",
    "/dashboard/settings/agents",
    "/dashboard/settings/workspace",
    "/dashboard/settings/github",
    "/dashboard/settings/integrations",
    "/dashboard/settings/security",
    "/dashboard/mail",
    "/dashboard/mcp",
    "/dashboard/workflows",
]

# ── Identity patterns to flag in source ──────────────────────────────────────
SOURCE_PATTERNS = [
    # Hardcoded workspace/tenant IDs
    ("hardcoded workspace_id",    r"ws_inneranimalmedia",                   False),
    ("hardcoded tenant string",   r"['\"](inneranimalmedia)['\"]",          True),
    ("tenant_id fallback",        r"\|\|\s*['\"]ws_",                       True),
    ("tenant_id assignment",      r"tenant_id\s*[=:]\s*['\"][a-z0-9_-]+['\"]", True),
    ("workspace_id assignment",   r"workspace_id\s*[=:]\s*['\"][a-z0-9_-]+['\"]", True),

    # Hardcoded user identity
    ("hardcoded user_id",         r"user_id\s*[=:]\s*['\"][a-zA-Z0-9_@.-]+['\"]", True),
    ("hardcoded auth_id",         r"auth_id\s*[=:]\s*['\"][a-zA-Z0-9_@.-]+['\"]", True),
    ("hardcoded user literal",    r"['\"]sam['\"]",                         True),

    # Dashboard email refs (flag only — contact emails on dashboard pages are suspicious)
    ("email in dashboard source", r"[a-zA-Z0-9._%+-]+@inneranimalmedia\.com", True),

    # Common bad fallback patterns
    ("default= tenant",           r"DEFAULT\s+'ws_",                        True),
    ("default= user",             r"DEFAULT\s+'sam",                        True),
    ("env fallback to literal",   r"process\.env\.[A-Z_]+\s*\|\|\s*['\"][a-z]", True),

    # Supabase project ID (should come from env, never literal)
    ("supabase project id",       "dpmuvynqixblxsilnlut",                   False),
]

# ── Patterns to scan in live page HTML responses ──────────────────────────────
RESPONSE_PATTERNS = [
    ("user email in response",    r"[a-zA-Z0-9._%+-]+@inneranimalmedia\.com"),
    ("workspace id in response",  r"ws_inneranimalmedia"),
    ("sam literal in response",   r'"sam"'),
    ("supabase id in response",   r"dpmuvynqixblxsilnlut"),
    ("raw tenant in response",    r"tenant_id.*inneranimalmedia"),
]

INCLUDE_EXTS   = {".js", ".ts", ".tsx", ".jsx", ".py", ".json", ".sql"}
EXCLUDE_FILES  = {"audit_dashboard_identity.py", "audit_dashboard_identity_report.md",
                  "audit_agent_remaster.py", "audit_agent_remaster_report.md",
                  "package-lock.json", "yarn.lock", "pnpm-lock.yaml"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def collect_files():
    files = []
    for prefix in DASHBOARD_SOURCE_PATHS:
        full = os.path.join(REPO_ROOT, prefix)
        if os.path.isfile(full):
            _, ext = os.path.splitext(full)
            if ext in INCLUDE_EXTS and os.path.basename(full) not in EXCLUDE_FILES:
                files.append(full)
        elif os.path.isdir(full):
            for root, dirs, fnames in os.walk(full):
                dirs[:] = [d for d in dirs if d not in {"node_modules", "__pycache__", ".git", "dist"}]
                for fname in fnames:
                    _, ext = os.path.splitext(fname)
                    if ext in INCLUDE_EXTS and fname not in EXCLUDE_FILES:
                        files.append(os.path.join(root, fname))
    return sorted(set(files))


def scan_file(filepath, pattern, is_literal):
    hits = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            for lineno, line in enumerate(f, 1):
                match = (pattern in line) if is_literal else bool(re.search(pattern, line))
                if match:
                    hits.append((lineno, line.rstrip()))
    except Exception:
        pass
    return hits


def fetch_page(url, cookie):
    req = urllib.request.Request(url)
    req.add_header("Cookie", f"session={cookie}")
    req.add_header("User-Agent", "IAM-Audit/1.0")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as ex:
        return 0, str(ex)


def git_status():
    try:
        r = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, cwd=REPO_ROOT)
        return r.stdout.strip()
    except Exception:
        return "git unavailable"


def git_log_short():
    try:
        r = subprocess.run(["git", "log", "--oneline", "-5"], capture_output=True, text=True, cwd=REPO_ROOT)
        return r.stdout.strip()
    except Exception:
        return ""

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    cookie = os.environ.get(COOKIE_VAR, "").strip()
    if not cookie:
        print(f"\n  ERROR: Set your session cookie first:\n  export {COOKIE_VAR}=\"<value>\"\n")
        return

    lines = []
    lines.append("# Dashboard Identity Audit")
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    lines.append("> Scope: dashboard source files + live page responses only.\n")

    # Git state
    status = git_status()
    tree_clean = status == ""
    lines.append("## Git State")
    lines.append(f"- Tree clean: {'YES' if tree_clean else 'NO'}")
    if not tree_clean:
        lines.append(f"```\n{status}\n```")
    lines.append(f"\n```\n{git_log_short()}\n```\n")

    # ── SOURCE SCAN ──────────────────────────────────────────────────────────
    files = collect_files()
    lines.append(f"## Source Scan\n- Dashboard files targeted: {len(files)}\n")

    source_findings = {}
    for label, pattern, is_literal in SOURCE_PATTERNS:
        key = f"{label}"
        source_findings[key] = []
        for fpath in files:
            hits = scan_file(fpath, pattern, is_literal)
            for lineno, content in hits:
                relpath = os.path.relpath(fpath, REPO_ROOT)
                source_findings[key].append((relpath, lineno, content))

    flagged_source = {k: v for k, v in source_findings.items() if v}
    clean_source   = [k for k, v in source_findings.items() if not v]

    if flagged_source:
        lines.append("### Source Flags\n")
        for key, hits in flagged_source.items():
            lines.append(f"#### {key} ({len(hits)} hit{'s' if len(hits) != 1 else ''})")
            lines.append("| File | Line | Content |")
            lines.append("|------|------|---------|")
            for relpath, lineno, content in hits:
                safe = content.strip().replace("|", "\\|")[:140]
                lines.append(f"| `{relpath}` | {lineno} | `{safe}` |")
            lines.append("")
    else:
        lines.append("### Source Flags\nNo hardcoded identity found in dashboard source files.\n")

    if clean_source:
        lines.append("### Source Clean\n")
        for k in clean_source:
            lines.append(f"- {k}")
        lines.append("")

    # ── LIVE PAGE SCAN ───────────────────────────────────────────────────────
    lines.append("\n## Live Page Scan\n")
    lines.append("| Route | Status | Flags |")
    lines.append("|-------|--------|-------|")

    page_flag_total = 0
    page_detail_lines = []

    for route in DASHBOARD_ROUTES:
        url = BASE_URL + route
        status_code, body = fetch_page(url, cookie)

        page_flags = []
        if body:
            for label, pattern in RESPONSE_PATTERNS:
                matches = re.findall(pattern, body)
                if matches:
                    unique = list(set(matches))[:3]
                    page_flags.append(f"{label}: {unique}")
                    page_flag_total += 1

        flag_str = "; ".join(page_flags) if page_flags else "clean"
        lines.append(f"| `{route}` | {status_code} | {flag_str} |")

        if page_flags:
            page_detail_lines.append(f"\n### {route}\n**Status:** {status_code}")
            for f in page_flags:
                page_detail_lines.append(f"- {f}")

    if page_detail_lines:
        lines.append("\n### Live Page Details\n")
        lines.extend(page_detail_lines)

    # ── CHECKLIST ────────────────────────────────────────────────────────────
    no_ws_in_source    = "hardcoded workspace_id" not in flagged_source
    no_tenant_fallback = "tenant_id fallback" not in flagged_source
    no_user_id         = "hardcoded user_id" not in flagged_source
    no_auth_id         = "hardcoded auth_id" not in flagged_source
    no_supabase        = "supabase project id" not in flagged_source
    no_live_leaks      = page_flag_total == 0

    checks = [
        ("Git working tree is clean",                          tree_clean),
        ("No hardcoded workspace_id in dashboard source",      no_ws_in_source),
        ("No tenant_id fallback literal in dashboard source",  no_tenant_fallback),
        ("No hardcoded user_id in dashboard source",           no_user_id),
        ("No hardcoded auth_id in dashboard source",           no_auth_id),
        ("No Supabase project ID literal in dashboard source", no_supabase),
        ("No identity leaks in live dashboard responses",      no_live_leaks),
    ]

    lines.append("\n## Checklist\n")
    for label, passed in checks:
        lines.append(f"- [{'PASS' if passed else 'FAIL'}] {label}")

    report = "\n".join(lines)
    os.makedirs(os.path.join(REPO_ROOT, "scripts"), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\nReport written to: {REPORT_PATH}\n")
    print("--- CHECKLIST ---")
    for label, passed in checks:
        print(f"  {'✅' if passed else '❌'} {label}")


if __name__ == "__main__":
    main()
