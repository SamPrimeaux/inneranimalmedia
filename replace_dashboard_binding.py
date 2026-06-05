"""
replace_dashboard_binding.py
----------------------------
Replaces env.DASHBOARD with env.ASSETS across src/ and removes the
duplicate DASHBOARD r2_buckets block from wrangler.production.toml.

Run from the repo root:
    python3 replace_dashboard_binding.py

Dry-run mode (no writes):
    python3 replace_dashboard_binding.py --dry-run

After this script completes, Cursor runs:
    node --check on every touched .js file
    git add + commit + deploy
"""

import sys
import os
import re
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv

REPO_ROOT = Path(__file__).parent  # adjust if script lives elsewhere
SRC_DIR = REPO_ROOT / "src"
WRANGLER_TOML = REPO_ROOT / "wrangler.production.toml"

# ── Replacement rules (applied in order per file) ────────────────────────────
# Each entry: (pattern, replacement)
# All are plain string replacements — no regex — to avoid accidental partial hits.
REPLACEMENTS = [
    # Primary binding reference
    ("env.DASHBOARD", "env.ASSETS"),

    # r2-api.js bucket map — 'dashboard' key should also resolve to ASSETS
    # line: dashboard: env.DASHBOARD,   →   dashboard: env.ASSETS,
    # (covered by the rule above — no separate entry needed)

    # catalog-tool-executor.js — key === 'DASHBOARD' allowlist
    # line: if (key === 'ASSETS' || key === 'DASHBOARD') return env.DASHBOARD || env.ASSETS;
    # After primary replace this becomes:
    # if (key === 'ASSETS' || key === 'DASHBOARD') return env.ASSETS || env.ASSETS;
    # We want: if (key === 'ASSETS' || key === 'DASHBOARD') return env.ASSETS;
    ("env.ASSETS || env.ASSETS", "env.ASSETS"),

    # storage.js / r2.js binding name strings
    # line: if (b === env.DASHBOARD) return 'DASHBOARD';  →  keep 'DASHBOARD' string as-is
    # (already handled — b === env.ASSETS is fine, string label can stay for legacy compat)

    # health/index.js: r2: !!env.DASHBOARD  →  r2: !!env.ASSETS
    # (covered by primary rule)

    # cms.js special case: env.DASHBOARD || env.R2  →  env.ASSETS || env.R2
    # (covered by primary rule — env.DASHBOARD becomes env.ASSETS, || env.R2 stays)
]

# Files explicitly in the grep output — used for targeted node --check list
KNOWN_JS_FILES = [
    "src/api/cms.js",
    "src/api/draw.js",
    "src/api/health/index.js",
    "src/api/meet.js",
    "src/api/r2-api.js",
    "src/api/settings-workspace.js",
    "src/api/storage.js",
    "src/core/agentsam-task-executor.js",
    "src/core/catalog-tool-executor.js",
    "src/core/cms-theme-active.js",
    "src/core/cms-theme-handlers.js",
    "src/core/r2.js",
    "src/cron/jobs/overnight-progress.js",
    "src/index.js",
    "src/integrations/canvas.js",
    "src/integrations/playwright.js",
    "src/public-pages/quality-report-route.js",
    "src/queue/playwright-queue-job.js",
]


def replace_in_file(path: Path) -> tuple[int, list[str]]:
    """Apply all replacements to a file. Returns (change_count, changed_lines)."""
    original = path.read_text(encoding="utf-8")
    updated = original
    for old, new in REPLACEMENTS:
        updated = updated.replace(old, new)

    if updated == original:
        return 0, []

    changed_lines = []
    for i, (orig_line, new_line) in enumerate(
        zip(original.splitlines(), updated.splitlines()), start=1
    ):
        if orig_line != new_line:
            changed_lines.append(f"  L{i}: {orig_line.strip()!r}  →  {new_line.strip()!r}")

    if not DRY_RUN:
        path.write_text(updated, encoding="utf-8")

    return len(changed_lines), changed_lines


def patch_wrangler_toml(path: Path) -> bool:
    """
    Remove the [[r2_buckets]] block where binding = 'DASHBOARD'.
    The ASSETS block (same bucket) stays untouched.
    Returns True if a change was made.
    """
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)

    in_dashboard_block = False
    block_start = None
    blocks_to_remove = []  # list of (start, end) line index ranges

    i = 0
    while i < len(lines):
        line = lines[i]

        # Detect start of any [[r2_buckets]] block
        if re.match(r"^\[\[r2_buckets\]\]", line.strip()):
            in_dashboard_block = False
            block_start = i

        # Detect binding = "DASHBOARD" inside a block
        if block_start is not None and re.match(r'\s*binding\s*=\s*"DASHBOARD"', line):
            in_dashboard_block = True

        # Detect end of block (next [[...]] section or EOF)
        if block_start is not None and in_dashboard_block:
            # Look ahead for end of this block
            end = i + 1
            while end < len(lines):
                next_line = lines[end].strip()
                if next_line.startswith("[[") or next_line.startswith("["):
                    break
                end += 1
            blocks_to_remove.append((block_start, end))
            in_dashboard_block = False
            block_start = None
            i = end
            continue

        i += 1

    if not blocks_to_remove:
        print("  wrangler.production.toml: no DASHBOARD block found (already clean?)")
        return False

    # Also remove the comment line immediately before the block if it mentions DASHBOARD
    cleaned_lines = list(lines)
    for start, end in reversed(blocks_to_remove):
        comment_start = start
        if start > 0 and lines[start - 1].strip().startswith("#"):
            comment_start = start - 1
        del cleaned_lines[comment_start:end]
        print(
            f"  wrangler.production.toml: removed DASHBOARD block "
            f"(lines {comment_start+1}–{end})"
        )

    updated = "".join(cleaned_lines)

    if not DRY_RUN:
        path.write_text(updated, encoding="utf-8")

    return True


def main():
    mode = "DRY RUN" if DRY_RUN else "LIVE"
    print(f"\n{'='*60}")
    print(f"  replace_dashboard_binding.py  [{mode}]")
    print(f"{'='*60}\n")

    total_files_changed = 0
    total_changes = 0
    touched_files = []

    # ── Walk src/ ─────────────────────────────────────────────────────────────
    for js_file in sorted(SRC_DIR.rglob("*.js")):
        count, changed_lines = replace_in_file(js_file)
        if count:
            rel = js_file.relative_to(REPO_ROOT)
            print(f"  CHANGED  {rel}  ({count} line(s))")
            for line in changed_lines:
                print(line)
            total_files_changed += 1
            total_changes += count
            touched_files.append(str(rel))

    # ── Patch wrangler.production.toml ────────────────────────────────────────
    print()
    toml_changed = patch_wrangler_toml(WRANGLER_TOML)
    if toml_changed:
        touched_files.append("wrangler.production.toml")

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Files changed : {total_files_changed} JS + {'1 toml' if toml_changed else '0 toml'}")
    print(f"  Total changes : {total_changes}")
    if DRY_RUN:
        print("  No files written (dry-run mode).")
    print(f"{'='*60}\n")

    # ── Verification instructions for Cursor ──────────────────────────────────
    if not DRY_RUN and touched_files:
        print("Next steps for Cursor:\n")
        print("1. Verify zero remaining DASHBOARD binding refs:")
        print('   grep -rn "env\\.DASHBOARD" src/ --include="*.js"\n')
        print("2. node --check on every touched JS file:")
        js_touched = [f for f in touched_files if f.endswith(".js")]
        if js_touched:
            print("   node --check " + " \\\n     ".join(js_touched))
        print()
        print("3. Confirm ASSETS binding still present in wrangler.production.toml:")
        print('   grep -n "ASSETS" wrangler.production.toml\n')
        print("4. Stage, commit, and deploy:")
        print("   git add " + " ".join(touched_files))
        print('   git commit -m "Replace DASHBOARD R2 binding with ASSETS — same bucket, freed binding slot.')
        print()
        print("Both bindings pointed to inneranimalmedia bucket. ASSETS is canonical.")
        print('DASHBOARD removed from wrangler.production.toml to free one binding slot')
        print('for the upcoming dedicated artifact bucket."')
        print("   git push origin main")
        print("   npm run deploy:full")


if __name__ == "__main__":
    main()
