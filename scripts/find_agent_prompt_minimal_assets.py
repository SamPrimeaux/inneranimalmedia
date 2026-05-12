#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path.cwd()

SEARCH_ROOTS = [
    ROOT / "src",
    ROOT / "scripts",
    ROOT / "worker.js",
    ROOT / "wrangler.production.toml",
    ROOT / "wrangler.toml",
]

EXTS = {
    ".js", ".ts", ".mjs", ".cjs",
    ".jsx", ".tsx",
    ".sql", ".json", ".toml",
    ".md", ".txt",
}

PATTERNS = {
    # Exact minimal route / prompt lane
    "simple route key": r"simple_ask_greeting",
    "minimal prompt key": r"core_identity_minimal",
    "minimal prompt lane": r"minimal_ask",
    "simple ask detector": r"isSimpleAskMessage",

    # Prompt construction / bloat suspects
    "buildSystemPrompt": r"buildSystemPrompt",
    "system prompt fragment append": r"system_prompt_fragment",
    "contextBlock append": r"contextBlock",
    "python parallel block": r"AGENT_SAM_PYTHON_PARALLEL_BLOCK",
    "tenant layer learning": r"learning",
    "tenant layer shinshu": r"shinshu",
    "tenant layer client_work": r"client_work",

    # Route flags
    "include_rag": r"include_rag",
    "include active plan": r"include_active_plan",
    "include recent memory": r"include_recent_memory",
    "include workspace ctx": r"include_workspace_ctx",
    "max tools": r"max_tools",
    "token budget": r"token_budget",
    "prompt layer keys": r"prompt_layer_keys",

    # Heavy path suspects
    "rag vectorize": r"vectorize|memory search|includeRag|skipRag",
    "active plan fetch": r"fetchActivePlanContextFragment",
    "recent memory": r"recent_memory|includeMemory|includeRecentMemory",
    "workspace context": r"workspace_context|includeWorkspace|includeWorkspaceCtx",
    "tool loading": r"loadToolsForRequest|effectiveMaxTools|tool_count",

    # Route selection
    "resolve prompt route": r"resolveAgentsamPromptRoute",
    "prompt route override": r"prompt_route_override",
    "generic route match": r"intent_labels|trigger_keywords|route_key",

    # Audit/log proof
    "prompt audit": r"agent_prompt_audit",
    "system prompt chars": r"system_prompt_chars",
    "estimated system tokens": r"estimated_system_tokens",
    "layer keys audit": r"layer_keys",

    # Tables
    "prompt routes table": r"agentsam_prompt_routes",
    "prompt versions table": r"agentsam_prompt_versions",
    "mode configs table": r"agent_mode_configs",
}


def iter_files():
    seen = set()

    for root in SEARCH_ROOTS:
        if not root.exists():
            continue

        if root.is_file():
            files = [root]
        else:
            files = [
                p for p in root.rglob("*")
                if p.is_file()
                and p.suffix in EXTS
                and "node_modules" not in p.parts
                and ".git" not in p.parts
                and "dist" not in p.parts
                and "build" not in p.parts
            ]

        for p in files:
            rp = p.resolve()
            if rp in seen:
                continue
            seen.add(rp)
            yield p


def line_window(lines, idx, before=2, after=2):
    start = max(0, idx - before)
    end = min(len(lines), idx + after + 1)
    return start, end, lines[start:end]


def main():
    print("Agent Sam prompt/minimal route grep finder")
    print(f"root: {ROOT}")
    print()

    compiled = {
        label: re.compile(pattern, re.IGNORECASE)
        for label, pattern in PATTERNS.items()
    }

    hits = []

    for path in iter_files():
        try:
            text = path.read_text(errors="ignore")
        except Exception:
            continue

        lines = text.splitlines()

        for i, line in enumerate(lines):
            for label, rx in compiled.items():
                if rx.search(line):
                    hits.append((label, path, i + 1, line.strip()))

    if not hits:
        print("No hits found.")
        return

    # Summary by file
    print("== Files with related hits ==")
    by_file = {}
    for label, path, lineno, line in hits:
        by_file.setdefault(path, set()).add(label)

    for path, labels in sorted(by_file.items(), key=lambda x: str(x[0])):
        rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        print(f"- {rel}  [{', '.join(sorted(labels))}]")

    print("\n== Exact hits ==")
    for label, path, lineno, line in hits:
        rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        print(f"{rel}:{lineno}: [{label}] {line}")

    # Focused context around buildSystemPrompt and minimal route in src/api/agent.js
    agent = ROOT / "src" / "api" / "agent.js"
    if agent.exists():
        print("\n== Focused context: src/api/agent.js ==")
        text = agent.read_text(errors="ignore")
        lines = text.splitlines()

        focus_terms = [
            "function isSimpleAskMessage",
            "async function buildSystemPrompt",
            "simple_ask_greeting",
            "modeConfig?.system_prompt_fragment",
            "contextBlock",
            "AGENT_SAM_PYTHON_PARALLEL_BLOCK",
            "prompt_lane",
            "agent_prompt_audit",
        ]

        printed = set()
        for term in focus_terms:
            for idx, line in enumerate(lines):
                if term in line:
                    start, end, chunk = line_window(lines, idx, before=8, after=12)
                    key = (start, end)
                    if key in printed:
                        continue
                    printed.add(key)
                    print(f"\n--- {term} around lines {start + 1}-{end} ---")
                    for n, l in enumerate(chunk, start=start + 1):
                        print(f"{n:5d}: {l}")
                    break

    print("\n== Next likely patch targets ==")
    print("1. In buildSystemPrompt, define minimalAsk from route flags.")
    print("2. Guard modeConfig.system_prompt_fragment with !minimalAsk.")
    print("3. Guard contextBlock append with !minimalAsk.")
    print("4. Guard tenant layer pushes with !minimalAsk.")
    print("5. Verify hello drops to system_prompt_chars < 1000.")


if __name__ == "__main__":
    main()
