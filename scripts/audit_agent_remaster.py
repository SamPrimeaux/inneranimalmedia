#!/usr/bin/env python3
"""
audit_agent_remaster.py
Run from repo root:  python3 scripts/audit_agent_remaster.py
Outputs a markdown report of every file/line that touches WorkspaceDashboard,
the + menu, the input bar, cms_themes, greeting state, and recent-files logic.
"""

import os, re, subprocess, json
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent   # repo root

# ─── SEARCH TARGETS ────────────────────────────────────────────────────────────
PATTERNS = {
    # Core component files
    "WorkspaceDashboard_import":  r"WorkspaceDashboard",
    "ChatAssistant_import":       r"ChatAssistant",
    "PlusMenu_variants":          r"(?i)(plus.?menu|PlusBtn|plusOpen|add.?menu|attachment.?menu)",
    "ModelSelector":              r"(?i)(model.?selector|ModelPicker|modelOpen|selectedModel|ModelBtn)",
    "SendButton":                 r"(?i)(send.?btn|sendButton|handleSend|onSend|submitMessage)",
    "Greeting_state":             r"(?i)(greeting|good\s+(morning|afternoon|evening)|welcome.?back)",

    # cms_themes wiring
    "cms_themes_fetch":           r"(?i)(cms_themes|fetchTheme|applyTheme|theme_slug|theme_id|useTheme|ThemeProvider)",
    "css_vars_inject":            r"(?i)(css_vars_json|css.?var|setProperty|document\.documentElement)",

    # Recent files / workspace state
    "recentFiles_prop":           r"(?i)(recentFiles|recent_files|recentlyOpened|recently.?opened)",
    "workspaceRows_prop":         r"(?i)(workspaceRows|workspace_rows|workspaceRow)",
    "cloneRepo":                  r"(?i)(clone.?repo|cloneRepository|github.*clone|git\s+clone)",

    # Input bar atoms
    "inputValue_state":           r"(?i)(inputValue|input\.trim|setInput|userInput|messageInput)",
    "pills_shortcuts":            r"(?i)(pill|quick.?action|shortcut.?btn|suggestion.?chip)",

    # Agent/mode label (right-aligned model pill)
    "agentMode_label":            r"(?i)(agentMode|agent.?name|current.?agent|activeAgent|Auto)",

    # Routing arms / model resolution
    "routingArms":                r"(?i)(routing_arm|agentsam_routing|resolveModel|model_tier)",

    # Staging safety
    "git_status":                 None,   # handled separately
}

FILE_GLOBS = [
    "dashboard/**/*.tsx",
    "dashboard/**/*.ts",
    "dashboard/**/*.jsx",
    "dashboard/**/*.js",
    "src/**/*.js",
    "src/**/*.ts",
]

SKIP_DIRS  = {".git", "node_modules", "dist", ".cache", "__pycache__"}
SKIP_EXTS  = {".map", ".lock", ".png", ".jpg", ".svg", ".ico", ".woff2"}

# ─── FILE WALKER ───────────────────────────────────────────────────────────────
def iter_files(root: Path):
    for glob in FILE_GLOBS:
        parts = glob.split("/")
        base  = root / parts[0]
        if not base.exists():
            continue
        pattern = "/".join(parts[1:])
        for path in base.rglob(pattern):
            if any(s in path.parts for s in SKIP_DIRS):
                continue
            if path.suffix in SKIP_EXTS:
                continue
            yield path


def grep_file(path: Path, pattern: str):
    hits = []
    try:
        text = path.read_text(errors="replace")
        for i, line in enumerate(text.splitlines(), 1):
            if re.search(pattern, line):
                hits.append((i, line.rstrip()))
    except Exception:
        pass
    return hits


# ─── GIT STATUS ────────────────────────────────────────────────────────────────
def git_status(root: Path):
    try:
        result = subprocess.run(
            ["git", "status", "--short"],
            cwd=root, capture_output=True, text=True
        )
        return result.stdout.strip() or "clean"
    except Exception as e:
        return f"error: {e}"


def git_log(root: Path, n=5):
    try:
        result = subprocess.run(
            ["git", "log", f"-{n}", "--oneline"],
            cwd=root, capture_output=True, text=True
        )
        return result.stdout.strip()
    except Exception as e:
        return f"error: {e}"


# ─── COMPONENT SIZE AUDIT ──────────────────────────────────────────────────────
COMPONENT_FILES = [
    "dashboard/components/WorkspaceDashboard.tsx",
    "dashboard/components/ChatAssistant.tsx",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/features/agent-chat/types.ts",
    "dashboard/App.tsx",
    "dashboard/pages/workflows/WorkflowsPage.tsx",
]

def component_sizes(root: Path):
    rows = []
    for rel in COMPONENT_FILES:
        p = root / rel
        if p.exists():
            lines = len(p.read_text(errors="replace").splitlines())
            rows.append((rel, lines))
        else:
            rows.append((rel, "NOT FOUND"))
    return rows


# ─── THEME WIRING AUDIT ────────────────────────────────────────────────────────
THEME_PATTERNS = [
    r"cms_themes",
    r"fetchTheme",
    r"applyTheme",
    r"useTheme",
    r"ThemeProvider",
    r"css_vars_json",
    r"theme_slug",
    r"iam-classy",
]

def theme_audit(root: Path):
    hits = {}
    for path in iter_files(root):
        for pat in THEME_PATTERNS:
            matches = grep_file(path, pat)
            if matches:
                rel = str(path.relative_to(root))
                if rel not in hits:
                    hits[rel] = []
                hits[rel].extend([(pat, ln, txt) for ln, txt in matches])
    return hits


# ─── MAIN REPORT ───────────────────────────────────────────────────────────────
def main():
    report_lines = []
    def w(*args): report_lines.append(" ".join(str(a) for a in args))

    w(f"# Agent Remaster — Asset Audit")
    w(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    w(f"Root: {ROOT}\n")

    # ── Git state ──────────────────────────────────────────────────────────────
    w("## Git State")
    w("```")
    status = git_status(ROOT)
    w("STATUS:", status)
    w("\nLAST 5 COMMITS:")
    w(git_log(ROOT))
    w("```\n")

    # ── Component sizes ────────────────────────────────────────────────────────
    w("## Key Component Line Counts")
    w("| File | Lines |")
    w("|------|-------|")
    for rel, lines in component_sizes(ROOT):
        w(f"| `{rel}` | {lines} |")
    w()

    # ── Pattern grep results ───────────────────────────────────────────────────
    w("## Pattern Search Results\n")

    all_files = list(iter_files(ROOT))
    w(f"_Scanning {len(all_files)} files..._\n")

    for label, pattern in PATTERNS.items():
        if pattern is None:
            continue
        w(f"### {label}")
        found_any = False
        file_hits = {}
        for path in all_files:
            hits = grep_file(path, pattern)
            if hits:
                rel = str(path.relative_to(ROOT))
                file_hits[rel] = hits
                found_any = True
        if not found_any:
            w("_no matches_\n")
            continue
        for rel, hits in sorted(file_hits.items()):
            w(f"\n**`{rel}`**")
            for lineno, text in hits[:8]:   # cap at 8 lines per file
                w(f"  - L{lineno}: `{text.strip()[:120]}`")
            if len(hits) > 8:
                w(f"  - _...and {len(hits)-8} more matches_")
        w()

    # ── Theme wiring ───────────────────────────────────────────────────────────
    w("## cms_themes / Theme Wiring Audit\n")
    theme_hits = theme_audit(ROOT)
    if not theme_hits:
        w("_No theme wiring found — needs to be wired in._\n")
    else:
        for rel, entries in sorted(theme_hits.items()):
            w(f"**`{rel}`**")
            seen = set()
            for pat, ln, txt in entries:
                key = f"{ln}:{txt[:80]}"
                if key not in seen:
                    seen.add(key)
                    w(f"  - L{ln} `[{pat}]` → `{txt.strip()[:100]}`")
            w()

    # ── WorkspaceDashboard props surface ───────────────────────────────────────
    w("## WorkspaceDashboard Props Surface\n")
    wd_path = ROOT / "dashboard/components/WorkspaceDashboard.tsx"
    if wd_path.exists():
        text = wd_path.read_text(errors="replace")
        # Find the props interface/type
        prop_block = re.findall(
            r"(?:interface|type)\s+\w*[Pp]rop\w*\s*[={][^}]{0,2000}",
            text, re.DOTALL
        )
        if prop_block:
            w("```typescript")
            w(prop_block[0][:1500])
            w("```")
        else:
            # Fallback: find function signature
            fn_sig = re.findall(
                r"(?:function|const)\s+WorkspaceDashboard[^{]{0,400}",
                text, re.DOTALL
            )
            if fn_sig:
                w("```typescript")
                w(fn_sig[0][:600])
                w("```")
            else:
                w("_Could not extract props — check file manually_")
    else:
        w("_WorkspaceDashboard.tsx not found at expected path_")
    w()

    # ── + menu current items ───────────────────────────────────────────────────
    w("## Current + Menu Items\n")
    plus_patterns = [r"Plan", r"Debug", r"Ask", r"Image", r"Skills", r"MCP", r"Connectors"]
    for path in all_files:
        rel = str(path.relative_to(ROOT))
        if "WorkspaceDashboard" not in rel and "ChatAssistant" not in rel:
            continue
        text = path.read_text(errors="replace")
        for pat in plus_patterns:
            for i, line in enumerate(text.splitlines(), 1):
                if re.search(rf"['\"`]{{0,1}}{pat}['\"`]{{0,1}}", line) and len(line.strip()) < 150:
                    w(f"  L{i} in `{rel}`: `{line.strip()[:120]}`")
    w()

    # ── recentFiles wiring ────────────────────────────────────────────────────
    w("## recentFiles / Recently Opened Wiring\n")
    for path in all_files:
        hits = grep_file(path, r"(?i)(recentFiles|recently.?opened|recentlyOpened)")
        if hits:
            rel = str(path.relative_to(ROOT))
            w(f"**`{rel}`**")
            for ln, txt in hits[:6]:
                w(f"  L{ln}: `{txt.strip()[:120]}`")
            w()

    # ── Summary checklist ─────────────────────────────────────────────────────
    w("## Pre-Build Checklist\n")
    checks = [
        ("Git working tree is clean",            status == "clean"),
        ("WorkspaceDashboard.tsx exists",         (ROOT / "dashboard/components/WorkspaceDashboard.tsx").exists()),
        ("ChatAssistant.tsx (features) exists",   (ROOT / "dashboard/features/agent-chat/ChatAssistant.tsx").exists()),
        ("App.tsx exists",                        (ROOT / "dashboard/App.tsx").exists()),
        ("WorkflowsPage.tsx exists",              (ROOT / "dashboard/pages/workflows/WorkflowsPage.tsx").exists()),
        ("Theme wiring found somewhere",          len(theme_hits) > 0),
    ]
    for label, ok in checks:
        icon = "✅" if ok else "❌"
        w(f"- {icon} {label}")

    # ── Write report ──────────────────────────────────────────────────────────
    out = ROOT / "scripts" / "audit_agent_remaster_report.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(report_lines))
    print(f"\nReport written to: {out}")
    print("\n--- CHECKLIST SUMMARY ---")
    for label, ok in checks:
        icon = "✅" if ok else "❌"
        print(f"  {icon} {label}")

if __name__ == "__main__":
    main()
