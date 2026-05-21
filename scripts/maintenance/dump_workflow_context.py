#!/usr/bin/env python3
"""
dump_workflow_context.py
Reads all files needed for the workflow remaster and dumps them
into a single paste-ready block for Cursor.
Usage: python3 dump_workflow_context.py
"""

import os
from pathlib import Path

REPO = Path("/Users/samprimeaux/inneranimalmedia")

FILES = [
    "src/core/workflow-executor.js",
    "src/core/agentsam-workflow-graph.js",
    "src/api/agentsam.js",
    "src/core/agent-step.js",
    "src/core/workflow-node-handlers.js",           # optional
    "dashboard/src/features/workflows/workflowTypes.ts",
    "dashboard/src/features/workflows/workflowApi.ts",
]

def dump():
    out = []
    out.append("=" * 70)
    out.append("WORKFLOW REMASTER — FILE CONTEXT DUMP")
    out.append("=" * 70)

    found, missing = [], []

    for rel in FILES:
        path = REPO / rel
        if not path.exists():
            missing.append(rel)
            out.append(f"\n// ── MISSING: {rel} ──")
            continue

        found.append(rel)
        size = path.stat().st_size
        lines = path.read_text(errors="replace").splitlines()
        out.append(f"\n{'─' * 70}")
        out.append(f"// FILE: {rel}  ({len(lines)} lines, {size:,} bytes)")
        out.append(f"{'─' * 70}")
        out.append(path.read_text(errors="replace"))

    out.append(f"\n{'=' * 70}")
    out.append(f"SUMMARY: {len(found)} files loaded, {len(missing)} missing")
    if missing:
        out.append("MISSING:")
        for m in missing:
            out.append(f"  - {m}")
    out.append("=" * 70)

    result = "\n".join(out)

    # Write to file so you can open/copy easily
    out_path = REPO / "scripts/maintenance/workflow_context_dump.txt"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(result)

    # Also print char/line count so you know what you're pasting
    total_lines = result.count("\n")
    total_chars = len(result)
    print(f"Dumped {len(found)} files → {out_path}")
    print(f"Total: {total_lines:,} lines / {total_chars:,} chars")
    print(f"Paste from: {out_path}")

if __name__ == "__main__":
    dump()
