#!/usr/bin/env python3
import json
import os
import subprocess
from collections import defaultdict

DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")

def d1(sql):
    cmd = [
        "./scripts/with-cloudflare-env.sh",
        "npx", "wrangler", "d1", "execute", DB,
        "--remote", "--json", "--command", sql
    ]
    raw = subprocess.check_output(cmd, text=True)
    return json.loads(raw)[0]["results"]

workflows = d1("""
SELECT
  id, workflow_key, display_name, workflow_type,
  default_task_type, risk_level, requires_approval,
  is_platform_global, is_active
FROM agentsam_workflows
ORDER BY id;
""")

nodes = d1("""
SELECT workflow_id, node_key, node_type, title, handler_key,
       timeout_ms, risk_level, requires_approval, sort_order
FROM agentsam_workflow_nodes
ORDER BY workflow_id, sort_order;
""")

edges = d1("""
SELECT workflow_id, from_node_key, to_node_key, condition_type,
       condition_json, is_fallback, priority, label
FROM agentsam_workflow_edges
ORDER BY workflow_id, priority, from_node_key;
""")

nodes_by_wf = defaultdict(list)
edges_by_wf = defaultdict(list)

for n in nodes:
    nodes_by_wf[n["workflow_id"]].append(n)

for e in edges:
    edges_by_wf[e["workflow_id"]].append(e)

print("\nAgent Sam Workflow DAG Inventory")
print("=" * 36)

for w in workflows:
    wf_id = w["id"]
    ns = nodes_by_wf[wf_id]
    es = edges_by_wf[wf_id]
    fallback_count = sum(1 for e in es if e.get("is_fallback") == 1)

    node_keys = {n["node_key"] for n in ns}
    bad_edges = [
        e for e in es
        if e["from_node_key"] not in node_keys or e["to_node_key"] not in node_keys
    ]

    incoming = defaultdict(int)
    outgoing = defaultdict(int)

    for e in es:
        outgoing[e["from_node_key"]] += 1
        incoming[e["to_node_key"]] += 1

    entry_candidates = [n["node_key"] for n in ns if incoming[n["node_key"]] == 0]
    terminal_candidates = [n["node_key"] for n in ns if outgoing[n["node_key"]] == 0]

    print(f"\n{wf_id}")
    print(f"  name: {w['display_name']}")
    print(f"  type: {w['workflow_type']} / task: {w['default_task_type']}")
    print(f"  risk: {w['risk_level']} approval={w['requires_approval']}")
    print(f"  nodes={len(ns)} edges={len(es)} fallbacks={fallback_count}")

    if not ns:
        print("  status: SHELL ONLY - no nodes/edges seeded")
        continue

    print(f"  entry candidates: {entry_candidates}")
    print(f"  terminal candidates: {terminal_candidates}")

    if bad_edges:
        print("  BAD EDGES:")
        for e in bad_edges:
            print(f"    {e['from_node_key']} -> {e['to_node_key']}")

    print("  path:")
    for n in ns:
        print(f"    [{n['sort_order']:>3}] {n['node_key']} ({n['node_type']}) -> {n['handler_key']}")

    print("  edges:")
    for e in es:
        fb = "fallback" if e["is_fallback"] else "normal"
        print(
            f"    {e['from_node_key']} -> {e['to_node_key']} "
            f"[{e['condition_type']} {fb} p={e['priority']}] {e['label'] or ''}"
        )

print("\nDone.")
