#!/usr/bin/env python3
"""
routing_audit.py
----------------
Greps the live Worker codebase (src/ only) for:
  - Legacy:   model_routing_rules, mcp_registered_tools
  - Current:  agentsam_routing_arms, agentsam_route_requirements, agentsam_mcp_tools
  - Broken:   classifyIntent, selectAutoModel
Prints full file:line context so we can pin the fix.

Run from repo root: python3 scripts/routing_audit.py
"""

from pathlib import Path

REPO = Path("/Users/samprimeaux/inneranimalmedia")
SCAN = REPO / "src"
EXTS = {".js", ".ts"}

TARGETS = {
    "LEGACY — model_routing_rules":       "model_routing_rules",
    "LEGACY — mcp_registered_tools":      "mcp_registered_tools",
    "CURRENT — agentsam_routing_arms":    "agentsam_routing_arms",
    "CURRENT — agentsam_route_requirements": "agentsam_route_requirements",
    "CURRENT — agentsam_mcp_tools":       "agentsam_mcp_tools",
    "BROKEN — classifyIntent":            "classifyIntent",
    "BROKEN — selectAutoModel":           "selectAutoModel",
}

CONTEXT_LINES = 4  # lines before/after each match

def grep_file(path: Path, term: str) -> list[dict]:
    hits = []
    try:
        lines = path.read_text(errors="ignore").splitlines()
        for i, line in enumerate(lines):
            if term in line:
                start = max(0, i - CONTEXT_LINES)
                end   = min(len(lines), i + CONTEXT_LINES + 1)
                hits.append({
                    "line_no": i + 1,
                    "match":   line,
                    "context": lines[start:end],
                    "ctx_start": start + 1,
                })
    except Exception:
        pass
    return hits

def scan(term: str) -> dict[str, list[dict]]:
    results = {}
    for f in sorted(SCAN.rglob("*")):
        if f.is_file() and f.suffix in EXTS:
            hits = grep_file(f, term)
            if hits:
                results[str(f.relative_to(REPO))] = hits
    return results

def print_section(label: str, term: str, results: dict):
    total_hits = sum(len(h) for h in results.values())
    print(f"\n{'═'*72}")
    print(f"  {label}")
    print(f"  term: \"{term}\"   files: {len(results)}   hits: {total_hits}")
    print(f"{'═'*72}")
    if not results:
        print("  (none found)")
        return
    for filepath, hits in results.items():
        print(f"\n  ── {filepath}")
        for hit in hits:
            print(f"     Line {hit['line_no']:>4}: {hit['match'].strip()}")
            if label.startswith("BROKEN"):
                # For broken systems print full context
                print()
                for idx, ctx_line in enumerate(hit["context"]):
                    ln = hit["ctx_start"] + idx
                    marker = ">>>" if ln == hit["line_no"] else "   "
                    print(f"       {marker} {ln:>4} | {ctx_line}")
                print()

def main():
    print("=" * 72)
    print("  ROUTING AUDIT — legacy refs + classifyIntent + selectAutoModel")
    print(f"  Scanning: {SCAN}")
    print("=" * 72)

    all_results = {}
    for label, term in TARGETS.items():
        results = scan(term)
        all_results[label] = (term, results)

    for label, (term, results) in all_results.items():
        print_section(label, term, results)

    # Summary table
    print(f"\n{'═'*72}")
    print("  SUMMARY")
    print(f"{'═'*72}")
    for label, (term, results) in all_results.items():
        total = sum(len(h) for h in results.values())
        files = len(results)
        flag = ""
        if "LEGACY" in label and total > 0:
            flag = " <-- NEEDS REPLACEMENT"
        if "BROKEN" in label and total == 0:
            flag = " <-- NOT FOUND (may be in index.js or missing entirely)"
        if "BROKEN" in label and total > 0:
            flag = " <-- FOUND, SEE ABOVE FOR FIX LOCATION"
        if "CURRENT" in label and total == 0:
            flag = " <-- NEVER REFERENCED IN CODE"
        print(f"  {'hits':>4} in {'files':>2} files  |  {label}{flag}")

    print()

if __name__ == "__main__":
    main()
