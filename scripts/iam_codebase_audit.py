#!/usr/bin/env python3
"""
iam_codebase_audit.py
=====================
Inner Animal Media — Agent Sam Platform Codebase Auditor
---------------------------------------------------------
Crawls the repo, maps files → components → endpoints → D1 tables → R2 bindings
and flags known bug zones.  Output is structured plain-text optimised for:
  • Human review (readable sections)
  • Ollama embedding (1024-dim chunk-ready NDJSON sidecar)

Usage
-----
  python3 iam_codebase_audit.py [REPO_ROOT]   # defaults to ~/inneranimalmedia

Outputs
-------
  iam_audit_report.md         — human-readable full report
  iam_audit_chunks.ndjson     — one JSON object per embedding chunk
"""

import os, sys, re, json, hashlib, datetime
from pathlib import Path
from collections import defaultdict

# ─── CONFIG ──────────────────────────────────────────────────────────────────

REPO_ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "inneranimalmedia"

SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", ".next", ".cache",
    "__pycache__", ".turbo", "coverage", ".wrangler", "static"
}
SKIP_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mov", ".avi",
    ".zip", ".tar", ".gz", ".lock", ".map"
}
TEXT_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".py", ".toml", ".json",
    ".md", ".sql", ".sh", ".env", ".yaml", ".yml", ".css", ".html"
}

# ─── KNOWN BUG ZONES (from context) ──────────────────────────────────────────

BUG_SIGNALS = {
    "HARDCODED_R2": {
        "desc": "Hardcoded / legacy R2 bucket name (inneranimalmedia-assets)",
        "patterns": [
            r"inneranimalmedia-assets",
            r"bucketLabelToBinding",
            r"BOUND.*inneranimalmedia-assets",
            r"allowlisted.*binding",
        ],
        "files_hint": ["r2Buckets.ts", "R2Explorer", "r2-api.js", "agent-dashboard"],
    },
    "GITHUB_REAUTH_LOOP": {
        "desc": "GitHub OAuth re-auth / repo-click cycle — missing token refresh or invalid state reset",
        "patterns": [
            r"github.*oauth",
            r"octokit",
            r"GITHUB_TOKEN",
            r"reconnect.*github",
            r"repos.*listed",
            r"github.*repos",
        ],
        "files_hint": ["github", "GitHubSync", "auth"],
    },
    "GOOGLE_DRIVE_OAUTH_LOOP": {
        "desc": "Google Drive OAuth connect loop — permissions accepted but still shows 'Connect' button",
        "patterns": [
            r"google.*oauth",
            r"google.*drive",
            r"connect.*google",
            r"GOOGLE_CLIENT",
            r"google.*token",
            r"drive.*connect",
        ],
        "files_hint": ["GoogleDrive", "google", "oauth", "auth"],
    },
    "MOVIEMODE_BROKEN": {
        "desc": "MovieMode not fully functional — MediaLibrary scan loop, glitchy video viewer",
        "patterns": [
            r"MovieMode",
            r"MediaLibrary",
            r"api/media/assets",
            r"useEffect.*refresh",
            r"onWorkspaceRootChange",
            r"AbortController",
        ],
        "files_hint": ["MovieMode", "MediaLibrary", "agent-dashboard"],
    },
    "EXPLORER_TABS_OPEN": {
        "desc": "Explorer tabs all open on entry — should default to collapsed",
        "patterns": [
            r"defaultOpen.*true",
            r"isOpen.*true",
            r"expanded.*true",
            r"LOCAL_WORKSPACE.*open",
            r"CLOUDFLARE_R2.*open",
        ],
        "files_hint": ["Explorer", "LocalExplorer", "R2Explorer", "Sidebar"],
    },
    "EXPLORER_ALIGNMENT": {
        "desc": "Explorer stays left when chat assistant is moved right — should mirror opposite side",
        "patterns": [
            r"left.*explorer",
            r"explorer.*left",
            r"chatPosition",
            r"agentSide",
            r"panelSide",
            r"flex.*row.*explorer",
        ],
        "files_hint": ["Dashboard", "Layout", "AgentPanel", "Explorer"],
    },
    "TOPBAR_POPUP": {
        "desc": "Topbar nav R2 picker is a popup/modal — should be an inline dropdown",
        "patterns": [
            r"modal.*r2",
            r"r2.*modal",
            r"CommandPalette",
            r"dialog.*r2",
            r"popup.*bucket",
            r"bucket.*popup",
        ],
        "files_hint": ["TopBar", "Nav", "CommandPalette", "BucketPicker"],
    },
}

# ─── SECTION TAXONOMY ────────────────────────────────────────────────────────

SECTIONS = {
    "WORKER_CORE":      ["src/index.js", "src/router", "src/middleware", "worker"],
    "API_ENDPOINTS":    ["src/api/", "api/"],
    "AGENT_SYSTEM":     ["src/agent", "agentsam", "agent-sam", "resolveModel", "workflow"],
    "DASHBOARD_UI":     ["dashboard/", "components/", "pages/", "views/"],
    "R2_STORAGE":       ["r2", "R2", "storage", "bucket"],
    "D1_DATABASE":      ["d1", "D1", "database", "schema", "migrations", "sql"],
    "AUTH":             ["auth", "oauth", "github", "google", "session"],
    "MOVIEMODE":        ["movie", "Movie", "media", "Media", "video"],
    "EXPLORER":         ["explorer", "Explorer", "workspace", "Workspace"],
    "INFRA_CONFIG":     ["wrangler", "toml", "cloudflare", "worker.toml", ".env"],
    "SCRIPTS":          ["scripts/", ".py", ".sh"],
    "SUPABASE":         ["supabase", "Supabase", "pgvector", "hyperdrive"],
}

# ─── EXTRACTION HELPERS ───────────────────────────────────────────────────────

def read_file(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

def extract_api_routes(text: str) -> list[str]:
    patterns = [
        r'router\.(get|post|put|delete|patch)\s*\(\s*[\'"]([^\'"]+)[\'"]',
        r'app\.(get|post|put|delete|patch)\s*\(\s*[\'"]([^\'"]+)[\'"]',
        r'\.on\s*\(\s*[\'"][A-Z]+[\'"]\s*,\s*[\'"]([^\'"]+)[\'"]',
        r'[\'"]path[\'"]\s*:\s*[\'"]([/][^\'"]+)[\'"]',
        r'fetch\s*\(\s*[\'"]([/][^\'"]+)[\'"]',
        r'[\'"]\/api\/[^\'"]+[\'"]',
    ]
    found = set()
    for pat in patterns:
        for m in re.finditer(pat, text):
            route = m.group(2) if m.lastindex and m.lastindex >= 2 else m.group(0).strip("'\"")
            if route.startswith("/"):
                found.add(route)
    return sorted(found)

def extract_d1_tables(text: str) -> list[str]:
    patterns = [
        r'FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)',
        r'INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)',
        r'UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+SET',
        r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)',
        r'\.prepare\s*\(\s*[`\'"].*?FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)',
        r'agentsam_\w+',
        r'sessions\b',
        r'tenant_context\b',
        r'session_summaries\b',
        r'knowledge_edges\b',
    ]
    found = set()
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            tbl = m.group(1) if m.lastindex else m.group(0)
            if len(tbl) > 2 and tbl.lower() not in {"select","from","where","and","or","not","null"}:
                found.add(tbl)
    return sorted(found)

def extract_r2_bindings(text: str) -> list[str]:
    patterns = [
        r'env\.([A-Z][A-Z0-9_]*)\s*\.\s*(?:get|put|list|delete)',
        r'bindings\s*:\s*\{[^}]*([A-Z][A-Z0-9_]+)\s*:',
        r'r2_buckets\s*=\s*\[([^\]]+)\]',
        r'"binding"\s*:\s*"([^"]+)"',
        r'bucket_name.*?["\']([^"\']+)["\']',
    ]
    found = set()
    for pat in patterns:
        for m in re.finditer(pat, text):
            found.add(m.group(1))
    # Also catch literal bucket names
    for m in re.finditer(r'["\']([a-z][a-z0-9\-]{3,})["\']', text):
        val = m.group(1)
        if any(x in val for x in ["inneranimalmedia","iam-","autorag","agent-sam","r2"]):
            found.add(val)
    return sorted(found)

def extract_components(text: str, filepath: Path) -> list[str]:
    components = []
    # React/TS function components
    for m in re.finditer(r'(?:export\s+(?:default\s+)?function|const)\s+([A-Z][a-zA-Z0-9]+)\s*(?:=|\()', text):
        components.append(m.group(1))
    # Class components
    for m in re.finditer(r'class\s+([A-Z][a-zA-Z0-9]+)\s+extends\s+(?:React\.)?Component', text):
        components.append(m.group(1))
    return list(dict.fromkeys(components))  # dedup, preserve order

def classify_section(filepath: Path) -> str:
    path_str = str(filepath).replace("\\", "/")
    for section, hints in SECTIONS.items():
        for hint in hints:
            if hint.lower() in path_str.lower():
                return section
    return "OTHER"

def check_bugs(filepath: Path, text: str) -> list[dict]:
    hits = []
    path_str = str(filepath)
    for bug_id, bug in BUG_SIGNALS.items():
        matched_patterns = []
        for pat in bug["patterns"]:
            if re.search(pat, text, re.IGNORECASE):
                matched_patterns.append(pat)
        file_hint_match = any(
            h.lower() in path_str.lower() for h in bug["files_hint"]
        )
        if matched_patterns or file_hint_match:
            hits.append({
                "bug_id": bug_id,
                "desc": bug["desc"],
                "matched_patterns": matched_patterns,
                "file_hint_match": file_hint_match,
                "confidence": "HIGH" if (matched_patterns and file_hint_match) else
                              "MED"  if matched_patterns else "LOW",
            })
    return hits

# ─── MAIN CRAWL ──────────────────────────────────────────────────────────────

def crawl(root: Path):
    index = defaultdict(list)      # section → [file_record]
    bug_map = defaultdict(list)    # bug_id  → [file_record]
    all_routes = set()
    all_tables = set()
    all_r2     = set()
    total_files = 0

    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skip dirs in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in filenames:
            fpath = Path(dirpath) / fname
            if fpath.suffix.lower() in SKIP_EXTS:
                continue
            if fpath.suffix.lower() not in TEXT_EXTS:
                continue

            rel = fpath.relative_to(root)
            text = read_file(fpath)
            if text is None:
                continue

            total_files += 1
            section   = classify_section(rel)
            routes    = extract_api_routes(text)
            tables    = extract_d1_tables(text)
            r2        = extract_r2_bindings(text)
            comps     = extract_components(text, rel)
            bugs      = check_bugs(rel, text)
            line_count = text.count("\n") + 1

            record = {
                "file": str(rel),
                "section": section,
                "lines": line_count,
                "size_kb": round(fpath.stat().st_size / 1024, 1),
                "components": comps[:20],
                "api_routes": routes[:30],
                "d1_tables": tables[:20],
                "r2_bindings": r2[:15],
                "bugs": bugs,
            }

            index[section].append(record)
            all_routes.update(routes)
            all_tables.update(tables)
            all_r2.update(r2)
            for b in bugs:
                bug_map[b["bug_id"]].append({
                    "file": str(rel),
                    "confidence": b["confidence"],
                    "matched": b["matched_patterns"],
                })

    return index, bug_map, sorted(all_routes), sorted(all_tables), sorted(all_r2), total_files

# ─── REPORT WRITER ───────────────────────────────────────────────────────────

def write_report(index, bug_map, all_routes, all_tables, all_r2, total_files, out_path: Path):
    lines = []
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    lines += [
        f"# Inner Animal Media — Agent Sam Codebase Audit",
        f"Generated: {ts}  |  Repo: {REPO_ROOT}  |  Files scanned: {total_files}",
        "",
        "---",
        "",
    ]

    # ── BUG SUMMARY (top of file for quick scanning) ─────────────────────────
    lines += ["## 🐛 KNOWN BUG ZONES — PRIORITY FLAGS\n"]
    for bug_id, bug in BUG_SIGNALS.items():
        hits = bug_map.get(bug_id, [])
        high = [h for h in hits if h["confidence"] == "HIGH"]
        med  = [h for h in hits if h["confidence"] == "MED"]
        low  = [h for h in hits if h["confidence"] == "LOW"]
        status = "✅ No signals found" if not hits else \
                 f"🔴 {len(high)} HIGH  🟡 {len(med)} MED  ⚪ {len(low)} LOW"
        lines.append(f"### [{bug_id}] {bug['desc']}")
        lines.append(f"**Status:** {status}")
        if hits:
            lines.append("**Files:**")
            for h in sorted(hits, key=lambda x: {"HIGH":0,"MED":1,"LOW":2}[x["confidence"]])[:8]:
                lines.append(f"  - `{h['file']}` [{h['confidence']}]" +
                             (f" — patterns: {', '.join(h['matched'][:3])}" if h["matched"] else ""))
        lines.append("")

    lines += ["---\n"]

    # ── GLOBAL INVENTORIES ───────────────────────────────────────────────────
    lines.append("## 📡 ALL API ROUTES DETECTED\n")
    for r in sorted(all_routes):
        lines.append(f"  - `{r}`")
    lines.append("")

    lines.append("## 🗄️ ALL D1 TABLE REFERENCES DETECTED\n")
    for t in sorted(all_tables):
        lines.append(f"  - `{t}`")
    lines.append("")

    lines.append("## 🪣 ALL R2 BINDING / BUCKET NAMES DETECTED\n")
    for b in sorted(all_r2):
        legacy = " ⚠️ LEGACY" if b == "inneranimalmedia-assets" else ""
        lines.append(f"  - `{b}`{legacy}")
    lines.append("")

    lines += ["---\n"]

    # ── PER-SECTION FILE BREAKDOWN ────────────────────────────────────────────
    lines.append("## 📁 FILE MAP — BY SECTION\n")
    section_order = [
        "WORKER_CORE", "API_ENDPOINTS", "AGENT_SYSTEM", "DASHBOARD_UI",
        "R2_STORAGE", "D1_DATABASE", "AUTH", "MOVIEMODE", "EXPLORER",
        "INFRA_CONFIG", "SUPABASE", "SCRIPTS", "OTHER",
    ]
    for section in section_order:
        files = index.get(section, [])
        if not files:
            continue
        lines.append(f"### {section}  ({len(files)} files)\n")
        for rec in sorted(files, key=lambda x: x["size_kb"], reverse=True):
            bug_flags = ""
            if rec["bugs"]:
                tags = list({b["bug_id"] for b in rec["bugs"] if b["confidence"] in ("HIGH","MED")})
                if tags:
                    bug_flags = "  🐛 " + ", ".join(tags)
            lines.append(f"- **`{rec['file']}`**  ({rec['lines']} lines, {rec['size_kb']} KB){bug_flags}")

            if rec["components"]:
                lines.append(f"  - Components: `{'`, `'.join(rec['components'][:8])}`")
            if rec["api_routes"]:
                lines.append(f"  - Routes: `{'`, `'.join(rec['api_routes'][:6])}`")
            if rec["d1_tables"]:
                lines.append(f"  - D1 tables: `{'`, `'.join(rec['d1_tables'][:6])}`")
            if rec["r2_bindings"]:
                lines.append(f"  - R2: `{'`, `'.join(rec['r2_bindings'][:5])}`")
        lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"✅  Report written → {out_path}")

# ─── NDJSON CHUNK WRITER (for Ollama embedding) ──────────────────────────────

def write_chunks(index, bug_map, all_routes, all_tables, all_r2, out_path: Path):
    chunks = []

    def make_chunk(section: str, title: str, body: str, tags: list[str]):
        text = f"[SECTION:{section}] {title}\n\n{body}"
        chunk_id = hashlib.md5(text.encode()).hexdigest()[:12]
        return {
            "id": chunk_id,
            "section": section,
            "title": title,
            "text": text,
            "tags": tags,
            "source": "iam_codebase_audit",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }

    # One chunk per file (non-empty)
    for section, files in index.items():
        for rec in files:
            parts = [f"File: {rec['file']} ({rec['lines']} lines, {rec['size_kb']} KB)"]
            if rec["components"]:
                parts.append("Components: " + ", ".join(rec["components"][:12]))
            if rec["api_routes"]:
                parts.append("API routes: " + ", ".join(rec["api_routes"][:10]))
            if rec["d1_tables"]:
                parts.append("D1 tables: " + ", ".join(rec["d1_tables"][:10]))
            if rec["r2_bindings"]:
                parts.append("R2 bindings: " + ", ".join(rec["r2_bindings"][:8]))
            if rec["bugs"]:
                bug_strs = [f"{b['bug_id']}({b['confidence']})" for b in rec["bugs"]]
                parts.append("BUG FLAGS: " + ", ".join(bug_strs))
            body = "\n".join(parts)
            tags = [section, rec["file"].split("/")[0]] + [b["bug_id"] for b in rec["bugs"]]
            chunks.append(make_chunk(section, f"File: {rec['file']}", body, tags))

    # Bug summary chunks
    for bug_id, bug in BUG_SIGNALS.items():
        hits = bug_map.get(bug_id, [])
        body = f"Description: {bug['desc']}\n"
        body += f"Signals pattern: {', '.join(bug['patterns'][:4])}\n"
        body += f"Files with signals ({len(hits)}):\n"
        for h in hits[:10]:
            body += f"  - {h['file']} [{h['confidence']}]\n"
        chunks.append(make_chunk("BUG_ZONE", f"Bug: {bug_id}", body, ["bug", bug_id]))

    # Global inventory chunk
    body  = "API Routes:\n" + "\n".join(f"  {r}" for r in all_routes[:60])
    body += "\n\nD1 Tables:\n" + "\n".join(f"  {t}" for t in sorted(all_tables)[:40])
    body += "\n\nR2 Buckets/Bindings:\n" + "\n".join(f"  {b}" for b in sorted(all_r2)[:20])
    chunks.append(make_chunk("INVENTORY", "Global API / D1 / R2 Inventory", body,
                             ["api", "d1", "r2", "inventory"]))

    with out_path.open("w", encoding="utf-8") as f:
        for ch in chunks:
            f.write(json.dumps(ch) + "\n")

    print(f"✅  Embedding chunks written → {out_path}  ({len(chunks)} chunks)")

# ─── ENTRY POINT ─────────────────────────────────────────────────────────────

def main():
    if not REPO_ROOT.exists():
        print(f"❌  Repo not found at {REPO_ROOT}")
        print("    Usage: python3 iam_codebase_audit.py /path/to/inneranimalmedia")
        sys.exit(1)

    print(f"🔍  Crawling {REPO_ROOT} ...")
    index, bug_map, all_routes, all_tables, all_r2, total_files = crawl(REPO_ROOT)
    print(f"    {total_files} files classified into {len(index)} sections")

    out_dir = Path.cwd()
    write_report(index, bug_map, all_routes, all_tables, all_r2, total_files,
                 out_dir / "iam_audit_report.md")
    write_chunks(index, bug_map, all_routes, all_tables, all_r2,
                 out_dir / "iam_audit_chunks.ndjson")

    # Print quick bug summary to console
    print("\n── BUG SIGNAL SUMMARY ──────────────────────────────────────")
    for bug_id in BUG_SIGNALS:
        hits = bug_map.get(bug_id, [])
        high = sum(1 for h in hits if h["confidence"] == "HIGH")
        med  = sum(1 for h in hits if h["confidence"] == "MED")
        print(f"  {bug_id:<30}  🔴{high} HIGH  🟡{med} MED  ({len(hits)} total files)")
    print("────────────────────────────────────────────────────────────\n")

if __name__ == "__main__":
    main()
