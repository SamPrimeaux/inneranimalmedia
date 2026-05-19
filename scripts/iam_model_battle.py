#!/usr/bin/env python3
"""
iam_model_battle.py
===================
Sends the 5 IAM dashboard bug plans to both Gemini 2.5 Flash and GPT-5.4-mini.
Each model receives the bug description + actual source lines and must produce
a surgical code patch. Outputs are saved side-by-side for comparison.

Usage:
  ./scripts/with-cloudflare-env.sh python3 scripts/iam_model_battle.py

Requirements:
  pip3 install openai google-generativeai httpx python-dotenv

Env vars:
  OPENAI_API_KEY
  GEMINI_API_KEY        (Google AI Studio key)
"""

import os
import sys
import json
import time
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

import google.genai as genai
from openai import OpenAI

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent / ".env.cloudflare")
load_dotenv(Path(__file__).parent.parent / ".env")

REPO_ROOT   = Path(__file__).parent.parent.resolve()
GPT_MODEL   = "gpt-5.4-mini"
GEM_MODEL   = "gemini-2.5-flash"
OUTPUT_DIR  = REPO_ROOT / "scripts" / "battle_results"

# ── The 5 bug plans from the audit ───────────────────────────────────────────

PLANS = [
    {
        "id": "plan_github_scoping",
        "title": "Fix GitHub repo workspace scoping",
        "diagnosis": "GitHub repo listing has no workspace_id filter, so Connor sees Sam's repos.",
        "tasks": [
            {"file": "src/api/agent.js",                          "lines": (7921, 8040), "action": "Add workspace_id filter to /api/agent/git/repos handler and linkedRows query"},
            {"file": "dashboard/components/GitHubExplorer.tsx",   "lines": (221,  340),  "action": "Key repo cache/state by workspace_id so stale repos don't leak across workspaces"},
        ],
    },
    {
        "id": "plan_r2_fetch",
        "title": "Fix R2 explorer object fetch routing",
        "diagnosis": "Explorer lists bound buckets but object GET/HEAD/list returns empty — binding resolver is too narrow.",
        "tasks": [
            {"file": "src/api/r2-api.js",                         "lines": (1,   120),   "action": "Verify resolveR2Access/getR2Binding cover all bound labels and legacy aliases"},
            {"file": "src/api/r2-api.js",                         "lines": (520,  760),  "action": "Fix GET/HEAD/list to use binding-first then S3 fallback, never return empty"},
            {"file": "src/tools/r2-dispatch.js",                  "lines": (1,   120),   "action": "Replace direct env[bucket.toUpperCase()] with shared R2 binding resolver"},
            {"file": "dashboard/components/LocalExplorer.tsx",    "lines": (441,  560),  "action": "Confirm openR2Key/loadR2List pass bucket name unchanged, no hardcoded bucket"},
        ],
    },
    {
        "id": "plan_d1_routing",
        "title": "Fix agent D1 routing — stop Monaco workflow hijack",
        "diagnosis": "resolveWorkflowForMessage is too permissive — D1/SQL intents fall through to i-am-builder-monaco instead of direct tools.",
        "tasks": [
            {"file": "src/api/agent.js",                          "lines": (2091, 2210), "action": "Detect D1/SQL/query intents BEFORE Monaco check, return null so direct tools run"},
            {"file": "src/api/agent.js",                          "lines": (2091, 2210), "action": "Restrict Monaco routing to explicit editor requests only, not SQL/table mentions"},
        ],
    },
    {
        "id": "plan_r2_topbar",
        "title": "Fix R2 topbar routing and explorer bucket hydration",
        "diagnosis": "Topbar R2 click dispatches wrong sidebar state; explorer R2 section never receives bucket rows.",
        "tasks": [
            {"file": "dashboard/components/UnifiedSearchBar.tsx", "lines": (771,  790),  "action": "openR2Bucket dispatches only R2-specific sidebar events, not generic palette"},
            {"file": "dashboard/components/UnifiedSearchBar.tsx", "lines": (792,  812),  "action": "loadBucketMenu stores fetched rows into bucketMenuRows without clearing on transient failure"},
            {"file": "dashboard/components/UnifiedSearchBar.tsx", "lines": (820,  890),  "action": "R2 item selection always calls openR2Bucket with resolved bucket name"},
            {"file": "dashboard/App.tsx",                         "lines": (1321, 1440), "action": "Confirm iam:palette-open-r2 listener opens R2 explorer section specifically"},
        ],
    },
    {
        "id": "plan_pty_dual",
        "title": "Fix PTY dual endpoint + user_id gating",
        "diagnosis": "PTY exec URL is hardwired; no user_id gate at PTY boundary, preventing local Mac vs VM tunnel selection.",
        "tasks": [
            {"file": "src/core/pty-workspace-paths.js",           "lines": (1,    40),   "action": "Replace hardcoded PTY_EXEC_URL with env-driven resolver (local Mac vs VM tunnel)"},
            {"file": "src/core/pty-workspace-paths.js",           "lines": (18,   36),   "action": "buildPtyUserWorkspaceRoot requires non-empty authenticated userId, return null if missing"},
            {"file": "src/core/pty-workspace-paths.js",           "lines": (111,  199),  "action": "execOnPtyHost + validateMoviemodeRepoOnPty accept user-scoped context, resolve correct endpoint"},
            {"file": "src/api/agent.js",                          "lines": (5171, 5290), "action": "Pass authenticated user_id + workspace_id into all PTY execution paths"},
        ],
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def read_lines(file: str, start: int, end: int) -> str:
    """Read a range of lines from the repo."""
    path = REPO_ROOT / file
    if not path.exists():
        return f"[FILE NOT FOUND: {file}]"
    lines = path.read_text(errors="replace").splitlines()
    chunk = lines[max(0, start - 1):min(end, len(lines))]
    numbered = [f"{start + i:4d} | {l}" for i, l in enumerate(chunk)]
    return "\n".join(numbered)


def build_prompt(plan: dict) -> str:
    """Build the shared prompt sent to both models."""
    parts = [
        f"# Bug: {plan['title']}",
        f"## Diagnosis\n{plan['diagnosis']}",
        "",
        "## Your job",
        "Produce a minimal, surgical code patch for each task below.",
        "Rules:",
        "- Return ONLY the changed lines as a unified diff (--- / +++ / @@ format)",
        "- One diff block per task",
        "- No hardcoded tenant_ids, user_ids, workspace_ids, or model strings",
        "- No full file rewrites — surgical edits only",
        "- If a fix requires a new helper function, add it inline near its first use",
        "",
    ]

    for i, task in enumerate(plan["tasks"], 1):
        start, end = task["lines"]
        code = read_lines(task["file"], start, end)
        parts += [
            f"## Task {i}: {task['action']}",
            f"File: `{task['file']}` (lines {start}–{end})",
            "```",
            code[:3000],  # cap per task to avoid token blowout
            "```",
            "",
        ]

    parts.append("Produce the diffs now. Nothing else — no explanation, just the diffs.")
    return "\n".join(parts)


# ── Model calls ───────────────────────────────────────────────────────────────

def call_gpt(client: OpenAI, prompt: str) -> tuple:
    import time as _time
    t0 = _time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=GPT_MODEL,
            messages=[
                {"role": "system", "content": "You are a senior engineer producing precise code patches. Return only unified diffs. No prose."},
                {"role": "user",   "content": prompt},
            ],
            max_completion_tokens=2000,
            temperature=0.1,
        )
        latency_ms = int((_time.perf_counter() - t0) * 1000)
        text = resp.choices[0].message.content.strip()
        tok_in  = resp.usage.prompt_tokens if resp.usage else 0
        tok_out = resp.usage.completion_tokens if resp.usage else 0
        return text, tok_in, tok_out, latency_ms
    except Exception as e:
        latency_ms = int((_time.perf_counter() - t0) * 1000)
        return f"[GPT ERROR: {e}]", 0, 0, latency_ms


def call_gemini(model, prompt: str) -> tuple:
    import time as _time
    t0 = _time.perf_counter()
    try:
        resp = model.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        latency_ms = int((_time.perf_counter() - t0) * 1000)
        text = resp.text.strip()
        meta = getattr(resp, "usage_metadata", None)
        tok_in  = getattr(meta, "prompt_token_count", 0) or 0
        tok_out = getattr(meta, "candidates_token_count", 0) or 0
        return text, tok_in, tok_out, latency_ms
    except Exception as e:
        latency_ms = int((_time.perf_counter() - t0) * 1000)
        return f"[GEMINI ERROR: {e}]", 0, 0, latency_ms


# ── Scoring heuristics ────────────────────────────────────────────────────────

def score_patch(patch: str, plan: dict) -> dict:
    """Simple heuristic scoring — no AI needed."""
    has_diff       = "@@" in patch and ("---" in patch or "+++" in patch)
    has_workspace  = "workspace_id" in patch or "workspaceId" in patch
    line_count     = patch.count("\n")
    file_coverage  = sum(1 for t in plan["tasks"] if t["file"].split("/")[-1] in patch)
    no_hardcode    = not any(bad in patch for bad in [
        "sam_primeaux", "au_871d920d1233cbd1", "ws_inneranimalmedia",
        "tenant_connor", "hardcoded",
    ])
    return {
        "has_diff":       has_diff,
        "has_workspace":  has_workspace,
        "file_coverage":  f"{file_coverage}/{len(plan['tasks'])}",
        "patch_lines":    line_count,
        "no_hardcode":    no_hardcode,
        "score":          sum([has_diff, has_workspace, no_hardcode]) + min(file_coverage, 3),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log("IAM Model Battle: Gemini 2.5 Flash vs GPT-5.4-mini")
    log(f"Plans: {len(PLANS)} | Repo: {REPO_ROOT.name}")

    # Init clients
    openai_key = os.getenv("OPENAI_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if not openai_key:
        log("[ERROR] OPENAI_API_KEY not set"); sys.exit(1)
    if not gemini_key:
        log("[ERROR] GEMINI_API_KEY not set"); sys.exit(1)

    gpt_client = OpenAI(api_key=openai_key)
    gem_model = genai.Client(api_key=gemini_key)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    results      = []
    scoreboard   = {"gpt": 0, "gemini": 0}

    for plan in PLANS:
        log(f"\n{'='*60}")
        log(f"Plan: {plan['title']}")
        prompt = build_prompt(plan)

        # GPT
        log(f"  → GPT-5.4-mini...")
        gpt_out, gpt_tok_in, gpt_tok_out, gpt_ms = call_gpt(gpt_client, prompt)
        gpt_score = score_patch(gpt_out, plan)
        gpt_cost  = round((gpt_tok_in * 0.00000015) + (gpt_tok_out * 0.0000006), 6)
        log(f"     score={gpt_score['score']}/6  files={gpt_score['file_coverage']}  lines={gpt_score['patch_lines']}  {gpt_ms}ms  in={gpt_tok_in} out={gpt_tok_out} cost=${gpt_cost:.5f}")

        # Gemini
        log(f"  → Gemini 2.5 Flash...")
        gem_out, gem_tok_in, gem_tok_out, gem_ms = call_gemini(gem_model, prompt)
        gem_score = score_patch(gem_out, plan)
        gem_cost  = round((gem_tok_in * 0.0000003) + (gem_tok_out * 0.0000025), 6)
        log(f"     score={gem_score['score']}/6  files={gem_score['file_coverage']}  lines={gem_score['patch_lines']}  {gem_ms}ms  in={gem_tok_in} out={gem_tok_out} cost=${gem_cost:.5f}")

        # Tally
        if gpt_score["score"] >= gem_score["score"]:
            scoreboard["gpt"]    += 1
            winner = "GPT"
        else:
            scoreboard["gemini"] += 1
            winner = "GEMINI"
        log(f"  Winner: {winner}")

        result = {
            "plan_id":    plan["id"],
            "plan_title": plan["title"],
            "gpt": {
                "model":    GPT_MODEL,
                "output":   gpt_out,
                "score":    gpt_score,
                "time_ms":  gpt_ms,
                "tok_in":   gpt_tok_in,
                "tok_out":  gpt_tok_out,
                "cost_usd": gpt_cost,
            },
            "gemini": {
                "model":    GEM_MODEL,
                "output":   gem_out,
                "score":    gem_score,
                "time_ms":  gem_ms,
                "tok_in":   gem_tok_in,
                "tok_out":  gem_tok_out,
                "cost_usd": gem_cost,
            },
            "winner": winner,
        }
        results.append(result)

        # Save individual result
        out_file = OUTPUT_DIR / f"{plan['id']}.json"
        out_file.write_text(json.dumps(result, indent=2))

        time.sleep(1)

    # ── Final report ─────────────────────────────────────────────────────────

    md_lines = [
        "# IAM Model Battle Results",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"**GPT-5.4-mini** vs **Gemini 2.5 Flash**",
        "",
        "## Scoreboard",
        f"| Model | Wins |",
        f"|-------|------|",
        f"| GPT-5.4-mini | {scoreboard['gpt']} |",
        f"| Gemini 2.5 Flash | {scoreboard['gemini']} |",
        "",
        "## Per-Plan Results",
        "",
    ]

    for r in results:
        g  = r["gpt"]
        gm = r["gemini"]
        md_lines += [
            f"### {r['plan_title']}",
            f"**Winner: {r['winner']}**",
            "",
            f"| Metric | GPT-5.4-mini | Gemini 2.5 Flash |",
            f"|--------|-------------|-----------------|",
            f"| Score | {g['score']['score']}/6 | {gm['score']['score']}/6 |",
            f"| File coverage | {g['score']['file_coverage']} | {gm['score']['file_coverage']} |",
            f"| Has diff | {g['score']['has_diff']} | {gm['score']['has_diff']} |",
            f"| Workspace scoped | {g['score']['has_workspace']} | {gm['score']['has_workspace']} |",
            f"| No hardcodes | {g['score']['no_hardcode']} | {gm['score']['no_hardcode']} |",
            f"| Patch lines | {g['score']['patch_lines']} | {gm['score']['patch_lines']} |",
            f"| Time | {g['time_ms']}ms | {gm['time_ms']}ms |",
            f"| Tokens in | {g['tok_in']} | {gm['tok_in']} |",
            f"| Tokens out | {g['tok_out']} | {gm['tok_out']} |",
            f"| Cost | ${g['cost_usd']:.5f} | ${gm['cost_usd']:.5f} |",
            "",
            "<details><summary>GPT patch</summary>",
            "",
            "```diff",
            g["output"][:4000],
            "```",
            "</details>",
            "",
            "<details><summary>Gemini patch</summary>",
            "",
            "```diff",
            gm["output"][:4000],
            "```",
            "</details>",
            "",
            "---",
            "",
        ]

    overall = "GPT-5.4-mini" if scoreboard["gpt"] > scoreboard["gemini"] else \
              "Gemini 2.5 Flash" if scoreboard["gemini"] > scoreboard["gpt"] else "TIE"
    md_lines += [
        "## Overall Winner",
        f"**{overall}** ({scoreboard['gpt']}–{scoreboard['gemini']})",
    ]

    md_out = OUTPUT_DIR / "battle_report.md"
    md_out.write_text("\n".join(md_lines))

    # Save full JSON
    json_out = OUTPUT_DIR / "battle_full.json"
    json_out.write_text(json.dumps(results, indent=2))

    log(f"\n{'='*60}")
    log(f"FINAL: GPT {scoreboard['gpt']} — Gemini {scoreboard['gemini']}")
    log(f"Overall winner: {overall}")
    log(f"Report: {md_out}")
    log(f"Full JSON: {json_out}")


if __name__ == "__main__":
    main()
