#!/usr/bin/env python3
"""
analyze_executor.py
-------------------
Pipe the crawler output into this script. It chunks the findings,
sends targeted sections to GPT-5.4-mini, and returns an exact patch plan.

Usage (pipe):
    python3 scripts/crawl_executor_logic.py --json | python3 scripts/analyze_executor.py

Usage (from saved file):
    python3 scripts/analyze_executor.py --input /tmp/executor_findings.json

Reads OPENAI_API_KEY from env or .env.cloudflare / agentsam.local.env
Output: structured patch plan with exact file + line + replacement code.
"""

import os
import re
import sys
import json
import argparse
import textwrap
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

# ── Config ────────────────────────────────────────────────────────────────────

REPO_ROOT   = Path("/Users/samprimeaux/inneranimalmedia")
MODEL       = "gpt-4o-mini"
API_URL     = "https://api.openai.com/v1/chat/completions"
MAX_TOKENS  = 2048
CHUNK_LINES = 60
MAX_CONTEXT_HITS = 12  # cap hits per pattern to avoid 429

# Env files to search for API key (in priority order)
ENV_FILES = [
    REPO_ROOT / "agentsam.local.env",
    REPO_ROOT / ".env.cloudflare",
    REPO_ROOT / ".env",
]

# The focused questions we ask GPT about each section
ANALYSIS_TASKS = {
    "callModel_site": {
        "label": "THE SINGLE callModel SITE",
        "prompt": (
            "This is the only place in the codebase that actually calls a model. "
            "Show me: (1) the exact function signature, (2) how the provider is currently "
            "determined — is it hardcoded or looked up? (3) where the try/catch is relative "
            "to this call, (4) whether there is ANY fallback logic here or if a provider "
            "error just throws. Be surgical — exact line references."
        ),
    },
    "fallback_call": {
        "label": "FALLBACK LOGIC",
        "prompt": (
            "Analyze all fallback references. Tell me: (1) Is there a single fallback "
            "code path or are there duplicates? (2) Is the fallback actually reachable "
            "from the catch block when a provider returns 4xx/5xx, or is it dead code? "
            "(3) Is 'openai' or any provider hardcoded in the fallback path? "
            "(4) What is the exact fix needed — file, function, line range."
        ),
    },
    "provider_hardcode": {
        "label": "HARDCODED PROVIDER STRINGS",
        "prompt": (
            "List every hardcoded provider string ('openai', 'anthropic', 'google', 'workers_ai'). "
            "For each one: (1) is it in a hot path (called per request) or cold config? "
            "(2) what D1 table/column should replace it? (3) rank by risk: HIGH = breaks "
            "if provider changes, MEDIUM = degraded behavior, LOW = cosmetic/logging only. "
            "Focus on the executor and agent.js, not test or config files."
        ),
    },
    "error_catch_provider": {
        "label": "ERROR / CATCH PATHS",
        "prompt": (
            "Find the catch block(s) that handle provider API errors (404, 429, 5xx). "
            "Tell me: (1) Does the catch block penalize the failing Thompson arm "
            "(success_beta += 1)? (2) Does it trigger a fallback model call? "
            "(3) If neither — show exactly where these two things need to be added. "
            "Give the exact code to insert, not a description."
        ),
    },
    "penalize_arm": {
        "label": "ARM PENALIZATION",
        "prompt": (
            "Show the arm penalization code. Is it: (1) inside the catch block so it "
            "fires on every provider error, or (2) only called on explicit failure signals? "
            "(3) Is the D1 UPDATE actually awaited? (4) Does it correctly increment "
            "success_beta (not decrement success_alpha)? Show the exact code and "
            "any fix needed."
        ),
    },
    "resolve_model": {
        "label": "MODEL/PROVIDER RESOLUTION",
        "prompt": (
            "Show resolveModelForTask or equivalent. Does it: (1) look up provider from "
            "agentsam_model_catalog via D1, or hardcode it? (2) get called by the fallback "
            "path, or only the primary path? (3) What is the exact call signature and "
            "return shape? Paste the function body if under 40 lines."
        ),
    },
}

# ── API key loader ────────────────────────────────────────────────────────────

def load_api_key() -> str:
    # 1. Environment
    key = os.environ.get("OPENAI_API_KEY", "")
    if key:
        return key

    # 2. .env files
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for line in env_file.read_text(errors="replace").splitlines():
            line = line.strip()
            if line.startswith("OPENAI_API_KEY"):
                parts = line.split("=", 1)
                if len(parts) == 2:
                    val = parts[1].strip().strip('"').strip("'")
                    if val:
                        return val

    print("ERROR: OPENAI_API_KEY not found in env or .env files.", file=sys.stderr)
    print("Set it with: export OPENAI_API_KEY=sk-...", file=sys.stderr)
    sys.exit(1)


# ── GPT call (stdlib only — no openai package needed) ────────────────────────

def call_gpt(system: str, user: str, api_key: str) -> str:
    payload = json.dumps({
        "model": MODEL,
        "max_completion_tokens": MAX_TOKENS,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    }).encode()

    req = Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
    except HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"  [GPT ERROR] HTTP {e.code}: {body[:300]}", file=sys.stderr)
        return f"[ERROR: HTTP {e.code}]"
    except URLError as e:
        print(f"  [GPT ERROR] {e.reason}", file=sys.stderr)
        return f"[ERROR: {e.reason}]"


# ── Chunk builder ─────────────────────────────────────────────────────────────

def build_section(findings: dict, key: str, priority_files: dict) -> str:
    """Build a focused text block for a given pattern key."""
    hits = findings.get(key, [])
    if not hits:
        return "(no matches found in codebase)"

    # Dedupe by file + context_start, cap at MAX_CONTEXT_HITS to avoid TPM 429
    seen = set()
    unique = []
    for h in hits:
        k = (h["file"], h["context_start"])
        if k not in seen:
            seen.add(k)
            unique.append(h)
    # Prioritise priority files, then cap
    priority = [h for h in unique if h["file"] in (
        "src/core/workflow-executor.js", "src/core/resolveModel.js",
        "src/core/workflow-node-handlers.js"
    )]
    rest = [h for h in unique if h not in priority]
    unique = (priority + rest)[:MAX_CONTEXT_HITS]

    # Group by file
    by_file: dict[str, list] = {}
    for h in unique:
        by_file.setdefault(h["file"], []).append(h)

    parts = []
    for fname, file_hits in sorted(by_file.items()):
        parts.append(f"\n### {fname}")
        for h in file_hits:
            start = h["context_start"]
            lines = h["context"]
            numbered = "\n".join(
                f"{start + i:4d}| {line}" for i, line in enumerate(lines)
            )
            parts.append(numbered)

    return "\n".join(parts)


def build_full_file_section(priority_files: dict, filename: str) -> str:
    content = priority_files.get(filename, "")
    if not content:
        return f"(file not found: {filename})"
    lines = content.splitlines()
    numbered = "\n".join(f"{i+1:4d}| {l}" for i, l in enumerate(lines))
    return f"### {filename} ({len(lines)} lines)\n{numbered}"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=None,
                        help="JSON file from crawler (default: read stdin)")
    parser.add_argument("--task", type=str, default=None,
                        choices=list(ANALYSIS_TASKS.keys()),
                        help="Run only one analysis task")
    parser.add_argument("--full-files", action="store_true",
                        help="Send full priority file contents instead of filtered snippets")
    args = parser.parse_args()

    # ── Load crawler output ───────────────────────────────────────────────────
    print("▶ Loading crawler output...", file=sys.stderr)
    if args.input:
        raw = args.input.read_text()
    else:
        raw = sys.stdin.read()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: invalid JSON from crawler: {e}", file=sys.stderr)
        sys.exit(1)

    findings      = data.get("findings", {})
    priority_files = data.get("priority_files", {})
    repo          = data.get("repo", str(REPO_ROOT))

    print(f"  Repo: {repo}", file=sys.stderr)
    print(f"  Priority files loaded: {list(priority_files.keys())}", file=sys.stderr)
    print(f"  Pattern keys: {list(findings.keys())}", file=sys.stderr)

    api_key = load_api_key()
    print(f"  Model: {MODEL}  ✓ API key loaded\n", file=sys.stderr)

    # ── System prompt ─────────────────────────────────────────────────────────
    system_prompt = textwrap.dedent(f"""
        You are a senior Cloudflare Workers engineer auditing the Agent Sam IAM platform
        (inneranimalmedia.com). The codebase is a JS/TS Cloudflare Worker with:
        - Thompson sampling arm selection in D1 (agentsam_routing_arms)
        - agentsam_model_catalog table mapping model_key → provider
        - workflow-executor.js orchestrating multi-step AI workflows
        - resolveModel.js (or resolveModelForTask) for model/provider resolution
        - The known bug: when a Thompson arm returns a 4xx/5xx provider error,
          the fallback_model_key is NOT used and the workflow crashes

        Your job: give SURGICAL, EXACT answers. Line numbers. Function names.
        Code to copy-paste. No vague descriptions. If you see 'openai' hardcoded
        where it should come from agentsam_model_catalog, flag it with the fix.
        Format findings as:

        ## FINDING: <title>
        **File:** src/...  **Lines:** N–M
        **Problem:** one sentence
        **Fix:** exact code replacement (before/after blocks)
    """).strip()

    # ── Run tasks ─────────────────────────────────────────────────────────────
    tasks_to_run = (
        {args.task: ANALYSIS_TASKS[args.task]}
        if args.task
        else ANALYSIS_TASKS
    )

    results = {}
    for key, task in tasks_to_run.items():
        print(f"▶ Analyzing: {task['label']}...", file=sys.stderr)

        if args.full_files and key in ("callModel_site", "resolve_model"):
            # For the call site and resolver, send full file for precision
            section = build_full_file_section(
                priority_files, "src/core/workflow-executor.js"
            )
            if key == "resolve_model":
                section += "\n\n" + build_full_file_section(
                    priority_files, "src/core/resolveModel.js"
                )
        else:
            section = build_section(findings, key, priority_files)

        user_msg = (
            f"TASK: {task['prompt']}\n\n"
            f"CODE (from {repo}):\n"
            f"{section}"
        )

        answer = call_gpt(system_prompt, user_msg, api_key)
        results[key] = {"label": task["label"], "answer": answer}
        print(f"  ✓ done ({len(answer)} chars)", file=sys.stderr)

    # ── Final synthesis ───────────────────────────────────────────────────────
    if len(tasks_to_run) > 1:
        print("▶ Synthesizing patch plan...", file=sys.stderr)
        synthesis_input = "\n\n---\n\n".join(
            f"## {v['label']}\n{v['answer']}" for v in results.values()
        )
        synthesis_prompt = textwrap.dedent("""
            Based on all the findings above, produce a FINAL PATCH PLAN:
            1. Ordered list of files to change (highest risk first)
            2. For each file: exact function/line, before code, after code
            3. The single most important fix that unblocks the Thompson fallback
            4. Any D1 migrations needed (UPDATE agentsam_workflow_handlers etc.)
            5. Validation command to confirm the fix worked

            Be terse. Code blocks only. No prose padding.
        """).strip()

        synthesis = call_gpt(system_prompt, f"{synthesis_input}\n\n{synthesis_prompt}", api_key)
        results["synthesis"] = {"label": "FINAL PATCH PLAN", "answer": synthesis}
        print("  ✓ synthesis done", file=sys.stderr)

    # ── Print report to stdout ────────────────────────────────────────────────
    print(f"\n{'═'*70}")
    print(f"  EXECUTOR ANALYSIS — {MODEL}")
    print(f"  Repo: {repo}")
    print(f"{'═'*70}\n")

    for key, result in results.items():
        print(f"\n{'─'*70}")
        print(f"  {result['label']}")
        print(f"{'─'*70}\n")
        print(result["answer"])

    print(f"\n{'═'*70}\n")


if __name__ == "__main__":
    main()
