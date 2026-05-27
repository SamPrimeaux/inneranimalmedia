#!/usr/bin/env python3
"""
cms_pass1_inspect.py
Pass 1 replacement — runs locally, zero API cost.
Reads the four source files and emits a structured markdown report
that becomes the context block for passes 2-5.

Usage:
    python3 cms_pass1_inspect.py [repo_root]
    python3 cms_pass1_inspect.py ~/inneranimalmedia

Output:
    cms_pass1_report.md  (same directory as this script)
    Also printed to stdout.
"""

import re
import sys
import json
from pathlib import Path
from datetime import datetime

# ── config ────────────────────────────────────────────────────────────────────

REPO_ROOT = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / "inneranimalmedia"

TARGET_FILES = {
    "index":       REPO_ROOT / "src" / "index.js",
    "cms_api":     REPO_ROOT / "src" / "api" / "cms_api.js",
    "shell":       REPO_ROOT / "src" / "api" / "_shell.js",
    "render_home": REPO_ROOT / "src" / "api" / "render_home.js",
}

OUTPUT_FILE = Path(__file__).parent / "cms_pass1_report.md"

# ── helpers ───────────────────────────────────────────────────────────────────

def read(path: Path) -> str:
    if not path.exists():
        return f"[FILE NOT FOUND: {path}]"
    return path.read_text(encoding="utf-8", errors="replace")


def lines(src: str) -> list[str]:
    return src.splitlines()


def extract_block(src: str, start_pattern: str, max_lines: int = 60) -> str:
    """
    Find the line matching start_pattern, then collect until the
    brace depth returns to 0 (or max_lines exceeded).
    Returns the raw block with line numbers.
    """
    src_lines = lines(src)
    start_re = re.compile(start_pattern, re.IGNORECASE)
    result = []
    capturing = False
    depth = 0
    captured = 0

    for i, line in enumerate(src_lines, 1):
        if not capturing and start_re.search(line):
            capturing = True

        if capturing:
            result.append(f"{i:4d}  {line}")
            depth += line.count("{") - line.count("}")
            captured += 1
            if captured > 3 and depth <= 0:
                break
            if captured >= max_lines:
                result.append("      ... (truncated)")
                break

    return "\n".join(result) if result else "(not found)"


def find_exports(src: str) -> list[str]:
    """Return all export function/const names."""
    return re.findall(
        r'export\s+(?:async\s+)?(?:function|const)\s+(\w+)',
        src
    )


def find_public_routes(src: str) -> list[dict]:
    """
    From index.js: find route checks like
      pathname === '/about'  or  pathname.startsWith('/api/')
    and collect the surrounding handler shape (inline / function call).
    """
    route_re = re.compile(
        r"pathname\s*(?:===|!==|\.startsWith\()\s*['\"]([^'\"]+)['\"]",
        re.IGNORECASE
    )
    results = []
    src_lines = lines(src)
    seen = set()

    for i, line in enumerate(src_lines):
        for m in route_re.finditer(line):
            route = m.group(1)
            if route in seen:
                continue
            seen.add(route)
            # grab context: 2 lines before, the match line, 3 lines after
            start = max(0, i - 2)
            end   = min(len(src_lines), i + 4)
            snippet = "\n".join(f"{j+1:4d}  {src_lines[j]}" for j in range(start, end))
            results.append({"route": route, "line": i + 1, "snippet": snippet})

    return results


def find_kv_r2_accesses(src: str, label: str) -> list[str]:
    """Find env.KV_NAME.get / env.R2.get / env.R2.put patterns."""
    found = re.findall(r'env\.(\w+)\.(get|put|delete|list)\(', src)
    return sorted(set(f"env.{b}.{m}()" for b, m in found))


def find_function_signatures(src: str) -> list[str]:
    """Top-level async function / export function signatures (one-liners)."""
    sigs = re.findall(
        r'^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)',
        src,
        re.MULTILINE
    )
    return sigs


def find_imports(src: str) -> list[str]:
    return re.findall(r'^import\s+.+$', src, re.MULTILINE)


def find_helpers_in_shell(src: str) -> dict:
    """Extract exported helper names + first line of their body."""
    result = {}
    fn_re = re.compile(
        r'export\s+(?:async\s+)?(?:function|const)\s+(\w+)[^{]*\{',
        re.MULTILINE
    )
    src_lines = lines(src)
    for m in fn_re.finditer(src):
        name = m.group(1)
        line_no = src[:m.start()].count("\n")
        # grab up to 5 lines of body for a taste
        body_lines = src_lines[line_no: line_no + 6]
        result[name] = "\n".join(f"  {l}" for l in body_lines)
    return result


def find_render_home_shape(src: str) -> dict:
    return {
        "imports":    find_imports(src),
        "exports":    find_exports(src),
        "kv_r2":      find_kv_r2_accesses(src, "render_home"),
        "signatures": find_function_signatures(src),
    }


def find_publish_handler(src: str) -> str:
    """Extract the /api/cms/publish handler block."""
    # Try route string match first
    block = extract_block(src, r"['\"]\/api\/cms\/publish['\"]", max_lines=70)
    if "(not found)" in block:
        # fallback: look for 'publish' near a POST check
        block = extract_block(src, r"publish", max_lines=70)
    return block


def find_insertion_candidates(index_src: str) -> list[str]:
    """
    Find the lines in index.js that look like the end of the
    API/auth routing block and the start of public page fallback.
    Good spots to insert KV/R2 serving logic.
    """
    candidates = []
    src_lines = lines(index_src)
    patterns = [
        re.compile(r"hardcoded|fallback|static\s+page|return.*html", re.IGNORECASE),
        re.compile(r"return\s+new\s+Response.*text/html", re.IGNORECASE),
        re.compile(r"render_home|renderHome", re.IGNORECASE),
        re.compile(r"404|not\s*found", re.IGNORECASE),
    ]
    for i, line in enumerate(src_lines):
        for p in patterns:
            if p.search(line):
                start = max(0, i - 2)
                end   = min(len(src_lines), i + 4)
                snippet = "\n".join(f"{j+1:4d}  {src_lines[j]}" for j in range(start, end))
                candidates.append(snippet)
                break

    # deduplicate by first line number
    seen = set()
    deduped = []
    for c in candidates:
        key = c.split("\n")[0]
        if key not in seen:
            seen.add(key)
            deduped.append(c)
    return deduped[:6]  # top 6 candidates max


# ── main ──────────────────────────────────────────────────────────────────────

def build_report() -> str:
    srcs = {k: read(v) for k, v in TARGET_FILES.items()}
    missing = [k for k, v in srcs.items() if v.startswith("[FILE NOT FOUND")]

    lines_count = {k: len(lines(v)) for k, v in srcs.items()}

    sections = []

    # ── header
    sections.append(f"""# CMS Pass 1 Inspection Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}
Repo: `{REPO_ROOT}`

## File Status
""" + "\n".join(
        f"- {'✅' if not srcs[k].startswith('[FILE') else '❌'} `{v}` — {lines_count[k]} lines"
        for k, v in TARGET_FILES.items()
    ))

    if missing:
        sections.append(f"\n⚠️  Missing files: {', '.join(missing)}\nPasses 2-5 will need adjustment.\n")

    # ── 1. Public route map from index.js
    public_routes = find_public_routes(srcs["index"])
    route_table = "\n".join(
        f"| `{r['route']}` | line {r['line']} |"
        for r in public_routes
    )
    sections.append(f"""
---
## 1. Public Routes in `src/index.js`

| Route | Line |
|-------|------|
{route_table}

### KV / R2 accesses in index.js
{chr(10).join("- " + x for x in find_kv_r2_accesses(srcs["index"], "index")) or "- none found"}
""")

    # ── 2. /api/cms/publish handler
    sections.append(f"""---
## 2. `/api/cms/publish` Handler (from `cms_api.js`)

```js
{find_publish_handler(srcs["cms_api"])}
```
""")

    # ── 3. Reusable helpers from _shell.js
    shell_helpers = find_helpers_in_shell(srcs["shell"])
    helper_blocks = "\n\n".join(
        f"### `{name}()`\n```js\n{body}\n```"
        for name, body in list(shell_helpers.items())[:12]
    )
    sections.append(f"""---
## 3. Reusable Helpers in `src/api/_shell.js`

Exported names: {', '.join(f'`{n}`' for n in shell_helpers.keys())}

{helper_blocks}
""")

    # ── 4. render_home.js shape
    rh = find_render_home_shape(srcs["render_home"])
    sections.append(f"""---
## 4. `render_home.js` Pattern (reference implementation)

### Imports
{chr(10).join("- " + i for i in rh["imports"]) or "- none"}

### Exports
{chr(10).join("- `" + e + "`" for e in rh["exports"]) or "- none"}

### KV / R2 accesses
{chr(10).join("- " + x for x in rh["kv_r2"]) or "- none found"}

### Function signatures
```js
{chr(10).join(rh["signatures"]) or "// none found"}
```
""")

    # ── 5. Safe insertion points in index.js
    candidates = find_insertion_candidates(srcs["index"])
    candidate_blocks = "\n\n".join(
        f"**Candidate {i+1}**\n```js\n{c}\n```"
        for i, c in enumerate(candidates)
    )
    sections.append(f"""---
## 5. Safe Insertion Points in `src/index.js`

These are the lines near hardcoded page fallback / 404 / renderHome — where KV/R2 serving logic for /about, /adopt, /services, /donate should be inserted (Pass 5).

{candidate_blocks}
""")

    # ── 6. Codex context block (paste-ready for passes 2-5)
    sections.append(f"""---
## 6. Paste-Ready Context Block for Passes 2–5

Copy the block below into the `## Context from Pass 1` section of each pass prompt.

```
PASS 1 FINDINGS SUMMARY
========================
render_home.js exports: {', '.join(rh['exports'])}
_shell.js helpers:      {', '.join(shell_helpers.keys())}
index.js public routes: {', '.join(r['route'] for r in public_routes if not r['route'].startswith('/api'))}
KV bindings in use:     {', '.join(set(re.findall(r'env\.(\w+)\.get', srcs['index'])))}
R2 bindings in use:     {', '.join(set(re.findall(r'env\.(\w+)\.(?:put|get)', srcs['render_home'])))}
publish handler:        {'FOUND' if '(not found)' not in find_publish_handler(srcs['cms_api']) else 'NOT FOUND — search manually'}
hardcoded page pattern: see Section 5 candidates above
```
""")

    return "\n".join(sections)


if __name__ == "__main__":
    print(f"Reading from: {REPO_ROOT}\n")

    for k, p in TARGET_FILES.items():
        status = "✅" if p.exists() else "❌ MISSING"
        print(f"  {status}  {p}")

    print()
    report = build_report()
    OUTPUT_FILE.write_text(report, encoding="utf-8")
    print(report)
    print(f"\n✅ Report written to: {OUTPUT_FILE}")
