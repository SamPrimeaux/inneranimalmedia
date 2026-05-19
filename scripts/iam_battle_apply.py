#!/usr/bin/env python3
"""
iam_battle_apply.py
===================
Reads scripts/battle_results/battle_full.json, backs up affected files,
applies the winning model's patches, commits to git, and deploys.

Usage:
  ./scripts/with-cloudflare-env.sh python3 scripts/iam_battle_apply.py

  # Dry run — show what would change, no file writes:
  DRY_RUN=1 ./scripts/with-cloudflare-env.sh python3 scripts/iam_battle_apply.py

  # Skip deploy (just commit):
  SKIP_DEPLOY=1 ./scripts/with-cloudflare-env.sh python3 scripts/iam_battle_apply.py
"""

import os
import re
import sys
import json
import shutil
import subprocess
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.cloudflare")
load_dotenv(Path(__file__).parent.parent / ".env")

REPO_ROOT    = Path(__file__).parent.parent.resolve()
RESULTS_FILE = REPO_ROOT / "scripts" / "battle_results" / "battle_full.json"
BACKUP_DIR   = REPO_ROOT / "scripts" / "battle_results" / "backups" / datetime.now().strftime("%Y%m%d_%H%M%S")
DRY_RUN      = os.getenv("DRY_RUN",      "0") == "1"
SKIP_DEPLOY  = os.getenv("SKIP_DEPLOY",  "0") == "1"

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def run(cmd: list, cwd=None) -> tuple[int, str, str]:
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd or REPO_ROOT)
    return r.returncode, r.stdout.strip(), r.stderr.strip()


def backup_file(path: Path):
    if not path.exists(): return
    dest = BACKUP_DIR / path.relative_to(REPO_ROOT)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)
    log(f"  backed up → {dest.relative_to(REPO_ROOT)}")


def extract_file_paths(patch_text: str) -> list[str]:
    """Pull file paths from diff headers like +++ b/src/api/agent.js"""
    paths = []
    for line in patch_text.splitlines():
        if line.startswith("+++ b/") or line.startswith("--- b/"):
            p = line[6:].strip()
            if p and p != "/dev/null":
                paths.append(p)
        elif line.startswith("+++ ") or line.startswith("--- "):
            p = line[4:].strip()
            if p and p != "/dev/null" and not p.startswith("a/") and not p.startswith("b/"):
                paths.append(p)
    return list(dict.fromkeys(paths))  # dedupe, preserve order


def apply_patch(patch_text: str) -> tuple[bool, str]:
    """Write patch to temp file and apply with `patch -p1`."""
    if not patch_text.strip() or "@@" not in patch_text:
        return False, "No valid diff hunks found"

    patch_file = REPO_ROOT / "scripts" / "battle_results" / "_current.patch"
    patch_file.write_text(patch_text)

    code, out, err = run(["patch", "-p1", "--dry-run", "-i", str(patch_file)])
    if code != 0:
        return False, f"Patch dry-run failed: {err or out}"

    if DRY_RUN:
        log("  [DRY RUN] patch would apply cleanly")
        patch_file.unlink(missing_ok=True)
        return True, "dry-run OK"

    code, out, err = run(["patch", "-p1", "-i", str(patch_file)])
    patch_file.unlink(missing_ok=True)
    if code != 0:
        return False, f"Patch apply failed: {err or out}"
    return True, out


def git_status_clean() -> bool:
    code, out, _ = run(["git", "diff", "--name-only"])
    staged_code, staged_out, _ = run(["git", "diff", "--cached", "--name-only"])
    # It's OK to have staged changes (our patches), we just want no conflicts
    return True  # always proceed, let git tell us if something is wrong


def git_add_commit(files: list[str], message: str) -> bool:
    if DRY_RUN:
        log(f"  [DRY RUN] would commit: {message}")
        return True
    for f in files:
        run(["git", "add", f])
    code, out, err = run(["git", "commit", "-m", message])
    if code != 0:
        log(f"  [GIT ERROR] {err or out}")
        return False
    log(f"  committed: {out.splitlines()[0] if out else 'ok'}")
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log("IAM Battle Apply")

    if not RESULTS_FILE.exists():
        log(f"[ERROR] {RESULTS_FILE} not found — run iam_model_battle.py first")
        sys.exit(1)

    results = json.loads(RESULTS_FILE.read_text())
    log(f"Loaded {len(results)} plan results")

    # Git status check
    code, out, _ = run(["git", "status", "--short"])
    log(f"Git status: {out or 'clean'}")

    if not DRY_RUN:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        log(f"Backup dir: {BACKUP_DIR.relative_to(REPO_ROOT)}")

    all_changed_files = []
    apply_summary     = []

    for result in results:
        plan_id    = result["plan_id"]
        plan_title = result["plan_title"]
        winner     = result["winner"].lower()  # "gpt" or "gemini"
        patch_text = result[winner]["output"]
        model_name = result[winner]["model"]
        score      = result[winner]["score"]["score"]

        log(f"\n── {plan_title}")
        log(f"   Winner: {winner.upper()} ({model_name}) score={score}/6")

        # Skip if no real diff
        if "@@" not in patch_text:
            log(f"   [SKIP] No valid diff in winning output")
            apply_summary.append({"plan": plan_title, "status": "skipped", "reason": "no diff"})
            continue

        # Extract affected files for backup
        file_paths = extract_file_paths(patch_text)
        if not file_paths:
            # Fall back to scanning patch for known file extensions
            file_paths = re.findall(r'(?:src|dashboard)/[\w/.-]+\.(?:tsx?|jsx?|js|py)', patch_text)

        log(f"   Files in patch: {file_paths or 'auto-detect'}")

        # Backup
        for fp in file_paths:
            abs_path = REPO_ROOT / fp
            if abs_path.exists() and not DRY_RUN:
                backup_file(abs_path)

        # Apply patch
        ok, msg = apply_patch(patch_text)
        if ok:
            log(f"   ✓ Patch applied")
            all_changed_files.extend(file_paths)
            apply_summary.append({"plan": plan_title, "status": "applied", "files": file_paths, "model": model_name})
        else:
            log(f"   ✗ Patch failed: {msg}")
            log(f"   → Saving raw patch to battle_results/{plan_id}_manual.patch")
            if not DRY_RUN:
                manual = REPO_ROOT / "scripts" / "battle_results" / f"{plan_id}_manual.patch"
                manual.write_text(patch_text)
            apply_summary.append({"plan": plan_title, "status": "failed", "reason": msg})

    # Summary
    applied = [s for s in apply_summary if s["status"] == "applied"]
    skipped = [s for s in apply_summary if s["status"] == "skipped"]
    failed  = [s for s in apply_summary if s["status"] == "failed"]

    log(f"\n── Apply summary: {len(applied)} applied, {len(skipped)} skipped, {len(failed)} failed")
    if failed:
        log("  Failed plans (manual patch saved):")
        for f in failed:
            log(f"    • {f['plan']}: {f.get('reason','')}")

    if not applied:
        log("Nothing to commit.")
        sys.exit(0)

    # Git commit
    changed = list(dict.fromkeys(all_changed_files))
    plan_names = " + ".join(s["plan"][:30] for s in applied[:2])
    suffix = f" (+{len(applied)-2} more)" if len(applied) > 2 else ""
    commit_msg = f"fix(battle): apply winning patches — {plan_names}{suffix}"

    log(f"\n── Committing {len(changed)} files...")
    git_ok = git_add_commit(changed, commit_msg)

    if not git_ok:
        log("[WARN] Commit failed — files are patched but not committed")
        log("  Run: git add . && git commit -m 'fix(battle): apply patches'")
        sys.exit(1)

    if not DRY_RUN:
        code, out, err = run(["git", "push", "origin", "main"])
        if code == 0:
            log("  pushed to origin/main ✓")
        else:
            log(f"  push failed: {err}")

    # Deploy
    if SKIP_DEPLOY or DRY_RUN:
        log("\n── Deploy skipped (SKIP_DEPLOY or DRY_RUN)")
        log("  Run manually: npm run deploy:full:safe")
    else:
        log("\n── Deploying...")
        code, out, err = run(["npm", "run", "deploy:full:safe"])
        if code == 0:
            log("  deploy:full:safe ✓")
        else:
            log(f"  deploy failed: {err[-500:] if err else out[-500:]}")
            log("  Fix and re-run: npm run deploy:full:safe")

    log("\nDone.")


if __name__ == "__main__":
    main()
