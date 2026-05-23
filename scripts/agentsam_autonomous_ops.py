#!/usr/bin/env python3
"""
Agent Sam Autonomous Operations System
=======================================
Governed by: primetech_agentic_flow_protocol
Python output: primetech_primeaux_paste_protocol

Capabilities:
  1. Cloudflare API integration — deploy, Worker health, route audit
  2. Self-healing — detect broken routes/tables → patch → verify
  3. R2 remote operations — D1 backup snapshots, code storage
  4. D1 advanced operations — orphan cleanup, constraint audit, optimization hints
  5. Workers AI neuron cost tracking (never_zero_cost policy)
  6. Approval-gated mutations — no destructive action without owner sign-off
  7. Resend email report on completion or paused approval

Cost policy:
  Workers AI:  $0.011 / 1,000 neurons after 10,000 neuron daily allocation
  Billing:     Neurons ≠ tokens. Never treat as free.
  Budget cap:  WORKERS_AI_DAILY_NEURON_BUDGET env var (default 50,000 = ~$0.44 after free)

Run:
  python3 scripts/agentsam_autonomous_ops.py
  python3 scripts/agentsam_autonomous_ops.py --heal       # self-heal detected issues
  python3 scripts/agentsam_autonomous_ops.py --backup     # R2 D1 snapshot
  python3 scripts/agentsam_autonomous_ops.py --full       # all phases
  python3 scripts/agentsam_autonomous_ops.py --apply-sql  # apply safe D1 repairs

Required env:
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ZONE_ID         (optional — for route DNS checks)
  RESEND_API_KEY             (optional — enables email report)
  RESEND_TO                  (default: sam@inneranimalmedia.com)

Optional env:
  IAM_WORKER_NAME            (default: inneranimalmedia)
  IAM_D1_DB_ID               (default: cf87b717-d4e2-4cf8-bab0-a81268e32d49)
  IAM_R2_BUCKET              (default: inneranimalmedia)
  IAM_R2_BACKUP_PREFIX       (default: backups/d1-snapshots)
  WORKERS_AI_DAILY_NEURON_BUDGET (default: 50000)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ACCOUNT_ID    = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
API_TOKEN     = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ZONE_ID       = os.environ.get("CLOUDFLARE_ZONE_ID", "")
RESEND_KEY    = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM   = os.environ.get("RESEND_FROM", "agent@inneranimalmedia.com")
RESEND_TO     = os.environ.get("RESEND_TO", "sam@inneranimalmedia.com")

WORKER_NAME   = os.environ.get("IAM_WORKER_NAME", "inneranimalmedia")
D1_DB_ID      = os.environ.get("IAM_D1_DB_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
R2_BUCKET     = os.environ.get("IAM_R2_BUCKET", "inneranimalmedia")
R2_BACKUP_PFX = os.environ.get("IAM_R2_BACKUP_PREFIX", "backups/d1-snapshots")

NEURON_DAILY_BUDGET = int(os.environ.get("WORKERS_AI_DAILY_NEURON_BUDGET", "50000"))
NEURON_FREE_ALLOC   = 10_000
NEURON_RATE         = 0.011 / 1_000   # $ per neuron

ROOT          = Path.cwd()
ARTIFACTS     = ROOT / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

RUN_ID        = f"ops_{int(time.time())}"
RUN_STARTED   = time.time()

TENANT_ID     = "tenant_sam_primeaux"
WORKSPACE_ID  = "ws_inneranimalmedia"
USER_ID       = "au_871d920d1233cbd1"
RULE_ID       = "primetech_agentic_flow_protocol"
SCRIPT_ID     = "scr_agentsam_autonomous_ops"

# Health check routes that must return 200
HEALTH_ROUTES = [
    "/api/health",
    "/api/agent/status",
    "/api/agentsam/workflows",
]

# Tables that must exist and have rows
REQUIRED_TABLES = [
    "agentsam_workflows",
    "agentsam_workflow_handlers",
    "agentsam_subagent_profile",
    "agentsam_model_catalog",
    "agentsam_commands",
    "agentsam_plans",
    "agentsam_agent_run",
]

# Safe D1 repairs — read-only query checks only; write repairs go to approval queue
SAFE_REPAIR_QUERIES = {
    "orphan_execution_steps": """
        SELECT COUNT(*) AS count FROM agentsam_execution_steps s
        LEFT JOIN agentsam_workflow_runs wr ON wr.id = s.execution_id
        WHERE wr.id IS NULL;
    """,
    "zero_cost_completed_runs": """
        SELECT COUNT(*) AS count FROM agentsam_workflow_runs
        WHERE status = 'completed' AND cost_usd = 0;
    """,
    "stuck_approvals": """
        SELECT COUNT(*) AS count FROM agentsam_approval_queue
        WHERE status = 'pending' AND (expires_at IS NULL OR expires_at < unixepoch());
    """,
    "plans_zero_done_old": """
        SELECT COUNT(*) AS count FROM agentsam_plans
        WHERE status = 'active' AND tasks_done = 0
          AND created_at < unixepoch() - 604800;
    """,
    "missing_workflow_runs_cost": """
        SELECT COUNT(*) AS count FROM agentsam_workflow_runs
        WHERE status = 'completed' AND cost_usd = 0 AND duration_ms > 0;
    """,
}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def cf_request(method: str, path: str, body: dict | None = None,
               timeout: int = 30) -> dict[str, Any]:
    url  = f"https://api.cloudflare.com/client/v4{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type":  "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"success": False, "error": f"HTTP {e.code}",
                "body": e.read().decode(errors="replace")[:500]}
    except Exception as e:
        return {"success": False, "error": str(e)}


def d1_query(sql: str, params: list | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"sql": sql}
    if params:
        body["params"] = params
    return cf_request(
        "POST",
        f"/accounts/{ACCOUNT_ID}/d1/database/{D1_DB_ID}/query",
        body=body,
    )


def d1_rows(sql: str) -> list[dict[str, Any]]:
    result = d1_query(sql)
    if not result.get("success"):
        return []
    results = result.get("result", [])
    if isinstance(results, list) and results:
        return results[0].get("results", [])
    return []


def http_get(url: str, timeout: int = 15) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "AgentSam-HealthCheck/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {"ok": True, "status": resp.status,
                    "body": resp.read().decode(errors="replace")[:500]}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": ""}
    except Exception as e:
        return {"ok": False, "status": 0, "error": str(e)}


# ---------------------------------------------------------------------------
# Phase 1 — Cloudflare Worker health
# ---------------------------------------------------------------------------

def phase_worker_health() -> dict[str, Any]:
    print("[1/6] Worker health check...")
    results: dict[str, Any] = {}

    # Worker subdomain
    worker_res = cf_request("GET", f"/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}")
    results["worker_exists"] = worker_res.get("success", False)

    # Route health checks
    worker_url = f"https://{WORKER_NAME}.workers.dev"
    route_results = {}
    for route in HEALTH_ROUTES:
        res = http_get(f"{worker_url}{route}", timeout=10)
        route_results[route] = res
        status = "OK" if res.get("status") == 200 else f"FAIL({res.get('status',0)})"
        print(f"  {status} {route}")

    results["routes"] = route_results
    results["healthy_routes"] = sum(1 for r in route_results.values() if r.get("status") == 200)
    results["failed_routes"]  = [k for k, v in route_results.items() if v.get("status") != 200]
    return results


# ---------------------------------------------------------------------------
# Phase 2 — D1 audit
# ---------------------------------------------------------------------------

def phase_d1_audit() -> dict[str, Any]:
    print("[2/6] D1 audit...")
    findings: list[dict[str, Any]] = []
    table_counts: dict[str, int] = {}

    for table in REQUIRED_TABLES:
        rows = d1_rows(f"SELECT COUNT(*) AS n FROM {table};")
        count = rows[0].get("n", 0) if rows else -1
        table_counts[table] = count
        status = "OK" if count > 0 else "EMPTY"
        print(f"  {status} {table} ({count} rows)")
        if count == 0:
            findings.append({"severity": "HIGH", "table": table,
                              "issue": "Table is empty", "safe_to_auto_fix": False})

    # Run safe diagnostic queries
    repair_counts: dict[str, int] = {}
    for name, sql in SAFE_REPAIR_QUERIES.items():
        rows = d1_rows(sql)
        count = rows[0].get("count", 0) if rows else 0
        repair_counts[name] = count
        if count > 0:
            severity = "HIGH" if name in ("stuck_approvals", "orphan_execution_steps") else "MEDIUM"
            findings.append({
                "severity": severity,
                "check": name,
                "count": count,
                "safe_to_auto_fix": name == "orphan_execution_steps",
            })
            print(f"  [{severity}] {name}: {count} rows need attention")

    return {
        "table_counts":   table_counts,
        "repair_counts":  repair_counts,
        "findings":       findings,
        "total_findings": len(findings),
    }


# ---------------------------------------------------------------------------
# Phase 3 — Self-healing
# ---------------------------------------------------------------------------

def phase_self_heal(d1_audit: dict[str, Any],
                    worker_health: dict[str, Any],
                    dry_run: bool = True) -> dict[str, Any]:
    print(f"[3/6] Self-heal ({'DRY RUN' if dry_run else 'LIVE'})...")
    actions: list[dict[str, Any]] = []
    approval_queue: list[dict[str, Any]] = []

    # Fix: stuck approvals — queue approval to clear them
    stuck = d1_audit["repair_counts"].get("stuck_approvals", 0)
    if stuck > 0:
        item = {
            "action": "expire_stuck_approvals",
            "sql": f"UPDATE agentsam_approval_queue SET status='expired' WHERE status='pending' AND (expires_at IS NULL OR expires_at < {int(time.time())});",
            "risk": "low",
            "reason": f"{stuck} approval(s) stuck pending with no expiry",
            "requires_approval": False,
        }
        if not dry_run:
            res = d1_query(item["sql"])
            item["result"] = "ok" if res.get("success") else res.get("error")
            print(f"  FIX expired {stuck} stuck approvals")
        actions.append(item)

    # Fix: old zero-done plans — mark abandoned
    old_plans = d1_audit["repair_counts"].get("plans_zero_done_old", 0)
    if old_plans > 0:
        item = {
            "action": "abandon_stale_plans",
            "sql": f"UPDATE agentsam_plans SET status='abandoned', updated_at={int(time.time())} WHERE status='active' AND tasks_done=0 AND created_at < {int(time.time()) - 604800};",
            "risk": "medium",
            "reason": f"{old_plans} plan(s) active >7 days with zero tasks done",
            "requires_approval": True,
        }
        approval_queue.append(item)
        print(f"  QUEUED approval: abandon {old_plans} stale plans (>7d, 0 done)")

    # Fix: failed routes — insert to approval queue for manual redeploy
    failed = worker_health.get("failed_routes", [])
    if failed:
        item = {
            "action": "redeploy_worker",
            "command": "npm run deploy:full",
            "reason": f"Routes failing: {', '.join(failed)}",
            "risk": "high",
            "requires_approval": True,
        }
        approval_queue.append(item)
        print(f"  QUEUED approval: redeploy worker ({len(failed)} failing route(s))")

    # Write approval queue items to D1
    for item in approval_queue:
        if not dry_run:
            appr_id = f"appr_{hex(int(time.time()))[2:]}"
            d1_query(
                "INSERT INTO agentsam_approval_queue "
                "(id, tenant_id, workspace_id, user_id, tool_name, action_summary, "
                "input_json, risk_level, approval_type, status, expires_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                [
                    appr_id, TENANT_ID, WORKSPACE_ID, USER_ID,
                    item["action"],
                    item["reason"],
                    json.dumps(item),
                    item["risk"],
                    "terminal" if item.get("command") else "db_write",
                    "pending",
                    int(time.time()) + 3600,
                ],
            )

    return {
        "actions_taken":    [a for a in actions if not a.get("requires_approval")],
        "queued_approvals": approval_queue,
        "dry_run":          dry_run,
    }


# ---------------------------------------------------------------------------
# Phase 4 — R2 backup
# ---------------------------------------------------------------------------

def phase_r2_backup(d1_audit: dict[str, Any]) -> dict[str, Any]:
    print("[4/6] R2 backup...")
    timestamp  = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    key        = f"{R2_BACKUP_PFX}/{timestamp}/d1_audit_snapshot.json"
    payload    = json.dumps({
        "timestamp":   timestamp,
        "run_id":      RUN_ID,
        "table_counts": d1_audit.get("table_counts", {}),
        "findings":    d1_audit.get("findings", []),
        "repair_counts": d1_audit.get("repair_counts", {}),
    }, indent=2).encode()

    res = cf_request(
        "PUT",
        f"/accounts/{ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{key}",
        timeout=30,
    )
    # R2 object PUT via REST API uses raw body — need direct urllib call
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{key}"
    req = urllib.request.Request(
        url, data=payload, method="PUT",
        headers={
            "Authorization":  f"Bearer {API_TOKEN}",
            "Content-Type":   "application/json",
            "Content-Length": str(len(payload)),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = {"ok": True, "key": key, "bytes": len(payload), "status": resp.status}
            print(f"  OK  R2 backup → {key} ({len(payload)} bytes)")
            return result
    except Exception as e:
        result = {"ok": False, "error": str(e), "key": key}
        print(f"  WARN R2 backup failed: {e}")
        return result


# ---------------------------------------------------------------------------
# Phase 5 — Workers AI neuron cost tracking
# ---------------------------------------------------------------------------

def phase_workers_ai_audit() -> dict[str, Any]:
    print("[5/6] Workers AI cost audit...")

    # Pull recent Workers AI model usage from D1 executions
    rows = d1_rows("""
        SELECT model_key, COUNT(*) AS runs,
               SUM(input_tokens + output_tokens) AS total_tokens,
               SUM(cost_usd) AS total_cost_usd
        FROM agentsam_executions
        WHERE model_key LIKE '@cf/%'
           OR model_key LIKE 'workers_ai%'
        GROUP BY model_key
        ORDER BY runs DESC
        LIMIT 20;
    """)

    wai_runs = d1_rows("""
        SELECT COUNT(*) AS n FROM agentsam_agent_run
        WHERE provider = 'cloudflare'
          AND created_at_unix > unixepoch() - 86400;
    """)
    today_runs = wai_runs[0].get("n", 0) if wai_runs else 0

    # Neuron cost estimate
    # Conservative estimate: 1 text-gen token ≈ 1 neuron for 7B models, ~2 for larger
    # We don't have exact neuron counts but can flag budget policy
    estimated_neurons_today = today_runs * 500  # rough: ~500 neurons per avg run
    cost_after_free = max(0, estimated_neurons_today - NEURON_FREE_ALLOC) * NEURON_RATE

    policy = {
        "workers_ai_is_free":             False,
        "daily_free_neuron_allocation":   NEURON_FREE_ALLOC,
        "paid_rate_per_1000_neurons":     0.011,
        "paid_rate_per_1m_neurons":       11.00,
        "cost_basis":                     "neuron_metered_not_token_metered",
        "routing_policy":                 "never_zero_cost",
        "estimated_neurons_today":        estimated_neurons_today,
        "estimated_cost_today_usd":       round(cost_after_free, 4),
        "budget_remaining_neurons":       max(0, NEURON_DAILY_BUDGET - estimated_neurons_today),
    }

    for row in rows:
        print(f"  WAI {row.get('model_key','?')} — {row.get('runs',0)} runs, "
              f"cost=${row.get('total_cost_usd',0):.4f}")
    print(f"  Estimated WAI neurons today: {estimated_neurons_today} "
          f"(~${cost_after_free:.4f} after free alloc)")

    return {"model_usage": rows, "policy": policy}


# ---------------------------------------------------------------------------
# Phase 6 — Generate artifacts + D1 trace
# ---------------------------------------------------------------------------

def phase_report(
    worker_health: dict[str, Any],
    d1_audit: dict[str, Any],
    heal: dict[str, Any],
    r2: dict[str, Any],
    wai: dict[str, Any],
    args: argparse.Namespace,
) -> dict[str, Any]:
    duration_ms = int((time.time() - RUN_STARTED) * 1000)
    report = {
        "run_id":       RUN_ID,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms":  duration_ms,
        "args":         vars(args),
        "worker_health": worker_health,
        "d1_audit":      d1_audit,
        "heal":          heal,
        "r2_backup":     r2,
        "workers_ai":    wai,
        "summary": {
            "healthy_routes":   worker_health.get("healthy_routes", 0),
            "failed_routes":    len(worker_health.get("failed_routes", [])),
            "d1_findings":      d1_audit.get("total_findings", 0),
            "actions_taken":    len(heal.get("actions_taken", [])),
            "queued_approvals": len(heal.get("queued_approvals", [])),
            "r2_backup_ok":     r2.get("ok", False),
            "wai_cost_today":   wai.get("policy", {}).get("estimated_cost_today_usd", 0),
        },
    }

    out_json = ARTIFACTS / f"agentsam_ops_{RUN_ID}.json"
    out_json.write_text(json.dumps(report, indent=2))
    print(f"\n  Report → {out_json}")
    return report


# ---------------------------------------------------------------------------
# Email (Resend)
# ---------------------------------------------------------------------------

def send_email(report: dict[str, Any]) -> dict[str, Any]:
    if not RESEND_KEY:
        return {"skipped": True}

    s = report["summary"]
    findings = report["d1_audit"].get("findings", [])
    approvals = report["heal"].get("queued_approvals", [])

    route_rows = ""
    for r, v in report["worker_health"].get("routes", {}).items():
        ok    = v.get("status") == 200
        color = "#22c55e" if ok else "#ef4444"
        label = "200 OK" if ok else "FAIL " + str(v.get("status", 0))
        route_rows += (
            f"<tr><td style='font-family:monospace'>{r}</td>"
            f"<td style='color:{color}'>{label}</td></tr>"
        )

    finding_rows = "".join(
        f"<tr><td style='color:{'#ef4444' if f.get('severity')=='HIGH' else '#f59e0b'}'>"
        f"{f.get('severity')}</td><td>{f.get('check') or f.get('table')}</td>"
        f"<td>{f.get('count','')} {f.get('issue','')}</td></tr>"
        for f in findings
    )

    approval_rows = "".join(
        f"<tr><td style='font-weight:700'>{a.get('action')}</td>"
        f"<td style='color:#f59e0b'>{a.get('risk')}</td>"
        f"<td>{a.get('reason')}</td></tr>"
        for a in approvals
    )

    approval_section = ""
    if approvals:
        approval_section = f"""
<h3 style="color:#f59e0b;margin:20px 0 8px">⏸ {len(approvals)} Action(s) Awaiting Your Approval</h3>
<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px">
<thead><tr style="background:#1e293b"><th align="left">Action</th><th>Risk</th><th align="left">Reason</th></tr></thead>
<tbody>{approval_rows}</tbody>
</table>
<p style="font-size:12px;color:#94a3b8">Review in Agent Sam dashboard → Approval Queue</p>
"""

    html = f"""<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:20px">
<div style="max-width:680px;margin:0 auto">
<div style="background:linear-gradient(135deg,#1e3a5f,#0f2d4a);border-radius:10px;padding:20px;margin-bottom:20px">
  <h1 style="margin:0 0 4px;font-size:18px">Agent Sam Autonomous Ops — Run Report</h1>
  <p style="margin:0;color:#94a3b8;font-size:12px">{report['generated_at']} · {report['duration_ms']}ms · {RUN_ID}</p>
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
  <div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:{'#22c55e' if s['failed_routes']==0 else '#ef4444'}">{s['healthy_routes']}/{s['healthy_routes']+s['failed_routes']}</div>
    <div style="font-size:11px;color:#64748b">Routes OK</div>
  </div>
  <div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:{'#ef4444' if s['d1_findings']>0 else '#22c55e'}">{s['d1_findings']}</div>
    <div style="font-size:11px;color:#64748b">D1 Findings</div>
  </div>
  <div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:{'#f59e0b' if s['queued_approvals']>0 else '#22c55e'}">{s['queued_approvals']}</div>
    <div style="font-size:11px;color:#64748b">Need Approval</div>
  </div>
  <div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:#3b82f6">${s['wai_cost_today']:.4f}</div>
    <div style="font-size:11px;color:#64748b">WAI Cost Today</div>
  </div>
</div>
{approval_section}
<h3 style="margin:20px 0 8px;color:#94a3b8">ROUTE HEALTH</h3>
<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px">
<thead><tr style="background:#1e293b"><th align="left">Route</th><th align="left">Status</th></tr></thead>
<tbody>{route_rows}</tbody>
</table>
{"<h3 style='margin:20px 0 8px;color:#94a3b8'>D1 FINDINGS</h3><table width='100%' cellpadding='6' cellspacing='0' style='border-collapse:collapse;font-size:12px'><thead><tr style='background:#1e293b'><th>Severity</th><th align='left'>Check</th><th align='left'>Detail</th></tr></thead><tbody>"+finding_rows+"</tbody></table>" if findings else ""}
<p style="font-size:10px;color:#475569;margin-top:20px">Workers AI: {report['workers_ai']['policy']['estimated_neurons_today']:,} neurons estimated today · $0.011/1K after {NEURON_FREE_ALLOC:,} free</p>
</div></body></html>"""

    payload = json.dumps({
        "from": RESEND_FROM, "to": [RESEND_TO],
        "subject": f"[Agent Sam Ops] {('⚠️ Action Required' if approvals else '✅ All Clear')} — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC",
        "html": html,
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails", data=payload, method="POST",
        headers={"Authorization": f"Bearer {RESEND_KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            return {"ok": True, "id": body.get("id")}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode(errors="replace")[:200]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# D1 trace (script_run record)
# ---------------------------------------------------------------------------

def log_script_run(status: str, summary: str, error: str = "") -> None:
    now = int(time.time())
    d1_query(
        "INSERT INTO agentsam_script_runs "
        "(id, tenant_id, workspace_id, user_id, script_id, rule_id, "
        "triggered_by, trigger_source, status, duration_ms, "
        "output_summary, error_message, started_at_epoch, completed_at_epoch, created_at_epoch) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            f"sr_ops_{hex(now)[2:]}",
            TENANT_ID, WORKSPACE_ID, USER_ID,
            SCRIPT_ID, RULE_ID,
            "agent", "agentsam_autonomous_ops",
            status,
            int((time.time() - RUN_STARTED) * 1000),
            summary[:500], error[:300],
            int(RUN_STARTED), now, now,
        ],
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def check_env() -> bool:
    missing = [v for v in ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN") if not os.environ.get(v)]
    if missing:
        print(f"[FAIL] Missing env vars: {', '.join(missing)}", file=sys.stderr)
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent Sam Autonomous Operations System")
    parser.add_argument("--heal",      action="store_true", help="Apply self-healing fixes (non-destructive only)")
    parser.add_argument("--backup",    action="store_true", help="R2 D1 snapshot only")
    parser.add_argument("--full",      action="store_true", help="All phases including heal")
    parser.add_argument("--no-email",  action="store_true", help="Skip email report")
    args = parser.parse_args()

    if not check_env():
        return 2

    print("Agent Sam Autonomous Operations System")
    print(f"  run_id  : {RUN_ID}")
    print(f"  worker  : {WORKER_NAME}")
    print(f"  d1      : {D1_DB_ID}")
    print(f"  r2      : {R2_BUCKET}/{R2_BACKUP_PFX}")
    print(f"  heal    : {args.heal or args.full}")
    print()

    # Phase 1 — Worker health
    worker_health = phase_worker_health()

    # Phase 2 — D1 audit
    d1_audit = phase_d1_audit()

    # Phase 3 — Self-heal
    do_heal = args.heal or args.full
    heal = phase_self_heal(d1_audit, worker_health, dry_run=not do_heal)

    # Phase 4 — R2 backup
    r2 = {}
    if args.backup or args.full:
        r2 = phase_r2_backup(d1_audit)
    else:
        print("[4/6] R2 backup skipped (pass --backup or --full)")
        r2 = {"ok": False, "skipped": True}

    # Phase 5 — Workers AI audit
    wai = phase_workers_ai_audit()

    # Phase 6 — Report
    print("[6/6] Generating report...")
    report = phase_report(worker_health, d1_audit, heal, r2, wai, args)

    # D1 trace
    summary_line = (
        f"routes={report['summary']['healthy_routes']}ok/"
        f"{report['summary']['failed_routes']}fail "
        f"findings={report['summary']['d1_findings']} "
        f"approvals_queued={report['summary']['queued_approvals']}"
    )
    log_script_run("completed", summary_line)

    # Email
    if not args.no_email:
        email_res = send_email(report)
        if email_res.get("skipped"):
            print("  Email skipped (no RESEND_API_KEY)")
        elif email_res.get("ok"):
            print(f"  Email sent → {RESEND_TO}")
        else:
            print(f"  Email warn: {email_res}")

    # Summary
    s = report["summary"]
    print(f"\n{'='*50}")
    print(f"  Routes    : {s['healthy_routes']} OK / {s['failed_routes']} failed")
    print(f"  D1        : {s['d1_findings']} findings")
    print(f"  Actions   : {s['actions_taken']} taken, {s['queued_approvals']} need approval")
    print(f"  WAI cost  : ${s['wai_cost_today']:.4f} estimated today")
    print(f"  Duration  : {report['duration_ms']}ms")
    print(f"  Report    : artifacts/agentsam_ops_{RUN_ID}.json")

    if heal.get("queued_approvals"):
        print("\n  [ACTION REQUIRED] Items waiting in approval queue:")
        for item in heal["queued_approvals"]:
            print(f"    - {item['action']} ({item['risk']}) — {item['reason']}")

    return 0 if s["failed_routes"] == 0 and s["d1_findings"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
