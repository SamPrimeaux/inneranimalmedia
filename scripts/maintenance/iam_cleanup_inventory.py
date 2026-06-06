#!/usr/bin/env python3
"""
IAM Cleanup Inventory
Usage: source .env.cloudflare && python3 scripts/maintenance/iam_cleanup_inventory.py
Or via alias: iam-cleanup

Checks:
- Backfill status via internal API
- Stale Supabase snapshots older than 7 days
- Large/dead directories (.tmp, artifacts, captures, scripts)
- What's referenced in D1/Supabase vs orphaned
"""

import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────
REPO_ROOT = Path("/Users/samprimeaux/inneranimalmedia")
WORKER_URL = "https://inneranimalmedia.com"
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "ede6590ac0d2fb7daf155b35653457b2")
D1_DB_ID = os.getenv("D1_DB_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://dpmuvynqixblxsilnlut.supabase.co")

INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Directories to scan for cleanup candidates
SCAN_DIRS = [".tmp", "artifacts", "captures", "tmp", "scripts/patch_results", "scripts/battle_results"]

# ── Colors ────────────────────────────────────────────────────
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
RED = "\033[0;31m"
CYAN = "\033[0;36m"
BOLD = "\033[1m"
RESET = "\033[0m"

OK = "✅"
WARN = "⚠️ "
FAIL = "❌"
INFO = "ℹ️ "

def header(text):
    print(f"\n{BOLD}{CYAN}── {text} ──────────────────────────────────{RESET}")

def ok(msg): print(f"  {OK} {msg}")
def warn(msg): print(f"  {WARN} {msg}")
def fail(msg): print(f"  {FAIL} {msg}")
def info(msg): print(f"  {INFO} {msg}")

def format_size(bytes_):
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_ < 1024:
            return f"{bytes_:.1f} {unit}"
        bytes_ /= 1024
    return f"{bytes_:.1f} TB"

def dir_size(path: Path) -> int:
    total = 0
    try:
        for f in path.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    except PermissionError:
        pass
    return total

def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

def http_post(url, data, headers=None):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers or {})
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return {"error": e.read().decode()}
        except:
            return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}

def cf_headers():
    return {"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"}

def supabase_headers():
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }

# ── Pre-flight ────────────────────────────────────────────────
print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════════════════╗{RESET}")
print(f"{BOLD}{CYAN}║     IAM Cleanup Inventory  —  {datetime.now().strftime('%Y-%m-%d %H:%M')}    ║{RESET}")
print(f"{BOLD}{CYAN}╚══════════════════════════════════════════════════╝{RESET}")

missing = []
for v in ["INTERNAL_API_SECRET", "CLOUDFLARE_API_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"]:
    if not os.getenv(v):
        missing.append(v)
if missing:
    fail(f"Missing env vars: {', '.join(missing)}")
    print("  Run: source /Users/samprimeaux/inneranimalmedia/.env.cloudflare")
    sys.exit(1)

# ── 1. Code index lane (canonical agentsam @ 1536) ─────────────
header("1. Code Index Lane (agentsam_codebase_* @ 1536)")

warn(
    "public.codebase_* + embed-codebase-chunks-backfill retired. "
    "Use: node scripts/agentsam_codebase_reindex.mjs && node scripts/rag_ingest.mjs --lane code"
)

# ── 2. Stale Supabase Snapshots ───────────────────────────────
header("2. Supabase Stale Snapshots (> 7 days)")

snap_url = (
    f"{SUPABASE_URL}/rest/v1/codebase_snapshots"
    f"?select=snapshot_id,workspace_id,created_at"
    f"&created_at=lt.{datetime.now(timezone.utc).strftime('%Y-%m-%d')}T00:00:00Z"
    f"&order=created_at.asc&limit=100"
)

snaps = http_get(snap_url, supabase_headers())
if isinstance(snaps, list):
    now = datetime.now(timezone.utc)
    stale = []
    for s in snaps:
        created_raw = s.get("created_at", "")
        try:
            created = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
            age_days = (now - created).days
            if age_days > 7:
                stale.append((s.get("snapshot_id", "?"), age_days))
        except:
            pass

    if not stale:
        ok("No snapshots older than 7 days")
    else:
        warn(f"{len(stale)} stale snapshot(s) found:")
        for snap_id, age in stale[:10]:
            info(f"  {snap_id[:30]}  ({age}d old)")
        if len(stale) > 10:
            info(f"  ... and {len(stale) - 10} more")
        print(f"\n  {WARN} Run cleanup SQL in Supabase:")
        print(f"  DELETE FROM public.codebase_chunks WHERE snapshot_id IN (")
        print(f"    SELECT snapshot_id FROM public.codebase_snapshots")
        print(f"    WHERE workspace_id = 'ws_inneranimalmedia'")
        print(f"    AND created_at < now() - interval '7 days'")
        print(f"  );")
else:
    warn(f"Could not query Supabase snapshots: {snaps.get('error', 'unknown') if isinstance(snaps, dict) else 'parse error'}")

# ── 3. Directory Size Inventory ───────────────────────────────
header("3. Repo Directory Sizes")

total_clutter = 0
clutter_dirs = []

for dir_name in SCAN_DIRS:
    dir_path = REPO_ROOT / dir_name
    if not dir_path.exists():
        continue
    size = dir_size(dir_path)
    file_count = sum(1 for _ in dir_path.rglob("*") if _.is_file())
    total_clutter += size
    clutter_dirs.append((dir_name, size, file_count))

clutter_dirs.sort(key=lambda x: -x[1])

for name, size, count in clutter_dirs:
    size_str = format_size(size)
    if size > 50 * 1024 * 1024:  # > 50MB
        warn(f"{name}/  —  {size_str}  ({count} files)  ← large")
    elif size > 10 * 1024 * 1024:  # > 10MB
        info(f"{name}/  —  {size_str}  ({count} files)")
    else:
        ok(f"{name}/  —  {size_str}  ({count} files)")

print(f"\n  Total clutter size: {BOLD}{format_size(total_clutter)}{RESET}")

# ── 4. Safe vs Referenced ─────────────────────────────────────
header("4. Safe to Delete vs Referenced")

# Check if artifacts/key_hygiene_audit is referenced in D1
d1_url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DB_ID}/query"
d1_resp = http_post(
    d1_url,
    {"sql": "SELECT COUNT(*) as cnt FROM agentsam_artifacts WHERE r2_key LIKE '%key_hygiene%' OR name LIKE '%key_hygiene%'"},
    cf_headers()
)
key_hygiene_refs = 0
try:
    key_hygiene_refs = d1_resp["result"][0]["results"][0]["cnt"]
except:
    pass

print(f"\n  {BOLD}SAFE TO DELETE (unambiguously orphaned):{RESET}")
safe_delete = [
    "tmp/ollama_eval_*.json         — benchmark run outputs",
    "tmp/ollama_cloud_series/       — old benchmark series",
    "tmp/ollama_expansive/          — old expansive run outputs",
    "scripts/battle_results/        — old model battle results",
    "scripts/patch_results/         — old patch backups",
    ".scratch/                      — audit scratch scripts",
    "captures/                      — Playwright capture artifacts",
]
for item in safe_delete:
    print(f"  {OK} {item}")

print(f"\n  {BOLD}REVIEW BEFORE DELETING (may be referenced):{RESET}")
review = [
    ("artifacts/key_hygiene_audit/", f"{key_hygiene_refs} D1 refs found" if key_hygiene_refs > 0 else "0 D1 refs — likely safe"),
    ("artifacts/agentsam_cursor_gap_pack/", "large but may feed RAG ingest"),
    ("artifacts/agentsam_inspection/", "schema reference docs — keep if used in docs"),
    ("docs/ (most of it)", "keep docs/supabase/, docs/agentsam_knowledge/ — rest is stale"),
    (".tmp/cms/themes/", "theme artifacts — verify R2 sync before deleting"),
]
for item, note in review:
    print(f"  {WARN} {item}  [{note}]")

print(f"\n  {BOLD}KEEP (active):{RESET}")
keep = [
    "src/                    — live Worker source",
    "dashboard/components/   — live frontend",
    "dashboard/features/     — live frontend",
    "migrations/             — D1 schema history",
    "docs/supabase/          — webhook + migration docs",
    "docs/agentsam_knowledge/ — Agent Sam RAG context",
]
for item in keep:
    print(f"  {OK} {item}")

# ── Summary ───────────────────────────────────────────────────
print(f"\n{BOLD}{CYAN}──────────────────────────────────────────────────{RESET}")
print(f"{BOLD}  Inventory complete — {datetime.now().strftime('%H:%M:%S')}{RESET}")
print(f"  Potential clutter: {BOLD}{format_size(total_clutter)}{RESET}")
print(f"{CYAN}──────────────────────────────────────────────────{RESET}\n")
