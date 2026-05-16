#!/usr/bin/env python3
"""
patch_app_tsx.py — fixes truncated lazy import in dashboard/App.tsx line 85
Run from repo root: python3 scripts/patch_app_tsx.py
"""
from pathlib import Path

TARGET = Path("/Users/samprimeaux/inneranimalmedia/dashboard/App.tsx")

OLD = "  const WorkflowsPage = lazy(() \n  const WorkflowCanvas"
NEW = "  const WorkflowsPage = lazy(() => import('./pages/workflows/WorkflowsPage'));\n  const WorkflowCanvas"

def main():
    print("=" * 56)
    print("  patch_app_tsx.py — fix truncated lazy import")
    print("=" * 56)

    if not TARGET.exists():
        print(f"  ERROR: {TARGET} not found"); return

    source = TARGET.read_text()

    if OLD not in source:
        # Show actual line 84-87 for diagnosis
        lines = source.splitlines()
        print("  Target string not found. Lines 83-88:")
        for i, l in enumerate(lines[82:88], 83):
            print(f"    {i}: {repr(l)}")
        return

    result = source.replace(OLD, NEW, 1)
    TARGET.write_text(result)
    print("  [OK] Fixed truncated WorkflowsPage lazy import")
    print(f"  Written: {TARGET}")
    print("  Now run: cd dashboard && npm run build")
    print("=" * 56)

if __name__ == "__main__":
    main()
