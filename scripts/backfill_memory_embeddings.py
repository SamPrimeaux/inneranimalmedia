#!/usr/bin/env python3
"""
Backfill agentsam_memory → Supabase agent_memory
Reads all D1 rows where embedding_id IS NULL,
mirrors each to Supabase (trigger auto-generates embedding),
writes returned UUID back to D1 embedding_id.
"""

import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

# --- load env ---
env_path = Path(__file__).parent.parent / ".env.agentsam.local"
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

CF_ACCOUNT_ID   = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN    = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID  = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
SUPABASE_URL    = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY    = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

D1_ENDPOINT = (
    f"https://api.cloudflare.com/client/v4/accounts"
    f"/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
)

def d1_query(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(
        D1_ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {CF_API_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if not data.get("success"):
        raise RuntimeError(f"D1 error: {data}")
    return data["result"][0]["results"]

def supabase_insert(row):
    body = json.dumps(row).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/agent_memory",
        data=body,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        result = json.loads(r.read())
    return result[0]["id"]  # UUID

def map_row(r):
    """Map D1 agentsam_memory row → Supabase agent_memory shape."""
    content = f"{r['key']}: {r['value']}"
    session_id = r.get("session_id") or f"{r.get('agent_id', 'agent-sam')}_{r.get('memory_type', 'fact')}"
    return {
        "session_id":   session_id,
        "agent_id":     r.get("agent_id") or "agent-sam",
        "role":         "system",
        "content":      content,
        "workspace_id": r.get("workspace_id"),
        "tenant_id":    r.get("tenant_id"),
        "user_id":      r.get("user_id"),
        "metadata": {
            "d1_id":        r["id"],
            "key":          r["key"],
            "memory_type":  r.get("memory_type"),
            "confidence":   r.get("confidence"),
            "decay_score":  r.get("decay_score"),
            "recall_count": r.get("recall_count"),
            "tags":         r.get("tags"),
        },
    }

def main():
    print("Fetching D1 rows with embedding_id IS NULL...")
    rows = d1_query(
        "SELECT id, key, value, memory_type, agent_id, session_id, "
        "workspace_id, tenant_id, user_id, confidence, decay_score, "
        "recall_count, tags FROM agentsam_memory WHERE embedding_id IS NULL"
    )
    print(f"Found {len(rows)} rows to backfill.\n")

    ok = 0
    fail = 0
    for i, row in enumerate(rows, 1):
        try:
            supabase_row = map_row(row)
            uuid = supabase_insert(supabase_row)
            d1_query(
                "UPDATE agentsam_memory SET embedding_id = ? WHERE id = ?",
                [uuid, row["id"]]
            )
            print(f"[{i}/{len(rows)}] OK  {row['id']} → {uuid}  key={row['key'][:40]}")
            ok += 1
            time.sleep(0.15)  # gentle on the APIs
        except Exception as e:
            print(f"[{i}/{len(rows)}] ERR {row['id']}  key={row['key'][:40]}  → {e}")
            fail += 1

    print(f"\nDone. {ok} synced, {fail} failed.")
    if fail:
        print("Re-run to retry failures — skips already-synced rows.")

if __name__ == "__main__":
    main()
