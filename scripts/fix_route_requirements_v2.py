#!/usr/bin/env python3
"""
fix_route_requirements_v2.py — fixed error capture + simpler SQL
Run: python3 scripts/fix_route_requirements_v2.py
"""
import subprocess, json, sys

DB = "inneranimalmedia-business"

def d1(sql):
    r = subprocess.run(
        ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
        capture_output=True, text=True, timeout=30
    )
    # Capture both stdout and stderr for errors
    raw = r.stdout.strip()
    if r.returncode != 0:
        err = r.stderr.strip() or raw[:300]
        print(f"\n  WRANGLER ERR: {err}")
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, list) and data:
            if data[0].get("success") is False:
                print(f"\n  D1 ERR: {data[0].get('error', data[0])}")
                return None
            return data[0].get("results", [])
        return []
    except Exception as e:
        print(f"\n  JSON ERR: {e} | raw: {raw[:200]}")
        return None

def run(label, sql):
    print(f"  {label}...", end=" ", flush=True)
    result = d1(sql.strip())
    print("OK" if result is not None else "FAILED")
    return result

# ── 1. Move code.search from required → optional ──────────────────────────────
def fix_blockers():
    print("\n[1] Unblocking code.search required routes")
    routes = ["code", "agent_code", "agent_frontend", "client_work", "cms_edit"]
    for route in routes:
        run(f"  {route}", f"""
UPDATE agentsam_route_requirements
SET required_capability_keys_json = '[]',
    optional_capability_keys_json = json_insert(
      COALESCE(optional_capability_keys_json, '[]'), '$[#]', 'code.search'
    )
WHERE route_key = '{route}'
  AND instr(required_capability_keys_json, 'code.search') > 0;
""")

# ── 2. Seed new task type rows (simple individual inserts) ────────────────────
ROUTES = [
  ("db_write",    "db_write",    "[]",                     '["d1.write","supabase.write","d1.read","d1.batch_write","schema.inspect","supabase.read","logs.read"]', "flash",    "standard", "cost",     0, 8),
  ("db_read",     "db_read",     '["d1.read"]',            '["supabase.read","d1.write","schema.inspect","logs.read","context.search"]',                             "flash",    "standard", "cost",     0, 8),
  ("supabase",    "supabase",    '["supabase.read"]',      '["supabase.write","d1.read","d1.write","schema.inspect","logs.read"]',                                   "flash",    "power",    "balanced", 0, 10),
  ("web_search",  "web_search",  "[]",                     '["browser.inspect","browser.navigate","context.search","memory.read","d1.read"]',                        "flash",    "standard", "cost",     0, 6),
  ("vectorize",   "vectorize",   "[]",                     '["vectorize.upsert","vectorize.query","d1.read","d1.write","r2.read","context.search"]',                 "flash",    "standard", "cost",     0, 8),
  ("r2_ops",      "r2_ops",      "[]",                     '["r2.read","r2.write","r2.list","d1.read","logs.read"]',                                                 "flash",    "standard", "cost",     0, 6),
  ("cf_ops",      "cf_ops",      "[]",                     '["terminal.execute","logs.read","d1.read","r2.read","worker.preview","kv.read","kv.write"]',             "standard", "power",    "balanced", 0, 10),
  ("search_code", "search_code", "[]",                     '["code.search","github.read","d1.read","context.search","r2.read"]',                                    "flash",    "standard", "cost",     0, 6),
  ("refactor",    "refactor",    "[]",                     '["code.search","github.read","github.write","d1.read","r2.read","terminal.execute"]',                    "power",    "power",    "quality",  0, 10),
  ("review",      "review",      "[]",                     '["code.search","github.read","d1.read","r2.read","logs.read","browser.inspect","mcp.catalog.read"]',     "power",    "reasoning","quality",  0, 8),
  ("explain",     "explain",     "[]",                     '["code.search","d1.read","context.search","memory.read","browser.inspect"]',                             "flash",    "standard", "cost",     0, 6),
  ("skill_use",   "skill_use",   '["mcp.catalog.read"]',   '["mcp.tool.inspect","d1.read","d1.write","r2.read","terminal.execute","context.search"]',               "standard", "power",    "balanced", 0, 12),
  ("agent_spawn", "agent_spawn", "[]",                     '["agent.run","workflow.run","mcp.catalog.read","d1.read","d1.write","context.search","memory.read"]',    "power",    "reasoning","quality",  1, 12),
  ("github",      "github",      "[]",                     '["github.read","github.write","code.search","d1.read","terminal.execute"]',                              "standard", "power",    "balanced", 0, 8),
  ("browser",     "browser",     "[]",                     '["browser.inspect","browser.navigate","r2.read","d1.read","context.search"]',                           "flash",    "standard", "cost",     0, 6),
]

def seed_routes():
    print(f"\n[2] Seeding {len(ROUTES)} new route_requirement rows")
    for rk, tt, req, opt, pt, mt, bp, rr, mx in ROUTES:
        run(f"  {rk}", f"""
INSERT INTO agentsam_route_requirements
  (id, route_key, task_type, requires_tools, requires_streaming,
   requires_reasoning, preferred_tier, max_tier, budget_priority,
   required_capability_keys_json, optional_capability_keys_json,
   blocked_capability_keys_json, approval_policy_json, max_tools, is_active, mode)
VALUES
  ('req_{rk}', '{rk}', '{tt}', 1, 1,
   {rr}, '{pt}', '{mt}', '{bp}',
   '{req}', '{opt}',
   '[]', '{{}}', {mx}, 1, 'default')
ON CONFLICT(route_key) DO UPDATE SET
  required_capability_keys_json = excluded.required_capability_keys_json,
  optional_capability_keys_json = excluded.optional_capability_keys_json,
  preferred_tier = excluded.preferred_tier,
  is_active = 1;
""")

def verify():
    print("\n[3] Verification")
    still_blocked = d1("SELECT route_key FROM agentsam_route_requirements WHERE instr(required_capability_keys_json,'code.search') > 0;")
    print(f"  code.search still required: {[r['route_key'] for r in still_blocked] if still_blocked else 'NONE — all clear'}")
    total = d1("SELECT COUNT(*) as n FROM agentsam_route_requirements;")
    print(f"  Total rows: {total[0]['n'] if total else '?'}")

def main():
    print("="*60)
    print("  fix_route_requirements_v2.py")
    print("="*60)
    fix_blockers()
    seed_routes()
    verify()
    print("\n  Done. Run patch_infer_intent_v2.py next.")
    print("="*60)

if __name__ == "__main__":
    main()
