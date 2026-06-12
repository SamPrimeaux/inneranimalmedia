#!/usr/bin/env python3
"""
Autonomous repo cleanup — safe local clutter only (dry-run by default).

Measures before/after disk + file counts, deletes eligible paths by tier,
writes a JSON receipt under .scratch/cleanup-reports/.

Usage (from repo root):
  python3 scripts/repo-cleanup.py                    # dry-run, standard tier
  python3 scripts/repo-cleanup.py --apply              # execute deletions
  python3 scripts/repo-cleanup.py --apply --tier all   # max safe local cleanup
  python3 scripts/repo-cleanup.py --apply --repos      # inneranimalmedia + iam-pty paths
  python3 scripts/repo-cleanup.py --apply --git-tracked-audit  # git rm .agentsam_audit dumps

Never deletes: .env.cloudflare, node_modules (unless --include-node-modules),
migrations/, src/ hot paths (except *.bak / *.save), or anything outside allowlists.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# ── tiers (names → rule keys) ────────────────────────────────────────────────

TIER_RULES: dict[str, tuple[str, ...]] = {
    "minimal": (
        "env_backups",
        "ds_store",
    ),
    "standard": (
        "env_backups",
        "ds_store",
        "scratch",
        "evals",
        "local_d1",
        "backups",
        "tmp_dirs",
        "executor_findings",
        "iam_test_reports",
    ),
    "deep": (
        "env_backups",
        "ds_store",
        "scratch",
        "evals",
        "local_d1",
        "backups",
        "tmp_dirs",
        "executor_findings",
        "iam_test_reports",
        "artifacts",
        "captures_logs",
        "wrangler_cache",
        "supabase_temp",
        "deploy_checkpoints",
    ),
    "all": (
        "env_backups",
        "ds_store",
        "scratch",
        "evals",
        "local_d1",
        "backups",
        "tmp_dirs",
        "executor_findings",
        "iam_test_reports",
        "artifacts",
        "captures_logs",
        "wrangler_cache",
        "supabase_temp",
        "deploy_checkpoints",
        "venvs",
    ),
}

SKIP_WALK_NAMES = {
    ".git",
    "node_modules",
}

PROTECTED_BASENAMES = {
    ".env.cloudflare",
    ".env",
    ".mcp_exports.sh",
}

GIT_TRACKED_AUDIT_GLOBS = (
    ".agentsam_audit/terminal/02_worker_routes_ws.txt",
    ".agentsam_audit/terminal/03_pty_vm_shell_backend.txt",
)


@dataclass
class RepoStats:
    root: str
    git_sha: str = ""
    total_bytes: int = 0
    file_count: int = 0
    dir_count: int = 0
    git_tracked_files: int = 0
    top_dirs: dict[str, int] = field(default_factory=dict)  # name → file count


@dataclass
class DeletePlan:
    path: str
    rule: str
    bytes: int
    is_dir: bool


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def run_git(args: list[str], cwd: Path) -> str:
    try:
        out = subprocess.check_output(["git", *args], cwd=cwd, stderr=subprocess.DEVNULL)
        return out.decode().strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def measure_repo(root: Path) -> RepoStats:
    stats = RepoStats(root=str(root))
    stats.git_sha = run_git(["rev-parse", "--short", "HEAD"], root)
    stats.git_tracked_files = len(run_git(["ls-files"], root).splitlines()) if stats.git_sha else 0

    top: dict[str, int] = {}
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        # prune heavy deps unless explicitly included later
        dirnames[:] = [d for d in dirnames if d not in SKIP_WALK_NAMES]

        rel = Path(dirpath).relative_to(root)
        top_key = rel.parts[0] if rel.parts else "."
        top[top_key] = top.get(top_key, 0) + len(filenames)

        for name in filenames:
            fp = Path(dirpath) / name
            try:
                st = fp.stat()
            except OSError:
                continue
            stats.file_count += 1
            stats.total_bytes += st.st_size

        stats.dir_count += len(dirnames)

    stats.top_dirs = dict(sorted(top.items(), key=lambda kv: kv[1], reverse=True)[:15])
    return stats


def path_size(p: Path) -> int:
    if not p.exists():
        return 0
    if p.is_file():
        try:
            return p.stat().st_size
        except OSError:
            return 0
    total = 0
    for dirpath, dirnames, filenames in os.walk(p):
        dirnames[:] = [d for d in dirnames if d not in SKIP_WALK_NAMES]
        for name in filenames:
            try:
                total += (Path(dirpath) / name).stat().st_size
            except OSError:
                pass
    return total


def under_node_modules(p: Path, root: Path) -> bool:
    try:
        rel = p.relative_to(root)
    except ValueError:
        return False
    return "node_modules" in rel.parts


def collect_backups(root: Path) -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        if Path(dirpath).name in SKIP_WALK_NAMES:
            dirnames.clear()
            continue
        dirnames[:] = [d for d in dirnames if d not in SKIP_WALK_NAMES]
        for name in filenames:
            if name.endswith(".bak") or name.endswith(".save") or ".bak." in name:
                fp = Path(dirpath) / name
                if fp.name in PROTECTED_BASENAMES:
                    continue
                if not under_node_modules(fp, root):
                    out.append(fp)
    return out


def collect_ds_store(root: Path) -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        if Path(dirpath).name in SKIP_WALK_NAMES:
            dirnames.clear()
            continue
        dirnames[:] = [d for d in dirnames if d not in SKIP_WALK_NAMES]
        for name in filenames:
            if name == ".DS_Store" or name.startswith("._"):
                out.append(Path(dirpath) / name)
    return out


def scratch_targets(root: Path, keep_inventory: bool) -> list[Path]:
    scratch = root / ".scratch"
    if not scratch.is_dir():
        return []
    if not keep_inventory:
        return [scratch]
    out: list[Path] = []
    for child in scratch.iterdir():
        if child.name.startswith("repo-inventory-") or child.name == "cleanup-reports":
            continue
        out.append(child)
    return out


def glob_exists(root: Path, *parts: str) -> list[Path]:
    p = root.joinpath(*parts)
    return [p] if p.exists() else []


def deploy_checkpoint_globs(root: Path) -> list[Path]:
    names = [
        ".deploy-run-context.json",
        ".deploy-worker-stats.json",
        ".deploy-sw-tiered-manifest.json",
        ".deploy-eval-results.json",
        ".deploy-tool-events.jsonl",
        ".deploy-pipeline-stats.json",
        ".deploy-route-stats.json",
        ".deploy-codebase-index-stats.json",
        ".deploy-supabase-docs-hash",
        ".deploy-migrations-hash",
    ]
    return [root / n for n in names if (root / n).is_file()]


def captures_log_files(root: Path) -> list[Path]:
    cap = root / "captures"
    if not cap.is_dir():
        return []
    return [p for p in cap.rglob("upload-failures.log") if p.is_file()]


def build_plan(
    root: Path,
    rules: Iterable[str],
    *,
    keep_inventory: bool,
    include_node_modules: bool,
) -> list[DeletePlan]:
    rule_set = set(rules)
    plans: list[DeletePlan] = []
    seen: set[Path] = set()

    def add(path: Path, rule: str) -> None:
        if not path.exists():
            return
        rp = path.resolve()
        if rp in seen:
            return
        if any(rp == (root / b).resolve() for b in PROTECTED_BASENAMES):
            return
        if not include_node_modules and under_node_modules(rp, root):
            return
        seen.add(rp)
        plans.append(
            DeletePlan(
                path=str(rp),
                rule=rule,
                bytes=path_size(rp),
                is_dir=rp.is_dir(),
            )
        )

    if "env_backups" in rule_set:
        for pat in (".env.cloudflare.bak", ".env.cloudflare.save"):
            add(root / pat, "env_backups")
        for p in root.glob(".env.cloudflare.bak.*"):
            add(p, "env_backups")

    if "scratch" in rule_set:
        for p in scratch_targets(root, keep_inventory):
            add(p, "scratch")

    if "evals" in rule_set:
        add(root / ".agentsam_evals", "evals")

    if "local_d1" in rule_set:
        add(root / "inneranimalmedia-business", "local_d1")
        add(root / "inneranimalmedia-business.db", "local_d1")

    if "backups" in rule_set:
        for p in collect_backups(root):
            add(p, "backups")

    if "tmp_dirs" in rule_set:
        add(root / "tmp", "tmp_dirs")
        add(root / ".tmp", "tmp_dirs")

    if "executor_findings" in rule_set:
        add(root / "executor_findings.json", "executor_findings")

    if "iam_test_reports" in rule_set:
        add(root / "iam-test-reports", "iam_test_reports")

    if "artifacts" in rule_set:
        add(root / "artifacts", "artifacts")
        add(root / "playwright-report", "artifacts")
        add(root / "test-results", "artifacts")
        add(root / "quality-report", "artifacts")

    if "captures_logs" in rule_set:
        for p in captures_log_files(root):
            add(p, "captures_logs")

    if "wrangler_cache" in rule_set:
        add(root / ".wrangler", "wrangler_cache")
        add(root / ".worker-dist", "wrangler_cache")

    if "supabase_temp" in rule_set:
        add(root / "supabase" / ".temp", "supabase_temp")

    if "deploy_checkpoints" in rule_set:
        for p in deploy_checkpoint_globs(root):
            add(p, "deploy_checkpoints")

    if "venvs" in rule_set:
        add(root / ".venv", "venvs")
        add(root / ".venv_agentsam", "venvs")

    if "ds_store" in rule_set:
        for p in collect_ds_store(root):
            add(p, "ds_store")

    plans.sort(key=lambda x: (-x.bytes, x.path))
    return plans


def delete_path(p: Path) -> None:
    if p.is_dir():
        shutil.rmtree(p)
    else:
        p.unlink(missing_ok=True)


def git_rm_tracked_audit(root: Path, apply: bool) -> list[dict]:
    actions: list[dict] = []
    for rel in GIT_TRACKED_AUDIT_GLOBS:
        fp = root / rel
        if not fp.is_file():
            continue
        size = fp.stat().st_size
        actions.append({"path": rel, "bytes": size, "action": "git rm" if apply else "would git rm"})
        if apply:
            subprocess.check_call(["git", "rm", "-f", rel], cwd=root)
    return actions


def format_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n} B"


def print_stats(label: str, s: RepoStats) -> None:
    print(f"\n── {label} ──")
    print(f"  git: {s.git_sha or 'n/a'}  tracked files: {s.git_tracked_files}")
    print(f"  disk (excl. node_modules/.git walks): {format_bytes(s.total_bytes)}")
    print(f"  files: {s.file_count:,}  dirs: {s.dir_count:,}")
    if s.top_dirs:
        print("  top-level file counts:")
        for name, count in list(s.top_dirs.items())[:8]:
            print(f"    {name:24} {count:,}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Safe IAM repo cleanup with before/after metrics")
    parser.add_argument(
        "--tier",
        choices=list(TIER_RULES.keys()),
        default="standard",
        help="Cleanup aggressiveness (default: standard)",
    )
    parser.add_argument("--apply", action="store_true", help="Actually delete (default: dry-run)")
    parser.add_argument("--repos", action="store_true", help="Also clean ~/iam-pty (sibling PTY repo)")
    parser.add_argument(
        "--purge-all-scratch",
        action="store_true",
        help="Delete entire .scratch (default: keep repo-inventory-* and cleanup-reports)",
    )
    parser.add_argument(
        "--include-node-modules",
        action="store_true",
        help="Allow deleting *.bak inside node_modules (not full node_modules tree)",
    )
    parser.add_argument(
        "--git-tracked-audit",
        action="store_true",
        help=f"git rm huge tracked audit dumps: {', '.join(GIT_TRACKED_AUDIT_GLOBS)}",
    )
    parser.add_argument("--root", type=Path, default=None, help="Override repo root")
    args = parser.parse_args()

    roots = [args.root or repo_root()]
    if args.repos:
        iam_pty = Path(os.environ.get("IAM_PTY_DIR", Path.home() / "iam-pty"))
        if iam_pty.is_dir():
            roots.append(iam_pty)

    rules = TIER_RULES[args.tier]
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== repo-cleanup.py [{mode}] tier={args.tier} ===")

    all_receipts: list[dict] = []

    for root in roots:
        root = root.resolve()
        print(f"\n{'=' * 60}\n  {root}\n{'=' * 60}")

        before = measure_repo(root)
        print_stats("BEFORE", before)

        plans = build_plan(
            root,
            rules,
            keep_inventory=not args.purge_all_scratch,
            include_node_modules=args.include_node_modules,
        )
        planned_bytes = sum(p.bytes for p in plans)

        print(f"\n── Planned deletions ({len(plans)} paths, {format_bytes(planned_bytes)}) ──")
        by_rule: dict[str, int] = {}
        for p in plans:
            by_rule[p.rule] = by_rule.get(p.rule, 0) + p.bytes
        for rule, b in sorted(by_rule.items(), key=lambda kv: -kv[1]):
            print(f"  {rule:20} {format_bytes(b)}")
        for p in plans[:25]:
            kind = "dir " if p.is_dir else "file"
            print(f"  [{p.rule}] {kind} {format_bytes(p.bytes):>10}  {p.path}")
        if len(plans) > 25:
            print(f"  ... +{len(plans) - 25} more")

        git_actions: list[dict] = []
        if args.git_tracked_audit and (root / ".git").is_dir():
            git_actions = git_rm_tracked_audit(root, apply=args.apply)
            if git_actions:
                print("\n── Git tracked audit ──")
                for a in git_actions:
                    print(f"  {a['action']}: {a['path']} ({format_bytes(a['bytes'])})")

        deleted: list[dict] = []
        errors: list[dict] = []

        if args.apply:
            for plan in plans:
                p = Path(plan.path)
                try:
                    delete_path(p)
                    deleted.append(asdict(plan))
                except OSError as e:
                    errors.append({"path": plan.path, "error": str(e)})
        else:
            print("\n(dry-run — pass --apply to delete)")

        after = measure_repo(root)
        if args.apply:
            print_stats("AFTER", after)
            freed = before.total_bytes - after.total_bytes
            print(f"\n  Δ disk: −{format_bytes(max(0, freed))}  Δ files: −{before.file_count - after.file_count:,}")
        else:
            print(f"\n  Would free ≈ {format_bytes(planned_bytes)} on disk")

        receipt = {
            "root": str(root),
            "mode": mode,
            "tier": args.tier,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "before": asdict(before),
            "after": asdict(after) if args.apply else None,
            "planned_bytes": planned_bytes,
            "planned_count": len(plans),
            "deleted": deleted,
            "git_tracked_audit": git_actions,
            "errors": errors,
        }
        all_receipts.append(receipt)

    # write receipt
    report_root = (args.root or repo_root()) / ".scratch" / "cleanup-reports"
    report_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    report_path = report_root / f"cleanup-{stamp}.json"
    report_path.write_text(json.dumps(all_receipts, indent=2) + "\n")
    print(f"\nReceipt: {report_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
