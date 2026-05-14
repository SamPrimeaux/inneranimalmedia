"""Seed agentsam_routing_arms from agentsam_model_tier.
VERSION = "1.2.0"
Modes: agent, plan, debug, multitask, ask (matches dashboard)
"""
import subprocess, json, sys
from datetime import datetime

DRY = "--dry-run" in sys.argv

def d1q(sql):
    r = subprocess.run(
        ["npx","wrangler","d1","execute","inneranimalmedia-business",
         "--remote","--json","--command", sql],
        capture_output=True, text=True
    )
    try:
        return json.loads(r.stdout)[0].get("results", [])
    except Exception:
        print("D1 parse error:", r.stderr[:300])
        return []

def d1x(sql):
    if DRY:
        print(f"  [DRY] {sql[:120]}")
        return True
    r = subprocess.run(
        ["npx","wrangler","d1","execute","inneranimalmedia-business",
         "--remote","--json","--command", sql],
        capture_output=True, text=True
    )
    try:
        json.loads(r.stdout)
        return True
    except Exception:
        print(f"  [ERR] {r.stderr[:200]}")
        return False

TASK_TYPES = ["chat","code","write","search","calculate","tool","agent","routing","debug","plan","workflow"]
MODES      = ["agent","plan","debug","multitask","ask"]

rows = d1q("SELECT model_id, api_platform FROM agentsam_model_tier WHERE is_active=1")
print(f"Active model_tier rows: {len(rows)}")
if not rows:
    print("Empty — nothing to seed")
    sys.exit(1)

# dedupe model_id since tiers repeat models
models = {}
for r in rows:
    mk = r.get("model_id","").strip()
    pv = r.get("api_platform","").strip()
    if mk and mk not in models:
        models[mk] = pv

print(f"Unique models: {len(models)}")

arms = []
seen = set()
for mk, pv in models.items():
    for tt in TASK_TYPES:
        for md in MODES:
            key = (mk, tt, md)
            if key not in seen:
                seen.add(key)
                arms.append((mk, pv, tt, md))

print(f"Arms to seed: {len(arms)}  (dry={DRY})")
if DRY:
    for a in arms[:5]:
        print(f"  sample: {a}")
    print("  ...")

ok = err = 0
for (mk, pv, tt, md) in arms:
    safe = mk.replace("'","").replace("/","_").replace(".","_").replace("-","_").replace("@","")[:36]
    arm_id = f"arm_{safe}_{tt}_{md}"[:80]
    mk_e = mk.replace("'","''")
    pv_e = pv.replace("'","''")
    sql = (
        f"INSERT OR IGNORE INTO agentsam_routing_arms "
        f"(id,model_key,provider,task_type,mode,"
        f"success_alpha,success_beta,is_eligible,is_active,"
        f"workspace_id,updated_at) VALUES ("
        f"'{arm_id}','{mk_e}','{pv_e}','{tt}','{md}',"
        f"1.0,1.0,1,1,'ws_inneranimalmedia',unixepoch())"
    )
    if d1x(sql): ok += 1
    else: err += 1

if not DRY:
    count = d1q("SELECT COUNT(*) as c FROM agentsam_routing_arms")
    print(f"\nDone — {ok} inserted, {err} errors")
    print(f"agentsam_routing_arms total: {count[0]['c'] if count else '?'} rows")
else:
    print(f"\nDry run — {ok} arms would be inserted, {len(models)} unique models")
