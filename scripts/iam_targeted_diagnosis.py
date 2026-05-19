#!/usr/bin/env python3
"""
iam_targeted_diagnosis.py
==========================
Reads the EXACT files from the Agent dashboard architecture and
extracts the specific lines responsible for each known bug.

Output: iam_diagnosis.md  (copy-paste ready for Cursor/Claude fix session)

Usage:  python3 scripts/iam_targeted_diagnosis.py
        (run from repo root ~/inneranimalmedia)
"""

import re, sys, json, datetime
from pathlib import Path

REPO = Path(__file__).parent.parent  # scripts/ → repo root

# ── EXACT FILE MAP from architecture description ──────────────────────────────
FILES = {
    # Layout / shell
    "App":                  "dashboard/App.tsx",
    "LocalExplorer":        "dashboard/components/LocalExplorer.tsx",
    "R2Explorer":           "dashboard/components/R2Explorer.tsx",
    "GitHubExplorer":       "dashboard/components/GitHubExplorer.tsx",
    "GoogleDriveExplorer":  "dashboard/components/GoogleDriveExplorer.tsx",
    "WorkspaceDashboard":   "dashboard/components/WorkspaceDashboard.tsx",
    "UnifiedSearchBar":     "dashboard/components/UnifiedSearchBar.tsx",
    "XTermShell":           "dashboard/components/XTermShell.tsx",
    # Chat
    "ChatAssistant":        "dashboard/features/agent-chat/ChatAssistant.tsx",
    "useAgentChatStream":   "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
    "agentChatConstants":   "dashboard/agentChatConstants.ts",
    # MovieMode
    "MovieModeStudio":      "dashboard/features/moviemode/MovieModeStudio.tsx",
    "MediaLibrary":         "dashboard/features/moviemode/MediaLibrary.tsx",
    "moviemode_types":      "dashboard/src/types/moviemode.ts",
    # Worker APIs
    "agent_api":            "src/api/agent.js",
    "unified_search_api":   "src/api/unified-search.js",
    "r2_api":               "src/api/r2-api.js",
    "dashboard_api":        "src/api/dashboard.js",
    "index":                "src/index.js",
    "production_dispatch":  "src/core/production-dispatch.js",
    # R2 / storage
    "r2Buckets":            "dashboard/src/lib/r2Buckets.ts",
    "mediaPreview":         "dashboard/src/lib/mediaPreview.ts",
    # Auth
    "auth_components":      "dashboard/components/auth",
    # Workspace
    "ideWorkspace":         "dashboard/src/ideWorkspace.ts",
    "EditorContext":        "dashboard/src/EditorContext.tsx",
    # Config
    "wrangler_prod":        "wrangler.production.toml",
    "vite_config":          "dashboard/vite.config.ts",
}

# ── PER-BUG DIAGNOSTIC PROBES ─────────────────────────────────────────────────
# Each probe: which file(s) to read, what patterns to find, what to explain

BUGS = {

    "HARDCODED_R2": {
        "title": "R2 Hardcoded Buckets / 'BOUND' label inaccuracy",
        "files": ["r2Buckets", "R2Explorer", "r2_api", "App", "UnifiedSearchBar"],
        "probes": [
            # Any static list of bucket names
            (r'(inneranimalmedia-assets|autorag|iam-platform|iam-docs|agent-sam)',
             "Hardcoded bucket name literal"),
            (r'bucketLabelToBinding|BINDING_MAP|bindingMap|labelToBinding',
             "Static label→binding map (should come from API)"),
            (r'BOUND|bound.*label|badge.*BOUND',
             "'BOUND' badge logic"),
            (r'resolveR2Binding|allowlist',
             "Worker-side allowlist (should be dynamic from wrangler bindings)"),
            # Dropdown vs popup
            (r'<(Dialog|Modal|Popover|CommandPalette)[^>]*>.*?[Rr]2|[Rr]2.*?<(Dialog|Modal|Popover)',
             "R2 picker rendered inside a Modal/Dialog/Popover (should be dropdown)"),
        ],
    },

    "GITHUB_REAUTH_LOOP": {
        "title": "GitHub repo-click re-auth cycle",
        "files": ["GitHubExplorer", "App", "agent_api"],
        "probes": [
            (r'useEffect[^}]+\[[^\]]*token[^\]]*\]',
             "useEffect depending on token (may re-run on every render)"),
            (r'setRepos\s*\(\s*\[\s*\]|repos\s*=\s*\[\]',
             "repos array being cleared — triggers reconnect prompt"),
            (r'(error|err).*github|github.*(error|err|401|403)',
             "Error handling that may wipe repo list"),
            (r'connectGitHub|reconnect|reauthorize|re-auth',
             "Reconnect/re-auth trigger logic"),
            (r'localStorage.*github|sessionStorage.*github',
             "Token stored in localStorage/sessionStorage (cleared on error?)"),
            (r'octokit|@octokit',
             "Octokit instantiation — check if re-created on each render"),
        ],
    },

    "GOOGLE_DRIVE_OAUTH_LOOP": {
        "title": "Google Drive OAuth connect loop",
        "files": ["GoogleDriveExplorer", "App", "agent_api"],
        "probes": [
            (r'connectGoogleDrive|connect.*drive|drive.*connect',
             "Connect button / trigger"),
            (r'(google.*token|access_token|refresh_token).*(?:null|undefined|\'\'|\"\")',
             "Token being nulled/cleared after OAuth"),
            (r'window\.location|redirect.*oauth|oauth.*redirect',
             "OAuth redirect handling"),
            (r'useEffect[^}]+\[[^\]]*(?:token|auth|connected)[^\]]*\]',
             "useEffect on auth state (may reset after redirect)"),
            (r'isConnected|isAuthorized|driveConnected',
             "Connected state variable — check initial value and update logic"),
            (r'scope.*drive|drive.*scope',
             "Drive scope being requested — check it matches what was granted"),
        ],
    },

    "MOVIEMODE_BROKEN": {
        "title": "MovieMode MediaLibrary scan loop + glitchy viewer",
        "files": ["MediaLibrary", "MovieModeStudio", "r2_api", "agent_api"],
        "probes": [
            (r'useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*refresh[^}]*\}\s*,\s*\[refresh\]',
             "useEffect([refresh]) loop — THE core bug (bf73357 fix target)"),
            (r'onWorkspaceRootChange|rootHandle',
             "rootHandle / workspace root callback stability"),
            (r'AbortController',
             "AbortController present (good — means fix was applied)"),
            (r'api/media/assets',
             "API call to /api/media/assets — should fire once on mount only"),
            (r'<video[^>]*src|videoSrc|videoUrl|blobUrl',
             "Video src binding — check for stale blob URLs"),
            (r'URL\.createObjectURL|revokeObjectURL',
             "Blob URL lifecycle — revokeObjectURL must pair with createObjectURL"),
        ],
    },

    "EXPLORER_TABS_OPEN": {
        "title": "Explorer sections all expanded on entry",
        "files": ["LocalExplorer", "App"],
        "probes": [
            (r'(defaultOpen|isOpen|expanded|open)\s*[=:]\s*true',
             "Section defaulting to open=true"),
            (r'useState\s*\(\s*true\s*\)',
             "useState(true) — expand state initialized open"),
            (r'(LOCAL_WORKSPACE|CLOUDFLARE_R2|GITHUB_SYNC|GOOGLE_DRIVE|MOVIEMODE)',
             "Section key — check paired state default"),
            (r'Collapsible|Accordion|Disclosure|TreeItem',
             "Collapsible component used — check defaultOpen prop"),
        ],
    },

    "EXPLORER_ALIGNMENT": {
        "title": "Explorer stays left when agent moved to right side",
        "files": ["App"],
        "probes": [
            (r'agentPosition|chatPosition|panelSide|agentSide',
             "agentPosition state variable"),
            (r'(flex|grid).*(?:row|column).*(?:reverse|explorer|left|right)',
             "Flex/grid layout direction tied to agent position"),
            (r'LocalExplorer|SidePanel|activityBar|explorer.*position',
             "Explorer placement — is it fixed left or reactive to agentPosition?"),
            (r'agentPosition.*left|agentPosition.*right|position.*agent',
             "agentPosition being read to control layout"),
            (r'ml-auto|mr-auto|order-\d|flex-row-reverse',
             "CSS order/margin trick used for side-switching"),
        ],
    },

    "TOPBAR_POPUP": {
        "title": "Topbar R2 nav is popup/modal instead of inline dropdown",
        "files": ["UnifiedSearchBar", "App"],
        "probes": [
            (r'<(CommandPalette|Dialog|Modal|Sheet|Drawer)[^/]',
             "Popup/modal component wrapping the search/R2 picker"),
            (r'isOpen.*search|searchOpen|showPalette|paletteOpen',
             "Search palette open state — drives the popup"),
            (r'fixed|absolute|z-\[?[5-9]\d\d|z-50|z-100',
             "High z-index positioning (popup indicator)"),
            (r'backdrop|overlay|bg-black.*opacity|bg-opacity',
             "Backdrop/overlay — confirms modal pattern"),
            (r'<(Select|DropdownMenu|Popover)[^/].*[Rr]2|[Rr]2.*<(Select|Dropdown)',
             "Proper dropdown pattern for R2 (what it SHOULD use)"),
        ],
    },
}

# ── HELPERS ───────────────────────────────────────────────────────────────────

def read(key: str) -> tuple[str, Path] | tuple[None, None]:
    rel = FILES.get(key, key)
    p = REPO / rel
    if p.is_file():
        return p.read_text(encoding="utf-8", errors="replace"), p
    # fallback: glob for TSX/TS/JS variants
    for ext in [".tsx", ".ts", ".js", ".jsx"]:
        g = list(REPO.glob(f"**/{p.stem}{ext}"))
        if g:
            return g[0].read_text(encoding="utf-8", errors="replace"), g[0]
    return None, None

def find_lines(text: str, pattern: str, context: int = 3) -> list[dict]:
    results = []
    lines = text.splitlines()
    try:
        rx = re.compile(pattern, re.IGNORECASE | re.DOTALL)
    except re.error:
        return results
    for i, line in enumerate(lines):
        if rx.search(line):
            start = max(0, i - context)
            end   = min(len(lines), i + context + 1)
            results.append({
                "line_no": i + 1,
                "match":   line.strip(),
                "context": "\n".join(
                    f"  {start+j+1:>4} │ {lines[start+j]}"
                    for j in range(end - start)
                ),
            })
            if len(results) >= 5:  # cap per pattern
                break
    return results

# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    out_lines = []
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    out_lines += [
        "# IAM Agent Dashboard — Targeted Bug Diagnosis",
        f"Generated: {ts}",
        "",
        "> This report reads the **exact architectural files** and surfaces the",
        "> specific lines responsible for each known bug.",
        "> Copy a section into Cursor/Claude with the file open to fix in-place.",
        "",
        "---",
        "",
    ]

    summary_rows = []

    for bug_id, bug in BUGS.items():
        section_lines = []
        section_lines.append(f"## [{bug_id}]  {bug['title']}\n")

        hit_count = 0
        miss_files = []

        for file_key in bug["files"]:
            text, fpath = read(file_key)
            rel = FILES.get(file_key, file_key)

            if text is None:
                miss_files.append(rel)
                section_lines.append(f"### `{rel}`  ⚠️ FILE NOT FOUND\n")
                continue

            section_lines.append(f"### `{fpath.relative_to(REPO)}`\n")
            file_hits = 0

            for pattern, label in bug["probes"]:
                matches = find_lines(text, pattern)
                if matches:
                    file_hits += len(matches)
                    hit_count += len(matches)
                    section_lines.append(f"**🔍 {label}**")
                    for m in matches:
                        section_lines.append(f"Line {m['line_no']}: `{m['match'][:120]}`")
                        section_lines.append(f"```\n{m['context']}\n```")
                    section_lines.append("")

            if file_hits == 0:
                section_lines.append("_No matching signals in this file._\n")

        out_lines += section_lines
        out_lines += ["---\n"]

        summary_rows.append((bug_id, hit_count, len(miss_files)))

    # ── Summary table at bottom ───────────────────────────────────────────────
    out_lines.append("## Summary\n")
    out_lines.append("| Bug | Signal Hits | Missing Files |")
    out_lines.append("|-----|-------------|---------------|")
    for bug_id, hits, missing in summary_rows:
        status = "🔴" if hits > 0 else "✅"
        out_lines.append(f"| {status} `{bug_id}` | {hits} | {missing} |")

    out_path = REPO / "iam_diagnosis.md"
    out_path.write_text("\n".join(out_lines), encoding="utf-8")
    print(f"\n✅  Diagnosis written → {out_path}\n")

    print("── SIGNAL HITS PER BUG ─────────────────────────────────────")
    for bug_id, hits, missing in summary_rows:
        bar = "█" * min(hits, 40)
        print(f"  {bug_id:<30}  {hits:>3} hits  {bar}")
    print("────────────────────────────────────────────────────────────\n")

if __name__ == "__main__":
    main()
