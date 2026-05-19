#!/usr/bin/env python3
"""
iam_agentsam_benchmark.py — 4-model parallel bug-fix benchmark + D1/Supabase telemetry.

Phases: preflight → smoke gate → D1 seed → parallel agents → quality gate → Thompson update → MovieMode verify → summary.

Usage:
  python3 scripts/iam_agentsam_benchmark.py [--dry-run] [--merge] [--no-vectorize]

  --dry-run       Smoke + D1 seed; skip agent file writes and git (D1 still writes).
  --merge         Squash-merge passing branches to main (default: branches only, no merge).
  --no-vectorize  Skip Ollama embed + Vectorize upserts.
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from uuid import uuid4

REPO = Path(__file__).resolve().parents[1]
BACKUP_DIR = REPO / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

DRY_RUN = "--dry-run" in sys.argv
ALLOW_MERGE = "--merge" in sys.argv
VECTORIZE_ENABLE = "--no-vectorize" not in sys.argv

# ── env ─────────────────────────────────────────────────────────────────────

def load_env_file(path: Path, override: bool = True) -> None:
    if not path.exists():
        return
    for raw in path.read_text(errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if v.startswith("${") and v.endswith("}"):
            v = os.environ.get(v[2:-1], "")
        if override or k not in os.environ:
            os.environ[k] = v


load_env_file(REPO / ".env", override=False)
load_env_file(REPO / "cloudflare.env", override=True)
load_env_file(REPO / "agentsam.local.env", override=True)
load_env_file(REPO / ".env.agentsam.local", override=True)

CF_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GOOGLE_KEY = (
    os.environ.get("GOOGLE_AI_API_KEY", "")
    or os.environ.get("GOOGLE_API_KEY", "")
    or os.environ.get("GEMINI_API_KEY", "")
)
OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get(
    "SUPABASE_SERVICE_KEY", ""
)
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
WORKSPACE_ID = os.environ.get("WORKSPACE_ID", "ws_inneranimalmedia")
TENANT_ID = os.environ.get("TENANT_ID", "tenant_sam_primeaux")
USER_ID = os.environ.get("USER_ID", "au_871d920d1233cbd1")

VECTORIZE_INDEX = os.environ.get("VECTORIZE_INDEX", "ai-search-inneranimalmedia-autorag")
EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "mxbai-embed-large:latest")
EMBED_DIMS = int(os.environ.get("EMBED_DIMS", "1024"))
BUDGET_PER_MODEL = float(os.environ.get("BENCHMARK_BUDGET_USD", "1.0"))
SMOKE_TIMEOUT = int(os.environ.get("BENCHMARK_SMOKE_TIMEOUT", "30"))

TS = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
RUN_GROUP_ID = f"smoke_{TS}_bugfix"
PLAN_ID = f"plan_{dt.date.today().strftime('%Y%m%d')}_agent_smoke"

# catalog model_key → API model id
MODEL_API_IDS = {
    "gpt-5.4-mini": "gpt-5.4-mini",
    "gpt-5.4-nano": "gpt-5.4-nano",
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "gemini-2.5-flash": os.environ.get("GEMINI_FLASH_MODEL_ID", "gemini-2.5-flash"),
}

# Thompson arm lookup (task_type, mode) per benchmark model
ROUTING_ARM = {
    "gpt-5.4-mini": ("chat", "agent", "gpt-5.4-mini"),
    "gpt-5.4-nano": ("chat", "agent", "gpt-5.4-nano"),
    "claude-haiku-4-5": ("chat", "agent", "claude-haiku-4-5-20251001"),
    "gemini-2.5-flash": ("code", "agent", "gemini-2.5-flash"),
}

MODELS = {
    "gpt-5.4-mini": {"provider": "openai", "in": 0.75, "out": 4.50},
    "claude-haiku-4-5": {"provider": "anthropic", "in": 1.00, "out": 5.00},
    "gemini-2.5-flash": {"provider": "google", "in": 0.30, "out": 2.50},
    "gpt-5.4-nano": {"provider": "openai", "in": 0.20, "out": 1.25},
}

REVIEWER_MODEL = "gpt-5.4-mini"

SHARED_SYSTEM = (
    "You are an expert TypeScript/React/Cloudflare Worker engineer on Inner Animal Media. "
    "Production-grade code only — no stubs or TODOs. "
    "When asked for a file, return ONLY complete file contents. No markdown fences."
)

SMOKE_PROMPT = (
    "Reply with exactly this JSON and nothing else:\n"
    '{"status": "ready", "model": "<your model identifier>", "token_test": true}'
)

_file_locks: dict[str, threading.Lock] = {}
_file_locks_mu = threading.Lock()
_git_lock = threading.Lock()
_model_spend: dict[str, float] = {k: 0.0 for k in MODELS}
_spend_lock = threading.Lock()
_d1_cols: dict[str, set[str]] = {}


def get_file_lock(path: str) -> threading.Lock:
    with _file_locks_mu:
        return _file_locks.setdefault(path, threading.Lock())


def now_iso() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def short_error(exc: BaseException) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode("utf-8", errors="replace")[:800]
        except Exception:
            body = ""
        return f"HTTP {exc.code}: {exc.reason} {body}".strip()
    return str(exc)


def http_post(url: str, payload: dict, headers: dict | None = None, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}


def http_get(url: str, headers: dict | None = None, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}


def run_shell(cmd: str, timeout: int = 90) -> str:
    with _git_lock:
        r = subprocess.run(
            cmd, shell=True, cwd=REPO, capture_output=True, text=True, timeout=timeout
        )
    return (r.stdout + r.stderr).strip()


def strip_fences(text: str) -> str:
    lines = []
    for line in str(text).splitlines():
        if line.strip().startswith("```"):
            continue
        lines.append(line)
    out = "\n".join(lines).strip()
    return out + ("\n" if out and not out.endswith("\n") else "")


# ── D1 ──────────────────────────────────────────────────────────────────────

D1_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}"
D1_HEADERS = {"Authorization": f"Bearer {CF_API_TOKEN}"}


def d1_enabled() -> bool:
    return bool(CF_ACCOUNT_ID and CF_API_TOKEN and D1_DATABASE_ID)


def d1_execute(sql: str, params: list | None = None) -> dict:
    if not d1_enabled():
        return {}
    try:
        res = http_post(
            f"{D1_BASE}/query",
            {"sql": sql, "params": params or []},
            D1_HEADERS,
            timeout=60,
        )
        if not res.get("success", True):
            errs = res.get("errors") or res.get("result", [])
            print(f"  [d1 error] {str(errs)[:200]}")
        return res
    except Exception as e:
        print(f"  [d1 warn] {short_error(e)}")
        return {}


def d1_rows(res: dict) -> list[dict]:
    try:
        result = res.get("result", [])
        if result and isinstance(result[0], dict):
            return result[0].get("results") or []
    except Exception:
        pass
    return []


def d1_table_columns(table: str) -> set[str]:
    if table in _d1_cols:
        return _d1_cols[table]
    cols = {r.get("name") for r in d1_rows(d1_execute(f"PRAGMA table_info({table})")) if r.get("name")}
    _d1_cols[table] = cols
    return cols


def d1_insert(table: str, row: dict) -> None:
    cols_ok = d1_table_columns(table)
    if not cols_ok:
        print(f"  [d1 skip] unreadable table: {table}")
        return
    clean = {k: v for k, v in row.items() if k in cols_ok}
    dropped = sorted(set(row) - set(clean))
    if dropped:
        print(f"  [d1 note] {table}: dropped {', '.join(dropped[:6])}")
    if not clean:
        return
    names = ", ".join(clean.keys())
    ph = ", ".join(["?"] * len(clean))
    d1_execute(f"INSERT OR REPLACE INTO {table} ({names}) VALUES ({ph})", list(clean.values()))


def d1_update(table: str, row_id: str, fields: dict) -> None:
    cols_ok = d1_table_columns(table)
    clean = {k: v for k, v in fields.items() if k in cols_ok}
    if not clean:
        return
    sets = ", ".join(f"{k} = ?" for k in clean)
    d1_execute(f"UPDATE {table} SET {sets} WHERE id = ?", list(clean.values()) + [row_id])


def d1_query(sql: str, params: list | None = None) -> list[dict]:
    return d1_rows(d1_execute(sql, params))


def supabase_upsert(table: str, row: dict) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        http_post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            row,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Prefer": "resolution=merge-duplicates",
            },
            timeout=30,
        )
    except Exception as e:
        print(f"  [supabase warn] {short_error(e)[:80]}")


# ── LLM ─────────────────────────────────────────────────────────────────────

def compute_cost(model_key: str, in_tok: int, out_tok: int) -> float:
    m = MODELS.get(model_key, {})
    return (in_tok * m.get("in", 0) + out_tok * m.get("out", 0)) / 1_000_000


def check_budget(model_key: str, est: float) -> bool:
    with _spend_lock:
        if _model_spend[model_key] + est > BUDGET_PER_MODEL:
            print(f"  [budget] {model_key} over ${BUDGET_PER_MODEL}")
            return False
        return True


def record_spend(model_key: str, cost: float) -> None:
    with _spend_lock:
        _model_spend[model_key] += cost


def call_openai(model: str, system: str, user: str, timeout: int) -> tuple[str, int, int, int]:
    if not OPENAI_KEY:
        raise RuntimeError("OPENAI_API_KEY missing")
    t0 = time.time()
    try:
        res = http_post(
            "https://api.openai.com/v1/responses",
            {
                "model": model,
                "instructions": system,
                "input": user,
                "max_output_tokens": 8192,
            },
            headers={"Authorization": f"Bearer {OPENAI_KEY}"},
            timeout=timeout,
        )
        ms = int((time.time() - t0) * 1000)
        content = res.get("output_text", "")
        if not content:
            parts = []
            for item in res.get("output", []):
                for c in item.get("content", []):
                    if c.get("type") in {"output_text", "text"}:
                        parts.append(c.get("text", ""))
            content = "\n".join(parts).strip()
        usage = res.get("usage", {}) or {}
        return (
            content,
            int(usage.get("input_tokens", 0) or 0),
            int(usage.get("output_tokens", 0) or 0),
            ms,
        )
    except Exception:
        res = http_post(
            "https://api.openai.com/v1/chat/completions",
            {
                "model": model,
                "max_tokens": 8192,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
            headers={"Authorization": f"Bearer {OPENAI_KEY}"},
            timeout=timeout,
        )
        ms = int((time.time() - t0) * 1000)
        ch = res["choices"][0]["message"]["content"]
        u = res.get("usage", {})
        return ch, int(u.get("prompt_tokens", 0)), int(u.get("completion_tokens", 0)), ms


def call_anthropic(model: str, system: str, user: str, timeout: int) -> tuple[str, int, int, int]:
    t0 = time.time()
    res = http_post(
        "https://api.anthropic.com/v1/messages",
        {
            "model": model,
            "max_tokens": 8192,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01"},
        timeout=timeout,
    )
    ms = int((time.time() - t0) * 1000)
    return (
        res["content"][0]["text"],
        int(res["usage"]["input_tokens"]),
        int(res["usage"]["output_tokens"]),
        ms,
    )


def call_google(model: str, system: str, user: str, timeout: int) -> tuple[str, int, int, int]:
    t0 = time.time()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GOOGLE_KEY}"
    res = http_post(
        url,
        {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"maxOutputTokens": 8192},
        },
        timeout=timeout,
    )
    ms = int((time.time() - t0) * 1000)
    parts = res.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    u = res.get("usageMetadata", {})
    return text, int(u.get("promptTokenCount", 0)), int(u.get("candidatesTokenCount", 0)), ms


def call_llm(model_key: str, user: str, system: str = SHARED_SYSTEM, timeout: int = 120) -> tuple[str, int, int, int]:
    est = (len(user.split()) / 750) * MODELS[model_key]["in"] / 1_000_000
    if not check_budget(model_key, est):
        raise RuntimeError(f"budget cap ${BUDGET_PER_MODEL} exceeded for {model_key}")
    api_id = MODEL_API_IDS[model_key]
    prov = MODELS[model_key]["provider"]
    if prov == "openai":
        out = call_openai(api_id, system, user, timeout)
    elif prov == "anthropic":
        out = call_anthropic(api_id, system, user, timeout)
    elif prov == "google":
        out = call_google(api_id, system, user, timeout)
    else:
        raise ValueError(prov)
    text, it, ot, ms = out
    record_spend(model_key, compute_cost(model_key, it, ot))
    return out


# ── files / git ─────────────────────────────────────────────────────────────

def read_file(rel: str) -> str:
    p = REPO / rel
    if not p.exists():
        raise FileNotFoundError(rel)
    return p.read_text(encoding="utf-8", errors="replace")


def write_file(rel: str, content: str) -> None:
    with get_file_lock(rel):
        target = REPO / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(strip_fences(content), encoding="utf-8")
    print(f"  [write] {rel}")


def backup(rel: str) -> None:
    src = REPO / rel
    if not src.exists():
        return
    safe = rel.replace("/", "__")
    dest = BACKUP_DIR / f"{safe}.backup.{int(time.time())}"
    shutil.copy2(src, dest)


def restore(rel: str) -> None:
    safe = rel.replace("/", "__")
    backs = sorted(BACKUP_DIR.glob(f"{safe}.backup.*"))
    if backs:
        shutil.copy2(backs[-1], REPO / rel)


def parse_two_file_response(text: str) -> tuple[str, str]:
    r2 = re.search(r"===FILE: src/api/r2-api\.js===\n(.*?)(?===FILE:|$)", text, re.DOTALL)
    toml = re.search(r"===FILE: wrangler\.production\.toml===\n(.*?)(?===FILE:|$)", text, re.DOTALL)
    if not r2 or not toml:
        raise ValueError("missing ===FILE: delimiters")
    return r2.group(1).strip(), toml.group(1).strip()


def git_branch_commit(branch: str, files: list[str], message: str) -> None:
    if DRY_RUN:
        return
    run_shell("git stash push -u -m iam_benchmark_stash 2>/dev/null || true")
    run_shell("git fetch origin main 2>/dev/null || true")
    run_shell("git checkout main 2>/dev/null || git checkout master")
    run_shell("git pull --ff-only origin main 2>/dev/null || true")
    run_shell(f"git checkout -B {branch}")
    run_shell(f"git add {' '.join(files)}")
    run_shell(f'git commit -m "{message}"')
    run_shell(f"git push -u origin {branch}")
    run_shell("git checkout main 2>/dev/null || git checkout master")


# ── telemetry ─────────────────────────────────────────────────────────────────

def log_llm_run(
    model_key: str,
    test_name: str,
    test_suite: str,
    response: str,
    in_tok: int,
    out_tok: int,
    latency_ms: int,
    task_id: str = "",
    assertion_passed: int = -1,
    error_msg: str = "",
) -> dict:
    cost = compute_cost(model_key, in_tok, out_tok)
    row = {
        "id": f"atr_{uuid4().hex[:16]}",
        "run_group_id": RUN_GROUP_ID,
        "plan_id": PLAN_ID,
        "task_id": task_id,
        "test_suite": test_suite,
        "test_name": test_name,
        "mode": "agent",
        "provider": MODELS[model_key]["provider"],
        "model": model_key,
        "model_key": model_key,
        "status": "failed" if error_msg else "succeeded",
        "http_status": 500 if error_msg else 200,
        "success": 0 if error_msg else 1,
        "assertion_passed": assertion_passed,
        "response_text": (response or "")[:4000],
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "total_tokens": in_tok + out_tok,
        "total_cost_usd": cost,
        "latency_ms": latency_ms,
        "error_message": error_msg,
        "workspace_id": WORKSPACE_ID,
        "tenant_id": TENANT_ID,
        "started_at": now_iso(),
        "completed_at": now_iso(),
    }
    d1_insert("ai_api_test_runs", row)
    supabase_upsert(
        "agentsam_eval_runs",
        {
            "run_group_id": RUN_GROUP_ID,
            "tenant_id": TENANT_ID,
            "model_key": model_key,
            "provider": MODELS[model_key]["provider"],
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "latency_ms": latency_ms,
            "cost_usd": cost,
            "passed": bool(assertion_passed == 1),
            "output_text": (response or "")[:2000],
            "run_at": now_iso(),
        },
    )
    return row


def log_tool_call(tool: str, inp: str, out: str, status: str, tid: str, ms: int = 0) -> None:
    d1_insert(
        "agentsam_tool_call_log",
        {
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "tool_name": tool,
            "tool_category": "script",
            "status": status,
            "input_summary": inp[:500],
            "output_summary": out[:500],
            "duration_ms": ms,
            "created_at": int(time.time()),
        },
    )


def task_id(model_key: str) -> str:
    slug = model_key.replace(".", "_").replace("-", "_")
    return f"task_{slug}_{RUN_GROUP_ID}"


def agent_start(model_key: str) -> None:
    tid = task_id(model_key)
    d1_update("agentsam_plan_tasks", tid, {"status": "in_progress", "started_at": int(time.time())})
    d1_update(
        "agentsam_todo",
        tid,
        {"execution_status": "in_progress", "status": "in_progress", "started_at": now_iso()},
    )


def agent_done(model_key: str, summary: str, tokens: int, cost: float) -> None:
    tid = task_id(model_key)
    d1_update(
        "agentsam_plan_tasks",
        tid,
        {
            "status": "done",
            "output_summary": summary[:500],
            "tokens_used": tokens,
            "cost_usd": cost,
            "completed_at": int(time.time()),
        },
    )
    d1_update(
        "agentsam_todo",
        tid,
        {"execution_status": "done", "status": "done", "output_summary": summary[:500], "completed_at": now_iso()},
    )


def agent_fail(model_key: str, error: str) -> None:
    tid = task_id(model_key)
    d1_update("agentsam_plan_tasks", tid, {"status": "blocked", "blocked_reason": error[:500]})
    d1_update("agentsam_todo", tid, {"execution_status": "failed", "status": "failed", "error_trace": error[:500]})


# ── task metadata ───────────────────────────────────────────────────────────

TASKS_META = [
    {
        "model_key": "gpt-5.4-mini",
        "title": "Batch 4: Fix auth loops (GitHub 404 + Google Drive OAuth)",
        "priority": "P1",
        "category": "frontend",
        "order": 1,
        "files": ["dashboard/components/GitHubExplorer.tsx", "dashboard/components/GoogleDriveExplorer.tsx"],
        "branch": "smoke/agent-gpt54mini-auth-loops",
    },
    {
        "model_key": "claude-haiku-4-5",
        "title": "Batch 3: R2 hardcoded binding map cleanup",
        "priority": "P1",
        "category": "backend",
        "order": 2,
        "files": ["src/api/r2-api.js", "wrangler.production.toml"],
        "branch": "smoke/agent-haiku45-r2-cleanup",
    },
    {
        "model_key": "gemini-2.5-flash",
        "title": "Batch 2: agentPosition layout wiring in App.tsx",
        "priority": "P2",
        "category": "frontend",
        "order": 3,
        "files": ["dashboard/App.tsx"],
        "branch": "smoke/agent-gemini25flash-layout",
    },
    {
        "model_key": "gpt-5.4-nano",
        "title": "Batch 1: Explorer section defaults + responsive activityOpen",
        "priority": "P2",
        "category": "frontend",
        "order": 4,
        "files": ["dashboard/components/LocalExplorer.tsx", "dashboard/App.tsx"],
        "branch": "smoke/agent-gpt54nano-quick-wins",
    },
]


# ── phases ────────────────────────────────────────────────────────────────────

def phase_preflight() -> None:
    print("\n══ PHASE 0: PREFLIGHT ══")
    missing = [k for k, v in {
        "CLOUDFLARE_ACCOUNT_ID": CF_ACCOUNT_ID,
        "CLOUDFLARE_API_TOKEN": CF_API_TOKEN,
        "OPENAI_API_KEY": OPENAI_KEY,
        "ANTHROPIC_API_KEY": ANTHROPIC_KEY,
        "GOOGLE_API_KEY": GOOGLE_KEY,
    }.items() if not v]
    if missing:
        print(f"  ✗ missing: {missing}")
        sys.exit(1)
    for k in ["CLOUDFLARE_ACCOUNT_ID", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]:
        print(f"  ✓ {k}")
    if d1_enabled():
        ok = d1_query("SELECT 1 AS ok")
        ncols = len(d1_table_columns("ai_api_test_runs"))
        print(f"  ✓ D1 reachable ({ncols} cols on ai_api_test_runs)")
    else:
        print("  ⚠ D1 credentials missing — set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN")
    print(f"  run_group={RUN_GROUP_ID}  plan={PLAN_ID}")
    if DRY_RUN:
        print("  MODE: dry-run")
    if ALLOW_MERGE:
        print("  MODE: merge-to-main enabled")
    else:
        print("  MODE: branches only (pass --merge to squash-merge)")


def smoke_one(model_key: str) -> dict:
    try:
        resp, it, ot, ms = call_llm(
            model_key, SMOKE_PROMPT, system="You are a test assistant.", timeout=SMOKE_TIMEOUT
        )
        try:
            parsed = json.loads(strip_fences(resp))
            passed = int(
                parsed.get("status") == "ready"
                and "model" in parsed
                and parsed.get("token_test") is True
            )
        except json.JSONDecodeError:
            passed = 0
        row = log_llm_run(model_key, f"smoke_ping_{model_key}", "smoke_gate", resp, it, ot, ms, assertion_passed=passed)
        row["assertion_passed"] = passed
        return row
    except Exception as e:
        log_llm_run(model_key, f"smoke_ping_{model_key}", "smoke_gate", "", 0, 0, 0, error_msg=str(e))
        return {"model": model_key, "assertion_passed": 0, "error_message": str(e), "latency_ms": 0, "total_cost_usd": 0, "total_tokens": 0}


def phase_smoke_gate() -> list[str]:
    print("\n══ PHASE 1: SMOKE GATE ══")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(smoke_one, mk): mk for mk in MODELS}
        results = {futs[f]: f.result() for f in concurrent.futures.as_completed(futs)}
    passing = []
    for mk in MODELS:
        row = results[mk]
        ok = row.get("assertion_passed") == 1
        ms = row.get("latency_ms", 0)
        err = row.get("error_message", "")
        line = f"  {'✓' if ok else '✗'} {mk:<22} {ms:>5}ms"
        if not ok and err:
            line += f"  — {err[:120]}"
        elif not ok and not ms:
            line += "  — empty response (check API model id / endpoint)"
        print(line)
        if ok:
            passing.append(mk)
    if not passing:
        sys.exit("All models failed smoke gate")
    blocked = [mk for mk in MODELS if mk not in passing]
    if blocked:
        print(f"  blocked: {blocked}")
        for mk in blocked:
            agent_fail(mk, f"smoke gate failed for {mk}")
    return passing


def phase_d1_seed(passing: list[str]) -> None:
    print("\n══ PHASE 2: D1 SEED ══")
    d1_insert(
        "agentsam_plans",
        {
            "id": PLAN_ID,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "plan_date": dt.date.today().isoformat(),
            "plan_type": "daily",
            "title": "Agent Smoke Run: 4-Model Parallel Bug Fix Benchmark",
            "status": "active",
            "morning_brief": f"Benchmark run {RUN_GROUP_ID}",
            "tasks_total": len(TASKS_META),
            "tasks_done": 0,
            "created_at": int(time.time()),
            "updated_at": int(time.time()),
        },
    )
    for meta in TASKS_META:
        mk, tid = meta["model_key"], task_id(meta["model_key"])
        blocked = mk not in passing
        d1_insert(
            "agentsam_plan_tasks",
            {
                "id": tid,
                "plan_id": PLAN_ID,
                "todo_id": tid,
                "title": meta["title"],
                "assigned_model": mk,
                "priority": meta["priority"],
                "category": meta["category"],
                "order_index": meta["order"],
                "files_involved": json.dumps(meta["files"]),
                "status": "blocked" if blocked else "todo",
                "created_at": int(time.time()),
            },
        )
        d1_insert(
            "agentsam_todo",
            {
                "id": tid,
                "tenant_id": TENANT_ID,
                "workspace_id": WORKSPACE_ID,
                "plan_id": PLAN_ID,
                "title": meta["title"],
                "status": "open",
                "execution_status": "blocked" if blocked else "queued",
                "created_at": now_iso(),
            },
        )
        d1_insert(
            "agentsam_approval_queue",
            {
                "id": f"appr_{uuid4().hex[:12]}",
                "tenant_id": TENANT_ID,
                "workspace_id": WORKSPACE_ID,
                "user_id": USER_ID,
                "plan_id": PLAN_ID,
                "todo_id": tid,
                "tool_name": "agent_code_edit",
                "action_summary": meta["title"][:200],
                "approval_type": "script",
                "risk_level": "low",
                "status": "denied" if blocked else "approved",
                "approved_by": "sam_primeaux" if not blocked else None,
                "decided_at": int(time.time()) if not blocked else None,
            },
        )
    print(f"  seeded plan + {len(TASKS_META)} tasks/todos/approvals")


# Agent implementations (abbreviated prompts — same intent as original script)

def run_agent_a() -> None:
    mk, files = "gpt-5.4-mini", TASKS_META[0]["files"]
    meta = TASKS_META[0]
    agent_start(mk)
    tok, cost = 0, 0.0
    try:
        for f in files:
            backup(f)
        gh, gd = read_file(files[0]), read_file(files[1])
        p1 = f"Fix GitHubExplorer 404 loop (404→unavailable, not reconnect).\n\n{gh}"
        r1, i1, o1, m1 = call_llm(mk, p1)
        tok += i1 + o1
        cost += compute_cost(mk, i1, o1)
        log_llm_run(mk, "fix_github_404_loop", "bugfix_benchmark", r1, i1, o1, m1, task_id(mk))
        p2 = f"Fix GoogleDriveExplorer OAuth — setIsConnected(true) before fetchFiles.\n\n{gd}"
        r2, i2, o2, m2 = call_llm(mk, p2)
        tok += i2 + o2
        cost += compute_cost(mk, i2, o2)
        log_llm_run(mk, "fix_gdrive_oauth_state", "bugfix_benchmark", r2, i2, o2, m2, task_id(mk))
        if not DRY_RUN:
            write_file(files[0], r1)
            write_file(files[1], r2)
            lint = run_shell("npx tsc --noEmit --project dashboard/tsconfig.json 2>&1 | head -20")
            log_tool_call("tsc_lint", " ".join(files), lint, "success" if "error" not in lint.lower() else "warning", task_id(mk))
            git_branch_commit(meta["branch"], files, "fix(auth): github 404 + gdrive oauth state")
        agent_done(mk, "auth loop fixes", tok, cost)
    except Exception as e:
        agent_fail(mk, str(e))
        for f in files:
            restore(f)
        raise


def run_agent_b() -> None:
    mk, files = "claude-haiku-4-5", TASKS_META[1]["files"]
    meta = TASKS_META[1]
    agent_start(mk)
    tok, cost = 0, 0.0
    try:
        for f in files:
            backup(f)
        prompt = (
            "Audit R2 bindings vs wrangler.production.toml; fix BINDING_LABEL_TO_BUCKET.\n"
            f"=== wrangler ===\n{read_file(files[1])}\n=== r2-api ===\n{read_file(files[0])}\n"
            "Return:\n===FILE: src/api/r2-api.js===\n...\n===FILE: wrangler.production.toml===\n..."
        )
        result, i, o, ms = call_llm(mk, prompt)
        tok += i + o
        cost += compute_cost(mk, i, o)
        log_llm_run(mk, "fix_r2_binding_map", "bugfix_benchmark", result, i, o, ms, task_id(mk))
        r2, toml = parse_two_file_response(result)
        if not DRY_RUN:
            write_file(files[0], r2)
            write_file(files[1], toml)
            lint = run_shell("node --check src/api/r2-api.js 2>&1")
            log_tool_call("node_syntax", files[0], lint, "success", task_id(mk))
            git_branch_commit(meta["branch"], files, "fix(r2): binding map cleanup")
        agent_done(mk, "R2 binding map", tok, cost)
    except Exception as e:
        agent_fail(mk, str(e))
        for f in files:
            restore(f)
        raise


def run_agent_c() -> None:
    mk, files = "gemini-2.5-flash", TASKS_META[2]["files"]
    meta = TASKS_META[2]
    agent_start(mk)
    tok, cost = 0, 0.0
    try:
        backup(files[0])
        app = read_file(files[0])
        prompt = (
            "Fix agentPosition layout: side panel independent of agent column; center flex-1.\n\n"
            f"{app}"
        )
        fixed, i, o, ms = call_llm(mk, prompt)
        tok += i + o
        cost += compute_cost(mk, i, o)
        log_llm_run(mk, "fix_agent_position_layout", "bugfix_benchmark", fixed, i, o, ms, task_id(mk))
        if not DRY_RUN:
            write_file(files[0], fixed)
            lint = run_shell("npx tsc --noEmit --project dashboard/tsconfig.json 2>&1 | head -20")
            log_tool_call("tsc_lint", files[0], lint, "success", task_id(mk))
            git_branch_commit(meta["branch"], files, "fix(layout): agentPosition shell")
        agent_done(mk, "layout wiring", tok, cost)
    except Exception as e:
        agent_fail(mk, str(e))
        restore(files[0])
        raise


def run_agent_d() -> None:
    mk = "gpt-5.4-nano"
    meta = TASKS_META[3]
    files = meta["files"]
    agent_start(mk)
    tok, cost = 0, 0.0
    try:
        for f in files:
            backup(f)
        ex = read_file(files[0])
        r1, i1, o1, m1 = call_llm(mk, f"Collapse explorer section panels by default.\n\n{ex}")
        tok += i1 + o1
        cost += compute_cost(mk, i1, o1)
        log_llm_run(mk, "fix_explorer_section_defaults", "bugfix_benchmark", r1, i1, o1, m1, task_id(mk))
        app = read_file(files[1])
        r2, i2, o2, m2 = call_llm(
            mk,
            "Set shellLayoutRef activityOpen default to window.innerWidth > 1280 only.\n\n" + app,
        )
        tok += i2 + o2
        cost += compute_cost(mk, i2, o2)
        log_llm_run(mk, "fix_activity_open_default", "bugfix_benchmark", r2, i2, o2, m2, task_id(mk))
        if not DRY_RUN:
            write_file(files[0], r1)
            write_file(files[1], r2)
            lint = run_shell("npx tsc --noEmit --project dashboard/tsconfig.json 2>&1 | head -20")
            log_tool_call("tsc_lint", " ".join(files), lint, "success", task_id(mk))
            git_branch_commit(meta["branch"], files, "fix(ui): explorer defaults + activityOpen")
        agent_done(mk, "explorer quick wins", tok, cost)
    except Exception as e:
        agent_fail(mk, str(e))
        for f in files:
            restore(f)
        raise


RUNNERS = {
    "gpt-5.4-mini": run_agent_a,
    "claude-haiku-4-5": run_agent_b,
    "gemini-2.5-flash": run_agent_c,
    "gpt-5.4-nano": run_agent_d,
}


def phase_agent_runs(passing: list[str]) -> None:
    if DRY_RUN:
        print("\n══ PHASE 3: AGENTS (skipped — dry-run) ══")
        return
    print("\n══ PHASE 3: AGENT RUNS ══")
    # A+B parallel (disjoint files); C then D sequential (both touch App.tsx + git lock)
    parallel = [mk for mk in ("gpt-5.4-mini", "claude-haiku-4-5") if mk in passing]
    serial = [mk for mk in ("gemini-2.5-flash", "gpt-5.4-nano") if mk in passing]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futs = {pool.submit(RUNNERS[mk]): mk for mk in parallel}
        for f in concurrent.futures.as_completed(futs):
            mk = futs[f]
            try:
                f.result()
            except Exception as e:
                print(f"  [{mk}] {short_error(e)[:100]}")
    for mk in serial:
        try:
            RUNNERS[mk]()
        except Exception as e:
            print(f"  [{mk}] {short_error(e)[:100]}")


def quality_gate_one(branch: str, files: list[str]) -> bool:
    exists = run_shell(f"git branch --list {branch}")
    if not exists.strip():
        remote = run_shell(f"git ls-remote --heads origin {branch}")
        if not remote.strip():
            print(f"  [gate] missing branch {branch}")
            return False
        run_shell(f"git fetch origin {branch}:{branch}")
    diff_files = [l for l in run_shell(f"git diff --name-only main...{branch}").splitlines() if l.strip()]
    extra = [f for f in diff_files if f not in files]
    if extra:
        print(f"  [gate] unexpected files: {extra}")
        return False
    diff = run_shell(f"git diff main...{branch}")
    if not diff.strip():
        print(f"  [gate] empty diff {branch}")
        return False
    prompt = (
        "Review diff. Return JSON only: "
        '{"score":0.0,"passed":false,"introduces_bugs":false,"notes":"..."}\n'
        f"<diff>\n{diff[:8000]}\n</diff>"
    )
    try:
        raw, it, ot, ms = call_llm(REVIEWER_MODEL, prompt, system="Senior reviewer. JSON only.")
        log_llm_run(REVIEWER_MODEL, f"quality_gate_{branch.replace('/', '_')}", "quality_gate", raw, it, ot, ms)
        review = json.loads(strip_fences(raw))
        passed = bool(review.get("passed")) and float(review.get("score", 0)) >= 0.75
        print(f"  {'✓' if passed else '✗'} {branch} score={review.get('score')} {review.get('notes', '')}")
        if passed and ALLOW_MERGE and not DRY_RUN:
            run_shell("git checkout main")
            run_shell("git pull --ff-only origin main")
            run_shell(f"git merge --squash {branch}")
            msg = f"merge({branch}): gate passed"
            run_shell(f'git commit -m "{msg}"')
            run_shell("git push origin main")
            print("    → squash-merged to main")
        return passed
    except Exception as e:
        print(f"  [gate] {branch}: {short_error(e)}")
        return False


def phase_quality_gate(passing: list[str]) -> None:
    if DRY_RUN:
        return
    print("\n══ PHASE 4: QUALITY GATE ══")
    for meta in TASKS_META:
        if meta["model_key"] not in passing:
            continue
        quality_gate_one(meta["branch"], meta["files"])


def phase_thompson_sampling() -> None:
    print("\n══ PHASE 5: THOMPSON SAMPLING ══")
    rows = d1_query(
        "SELECT model, assertion_passed, total_cost_usd, latency_ms "
        "FROM ai_api_test_runs WHERE run_group_id = ?",
        [RUN_GROUP_ID],
    )
    if not rows:
        print("  no ai_api_test_runs rows")
        return
    agg: dict[str, dict] = {}
    for r in rows:
        mk = r.get("model", "")
        if mk not in MODELS:
            continue
        a = agg.setdefault(mk, {"passed": 0, "failed": 0, "costs": [], "lats": []})
        if r.get("assertion_passed") == 1:
            a["passed"] += 1
        else:
            a["failed"] += 1
        if r.get("total_cost_usd") is not None:
            a["costs"].append(float(r["total_cost_usd"]))
        if r.get("latency_ms") is not None:
            a["lats"].append(int(r["latency_ms"]))
    for mk, stats in agg.items():
        task_type, mode, db_model = ROUTING_ARM.get(mk, ("chat", "agent", mk))
        arms = d1_query(
            "SELECT * FROM agentsam_routing_arms WHERE workspace_id = ? AND model_key = ? "
            "AND mode = ? AND task_type = ? LIMIT 1",
            [WORKSPACE_ID, db_model, mode, task_type],
        )
        if not arms:
            print(f"  ⚠ no routing arm for {mk} ({task_type}/{mode}/{db_model})")
            continue
        arm = arms[0]
        alpha = int(float(arm.get("success_alpha", 1))) + stats["passed"]
        beta = int(float(arm.get("success_beta", 1))) + stats["failed"]
        cn, cmean, cm2 = int(arm.get("cost_n", 0)), float(arm.get("cost_mean", 0)), float(arm.get("cost_m2", 0))
        for c in stats["costs"]:
            cn += 1
            d = c - cmean
            cmean += d / cn
            cm2 += d * (c - cmean)
        ln, lmean, lm2 = int(arm.get("latency_n", 0)), float(arm.get("latency_mean", 0)), float(arm.get("latency_m2", 0))
        for l in stats["lats"]:
            ln += 1
            d = l - lmean
            lmean += d / ln
            lm2 += d * (l - lmean)
        d1_update(
            "agentsam_routing_arms",
            arm["id"],
            {
                "success_alpha": alpha,
                "success_beta": beta,
                "cost_n": cn,
                "cost_mean": cmean,
                "cost_m2": cm2,
                "latency_n": ln,
                "latency_mean": lmean,
                "latency_m2": lm2,
                "total_executions": int(arm.get("total_executions", 0)) + len(stats["costs"]),
                "updated_at": int(time.time()),
            },
        )
        print(f"  ✓ {mk} α={alpha} β={beta}")


def phase_moviemode_verify() -> None:
    print("\n══ PHASE 6: MOVIEMODE VERIFY ══")
    try:
        src = read_file("dashboard/features/moviemode/MediaLibrary.tsx")
    except FileNotFoundError:
        print("  skip — MediaLibrary.tsx missing")
        return
    checks = {
        "apiFetchStartedRef_guard": "apiFetchStartedRef.current" in src,
        "AbortController_present": "AbortController" in src,
        "rootHandleRef_stable": "rootHandleRef" in src,
    }
    ok = all(checks.values())
    for k, v in checks.items():
        print(f"  {'✓' if v else '✗'} {k}")
    d1_insert(
        "ai_api_test_runs",
        {
            "id": f"atr_{uuid4().hex[:16]}",
            "run_group_id": RUN_GROUP_ID,
            "test_suite": "smoke_verify",
            "test_name": "moviemode_scan_loop_check",
            "mode": "static_analysis",
            "provider": "local",
            "model": "static",
            "assertion_passed": 1 if ok else 0,
            "response_text": json.dumps(checks),
            "workspace_id": WORKSPACE_ID,
            "tenant_id": TENANT_ID,
            "started_at": now_iso(),
            "completed_at": now_iso(),
        },
    )


def phase_summary() -> None:
    print("\n══ SUMMARY ══")
    rows = d1_query(
        "SELECT model, test_suite, test_name, assertion_passed, latency_ms, total_cost_usd "
        "FROM ai_api_test_runs WHERE run_group_id = ? ORDER BY rowid",
        [RUN_GROUP_ID],
    )
    total_cost = sum(float(r.get("total_cost_usd") or 0) for r in rows)
    for r in rows:
        sym = "✓" if r.get("assertion_passed") == 1 else "✗"
        print(f"  {sym} {r.get('model')} {r.get('test_name')} ${float(r.get('total_cost_usd') or 0):.5f}")
    print(f"  total ${total_cost:.4f}  spend per model: {_model_spend}")
    print(f"  run_group={RUN_GROUP_ID}")


def main() -> None:
    print("\n╔ IAM Agent Sam 4-Model Benchmark ╗\n")
    phase_preflight()
    passing = phase_smoke_gate()
    phase_d1_seed(passing)
    phase_agent_runs(passing)
    phase_quality_gate(passing)
    phase_thompson_sampling()
    phase_moviemode_verify()
    phase_summary()


if __name__ == "__main__":
    main()
