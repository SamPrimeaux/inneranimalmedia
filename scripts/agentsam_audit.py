#!/usr/bin/env python3
"""
agentsam_audit.py
Scans src/ for agentsam_* table usage, queries D1 for real schemas,
cross-references Supabase tables, and prints a prioritized repair plan.

Usage:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/agentsam_audit.py
"""

import subprocess, json, re, os, sys
from pathlib import Path
from collections import defaultdict

REPO     = Path("/Users/samprimeaux/inneranimalmedia")
SRC      = REPO / "src"
DB_NAME  = "inneranimalmedia-business"
WRANGLER_CONFIG = "wrangler.production.toml"

# ── ANSI colours ─────────────────────────────────────────────────────────────
R  = "\033[31m"; G  = "\033[32m"; Y  = "\033[33m"
B  = "\033[34m"; M  = "\033[35m"; C  = "\033[36m"; W = "\033[0m"

def h1(t): print(f"\n{B}{'═'*70}{W}\n{B}  {t}{W}\n{B}{'═'*70}{W}")
def h2(t): print(f"\n{C}── {t} {'─'*(65-len(t))}{W}")
def ok(t):   print(f"  {G}✓{W} {t}")
def warn(t): print(f"  {Y}⚠{W}  {t}")
def err(t):  print(f"  {R}✗{W} {t}")
def info(t): print(f"  {M}→{W} {t}")

# ── D1 query helper ───────────────────────────────────────────────────────────
def d1(sql):
    try:
        r = subprocess.run(
            ["npx","wrangler","d1","execute", DB_NAME,
             "--remote", "-c", WRANGLER_CONFIG,
             "--json", "--command", sql],
            cwd=REPO, capture_output=True, text=True, timeout=30
        )
        data = json.loads(r.stdout)
        if isinstance(data, list) and data:
            return data[0].get("results", [])
        return []
    except Exception as e:
        return [{"error": str(e)}]

# ── 1. D1 real tables ─────────────────────────────────────────────────────────
def get_d1_tables():
    rows = d1("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    return [r["name"] for r in rows if "error" not in r]

def get_table_cols(table):
    rows = d1(f"PRAGMA table_info('{table}')")
    return [r["name"] for r in rows if "error" not in r]

def get_table_rowcount(table):
    rows = d1(f"SELECT COUNT(*) as n FROM \"{table}\"")
    if rows and "n" in rows[0]:
        return rows[0]["n"]
    return "?"

# ── 2. Codebase scan ──────────────────────────────────────────────────────────
def scan_src():
    """Return dict: table_name → list of (file, line, snippet)"""
    refs = defaultdict(list)
    pattern = re.compile(r'agentsam_\w+')
    exts = {".js", ".ts", ".mjs", ".py", ".sql"}
    skip = {"node_modules", ".git", "dist", ".bak"}

    for f in SRC.rglob("*"):
        if f.suffix not in exts: continue
        if any(s in f.parts for s in skip): continue
        try:
            lines = f.read_text(errors="replace").splitlines()
        except: continue
        for i, line in enumerate(lines, 1):
            for m in pattern.finditer(line):
                tbl = m.group()
                snippet = line.strip()[:90]
                refs[tbl].append((str(f.relative_to(REPO)), i, snippet))

    # also scan worker.js and scripts/
    for extra in [REPO/"worker.js", REPO/"scripts"]:
        if not extra.exists(): continue
        files = [extra] if extra.is_file() else extra.rglob("*")
        for f in (files if extra.is_file() else list(files)):
            if hasattr(f,"suffix") and f.suffix not in exts: continue
            try: lines = Path(f).read_text(errors="replace").splitlines()
            except: continue
            for i, line in enumerate(lines, 1):
                for m in pattern.finditer(line):
                    tbl = m.group()
                    snippet = line.strip()[:90]
                    refs[tbl].append((str(Path(f).relative_to(REPO)), i, snippet))

    return refs

# ── 3. RAG / agent pipeline scan ─────────────────────────────────────────────
RAG_PATTERNS = [
    "search_all_context", "searchAllContext", "buildTieredContext",
    "preflightClassify",  "classifyIntent",   "selectAutoModel",
    "agentChatDirect",    "chatWithTools",     "ragSearch",
    "Promise.race",       "withTimeout",       "search_all_context",
]

def scan_agent_pipeline():
    hits = defaultdict(list)
    agent_file = SRC / "api" / "agent.js"
    files_to_check = [agent_file]
    for extra in ["src/core/workflow-executor.js","src/integrations/anthropic.js",
                  "src/tools/ai-dispatch.js","worker.js"]:
        p = REPO / extra
        if p.exists(): files_to_check.append(p)

    for f in files_to_check:
        try: lines = f.read_text(errors="replace").splitlines()
        except: continue
        for i, line in enumerate(lines, 1):
            for pat in RAG_PATTERNS:
                if pat in line:
                    hits[pat].append((str(f.relative_to(REPO)), i, line.strip()[:100]))
    return hits

# ── 4. Blocking await detection ───────────────────────────────────────────────
def find_unguarded_awaits():
    """Find awaits with no timeout guard near rag/context/search calls"""
    agent_file = SRC / "api" / "agent.js"
    if not agent_file.exists(): return []
    lines = agent_file.read_text(errors="replace").splitlines()
    danger = []
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if not stripped.startswith("await"): continue
        if any(k in stripped for k in ["rag","Rag","context","Context","search","Search","hyperdrive","supabase"]):
            # check if nearby lines have timeout/race
            window = lines[max(0,i-5):i+5]
            guarded = any("Promise.race" in w or "withTimeout" in w or "AbortSignal" in w or ".timeout" in w for w in window)
            if not guarded:
                danger.append((str(agent_file.relative_to(REPO)), i, stripped[:100]))
    return danger

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    h1("AGENT SAM — CODEBASE + D1 AUDIT")

    # ── D1 tables ──────────────────────────────────────────────────────────────
    h2("D1 Tables (remote)")
    d1_tables = get_d1_tables()
    agentsam_tables = [t for t in d1_tables if t.startswith("agentsam_")]
    other_tables    = [t for t in d1_tables if not t.startswith("agentsam_")]

    print(f"\n  agentsam_* tables ({len(agentsam_tables)}):")
    table_meta = {}
    for t in sorted(agentsam_tables):
        cols = get_table_cols(t)
        n    = get_table_rowcount(t)
        table_meta[t] = {"cols": cols, "rows": n}
        print(f"    {G}{t}{W}  ({n} rows)  cols: {', '.join(cols[:8])}{'…' if len(cols)>8 else ''}")

    print(f"\n  Other tables ({len(other_tables)}): {', '.join(other_tables)}")

    # ── Codebase refs ──────────────────────────────────────────────────────────
    h2("Codebase agentsam_* references")
    refs = scan_src()
    code_tables = set(refs.keys())
    d1_set      = set(agentsam_tables)

    missing_in_d1   = sorted(code_tables - d1_set)
    missing_in_code = sorted(d1_set - code_tables)
    matched         = sorted(code_tables & d1_set)

    print(f"\n  Referenced in code + exist in D1 ({len(matched)}):")
    for t in matched:
        ok(f"{t}  ({len(refs[t])} refs)")

    if missing_in_d1:
        print(f"\n  {R}Referenced in code but MISSING from D1 ({len(missing_in_d1)}):{W}")
        for t in missing_in_d1:
            files = list({r[0] for r in refs[t]})[:3]
            err(f"{t}  — seen in: {', '.join(files)}")

    if missing_in_code:
        print(f"\n  {Y}In D1 but never referenced in code ({len(missing_in_code)}):{W}")
        for t in missing_in_code:
            warn(t)

    # ── Agent pipeline ─────────────────────────────────────────────────────────
    h2("Agent chat pipeline functions")
    pipe = scan_agent_pipeline()
    critical = ["search_all_context","classifyIntent","selectAutoModel",
                "agentChatDirect","chatWithTools","buildTieredContext"]
    for fn in critical:
        hits = pipe.get(fn, [])
        if hits:
            files = list({h[0] for h in hits})
            ok(f"{fn}  ({len(hits)} refs in {', '.join(files[:2])})")
        else:
            err(f"{fn}  — NOT FOUND anywhere in src/")

    # ── Unguarded blocking awaits (the hang culprit) ───────────────────────────
    h2("Unguarded blocking awaits (hang risk)")
    danger = find_unguarded_awaits()
    if danger:
        print(f"\n  {R}Found {len(danger)} unguarded await(s) near RAG/context/search:{W}")
        for f, line, snippet in danger[:15]:
            err(f"  {f}:{line}")
            print(f"       {Y}{snippet}{W}")
    else:
        ok("No obvious unguarded RAG awaits found")

    # ── agentsam_memory specific ───────────────────────────────────────────────
    h2("agentsam_memory health")
    mem_cols = table_meta.get("agentsam_memory", {}).get("cols", [])
    required = ["id","tenant_id","user_id","key","value","memory_type","tags","expires_at"]
    for col in required:
        if col in mem_cols: ok(col)
        else: err(f"{col} MISSING from agentsam_memory")

    mem_rows = d1("SELECT memory_type, COUNT(*) as n FROM agentsam_memory GROUP BY memory_type")
    if mem_rows:
        print("\n  Row breakdown:")
        for r in mem_rows:
            print(f"    {r.get('memory_type','?'):15s}  {r.get('n',0)} rows")

    # ── Repair plan ────────────────────────────────────────────────────────────
    h1("REPAIR PLAN (priority order)")

    priority = []

    if danger:
        priority.append((R+"P0"+W, "RAG hang",
            f"{len(danger)} unguarded await(s) block the chat pipeline. "
            "Wrap search_all_context in Promise.race with 3s timeout. "
            "Agents will never respond until this is fixed."))

    if "classifyIntent" in [fn for fn in critical if not pipe.get(fn)]:
        priority.append((R+"P0"+W, "classifyIntent dead",
            "Function not found in src/. Routing pipeline produces 'unclassified' → zero tools loaded."))

    if "selectAutoModel" in [fn for fn in critical if not pipe.get(fn)]:
        priority.append((Y+"P1"+W, "selectAutoModel not called",
            "Model selection dead code. Currently hardcoded fallbacks only."))

    for t in missing_in_d1:
        priority.append((Y+"P1"+W, f"Missing D1 table: {t}",
            f"Code references {t} but table doesn't exist — will throw at runtime."))

    for t in missing_in_code:
        priority.append((M+"P2"+W, f"Orphaned D1 table: {t}",
            f"{t} exists in D1 but is never queried — wasted schema."))

    if not priority:
        ok("No critical issues found — check wrangler tail for runtime errors")
    else:
        for i, (pri, title, desc) in enumerate(priority, 1):
            print(f"\n  {pri}  [{i}] {title}")
            print(f"       {desc}")

    print(f"\n{B}{'═'*70}{W}")
    print(f"  Run this again after fixes to verify. Output: agentsam_audit_{{}}.txt")
    print(f"{B}{'═'*70}{W}\n")

if __name__ == "__main__":
    main()
