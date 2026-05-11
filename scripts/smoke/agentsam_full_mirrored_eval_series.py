#!/usr/bin/env python3
import base64
import json
import os
import re
import subprocess
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ----------------------------
# Config
# ----------------------------

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") == "1"

TENANT_ID = os.getenv("TENANT_ID", "tenant_sam_primeaux")
WORKSPACE_ID = os.getenv("WORKSPACE_ID", "ws_inneranimalmedia")
USER_ID = os.getenv("USER_ID", "sam_primeaux")
EVAL_SUITE_ID = os.getenv("EVAL_SUITE_ID", "evs_provider_benchmark")

EXPECTED_SUPABASE_REF = os.getenv("EXPECTED_SUPABASE_REF", "dpmuvynqixblxsilnlut")
SUPABASE_URL = os.getenv("SUPABASE_URL", f"https://{EXPECTED_SUPABASE_REF}.supabase.co").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
MIRROR_SUPABASE = os.getenv("MIRROR_SUPABASE", "1") == "1"

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_RUNTIME_MODEL = os.getenv("OLLAMA_RUNTIME_MODEL", "qwen2.5-coder:7b")
OLLAMA_MODEL_KEY = os.getenv("OLLAMA_MODEL_KEY", "ollama-qwen-coder-7b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "mxbai-embed-large")
OLLAMA_EMBED_MODEL_KEY = os.getenv("OLLAMA_EMBED_MODEL_KEY", "ollama-mxbai-embed-large")
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "500"))

RUN_CLOUD = os.getenv("RUN_CLOUD", "0") == "1"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
NANO_MODEL = os.getenv("NANO_MODEL", "gpt-5.4-nano")
MINI_MODEL = os.getenv("MINI_MODEL", "gpt-5.4-mini")
RUN_MINI_EVERY = int(os.getenv("RUN_MINI_EVERY", "4"))
SERIES_BUDGET_USD = float(os.getenv("SERIES_BUDGET_USD", "2.00"))
CLOUD_RESERVE_USD = float(os.getenv("CLOUD_RESERVE_USD", "0.05"))

TASK_LIMIT = int(os.getenv("TASK_LIMIT", "0"))
PREFLIGHT_ONLY = os.getenv("PREFLIGHT_ONLY", "0") == "1"

SERIES_ID = "series_" + uuid.uuid4().hex[:12]
OUT_DIR = Path(f"tmp/ollama_cloud_series/{SERIES_ID}")
RUNS_JSONL = OUT_DIR / "runs.jsonl"
REPORT_JSON = OUT_DIR / "report.json"
SITE_DIR = Path(f"tmp/agent_site_build/{SERIES_ID}")

TASKS = [
    (
        "site_home",
        "Build the homepage for a local multi-page Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. The page should introduce the eval system and link to Overview, Models, Runs, Artifacts, and Parity pages."
    ),
    (
        "site_overview",
        "Build the Overview page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include KPI cards for total runs, D1 rows, Supabase rows, embedded rows, cloud spend, and parity status."
    ),
    (
        "site_models",
        "Build the Models page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include model comparison sections for Ollama qwen2.5-coder, GPT-5.4 Nano, and GPT-5.4 Mini with runs, tokens, cost, and quality."
    ),
    (
        "site_runs",
        "Build the Runs page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include a recent runs table with provider, model_key, tokens, cost, embedding_dims, status, and artifact_id."
    ),
    (
        "site_artifacts",
        "Build the Artifacts page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include artifact cards, artifact type, local file path, D1 artifact id, and preview snippets."
    ),
    (
        "site_parity",
        "Build the D1/Supabase Parity page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include side-by-side D1 and Supabase row counts, tokens, cost, embedded rows, and checks."
    ),
    (
        "site_costs",
        "Build the Costs page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include cloud budget progress, model spend, cost per output token, and zero-cost local rows."
    ),
    (
        "site_embeddings",
        "Build the Embeddings page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include mxbai-embed-large status, embedding_dims=1024 proof, failures, and coverage."
    ),
    (
        "site_quality",
        "Build the Quality page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Include score_overall, pass rate, model comparison, and rubric notes."
    ),
    (
        "site_readme",
        "Build a README/about page for the local Agent Sam Eval Dashboard website. Return JSON with page_slug, title, html, css_notes, data_widgets, navigation_links. Explain what the local site proves and how D1, Supabase, artifacts, embeddings, and cost tracking connect."
    ),
]

SYSTEM_PROMPT = """Return ONLY valid JSON.
Required top-level fields:
status, provider, model, task_type, summary, concrete_findings, validation_steps, quality_self_score.
No markdown fences. No prose outside JSON.
Use precise Agent Sam / InnerAnimalMedia table names.
"""

# ----------------------------
# Basic helpers
# ----------------------------

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def sql_quote(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

def safe_float(v, default=0.0):
    try:
        return float(v)
    except Exception:
        return default

def estimate_tokens(text):
    return max(1, int(len(text or "") / 4))

def print_json(obj):
    print(json.dumps(obj, indent=2, ensure_ascii=False), flush=True)

def run_cmd(cmd, input_text=None):
    try:
        out = subprocess.check_output(
            cmd,
            input=input_text,
            text=True,
            stderr=subprocess.STDOUT,
        )
        return True, out
    except subprocess.CalledProcessError as e:
        return False, e.output

def d1_base_cmd():
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    return cmd

def d1_json(sql):
    ok, out = run_cmd(d1_base_cmd() + ["--json", "--command", sql])
    if not ok:
        raise RuntimeError(out[-3000:])
    data = json.loads(out)
    return data[0].get("results", []) if isinstance(data, list) and data else []

def d1_exec(sql):
    ok, out = run_cmd(d1_base_cmd() + ["--command", sql])
    if not ok:
        raise RuntimeError(out[-4000:])
    return out

def post_json(url, body, headers=None, timeout=300):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers or {"Content-Type": "application/json"},
        method="POST",
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw) if raw else None
        return payload, int((time.time() - started) * 1000)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} from {url}: {body[:1200]}")

def extract_json(text):
    raw = (text or "").strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"^```\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw), True, None
    except Exception:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end + 1]), True, None
        except Exception as e:
            return None, False, str(e)

    return None, False, "no_json_object_found"

# ----------------------------
# Gates
# ----------------------------

def decode_jwt_payload(token):
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload.encode()).decode())

def validate_supabase_identity():
    if not MIRROR_SUPABASE:
        raise RuntimeError("MIRROR_SUPABASE must be 1. Supabase mirror is required.")

    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL missing.")

    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY missing.")

    host = urllib.parse.urlparse(SUPABASE_URL).netloc
    expected_host = f"{EXPECTED_SUPABASE_REF}.supabase.co"

    if host != expected_host:
        raise RuntimeError(f"Supabase host mismatch. expected={expected_host} got={host}")

    decoded = decode_jwt_payload(SUPABASE_SERVICE_ROLE_KEY)
    if decoded.get("ref") != EXPECTED_SUPABASE_REF:
        raise RuntimeError(f"Supabase JWT ref mismatch. expected={EXPECTED_SUPABASE_REF} got={decoded.get('ref')}")

    if decoded.get("role") != "service_role":
        raise RuntimeError(f"Supabase JWT role must be service_role. got={decoded.get('role')}")

    url = f"{SUPABASE_URL}/rest/v1/agentsam_eval_runs?select=id&limit=1"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        method="GET",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
        if resp.status != 200:
            raise RuntimeError(f"Supabase REST check failed: status={resp.status} body={body[:500]}")

    return {
        "host": host,
        "ref": EXPECTED_SUPABASE_REF,
        "role": "service_role",
        "ready": True,
    }

def validate_d1_eval_schema():
    eval_cols = {r["name"] for r in d1_json("PRAGMA table_info(agentsam_eval_runs);")}
    required_eval = {
        "id", "suite_id", "tenant_id", "model_key", "provider",
        "input_tokens", "output_tokens", "latency_ms", "cost_usd",
        "score_quality", "score_latency", "score_cost", "score_tool_use",
        "score_safety", "score_overall", "passed", "output_text",
        "grader_notes", "grader_model", "run_at", "schema_valid",
        "run_group_id", "failure_taxonomy",
    }
    missing_eval = sorted(required_eval - eval_cols)
    if missing_eval:
        raise RuntimeError(f"D1 agentsam_eval_runs missing required columns: {missing_eval}")

    suites = d1_json(f"SELECT id FROM agentsam_eval_suites WHERE id = {sql_quote(EVAL_SUITE_ID)} LIMIT 1;")
    if not suites:
        raise RuntimeError(f"EVAL_SUITE_ID not found in D1 agentsam_eval_suites: {EVAL_SUITE_ID}")

    artifact_cols = {r["name"] for r in d1_json("PRAGMA table_info(agentsam_artifacts);")}
    required_artifacts = {"id", "user_id", "tenant_id", "name", "artifact_type", "r2_key", "source"}
    missing_artifacts = sorted(required_artifacts - artifact_cols)
    if missing_artifacts:
        raise RuntimeError(f"D1 agentsam_artifacts missing required columns: {missing_artifacts}")

    return {
        "eval_suite_id": EVAL_SUITE_ID,
        "eval_runs_schema": "ok",
        "artifacts_schema": "ok",
    }

# ----------------------------
# Rates / budget
# ----------------------------

def load_catalog_rates():
    rates = {
        OLLAMA_MODEL_KEY: {"in": 0.0, "out": 0.0},
        OLLAMA_RUNTIME_MODEL: {"in": 0.0, "out": 0.0},
        OLLAMA_EMBED_MODEL_KEY: {"in": 0.0, "out": 0.0},
        OLLAMA_EMBED_MODEL: {"in": 0.0, "out": 0.0},
        NANO_MODEL: {"in": 0.0002, "out": 0.00125},
        MINI_MODEL: {"in": 0.00075, "out": 0.0045},
    }

    sql = f"""
SELECT model_key, openai_model_id, ollama_model_id, cost_per_1k_in, cost_per_1k_out
FROM agentsam_model_catalog
WHERE model_key IN (
  {sql_quote(OLLAMA_MODEL_KEY)},
  {sql_quote(OLLAMA_EMBED_MODEL_KEY)},
  {sql_quote(NANO_MODEL)},
  {sql_quote(MINI_MODEL)}
)
OR openai_model_id IN ({sql_quote(NANO_MODEL)}, {sql_quote(MINI_MODEL)})
OR ollama_model_id IN ({sql_quote(OLLAMA_RUNTIME_MODEL)}, {sql_quote(OLLAMA_EMBED_MODEL)});
"""
    try:
        rows = d1_json(sql)
        for r in rows:
            rate = {
                "in": safe_float(r.get("cost_per_1k_in")),
                "out": safe_float(r.get("cost_per_1k_out")),
            }
            for key in (r.get("model_key"), r.get("openai_model_id"), r.get("ollama_model_id")):
                if key:
                    rates[key] = rate
    except Exception as e:
        print_json({"warning": "could_not_load_rates_using_defaults", "error": str(e)[:500]})

    return rates

def estimate_cost(model_key, input_tokens, output_tokens, rates):
    rate = rates.get(model_key) or {"in": 0.0, "out": 0.0}
    return ((input_tokens / 1000.0) * safe_float(rate["in"])) + ((output_tokens / 1000.0) * safe_float(rate["out"]))

# ----------------------------
# Model calls
# ----------------------------

def ollama_generate(task_type, prompt):
    full_prompt = f"{SYSTEM_PROMPT}\nProvider: ollama\nModel: {OLLAMA_RUNTIME_MODEL}\nTask type: {task_type}\nTask: {prompt}"
    payload, ms = post_json(
        f"{OLLAMA_URL}/api/generate",
        {
            "model": OLLAMA_RUNTIME_MODEL,
            "prompt": full_prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.03,
                "num_predict": OLLAMA_NUM_PREDICT,
            },
        },
    )

    response_text = payload.get("response", "")
    parsed, valid_json, parse_error = extract_json(response_text)

    return {
        "response_text": response_text,
        "parsed": parsed,
        "valid_json": valid_json,
        "parse_error": parse_error,
        "input_tokens": int(payload.get("prompt_eval_count") or estimate_tokens(full_prompt)),
        "output_tokens": int(payload.get("eval_count") or estimate_tokens(response_text)),
        "duration_ms": ms,
        "native_metrics": payload,
    }

def ollama_embed(text):
    clean = str(text or "").strip()

    # Normalize hard: Ollama /api/embed should receive boring text only.
    clean = clean.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")
    clean = "".join(ch if (ch == "\n" or ch == "\t" or ord(ch) >= 32) else " " for ch in clean)
    clean = " ".join(clean.split())

    if not clean:
        clean = "EMPTY_MODEL_OUTPUT_FOR_EMBEDDING_FALLBACK"

    # Embed compact proof text, not huge raw outputs.
    clean = clean[:1000]

    payload, ms = post_json(
        f"{OLLAMA_URL}/api/embed",
        {
            "model": OLLAMA_EMBED_MODEL,
            "input": clean,
        },
    )

    embeddings = payload.get("embeddings") or []
    return {
        "embedding_model_key": OLLAMA_EMBED_MODEL_KEY,
        "embedding_runtime_model": OLLAMA_EMBED_MODEL,
        "embedding_count": len(embeddings),
        "embedding_dims": len(embeddings[0]) if embeddings else 0,
        "embedding_prompt_eval_count": payload.get("prompt_eval_count"),
        "embedding_total_duration_ns": payload.get("total_duration"),
        "embedding_duration_ms": ms,
        "embedding_cost_usd": 0,
    }

def failed_embedding_meta(error):
    return {
        "embedding_model_key": OLLAMA_EMBED_MODEL_KEY,
        "embedding_runtime_model": OLLAMA_EMBED_MODEL,
        "embedding_count": 0,
        "embedding_dims": 0,
        "embedding_error": str(error)[:1200],
        "embedding_cost_usd": 0,
    }

def openai_generate(model, task_type, prompt):
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY missing while RUN_CLOUD=1")

    full_prompt = f"{SYSTEM_PROMPT}\nProvider: openai\nModel: {model}\nTask type: {task_type}\nTask: {prompt}"

    body = {
        "model": model,
        "input": full_prompt,
        "text": {
            "format": {
                "type": "json_object"
            }
        },
    }

    payload, ms = post_json(
        f"{OPENAI_BASE_URL}/responses",
        body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        timeout=300,
    )

    response_text = ""

    if isinstance(payload, dict) and isinstance(payload.get("output"), list):
        parts = []
        for item in payload["output"]:
            for c in item.get("content", []) or []:
                if c.get("type") in ("output_text", "text"):
                    parts.append(c.get("text", ""))
        response_text = "\n".join(parts).strip()

    if not response_text and isinstance(payload, dict):
        response_text = payload.get("output_text", "")

    parsed, valid_json, parse_error = extract_json(response_text)
    usage = payload.get("usage") or {}

    return {
        "response_text": response_text,
        "parsed": parsed,
        "valid_json": valid_json,
        "parse_error": parse_error,
        "input_tokens": int(usage.get("input_tokens") or estimate_tokens(full_prompt)),
        "output_tokens": int(usage.get("output_tokens") or estimate_tokens(response_text)),
        "duration_ms": ms,
        "native_metrics": payload,
    }

# ----------------------------
# Row construction/scoring
# ----------------------------

def quality_score(valid_json, parsed, text):
    score = 0
    if valid_json:
        score += 2
    if isinstance(parsed, dict):
        if parsed.get("status") == "ok":
            score += 1
        if parsed.get("concrete_findings"):
            score += 1
        if parsed.get("validation_steps"):
            score += 1
    if len(text or "") > 400:
        score = min(5, score + 1)
    return min(5, score)

def make_row(task_type, provider, model_key, model_display_name, result, cost_usd, status="completed", success=True, failure_taxonomy="", error_message=None):
    response_text = result.get("response_text", "") if result else ""
    parsed = result.get("parsed") if result else None
    valid_json = bool(result.get("valid_json")) if result else False
    embedding = result.get("embedding") or {} if result else {}

    return {
        "id": str(uuid.uuid4()),
        "run_group_id": SERIES_ID,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "task_type": task_type,
        "provider": provider,
        "model_key": model_key,
        "model_display_name": model_display_name,
        "status": status,
        "success": bool(success),
        "failure_taxonomy": failure_taxonomy,
        "error_message": error_message,
        "input_tokens": int(result.get("input_tokens") or 0) if result else 0,
        "output_tokens": int(result.get("output_tokens") or 0) if result else 0,
        "latency_ms": int(result.get("duration_ms") or 0) if result else 0,
        "cost_usd": float(cost_usd or 0),
        "quality_score": quality_score(valid_json, parsed, response_text),
        "valid_json": valid_json,
        "output_text": response_text[:1200],
        "parsed": parsed,
        "embedding": embedding,
        "native_metrics": result.get("native_metrics") or {} if result else {},
        "created_at": now_iso(),
    }

def make_budget_guard_row(task_type, model_key, model_display_name, projected_cost, cloud_spent):
    result = {
        "response_text": "",
        "parsed": None,
        "valid_json": False,
        "input_tokens": 1,
        "output_tokens": 0,
        "duration_ms": 0,
        "embedding": {
            "embedding_model_key": OLLAMA_EMBED_MODEL_KEY,
            "embedding_runtime_model": OLLAMA_EMBED_MODEL,
            "embedding_count": 0,
            "embedding_dims": 0,
            "embedding_skipped": True,
            "embedding_cost_usd": 0,
        },
        "native_metrics": {
            "budget_guard": True,
            "projected_cost": projected_cost,
            "cloud_spent_usd": cloud_spent,
            "series_budget_usd": SERIES_BUDGET_USD,
        },
    }
    return make_row(
        task_type=task_type,
        provider="openai",
        model_key=model_key,
        model_display_name=model_display_name,
        result=result,
        cost_usd=0.0,
        status="skipped",
        success=False,
        failure_taxonomy="budget_guard",
        error_message=f"budget_guard: spent={cloud_spent:.8f}, projected={projected_cost:.8f}, budget={SERIES_BUDGET_USD:.2f}",
    )

# ----------------------------
# Writes
# ----------------------------


# ----------------------------
# Local website builder
# ----------------------------

def safe_slug(value):
    raw = str(value or "page").lower()
    raw = re.sub(r"[^a-z0-9_-]+", "-", raw).strip("-")
    return raw or "page"

def page_nav_html():
    pages = [
        ("index.html", "Home"),
        ("overview.html", "Overview"),
        ("models.html", "Models"),
        ("runs.html", "Runs"),
        ("artifacts.html", "Artifacts"),
        ("parity.html", "Parity"),
        ("costs.html", "Costs"),
        ("embeddings.html", "Embeddings"),
        ("quality.html", "Quality"),
        ("readme.html", "README"),
    ]
    return "\n".join(f'<a href="{href}">{label}</a>' for href, label in pages)

def base_site_css():
    return """
:root {
  --bg: #070812;
  --panel: rgba(255,255,255,.06);
  --panel-strong: rgba(255,255,255,.10);
  --text: #f6f7fb;
  --muted: #a8aec5;
  --line: rgba(255,255,255,.12);
  --accent: #8b5cf6;
  --cyan: #22d3ee;
  --green: #10b981;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(139,92,246,.22), transparent 32rem),
    radial-gradient(circle at top right, rgba(34,211,238,.16), transparent 28rem),
    var(--bg);
  color: var(--text);
}
.shell { min-height: 100vh; display: grid; grid-template-columns: 260px 1fr; }
.sidebar {
  position: sticky; top: 0; height: 100vh; padding: 26px 18px;
  border-right: 1px solid var(--line); background: rgba(8,10,24,.72); backdrop-filter: blur(20px);
}
.brand { font-weight: 800; letter-spacing: -.03em; font-size: 22px; margin-bottom: 6px; }
.sub { color: var(--muted); font-size: 12px; line-height: 1.5; margin-bottom: 24px; }
nav { display: grid; gap: 8px; }
nav a {
  color: var(--muted); text-decoration: none; padding: 11px 12px; border-radius: 14px;
  border: 1px solid transparent;
}
nav a:hover { color: var(--text); background: var(--panel); border-color: var(--line); }
main { padding: 34px; }
.hero, .card {
  border: 1px solid var(--line); background: var(--panel); border-radius: 28px;
  box-shadow: 0 24px 80px rgba(0,0,0,.38);
}
.hero { padding: 30px; margin-bottom: 22px; }
h1 { font-size: clamp(32px, 5vw, 64px); line-height: .95; letter-spacing: -.06em; margin: 0 0 14px; }
h2 { margin: 0 0 12px; letter-spacing: -.03em; }
p { color: var(--muted); line-height: 1.65; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.card { padding: 20px; }
.kpi { font-size: 30px; font-weight: 800; letter-spacing: -.04em; }
.label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
.badge { display: inline-flex; padding: 7px 10px; border-radius: 999px; background: var(--panel-strong); border: 1px solid var(--line); color: var(--text); font-size: 12px; }
pre {
  white-space: pre-wrap; overflow: auto; max-height: 460px; padding: 18px;
  border-radius: 18px; background: rgba(0,0,0,.32); border: 1px solid var(--line); color: #d8e3ff;
}
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid var(--line); padding: 12px; text-align: left; color: var(--muted); }
th { color: var(--text); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }
a { color: var(--cyan); }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { position: relative; height: auto; }
  .grid { grid-template-columns: 1fr; }
  main { padding: 20px; }
}
"""

def html_document(title, body_html, meta=None):
    meta = meta or {}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title}</title>
  <style>{base_site_css()}</style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">Agent Sam Evals</div>
      <div class="sub">Local clickable proof site generated by the mirrored eval harness.<br>Series: {SERIES_ID}</div>
      <nav>{page_nav_html()}</nav>
    </aside>
    <main>
      {body_html}
      <section class="card" style="margin-top:16px">
        <div class="label">Run metadata</div>
        <pre>{json.dumps(meta, indent=2, ensure_ascii=False)}</pre>
      </section>
    </main>
  </div>
</body>
</html>"""

def parsed_page_from_row(row):
    parsed = row.get("parsed")
    if not isinstance(parsed, dict):
        parsed = {}

    slug = parsed.get("page_slug") or row.get("task_type") or "page"
    slug = safe_slug(slug.replace("site-", "").replace("site_", ""))
    title = parsed.get("title") or row.get("task_type") or "Agent Sam Eval Page"
    html = parsed.get("html") or row.get("output_text") or "<p>No HTML returned.</p>"

    if not isinstance(html, str):
        html = "<pre>" + json.dumps(html, indent=2, ensure_ascii=False) + "</pre>"

    body = f"""
<section class="hero">
  <span class="badge">{row.get("provider")} · {row.get("model_key")}</span>
  <h1>{title}</h1>
  <p>Generated from task <strong>{row.get("task_type")}</strong>. This page is backed by D1, Supabase, artifact, embedding, and cost telemetry.</p>
</section>
<section class="grid">
  <div class="card"><div class="label">Input tokens</div><div class="kpi">{row.get("input_tokens")}</div></div>
  <div class="card"><div class="label">Output tokens</div><div class="kpi">{row.get("output_tokens")}</div></div>
  <div class="card"><div class="label">Cost USD</div><div class="kpi">${float(row.get("cost_usd") or 0):.6f}</div></div>
</section>
<section class="card" style="margin-top:16px">
  <h2>Generated Page Content</h2>
  {html}
</section>
"""
    return slug, title, body

def write_site_page_for_row(row):
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    slug, title, body = parsed_page_from_row(row)

    canonical_map = {
        "site_home": "index",
        "site_overview": "overview",
        "site_models": "models",
        "site_runs": "runs",
        "site_artifacts": "artifacts",
        "site_parity": "parity",
        "site_costs": "costs",
        "site_embeddings": "embeddings",
        "site_quality": "quality",
        "site_readme": "readme",
    }

    canonical = canonical_map.get(row.get("task_type"), slug)
    provider_page = f"{canonical}-{safe_slug(row.get('model_key'))}.html"
    canonical_page = f"{canonical}.html"

    meta = {
        "eval_run_id": row.get("id"),
        "artifact_id": row.get("artifact_id"),
        "provider": row.get("provider"),
        "model_key": row.get("model_key"),
        "embedding": row.get("embedding"),
        "d1": True,
        "supabase": True,
        "series_id": SERIES_ID,
    }

    document = html_document(title, body, meta=meta)
    (SITE_DIR / provider_page).write_text(document, encoding="utf-8")

    if row.get("provider") == "openai" or not (SITE_DIR / canonical_page).exists():
        (SITE_DIR / canonical_page).write_text(document, encoding="utf-8")

    return str(SITE_DIR / canonical_page), str(SITE_DIR / provider_page)

def write_site_index_summary(report=None):
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    body = f"""
<section class="hero">
  <span class="badge">Series {SERIES_ID}</span>
  <h1>Agent Sam Eval Dashboard</h1>
  <p>This local website is generated by the same eval loop that writes D1 rows, Supabase mirror rows, agentsam_artifacts records, embeddings, and cost telemetry.</p>
</section>
<section class="grid">
  <div class="card"><div class="label">Series</div><div class="kpi">{SERIES_ID}</div></div>
  <div class="card"><div class="label">Local Path</div><div class="kpi">Site</div><p>{SITE_DIR}</p></div>
  <div class="card"><div class="label">Status</div><div class="kpi">Generated</div><p>Run a local server to click around.</p></div>
</section>
<section class="card" style="margin-top:16px">
  <h2>Pages</h2>
  <table>
    <tr><th>Page</th><th>File</th></tr>
    <tr><td>Home</td><td><a href="index.html">index.html</a></td></tr>
    <tr><td>Overview</td><td><a href="overview.html">overview.html</a></td></tr>
    <tr><td>Models</td><td><a href="models.html">models.html</a></td></tr>
    <tr><td>Runs</td><td><a href="runs.html">runs.html</a></td></tr>
    <tr><td>Artifacts</td><td><a href="artifacts.html">artifacts.html</a></td></tr>
    <tr><td>Parity</td><td><a href="parity.html">parity.html</a></td></tr>
    <tr><td>Costs</td><td><a href="costs.html">costs.html</a></td></tr>
    <tr><td>Embeddings</td><td><a href="embeddings.html">embeddings.html</a></td></tr>
    <tr><td>Quality</td><td><a href="quality.html">quality.html</a></td></tr>
    <tr><td>README</td><td><a href="readme.html">readme.html</a></td></tr>
  </table>
</section>
"""
    (SITE_DIR / "index.html").write_text(html_document("Agent Sam Eval Dashboard", body, meta=report or {}), encoding="utf-8")

def d1_insert_eval(row):
    emb = row.get("embedding") or {}
    q = row["quality_score"] / 5.0 if row["quality_score"] else 0.0
    score_latency = 1.0 if row["latency_ms"] <= 10000 else 0.5 if row["latency_ms"] <= 30000 else 0.25
    score_cost = 1.0 if row["cost_usd"] == 0 else max(0.0, 1.0 - min(row["cost_usd"] / SERIES_BUDGET_USD, 1.0))
    score_tool_use = 1.0 if emb.get("embedding_dims") == 1024 else 0.0
    score_safety = 1.0
    score_overall = round((q + score_latency + score_cost + score_tool_use + score_safety) / 5.0, 4)
    passed = 1 if row["success"] and emb.get("embedding_dims") == 1024 else 0
    schema_valid = 1 if row["valid_json"] else 0

    notes = {
        "series_id": row["run_group_id"],
        "task_type": row["task_type"],
        "status": row["status"],
        "success": row["success"],
        "embedding": emb,
        "native_metrics": row.get("native_metrics") or {},
        "sync": {
            "d1_required": True,
            "supabase_required": True,
            "artifact_required": True,
        },
        "error_message": row.get("error_message"),
    }

    sql = f"""
INSERT INTO agentsam_eval_runs (
  id, suite_id, case_id, tenant_id, model_key, provider,
  input_tokens, output_tokens, latency_ms, cost_usd,
  score_quality, score_latency, score_cost, score_tool_use, score_safety, score_overall,
  passed, output_text, grader_notes, grader_model, run_at,
  cached_input_tokens, schema_valid, retry_count, prompt_version_id, run_group_id,
  tool_calls_attempted, tool_calls_succeeded, failure_taxonomy
)
VALUES (
  {sql_quote(row["id"])},
  {sql_quote(EVAL_SUITE_ID)},
  NULL,
  {sql_quote(row["tenant_id"])},
  {sql_quote(row["model_key"])},
  {sql_quote(row["provider"])},
  {row["input_tokens"]},
  {row["output_tokens"]},
  {row["latency_ms"]},
  {row["cost_usd"]},
  {q},
  {score_latency},
  {score_cost},
  {score_tool_use},
  {score_safety},
  {score_overall},
  {passed},
  {sql_quote(row["output_text"])},
  {sql_quote(json.dumps(notes, ensure_ascii=False))},
  {sql_quote(row["model_key"])},
  datetime('now'),
  0,
  {schema_valid},
  0,
  NULL,
  {sql_quote(row["run_group_id"])},
  0,
  0,
  {sql_quote(row.get("failure_taxonomy") or "")}
);
"""
    d1_exec(sql)

def supabase_insert_eval(row):
    payload = {
        "id": row["id"],
        "tenant_id": row["tenant_id"],
        "workspace_id": row["workspace_id"],
        "run_group_id": row["run_group_id"],
        "run_source": "agentsam_full_mirrored_eval_series",
        "agent_tool": "model_eval",
        "provider": row["provider"],
        "model_key": row["model_key"],
        "model_display_name": row["model_display_name"],
        "api_platform": "ollama" if row["provider"] == "ollama" else "openai",
        "status": row["status"],
        "success": row["success"],
        "failure_reason": row.get("failure_taxonomy") or None,
        "error_message": row.get("error_message"),
        "input_tokens": row["input_tokens"],
        "output_tokens": row["output_tokens"],
        "cost_usd": row["cost_usd"],
        "duration_ms": row["latency_ms"],
        "tool_call_count": 0,
        "prompt_preview": row["task_type"],
        "output_preview": row["output_text"],
        "metrics_json": {
            "series_id": row["run_group_id"],
            "task_type": row["task_type"],
            "valid_json": row["valid_json"],
            "quality_score": row["quality_score"],
            "embedding": row.get("embedding") or {},
            "native_metrics": row.get("native_metrics") or {},
        },
        "metadata": {
            "d1_canonical_required": True,
            "supabase_mirror_required": True,
            "artifact_required": True,
        },
    }

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/agentsam_eval_runs",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            if resp.status not in (200, 201, 204):
                raise RuntimeError(f"Supabase insert failed status={resp.status}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode("utf-8")[:1500])

def d1_insert_artifact(row):
    artifact_id = "art_" + uuid.uuid4().hex[:16]
    artifact_key = f"eval-series/{SERIES_ID}/{row['id']}.json"
    local_path = OUT_DIR / f"{row['id']}.artifact.json"

    payload = {
        "artifact_id": artifact_id,
        "series_id": SERIES_ID,
        "eval_run_id": row["id"],
        "task_type": row["task_type"],
        "provider": row["provider"],
        "model_key": row["model_key"],
        "status": row["status"],
        "success": row["success"],
        "input_tokens": row["input_tokens"],
        "output_tokens": row["output_tokens"],
        "cost_usd": row["cost_usd"],
        "embedding": row.get("embedding") or {},
        "output_text": row.get("output_text") or "",
        "created_at": now_iso(),
    }

    local_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    file_size = local_path.stat().st_size

    sql = f"""
INSERT INTO agentsam_artifacts (
  id, user_id, tenant_id, workspace_id, name, description, artifact_type,
  r2_key, public_url, source, tags, is_public, file_size_bytes, created_at, updated_at
)
VALUES (
  {sql_quote(artifact_id)},
  {sql_quote(USER_ID)},
  {sql_quote(TENANT_ID)},
  {sql_quote(WORKSPACE_ID)},
  {sql_quote("Eval Artifact " + row["task_type"] + " / " + row["model_key"])},
  {sql_quote("Per-run mirrored eval artifact for " + row["id"])},
  'json',
  {sql_quote(artifact_key)},
  NULL,
  'agentsam_full_mirrored_eval_series',
  {sql_quote(json.dumps(["eval", row["provider"], row["model_key"], row["task_type"]]))},
  0,
  {file_size},
  unixepoch(),
  unixepoch()
);
"""
    d1_exec(sql)
    return artifact_id

def verify_exact_row(row):
    d1_rows = d1_json(
        f"SELECT id FROM agentsam_eval_runs WHERE id = {sql_quote(row['id'])} AND run_group_id = {sql_quote(SERIES_ID)} LIMIT 1;"
    )
    if len(d1_rows) != 1:
        raise RuntimeError(f"D1 exact-row verification failed for {row['id']}")

    encoded_id = urllib.parse.quote(row["id"])
    url = f"{SUPABASE_URL}/rest/v1/agentsam_eval_runs?id=eq.{encoded_id}&select=id,run_group_id,input_tokens,output_tokens,cost_usd"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        sb_rows = json.loads(resp.read().decode("utf-8"))

    if len(sb_rows) != 1:
        raise RuntimeError(f"Supabase exact-row verification failed for {row['id']}")

def write_all_or_fail(row):
    d1_insert_eval(row)
    supabase_insert_eval(row)
    artifact_id = d1_insert_artifact(row)
    row["artifact_id"] = artifact_id
    canonical_page, provider_page = write_site_page_for_row(row)
    row["site_page"] = canonical_page
    row["provider_site_page"] = provider_page
    verify_exact_row(row)

    with open(RUNS_JSONL, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print_json({
        "loop_documented": True,
        "id": row["id"],
        "task_type": row["task_type"],
        "provider": row["provider"],
        "model_key": row["model_key"],
        "d1": True,
        "supabase": True,
        "artifact_id": artifact_id,
        "site_page": row.get("site_page"),
        "provider_site_page": row.get("provider_site_page"),
        "embedding_dims": (row.get("embedding") or {}).get("embedding_dims"),
        "input_tokens": row["input_tokens"],
        "output_tokens": row["output_tokens"],
        "cost_usd": row["cost_usd"],
        "status": row["status"],
    })

# ----------------------------
# Preflight contract
# ----------------------------

def preflight_insert_contract():
    run_group_id = "preflight_" + str(uuid.uuid4())
    row = {
        "id": str(uuid.uuid4()),
        "run_group_id": run_group_id,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "task_type": "preflight",
        "provider": "preflight",
        "model_key": "preflight-db-contract",
        "model_display_name": "Preflight DB Contract",
        "status": "completed",
        "success": True,
        "failure_taxonomy": "",
        "error_message": None,
        "input_tokens": 42,
        "output_tokens": 7,
        "latency_ms": 1,
        "cost_usd": 0.0,
        "quality_score": 5,
        "valid_json": True,
        "output_text": '{"status":"ok","preflight":true}',
        "parsed": {"status": "ok", "preflight": True},
        "embedding": {
            "embedding_model_key": OLLAMA_EMBED_MODEL_KEY,
            "embedding_runtime_model": OLLAMA_EMBED_MODEL,
            "embedding_count": 1,
            "embedding_dims": 1024,
            "embedding_cost_usd": 0,
            "preflight": True,
        },
        "native_metrics": {"preflight": True},
        "created_at": now_iso(),
    }

    old_series = row["run_group_id"]
    d1_insert_eval(row)
    supabase_insert_eval(row)

    d1_rows = d1_json(f"""
SELECT
  COUNT(*) AS rows,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(cost_usd) AS cost_usd,
  SUM(CASE WHEN instr(grader_notes, '"embedding_dims": 1024') > 0 THEN 1 ELSE 0 END) AS embedded_rows
FROM agentsam_eval_runs
WHERE run_group_id = {sql_quote(old_series)};
""")[0]

    url = f"{SUPABASE_URL}/rest/v1/agentsam_eval_runs?run_group_id=eq.{urllib.parse.quote(old_series)}&select=id,input_tokens,output_tokens,cost_usd,metrics_json"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        sb_rows = json.loads(resp.read().decode("utf-8"))

    sb = {
        "rows": len(sb_rows),
        "input_tokens": sum(int(r.get("input_tokens") or 0) for r in sb_rows),
        "output_tokens": sum(int(r.get("output_tokens") or 0) for r in sb_rows),
        "cost_usd": sum(float(r.get("cost_usd") or 0) for r in sb_rows),
        "embedded_rows": sum(1 for r in sb_rows if (((r.get("metrics_json") or {}).get("embedding") or {}).get("embedding_dims") == 1024)),
    }

    checks = {
        "d1_rows": int(d1_rows["rows"] or 0) == 1,
        "supabase_rows": sb["rows"] == 1,
        "input_tokens": int(d1_rows["input_tokens"] or 0) == sb["input_tokens"] == 42,
        "output_tokens": int(d1_rows["output_tokens"] or 0) == sb["output_tokens"] == 7,
        "cost": abs(float(d1_rows["cost_usd"] or 0) - sb["cost_usd"]) < 0.000001,
        "embedded": int(d1_rows["embedded_rows"] or 0) == sb["embedded_rows"] == 1,
    }

    ok = all(checks.values())
    report = {
        "preflight_ok": ok,
        "preflight_run_group_id": old_series,
        "d1": d1_rows,
        "supabase": sb,
        "checks": checks,
    }
    if not ok:
        raise RuntimeError("Preflight insert contract failed: " + json.dumps(report, ensure_ascii=False))

    print("PRECHECK OK", flush=True)
    return report

# ----------------------------
# Run lanes
# ----------------------------

def run_ollama_lane(task_type, prompt):
    result = ollama_generate(task_type, prompt)
    try:
        result["embedding"] = ollama_embed(result["response_text"])
        row = make_row(
            task_type=task_type,
            provider="ollama",
            model_key=OLLAMA_MODEL_KEY,
            model_display_name="Qwen 2.5 Coder 7B Local",
            result=result,
            cost_usd=0.0,
        )
    except Exception as e:
        result["embedding"] = failed_embedding_meta(e)
        row = make_row(
            task_type=task_type,
            provider="ollama",
            model_key=OLLAMA_MODEL_KEY,
            model_display_name="Qwen 2.5 Coder 7B Local",
            result=result,
            cost_usd=0.0,
            status="failed",
            success=False,
            failure_taxonomy="embedding_failure",
            error_message=str(e)[:1200],
        )
    write_all_or_fail(row)
    return row

def run_openai_lane(task_type, prompt, model_key, model_display_name, rates, cloud_spent):
    rough_in = estimate_tokens(SYSTEM_PROMPT + prompt)
    rough_out = 700
    projected = estimate_cost(model_key, rough_in, rough_out, rates)

    if cloud_spent + projected + CLOUD_RESERVE_USD > SERIES_BUDGET_USD:
        row = make_budget_guard_row(task_type, model_key, model_display_name, projected, cloud_spent)
        write_all_or_fail(row)
        return row, cloud_spent

    result = openai_generate(model_key, task_type, prompt)
    actual_cost = estimate_cost(model_key, result["input_tokens"], result["output_tokens"], rates)

    if cloud_spent + actual_cost > SERIES_BUDGET_USD:
        row = make_budget_guard_row(task_type, model_key, model_display_name, actual_cost, cloud_spent)
        write_all_or_fail(row)
        return row, cloud_spent

    try:
        result["embedding"] = ollama_embed(result["response_text"])
        row = make_row(
            task_type=task_type,
            provider="openai",
            model_key=model_key,
            model_display_name=model_display_name,
            result=result,
            cost_usd=actual_cost,
        )
    except Exception as e:
        result["embedding"] = failed_embedding_meta(e)
        row = make_row(
            task_type=task_type,
            provider="openai",
            model_key=model_key,
            model_display_name=model_display_name,
            result=result,
            cost_usd=actual_cost,
            status="failed",
            success=False,
            failure_taxonomy="embedding_failure",
            error_message=str(e)[:1200],
        )

    write_all_or_fail(row)
    return row, cloud_spent + actual_cost

# ----------------------------
# Summary
# ----------------------------

def series_summary(expected_rows):
    d1 = d1_json(f"""
SELECT
  COUNT(*) AS rows,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(cost_usd) AS cost_usd,
  SUM(CASE WHEN instr(grader_notes, '"embedding_dims": 1024') > 0 THEN 1 ELSE 0 END) AS embedded_rows
FROM agentsam_eval_runs
WHERE run_group_id = {sql_quote(SERIES_ID)};
""")[0]

    url = f"{SUPABASE_URL}/rest/v1/agentsam_eval_runs?run_group_id=eq.{urllib.parse.quote(SERIES_ID)}&select=id,provider,model_key,input_tokens,output_tokens,cost_usd,metrics_json"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        sb_rows = json.loads(resp.read().decode("utf-8"))

    sb = {
        "rows": len(sb_rows),
        "input_tokens": sum(int(r.get("input_tokens") or 0) for r in sb_rows),
        "output_tokens": sum(int(r.get("output_tokens") or 0) for r in sb_rows),
        "cost_usd": sum(float(r.get("cost_usd") or 0) for r in sb_rows),
        "embedded_rows": sum(1 for r in sb_rows if (((r.get("metrics_json") or {}).get("embedding") or {}).get("embedding_dims") == 1024)),
    }

    by_model = {}
    for r in sb_rows:
        key = r.get("model_key") or "unknown"
        by_model.setdefault(key, {"rows": 0, "cost_usd": 0.0, "input_tokens": 0, "output_tokens": 0})
        by_model[key]["rows"] += 1
        by_model[key]["cost_usd"] += float(r.get("cost_usd") or 0)
        by_model[key]["input_tokens"] += int(r.get("input_tokens") or 0)
        by_model[key]["output_tokens"] += int(r.get("output_tokens") or 0)

    checks = {
        "expected_rows_positive": expected_rows > 0,
        "d1_rows_match_expected": int(d1["rows"] or 0) == expected_rows,
        "supabase_rows_match_expected": sb["rows"] == expected_rows,
        "row_counts_match": int(d1["rows"] or 0) == sb["rows"],
        "input_tokens_match": int(d1["input_tokens"] or 0) == sb["input_tokens"],
        "output_tokens_match": int(d1["output_tokens"] or 0) == sb["output_tokens"],
        "embedded_rows_match": int(d1["embedded_rows"] or 0) == sb["embedded_rows"],
        "cost_match": abs(float(d1["cost_usd"] or 0) - sb["cost_usd"]) < 0.000001,
        "cloud_budget_ok": sb["cost_usd"] <= SERIES_BUDGET_USD,
    }

    return {
        "ok": all(checks.values()),
        "expected_rows": expected_rows,
        "d1": d1,
        "supabase": sb,
        "by_model": by_model,
        "checks": checks,
    }

# ----------------------------
# Main
# ----------------------------

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_JSONL.write_text("")

    try:
        supa = validate_supabase_identity()
    except Exception as e:
        print_json({
            "error": "supabase_identity_gate_failed",
            "message": str(e),
            "blocked_before_model_calls": True,
        })
        sys.exit(20)

    try:
        d1 = validate_d1_eval_schema()
    except Exception as e:
        print_json({
            "error": "d1_schema_gate_failed",
            "message": str(e),
            "blocked_before_model_calls": True,
        })
        sys.exit(21)

    try:
        preflight = preflight_insert_contract()
    except Exception as e:
        print_json({
            "error": "preflight_insert_contract_failed",
            "message": str(e),
            "blocked_before_model_calls": True,
        })
        sys.exit(22)

    if PREFLIGHT_ONLY:
        report = {
            "status": "preflight_complete",
            "preflight_ok": True,
            "preflight": preflight,
            "gates": {"supabase": supa, "d1": d1},
            "blocked_before_model_calls": True,
            "report_json": str(REPORT_JSON),
            "completed_at": now_iso(),
        }
        REPORT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False))
        print_json(report)
        return

    if RUN_CLOUD and not OPENAI_API_KEY:
        print_json({
            "error": "openai_key_missing",
            "message": "RUN_CLOUD=1 but OPENAI_API_KEY is missing.",
            "blocked_before_model_calls": True,
        })
        sys.exit(24)

    rates = load_catalog_rates()
    tasks = TASKS[:TASK_LIMIT] if TASK_LIMIT > 0 else TASKS

    print_json({
        "status": "started",
        "series_id": SERIES_ID,
        "tasks": len(tasks),
        "run_cloud": RUN_CLOUD,
        "budget_usd": SERIES_BUDGET_USD,
        "supabase": supa,
        "d1": d1,
        "preflight_ok": True,
        "note": "Every loop writes D1 + Supabase + agentsam_artifacts and verifies exact UUID.",
    })

    rows = []
    cloud_spent = 0.0

    for idx, (task_type, prompt) in enumerate(tasks, start=1):
        print_json({"phase": "task_start", "index": idx, "task_type": task_type})

        rows.append(run_ollama_lane(task_type, prompt))

        if RUN_CLOUD:
            nano_row, cloud_spent = run_openai_lane(task_type, prompt, NANO_MODEL, "GPT-5.4 Nano", rates, cloud_spent)
            rows.append(nano_row)

            if idx % RUN_MINI_EVERY == 0:
                mini_row, cloud_spent = run_openai_lane(task_type, prompt, MINI_MODEL, "GPT-5.4 Mini", rates, cloud_spent)
                rows.append(mini_row)

    summary = series_summary(expected_rows=len(rows))

    report = {
        "status": "complete",
        "series_id": SERIES_ID,
        "rows": len(rows),
        "cloud_spent_usd": cloud_spent,
        "run_cloud": RUN_CLOUD,
        "summary": summary,
        "runs_jsonl": str(RUNS_JSONL),
        "report_json": str(REPORT_JSON),
        "completed_at": now_iso(),
    }

    write_site_index_summary(report)
    report["site_dir"] = str(SITE_DIR)
    report["site_index"] = str(SITE_DIR / "index.html")
    REPORT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print_json(report)

    if not summary["ok"]:
        sys.exit(9)

if __name__ == "__main__":
    main()
