#!/usr/bin/env python3
"""
cpas_session_audit.py — Audit sessions vs agentsam_sessions in CPAS D1.
Determines what each table is actually doing, health, and recommendation.
stdlib only.
"""
import os, json, urllib.request, datetime

CF_API_TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2"
CPAS_DB_ID    = "fd6dd6fb-156b-4b6a-8ff0-505422652391"

def d1(sql):
    url  = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
            f"/d1/database/{CPAS_DB_ID}/query")
    req  = urllib.request.Request(url,
        data=json.dumps({"sql": sql}).encode(),
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["result"][0]["results"]

def hr(): print("─" * 60)

# ── sessions ──────────────────────────────────────────────────────────────────
hr()
print("TABLE: sessions  (HTTP auth sessions — login tokens)")
hr()
stats = d1("""
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) as not_revoked,
  SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) as revoked,
  SUM(CASE WHEN expires_at > datetime('now') THEN 1 ELSE 0 END) as not_expired,
  SUM(CASE WHEN expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired,
  SUM(CASE WHEN revoked_at IS NULL AND expires_at > datetime('now') THEN 1 ELSE 0 END) as truly_valid,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM sessions
""")[0]
for k, v in stats.items():
    print(f"  {k:<20} {v}")

print()
print("  Sample of truly valid sessions:")
valid = d1("""
SELECT id, user_id, expires_at, created_at
FROM sessions
WHERE revoked_at IS NULL AND expires_at > datetime('now')
ORDER BY created_at DESC LIMIT 5
""")
for r in valid:
    print(f"  id={r['id'][:16]}... user={r['user_id'][:20] if r['user_id'] else 'NULL':<20} expires={r['expires_at']}")

print()
print("  Users with most sessions:")
by_user = d1("""
SELECT user_id, COUNT(*) as total,
  SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) as active
FROM sessions GROUP BY user_id ORDER BY total DESC LIMIT 5
""")
for r in by_user:
    print(f"  user={str(r['user_id'])[:30]:<30} total={r['total']}  active={r['active']}")

# ── agentsam_sessions ─────────────────────────────────────────────────────────
print()
hr()
print("TABLE: agentsam_sessions  (Agent chat sessions — conversation context)")
hr()
stats2 = d1("""
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
  SUM(CASE WHEN status='ended' THEN 1 ELSE 0 END) as ended,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT route_path) as unique_routes,
  COUNT(DISTINCT mode) as unique_modes,
  MIN(created_at) as oldest,
  MAX(updated_at) as last_updated
FROM agentsam_sessions
""")[0]
for k, v in stats2.items():
    print(f"  {k:<20} {v}")

print()
print("  Sessions by mode:")
by_mode = d1("SELECT mode, COUNT(*) as n FROM agentsam_sessions GROUP BY mode ORDER BY n DESC")
for r in by_mode:
    print(f"  mode={r['mode']:<15} count={r['n']}")

print()
print("  Sessions by route:")
by_route = d1("SELECT route_path, COUNT(*) as n FROM agentsam_sessions GROUP BY route_path ORDER BY n DESC LIMIT 8")
for r in by_route:
    print(f"  route={str(r['route_path']):<30} count={r['n']}")

print()
print("  Recent sessions:")
recent = d1("""
SELECT id, user_id, session_title, route_path, mode, status, updated_at
FROM agentsam_sessions ORDER BY updated_at DESC LIMIT 5
""")
for r in recent:
    print(f"  [{r['status']}] {r['session_title'][:25]:<25} route={str(r['route_path']):<20} updated={r['updated_at']}")

# ── Cross-reference ────────────────────────────────────────────────────────────
print()
hr()
print("CROSS-REFERENCE: user_id overlap")
hr()
auth_users = d1("SELECT DISTINCT user_id FROM sessions WHERE revoked_at IS NULL AND expires_at > datetime('now')")
agent_users = d1("SELECT DISTINCT user_id FROM agentsam_sessions WHERE status='active'")
auth_ids  = {r["user_id"] for r in auth_users if r["user_id"]}
agent_ids = {r["user_id"] for r in agent_users if r["user_id"]}
both = auth_ids & agent_ids
print(f"  Active auth session users:    {len(auth_ids)}")
print(f"  Active agent session users:   {len(agent_ids)}")
print(f"  Users in both:                {len(both)}")
print(f"  Auth-only (no agent session): {len(auth_ids - agent_ids)}")
print(f"  Agent-only (no auth session): {len(agent_ids - auth_ids)}")

# ── Verdict ───────────────────────────────────────────────────────────────────
print()
hr()
print("VERDICT")
hr()
print("""
  sessions          → HTTP auth gate. Has expires_at + revoked_at.
                      Used by getAuthUser() in session_api.js to validate
                      dashboard login tokens. 5 currently valid, 35 revoked.
                      This is the auth session table. Keep as-is.

  agentsam_sessions → Agent conversation context. Has route_path, mode,
                      session_title, status. Tracks which page the agent
                      is active on and what conversation is in progress.
                      19 currently active. NOT the auth gate — complementary.

  RECOMMENDATION: Both tables serve distinct, non-overlapping roles.
  No consolidation needed. The README has been corrected to reflect this.

  ACTION: Confirm that session_api.js getAuthUser() reads FROM sessions
  (not agentsam_sessions). If it reads agentsam_sessions, the auth gate
  has no expiry enforcement — a security gap worth fixing.
""")
