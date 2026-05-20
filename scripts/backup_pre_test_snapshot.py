#!/usr/bin/env python3
"""
One-off pre-test filesystem backup. Safe to delete after Anthropic/routing tests pass.

Usage (repo root):
  python3 scripts/backup_pre_test_snapshot.py

Output:
  artifacts/pre_test_backup/<ISO8601>/
  artifacts/pre_test_backup/LATEST -> symlink to latest run
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO / "artifacts" / "pre_test_backup"

# Paths relative to repo root — Agent Sam routing / quickstart / ETO slice
BACKUP_PATHS = [
    "src/api/agent.js",
    "src/core/performance-eto.js",
    "src/core/routing.js",
    "src/core/thompson.js",
    "src/core/agent-run-routing.js",
    "src/core/error-log-escalation.js",
    "src/core/agent-quickstart-templates.js",
    "src/core/eval-runner.js",
    "src/core/routing-cron.js",
    "src/core/agentsam-error-log.js",
    "src/cron/jobs/midnight-utc.js",
    "src/cron/jobs/thirty-minute-cron.js",
    "dashboard/App.tsx",
    "dashboard/agentChatConstants.ts",
    "dashboard/components/AgentQuickstartPage.tsx",
    "dashboard/components/WorkspaceDashboard.tsx",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/lib/agentRoutes.ts",
    "migrations/350_agentsam_performance_eto_events.sql",
    "migrations/351_reset_synthetic_routing_arm_priors.sql",
    "migrations/352_seed_quickstart_platform_subagents.sql",
    "migrations/353_anthropic_team_phase1_routing_seed.sql",
    "docs/agentsam_knowledge/anthropic_team_test_flows.md",
    "docs/agentsam_knowledge/chat_assistant_quickstart_flow.md",
    "docs/agentsam_knowledge/thompson_routing_repair.md",
    "docs/agentsam_knowledge/performance_eto_events.md",
    "docs/agentsam_knowledge/d1_supabase_routing_mirror.md",
    "docs/agentsam_knowledge/error_log_escalation_health.md",
]


def git_head() -> dict:
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=REPO, text=True
        ).strip()
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=REPO, text=True
        ).strip()
        subject = subprocess.check_output(
            ["git", "log", "-1", "--format=%s"], cwd=REPO, text=True
        ).strip()
        return {"sha": sha, "branch": branch, "subject": subject}
    except subprocess.CalledProcessError:
        return {}


def main() -> int:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = OUT_ROOT / ts
    dest.mkdir(parents=True, exist_ok=True)

    copied: list[str] = []
    missing: list[str] = []
    for rel in BACKUP_PATHS:
        src = REPO / rel
        if not src.is_file():
            missing.append(rel)
            continue
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        copied.append(rel)

    manifest = {
        "created_at": ts,
        "repo": str(REPO),
        "git": git_head(),
        "copied": copied,
        "missing": missing,
        "note": "Delete artifacts/pre_test_backup/ after tests pass.",
    }
    (dest / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    latest = OUT_ROOT / "LATEST"
    if latest.exists() or latest.is_symlink():
        latest.unlink()
    latest.symlink_to(ts, target_is_directory=True)

    print(f"Backup written: {dest}")
    print(f"  files: {len(copied)} copied, {len(missing)} missing")
    if missing:
        print("  missing:", ", ".join(missing))
    print(f"  manifest: {dest / 'MANIFEST.json'}")
    print(f"  latest:   {latest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
