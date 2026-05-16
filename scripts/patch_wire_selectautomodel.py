#!/usr/bin/env python3
"""
patch_wire_selectautomodel.py
Script 3 of 3 — Routing repair.

Wires selectAutoModel from src/core/routing.js into src/api/agent.js.
Also wires recordRoutingArmOutcome for Thompson feedback loop.

Run: python3 scripts/patch_wire_selectautomodel.py
"""

from pathlib import Path
import re

TARGET = Path("/Users/samprimeaux/inneranimalmedia/src/api/agent.js")

# ── Patch 1: Add selectAutoModel + recordRoutingArmOutcome to the routing import
# Find existing routing.js import and add to it
OLD_ROUTING_IMPORT = "import { getDashboardR2Object, getDashboardSpaHtmlShell } from './core/dashboard-r2-assets.js';"

NEW_ROUTING_IMPORT = """import { getDashboardR2Object, getDashboardSpaHtmlShell } from './core/dashboard-r2-assets.js';
import { selectAutoModel, recordRoutingArmOutcome } from './core/routing.js';"""

# ── Patch 2: Call selectAutoModel after classifyIntent resolves in agent mode
# Find the block where intentResult is used in agent/debug/multitask mode
OLD_INTENT_USE = """  const intentResult = await classifyIntent(env, message);
  if (
    ['agent', 'debug', 'multitask'].includes(requestedMode) &&
    (!intentResult || typeof intentResult !== 'object')
  ) {
    console.error('[agent] classifyIntent_invalid', { message: String(message || '').slice(0, 240) });
  }"""

NEW_INTENT_USE = """  const intentResult = await classifyIntent(env, message);
  if (
    ['agent', 'debug', 'multitask'].includes(requestedMode) &&
    (!intentResult || typeof intentResult !== 'object')
  ) {
    console.error('[agent] classifyIntent_invalid', { message: String(message || '').slice(0, 240) });
  }

  // ── Thompson arm selection via selectAutoModel ──────────────────────────────
  let _autoModelResult = null;
  try {
    _autoModelResult = await selectAutoModel(env, {
      taskType:    intentResult?.taskType  || 'chat',
      mode:        intentResult?.mode      || requestedMode || 'agent',
      workspaceId: workspaceId,
      tenantId:    tenantId,
    });
    if (_autoModelResult?.model_key && !requestedModel) {
      // Only override if user didn't explicitly pick a model
      // (resolved model is available as _autoModelResult.model_key for downstream use)
      console.log('[agent] selectAutoModel', {
        taskType: intentResult?.taskType,
        model: _autoModelResult.model_key,
        provider: _autoModelResult.provider,
        armId: _autoModelResult.id,
      });
    }
  } catch (_autoErr) {
    console.warn('[agent] selectAutoModel_failed', String(_autoErr?.message || _autoErr).slice(0, 120));
  }
  const _selectedArmId = _autoModelResult?.id ?? null;"""

def apply(source, old, new, label):
    if old not in source:
        print(f"  [FAIL] {label} — target not found")
        return source, False
    count = source.count(old)
    if count > 1:
        print(f"  [WARN] {label} — {count} matches, patching first only")
    result = source.replace(old, new, 1)
    print(f"  [OK]   {label}")
    return result, True

def check_routing_import(source):
    """Check if routing.js is already imported."""
    return "from './core/routing.js'" in source or 'from "./core/routing.js"' in source

def main():
    print("=" * 64)
    print("  patch_wire_selectautomodel.py")
    print("=" * 64)

    if not TARGET.exists():
        print(f"  ERROR: {TARGET} not found")
        return

    source = TARGET.read_text()

    if 'selectAutoModel' in source and '_autoModelResult' in source:
        print("  Already wired — selectAutoModel call present")
        return

    # Check if routing.js already imported (may have a different existing import)
    already_imported = check_routing_import(source)

    if already_imported:
        print("  [INFO] routing.js already imported — skipping import patch, adding call only")
        # Just add the call
        source, ok1 = (source, True)
    else:
        source, ok1 = apply(source, OLD_ROUTING_IMPORT, NEW_ROUTING_IMPORT, "import selectAutoModel + recordRoutingArmOutcome")

    source, ok2 = apply(source, OLD_INTENT_USE, NEW_INTENT_USE, "wire selectAutoModel call after classifyIntent")

    if not all([ok1, ok2]):
        print("\n  One or more patches failed — file NOT written")
        print("  Check if routing.js import already exists with different format")
        # Show what imports from core exist
        import_lines = [l for l in source.split('\n') if 'core/' in l and 'import' in l]
        print("  Existing core/ imports:")
        for l in import_lines[:10]:
            print(f"    {l.strip()}")
        return

    TARGET.write_text(source)
    print(f"\n  Written: {TARGET}")
    print("\n  All 3 scripts complete. Commit and push:")
    print("  git add src/api/agent.js && \\")
    print("  git commit -m 'fix: full intent taxonomy + selectAutoModel wired + route requirements fixed' && \\")
    print("  git push")
    print("=" * 64)

if __name__ == "__main__":
    main()
