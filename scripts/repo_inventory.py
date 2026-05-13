#!/usr/bin/env python3
"""
Two-in-one:
1. Legacy table audit — runtime refs only (src/, worker.js, dashboard/src/, scripts/)
2. Repo wireframe — directory structure, file sizes, routes, table refs
"""

import json, os, re, subprocess, urllib.request
from pathlib import Path
from collections import defaultdict

# --- load env ---
env_path = Path.home() / "inneranimalmedia/.env.agentsam.local"
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

CF_ACCOUNT_ID  = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
REPO           = Path.home() / "inneranimalmedia"

D1_ENDPOINT = (
    f"https://api.cloudflare.com/client/v4/accounts"
    f"/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
)

# Runtime source paths only — no migrations, artifacts, docs, tmp, analytics
RUNTIME_DIRS = [
    REPO / "src",
    REPO / "worker.js",
    REPO / "dashboard" / "src",
    REPO / "scripts",
]
RUNTIME_EXTS = {".js", ".ts", ".tsx", ".py"}

IGNORE_DIRS = {
    "migrations", "artifacts", "docs", "analytics",
    "tmp", "audits", "node_modules", ".git", "dist", ".wrangler"
}

# ── helpers ──────────────────────────────────────────────────────────────────

def d1_query(sql):
    body = json.dumps({"sql": sql, "params": []}).encode()
    req = urllib.request.Request(
        D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if not data.get("success"):
        raise RuntimeError(f"D1 error: {data}")
    return data["result"][0]["results"]

def get_row_count(table):
    try:
        return d1_query(f"SELECT COUNT(*) as n FROM \"{table}\"")[0]["n"]
    except:
        return "?"

def runtime_grep(pattern):
    """Grep only runtime source files. Returns list of matching file paths."""
    args = ["grep", "-rl",
            "--include=*.js", "--include=*.ts",
            "--include=*.tsx", "--include=*.py",
            pattern]
    # Add each runtime path that exists
    targets = [str(p) for p in RUNTIME_DIRS if p.exists()]
    if not targets:
        return []
    try:
        result = subprocess.run(
            args + targets,
            capture_output=True, text=True, timeout=15
        )
        return [f for f in result.stdout.strip().splitlines()
                if not any(bad in f for bad in IGNORE_DIRS)]
    except:
        return []

def fmt_size(n):
    if n < 1024: return f"{n}B"
    if n < 1024**2: return f"{n//1024}KB"
    return f"{n/1024**2:.1f}MB"

# ── SECTION 1: Repo Wireframe ─────────────────────────────────────────────────

def build_wireframe():
    print("\n" + "="*60)
    print("REPO WIREFRAME")
    print("="*60)

    total_files = 0
    total_size  = 0
    by_ext      = defaultdict(lambda: {"count": 0, "size": 0})
    large_files = []
    all_runtime_files = []

    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in sorted(dirs)
                   if d not in IGNORE_DIRS and not d.startswith(".")]
        rel_root = Path(root).relative_to(REPO)
        depth = len(rel_root.parts)
        if depth > 4:
            continue
        for fname in files:
            fpath = Path(root) / fname
            try:
                size = fpath.stat().st_size
            except:
                continue
            ext = fpath.suffix.lower()
            total_files += 1
            total_size  += size
            by_ext[ext]["count"] += 1
            by_ext[ext]["size"]  += size
            if size > 50_000:
                large_files.append((size, fpath.relative_to(REPO)))
            if ext in RUNTIME_EXTS and not any(bad in str(fpath) for bad in IGNORE_DIRS):
                all_runtime_files.append(fpath)

    # Directory tree (top 2 levels)
    print(f"\n{'inneranimalmedia/':<45} (root)")
    for item in sorted(REPO.iterdir()):
        if item.name.startswith(".") or item.name in IGNORE_DIRS:
            continue
        if item.is_dir():
            sub_files = list(item.rglob("*"))
            sub_count = sum(1 for f in sub_files if f.is_file()
                           and not any(bad in str(f) for bad in IGNORE_DIRS))
            sub_size  = sum(f.stat().st_size for f in sub_files
                           if f.is_file() and not any(bad in str(f) for bad in IGNORE_DIRS))
            print(f"  {'├── ' + item.name + '/':<43} {sub_count} files  {fmt_size(sub_size)}")
        else:
            size = item.stat().st_size
            print(f"  {'├── ' + item.name:<43} {fmt_size(size)}")

    # File type breakdown
    print(f"\n{'─'*60}")
    print("File types (runtime source):")
    for ext, info in sorted(by_ext.items(), key=lambda x: -x[1]["size"]):
        if ext in RUNTIME_EXTS:
            print(f"  {ext:<8} {info['count']:>4} files   {fmt_size(info['size'])}")

    print(f"\n  Total tracked: {total_files} files  {fmt_size(total_size)}")

    # Largest files
    large_files.sort(reverse=True)
    print(f"\n{'─'*60}")
    print("Largest files (>50KB):")
    for size, path in large_files[:20]:
        print(f"  {fmt_size(size):>8}  {path}")

    # Route extraction
    print(f"\n{'─'*60}")
    print("API routes found in runtime source:")
    route_pattern = re.compile(
        r'''(?:router\.|app\.|fetch.*?)\s*(?:get|post|put|patch|delete|handle)\s*\(\s*['"`]([/][^'"`\s]{2,})['"`]'''
        r'''|['"](/api/[^'"\\s]{2,})['"]''',
        re.IGNORECASE
    )
    routes = set()
    for fpath in all_runtime_files:
        try:
            text = fpath.read_text(errors="ignore")
            for m in route_pattern.finditer(text):
                route = m.group(1) or m.group(2)
                if route and len(route) > 3:
                    routes.add(route)
        except:
            pass

    for route in sorted(routes)[:60]:
        print(f"  {route}")
    if len(routes) > 60:
        print(f"  ... and {len(routes)-60} more")

    return all_runtime_files

# ── SECTION 2: Runtime Table Audit ───────────────────────────────────────────

def table_audit():
    print("\n" + "="*60)
    print("LEGACY TABLE AUDIT — runtime refs only")
    print("="*60)

    print("\nFetching tables from D1...")
    legacy_rows = d1_query(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND (name LIKE 'ai_%' OR name LIKE 'agent_%' OR name LIKE 'mcp_%') "
        "ORDER BY name"
    )
    legacy = [r["name"] for r in legacy_rows]
    print(f"Found {len(legacy)} legacy tables\n")

    extinct  = []
    inspect  = []
    active   = []

    for i, table in enumerate(legacy, 1):
        print(f"  [{i}/{len(legacy)}] {table}", end="\r", flush=True)
        rows  = get_row_count(table)
        files = runtime_grep(table)

        entry = {"table": table, "rows": rows, "files": files}

        if not files and (rows == 0 or rows == "?"):
            extinct.append(entry)
        elif not files:
            inspect.append(entry)
        else:
            active.append(entry)

    print(" " * 60)  # clear progress line

    print(f"\n{'='*60}")
    print(f"EXTINCT — 0 rows, no runtime refs — DROP THESE ({len(extinct)})")
    print(f"{'='*60}")
    for e in extinct:
        print(f"  {e['table']:<50} ({e['rows']} rows)")

    print(f"\n{'='*60}")
    print(f"INSPECT — has data, no runtime refs ({len(inspect)})")
    print(f"{'='*60}")
    for e in inspect:
        print(f"  {e['table']:<50} ({e['rows']} rows)")

    print(f"\n{'='*60}")
    print(f"ACTIVE — still referenced in runtime source ({len(active)})")
    print(f"{'='*60}")
    for e in active:
        short = [f.replace(str(REPO)+"/", "") for f in e["files"]]
        print(f"  {e['table']:<50} ({e['rows']} rows)")
        for f in short[:3]:
            print(f"    ↳ {f}")
        if len(short) > 3:
            print(f"    ↳ ... +{len(short)-3} more")

    # Drop script for extinct tables
    if extinct:
        drop_sql = "\n".join(f"DROP TABLE IF EXISTS \"{e['table']}\";" for e in extinct)
        out = REPO / "scripts" / "sql" / "drop_extinct_tables.sql"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f"-- Auto-generated by repo_inventory.py\n-- Review before running.\n\n{drop_sql}\n")
        print(f"\n  DROP script written to: scripts/sql/drop_extinct_tables.sql")

    print(f"\nSummary: {len(extinct)} droppable  |  {len(inspect)} inspect  |  {len(active)} active")

# ── main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    build_wireframe()
    table_audit()
