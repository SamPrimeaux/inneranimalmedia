#!/usr/bin/env python3
"""
scripts/sync_scripts_to_d1.py
VERSION = "1.0.0"

Scans scripts/ directory, reads actual file bodies, and upserts into
agentsam_scripts with real executable content. Also registers each as
an agentsam_skill so Agent Sam can invoke them by name.

Purpose CHECK:  deploy | build | test | ingest | benchmark | maintenance | dev | dangerous | audit
Runner CHECK:   npm | bash | node | python | sql | wrangler

Usage:
  python3 scripts/sync_scripts_to_d1.py --dry-run   # preview
  python3 scripts/sync_scripts_to_d1.py              # apply
  python3 scripts/sync_scripts_to_d1.py --path scripts/specific_file.py
"""
import subprocess, json, sys, re, hashlib
from pathlib import Path
from datetime import datetime, timezone

DRY        = "--dry-run" in sys.argv
ONLY_PATH  = next((sys.argv[i+1] for i, a in enumerate(sys.argv) if a == "--path"), None)
DB         = "inneranimalmedia-business"
REPO_ROOT  = Path(__file__).parent.parent.resolve()
SCRIPTS_DIR= REPO_ROOT / "scripts"
WORKSPACE  = "ws_inneranimalmedia"
TENANT     = "tenant_sam_primeaux"

# ── helpers ────────────────────────────────────────────────────────────────

def d1q(sql: str) -> list:
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    try:
        return json.loads(r.stdout)[0].get("results",[])
    except Exception:
        return []

def d1x(sql: str, label: str = "") -> int:
    if DRY:
        # Show truncated SQL
        preview = sql.replace('\n',' ')[:120]
        print(f"  [DRY] {label or preview}")
        return 0
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    try:
        meta    = json.loads(r.stdout)[0].get("meta",{})
        changes = meta.get("changes",0)
        print(f"  ✓ {label} — {changes} row(s)")
        return changes
    except Exception:
        print(f"  ✗ {label}: {r.stderr[:200]}")
        return -1

def esc(s: str) -> str:
    """Escape single quotes for SQLite."""
    return s.replace("'", "''")

def slug_from_path(p: Path) -> str:
    return re.sub(r'[^a-z0-9_]', '_', p.stem.lower()).strip('_')

def short_id(name: str) -> str:
    h = hashlib.md5(name.encode()).hexdigest()[:8]
    return f"scr_{h}"

# ── classification rules ────────────────────────────────────────────────────
# Maps filename patterns → (purpose, runner, safe_to_run, owner_only)

def classify(p: Path) -> dict:
    stem = p.stem.lower()
    ext  = p.suffix.lower()

    runner = {
        ".py":  "python",
        ".sh":  "bash",
        ".js":  "node",
        ".sql": "sql",
    }.get(ext, "bash")

    # purpose
    if any(x in stem for x in ["deploy","promote","push","release"]):
        purpose, safe, owner = "deploy",    0, 1
    elif any(x in stem for x in ["build","vite","compile","bundle"]):
        purpose, safe, owner = "build",     1, 0
    elif any(x in stem for x in ["test","smoke","verify","check","pinstest","e2e","health"]):
        purpose, safe, owner = "test",      1, 0
    elif any(x in stem for x in ["ingest","sync","upload","r2","rag","autorag"]):
        purpose, safe, owner = "ingest",    0, 1
    elif any(x in stem for x in ["benchmark","eval","compare","lineup","routing"]):
        purpose, safe, owner = "benchmark", 1, 0
    elif any(x in stem for x in ["fix","patch","repair","cleanup","migrate","backfill","seed"]):
        purpose, safe, owner = "maintenance", 0, 1
    elif any(x in stem for x in ["dev","local","preview","watch"]):
        purpose, safe, owner = "dev",       1, 0
    elif any(x in stem for x in ["audit","scan","report","inspect"]):
        purpose, safe, owner = "audit",     1, 0
    else:
        purpose, safe, owner = "maintenance", 1, 0

    # override: anything with "dangerous" or "secret" or "prod" in name
    if any(x in stem for x in ["dangerous","secret","prod","force"]):
        safe, owner = 0, 1

    return {
        "runner":     runner,
        "purpose":    purpose,
        "safe_to_run": safe,
        "owner_only": owner,
    }

def describe(p: Path, body: str) -> str:
    """Extract description from file docstring or first comment."""
    lines = body.splitlines()
    # Python: look for triple-quoted docstring in first 10 lines
    if p.suffix == ".py":
        in_doc = False
        doc_lines = []
        for line in lines[:15]:
            stripped = line.strip()
            if stripped.startswith('"""') and not in_doc:
                in_doc = True
                rest = stripped[3:]
                if rest and not rest.startswith('"""'):
                    doc_lines.append(rest)
                continue
            if in_doc:
                if '"""' in stripped:
                    doc_lines.append(stripped.replace('"""','').strip())
                    break
                doc_lines.append(stripped)
        if doc_lines:
            return ' '.join(doc_lines).strip()[:300]
    # Shell / any: first non-shebang comment
    for line in lines[:10]:
        stripped = line.strip()
        if stripped.startswith('#') and not stripped.startswith('#!'):
            return stripped.lstrip('#').strip()[:300]
    return f"Script: {p.name}"

# ── collect files ───────────────────────────────────────────────────────────

if ONLY_PATH:
    # Resolve relative to cwd so relative_to(REPO_ROOT) works
    files = [(Path.cwd() / ONLY_PATH).resolve()]
else:
    files = sorted(
        p for p in SCRIPTS_DIR.rglob("*")
        if p.is_file()
        and p.suffix in (".py", ".sh", ".js", ".sql")
        and not any(x in p.parts for x in ("node_modules", "__pycache__", ".git"))
        and p.stat().st_size < 200_000   # skip huge generated files
    )

print(f"\nFound {len(files)} script files under scripts/\n")

# ── load existing rows ───────────────────────────────────────────────────────

existing = {
    r["path"]: r
    for r in d1q("SELECT id, path, slug, body FROM agentsam_scripts")
}
print(f"Existing agentsam_scripts rows: {len(existing)}")

# ── upsert each file ────────────────────────────────────────────────────────

inserted = updated = skipped = errors = 0

for p in files:
    rel_path = str(p.relative_to(REPO_ROOT))

    try:
        body = p.read_text(errors="replace")
    except Exception as e:
        print(f"  ✗ read error {p.name}: {e}")
        errors += 1
        continue

    meta    = classify(p)
    sl      = slug_from_path(p)
    desc    = describe(p, body)
    row_id  = existing.get(rel_path, {}).get("id") or short_id(rel_path)
    display = p.stem.replace("_"," ").replace("-"," ").title()

    body_esc = esc(body)
    desc_esc = esc(desc)
    disp_esc = esc(display)
    path_esc = esc(rel_path)
    sl_esc   = esc(sl)

    if rel_path in existing:
        # UPDATE: refresh body + metadata, keep id
        sql = f"""UPDATE agentsam_scripts SET
          body        = '{body_esc}',
          description = '{desc_esc}',
          runner      = '{meta["runner"]}',
          purpose     = '{meta["purpose"]}',
          safe_to_run = {meta["safe_to_run"]},
          owner_only  = {meta["owner_only"]},
          is_active   = 1,
          slug        = '{sl_esc}',
          updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE path = '{path_esc}'"""
        label = f"UPDATE {p.name}"
        updated += 1
    else:
        # INSERT new row
        sql = f"""INSERT OR IGNORE INTO agentsam_scripts
          (id, workspace_id, tenant_id, name, path, description,
           purpose, runner, requires_env, owner_only, safe_to_run,
           is_active, is_global, slug, body, created_at, updated_at)
        VALUES (
          '{esc(row_id)}',
          '{WORKSPACE}',
          '{TENANT}',
          '{disp_esc}',
          '{path_esc}',
          '{desc_esc}',
          '{meta["purpose"]}',
          '{meta["runner"]}',
          1,
          {meta["owner_only"]},
          {meta["safe_to_run"]},
          1, 1,
          '{sl_esc}',
          '{body_esc}',
          strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          strftime('%Y-%m-%dT%H:%M:%fZ','now')
        )"""
        label = f"INSERT {p.name}"
        inserted += 1

    result = d1x(sql, label)
    if result < 0:
        errors += 1

# ── also register as agentsam_skill ─────────────────────────────────────────

print(f"\n{'─'*60}")
print("  Registering as agentsam_skill entries...")
print(f"{'─'*60}")

for p in files:
    rel_path = str(p.relative_to(REPO_ROOT))
    sl       = slug_from_path(p)
    meta     = classify(p)
    skill_id = f"skill_script_{sl}"[:80]

    try:
        body = p.read_text(errors="replace")
    except Exception:
        continue

    desc     = describe(p, body)
    desc_esc = esc(desc)
    sl_esc   = esc(sl)
    path_esc = esc(rel_path)

    # Map purpose → task_types for skill routing
    task_map = {
        "deploy":      '["deploy","terminal_execution"]',
        "build":       '["code","deploy"]',
        "test":        '["debug","code"]',
        "ingest":      '["tool_use","deploy"]',
        "benchmark":   '["code","debug"]',
        "maintenance": '["code","debug","sql_d1_generation"]',
        "dev":         '["code"]',
        "audit":       '["debug","code"]',
        "dangerous":   '["deploy"]',
    }
    task_types = task_map.get(meta["purpose"], '["code"]')

    sql = f"""INSERT OR IGNORE INTO agentsam_skill
      (id, tenant_id, user_id, workspace_id, name, description,
       content_markdown, file_path, scope, task_types_json,
       always_apply, is_active, sort_order, created_at, updated_at)
    VALUES (
      '{esc(skill_id)}',
      '{TENANT}',
      'au_871d920d1233cbd1',
      '{WORKSPACE}',
      '{esc(p.stem)}',
      '{desc_esc}',
      '# {esc(p.stem)}\n\nPath: `{path_esc}`\nRunner: {meta["runner"]}\nPurpose: {meta["purpose"]}\n\nRun with:\n```bash\n{meta["runner"]} {path_esc}\n```',
      '{path_esc}',
      'workspace',
      '{task_types}',
      0, 1, 50,
      strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )"""

    d1x(sql, f"skill {skill_id}")

# ── summary ──────────────────────────────────────────────────────────────────

print(f"\n{'═'*60}")
print(f"  agentsam_scripts: {inserted} inserted, {updated} updated, {errors} errors")
print(f"  Mode: {'DRY RUN' if DRY else 'APPLIED'}")
print(f"{'═'*60}\n")

if DRY:
    print("  Run without --dry-run to apply.")
