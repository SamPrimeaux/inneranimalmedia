#!/usr/bin/env python3
"""
Generate updated codebase index files and upload to R2
Bucket: inneranimalmedia
Prefix: codebase-index/ws_inneranimalmedia/latest/
"""

import json, os, re, csv, subprocess
from pathlib import Path
from datetime import datetime, timezone

for line in (Path.home() / "inneranimalmedia/.env.agentsam.local").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

import urllib.request
CF_ACCOUNT_ID  = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
REPO           = Path.home() / "inneranimalmedia"
D1_ENDPOINT    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
R2_BUCKET      = "inneranimalmedia"
R2_PREFIX      = "codebase-index/ws_inneranimalmedia/latest"
WRANGLER_CONF  = "wrangler.production.toml"
TMP            = REPO / "tmp" / "codebase-index-upload"
TMP.mkdir(parents=True, exist_ok=True)

IGNORE   = {"node_modules",".git","dist",".wrangler","migrations","artifacts",
            "docs","tmp","analytics","audits","captures","iam-test-reports","reports"}
EXT_LANG = {".js":"javascript",".ts":"typescript",".tsx":"typescript-react",".py":"python"}
RUNTIME  = ["src","scripts","dashboard/src"]
now      = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
route_re = re.compile(r'''['"](/api/[^'"\s]{2,})['"]''')

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req  = urllib.request.Request(D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    return data["result"][0]["results"]

# ── scan repo ─────────────────────────────────────────────────────────────────
print("Scanning repo...")
files   = []
routes  = set()
by_dir  = {}

for d in RUNTIME:
    dp = REPO / d
    if not dp.exists(): continue
    for fp in sorted(dp.rglob("*")):
        if not fp.is_file(): continue
        if any(b in fp.parts for b in IGNORE): continue
        if fp.suffix not in EXT_LANG: continue
        size  = fp.stat().st_size
        lang  = EXT_LANG[fp.suffix]
        rel   = str(fp.relative_to(REPO))
        top   = fp.relative_to(REPO).parts[0] if fp.relative_to(REPO).parts else d
        files.append({"path": rel, "language": lang, "size_bytes": size,
                      "directory": top, "extension": fp.suffix})
        by_dir.setdefault(top, {"count":0,"size_bytes":0})
        by_dir[top]["count"]      += 1
        by_dir[top]["size_bytes"] += size
        try:
            text = fp.read_text(errors="ignore")
            for m in route_re.finditer(text):
                routes.add(m.group(1))
        except: pass

files.sort(key=lambda x: -x["size_bytes"])
sorted_routes = sorted(routes)
lang_counts   = {}
for f in files:
    lang_counts[f["language"]] = lang_counts.get(f["language"], 0) + 1

print(f"  {len(files)} files | {len(sorted_routes)} routes | {len(lang_counts)} languages")

# ── helpers ───────────────────────────────────────────────────────────────────
def write(name, content):
    p = TMP / name
    p.write_text(content, encoding="utf-8")
    return p

def upload(local_path, r2_key):
    cmd = [
        "npx", "wrangler", "r2", "object", "put",
        f"{R2_BUCKET}/{r2_key}",
        "--file", str(local_path),
        "--remote", "-c", WRANGLER_CONF,
    ]
    result = subprocess.run(cmd, cwd=str(REPO), capture_output=True, text=True)
    ok = result.returncode == 0
    status = "OK" if ok else f"FAIL: {result.stderr.strip()[-120:]}"
    print(f"  {'✓' if ok else '✗'}  {r2_key}  {status}")
    return ok

# ── 1. repo-snapshot.json ─────────────────────────────────────────────────────
snap = {
    "generated_at": now, "workspace": "ws_inneranimalmedia",
    "tenant": "tenant_sam_primeaux", "branch": "main",
    "repo": "SamPrimeaux/inneranimalmedia",
    "file_count": len(files), "route_count": len(sorted_routes),
    "total_size_bytes": sum(f["size_bytes"] for f in files),
    "languages": lang_counts, "active_d1_tables": 113,
    "inspect_d1_tables": 47, "extinct_d1_tables": 2,
    "supabase_chunks": 6183, "supabase_files": 2070,
}
write("repo-snapshot.json", json.dumps(snap, indent=2))

# ── 2. file-inventory.json ────────────────────────────────────────────────────
write("file-inventory.json", json.dumps(files, indent=2))

# ── 3. file-inventory.csv ─────────────────────────────────────────────────────
csv_path = TMP / "file-inventory.csv"
with open(csv_path, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["path","language","size_bytes","directory","extension"])
    w.writeheader()
    w.writerows(files)

# ── 4. file-inventory.md ─────────────────────────────────────────────────────
md_inv = [f"# File Inventory\nGenerated: {now} | {len(files)} runtime source files\n"]
md_inv.append("| File | Language | Size |")
md_inv.append("|------|----------|------|")
for f in files[:60]:
    md_inv.append(f"| `{f['path']}` | {f['language']} | {f['size_bytes']//1024}KB |")
if len(files) > 60:
    md_inv.append(f"| ... and {len(files)-60} more | | |")
write("file-inventory.md", "\n".join(md_inv))

# ── 5. directory-summary.json ────────────────────────────────────────────────
write("directory-summary.json", json.dumps(by_dir, indent=2))

# ── 6. directory-summary.md ──────────────────────────────────────────────────
md_dir = [f"# Directory Summary\nGenerated: {now}\n"]
md_dir.append("| Directory | Files | Size |")
md_dir.append("|-----------|-------|------|")
for d, info in sorted(by_dir.items(), key=lambda x: -x[1]["size_bytes"]):
    md_dir.append(f"| `{d}/` | {info['count']} | {info['size_bytes']//1024}KB |")
write("directory-summary.md", "\n".join(md_dir))

# ── 7. index-priority-files.json ─────────────────────────────────────────────
priority = [f for f in files if f["size_bytes"] > 10_000]
priority_annotated = []
KEY_FILES = {
    "src/index.js": "Worker entry point",
    "src/core/routing.js": "AI routing",
    "src/core/resolveModel.js": "Model selection",
    "src/core/workflow-executor.js": "Workflow executor",
    "src/core/agentsam-planner.js": "Agent planner",
    "src/core/memory.js": "Memory read/write",
    "src/core/mcp-tool-execution.js": "MCP tool execution",
    "src/core/thompson.js": "Thompson sampling",
    "src/core/agentsam-route-tool-resolver.js": "Route-tool resolver",
    "src/core/guardrails.js": "Guardrails",
    "src/core/auth.js": "Auth",
    "src/core/features.js": "Feature flags",
    "src/api/agent.js": "Agent chat handler",
    "src/api/mcp.js": "MCP handler",
    "src/core/workspace-tokens.js": "Workspace tokens",
}
for f in priority:
    entry = dict(f)
    entry["role"] = KEY_FILES.get(f["path"], "")
    priority_annotated.append(entry)
write("index-priority-files.json", json.dumps(priority_annotated, indent=2))

# ── 8. index-priority-files.md ───────────────────────────────────────────────
md_pri = [f"# Priority Files\nGenerated: {now} | Files >10KB\n"]
md_pri.append("| Role | File | Size |")
md_pri.append("|------|------|------|")
for f in priority_annotated[:50]:
    role = f["role"] or "—"
    md_pri.append(f"| {role} | `{f['path']}` | {f['size_bytes']//1024}KB |")
write("index-priority-files.md", "\n".join(md_pri))

# ── 9. route-map.md ──────────────────────────────────────────────────────────
md_rt = [f"# API Route Map\nGenerated: {now} | {len(sorted_routes)} routes\n```"]
md_rt.extend(sorted_routes)
md_rt.append("```")
write("route-map.md", "\n".join(md_rt))

# ── 10. route-tokens.txt ─────────────────────────────────────────────────────
write("route-tokens.txt", "\n".join(sorted_routes))

# ── 11. source-map.md (our new file) ─────────────────────────────────────────
# copy from docs/ if it exists, otherwise use a summary
source_map_local = REPO / "docs" / "source-map.md"
if source_map_local.exists():
    import shutil
    shutil.copy(source_map_local, TMP / "source-map.md")
    print("  source-map.md copied from docs/")
else:
    write("source-map.md", f"# Source Map\nGenerated: {now}\nRun generate_source_map.py first.\n")

# ── 12. package-snapshot.json ────────────────────────────────────────────────
pkg_path = REPO / "package.json"
if pkg_path.exists():
    pkg = json.loads(pkg_path.read_text())
    snap_pkg = {
        "name": pkg.get("name"), "version": pkg.get("version"),
        "dependencies": list(pkg.get("dependencies", {}).keys()),
        "devDependencies": list(pkg.get("devDependencies", {}).keys()),
        "scripts": list(pkg.get("scripts", {}).keys()),
        "generated_at": now,
    }
    write("package-snapshot.json", json.dumps(snap_pkg, indent=2))

# ── upload all ────────────────────────────────────────────────────────────────
print(f"\nUploading to R2: {R2_BUCKET}/{R2_PREFIX}/")
results = []
for local_file in sorted(TMP.iterdir()):
    if local_file.is_file():
        r2_key = f"{R2_PREFIX}/{local_file.name}"
        results.append(upload(local_file, r2_key))

# ── update D1 source_path ─────────────────────────────────────────────────────
r2_source_path = f"r2://{R2_BUCKET}/{R2_PREFIX}/source-map.md"
d1("""UPDATE agentsam_code_index_job SET
    source_path=?, file_count=?, indexed_file_count=?,
    languages=?, updated_at=?
    WHERE id='cidx_ws_inneranimalmedia'""",
    [r2_source_path, len(files), len(files),
     json.dumps(lang_counts), now])

ok = sum(results)
print(f"\n{ok}/{len(results)} files uploaded.")
print(f"D1 source_path → {r2_source_path}")
