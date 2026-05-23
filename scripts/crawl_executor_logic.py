#!/usr/bin/env python3
"""
crawl_executor_logic.py
-----------------------
Crawls the IAM Worker repo and extracts the exact live code for:
  - Thompson arm selection + fallback logic
  - Provider resolution (resolveModel / resolveModelForTask)
  - workflow-executor.js error handling paths
  - Any hardcoded provider/model strings

Usage:
    python3 crawl_executor_logic.py
    python3 crawl_executor_logic.py --repo /path/to/repo
    python3 crawl_executor_logic.py --json   # machine-readable output

Output: prints each finding with file path + line numbers + the exact code block.
"""

import os
import re
import sys
import json
import argparse
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_REPO = Path("/Users/samprimeaux/inneranimalmedia")

# Files to always read in full (high signal, small files)
PRIORITY_FILES = [
    "src/core/resolveModel.js",
    "src/core/workflow-executor.js",
    "src/core/workflow-node-handlers.js",
    "src/api/agent.js",
    "src/integrations/hyperdrive.js",
]

# Directories to crawl for pattern matches
CRAWL_DIRS = ["src"]

# File extensions to include
INCLUDE_EXTS = {".js", ".ts", ".mjs"}

# ── Patterns we're hunting for ─────────────────────────────────────────────

PATTERNS = {
    "fallback_call": re.compile(
        r"fallback|fall_back|fallbackModel|fallback_model", re.IGNORECASE
    ),
    "provider_hardcode": re.compile(
        r"""['"](?:openai|anthropic|google|workers_ai|cloudflare)['"]""",
        re.IGNORECASE,
    ),
    "model_hardcode": re.compile(
        r"""['"](?:gpt-5\.4|gpt-4|claude-|gemini-|llama)""",
        re.IGNORECASE,
    ),
    "error_catch_provider": re.compile(
        r"catch|\.status\s*===?\s*4|ProviderError|ApiError|404|429|5[0-9]{2}",
        re.IGNORECASE,
    ),
    "thompson_select": re.compile(
        r"thompson|select.*arm|routing_arm|success_alpha|success_beta|beta_sample",
        re.IGNORECASE,
    ),
    "resolve_model": re.compile(
        r"resolveModel|resolveModelForTask|getProvider|providerFor|catalogRow",
        re.IGNORECASE,
    ),
    "callModel": re.compile(
        r"callModel|callLLM|callProvider|runModel|invokeModel|dispatchModel",
        re.IGNORECASE,
    ),
    "penalize_arm": re.compile(
        r"penaliz|success_beta.*\+|beta.*\+\s*1|arm.*fail|fail.*arm",
        re.IGNORECASE,
    ),
}

CONTEXT_LINES = 8   # lines before + after a match to include


# ── Helpers ──────────────────────────────────────────────────────────────────

def read_file(path: Path) -> list[str] | None:
    try:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception as e:
        print(f"  [WARN] Cannot read {path}: {e}", file=sys.stderr)  # always stderr
        return None


def find_matches(lines: list[str], pattern: re.Pattern) -> list[dict]:
    """Return list of {line_no, snippet} dicts for lines matching pattern."""
    hits = []
    for i, line in enumerate(lines):
        if pattern.search(line):
            start = max(0, i - CONTEXT_LINES)
            end = min(len(lines), i + CONTEXT_LINES + 1)
            hits.append({
                "line": i + 1,
                "match": line.rstrip(),
                "context": lines[start:end],
                "context_start": start + 1,
            })
    return hits


def dedupe_hits(hits: list[dict]) -> list[dict]:
    """Merge overlapping context windows."""
    if not hits:
        return []
    merged = [hits[0]]
    for h in hits[1:]:
        prev = merged[-1]
        prev_end = prev["context_start"] + len(prev["context"])
        if h["context_start"] <= prev_end:
            # Extend previous window
            new_end = max(prev_end, h["context_start"] + len(h["context"]))
            merged[-1]["context"] = (
                prev["context"] + h["context"][prev_end - h["context_start"]:]
            )
        else:
            merged.append(h)
    return merged


def format_block(lines: list[str], start_line: int, path: Path) -> str:
    numbered = "\n".join(
        f"  {start_line + i:4d}│ {line}" for i, line in enumerate(lines)
    )
    return f"\n  ── {path} (L{start_line}–{start_line + len(lines) - 1}) ──\n{numbered}"


# ── Main crawler ──────────────────────────────────────────────────────────────

def crawl(repo: Path, as_json: bool = False):
    findings: dict[str, list] = {k: [] for k in PATTERNS}
    full_reads: dict[str, str] = {}

    # All status output goes to stderr so stdout stays clean for --json
    def log(*args, **kwargs):
        print(*args, **kwargs, file=sys.stderr)

    if not repo.exists():
        log(f"ERROR: repo not found at {repo}")
        log("Pass --repo /correct/path if different location.")
        sys.exit(1)

    # ── Step 1: Read priority files in full ──────────────────────────────────
    log(f"\n{'═'*70}")
    log(f"  IAM EXECUTOR CODE CRAWLER")
    log(f"  Repo: {repo}")
    log(f"{'═'*70}\n")

    log("▶ PRIORITY FILES (full read)\n")
    for rel in PRIORITY_FILES:
        fpath = repo / rel
        if not fpath.exists():
            log(f"  ✗ NOT FOUND: {rel}")
            continue
        lines = read_file(fpath)
        if lines is None:
            continue
        log(f"  ✓ {rel}  ({len(lines)} lines)")
        full_reads[rel] = "\n".join(lines)

        # Run all patterns on priority files
        for pname, pat in PATTERNS.items():
            hits = find_matches(lines, pat)
            if hits:
                merged = dedupe_hits(hits)
                for h in merged:
                    findings[pname].append({
                        "file": rel,
                        "line": h["line"],
                        "context": h["context"],
                        "context_start": h["context_start"],
                    })

    # ── Step 2: Crawl src/ for remaining pattern matches ─────────────────────
    log("\n▶ CRAWLING src/ for patterns\n")
    crawled = 0
    for crawl_dir in CRAWL_DIRS:
        d = repo / crawl_dir
        if not d.exists():
            log(f"  ✗ dir not found: {crawl_dir}")
            continue
        for fpath in sorted(d.rglob("*")):
            if fpath.suffix not in INCLUDE_EXTS:
                continue
            rel = str(fpath.relative_to(repo))
            if rel in PRIORITY_FILES:
                continue  # already done
            lines = read_file(fpath)
            if lines is None:
                continue
            crawled += 1
            for pname, pat in PATTERNS.items():
                hits = find_matches(lines, pat)
                if hits:
                    merged = dedupe_hits(hits)
                    for h in merged:
                        findings[pname].append({
                            "file": rel,
                            "line": h["line"],
                            "context": h["context"],
                            "context_start": h["context_start"],
                        })
    log(f"  Crawled {crawled} additional files\n")

    # ── Output ────────────────────────────────────────────────────────────────
    if as_json:
        # Machine-readable: include full priority file contents + findings
        out = {
            "repo": str(repo),
            "priority_files": full_reads,
            "findings": findings,
        }
        print(json.dumps(out, indent=2))
        return

    # Human-readable report
    LABELS = {
        "fallback_call":        "FALLBACK LOGIC",
        "provider_hardcode":    "HARDCODED PROVIDER STRINGS",
        "model_hardcode":       "HARDCODED MODEL STRINGS",
        "error_catch_provider": "ERROR / CATCH PATHS (4xx, 5xx, provider errors)",
        "thompson_select":      "THOMPSON ARM SELECTION",
        "resolve_model":        "MODEL/PROVIDER RESOLUTION",
        "callModel":            "MODEL CALL SITES",
        "penalize_arm":         "ARM PENALIZATION",
    }

    print(f"\n{'═'*70}")
    print("  FINDINGS BY PATTERN")
    print(f"{'═'*70}")

    for pname, label in LABELS.items():
        hits = findings[pname]
        # Dedupe by file+context_start
        seen = set()
        unique = []
        for h in hits:
            key = (h["file"], h["context_start"])
            if key not in seen:
                seen.add(key)
                unique.append(h)

        print(f"\n{'─'*70}")
        print(f"  [{label}]  —  {len(unique)} location(s)")
        print(f"{'─'*70}")

        if not unique:
            print("  (none found)")
            continue

        # Group by file
        by_file: dict[str, list] = {}
        for h in unique:
            by_file.setdefault(h["file"], []).append(h)

        for fname, file_hits in sorted(by_file.items()):
            for h in file_hits:
                block = format_block(
                    h["context"],
                    h["context_start"],
                    Path(fname),
                )
                print(block)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'═'*70}")
    print("  SUMMARY")
    print(f"{'═'*70}")
    for pname, label in LABELS.items():
        count = len(set(
            (h["file"], h["context_start"]) for h in findings[pname]
        ))
        flag = "⚠" if pname in ("provider_hardcode", "model_hardcode") and count > 0 else " "
        print(f"  {flag} {label:<48} {count:>4} location(s)")

    print(f"\n  Priority files read: {len(full_reads)}/{len(PRIORITY_FILES)}")
    not_found = [r for r in PRIORITY_FILES if r not in full_reads]
    if not_found:
        print("  Missing priority files:")
        for f in not_found:
            print(f"    ✗ {f}")
    print()


# ── Entry ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Crawl IAM repo for executor/fallback/provider logic"
    )
    parser.add_argument(
        "--repo",
        type=Path,
        default=DEFAULT_REPO,
        help=f"Path to inneranimalmedia repo (default: {DEFAULT_REPO})",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output machine-readable JSON (includes full priority file contents)",
    )
    args = parser.parse_args()
    crawl(repo=args.repo, as_json=args.json)
