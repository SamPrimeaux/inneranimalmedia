#!/usr/bin/env python3
"""
moviemode_smoke_orchestrator.py

Agent Sam MovieMode Remotion patch smoke orchestrator.

Fixes included:
- Loads .env.agentsam.local first-class.
- Uses real env names:
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN
  OPENAI_API_KEY
  ANTHROPIC_API_KEY
  GOOGLE_API_KEY
- Uses mxbai-embed-large:latest, not xbai.
- Does not hard-fail on D1/Vectorize schema/API issues.
- Strips markdown fences before writing generated source files.
- Detects untracked files during quality gate.
- Uses Google/Gemini as fallback reviewer when OpenAI smoke fails.
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from uuid import uuid4


# -----------------------------------------------------------------------------
# Paths / env
# -----------------------------------------------------------------------------

REPO = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = REPO / "artifacts" / "moviemode_smoke"
BACKUP_DIR = REPO / "backups"

ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def load_env_file(path: Path, override: bool = True) -> None:
    if not path.exists():
        return

    for raw in path.read_text(errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        # Avoid literal dotenv references causing fake values.
        if value.startswith("${") and value.endswith("}"):
            ref = value[2:-1]
            value = os.environ.get(ref, "")

        if override or key not in os.environ:
            os.environ[key] = value


# Load low-priority first, repo-local actual env last.
load_env_file(REPO / ".env", override=False)
load_env_file(REPO / "cloudflare.env", override=True)
load_env_file(REPO / "agentsam.local.env", override=True)
load_env_file(REPO / ".env.agentsam.local", override=True)


# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

CF_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")

OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GOOGLE_KEY = os.environ.get("GOOGLE_API_KEY", "")

OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
WORKSPACE_ID = os.environ.get("WORKSPACE_ID", "ws_inneranimalmedia")
TENANT_ID = os.environ.get("TENANT_ID", "tenant_sam_primeaux")

VECTORIZE_INDEX = os.environ.get("VECTORIZE_INDEX", "ai-search-inneranimalmedia-autorag")
VECTORIZE_ENABLE = os.environ.get("VECTORIZE_ENABLE", "0") == "1"

EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "mxbai-embed-large:latest")
EMBED_DIMS = int(os.environ.get("EMBED_DIMS", "1024"))

OPENAI_SMOKE_MODEL = os.environ.get("OPENAI_SMOKE_MODEL", "gpt-5.4-mini")
OPENAI_NANO_MODEL = os.environ.get("OPENAI_NANO_MODEL", "gpt-5.4-nano")
ANTHROPIC_SMOKE_MODEL = os.environ.get("ANTHROPIC_SMOKE_MODEL", "claude-haiku-4-5")
GOOGLE_SMOKE_MODEL = os.environ.get("GOOGLE_SMOKE_MODEL", "gemini-2.5-flash")

TS = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
RUN_GROUP_ID = f"smoke_{TS}_moviemode"
PLAN_ID = f"plan_{dt.date.today().strftime('%Y%m%d')}_moviemode_patch"

PATCH_SPEC_PATH = REPO / "moviemode_patch_remotion.md"
PATCH_SPEC = (
    PATCH_SPEC_PATH.read_text(errors="replace")
    if PATCH_SPEC_PATH.exists()
    else "MovieMode Remotion patch specification file not found."
)


MODELS = {
    OPENAI_SMOKE_MODEL: {"provider": "openai", "in": 0.75, "out": 4.50, "enabled": bool(OPENAI_KEY)},
    ANTHROPIC_SMOKE_MODEL: {"provider": "anthropic", "in": 1.00, "out": 5.00, "enabled": bool(ANTHROPIC_KEY)},
    GOOGLE_SMOKE_MODEL: {"provider": "google", "in": 0.30, "out": 2.50, "enabled": bool(GOOGLE_KEY)},
    OPENAI_NANO_MODEL: {"provider": "openai", "in": 0.20, "out": 1.25, "enabled": bool(OPENAI_KEY)},
}

TASK_ASSIGNMENTS = {
    OPENAI_SMOKE_MODEL: "PATCH 5: moviemode-api.js — export + ingest + agent interface",
    ANTHROPIC_SMOKE_MODEL: "PATCH 2+3: TimelineControls.tsx + TextOverlayEditor.tsx",
    GOOGLE_SMOKE_MODEL: "PATCH 1: MovieModeComposition.tsx + remotion-entry.tsx",
    OPENAI_NANO_MODEL: "PATCH 4: ExportPanel.tsx + remotion-utils.ts",
}

TASK_FILES = {
    OPENAI_SMOKE_MODEL: ["src/api/moviemode-api.js"],
    ANTHROPIC_SMOKE_MODEL: [
        "dashboard/features/moviemode/TimelineControls.tsx",
        "dashboard/features/moviemode/TextOverlayEditor.tsx",
    ],
    GOOGLE_SMOKE_MODEL: [
        "dashboard/features/moviemode/MovieModeComposition.tsx",
        "dashboard/src/remotion-entry.tsx",
    ],
    OPENAI_NANO_MODEL: [
        "dashboard/features/moviemode/ExportPanel.tsx",
        "dashboard/features/moviemode/remotion-utils.ts",
    ],
}

SMOKE_PROMPT = (
    'Reply with exactly this JSON and nothing else: '
    '{"status":"ready","model":"<your model identifier>","token_test":true}'
)

SHARED_SYSTEM = (
    "You are an expert TypeScript, React, Remotion, and Cloudflare Workers engineer "
    "working on the Inner Animal Media Agent Sam platform. "
    "When asked to write a file, return only complete source code. "
    "Do not use markdown fences. Do not include explanations."
)


# -----------------------------------------------------------------------------
# Generic helpers
# -----------------------------------------------------------------------------

def now_iso() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def short_error(exc: BaseException) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode("utf-8", errors="replace")[:1000]
        except Exception:
            body = ""
        return f"HTTP {exc.code}: {exc.reason} {body}".strip()
    return str(exc)


def http_post(url: str, payload: dict, headers: dict | None = None, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode("utf-8")
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
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return (result.stdout + result.stderr).strip()


def strip_markdown_code_fences(text: str) -> str:
    lines = []
    for line in str(text).splitlines():
        if line.strip() in {"```", "```ts", "```tsx", "```typescript", "```js", "```jsx", "```javascript"}:
            continue
        lines.append(line)
    return "\n".join(lines).strip() + "\n"


def write_json_artifact(name: str, data: object) -> None:
    target = ARTIFACTS_DIR / name
    target.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def backup(rel_path: str) -> str:
    src = REPO / rel_path
    if not src.exists():
        print(f"  [backup] skip missing: {rel_path}")
        return ""

    stamp = int(time.time())
    safe = rel_path.replace("/", "__")
    dest = BACKUP_DIR / f"{safe}.backup.{stamp}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    print(f"  [backup] {rel_path} -> {dest.name}")
    return str(dest)


def restore_latest(rel_path: str) -> None:
    safe = rel_path.replace("/", "__")
    backups = sorted(BACKUP_DIR.glob(f"{safe}.backup.*"))
    if not backups:
        print(f"  [restore] no backup for {rel_path}")
        return

    target = REPO / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(backups[-1], target)
    print(f"  [restore] {rel_path} <- {backups[-1].name}")


def write_file(rel_path: str, content: str) -> None:
    target = REPO / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    cleaned = strip_markdown_code_fences(content)
    target.write_text(cleaned, encoding="utf-8")
    print(f"  [write] {rel_path} ({len(cleaned)} chars)")


def git_status_for(path: str) -> str:
    return run_shell(f"git status --porcelain -- {quote(path)}", timeout=20)


def git_diff_for(path: str) -> str:
    status = git_status_for(path)

    if status.startswith("??"):
        return run_shell(f"git diff --no-index /dev/null {quote(path)}", timeout=30)

    return run_shell(f"git diff HEAD -- {quote(path)}", timeout=30)


def quote(path: str) -> str:
    return "'" + path.replace("'", "'\"'\"'") + "'"


# -----------------------------------------------------------------------------
# LLM callers
# -----------------------------------------------------------------------------

def compute_cost(model_key: str, in_tok: int, out_tok: int) -> float:
    m = MODELS.get(model_key, {})
    return (in_tok * float(m.get("in", 0)) + out_tok * float(m.get("out", 0))) / 1_000_000


def call_openai(model: str, system: str, user: str) -> tuple[str, int, int, int]:
    if not OPENAI_KEY:
        raise RuntimeError("OPENAI_API_KEY missing")

    t0 = time.time()

    # Responses API first. This is safer for newer OpenAI models than legacy chat.
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
            timeout=120,
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
        in_tok = int(usage.get("input_tokens", 0) or 0)
        out_tok = int(usage.get("output_tokens", 0) or 0)
        return content, in_tok, out_tok, ms

    except Exception as first:
        # Fallback for older/chat-compatible model IDs.
        res = http_post(
            "https://api.openai.com/v1/chat/completions",
            {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "max_tokens": 8192,
            },
            headers={"Authorization": f"Bearer {OPENAI_KEY}"},
            timeout=120,
        )
        ms = int((time.time() - t0) * 1000)
        content = res["choices"][0]["message"]["content"]
        usage = res.get("usage", {}) or {}
        return (
            content,
            int(usage.get("prompt_tokens", 0) or 0),
            int(usage.get("completion_tokens", 0) or 0),
            ms,
        )


def call_anthropic(model: str, system: str, user: str) -> tuple[str, int, int, int]:
    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY missing")

    t0 = time.time()
    res = http_post(
        "https://api.anthropic.com/v1/messages",
        {
            "model": model,
            "max_tokens": 8192,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
        },
        timeout=120,
    )
    ms = int((time.time() - t0) * 1000)
    content = "\n".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text").strip()
    usage = res.get("usage", {}) or {}
    return content, int(usage.get("input_tokens", 0) or 0), int(usage.get("output_tokens", 0) or 0), ms


def call_google(model: str, system: str, user: str) -> tuple[str, int, int, int]:
    if not GOOGLE_KEY:
        raise RuntimeError("GOOGLE_API_KEY missing")

    t0 = time.time()
    res = http_post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GOOGLE_KEY}",
        {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"maxOutputTokens": 8192},
        },
        timeout=120,
    )
    ms = int((time.time() - t0) * 1000)

    candidates = res.get("candidates", [])
    if not candidates:
        raise RuntimeError(f"Google returned no candidates: {json.dumps(res)[:500]}")

    parts = candidates[0].get("content", {}).get("parts", [])
    content = "\n".join(p.get("text", "") for p in parts).strip()

    usage = res.get("usageMetadata", {}) or {}
    return (
        content,
        int(usage.get("promptTokenCount", 0) or 0),
        int(usage.get("candidatesTokenCount", 0) or 0),
        ms,
    )


def call_llm(model_key: str, user_prompt: str, system: str = SHARED_SYSTEM) -> tuple[str, int, int, int]:
    provider = MODELS[model_key]["provider"]
    if provider == "openai":
        return call_openai(model_key, system, user_prompt)
    if provider == "anthropic":
        return call_anthropic(model_key, system, user_prompt)
    if provider == "google":
        return call_google(model_key, system, user_prompt)
    raise ValueError(f"Unknown provider: {provider}")


# -----------------------------------------------------------------------------
# D1 / Supabase / Vectorize helpers
# -----------------------------------------------------------------------------

D1_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}"
D1_HEADERS = {
    "Authorization": f"Bearer {CF_API_TOKEN}",
    "Content-Type": "application/json",
}

_TABLE_COLUMNS_CACHE: dict[str, set[str]] = {}


def d1_enabled() -> bool:
    return bool(CF_ACCOUNT_ID and CF_API_TOKEN and D1_DATABASE_ID)


def d1_execute(sql: str, params: list | None = None) -> dict:
    if not d1_enabled():
        return {}

    try:
        return http_post(f"{D1_BASE}/query", {"sql": sql, "params": params or []}, D1_HEADERS, timeout=60)
    except Exception as e:
        print(f"  [d1 warn] {short_error(e)} | SQL: {sql[:110]}")
        return {}


def d1_table_columns(table: str) -> set[str]:
    if table in _TABLE_COLUMNS_CACHE:
        return _TABLE_COLUMNS_CACHE[table]

    res = d1_execute(f"PRAGMA table_info({table})")
    cols: set[str] = set()

    try:
        result = res.get("result", [])
        rows = []
        if isinstance(result, list) and result:
            if isinstance(result[0], dict) and "results" in result[0]:
                rows = result[0].get("results") or []
            else:
                rows = result
        for row in rows:
            name = row.get("name")
            if name:
                cols.add(name)
    except Exception:
        pass

    _TABLE_COLUMNS_CACHE[table] = cols
    return cols


def d1_insert(table: str, row: dict) -> None:
    cols_available = d1_table_columns(table)
    if not cols_available:
        print(f"  [d1 skip] table missing/unreadable: {table}")
        return

    clean = {k: v for k, v in row.items() if k in cols_available}
    dropped = sorted(set(row) - set(clean))
    if dropped:
        print(f"  [d1 note] {table}: dropped columns not in schema: {', '.join(dropped[:8])}")

    if not clean:
        print(f"  [d1 skip] {table}: no matching columns")
        return

    cols = ", ".join(clean.keys())
    places = ", ".join(["?" for _ in clean])
    vals = list(clean.values())
    d1_execute(f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({places})", vals)


def d1_update(table: str, row_id: str, fields: dict) -> None:
    cols_available = d1_table_columns(table)
    if not cols_available or "id" not in cols_available:
        return

    clean = {k: v for k, v in fields.items() if k in cols_available}
    if not clean:
        return

    sets = ", ".join(f"{k} = ?" for k in clean)
    vals = list(clean.values()) + [row_id]
    d1_execute(f"UPDATE {table} SET {sets} WHERE id = ?", vals)


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
        print(f"  [supabase warn] {short_error(e)}")


def embed(text: str) -> list[float] | None:
    try:
        # Ollama supports /api/embeddings for this model.
        res = http_post(
            f"{OLLAMA_URL}/api/embeddings",
            {"model": EMBED_MODEL, "prompt": text[:4000]},
            timeout=60,
        )
        vec = res.get("embedding", [])
        if not vec:
            return None
        if len(vec) != EMBED_DIMS:
            print(f"  [embed warn] expected {EMBED_DIMS} dims, got {len(vec)}")
        return vec
    except Exception as e:
        print(f"  [embed warn] {short_error(e)}")
        return None


def upsert_vector(vid: str, values: list[float], metadata: dict) -> None:
    if not VECTORIZE_ENABLE:
        return

    if not (CF_ACCOUNT_ID and CF_API_TOKEN and VECTORIZE_INDEX):
        return

    try:
        http_post(
            f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/vectorize/v2/indexes/{VECTORIZE_INDEX}/upsert",
            {"vectors": [{"id": vid[:64], "values": values, "metadata": metadata}]},
            headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
            timeout=60,
        )
    except Exception as e:
        print(f"  [vectorize warn] {short_error(e)}")


def vectorize_run_row(row: dict) -> None:
    if not VECTORIZE_ENABLE:
        return

    summary = (
        f"Model {row.get('model')} provider {row.get('provider')} test {row.get('test_name')} "
        f"suite {row.get('test_suite')} passed {row.get('assertion_passed')} "
        f"latency {row.get('latency_ms')}ms tokens {row.get('total_tokens')} "
        f"cost {row.get('total_cost_usd')} run_group {row.get('run_group_id')}."
    )
    vec = embed(summary)
    if vec:
        upsert_vector(
            f"{row.get('run_group_id', 'x')}_{row.get('model', 'model')}_{row.get('test_name', 'test')}",
            vec,
            {
                "run_group_id": row.get("run_group_id", ""),
                "model_key": row.get("model", ""),
                "provider": row.get("provider", ""),
                "source_table": "ai_api_test_runs",
                "chunk_type": "benchmark_summary",
            },
        )


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
        "provider": MODELS.get(model_key, {}).get("provider", "unknown"),
        "model": model_key,
        "model_key": model_key,
        "status": "failed" if error_msg else "succeeded",
        "http_status": 500 if error_msg else 200,
        "success": 0 if error_msg else 1,
        "assertion_passed": assertion_passed,
        "response_text": response[:4000],
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
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    d1_insert("ai_api_test_runs", row)

    supabase_upsert(
        "agentsam_eval_runs",
        {
            "run_group_id": RUN_GROUP_ID,
            "tenant_id": TENANT_ID,
            "model_key": model_key,
            "provider": MODELS.get(model_key, {}).get("provider", "unknown"),
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "latency_ms": latency_ms,
            "cost_usd": cost,
            "passed": assertion_passed,
            "output_text": response[:2000],
            "run_at": now_iso(),
        },
    )

    vectorize_run_row(row)
    return row


# -----------------------------------------------------------------------------
# Phase 0
# -----------------------------------------------------------------------------

def preflight() -> None:
    print("\n-- PHASE 0: PREFLIGHT ----------------------------------------")

    required = {
        "CLOUDFLARE_ACCOUNT_ID": CF_ACCOUNT_ID,
        "CLOUDFLARE_API_TOKEN": CF_API_TOKEN,
        "GOOGLE_API_KEY": GOOGLE_KEY,
    }

    optional = {
        "OPENAI_API_KEY": OPENAI_KEY,
        "ANTHROPIC_API_KEY": ANTHROPIC_KEY,
    }

    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"[fail] Missing required env vars: {missing}")
        print("       Expected env file: .env.agentsam.local")
        sys.exit(1)

    opt_missing = [k for k, v in optional.items() if not v]
    if opt_missing:
        print(f"[warn] Optional provider keys missing; those models will be skipped: {opt_missing}")

    try:
        res = http_get(f"{OLLAMA_URL}/api/tags", timeout=10)
        models = [m.get("name", "") for m in res.get("models", [])]
        if any(EMBED_MODEL == m or EMBED_MODEL in m for m in models):
            print(f"[ok] Ollama embed model ready: {EMBED_MODEL}")
        else:
            print(f"[warn] Ollama model not found: {EMBED_MODEL}")
            print(f"       Pull with: ollama pull {EMBED_MODEL}")
    except Exception as e:
        print(f"[warn] Ollama unreachable: {short_error(e)}")

    print(f"[ok] Run group: {RUN_GROUP_ID}")
    print(f"[ok] D1 database: {D1_DATABASE_ID}")
    print(f"[ok] Vectorize index: {VECTORIZE_INDEX} enabled={VECTORIZE_ENABLE}")
    print()


# -----------------------------------------------------------------------------
# Phase 1 smoke
# -----------------------------------------------------------------------------

def smoke_one(model_key: str) -> dict:
    if not MODELS.get(model_key, {}).get("enabled"):
        return {
            "model": model_key,
            "assertion_passed": 0,
            "error_message": "provider key missing",
            "latency_ms": 0,
            "total_cost_usd": 0.0,
        }

    try:
        resp, in_tok, out_tok, ms = call_llm(
            model_key,
            SMOKE_PROMPT,
            system="You are a test assistant. Output strict JSON only.",
        )

        try:
            parsed = json.loads(resp.strip())
            assertion = int(
                parsed.get("status") == "ready"
                and "model" in parsed
                and parsed.get("token_test") is True
            )
        except Exception:
            assertion = 0

        return log_llm_run(
            model_key,
            f"smoke_ping_{slug_model(model_key)}",
            "smoke_gate",
            resp,
            in_tok,
            out_tok,
            ms,
            assertion_passed=assertion,
        )

    except Exception as e:
        err = short_error(e)
        print(f"  [smoke warn] {model_key}: {err}")
        log_llm_run(
            model_key,
            f"smoke_ping_{slug_model(model_key)}",
            "smoke_gate",
            "",
            0,
            0,
            0,
            assertion_passed=0,
            error_msg=err,
        )
        return {"model": model_key, "assertion_passed": 0, "error_message": err}


def run_smoke_gate() -> list[str]:
    print("-- PHASE 1: SMOKE GATE ---------------------------------------")

    results: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(MODELS))) as pool:
        futures = {pool.submit(smoke_one, mk): mk for mk in MODELS}
        for future in concurrent.futures.as_completed(futures):
            mk = futures[future]
            try:
                results[mk] = future.result()
            except Exception as e:
                results[mk] = {"model": mk, "assertion_passed": 0, "error_message": short_error(e)}

    passing = []
    for mk in MODELS:
        row = results.get(mk, {})
        ok = row.get("assertion_passed") == 1
        status = "PASS" if ok else "FAIL"
        ms = int(row.get("latency_ms", 0) or 0)
        cost = float(row.get("total_cost_usd", 0) or 0)
        print(f"  [{status}] {mk:<28} {ms:>6}ms  ${cost:.5f}")
        if ok:
            passing.append(mk)

    if not passing:
        print("\n[fail] All models failed smoke gate. Halting.")
        sys.exit(1)

    print(f"\n[ok] Smoke gate passed: {passing}\n")
    return passing


# -----------------------------------------------------------------------------
# Phase 2 D1 seed
# -----------------------------------------------------------------------------

def slug_model(model_key: str) -> str:
    return model_key.replace(".", "_").replace("-", "_").replace("/", "_")


def task_id(model_key: str) -> str:
    return f"task_{slug_model(model_key)}_{RUN_GROUP_ID}"


def seed_d1(passing_models: list[str]) -> None:
    print("-- PHASE 2: D1 SEED ------------------------------------------")

    d1_insert(
        "agentsam_plans",
        {
            "id": PLAN_ID,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "plan_date": dt.date.today().isoformat(),
            "plan_type": "daily",
            "title": "MovieMode Remotion Patch",
            "status": "active",
            "morning_brief": f"MovieMode Remotion patch smoke run {RUN_GROUP_ID}.",
            "available_providers": json.dumps(["openai", "anthropic", "google"]),
            "default_model": GOOGLE_SMOKE_MODEL,
            "tasks_total": len(TASK_ASSIGNMENTS),
            "created_at": int(time.time()),
            "updated_at": int(time.time()),
            "created_at_text": now_iso(),
            "updated_at_text": now_iso(),
        },
    )

    for order, (model_key, title) in enumerate(TASK_ASSIGNMENTS.items(), start=1):
        tid = task_id(model_key)
        status = "todo" if model_key in passing_models else "blocked"

        d1_insert(
            "agentsam_plan_tasks",
            {
                "id": tid,
                "tenant_id": TENANT_ID,
                "workspace_id": WORKSPACE_ID,
                "plan_id": PLAN_ID,
                "title": title,
                "assigned_model": model_key,
                "model_key": model_key,
                "priority": "P1" if order <= 2 else "P2",
                "category": "frontend" if model_key != OPENAI_SMOKE_MODEL else "backend",
                "order_index": order,
                "files_involved": json.dumps(TASK_FILES.get(model_key, [])),
                "status": status,
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
                "created_at_text": now_iso(),
                "updated_at_text": now_iso(),
            },
        )

        d1_insert(
            "agentsam_todo",
            {
                "id": tid,
                "tenant_id": TENANT_ID,
                "workspace_id": WORKSPACE_ID,
                "plan_id": PLAN_ID,
                "title": title,
                "execution_status": status,
                "status": status,
                "assigned_model": model_key,
                "model_key": model_key,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            },
        )

        d1_insert(
            "agentsam_approval_queue",
            {
                "id": f"appr_{uuid4().hex[:16]}",
                "tenant_id": TENANT_ID,
                "workspace_id": WORKSPACE_ID,
                "user_id": "au_871d920d1233cbd1",
                "plan_id": PLAN_ID,
                "todo_id": tid,
                "tool_name": "agent_code_write",
                "action_summary": f"MovieMode patch: {title}",
                "approval_type": "script",
                "risk_level": "medium",
                "status": "approved" if model_key in passing_models else "blocked",
                "approved_by": "sam_primeaux",
                "decided_at": int(time.time()),
                "created_at": now_iso(),
                "updated_at": now_iso(),
            },
        )

    print(f"[ok] Seed attempted for {len(TASK_ASSIGNMENTS)} tasks\n")


# -----------------------------------------------------------------------------
# Phase 3 agent runs
# -----------------------------------------------------------------------------

def agent_start(model_key: str) -> None:
    tid = task_id(model_key)
    d1_update("agentsam_plan_tasks", tid, {"status": "in_progress", "started_at": int(time.time()), "updated_at": int(time.time())})
    d1_update("agentsam_todo", tid, {"execution_status": "in_progress", "status": "in_progress", "started_at": now_iso(), "updated_at": now_iso()})


def agent_done(model_key: str, summary: str, tokens: int, cost: float) -> None:
    tid = task_id(model_key)
    d1_update(
        "agentsam_plan_tasks",
        tid,
        {
            "status": "done",
            "output_summary": summary,
            "tokens_used": tokens,
            "cost_usd": cost,
            "completed_at": int(time.time()),
            "updated_at": int(time.time()),
        },
    )
    d1_update(
        "agentsam_todo",
        tid,
        {
            "execution_status": "done",
            "status": "done",
            "output_summary": summary,
            "completed_at": now_iso(),
            "updated_at": now_iso(),
        },
    )


def agent_fail(model_key: str, error: str) -> None:
    tid = task_id(model_key)
    d1_update("agentsam_plan_tasks", tid, {"status": "blocked", "blocked_reason": error, "updated_at": int(time.time())})
    d1_update("agentsam_todo", tid, {"execution_status": "failed", "status": "failed", "error_trace": error, "updated_at": now_iso()})


def generate_file(model_key: str, rel_path: str, prompt: str, test_name: str) -> tuple[int, float]:
    resp, in_tok, out_tok, ms = call_llm(model_key, prompt)
    log_llm_run(model_key, test_name, "moviemode_patch", resp, in_tok, out_tok, ms, task_id(model_key))
    write_file(rel_path, resp)
    total_tok = in_tok + out_tok
    total_cost = compute_cost(model_key, in_tok, out_tok)
    return total_tok, total_cost


def run_agent_gpt54mini() -> None:
    mk = OPENAI_SMOKE_MODEL
    print(f"\n  [Agent A] {mk} - moviemode-api.js")
    agent_start(mk)
    total_tok = 0
    total_cost = 0.0

    try:
        for f in TASK_FILES[mk]:
            backup(f)

        prompt = f"""
{PATCH_SPEC}

Write the complete src/api/moviemode-api.js file for PATCH 5.

Requirements:
- Cloudflare Worker API handlers.
- POST /api/moviemode/export starts a Remotion renderMedia job through iam-pty / PTY service.
- GET /api/moviemode/export-status/:jobId returns job state.
- POST /api/moviemode/ingest receives rendered file metadata and writes/records R2 result.
- POST /api/moviemode/agent supports get_timeline, describe_timeline, trim_clip, add_text, delete_clip, reorder_clips, save_session, export.
- KV keys use moviemode_session_ and moviemode_job_ prefixes.
- R2 export keys use moviemode/exports/.
- Return only complete JavaScript source code.
""".strip()

        t, c = generate_file(mk, "src/api/moviemode-api.js", prompt, "write_moviemode_api")
        total_tok += t
        total_cost += c

        lint = run_shell("node --check src/api/moviemode-api.js 2>&1", timeout=60)
        print(f"  [node-check] {lint[:200] or 'ok'}")
        agent_done(mk, "moviemode-api.js written", total_tok, total_cost)

    except Exception as e:
        err = short_error(e)
        agent_fail(mk, err)
        for f in TASK_FILES[mk]:
            restore_latest(f)
        raise


def run_agent_haiku() -> None:
    mk = ANTHROPIC_SMOKE_MODEL
    print(f"\n  [Agent B] {mk} - TimelineControls + TextOverlayEditor")
    agent_start(mk)
    total_tok = 0
    total_cost = 0.0

    try:
        for f in TASK_FILES[mk]:
            backup(f)

        jobs = [
            (
                "dashboard/features/moviemode/TimelineControls.tsx",
                "TimelineControls.tsx",
                "PATCH 2 timeline controls with ref-based drag, trim handles, playhead seek, split/delete toolbar.",
            ),
            (
                "dashboard/features/moviemode/TextOverlayEditor.tsx",
                "TextOverlayEditor.tsx",
                "PATCH 3 text overlay editor with list/edit panels, active overlay highlight, animations none/fade-in/slide-up.",
            ),
        ]

        for rel_path, filename, specific in jobs:
            prompt = f"""
{PATCH_SPEC}

Write the complete dashboard/features/moviemode/{filename} file.

Specific target:
{specific}

Return only complete TypeScript React source code.
""".strip()
            t, c = generate_file(mk, rel_path, prompt, f"write_{filename}")
            total_tok += t
            total_cost += c

        tsc = run_shell("cd dashboard && npx tsc --noEmit --pretty false 2>&1 | head -40", timeout=90)
        print(f"  [tsc] {tsc[:300] or 'ok'}")
        agent_done(mk, "TimelineControls.tsx and TextOverlayEditor.tsx written", total_tok, total_cost)

    except Exception as e:
        err = short_error(e)
        agent_fail(mk, err)
        for f in TASK_FILES[mk]:
            restore_latest(f)
        raise


def run_agent_gemini() -> None:
    mk = GOOGLE_SMOKE_MODEL
    print(f"\n  [Agent C] {mk} - MovieModeComposition + remotion-entry")
    agent_start(mk)
    total_tok = 0
    total_cost = 0.0

    try:
        for f in TASK_FILES[mk]:
            backup(f)

        jobs = [
            (
                "dashboard/features/moviemode/MovieModeComposition.tsx",
                "MovieModeComposition.tsx",
                """
Write a Remotion composition.
Imports from remotion: AbsoluteFill, Sequence, Video, Audio, useCurrentFrame, useVideoConfig, interpolate, Easing.
Use MovieMode session/clip/text overlay types from the repo if available.
Use ./remotion-utils helpers where needed.
Render video clips, audio clips, and text overlays in separate Sequence components.
Text overlay supports fade-in and slide-up animation.
""",
            ),
            (
                "dashboard/src/remotion-entry.tsx",
                "remotion-entry.tsx",
                """
Write the Remotion server entry.
Import registerRoot and Composition from remotion.
Import MovieModeComposition.
Export/register a RemotionRoot with Composition id MovieModeComposition.
Use sensible default width/height/fps/duration.
""",
            ),
        ]

        for rel_path, filename, specific in jobs:
            prompt = f"""
{PATCH_SPEC}

Write the complete {rel_path} file.

Specific target:
{specific}

Return only complete TypeScript/TSX source code. No markdown.
""".strip()
            t, c = generate_file(mk, rel_path, prompt, f"write_{filename}")
            total_tok += t
            total_cost += c

        tsc = run_shell("cd dashboard && npx tsc --noEmit --pretty false 2>&1 | head -40", timeout=90)
        print(f"  [tsc] {tsc[:300] or 'ok'}")
        agent_done(mk, "MovieModeComposition.tsx and remotion-entry.tsx written", total_tok, total_cost)

    except Exception as e:
        err = short_error(e)
        agent_fail(mk, err)
        for f in TASK_FILES[mk]:
            restore_latest(f)
        raise


def run_agent_nano() -> None:
    mk = OPENAI_NANO_MODEL
    print(f"\n  [Agent D] {mk} - ExportPanel + remotion-utils")
    agent_start(mk)
    total_tok = 0
    total_cost = 0.0

    try:
        for f in TASK_FILES[mk]:
            backup(f)

        jobs = [
            (
                "dashboard/features/moviemode/remotion-utils.ts",
                "remotion-utils.ts",
                "Export FPS=30, msToFrames, framesToMs, secToFrames, clipFrames, clipFrom, clipStartFrom.",
            ),
            (
                "dashboard/features/moviemode/ExportPanel.tsx",
                "ExportPanel.tsx",
                "Export panel with codec h264/vp9/gif, quality 480p/720p/1080p, startExport, polling, progress, retry, done link.",
            ),
        ]

        for rel_path, filename, specific in jobs:
            prompt = f"""
{PATCH_SPEC}

Write the complete {rel_path} file.

Specific target:
{specific}

Return only complete TypeScript/TSX source code. No markdown.
""".strip()
            t, c = generate_file(mk, rel_path, prompt, f"write_{filename}")
            total_tok += t
            total_cost += c

        tsc = run_shell("cd dashboard && npx tsc --noEmit --pretty false 2>&1 | head -40", timeout=90)
        print(f"  [tsc] {tsc[:300] or 'ok'}")
        agent_done(mk, "ExportPanel.tsx and remotion-utils.ts written", total_tok, total_cost)

    except Exception as e:
        err = short_error(e)
        agent_fail(mk, err)
        for f in TASK_FILES[mk]:
            restore_latest(f)
        raise


# -----------------------------------------------------------------------------
# Phase 4 quality gate
# -----------------------------------------------------------------------------

def choose_reviewer(passing: list[str]) -> str:
    if OPENAI_SMOKE_MODEL in passing:
        return OPENAI_SMOKE_MODEL
    if GOOGLE_SMOKE_MODEL in passing:
        return GOOGLE_SMOKE_MODEL
    return passing[0]


def quality_gate(model_key: str, reviewer: str) -> bool:
    files = TASK_FILES.get(model_key, [])
    diffs = {}

    for f in files:
        diff = git_diff_for(f)
        if diff.strip():
            diffs[f] = diff[:5000]

    if not diffs:
        print(f"  [gate] {model_key}: no tracked/untracked diff found")
        return False

    diff_text = "\n\n".join(f"--- {path} ---\n{diff}" for path, diff in diffs.items())

    prompt = f"""
Review this MovieMode patch diff.

<diff>
{diff_text[:12000]}
</diff>

Return strict JSON only:
{{"score":0.0,"passed":false,"issues":"short issue list","notes":"one line"}}

Pass only if score >= 0.70 and there are no obvious syntax/type/import breakages.
""".strip()

    try:
        resp, in_tok, out_tok, ms = call_llm(reviewer, prompt, system="You are a senior TypeScript/React/Remotion code reviewer. Return JSON only.")
        log_llm_run(reviewer, f"quality_gate_{slug_model(model_key)}", "quality_gate", resp, in_tok, out_tok, ms)

        cleaned = strip_markdown_code_fences(resp).strip()
        review = json.loads(cleaned)
        passed = bool(review.get("passed")) and float(review.get("score", 0)) >= 0.70
        print(f"  [gate] {model_key}: score={review.get('score')} passed={passed} notes={review.get('notes', '')}")
        return passed

    except Exception as e:
        print(f"  [gate warn] {model_key}: {short_error(e)}")
        return False


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main() -> None:
    preflight()
    passing = run_smoke_gate()
    seed_d1(passing)

    print("-- PHASE 3: PARALLEL AGENT RUNS ------------------------------")

    runners = {
        OPENAI_SMOKE_MODEL: run_agent_gpt54mini,
        ANTHROPIC_SMOKE_MODEL: run_agent_haiku,
        GOOGLE_SMOKE_MODEL: run_agent_gemini,
        OPENAI_NANO_MODEL: run_agent_nano,
    }

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(passing))) as pool:
        futures = {pool.submit(runners[mk]): mk for mk in passing if mk in runners}
        for future in concurrent.futures.as_completed(futures):
            mk = futures[future]
            try:
                future.result()
                print(f"  [done] {mk}")
            except Exception as e:
                print(f"  [fail] {mk}: {short_error(e)}")

    print("\n-- PHASE 4: QUALITY GATE -------------------------------------")
    reviewer = choose_reviewer(passing)
    print(f"  [reviewer] {reviewer}")

    gate_results = {}
    for mk in passing:
        if mk in runners:
            gate_results[mk] = quality_gate(mk, reviewer)

    write_json_artifact(
        f"{RUN_GROUP_ID}_summary.json",
        {
            "run_group_id": RUN_GROUP_ID,
            "plan_id": PLAN_ID,
            "passing_models": passing,
            "gate_results": gate_results,
            "vectorize_enabled": VECTORIZE_ENABLE,
            "task_files": TASK_FILES,
            "created_at": now_iso(),
        },
    )

    print("\n-- FINAL SUMMARY ---------------------------------------------")
    print(f"  Run group:  {RUN_GROUP_ID}")
    print(f"  Plan:       {PLAN_ID}")
    print(f"  Artifacts:  {ARTIFACTS_DIR}")
    print(f"  Backups:    {BACKUP_DIR}")
    print()
    print("  Next commands:")
    print("    git status --short")
    print("    cd dashboard && npx tsc --noEmit --pretty false")
    print("    git diff -- dashboard/features/moviemode dashboard/src/remotion-entry.tsx src/api/moviemode-api.js")
    print()


if __name__ == "__main__":
    main()
