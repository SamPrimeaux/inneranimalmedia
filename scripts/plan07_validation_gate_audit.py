#!/usr/bin/env python3
"""
scripts/plan07_validation_gate_audit.py
========================================
Plan 7 — Validation as a ship gate

Audit questions:
  1. Does scripts/verify_dashboard_asset_integrity.py exist and pass?
  2. Are plan tasks marked done without Playwright/validation proof in output_summary?
  3. What docs/rules mandate validation vs what CI actually enforces?
  4. Does package.json have a validate:deploy script?

Usage:
    python3 scripts/plan07_validation_gate_audit.py [--no-d1] [--strict]
"""

import sys, json, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from plan_audit_common import (
    add_base_args, config_from_args, finding, grep_repo,
    safe_d1_query, build_report_payload, write_plan_report,
    section, ok, warn, err, dim,
)

PLAN_ID   = 7
PLAN_SLUG = "validation_gate"

SQL = {
    "done_tasks_no_proof": """
        SELECT id, status, output_summary, completed_at
        FROM agentsam_plan_tasks
        WHERE status = 'done'
          AND plan_id = 'plan_may14_2026_repair'
        ORDER BY completed_at DESC LIMIT 20;
    """,
    "plan_tasks_schema": "PRAGMA table_info(agentsam_plan_tasks);",
}

# Validation keywords we expect to see in output_summary for a done task
PROOF_KEYWORDS = ["playwright", "screenshot", "verify_dashboard", "chunk", "asset_integrity", "console"]

CODE_TERMS = [
    ("health_only_false_success",  r"HEALTH_ONLY_FALSE_SUCCESS",            "info"),
    ("r2_chunk_404",               r"R2_CHUNK_404|chunk.*404|404.*chunk",   "info"),
    ("blank_screen_flag",          r"BLANK_SCREEN",                         "info"),
    ("playwright_in_scripts",      r"playwright",                           "info"),
    ("verify_asset_integrity",     r"verify_dashboard_asset_integrity",     "info"),
    ("validate_deploy_script",     r"validate:deploy",                      "info"),
    ("plan_task_done_write",       r"status.*['\"]done['\"]|['\"]done['\"].*status", "info"),
]

# Files that must exist for Plan 7 to pass
REQUIRED_FILES = [
    "scripts/verify_dashboard_asset_integrity.py",
    ".cursor/rules/agentsam-d1-cursor-session-sync.mdc",
]

# Optional but strongly recommended
RECOMMENDED_FILES = [
    "scripts/validate_deploy.sh",
    "docs/agentsam_knowledge/dashboard_r2_asset_deploy_tactics.md",
]


def check_file(repo: Path, rel_path: str) -> tuple[bool, str]:
    p = repo / rel_path
    exists = p.exists()
    size   = p.stat().st_size if exists else 0
    return exists, f"{'exists' if exists else 'MISSING'}  ({size} bytes)" if exists else "MISSING"


def check_package_json(repo: Path) -> dict:
    pkg = repo / "package.json"
    if not pkg.exists():
        return {"found": False}
    try:
        data = json.loads(pkg.read_text())
        scripts = data.get("scripts", {})
        return {
            "found": True,
            "validate_deploy": "validate:deploy" in scripts,
            "test": "test" in scripts,
            "deploy": "deploy" in scripts,
            "deploy_full": "deploy:full" in scripts,
            "scripts": list(scripts.keys()),
        }
    except Exception:
        return {"found": True, "parse_error": True}


def run_verify_asset_script(repo: Path) -> tuple[bool, str]:
    """Try running verify_dashboard_asset_integrity.py --dry-run if it exists."""
    script = repo / "scripts/verify_dashboard_asset_integrity.py"
    if not script.exists():
        return False, "script not found"
    try:
        result = subprocess.run(
            [sys.executable, str(script), "--dry-run"],
            capture_output=True, text=True, timeout=30, cwd=str(repo),
        )
        return result.returncode == 0, result.stdout[:300] + result.stderr[:200]
    except Exception as e:
        return False, str(e)


def run_audit(cfg, skip_d1: bool) -> list[dict]:
    findings = []
    repo = Path(cfg.get("repo_root", "."))

    # ── Required file checks ────────────────────────────────────────────────
    section("File existence — required validation scripts")
    for rel in REQUIRED_FILES:
        exists, note = check_file(repo, rel)
        icon = "✅" if exists else "🔴"
        print(f"  {icon} {rel:<55} {note}")
        if not exists:
            findings.append(finding(
                severity="blocker",
                category="code",
                title=f"Required validation file missing: {rel}",
                evidence=f"Path does not exist: {repo / rel}",
                suggestion=f"Create {rel}. See Plan 7 guide for minimum implementation.",
                targets=[rel],
            ))

    section("File existence — recommended")
    for rel in RECOMMENDED_FILES:
        exists, note = check_file(repo, rel)
        icon = "✅" if exists else "⚠️ "
        print(f"  {icon} {rel:<55} {note}")
        if not exists:
            findings.append(finding(
                severity="warning",
                category="code",
                title=f"Recommended validation file missing: {rel}",
                evidence=f"Path: {repo / rel}",
                suggestion=f"Create {rel}.",
                targets=[rel],
            ))

    # ── package.json scripts ─────────────────────────────────────────────────
    section("package.json — validate:deploy script")
    pkg = check_package_json(repo)
    if pkg.get("found"):
        has_validate = pkg.get("validate_deploy", False)
        icon = "✅" if has_validate else "⚠️ "
        print(f"  {icon} validate:deploy  {'present' if has_validate else 'ABSENT'}")
        print(f"  available scripts: {pkg.get('scripts', [])[:12]}")
        if not has_validate:
            findings.append(finding(
                severity="warning",
                category="code",
                title="No validate:deploy script in package.json",
                evidence=f"Scripts: {pkg.get('scripts',[])}",
                suggestion=(
                    'Add to package.json scripts: "validate:deploy": '
                    '"python3 scripts/verify_dashboard_asset_integrity.py && npx playwright test --grep deploy"'
                ),
                targets=["package.json"],
            ))
    else:
        err("package.json not found")

    # ── Run asset integrity script ───────────────────────────────────────────
    section("Run verify_dashboard_asset_integrity.py --dry-run")
    passed, output = run_verify_asset_script(repo)
    icon = "✅" if passed else "⚠️ "
    print(f"  {icon} {'passed' if passed else 'failed/not runnable'}")
    if output:
        dim(f"  {output[:200]}")
    if not passed:
        findings.append(finding(
            severity="warning",
            category="code",
            title="verify_dashboard_asset_integrity.py did not pass dry-run",
            evidence=output[:300],
            suggestion="Fix script to return exit 0 on a healthy deploy state.",
            targets=["scripts/verify_dashboard_asset_integrity.py"],
        ))

    # ── D1 done tasks without proof ─────────────────────────────────────────
    if not skip_d1:
        section("D1 — plan tasks marked done without validation proof")
        try:
            tasks = safe_d1_query(cfg, SQL["done_tasks_no_proof"])
            no_proof = []
            for t in tasks:
                summary = (t.get("output_summary") or "").lower()
                has_proof = any(kw in summary for kw in PROOF_KEYWORDS)
                icon = "✅" if has_proof else "🔴"
                print(f"  {icon} {t['id']:<40} proof={'yes' if has_proof else 'NO'}")
                if not has_proof:
                    no_proof.append(t["id"])

            if no_proof:
                findings.append(finding(
                    severity="warning",
                    category="d1",
                    title=f"{len(no_proof)} plan task(s) marked done without validation proof in output_summary",
                    evidence=f"Task IDs: {no_proof[:5]}",
                    suggestion=(
                        f"output_summary must contain one of: {PROOF_KEYWORDS}. "
                        "Add Playwright or asset-integrity result before setting status=done."
                    ),
                    targets=[f"agentsam_plan_tasks:{t}" for t in no_proof[:3]],
                ))
            else:
                ok(f"All {len(tasks)} done tasks have validation proof in output_summary")
        except Exception as e:
            dim(f"  plan_tasks query skipped: {e}")

    # ── Code grep ────────────────────────────────────────────────────────────
    section("Code grep — validation flag usage")
    for label, pattern, sev in CODE_TERMS:
        hits  = grep_repo(cfg, pattern)
        count = len(hits)
        icon  = "⚠️ " if (label in ("health_only_false_success","r2_chunk_404") and count == 0) else "ℹ️ "
        print(f"  {icon} {label:<40} {count:>3} hits")

        if label == "playwright_in_scripts" and count == 0:
            findings.append(finding(
                severity="warning",
                category="code",
                title="No Playwright usage found in scripts/",
                evidence="Zero hits for 'playwright' in scan scope",
                suggestion="Add Playwright test for /dashboard/agent (load, no console errors, tool trace visible).",
                targets=["scripts/", "package.json"],
            ))

    return findings


def main():
    p    = add_base_args(f"Plan {PLAN_ID} — validation gate audit")
    args = p.parse_args()
    cfg  = config_from_args(args)
    skip = getattr(args, "no_d1", False)

    print(f"\n{'═'*65}")
    print(f"  PLAN {PLAN_ID} AUDIT — {PLAN_SLUG.upper().replace('_',' ')}")
    print(f"{'═'*65}\n")

    findings = run_audit(cfg, skip)
    payload  = build_report_payload(PLAN_ID, PLAN_SLUG, cfg, findings)
    write_plan_report(PLAN_ID, PLAN_SLUG, cfg, payload)

    blockers = payload["summary"]["blocker_count"]
    warnings = payload["summary"]["warning_count"]
    print(f"\n  blockers={blockers}  warnings={warnings}  pass={payload['summary']['pass']}")
    if getattr(args, "strict", False) and blockers:
        sys.exit(1)


if __name__ == "__main__":
    main()
