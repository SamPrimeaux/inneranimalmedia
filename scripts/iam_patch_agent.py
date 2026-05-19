#!/usr/bin/env python3
"""
iam_patch_agent.py
==================
Real agentic patcher. No scoring theater.

For each bug plan:
  1. Reads ACTUAL source lines (± context) from disk
  2. Sends to GPT-5.4-mini with exact instructions to produce a valid unified diff
  3. Validates with `patch --dry-run -p1` from repo root
  4. If dry-run passes → applies patch
  5. If GPT fails → tries Gemini 2.5 Flash as fallback
  6. If both fail → saves .patch file for manual review

After all plans:
  - Git add + commit (lists exact files changed)
  - Git push origin main
  - CF Builds handles deploy

Backups of all touched files saved to scripts/patch_results/backups/TIMESTAMP/
before any patch is applied.

Usage:
  ./scripts/with-cloudflare-env.sh python3 scripts/iam_patch_agent.py

Env vars:
  OPENAI_API_KEY
  GEMINI_API_KEY
"""

import os
import sys
import json
import shutil
import subprocess
import tempfile
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
CONTEXT     = 40   # lines of context around target range fed to model
OUTPUT_DIR  = REPO_ROOT / "scripts" / "patch_results"
BACKUP_DIR  = OUTPUT_DIR / "backups" / datetime.now().strftime("%Y%m%d_%H%M%S")

# ── Bug plans ─────────────────────────────────────────────────────────────────

PLANS = [
    {
        "id": "plan_github_scoping",
        "title": "Fix GitHub repo workspace scoping",
        "diagnosis": (
            "GitHub repo listing has no workspace_id filter — one user sees another's repos. "
            "Fix: filter /api/agent/git/repos by workspace_id, and key repo cache in the "
            "frontend component by workspace_id so state never leaks across workspaces."
        ),
        "tasks": [
            {
                "file": "src/api/agent.js",
                "lines": (7921, 8040),
                "action": (
                    "Add workspace_id filter to the /api/agent/git/repos handler. "
                    "The SQL query and any linkedRows filter must include workspace_id "
                    "in addition to tenant_id."
                ),
            },
            {
                "file": "dashboard/components/GitHubExplorer.tsx",
                "lines": (221, 340),
                "action": (
                    "Key all repo cache/state (useState, useRef, or similar) by workspace_id "
                    "so switching workspaces never shows stale repos from a previous workspace."
                ),
            },
        ],
    },
    {
        "id": "plan_r2_fetch",
        "title": "Fix R2 explorer object fetch routing",
        "diagnosis": (
            "R2 object fetch/list returns empty because the binding resolver falls through "
            "before trying S3 fallback. Fix: ensure resolveR2Access and getR2Binding cover "
            "all bound bucket labels including legacy aliases, and GET/HEAD/list handlers "
            "use binding-first then S3 fallback."
        ),
        "tasks": [
            {
                "file": "src/api/r2-api.js",
                "lines": (1, 120),
                "action": (
                    "Verify resolveR2Access and getR2Binding cover all bound bucket labels "
                    "including legacy aliases. Add any missing alias mappings."
                ),
            },
            {
                "file": "src/api/r2-api.js",
                "lines": (520, 760),
                "action": (
                    "Fix GET/HEAD/list handlers to use binding-first resolution then S3 "
                    "fallback. Must never return empty when a valid binding exists."
                ),
            },
            {
                "file": "src/tools/r2-dispatch.js",
                "lines": (1, 161),
                "action": (
                    "Replace direct env[bucket.toUpperCase()] lookup with the shared R2 "
                    "binding resolver so all dispatch paths use the same resolution logic."
                ),
            },
            {
                "file": "dashboard/components/LocalExplorer.tsx",
                "lines": (441, 560),
                "action": (
                    "Confirm openR2Key and loadR2List pass the bucket name through unchanged "
                    "with no hardcoded bucket assumptions."
                ),
            },
        ],
    },
    {
        "id": "plan_d1_routing",
        "title": "Fix agent D1 routing — stop Monaco workflow hijack",
        "diagnosis": (
            "resolveWorkflowForMessage routes any message containing SQL/table/query keywords "
            "to the Monaco editor workflow, blocking direct D1 tool execution. Fix: detect "
            "D1/database/SQL intents before the Monaco check and return null for those cases."
        ),
        "tasks": [
            {
                "file": "src/api/agent.js",
                "lines": (2091, 2210),
                "action": (
                    "In resolveWorkflowForMessage, detect D1/database/SQL/query intents "
                    "BEFORE the Monaco check and return null so direct D1 tools run. "
                    "Restrict Monaco routing to explicit editor open/edit requests only."
                ),
            },
        ],
    },
    {
        "id": "plan_r2_topbar",
        "title": "Fix R2 topbar routing and explorer bucket hydration",
        "diagnosis": (
            "openR2Bucket fires a generic palette event instead of an R2-specific sidebar "
            "event, and loadBucketMenu clears rows on transient failure. Fix the event "
            "dispatch and preserve rows on failure."
        ),
        "tasks": [
            {
                "file": "dashboard/components/UnifiedSearchBar.tsx",
                "lines": (771, 890),
                "action": (
                    "openR2Bucket must dispatch only R2-specific sidebar events (not generic "
                    "palette). loadBucketMenu must store fetched rows into bucketMenuRows "
                    "without clearing on transient failure. R2 item selection always calls "
                    "openR2Bucket with resolved bucket name."
                ),
            },
            {
                "file": "dashboard/App.tsx",
                "lines": (1321, 1440),
                "action": (
                    "Confirm iam:palette-open-r2 listener opens the R2 explorer section "
                    "specifically, not a generic panel."
                ),
            },
        ],
    },
    {
        "id": "plan_pty_gating",
        "title": "Fix PTY dual endpoint + user_id gating",
        "diagnosis": (
            "PTY execution uses a hardcoded PTY_EXEC_URL and does not require an authenticated "
            "user_id — any request can execute shell commands. Fix: env-driven endpoint "
            "resolver and require non-empty authenticated userId in all PTY paths."
        ),
        "tasks": [
            {
                "file": "src/core/pty-workspace-paths.js",
                "lines": (1, 199),
                "action": (
                    "Replace hardcoded PTY_EXEC_URL with env-driven resolver (local Mac vs VM "
                    "tunnel). buildPtyUserWorkspaceRoot must require non-empty authenticated "
                    "userId and return null if missing. execOnPtyHost and "
                    "validateMoviemodeRepoOnPty accept user-scoped context."
                ),
            },
            {
                "file": "src/api/agent.js",
                "lines": (5171, 5290),
                "action": (
                    "Pass authenticated user_id + workspace_id into all PTY execution paths. "
                    "Reject PTY calls where user_id is missing or empty."
                ),
            },
        ],
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def read_source(file: str, start: int, end: int) -> tuple[str, int, int]:
    """Read file lines start..end with CONTEXT padding. Returns (text, actual_start, actual_end)."""
    path = REPO_ROOT / file
    if not path.exists():
        return f"[FILE NOT FOUND: {file}]", start, end
    all_lines = path.read_text(errors="replace").splitlines()
    a = max(0, start - 1 - CONTEXT)
    b = min(len(all_lines), end + CONTEXT)
    chunk = all_lines[a:b]
    numbered = "\n".join(f"{a+i+1:5}: {line}" for i, line in enumerate(chunk))
    return numbered, a + 1, b


def build_prompt(file: str, actual_start: int, actual_end: int, source: str, action: str, diagnosis: str) -> str:
    return f"""You are a senior engineer making a surgical code fix. Return ONLY a unified diff. No prose, no explanation, no markdown fences.

DIAGNOSIS:
{diagnosis}

FIX REQUIRED for {file} (lines {actual_start}–{actual_end}):
{action}

EXACT SOURCE (line numbers shown):
{source}

RULES:
1. Output ONLY a unified diff starting with --- and +++
2. Use headers exactly: --- a/{file}
                        +++ b/{file}
3. Context lines (-lines) MUST match the source EXACTLY as shown above — character for character
4. Make the minimal change that fixes the issue — do not rewrite surrounding logic
5. No hardcoded user IDs, tenant IDs, or bucket names
6. No TODO comments, no stub implementations
"""


def run_patch_dry(patch_text: str) -> tuple[bool, str]:
    """Run patch --dry-run -p1 from repo root. Returns (passed, output)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as f:
        f.write(patch_text)
        patch_file = f.name
    try:
        result = subprocess.run(
            ["patch", "--dry-run", "-p1", "--input", patch_file],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout + result.stderr
        passed = result.returncode == 0
        return passed, output
    except subprocess.TimeoutExpired:
        return False, "patch --dry-run timed out"
    finally:
        os.unlink(patch_file)


def apply_patch(patch_text: str) -> tuple[bool, str]:
    """Apply patch -p1 from repo root. Returns (passed, output)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as f:
        f.write(patch_text)
        patch_file = f.name
    try:
        result = subprocess.run(
            ["patch", "-p1", "--input", patch_file],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout + result.stderr
        return result.returncode == 0, output
    finally:
        os.unlink(patch_file)


def backup_file(file: str):
    src = REPO_ROOT / file
    if not src.exists():
        return
    dst = BACKUP_DIR / file
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def call_gpt(client: OpenAI, prompt: str) -> tuple[str, int, int, int]:
    import time as _t
    t0 = _t.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=GPT_MODEL,
            messages=[
                {"role": "system", "content": "You are a senior engineer. Return ONLY a unified diff. No prose. No markdown fences."},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=3000,
            temperature=0.1,
        )
        ms = int((_t.perf_counter() - t0) * 1000)
        text = resp.choices[0].message.content.strip()
        tok_in  = resp.usage.prompt_tokens if resp.usage else 0
        tok_out = resp.usage.completion_tokens if resp.usage else 0
        return text, tok_in, tok_out, ms
    except Exception as e:
        ms = int((_t.perf_counter() - t0) * 1000)
        return f"[GPT ERROR: {e}]", 0, 0, ms


def call_gemini(client, prompt: str) -> tuple[str, int, int, int]:
    import time as _t
    t0 = _t.perf_counter()
    try:
        resp = client.models.generate_content(model=GEM_MODEL, contents=prompt)
        ms = int((_t.perf_counter() - t0) * 1000)
        text = resp.text.strip()
        meta = getattr(resp, "usage_metadata", None)
        tok_in  = getattr(meta, "prompt_token_count", 0) or 0
        tok_out = getattr(meta, "candidates_token_count", 0) or 0
        return text, tok_in, tok_out, ms
    except Exception as e:
        ms = int((_t.perf_counter() - t0) * 1000)
        return f"[GEMINI ERROR: {e}]", 0, 0, ms


def strip_fences(text: str) -> str:
    """Strip ```diff or ``` fences if model wrapped the diff anyway."""
    lines = text.splitlines()
    out = []
    for line in lines:
        if line.strip().startswith("```"):
            continue
        out.append(line)
    return "\n".join(out).strip()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log("IAM Patch Agent — real diffs, real validation, auto-apply")
    log(f"Repo: {REPO_ROOT}")
    log(f"Backups: {BACKUP_DIR}")

    openai_key = os.getenv("OPENAI_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not openai_key:
        log("[ERROR] OPENAI_API_KEY not set"); sys.exit(1)
    if not gemini_key:
        log("[ERROR] GEMINI_API_KEY not set"); sys.exit(1)

    gpt_client = OpenAI(api_key=openai_key)
    gem_client = genai.Client(api_key=gemini_key)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    applied_files   = []
    failed_plans    = []
    session_results = []

    for plan in PLANS:
        log(f"\n{'='*60}")
        log(f"Plan: {plan['title']}")

        plan_patches = []   # (file, patch_text, model, tok_in, tok_out, ms)
        plan_failed  = []

        for task in plan["tasks"]:
            file   = task["file"]
            start, end = task["lines"]
            action = task["action"]
            log(f"  Task: {file} lines {start}-{end}")

            source, actual_start, actual_end = read_source(file, start, end)
            if source.startswith("[FILE NOT FOUND"):
                log(f"    [SKIP] {source}")
                plan_failed.append({"file": file, "reason": "file not found"})
                continue

            prompt = build_prompt(file, actual_start, actual_end, source, action, plan["diagnosis"])

            # Backup before touching
            backup_file(file)

            # Try GPT first
            log(f"    → GPT-5.4-mini...")
            raw, tok_in, tok_out, ms = call_gpt(gpt_client, prompt)
            patch_text = strip_fences(raw)
            passed, dry_output = run_patch_dry(patch_text)
            cost = round((tok_in * 0.00000015) + (tok_out * 0.0000006), 6)
            log(f"      {ms}ms  in={tok_in} out={tok_out} cost=${cost:.5f}  dry-run={'PASS' if passed else 'FAIL'}")

            if not passed:
                log(f"      GPT dry-run failed: {dry_output[:120].strip()}")
                log(f"    → Gemini fallback...")
                raw_g, tok_in_g, tok_out_g, ms_g = call_gemini(gem_client, prompt)
                patch_text_g = strip_fences(raw_g)
                passed_g, dry_output_g = run_patch_dry(patch_text_g)
                cost_g = round((tok_in_g * 0.0000003) + (tok_out_g * 0.0000025), 6)
                log(f"      {ms_g}ms  in={tok_in_g} out={tok_out_g} cost=${cost_g:.5f}  dry-run={'PASS' if passed_g else 'FAIL'}")

                if passed_g:
                    patch_text = patch_text_g
                    passed = True
                    log(f"      Gemini patch accepted")
                else:
                    log(f"      Gemini dry-run failed: {dry_output_g[:120].strip()}")
                    # Save manual patch
                    manual = OUTPUT_DIR / f"{plan['id']}_{file.replace('/', '_')}_manual.patch"
                    manual.write_text(patch_text)
                    log(f"      Manual patch saved: {manual.name}")
                    plan_failed.append({"file": file, "reason": "both models failed dry-run", "patch": str(manual)})
                    continue

            if passed:
                ok, apply_out = apply_patch(patch_text)
                if ok:
                    log(f"      Applied successfully")
                    plan_patches.append(file)
                    if file not in applied_files:
                        applied_files.append(file)
                else:
                    log(f"      Apply failed after dry-run pass: {apply_out[:120].strip()}")
                    plan_failed.append({"file": file, "reason": f"apply failed: {apply_out[:200]}"})

        session_results.append({
            "plan_id":    plan["id"],
            "plan_title": plan["title"],
            "applied":    plan_patches,
            "failed":     plan_failed,
        })

        if plan_failed:
            failed_plans.append(plan["id"])

    # ── Summary ───────────────────────────────────────────────────────────────

    log(f"\n{'='*60}")
    log(f"Applied files ({len(applied_files)}):")
    for f in applied_files:
        log(f"  {f}")
    if failed_plans:
        log(f"Failed plans: {', '.join(failed_plans)}")
        log(f"Manual patches in: {OUTPUT_DIR}")

    # ── Git commit + push ─────────────────────────────────────────────────────

    if applied_files:
        log("\nCommitting...")
        file_list = ", ".join(applied_files)
        commit_msg = (
            f"fix(agent): apply patch-agent fixes\n\n"
            f"Files changed: {file_list}\n"
            f"Plans: {', '.join(p['plan_id'] for p in session_results if p['applied'])}\n"
            f"Applied by iam_patch_agent.py — validated with patch --dry-run before apply"
        )

        subprocess.run(["git", "add"] + applied_files, cwd=str(REPO_ROOT))
        result = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=str(REPO_ROOT),
            capture_output=True, text=True,
        )
        log(result.stdout.strip() or result.stderr.strip())

        log("Pushing to main...")
        push = subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=str(REPO_ROOT),
            capture_output=True, text=True,
        )
        log(push.stdout.strip() or push.stderr.strip())
        log("CF Builds will handle deploy.")
    else:
        log("\nNo patches applied — nothing to commit.")

    # ── Save session JSON ──────────────────────────────────────────────────────

    out = OUTPUT_DIR / f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out.write_text(json.dumps(session_results, indent=2))
    log(f"Session log: {out}")


if __name__ == "__main__":
    main()
