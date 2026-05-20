#!/usr/bin/env python3
"""
patch.py — DB-driven thinking/effort rewrite for anthropic.js
          + Anthropic latency defaults fix for run_builder.py

Usage:
    python3 patch.py --dry-run   # preview diffs, write nothing
    python3 patch.py             # apply all patches

Both files are patched in-memory then written once each.
All three patches must find their anchors or the script aborts without writing.
"""

import sys
import difflib
from pathlib import Path

DRY   = '--dry-run' in sys.argv
BASE  = Path.home() / 'inneranimalmedia'
ANTHR = BASE / 'src/integrations/anthropic.js'
RB    = BASE / 'scripts/thompson_benchmark/run_builder.py'

# ── helpers ───────────────────────────────────────────────────────────────────

def diff(a, b, name):
    return ''.join(difflib.unified_diff(
        a.splitlines(keepends=True),
        b.splitlines(keepends=True),
        fromfile=f'{name} (before)',
        tofile=f'{name} (after)',
        n=3,
    )) or '  (no diff — already applied?)\n'


def patch_between(src, start_anchor, end_anchor, replacement, tag):
    """
    Replace src[start_anchor : end_anchor] with replacement.
    end_anchor is NOT consumed — it remains in the output.
    Returns (new_src, ok).
    """
    i = src.find(start_anchor)
    if i == -1:
        print(f'[MISS] {tag}')
        print(f'       start anchor not found: {repr(start_anchor[:100])}')
        return src, False

    j = src.find(end_anchor, i + len(start_anchor))
    if j == -1:
        print(f'[MISS] {tag}')
        print(f'       end anchor not found: {repr(end_anchor[:100])}')
        return src, False

    old_block = src[i:j]
    print(f'\n{"━"*64}')
    print(f'FOUND: {tag}')
    print(f'  Replacing {len(old_block.splitlines())} lines')
    print(f'  start → {repr(src[i:i+60])}')
    print(f'  end   → {repr(src[j:j+60])}')
    return src[:i] + replacement + src[j:], True


def patch_exact(src, old, new, tag):
    """Replace an exact multi-line string."""
    if old not in src:
        print(f'[MISS] {tag}')
        print(f'       exact string not found: {repr(old[:100])}')
        return src, False
    print(f'\n{"━"*64}')
    print(f'FOUND: {tag}')
    return src.replace(old, new, 1), True


# ── replacement text ──────────────────────────────────────────────────────────

# Note: trailing \n ensures clean separation from whatever follows.

NEW_EFFORT = """\
  // Effort — DB-driven via features.supports_effort_scaling.
  // Sonnet 4.6, Opus 4.6, Opus 4.7 all support effort per /v1/models capabilities.
  // Haiku does not. Add new models by setting supports_effort_scaling=true
  // in agentsam_ai.features_json — no code change required.
  const supportsEffort =
    features.supports_effort_scaling === true ||
    features.supports_effort_scaling === 1;

  if (supportsEffort && !isScoutTask) {
    const effortVal =
      options.effort ||
      (modelData.effort != null && String(modelData.effort).trim() !== ''
        ? String(modelData.effort).trim()
        : null);
    if (effortVal) {
      const existingOut =
        streamParams.output_config && typeof streamParams.output_config === 'object'
          ? streamParams.output_config
          : {};
      streamParams.output_config = { ...existingOut, effort: effortVal };
    }
  }

"""

NEW_THINKING = """\
  // Thinking — driven entirely by agentsam_ai.thinking_mode.
  // Values (set in DB; never hardcode model names here):
  //   'none'                 → no thinking param (Haiku scout role)
  //   'adaptive'             → {type:'adaptive'} only — Opus 4.7 rejects 'enabled'
  //   'adaptive_and_enabled' → {type:'enabled',budget_tokens} if budget provided,
  //                            else {type:'adaptive'} — Sonnet 4.6, Opus 4.6
  // To support a new model: update thinking_mode in agentsam_ai row only.
  const thinkingMode = String(modelData.thinking_mode || 'none').trim();

  if (options.thinking && typeof options.thinking === 'object') {
    // Explicit object passed by caller — validate against model capability before forwarding.
    const requestedType = String(options.thinking.type || '');
    if (thinkingMode === 'none') {
      // Strip — model not using thinking operationally (e.g. Haiku).
    } else if (thinkingMode === 'adaptive' && requestedType === 'enabled') {
      // Downgrade: model only supports adaptive (Opus 4.7 returns 400 on 'enabled').
      streamParams.thinking = { type: 'adaptive' };
    } else {
      streamParams.thinking = options.thinking;
    }
  } else if (thinkingMode === 'none' || isScoutTask) {
    // No thinking — scout task or model has no operational thinking mode.
  } else if (thinkingMode === 'adaptive') {
    // Opus 4.7: adaptive only — budget_tokens causes 400.
    streamParams.thinking = { type: 'adaptive' };
  } else if (thinkingMode === 'adaptive_and_enabled') {
    // Sonnet 4.6 / Opus 4.6: use enabled+budget if provided, else adaptive.
    if (options.thinkingBudget && Number(options.thinkingBudget) > 0) {
      streamParams.thinking = {
        type: 'enabled',
        budget_tokens: Number(options.thinkingBudget),
      };
    } else {
      streamParams.thinking = { type: 'adaptive' };
    }
  }
  // Any unknown future thinking_mode value → no param sent (safe default).

"""

OLD_RB_LATENCY = (
    '        ("anthropic", "standard"): (2000, 8000),\n'
    '        ("anthropic", "power"): (5000, 18000),\n'
    '        ("anthropic", "reasoning"): (8000, 30000),'
)

NEW_RB_LATENCY = (
    '        ("anthropic", "standard"): (800, 3000),    # Haiku 4.5 — fast, no effort\n'
    '        ("anthropic", "power"): (4000, 14000),     # Sonnet 4.6 / Opus 4.6 with effort\n'
    '        ("anthropic", "reasoning"): (6000, 22000), # Opus 4.7 adaptive effort'
)

# ── patch anthropic.js (both edits applied in-memory, written once) ───────────

anthr_orig = ANTHR.read_text()
anthr_v1, ok1 = patch_between(
    anthr_orig,
    start_anchor='  // Effort: Opus 4.7 only via output_config',
    end_anchor="  if (options.thinking && typeof options.thinking === 'object') {",
    replacement=NEW_EFFORT,
    tag='anthropic.js — effort block (lines ~226-239)',
)

anthr_v2, ok2 = patch_between(
    anthr_v1,
    start_anchor="  if (options.thinking && typeof options.thinking === 'object') {",
    end_anchor='  // 3. Structured Output Config',
    replacement=NEW_THINKING,
    tag='anthropic.js — thinking block (lines ~240-267)',
)

print(f'\n{"━"*64}')
print('DIFF: anthropic.js (combined)')
print(f'{"━"*64}')
print(diff(anthr_orig, anthr_v2, 'anthropic.js'))

# ── patch run_builder.py ──────────────────────────────────────────────────────

rb_orig = RB.read_text()
rb_v1, ok3 = patch_exact(
    rb_orig,
    old=OLD_RB_LATENCY,
    new=NEW_RB_LATENCY,
    tag='run_builder.py — anthropic latency defaults (lines 97-99)',
)

print(f'\n{"━"*64}')
print('DIFF: run_builder.py')
print(f'{"━"*64}')
print(diff(rb_orig, rb_v1, 'run_builder.py'))

# ── abort if any anchor missed ────────────────────────────────────────────────

all_ok = ok1 and ok2 and ok3
if not all_ok:
    print(f'\n[ABORT] One or more anchors not found — nothing written.')
    print('        Check the MISS messages above and re-run after verifying.')
    sys.exit(1)

# ── write (or dry-run) ────────────────────────────────────────────────────────

print(f'\n{"━"*64}')
if DRY:
    print('DRY RUN — diffs shown above, nothing written.')
    print('Re-run without --dry-run to apply.')
else:
    ANTHR.write_text(anthr_v2)
    print(f'✓ written: {ANTHR}')
    RB.write_text(rb_v1)
    print(f'✓ written: {RB}')
    print()
    print('Next: verify no budget_tokens remain, then run the benchmark.')
    print("  grep -n 'budget_tokens' ~/inneranimalmedia/src/integrations/anthropic.js")
    print('  python3 scripts/thompson_benchmark/live_runner.py --limit 3')
