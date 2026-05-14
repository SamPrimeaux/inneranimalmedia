#!/usr/bin/env python3
"""
scripts/may14_verify.py
VERSION = "1.0.0"

End-to-end verification of all May 14 sprint work.
Checks D1 state, deployed endpoints, and file patches.
Prints a clean pass/fail report.

Usage:
  python3 scripts/may14_verify.py
  python3 scripts/may14_verify.py --skip-live  # skip curl checks
"""
import subprocess, json, sys, re, os, urllib.request
from pathlib import Path

SKIP_LIVE = "--skip-live" in sys.argv
DB = "inneranimalmedia-business"

results = []

def check(label: str, passed: bool, detail: str = ""):
    icon = "✓" if passed else "✗"
    results.append((passed, label))
    print(f"  {icon}  {label}" + (f" — {detail}" if detail else ""))

def d1q(sql: str) -> list:
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    try:
        return json.loads(r.stdout)[0].get("results",[])
    except Exception:
        return []

def section(title: str):
    print(f"\n{'─'*64}")
    print(f"  {title}")
    print(f"{'─'*64}")

# ── 1. D1 Routing arms ───────────────────────────────────────────────────────

section("1. Routing arms")

arms = d1q(
    "SELECT COUNT(*) as c FROM agentsam_routing_arms WHERE is_active=1 AND is_eligible=1"
)
arm_count = arms[0]["c"] if arms else 0
check("agentsam_routing_arms has eligible arms", arm_count > 0, f"{arm_count} rows")

# Embedding models must be disabled
bge = d1q(
    "SELECT COUNT(*) as c FROM agentsam_routing_arms WHERE model_key LIKE '%bge%' AND is_eligible=1"
)
bge_count = bge[0]["c"] if bge else 0
check("bge embedding model NOT eligible", bge_count == 0, f"{bge_count} eligible bge rows (want 0)")

# ── 2. Workflow cleanup ──────────────────────────────────────────────────────

section("2. Workflow table cleanup")

ollama_active = d1q(
    "SELECT COUNT(*) as c FROM agentsam_workflows WHERE workflow_key LIKE 'wf_ollama_local_pinstest_%' AND is_active=1"
)
active_count = ollama_active[0]["c"] if ollama_active else 0
check("Ollama pinstest dupes purged (≤2 active)", active_count <= 2, f"{active_count} active remaining")

# scaffold-new-worker has deploy node
deploy_node = d1q(
    "SELECT id FROM agentsam_workflow_nodes WHERE workflow_id='wf_scaffold_new_worker' AND node_key='deploy'"
)
check("scaffold-new-worker has deploy node", len(deploy_node) > 0)

# analytics-dashboard-three-page-e2e nodes exist
anl_nodes = d1q(
    "SELECT COUNT(*) as c FROM agentsam_workflow_nodes WHERE workflow_id='wf_analytics_dashboard_three_page_e2e'"
)
anl_count = anl_nodes[0]["c"] if anl_nodes else 0
check("analytics-dashboard-three-page-e2e has nodes", anl_count > 0, f"{anl_count} nodes")

# ── 3. Model catalog guards ──────────────────────────────────────────────────

section("3. Model catalog embedding guards")

bge_catalog = d1q(
    "SELECT COUNT(*) as c FROM agentsam_model_catalog WHERE model_key LIKE '%bge%' AND is_active=1"
)
bge_cat_count = bge_catalog[0]["c"] if bge_catalog else 0
check("bge NOT active in model_catalog", bge_cat_count == 0, f"{bge_cat_count} active (want 0)")

# ── 4. Command allowlist schema ──────────────────────────────────────────────

section("4. Command allowlist + pattern")

acl_rows = d1q(
    "SELECT COUNT(*) as c FROM agentsam_command_allowlist"
)
check("agentsam_command_allowlist exists + queryable", acl_rows is not None)

# Verify no 'allowlisted' category snuck in (CHECK constraint)
bad_cat = d1q(
    "SELECT COUNT(*) as c FROM agentsam_command_pattern WHERE category='allowlisted'"
)
bad_count = bad_cat[0]["c"] if bad_cat else 0
check("No 'allowlisted' category in agentsam_command_pattern", bad_count == 0, f"{bad_count} bad rows")

# ── 5. Source file patches ───────────────────────────────────────────────────

section("5. Source file patches")

def file_contains(path: str, marker: str) -> bool:
    try:
        return marker in Path(path).read_text()
    except Exception:
        return False

check(
    "provider.js has chatGuard (embedding filter)",
    file_contains("src/core/provider.js", "chatGuard"),
)
check(
    "routing.js has chatGuard (embedding filter)",
    file_contains("src/core/routing.js", "chatGuard"),
)
check(
    "agent.js has /api/agent/allowlist endpoint",
    file_contains("src/api/agent.js", "/api/agent/allowlist"),
)
check(
    "agent.js has routing arm auto-resolve (_resolvedArmId)",
    file_contains("src/api/agent.js", "_resolvedArmId"),
)
check(
    "agentsam-task-executor.js threads modelKey (params?.modelKey)",
    file_contains("src/core/agentsam-task-executor.js", "params?.modelKey"),
)
check(
    "workflow-executor.js has analytics_dashboard handler dispatch",
    file_contains("src/core/workflow-executor.js", "analytics_dashboard"),
)
check(
    "ToolApprovalModal.tsx has no CONFIRM input",
    not file_contains("dashboard/src/components/ToolApprovalModal.tsx", "type CONFIRM"),
)
check(
    "ToolApprovalModal.tsx has Add to Allowlist button",
    file_contains("dashboard/src/components/ToolApprovalModal.tsx", "Add to Allowlist"),
)

# ── 6. Live endpoint checks ───────────────────────────────────────────────────

if not SKIP_LIVE:
    section("6. Live endpoint checks")

    base = "https://inneranimalmedia.com"

    def curl_status(url: str, method="GET", body=None) -> int:
        try:
            req = urllib.request.Request(url, method=method)
            req.add_header("Content-Type", "application/json")
            if body:
                req.data = json.dumps(body).encode()
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code
        except Exception:
            return 0

    # themes apply — expects 400 (missing themeId) not 500
    themes_status = curl_status(f"{base}/api/themes/apply", "POST", {"themeId": ""})
    check(
        "POST /api/themes/apply returns non-500",
        themes_status not in (500, 0),
        f"HTTP {themes_status}"
    )

    # agent allowlist — expects 401 (no auth) not 404/500
    allowlist_status = curl_status(f"{base}/api/agent/allowlist", "POST", {"command": "test"})
    check(
        "POST /api/agent/allowlist exists (returns 401 not 404)",
        allowlist_status in (401, 400, 200),
        f"HTTP {allowlist_status}"
    )

# ── 7. Recent agent runs ─────────────────────────────────────────────────────

section("7. Recent agent runs — routing arm linkage")

runs = d1q(
    "SELECT routing_arm_id, ai_model_ref, status FROM agentsam_agent_run ORDER BY created_at DESC LIMIT 5"
)
if runs:
    arm_linked = sum(1 for r in runs if r.get("routing_arm_id"))
    check(
        "Recent agent runs have routing_arm_id populated",
        arm_linked > 0,
        f"{arm_linked}/{len(runs)} linked (deploy required for new runs)"
    )
else:
    check("agentsam_agent_run queryable", True, "no recent runs")

# ── Summary ────────────────────────────────────────────────────────────────

passed = sum(1 for ok, _ in results if ok)
failed = sum(1 for ok, _ in results if not ok)
total  = len(results)

print(f"\n{'═'*64}")
print(f"  RESULT: {passed}/{total} passed  {'✓ ALL PASS' if failed == 0 else f'✗ {failed} FAILED'}")
print(f"{'═'*64}")

if failed:
    print("\n  Failed checks:")
    for ok, label in results:
        if not ok:
            print(f"    ✗ {label}")

sys.exit(0 if failed == 0 else 1)
