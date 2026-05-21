#!/usr/bin/env python3
"""
fix_cms_edges.py
Diagnoses + repairs the 4 failed edge inserts for cms_theme_pump_unique.
Safe to run multiple times (idempotent).

Usage:
  python3 ~/Downloads/fix_cms_edges.py
"""

import subprocess, json, sys

DB     = "inneranimalmedia-business"
TOML   = "wrangler.production.toml"
REPO   = "/Users/samprimeaux/inneranimalmedia"

def d1(sql, *, remote=True):
    flag = "--remote" if remote else "--local"
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB, flag,
         "-c", TOML, "--json", "--command", sql],
        capture_output=True, text=True, cwd=REPO
    )
    if result.returncode != 0:
        print("  STDERR:", result.stderr.strip()[:300])
        return None
    try:
        return json.loads(result.stdout)
    except:
        return result.stdout

# ── 1. Get workflow ID ──────────────────────────────────────────────────────
print("\n── Step 1: Resolve workflow ID ──")
rows = d1("SELECT id FROM agentsam_workflows WHERE workflow_key = 'cms_theme_pump_unique' LIMIT 1;")
try:
    wf_id = rows[0]["results"][0]["id"]
    print(f"  workflow_id = {wf_id}")
except:
    print("  ERROR: workflow not found. Aborting.")
    sys.exit(1)

# ── 2. Inspect current edges for this workflow ──────────────────────────────
print("\n── Step 2: Current edges in DB ──")
rows = d1(f"SELECT from_node_key, to_node_key, condition_type, priority FROM agentsam_workflow_edges WHERE workflow_id = '{wf_id}' ORDER BY priority;")
try:
    edges = rows[0]["results"]
    for e in edges:
        print(f"  {e['from_node_key']} -> {e['to_node_key']}  [{e['condition_type']}] pri={e['priority']}")
    if not edges:
        print("  (no edges found)")
except:
    print("  Could not parse edge results:", rows)

# ── 3. Inspect nodes to confirm they exist ──────────────────────────────────
print("\n── Step 3: Confirm new nodes exist ──")
new_nodes = ["resolve_image_arm", "generate_cover", "upload_cover", "update_preview_url"]
for nk in new_nodes:
    r = d1(f"SELECT node_key, node_type, handler_key FROM agentsam_workflow_nodes WHERE workflow_id = '{wf_id}' AND node_key = '{nk}';")
    try:
        row = r[0]["results"]
        if row:
            print(f"  OK      {nk}  ({row[0]['node_type']} / {row[0]['handler_key']})")
        else:
            print(f"  MISSING {nk}")
    except:
        print(f"  ERROR checking {nk}")

# ── 4. Diagnose: what's blocking the inserts? ──────────────────────────────
print("\n── Step 4: Diagnose constraint type ──")
# Check if any of the 4 edges already exist (UNIQUE violation)
for frm, to in [("update_d1","resolve_image_arm"),("resolve_image_arm","generate_cover"),
                ("generate_cover","upload_cover"),("upload_cover","update_preview_url")]:
    r = d1(f"SELECT id FROM agentsam_workflow_edges WHERE workflow_id='{wf_id}' AND from_node_key='{frm}' AND to_node_key='{to}';")
    try:
        found = r[0]["results"]
        if found:
            print(f"  DUPLICATE EXISTS: {frm} -> {to}  (id={found[0]['id']})")
        else:
            print(f"  NOT IN TABLE:     {frm} -> {to}  (insert should succeed)")
    except:
        print(f"  CHECK ERROR: {frm} -> {to}")

# ── 5. Delete stale/partial versions of the 4 target edges ─────────────────
print("\n── Step 5: Delete stale edge rows (idempotent) ──")
target_pairs = [
    ("update_d1",        "resolve_image_arm"),
    ("resolve_image_arm","generate_cover"),
    ("generate_cover",   "upload_cover"),
    ("upload_cover",     "update_preview_url"),
]
for frm, to in target_pairs:
    sql = (
        f"DELETE FROM agentsam_workflow_edges "
        f"WHERE workflow_id = '{wf_id}' "
        f"AND from_node_key = '{frm}' AND to_node_key = '{to}';"
    )
    d1(sql)
    print(f"  Cleared: {frm} -> {to}")

# ── 6. Re-insert all 4 edges cleanly ───────────────────────────────────────
print("\n── Step 6: Insert edges ──")

edges_to_insert = [
    # (from,               to,                   condition_type, priority)
    ("update_d1",         "resolve_image_arm",   "always",        55),
    ("resolve_image_arm", "generate_cover",       "always",        60),
    ("generate_cover",    "upload_cover",         "always",        65),
    ("upload_cover",      "update_preview_url",   "always",        70),
]

for frm, to, ctype, pri in edges_to_insert:
    sql = (
        f"INSERT INTO agentsam_workflow_edges "
        f"(workflow_id, from_node_key, to_node_key, condition_type, priority) "
        f"VALUES ('{wf_id}', '{frm}', '{to}', '{ctype}', {pri});"
    )
    r = d1(sql)
    if r is None:
        print(f"  ERROR: {frm} -> {to}")
    else:
        try:
            meta = r[0].get("meta", {})
            if meta.get("rows_written", 0) > 0:
                print(f"  OK:    {frm} -> {to}")
            else:
                print(f"  WARN (0 rows written): {frm} -> {to}  raw={str(r)[:150]}")
        except:
            print(f"  OK(raw): {frm} -> {to}")

# ── 7. Final edge dump ──────────────────────────────────────────────────────
print("\n── Step 7: Final edge state ──")
rows = d1(f"SELECT from_node_key, to_node_key, condition_type, priority FROM agentsam_workflow_edges WHERE workflow_id = '{wf_id}' ORDER BY priority;")
try:
    edges = rows[0]["results"]
    for e in edges:
        print(f"  {e['from_node_key']:35s} -> {e['to_node_key']:35s}  [{e['condition_type']}] pri={e['priority']}")
    print(f"\n  Total edges: {len(edges)}")
except:
    print("  Could not parse:", rows)

print("""
Done.
If Step 7 shows a clean chain, recommended next:

  git add -A && git commit -m 'feat(workflows): db-driven handler registry + cms cover nodes'
  npm run deploy:full

Commit before deploy: YES — deploy:full runs wrangler which bundles from disk
(not git), so the Worker will pick up patched files either way. But commit
keeps the SHA traceable and matches what CF Builds will see on next push.
""")
