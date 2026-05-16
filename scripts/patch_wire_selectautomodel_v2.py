#!/usr/bin/env python3
"""
patch_wire_selectautomodel_v2.py — fixed import path (../core/ not ./core/)
Run: python3 scripts/patch_wire_selectautomodel_v2.py
"""
from pathlib import Path

TARGET = Path("/Users/samprimeaux/inneranimalmedia/src/api/agent.js")

# Anchor on an import that definitely exists in agent.js
OLD_IMPORT_ANCHOR = "import { dispatchStream, OLLAMA_SKIP_MESSAGE, resolveModelMeta } from '../core/provider.js';"

NEW_IMPORT_ANCHOR = """import { dispatchStream, OLLAMA_SKIP_MESSAGE, resolveModelMeta } from '../core/provider.js';
import { selectAutoModel, recordRoutingArmOutcome } from '../core/routing.js';"""

# Anchor on the classifyIntent_invalid log line (unique, stable)
OLD_CALL_ANCHOR = "    console.error('[agent] classifyIntent_invalid', { message: String(message || '').slice(0, 240) });\n  }"

NEW_CALL_ANCHOR = """    console.error('[agent] classifyIntent_invalid', { message: String(message || '').slice(0, 240) });
  }

  // ── Thompson arm selection ────────────────────────────────────────────────
  let _autoModelResult = null;
  let _selectedArmId   = null;
  try {
    _autoModelResult = await selectAutoModel(env, {
      taskType:    intentResult?.taskType  || 'chat',
      mode:        intentResult?.mode      || requestedMode || 'agent',
      workspaceId: workspaceId,
      tenantId:    tenantId,
    });
    _selectedArmId = _autoModelResult?.id ?? null;
    if (_autoModelResult?.model_key) {
      console.log('[agent] selectAutoModel', {
        taskType: intentResult?.taskType,
        model:    _autoModelResult.model_key,
        provider: _autoModelResult.provider,
        armId:    _selectedArmId,
      });
    }
  } catch (_autoErr) {
    console.warn('[agent] selectAutoModel_failed', String(_autoErr?.message || _autoErr).slice(0, 120));
  }"""

def apply(source, old, new, label):
    if old not in source:
        print(f"  [FAIL] {label}")
        # Show surrounding context hint
        anchor_word = old.split('\n')[0][:60]
        idx = source.find(anchor_word)
        if idx >= 0:
            print(f"    Closest match context: ...{source[max(0,idx-30):idx+80]}...")
        return source, False
    source = source.replace(old, new, 1)
    print(f"  [OK]   {label}")
    return source, True

def main():
    print("="*60)
    print("  patch_wire_selectautomodel_v2.py")
    print("="*60)

    if not TARGET.exists():
        print(f"  ERROR: {TARGET} not found"); return

    source = TARGET.read_text()

    if 'selectAutoModel' in source and '_autoModelResult' in source:
        print("  Already wired — skipping"); return

    # Check if routing.js already imported
    if "from '../core/routing.js'" in source:
        print("  [INFO] routing.js already imported — skipping import patch")
        ok1 = True
    else:
        source, ok1 = apply(source, OLD_IMPORT_ANCHOR, NEW_IMPORT_ANCHOR,
                            "add selectAutoModel import from ../core/routing.js")

    source, ok2 = apply(source, OLD_CALL_ANCHOR, NEW_CALL_ANCHOR,
                        "wire selectAutoModel call after classifyIntent")

    if not all([ok1, ok2]):
        print("\n  FAILED — file not written")
        return

    TARGET.write_text(source)
    print(f"\n  Written: {TARGET}")
    print("\n  All 3 scripts done. Commit:")
    print("  git add src/api/agent.js && \\")
    print("  git commit -m 'fix: 25-type intent taxonomy + selectAutoModel wired + route requirements unblocked' && \\")
    print("  git push")
    print("="*60)

if __name__ == "__main__":
    main()
