#!/usr/bin/env python3
"""
fix_route_requirements.py
Script 1 of 3 — Routing repair.

- Moves code.search from required → optional on all routes that hard-block on it
- Adds missing route_requirement rows for new task types
- Adds Supabase/Postgres, vectorize, web_search, r2_ops, cf_ops, skill_use,
  db_write, db_read, search_code, refactor, explain, review, agent_spawn

Run: python3 scripts/fix_route_requirements.py
"""

import subprocess, json, sys

DB = "inneranimalmedia-business"

def d1(sql):
    r = subprocess.run(
        ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
        capture_output=True, text=True, timeout=30
    )
    if r.returncode != 0:
        print(f"  ERR: {r.stderr.strip()[:200]}")
        return None
    try:
        data = json.loads(r.stdout)
        return data[0].get("results", []) if isinstance(data, list) and data else []
    except:
        return None

def run(label, sql):
    print(f"  {label}...", end=" ")
    result = d1(sql.strip())
    print("OK" if result is not None else "FAILED")
    return result

# ── Routes that hard-block on code.search — move to optional ─────────────────
UNBLOCK_ROUTES = [
    "code", "agent_code", "agent_frontend", "client_work", "cms_edit"
]

def fix_code_search_required():
    print("\n[1] Moving code.search from required → optional on blocking routes")
    for route in UNBLOCK_ROUTES:
        sql = f"""
        UPDATE agentsam_route_requirements
        SET
          required_capability_keys_json = json_remove(
            required_capability_keys_json,
            json_each.key
          ),
          optional_capability_keys_json = json(
            json_insert(optional_capability_keys_json, '$[#]', 'code.search')
          )
        WHERE route_key = '{route}'
          AND json_type(required_capability_keys_json) = 'array';
        """
        # SQLite doesn't support json_remove by value easily — use direct replace
        sql = f"""
        UPDATE agentsam_route_requirements
        SET
          required_capability_keys_json = '[]',
          optional_capability_keys_json = json_insert(
            COALESCE(optional_capability_keys_json, '[]'),
            '$[#]', 'code.search'
          )
        WHERE route_key = '{route}'
          AND required_capability_keys_json LIKE '%code.search%';
        """
        run(f"  unblock {route}", sql)

# ── New route requirement rows ────────────────────────────────────────────────
NEW_ROUTES = [
    # db_write — INSERT/seed/add records/write to D1 or Supabase
    dict(
        id="req_db_write", route_key="db_write", task_type="db_write",
        requires_tools=1, requires_streaming=1,
        preferred_tier="flash", max_tier="standard",
        budget_priority="cost",
        required='["d1.write"]',
        optional='["d1.read","d1.batch_write","schema.inspect","supabase.write","supabase.read","logs.read"]',
        blocked='["email.broadcast","secret.write","worker.deploy"]',
        approval='{"default":"allow","read":"allow","mutation":"allow","dangerous":"approval_required"}',
        max_tools=8
    ),
    # db_read — SELECT/query/fetch from D1 or Supabase
    dict(
        id="req_db_read", route_key="db_read", task_type="db_read",
        requires_tools=1, requires_streaming=1,
        preferred_tier="flash", max_tier="standard",
        budget_priority="cost",
        required='["d1.read"]',
        optional='["d1.write","schema.inspect","supabase.read","logs.read","context.search"]',
        blocked='["email.broadcast","secret.write","worker.deploy"]',
        approval='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
        max_tools=8
    ),
    # supabase — Postgres/Hyperdrive/Supabase-specific queries
    dict(
        id="req_supabase", route_key="supabase", task_type="supabase",
        requires_tools=1, requires_streaming=1,
        preferred_tier="flash", max_tier="power",
        budget_priority="balanced",
        required='["supabase.read"]',
        optional='["supabase.write","d1.read","d1.write","schema.inspect","logs.read"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"allow","dangerous":"approval_required"}',
        max_tools=10
    ),
    # web_search — browse web/look up online/search the internet
    dict(
        id="req_web_search", route_key="web_search", task_type="web_search",
        requires_tools=1, requires_streaming=1,
        preferred_tier="flash", max_tier="standard",
        budget_priority="cost",
        required='[]',
        optional='["browser.inspect","browser.navigate","context.search","memory.read","d1.read"]',
        blocked='["email.broadcast","secret.write","worker.deploy"]',
        approval='{"default":"allow","read":"allow","mutation":"deny","dangerous":"deny"}',
        max_tools=6
    ),
    # vectorize — embed/index/semantic search/RAG upsert
    dict(
        id="req_vectorize", route_key="vectorize", task_type="vectorize",
        requires_tools=1, requires_streaming=1,
        preferred_tier="flash", max_tier="standard",
        budget_priority="cost",
        required='[]',
        optional='["vectorize.upsert","vectorize.query","d1.read","d1.write","r2.read","context.search"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"allow","dangerous":"approval_required"}',
        max_tools=8
    ),
    # r2_ops — R2 read/write/upload/list
    dict(
        id="req_r2_ops", route_key="r2_ops_write", task_type="r2_ops",
        requires_tools=1, requires_streaming=1,
        preferred_tier="flash", max_tier="standard",
        budget_priority="cost",
        required='[]',
        optional='["r2.read","r2.write","r2.list","d1.read","logs.read"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"deny"}',
        max_tools=6
    ),
    # cf_ops — Cloudflare-specific: KV, DO, Queues, wrangler (non-deploy)
    dict(
        id="req_cf_ops", route_key="cf_ops", task_type="cf_ops",
        requires_tools=1, requires_streaming=1,
        preferred_tier="standard", max_tier="power",
        budget_priority="balanced",
        required='[]',
        optional='["terminal.execute","logs.read","d1.read","r2.read","worker.preview","kv.read","kv.write"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"approval_required"}',
        max_tools=10
    ),
    # search_code — grep/find in codebase/which file/where is X
    dict(
        id="req_search_code", route_key="search_code", task_type="search_code",
        requires_tools=1, requires_streaming=1,
        preferred_tier="flash", max_tier="standard",
        budget_priority="cost",
        required='[]',
        optional='["code.search","github.read","d1.read","context.search","r2.read"]',
        blocked='["email.broadcast","secret.write","worker.deploy","d1.write","r2.write"]',
        approval='{"default":"allow","read":"allow","mutation":"deny","dangerous":"deny"}',
        max_tools=6
    ),
    # refactor — restructure/rename/reorganize/extract/clean up
    dict(
        id="req_refactor", route_key="refactor", task_type="refactor",
        requires_tools=1, requires_streaming=1,
        preferred_tier="power", max_tier="power",
        budget_priority="quality",
        required='[]',
        optional='["code.search","github.read","github.write","d1.read","r2.read","terminal.execute"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"approval_required"}',
        max_tools=10
    ),
    # review — audit/review/analyze code or data quality
    dict(
        id="req_review", route_key="review", task_type="review",
        requires_tools=0, requires_streaming=1,
        preferred_tier="power", max_tier="reasoning",
        budget_priority="quality",
        required='[]',
        optional='["code.search","github.read","d1.read","r2.read","logs.read","browser.inspect","mcp.catalog.read"]',
        blocked='["email.broadcast","secret.write","worker.deploy","d1.write","r2.write"]',
        approval='{"default":"allow","read":"allow","mutation":"deny","dangerous":"deny"}',
        max_tools=8
    ),
    # explain — what is X / how does Y work / describe / summarize
    dict(
        id="req_explain", route_key="explain", task_type="explain",
        requires_tools=0, requires_streaming=1,
        preferred_tier="flash", max_tier="standard",
        budget_priority="cost",
        required='[]',
        optional='["code.search","d1.read","context.search","memory.read","browser.inspect"]',
        blocked='["email.broadcast","secret.write","worker.deploy","d1.write","r2.write"]',
        approval='{"default":"allow","read":"allow","mutation":"deny","dangerous":"deny"}',
        max_tools=6
    ),
    # skill_use — invoke a registered skill / run a skill / apply skill
    dict(
        id="req_skill_use", route_key="skill_use", task_type="skill_use",
        requires_tools=1, requires_streaming=1,
        preferred_tier="standard", max_tier="power",
        budget_priority="balanced",
        required='["mcp.catalog.read"]',
        optional='["mcp.tool.inspect","d1.read","d1.write","r2.read","terminal.execute","context.search"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"allow","dangerous":"approval_required"}',
        max_tools=12
    ),
    # agent_spawn — delegate to subagent / spawn / assign autonomous task
    dict(
        id="req_agent_spawn", route_key="agent_spawn", task_type="agent_spawn",
        requires_tools=1, requires_streaming=1,
        requires_reasoning=1,
        preferred_tier="power", max_tier="reasoning",
        budget_priority="quality",
        required='[]',
        optional='["agent.run","workflow.run","mcp.catalog.read","d1.read","d1.write","context.search","memory.read"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"approval_required"}',
        max_tools=12
    ),
    # github — PR/commit/diff/branch/repo ops
    dict(
        id="req_github", route_key="github", task_type="github",
        requires_tools=1, requires_streaming=1,
        preferred_tier="standard", max_tier="power",
        budget_priority="balanced",
        required='[]',
        optional='["github.read","github.write","code.search","d1.read","terminal.execute"]',
        blocked='["email.broadcast","secret.write"]',
        approval='{"default":"allow","read":"allow","mutation":"approval_required","dangerous":"approval_required"}',
        max_tools=8
    ),
]

def e(s): return str(s).replace("'", "''")

def seed_new_routes():
    print(f"\n[2] Seeding {len(NEW_ROUTES)} new route_requirement rows")
    for r in NEW_ROUTES:
        sql = f"""
        INSERT INTO agentsam_route_requirements (
          id, route_key, task_type,
          requires_tools, requires_streaming,
          requires_reasoning,
          preferred_tier, max_tier, budget_priority,
          required_capability_keys_json,
          optional_capability_keys_json,
          blocked_capability_keys_json,
          approval_policy_json,
          max_tools, is_active, mode
        ) VALUES (
          '{e(r["id"])}', '{e(r["route_key"])}', '{e(r["task_type"])}',
          {r.get("requires_tools",0)}, {r.get("requires_streaming",1)},
          {r.get("requires_reasoning",0)},
          '{e(r["preferred_tier"])}', '{e(r["max_tier"])}', '{e(r["budget_priority"])}',
          '{e(r["required"])}',
          '{e(r["optional"])}',
          '{e(r.get("blocked","[]"))}',
          '{e(r.get("approval","{{}}") )}',
          {r.get("max_tools",8)}, 1, 'default'
        ) ON CONFLICT(route_key) DO UPDATE SET
          required_capability_keys_json = excluded.required_capability_keys_json,
          optional_capability_keys_json = excluded.optional_capability_keys_json,
          preferred_tier = excluded.preferred_tier,
          is_active = 1;
        """
        run(f"  {r['route_key']}", sql)

def verify():
    print("\n[3] Verification")
    rows = d1("SELECT route_key, required_capability_keys_json FROM agentsam_route_requirements WHERE required_capability_keys_json LIKE '%code.search%' ORDER BY route_key;")
    if not rows:
        print("  code.search required: NONE (all clear)")
    else:
        print("  WARNING — still required on:")
        for r in rows:
            print(f"    {r['route_key']}: {r['required_capability_keys_json']}")

    total = d1("SELECT COUNT(*) as n FROM agentsam_route_requirements;")
    print(f"  Total route_requirement rows: {total[0]['n'] if total else '?'}")

def main():
    print("="*64)
    print("  fix_route_requirements.py")
    print("="*64)
    fix_code_search_required()
    seed_new_routes()
    verify()
    print("\n  Done. Run script 2 next: patch_infer_intent.py")
    print("="*64)

if __name__ == "__main__":
    main()
