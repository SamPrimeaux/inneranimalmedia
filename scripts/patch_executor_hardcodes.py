#!/usr/bin/env python3
"""
patch_executor_hardcodes.py
---------------------------
Patches three confirmed hardcodes found by the executor analysis:

  1. src/core/resolveModel.js     — catch block: add D1 arm penalization + fallback
  2. src/core/workflow-executor.js — provider IN list: read from catalog not hardcoded
  3. src/api/command-run-telemetry.js — arm fallback: resolve from catalog not 'openai'

Run from repo root:
    python3 scripts/patch_executor_hardcodes.py

Flags:
    --dry-run   show diffs without writing
    --fix N     apply only patch N (1, 2, or 3)
"""

import sys
import shutil
import argparse
from pathlib import Path

REPO = Path("/Users/samprimeaux/inneranimalmedia")

# ── helpers ──────────────────────────────────────────────────────────────────

def backup(path: Path):
    bak = Path(str(path) + ".bak")
    shutil.copy(path, bak)
    print(f"  .bak → {bak.name}")

def show_diff(label, old_lines, new_lines, start_line):
    print(f"\n  {'─'*60}")
    print(f"  {label}")
    print(f"  {'─'*60}")
    for i, line in enumerate(old_lines):
        print(f"  - {start_line+i:4d}│ {line}")
    print(f"  {'':>6}  ↓")
    for i, line in enumerate(new_lines):
        print(f"  + {start_line+i:4d}│ {line}")

def find_line(lines, fragment):
    """Return 0-based index of first line containing fragment, or -1."""
    for i, l in enumerate(lines):
        if fragment in l:
            return i
    return -1

def apply(path: Path, lines: list[str], dry_run: bool) -> bool:
    if dry_run:
        print("  [dry-run] would write", path)
        return True
    path.write_text("\n".join(lines) + "\n")
    print(f"  ✅ written → {path}")
    return True


# ── patch 1: resolveModel.js catch block ────────────────────────────────────

def patch1_resolvemodel(dry_run: bool):
    path = REPO / "src/core/resolveModel.js"
    print(f"\n▶ PATCH 1 — {path.relative_to(REPO)}")

    lines = path.read_text().splitlines()

    # Find the anchor: the ResolutionError check with 'continue'
    anchor_idx = -1
    for i, line in enumerate(lines):
        if "ResolutionError" in line and "MODEL_NOT_FOUND" in line:
            # Now find the 'continue' within the next 10 lines
            for j in range(i, min(i+10, len(lines))):
                if lines[j].strip() == "continue;":
                    anchor_idx = j
                    break
            if anchor_idx >= 0:
                break

    if anchor_idx < 0:
        print("  ❌ anchor line (continue; after ResolutionError) not found")
        print("  → Run: grep -n 'continue' src/core/resolveModel.js | head -20")
        return False

    # The 'continue;' line — replace it with penalize + fallback + continue
    indent = len(lines[anchor_idx]) - len(lines[anchor_idx].lstrip())
    pad = " " * indent

    old_line = lines[anchor_idx]
    new_block = [
        f"{pad}// Penalize arm in D1 so Thompson learns from this failure",
        f"{pad}try {{",
        f"{pad}  await db.prepare(",
        f"{pad}    'UPDATE agentsam_routing_arms SET success_beta = success_beta + 1, updated_at = unixepoch(), pause_reason = ? WHERE id = ?'",
        f"{pad}  ).bind(`${{e.code}} at ${{new Date().toISOString()}}`, arm.id).run();",
        f"{pad}}} catch (_) {{ /* non-fatal */ }}",
        f"{pad}// Try fallback_model_key before giving up on this arm",
        f"{pad}if (arm.fallback_model_key) {{",
        f"{pad}  try {{",
        f"{pad}    const fallbackResolved = await loadModelRecord(db, arm.fallback_model_key, 'thompson_fallback', arm.id, cap);",
        f"{pad}    if (fallbackResolved) return fallbackResolved;",
        f"{pad}  }} catch (_) {{ /* fallback also failed, continue loop */ }}",
        f"{pad}}}",
        f"{pad}continue;",
    ]

    show_diff("resolveModel.js — catch block penalize + fallback",
              [old_line], new_block, anchor_idx + 1)

    if not dry_run:
        backup(path)
        lines[anchor_idx:anchor_idx+1] = new_block
        return apply(path, lines, dry_run=False)
    return True


# ── patch 2: workflow-executor.js provider IN list ───────────────────────────

def patch2_executor_provider(dry_run: bool):
    path = REPO / "src/core/workflow-executor.js"
    print(f"\n▶ PATCH 2 — {path.relative_to(REPO)}")

    lines = path.read_text().splitlines()

    anchor_idx = find_line(lines, "AND provider IN ('openai','anthropic','google')")
    if anchor_idx < 0:
        # try alternate quote styles
        anchor_idx = find_line(lines, 'AND provider IN (\'openai\'')
    if anchor_idx < 0:
        print("  ❌ anchor line not found")
        print("  → Run: grep -n 'provider IN' src/core/workflow-executor.js")
        return False

    old_line = lines[anchor_idx]
    indent = len(old_line) - len(old_line.lstrip())
    pad = " " * indent

    new_lines = [
        f"{pad}AND provider IN (SELECT DISTINCT provider FROM agentsam_model_catalog WHERE is_active = 1)",
    ]

    show_diff("workflow-executor.js — provider IN list from catalog",
              [old_line], new_lines, anchor_idx + 1)

    if not dry_run:
        backup(path)
        lines[anchor_idx:anchor_idx+1] = new_lines
        return apply(path, lines, dry_run=False)
    return True


# ── patch 3: command-run-telemetry.js arm fallbacks ─────────────────────────

def patch3_telemetry_provider(dry_run: bool):
    path = REPO / "src/api/command-run-telemetry.js"
    print(f"\n▶ PATCH 3 — {path.relative_to(REPO)}")

    lines = path.read_text().splitlines()

    # Find modelKey line
    mk_idx = find_line(lines, "arm?.model_key || 'gpt-5.4-mini'")
    pv_idx = find_line(lines, "arm?.provider || 'openai'")

    if mk_idx < 0 or pv_idx < 0:
        print(f"  ❌ anchor lines not found (modelKey:{mk_idx} provider:{pv_idx})")
        print("  → Run: grep -n 'arm?.model_key\\|arm?.provider' src/api/command-run-telemetry.js")
        return False

    # Build replacements — resolve from catalog when arm is null
    mk_indent = " " * (len(lines[mk_idx]) - len(lines[mk_idx].lstrip()))
    pv_indent = " " * (len(lines[pv_idx]) - len(lines[pv_idx].lstrip()))

    old_mk = lines[mk_idx]
    old_pv = lines[pv_idx]

    new_mk = [
        f"{mk_indent}const modelKey = arm?.model_key || 'gpt-5.4-nano'; // baseline; arm resolution preferred",
    ]
    new_pv = [
        f"{pv_indent}// Resolve provider from catalog — never hardcode 'openai' as default",
        f"{pv_indent}const provider = arm?.provider || (",
        f"{pv_indent}  await env.DB.prepare(",
        f"{pv_indent}    'SELECT provider FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1'",
        f"{pv_indent}  ).bind(modelKey).first().catch(() => null)",
        f"{pv_indent})?.provider || 'openai'; // true last resort only",
    ]

    show_diff("command-run-telemetry.js — modelKey fallback", [old_mk], new_mk, mk_idx + 1)
    show_diff("command-run-telemetry.js — provider fallback", [old_pv], new_pv, pv_idx + 1)

    if not dry_run:
        backup(path)
        # Apply in reverse line order so indices don't shift
        if pv_idx > mk_idx:
            lines[pv_idx:pv_idx+1] = new_pv
            lines[mk_idx:mk_idx+1] = new_mk
        else:
            lines[mk_idx:mk_idx+1] = new_mk
            lines[pv_idx:pv_idx+1] = new_pv
        return apply(path, lines, dry_run=False)
    return True


# ── entry ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Show diffs without writing files")
    parser.add_argument("--fix", type=int, choices=[1, 2, 3], default=None,
                        help="Apply only patch 1, 2, or 3")
    args = parser.parse_args()

    mode = "DRY RUN" if args.dry_run else "APPLYING PATCHES"
    print(f"\n{'═'*62}")
    print(f"  EXECUTOR HARDCODE PATCHER — {mode}")
    print(f"{'═'*62}")

    patches = {1: patch1_resolvemodel, 2: patch2_executor_provider, 3: patch3_telemetry_provider}
    to_run  = [args.fix] if args.fix else [1, 2, 3]

    results = {}
    for n in to_run:
        results[n] = patches[n](dry_run=args.dry_run)

    print(f"\n{'═'*62}")
    print("  RESULTS")
    print(f"{'═'*62}")
    for n, ok in results.items():
        icon = "✅" if ok else "❌"
        print(f"  {icon} Patch {n}")

    if not args.dry_run and all(results.values()):
        print("\n  Next: npm run deploy:full")
    print()
