#!/usr/bin/env python3
"""
fix_deploy_pipeline.py — maintenance / recovery (not used in CI).

Historically this script:
1. Ensures deploy email HTML is built via scripts/build-deploy-email-html.mjs (not giant inline jq).
2. Sets package.json deploy:full to skip R2 reconcile by default; adds deploy:full:reconcile for opt-in inventory.
3. Updates deploy-full.sh header comments accordingly.
4. Replaces the old inline NOTIFY_JSON jq block in deploy-frontend.sh when that pattern still exists.
5. Removes hardcoded workspace/tenant/user fallbacks in post-deploy-memory-sync.sh when those lines still exist.

On current main, steps 1–3 are usually already applied. The script remains for forks, cherry-picks, or drift repair.

Usage (repo root):
  python3 scripts/maintenance/fix_deploy_pipeline.py           # dry-run: report only
  python3 scripts/maintenance/fix_deploy_pipeline.py --apply   # write changes (review diff first)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def rp(rel: str) -> Path:
    return ROOT / rel


def read(rel: str) -> str:
    return rp(rel).read_text(encoding="utf-8")


def write(rel: str, src: str) -> None:
    rp(rel).write_text(src, encoding="utf-8", newline="\n")


def patch(rel: str, old: str, new: str, label: str) -> bool:
    p = rp(rel)
    src = p.read_text(encoding="utf-8")
    n = src.count(old)
    if n == 0:
        print(f"  WARN  no match: {label}")
        return False
    p.write_text(src.replace(old, new), encoding="utf-8", newline="\n")
    print(f"  PATCH ({n}): {label}")
    return True


def dry_run_report() -> list[str]:
    notes: list[str] = []
    email = rp("scripts/build-deploy-email-html.mjs")
    if not email.is_file():
        notes.append("MISSING: scripts/build-deploy-email-html.mjs (required for rich deploy email path)")
    else:
        notes.append("OK: scripts/build-deploy-email-html.mjs present")

    pkg_path = rp("package.json")
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    scripts = pkg.get("scripts", {})
    dfull = scripts.get("deploy:full", "")
    if "SKIP_R2_DEPLOY_RECONCILE" in dfull:
        notes.append("OK: package.json deploy:full uses SKIP_R2_DEPLOY_RECONCILE")
    else:
        notes.append("DRIFT: package.json deploy:full may not match safe R2 default — --apply would rewrite")

    if "deploy:full:reconcile" in scripts:
        notes.append("OK: package.json has deploy:full:reconcile")
    else:
        notes.append("DRIFT: package.json missing deploy:full:reconcile — --apply would add")

    fe = read("scripts/deploy-frontend.sh")
    if "build-deploy-email-html.mjs" in fe and "NOTIFY_JSON" in fe:
        notes.append("OK: deploy-frontend.sh references build-deploy-email-html.mjs")
    else:
        notes.append("CHECK: deploy-frontend.sh notify path may differ from script templates — inspect manually")

    pms = read("scripts/post-deploy-memory-sync.sh")
    if 'WORKSPACE_ID="${1:-ws_inneranimalmedia}"' in pms:
        notes.append("DRIFT: post-deploy-memory-sync.sh still has hardcoded ws_inneranimalmedia fallback")
    elif "WORKSPACE_ID=" in pms:
        notes.append("OK: post-deploy-memory-sync.sh workspace line likely env-driven")

    return notes


def run_apply() -> int:
    src_email = rp("scripts/build-deploy-email-html.mjs")
    if not src_email.is_file():
        print("ERROR: scripts/build-deploy-email-html.mjs must exist before applying patches.")
        return 1

    pkg_path = rp("package.json")
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    scripts = pkg.setdefault("scripts", {})
    scripts["deploy:full"] = "SKIP_R2_DEPLOY_RECONCILE=1 ./scripts/deploy-full.sh"
    scripts["deploy:full:safe"] = "npm run deploy:full"
    scripts["deploy:full:reconcile"] = "ALLOW_UNSAFE_R2_RECONCILE=1 ./scripts/deploy-full.sh"
    pkg["scripts"] = scripts
    pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
    print("  PATCH: package.json — deploy:full / :safe / :reconcile")

    patch(
        "scripts/deploy-full.sh",
        "#   Full pipeline (~several min):  npm run deploy:full:safe",
        "#   Full pipeline (~several min):  npm run deploy:full\n"
        "#   Full pipeline + R2 inventory:  npm run deploy:full:reconcile",
        "deploy-full.sh — update header comment",
    )

    OLD_NOTIFY = '''echo "→ Sending deploy notification (POST /api/email/send) → ${_NOTIFY_TO} ..."
NOTIFY_JSON="$(jq -n \\
  --arg to "${_NOTIFY_TO}" \\
  --arg actor "${_DEPLOY_ACTOR}" \\
  --arg env "$DEPLOY_ENV" \\
  --arg br "$BRANCH_NAME" \\
  --arg wv "$_WV_DISP" \\
  --arg sha "$_SHA_DISP" \\
  --arg msg "$_MSG_DISP" \\
  --arg envl "$_ENV_DISP" \\
  --arg by "$_BY_DISP" \\
  --arg dur "$DEPLOY_DURATION_MS" \\
  --arg started "$DEPLOY_STARTED_AT" \\
  --arg aim "$_AI_MODEL" \\
  --arg aiti "$_AI_TIN" \\
  --arg aito "$_AI_TOUT" \\
  --arg aic "$_AI_COST_FMT" \\
  --arg fc "$FILE_COUNT" \\
  --arg kb "$TOTAL_KB" \\
  --arg gh "$GIT_HASH" \\'''

    NEW_NOTIFY = '''echo "→ Sending deploy notification (POST /api/email/send) → ${_NOTIFY_TO} ..."
NOTIFY_HTML="$(
  WORKER_VERSION_ID="${WORKER_VERSION_ID:-}" \\
  GIT_FULL_SHA="${GIT_FULL_SHA:-}" \\
  GIT_SHORT_HASH="${GIT_HASH:-}" \\
  GIT_MSG_LINE="${GIT_MSG_LINE:-}" \\
  BRANCH_NAME="${BRANCH_NAME:-}" \\
  DEPLOY_ENV="${DEPLOY_ENV:-production}" \\
  DEPLOYED_BY="${DEPLOYED_BY:-sam_primeaux}" \\
  DEPLOY_STARTED_AT="${DEPLOY_STARTED_AT:-}" \\
  DEPLOY_DURATION_MS="${DEPLOY_DURATION_MS:-0}" \\
  R2_SYNC_STATUS="${R2_SYNC_STATUS:-passed}" \\
  FILE_COUNT="${FILE_COUNT:-}" \\
  TOTAL_KB="${TOTAL_KB:-}" \\
  NOTIFY_TO="${_NOTIFY_TO}" \\
  node "$REPO_ROOT/scripts/build-deploy-email-html.mjs"
)"
NOTIFY_JSON="$(jq -n \\
  --arg to "${_NOTIFY_TO}" \\
  --arg subj "Agent Sam Deployed — ${DEPLOY_ENV:-production} [${BRANCH_NAME:-main}] ${GIT_HASH:-}" \\
  --arg html "$NOTIFY_HTML" \\'''

    frontend_path = rp("scripts/deploy-frontend.sh")
    frontend = frontend_path.read_text(encoding="utf-8")

    if OLD_NOTIFY in frontend:
        frontend = frontend.replace(OLD_NOTIFY, NEW_NOTIFY, 1)
        old_jq_body = """  '{
    to: $to,
    subject: ("✓ Agent Sam Deployed — " + $env + " [" + $br + "]"),
    html: (
      "<!DOCTYPE html><html><head><meta charset=\\"utf-8\\"/><meta name=\\"viewport\\" content=\\"width=device-width,initial-scale=1\\"/></head>" +"""
        new_jq_body = """  '{to: $to, subject: $subj, html: $html}')"
# Notification should never block deploy success; treat failures as warnings."""

        if old_jq_body in frontend:
            start = frontend.index(old_jq_body)
            end_marker = "}')\""
            end = frontend.index(end_marker, start) + len(end_marker)
            frontend = frontend[:start] + new_jq_body + frontend[end:]
            frontend_path.write_text(frontend, encoding="utf-8", newline="\n")
            print("  PATCH: deploy-frontend.sh — replaced inline HTML with build-deploy-email-html.mjs")
        else:
            frontend_path.write_text(frontend, encoding="utf-8", newline="\n")
            print("  PATCH: deploy-frontend.sh — partial patch (jq body not matched — manual cleanup may be needed)")
    else:
        print("  WARN: deploy-frontend.sh notify block not matched exactly — likely already migrated; skip")

    patch(
        "scripts/post-deploy-memory-sync.sh",
        'WORKSPACE_ID="${1:-ws_inneranimalmedia}"',
        'WORKSPACE_ID="${WORKSPACE_ID:-${1:-}}"',
        "post-deploy-memory-sync.sh — env-driven workspace",
    )
    patch(
        "scripts/post-deploy-memory-sync.sh",
        'TENANT_ID="${2:-tenant_sam_primeaux}"',
        'TENANT_ID="${TENANT_ID:-${2:-}}"',
        "post-deploy-memory-sync.sh — env-driven tenant",
    )
    patch(
        "scripts/post-deploy-memory-sync.sh",
        'USER_ID="${3:-usr_sam_iam}"',
        'USER_ID="${USER_ID:-${3:-}}"',
        "post-deploy-memory-sync.sh — env-driven user",
    )

    print(
        """
Done (--apply). Review with git diff, then commit if appropriate.
  npm run deploy:full            → standard deploy (safe, no R2 inventory)
  npm run deploy:full:reconcile  → deploy + full R2 manifest/inventory (opt-in)
"""
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Recover / align deploy pipeline files (historical one-shot).")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Default is dry-run (report only, no writes).",
    )
    args = parser.parse_args()

    if os.getcwd() != str(ROOT):
        print(f"WARN: cwd is {os.getcwd()!r}; expected repo root {ROOT}. Chdir or run from repo root.", file=sys.stderr)

    print("fix_deploy_pipeline.py — status\n")
    for line in dry_run_report():
        print(f"  {line}")

    if not args.apply:
        print("\nDry-run complete (no files modified). Pass --apply to perform mutations.")
        return 0

    print("\n--apply: writing files…\n")
    return run_apply()


if __name__ == "__main__":
    raise SystemExit(main())
