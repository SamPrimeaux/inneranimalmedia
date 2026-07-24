#!/usr/bin/env python3
"""
P0 in_review closeout auditor — READ ONLY.

Purpose
-------
Minimize wasted effort on the routing-spine / reliability P0 cluster that is
already `in_review`. Pulls primary data (D1 ticket rows, e2e_pass events,
gate_runs), walks git + repo signals, and classifies each ticket:

  READY_ASSERT   — consecutive_pass + proof rows meet dual-pass; assert may run
  NEED_T2        — has T1-ish proof but not enough distinct e2e_pass/gates
  NEED_T1        — in_review but zero usable proof events
  CONFLICT       — ticket claims done / in_review but code still shows the bug
  MISSING_ROW    — ticket id not in D1
  UNVERIFIED     — D1 unreachable or doc/code signals incomplete

This script NEVER:
  - UPDATE/INSERT tickets or events
  - runs assert:ticket-shippable --set-shipped
  - commits, pushes, or deploys

Usage
-----
  python3 scripts/audit_p0_in_review_closeout.py
  python3 scripts/audit_p0_in_review_closeout.py --dry-run          # stdout only
  python3 scripts/audit_p0_in_review_closeout.py --json             # machine JSON
  python3 scripts/audit_p0_in_review_closeout.py --ticket=tkt_…     # one ticket
  python3 scripts/audit_p0_in_review_closeout.py --cluster=all      # + reliability P0s

Writes (unless --dry-run): .scratch/platform/p0_in_review_closeout.md
                           .scratch/platform/p0_in_review_closeout.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
if ROOT.name != "inneranimalmedia":
    raise RuntimeError(f"Refusing to run outside inneranimalmedia repo: {ROOT}")

SCRATCH = ROOT / ".scratch" / "platform"
OUT_MD = SCRATCH / "p0_in_review_closeout.md"
OUT_JSON = SCRATCH / "p0_in_review_closeout.json"
ENV_FILE = ROOT / ".env.cloudflare"
D1_DB = "inneranimalmedia-business"
WRANGLER_CFG = "wrangler.production.toml"

NOW = datetime.now(timezone.utc)
NOW_ISO = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")

# Cheapest, highest-leverage cluster: claimed in_review, waiting dual-pass.
IN_REVIEW_CLOSEOUT: list[str] = [
    "tkt_finding_3_pending_status",
    "tkt_p0_infer_intent_heuristically",
    "tkt_closed_loop_code_rag_2026_07_14",
    "tkt_telemetry_002",
    "tkt_intent_keywords_classifier",
    "tkt_classification_keywords_unify",
    "tkt_image_code_guard_false_positive",
    "tkt_routing_spine_front_door",
]

# Sibling routing/reliability P0s — still open; include with --cluster=all.
RELIABILITY_AND_SIBLINGS: list[str] = [
    "tkt_p0_image_gate_js_guards",
    "tkt_p0_code_implementation_intent",
    "tkt_ops_trail_timestamp_law",
    "tkt_oauth_token_liveness",
    "tkt_routing_arm_cost_cap_enforcement",
    "tkt_session_write_policy_enforcement",
    "tkt_routing_tool_ssot",
    "tkt_closed_loop_feedback_blindspots_2026_07_14",
    "tkt_phase_gate_stop",
]

# Per-ticket code/doc signals. Hits are evidence, not proof of "shipped".
TICKET_SIGNALS: dict[str, dict[str, Any]] = {
    "tkt_routing_spine_front_door": {
        "title_hint": "One front-door TaskSpec + golden matrix",
        "doc_globs": ["plans/active/ROUTING-SPINE*.md", "plans/**/*FRONT*DOOR*"],
        "must_present": [
            "resolveTurnDecision",
            "turn-decision-v1",
            "TaskSpec",
        ],
        "must_present_paths": ["src/core/turn-decision.js", "src/core/task-spec.js"],
        "notes": "Pass = one agentsam_intent_decisions row per turn with spine=turn-decision-v1",
    },
    "tkt_p0_infer_intent_heuristically": {
        "title_hint": "Replace JS heuristic classifier with D1 intent_decisions",
        "doc_globs": ["plans/**/*INTENT*", "plans/backlog/*hardcoded_routing*"],
        "must_present": ["agentsam_intent_decisions", "resolveTurnDecision"],
        "conflict_call_sites": {
            "inferIntentHeuristically": {
                "allow_files": [
                    "src/api/agent/classify-intent.js",
                    "src/api/agent/index.js",
                    "src/api/agent.js",
                    # Cold-start / no-D1 + bootstrap leftovers only (DOCUMENTED_EXCEPTION).
                    "src/core/turn-decision.js",
                    "src/core/agent-model-resolver.js",
                ],
                "scan_roots": ["src/"],
                "require_documented_exception": True,
            },
        },
        "notes": (
            "Allowlisted call sites must carry DOCUMENTED_EXCEPTION "
            "(tkt_p0_infer_intent_heuristically). Production hot path with env.DB "
            "must use resolveTurnDecision / inferIntentFromKeywords."
        ),
    },
    "tkt_classification_keywords_unify": {
        "title_hint": "Unify wordlists into agentsam_classification_keywords",
        "doc_globs": ["plans/**/*CLASSIFICATION*", "migrations/*classification_keywords*"],
        "must_present": ["agentsam_classification_keywords"],
        "must_present_paths": ["src/core/classification-keywords.js"],
        "notes": "Check D1 purpose counts in cluster snapshot",
    },
    "tkt_intent_keywords_classifier": {
        "title_hint": "Intent keywords + reward / decisions path",
        "doc_globs": ["plans/active/INTENT-KEYWORDS*.md"],
        "must_present": ["agentsam_intent_decisions", "agentsam_classification_keywords"],
        "must_present_paths": ["src/core/classification-keywords.js"],
    },
    "tkt_image_code_guard_false_positive": {
        "title_hint": "Image-intent gate false positives on code turns",
        "doc_globs": ["plans/**/*image*gate*", "plans/backlog/*hardcoded_routing*"],
        "must_present_paths": ["src/core/image-intent-gate.js"],
        "notes": "Needs Tier-2 raw pull of intent_decisions (matched_by=rejected_guard / false positives)",
    },
    "tkt_p0_image_gate_js_guards": {
        "title_hint": "Retire parallel JS image-gate guards",
        "must_present_paths": ["src/core/image-intent-gate.js"],
        "notes": "Sibling of false_positive — confirm guards are D1-driven not hard-coded veto",
    },
    "tkt_p0_code_implementation_intent": {
        "title_hint": "Retire parallel code_implementation classifier hub",
        "must_present": ["code_implementation"],
        "notes": "Look for second hub besides resolveTurnDecision deciding code_implementation",
    },
    "tkt_closed_loop_code_rag_2026_07_14": {
        "title_hint": "Closed-loop code RAG",
        "doc_globs": ["plans/active/CLOSED-LOOP-CODE-RAG*.md"],
        "must_present_paths": ["plans/active/CLOSED-LOOP-CODE-RAG-2026-07-14.md"],
        "notes": "Dual-pass needs live ANN/retrieve proof ids — deploy alone ≠ pass",
    },
    "tkt_telemetry_002": {
        "title_hint": "Telemetry / ops trail",
        "doc_globs": ["plans/**/*telemetry*", "plans/**/*ops*trail*"],
        "notes": "Verify gate_runs / tool_call_log timestamps are INTEGER unixepoch",
    },
    "tkt_finding_3_pending_status": {
        "title_hint": "Finding #3 pending status",
        "doc_globs": ["plans/**/*finding*", "plans/backlog/*"],
        "notes": "Confirm what pending meant and whether status reconciler fixed it",
    },
    "tkt_ops_trail_timestamp_law": {
        "title_hint": "Ops trail timestamp INTEGER law",
        "notes": "TEXT timestamps / datetime('now') in ops-trail writers = CONFLICT",
    },
    "tkt_oauth_token_liveness": {
        "title_hint": "OAuth token liveness (no false ACCESS_STILL_EXPIRED)",
        "doc_globs": ["plans/**/*oauth*"],
        "notes": "Re-check refresh updates expires_at; stale expires_at after refresh = CONFLICT",
    },
    "tkt_phase_gate_stop": {
        "title_hint": "Never ship after one proof (dual-pass law)",
        "notes": "Meta-ticket — this script exists to obey it",
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def run(cmd: str | list[str], timeout: int = 30) -> tuple[str, int]:
    try:
        r = subprocess.run(
            cmd if isinstance(cmd, list) else cmd,
            shell=not isinstance(cmd, list),
            capture_output=True,
            text=True,
            cwd=ROOT,
            timeout=timeout,
            env=os.environ,
        )
        return (r.stdout or "").strip(), r.returncode
    except Exception as e:
        return f"ERROR: {e}", 1


def load_cf_env() -> bool:
    if not ENV_FILE.exists():
        return False
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip("\"'")
        if k and k not in os.environ:
            os.environ[k] = v
    return True


def sql_quote(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def d1(sql: str) -> tuple[list[dict] | None, str | None]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        D1_DB,
        "--json",
        "--remote",
        "-c",
        WRANGLER_CFG,
        "--command",
        sql,
    ]
    raw, rc = run(cmd, timeout=45)
    if rc != 0:
        return None, f"exit {rc}: {raw[:500]}"
    try:
        start = min([i for i in (raw.find("["), raw.find("{")) if i >= 0], default=-1)
        payload = json.loads(raw[start:] if start >= 0 else raw)
        if isinstance(payload, list) and payload:
            return payload[0].get("results", []), None
        if isinstance(payload, dict):
            return payload.get("results", []), None
        return [], None
    except json.JSONDecodeError as e:
        return None, str(e)


def git_log_for_ticket(ticket_id: str, limit: int = 15) -> list[dict]:
    out, rc = run(
        ["git", "log", "--all", "--oneline", f"-n{limit}", f"--grep={ticket_id}"],
        timeout=15,
    )
    if rc != 0 or not out or out.startswith("ERROR:"):
        return []
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(" ", 1)
        rows.append({"sha": parts[0], "subject": parts[1] if len(parts) > 1 else ""})
    return rows


def path_exists(rel: str) -> bool:
    return (ROOT / rel).is_file()


def glob_any(patterns: list[str]) -> list[str]:
    found: list[str] = []
    for pat in patterns:
        found.extend(str(p.relative_to(ROOT)) for p in ROOT.glob(pat) if p.is_file())
    return sorted(set(found))


def count_term_in_roots(term: str, roots: list[str], allow_files: list[str]) -> list[dict]:
    """Return file:line hits for term under roots, excluding allow_files."""
    allow = {str((ROOT / a).resolve()) for a in allow_files}
    hits: list[dict] = []
    for root in roots:
        base = ROOT / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in {".js", ".ts", ".mjs", ".tsx"}:
                continue
            if str(path.resolve()) in allow:
                continue
            rel = str(path.relative_to(ROOT))
            if any(x in rel for x in ("node_modules/", "dist/", ".scratch/", "vendor/")):
                continue
            try:
                text = path.read_text(errors="ignore")
            except OSError:
                continue
            if term not in text:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if term not in line:
                    continue
                stripped = line.strip()
                comment_only = stripped.startswith("//") or stripped.startswith("*")
                hits.append(
                    {
                        "path": rel,
                        "line": i,
                        "text": stripped[:160],
                        "comment_only": comment_only,
                    }
                )
    return hits


@dataclass
class TicketAudit:
    id: str
    title_hint: str = ""
    d1_status: str | None = None
    d1_priority: str | None = None
    d1_subsystem: str | None = None
    doc_path: str | None = None
    consecutive_pass_count: int | None = None
    required_pass_count: int | None = None
    last_gate_ok_at: Any = None
    status_reason: str | None = None
    e2e_passes: list[dict] = field(default_factory=list)
    green_gates: list[dict] = field(default_factory=list)
    git_commits: list[dict] = field(default_factory=list)
    docs_found: list[str] = field(default_factory=list)
    code_present_ok: list[str] = field(default_factory=list)
    code_missing: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    unverified: list[str] = field(default_factory=list)
    verdict: str = "UNVERIFIED"
    next_action: str = ""
    notes: str = ""


def classify(t: TicketAudit) -> None:
    if t.verdict == "MISSING_ROW":
        return
    if t.d1_status is None and t.unverified and any("D1" in u for u in t.unverified):
        # repo-only partial audit
        if t.conflicts:
            t.verdict = "CONFLICT"
            t.next_action = "Resolve code conflicts; re-run with D1 env loaded."
            return
        t.verdict = "UNVERIFIED"
        t.next_action = "Load .env.cloudflare / wrangler and re-run for dual-pass counts."
        return

    if t.d1_status is None:
        t.verdict = "MISSING_ROW"
        t.next_action = "Insert/sync ticket row or fix id typo before dual-pass work."
        return

    if t.conflicts:
        t.verdict = "CONFLICT"
        t.next_action = (
            "Do NOT assert:ticket-shippable. Resolve code/doc conflicts first; "
            "re-run this auditor; then Tier-2 raw pull."
        )
        return

    need = t.required_pass_count if t.required_pass_count and t.required_pass_count > 0 else 2
    need = max(2, int(need))
    have = int(t.consecutive_pass_count or 0)
    proof_n = max(len(t.e2e_passes), len(t.green_gates))

    if t.d1_status == "shipped":
        t.verdict = "ALREADY_SHIPPED"
        t.next_action = "No work — confirm live behavior still matches claim."
        return

    if t.d1_status not in ("in_review", "active", "blocked"):
        t.unverified.append(f"unexpected status={t.d1_status}")

    if have >= need and proof_n >= need:
        t.verdict = "READY_ASSERT"
        t.next_action = (
            f"Independent actor: npm run assert:ticket-shippable -- --ticket={t.id} "
            f"(dry first), then --set-shipped only after Tier-2 raw pull confirmation."
        )
        return

    if proof_n >= 1 or have >= 1:
        t.verdict = "NEED_T2"
        t.next_action = (
            f"Record Tier-2 independent raw pull:\n"
            f"  npm run record:ticket-e2e-pass -- --ticket={t.id} --tier=2 "
            f"--detail='… raw D1 query + row ids …'\n"
            f"Then assert when consecutive>={need} and e2e_pass/gates>={need}."
        )
        return

    t.verdict = "NEED_T1"
    t.next_action = (
        f"Implementer Tier-1 proof missing or not recorded:\n"
        f"  npm run record:ticket-e2e-pass -- --ticket={t.id} --tier=1 "
        f"--detail='… proof ids …'\n"
        f"Keep status in_review/active — do not mark shipped."
    )


def audit_one(ticket_id: str, d1_ok: bool) -> TicketAudit:
    sig = TICKET_SIGNALS.get(ticket_id, {})
    t = TicketAudit(id=ticket_id, title_hint=sig.get("title_hint", ""), notes=sig.get("notes", ""))

    if d1_ok:
        rows, err = d1(
            "SELECT id, title, status, priority, subsystem, doc_path, "
            "consecutive_pass_count, required_pass_count, last_gate_ok_at, status_reason, "
            "updated_at, closed_at "
            f"FROM agentsam_tickets WHERE id = {sql_quote(ticket_id)} LIMIT 1"
        )
        if err:
            t.unverified.append(f"D1 ticket query failed: {err}")
        elif not rows:
            t.verdict = "MISSING_ROW"
            t.next_action = "Ticket id not in agentsam_tickets — sync from plans or insert."
            return t
        else:
            row = rows[0]
            t.d1_status = row.get("status")
            t.d1_priority = row.get("priority")
            t.d1_subsystem = row.get("subsystem")
            t.doc_path = row.get("doc_path")
            t.consecutive_pass_count = int(row.get("consecutive_pass_count") or 0)
            t.required_pass_count = int(row.get("required_pass_count") or 2)
            t.last_gate_ok_at = row.get("last_gate_ok_at")
            t.status_reason = row.get("status_reason")
            if row.get("title"):
                t.title_hint = str(row["title"])

        e2e, e2e_err = d1(
            "SELECT id, detail, commit_sha, created_at FROM agentsam_ticket_events "
            f"WHERE ticket_id = {sql_quote(ticket_id)} AND event_type = 'e2e_pass' "
            "ORDER BY created_at DESC LIMIT 10"
        )
        if e2e_err:
            t.unverified.append(f"e2e_pass query failed: {e2e_err}")
        else:
            t.e2e_passes = e2e or []

        gates, g_err = d1(
            "SELECT id, ok, git_sha, created_at FROM agentsam_gate_runs "
            f"WHERE ticket_id = {sql_quote(ticket_id)} AND ok = 1 "
            "ORDER BY created_at DESC LIMIT 10"
        )
        if g_err:
            t.unverified.append(f"gate_runs query failed: {g_err}")
        else:
            t.green_gates = gates or []
    else:
        t.unverified.append("D1 unavailable — verdict based on repo/git only")

    t.git_commits = git_log_for_ticket(ticket_id)

    if t.doc_path:
        if path_exists(str(t.doc_path)):
            t.docs_found.append(str(t.doc_path))
        else:
            t.conflicts.append(f"doc_path set but missing on disk: {t.doc_path}")

    for p in glob_any(sig.get("doc_globs") or []):
        if p not in t.docs_found:
            t.docs_found.append(p)

    for rel in sig.get("must_present_paths") or []:
        if path_exists(rel):
            t.code_present_ok.append(rel)
        else:
            t.code_missing.append(rel)
            t.conflicts.append(f"expected path missing: {rel}")

    for term in sig.get("must_present") or []:
        out, rc = run(["git", "grep", "-l", term, "--", "src/", "plans/"], timeout=20)
        if rc != 0 or not out:
            t.code_missing.append(term)
            t.unverified.append(f"must_present term not found via git grep: {term}")
        else:
            t.code_present_ok.append(f"{term} → {len(out.splitlines())} files")

    for term in sig.get("conflict_if_present") or []:
        out, rc = run(["git", "grep", "-n", term, "--", "src/"], timeout=20)
        if rc == 0 and out:
            t.conflicts.append(
                f"conflict term still in src/: {term} ({len(out.splitlines())} hits)"
            )

    for term, cfg in (sig.get("conflict_call_sites") or {}).items():
        hits = count_term_in_roots(
            term,
            cfg.get("scan_roots") or ["src/"],
            cfg.get("allow_files") or [],
        )
        real = [h for h in hits if not h.get("comment_only")]
        if real:
            preview = "; ".join(f"{h['path']}:{h['line']}" for h in real[:8])
            more = f" (+{len(real) - 8} more)" if len(real) > 8 else ""
            t.conflicts.append(
                f"live call-site of {term} outside allowlist: {preview}{more}"
            )
        if cfg.get("require_documented_exception"):
            for rel in cfg.get("allow_files") or []:
                path = ROOT / rel
                if not path.is_file():
                    continue
                try:
                    text = path.read_text(errors="ignore")
                except OSError:
                    continue
                # Re-exports of the symbol alone are fine; live *calls* need the marker.
                if f"{term}(" not in text:
                    continue
                if "DOCUMENTED_EXCEPTION" not in text:
                    t.conflicts.append(
                        f"{rel} calls {term}(…) but lacks DOCUMENTED_EXCEPTION marker"
                    )

    if t.d1_status == "in_review" and not t.git_commits and not t.e2e_passes:
        t.unverified.append(
            "in_review but no git --grep hits and no e2e_pass events — "
            "implementation claim is narrative until Tier-1 proof ids exist"
        )

    if len(t.e2e_passes) >= 2:
        ts = [int(e.get("created_at") or 0) for e in t.e2e_passes[:2]]
        if ts[0] and ts[1] and abs(ts[0] - ts[1]) < 60:
            t.conflicts.append(
                f"two e2e_pass events within 60s ({ts}) — likely same-actor double-stamp; "
                "dual-pass requires separate moments + independent Tier-2"
            )

    classify(t)
    return t


def cluster_d1_snapshot(d1_ok: bool) -> dict[str, Any]:
    out: dict[str, Any] = {"observed_at": NOW_ISO}
    if not d1_ok:
        out["error"] = "D1 unavailable"
        return out

    rows, err = d1(
        "SELECT status, COUNT(*) AS n FROM agentsam_tickets "
        "WHERE priority IN ('P0','p0','0') OR id LIKE 'tkt_p0_%' OR id LIKE 'tkt_routing%' "
        "OR id LIKE 'tkt_classification%' OR id LIKE 'tkt_intent%' OR id LIKE 'tkt_image%' "
        "OR id LIKE 'tkt_closed_loop%' OR id LIKE 'tkt_telemetry%' OR id LIKE 'tkt_finding%' "
        "GROUP BY status"
    )
    out["p0ish_by_status"] = rows if rows is not None else err

    kw, kw_err = d1(
        "SELECT purpose, COUNT(*) AS n, SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active_n "
        "FROM agentsam_classification_keywords GROUP BY purpose ORDER BY n DESC LIMIT 30"
    )
    out["classification_keywords_by_purpose"] = kw if kw is not None else kw_err

    dec, dec_err = d1(
        "SELECT matched_by, COUNT(*) AS n FROM agentsam_intent_decisions "
        "WHERE created_at > unixepoch() - 7*24*3600 "
        "GROUP BY matched_by ORDER BY n DESC LIMIT 20"
    )
    out["intent_decisions_7d_by_matched_by"] = dec if dec is not None else dec_err

    spine, spine_err = d1(
        "SELECT COUNT(*) AS n FROM agentsam_intent_decisions "
        "WHERE created_at > unixepoch() - 7*24*3600 "
        "AND (metadata_json LIKE '%turn-decision-v1%' OR metadata_json LIKE '%\"spine\"%')"
    )
    out["intent_decisions_7d_spine_ish"] = spine if spine is not None else spine_err

    return out


def render_md(audits: list[TicketAudit], cluster: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# P0 in_review closeout audit — {NOW_ISO}")
    lines.append("")
    lines.append("**Read-only.** Does not ship tickets. Dual-pass law: Tier 1 ≠ shipped.")
    lines.append("")
    lines.append("## Verdict legend")
    lines.append("")
    lines.append("| Verdict | Meaning |")
    lines.append("|---------|---------|")
    lines.append("| READY_ASSERT | Counts + proof rows look dual-pass ready — still need independent T2 judgment |")
    lines.append("| NEED_T2 | Some proof exists; needs independent raw pull |")
    lines.append("| NEED_T1 | No usable e2e_pass / green gate yet |")
    lines.append("| CONFLICT | Code/git/D1 disagree with 'done' claim — fix before assert |")
    lines.append("| MISSING_ROW | Ticket id not in D1 |")
    lines.append("| UNVERIFIED | Incomplete data |")
    lines.append("")

    by_v: dict[str, list[TicketAudit]] = {}
    for a in audits:
        by_v.setdefault(a.verdict, []).append(a)

    lines.append("## Summary")
    lines.append("")
    for v, items in sorted(by_v.items(), key=lambda x: (-len(x[1]), x[0])):
        lines.append(f"- **{v}**: {len(items)} — " + ", ".join(i.id for i in items))
    lines.append("")

    lines.append("## Cheapest next moves (ordered)")
    lines.append("")
    order = [
        "CONFLICT",
        "MISSING_ROW",
        "READY_ASSERT",
        "NEED_T2",
        "NEED_T1",
        "UNVERIFIED",
        "ALREADY_SHIPPED",
    ]
    n = 1
    for v in order:
        for a in by_v.get(v, []):
            lines.append(f"{n}. `{a.id}` → **{a.verdict}**")
            lines.append(f"   - {a.next_action.splitlines()[0]}")
            n += 1
    lines.append("")

    lines.append("## Per-ticket detail")
    lines.append("")
    for a in audits:
        lines.append(f"### `{a.id}` — {a.verdict}")
        lines.append("")
        lines.append(f"- hint: {a.title_hint or '—'}")
        lines.append(
            f"- D1: status=`{a.d1_status}` priority=`{a.d1_priority}` "
            f"subsystem=`{a.d1_subsystem}` passes=`{a.consecutive_pass_count}/{a.required_pass_count}`"
        )
        lines.append(f"- doc_path: `{a.doc_path or '—'}`")
        lines.append(
            f"- e2e_pass events: {len(a.e2e_passes)} — ids: "
            f"{[e.get('id') for e in a.e2e_passes[:5]]}"
        )
        lines.append(
            f"- green gates: {len(a.green_gates)} — ids: "
            f"{[g.get('id') for g in a.green_gates[:5]]}"
        )
        lines.append(f"- git --grep commits: {len(a.git_commits)}")
        for c in a.git_commits[:5]:
            lines.append(f"  - `{c['sha']}` {c['subject']}")
        if a.docs_found:
            lines.append(f"- docs: {', '.join(f'`{d}`' for d in a.docs_found[:8])}")
        if a.code_present_ok:
            lines.append(f"- code OK signals: {a.code_present_ok[:6]}")
        if a.code_missing:
            lines.append(f"- code MISSING: {a.code_missing}")
        if a.conflicts:
            lines.append("- **CONFLICTS:**")
            for c in a.conflicts:
                lines.append(f"  - {c}")
        if a.unverified:
            lines.append("- **UNVERIFIED:**")
            for u in a.unverified:
                lines.append(f"  - {u}")
        if a.notes:
            lines.append(f"- notes: {a.notes}")
        lines.append(f"- **next:** {a.next_action}")
        lines.append("")

    lines.append("## Cluster D1 snapshot (primary facts)")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(cluster, indent=2, default=str)[:12000])
    lines.append("```")
    lines.append("")
    lines.append("## Do not waste effort on")
    lines.append("")
    lines.append("- Starting new Images Media Library work to 'unblock' these P0s — they are unrelated.")
    lines.append("- Marking shipped after one happy-path chat or one deploy.")
    lines.append("- Re-implementing routing spine when verdict is NEED_T2 (proof recording, not rewrite).")
    lines.append("- Believing implementer summaries without raw D1 pulls (Tier-2 actor ≠ Tier-1).")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Read-only P0 in_review closeout auditor")
    ap.add_argument("--dry-run", action="store_true", help="Print MD to stdout; write nothing")
    ap.add_argument("--json", action="store_true", help="Emit JSON on stdout")
    ap.add_argument("--ticket", action="append", default=[], help="Limit to ticket id(s)")
    ap.add_argument(
        "--cluster",
        choices=["closeout", "all"],
        default="closeout",
        help="closeout=8 in_review targets; all=+ reliability/sibling P0s",
    )
    args = ap.parse_args()

    ids = list(IN_REVIEW_CLOSEOUT)
    if args.cluster == "all":
        ids = ids + [t for t in RELIABILITY_AND_SIBLINGS if t not in ids]
    if args.ticket:
        ids = args.ticket

    cf = load_cf_env()
    d1_ok = bool(cf)
    if d1_ok:
        probe, err = d1("SELECT 1 AS ok")
        if probe is None:
            print(f"[warn] D1 probe failed: {err}", file=sys.stderr)
            d1_ok = False

    print(
        f"[audit] tickets={len(ids)} d1={'ok' if d1_ok else 'unavailable'} @ {NOW_ISO}",
        file=sys.stderr,
    )

    audits = [audit_one(tid, d1_ok) for tid in ids]
    cluster = cluster_d1_snapshot(d1_ok)
    md = render_md(audits, cluster)
    payload = {
        "observed_at": NOW_ISO,
        "cluster": args.cluster,
        "tickets": [asdict(a) for a in audits],
        "d1_snapshot": cluster,
        "law": "rule_ticket_dual_pass_e2e — deploy ≠ pass; T1≠T2; control-plane may need T3",
    }

    if args.dry_run or args.json:
        if args.json:
            print(json.dumps(payload, indent=2, default=str))
        else:
            print(md)
    else:
        SCRATCH.mkdir(parents=True, exist_ok=True)
        OUT_MD.write_text(md)
        OUT_JSON.write_text(json.dumps(payload, indent=2, default=str))
        print(f"[audit] wrote {OUT_MD.relative_to(ROOT)}", file=sys.stderr)
        print(f"[audit] wrote {OUT_JSON.relative_to(ROOT)}", file=sys.stderr)
        for a in audits:
            print(f"{a.verdict:16}  {a.id}")

    bad = [a for a in audits if a.verdict in ("CONFLICT", "MISSING_ROW")]
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
