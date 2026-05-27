#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


PROJECT_ROOT = Path(os.environ.get("AGENTSAM_PROJECT_ROOT", "/Users/samprimeaux/inneranimalmedia"))
ENV_PATH = Path(os.environ.get("AGENTSAM_ENV_PATH", str(PROJECT_ROOT / ".env.agentsam.local")))
RUN_ID = "agentsam_eval_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
ARTIFACT_DIR = PROJECT_ROOT / ".agentsam_evals" / RUN_ID


BLOCKED_EXACT = {
    "gpt-5.5",
    "gpt-5.5-pro",
    "gpt-5.4-pro",
    "gpt-5-pro",
}

BLOCKED_SUBSTRINGS = {
    "claude",
    "sonnet",
    "opus",
    "anthropic",
    "babbage",
    "davinci",
    "whisper",
    "tts",
    "dall-e",
    "image",
    "audio",
    "realtime",
    "embedding",
    "moderation",
}

PREFERRED_MODELS = [
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gpt-5.4-nano",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.1",
    "gpt-5.4",
    "o4-mini",
]

# Estimated USD per 1M tokens. Exact token counts come from API; cost is local estimate.
PRICE_PER_MILLION = {
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "o4-mini": {"input": 1.10, "output": 4.40},
    "gpt-5.4-nano": {"input": 0.05, "output": 0.40},
    "gpt-5.4-mini": {"input": 0.25, "output": 2.00},
    "gpt-5.4": {"input": 1.25, "output": 10.00},
    "gpt-5.3-codex": {"input": 1.25, "output": 10.00},
}


@dataclass
class Task:
    task_key: str
    profile_slug: str
    route_key: str
    instructions: str
    input_text: str
    expected_markers: List[str]


@dataclass
class Result:
    run_id: str
    observation_id: str
    created_at: str
    provider: str
    model_key: str
    task_key: str
    profile_slug: str
    route_key: str
    passed: int
    status: str
    failure_class: Optional[str]
    error_message: Optional[str]
    latency_ms: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    response_id: Optional[str]
    output_chars: int
    output_sha256: Optional[str]
    expected_markers_found: int
    expected_markers_total: int
    artifact_path: str
    raw_response_path: str
    file_locations_json: str


def load_env(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing env file: {path}")

    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except Exception:
        return default


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return default


def csv_env(name: str) -> List[str]:
    value = os.environ.get(name, "").strip()
    if not value:
        return []
    return [x.strip() for x in value.split(",") if x.strip()]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def http_json(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Tuple[int, Dict[str, Any]]:
    api_key = os.environ["OPENAI_API_KEY"]
    url = "https://api.openai.com" + path

    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url=url,
        method=method,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(text) if text else {}
    except urllib.error.HTTPError as ex:
        text = ex.read().decode("utf-8", errors="replace")
        try:
            return ex.code, json.loads(text)
        except Exception:
            return ex.code, {"raw": text}


def eligible_model(model_id: str) -> bool:
    low = model_id.lower()

    if model_id in BLOCKED_EXACT:
        return False

    if any(x in low for x in BLOCKED_SUBSTRINGS):
        return False

    return low.startswith("gpt-") or low == "o4-mini" or low.startswith("o4-mini")


def discover_models() -> List[str]:
    manual = csv_env("AGENTSAM_EVAL_MODELS")
    if manual:
        return [m for m in manual if eligible_model(m)]

    status, body = http_json("GET", "/v1/models")
    if status >= 400:
        raise RuntimeError(f"/v1/models failed HTTP {status}: {body}")

    visible = sorted({m["id"] for m in body.get("data", []) if isinstance(m, dict) and m.get("id")})
    eligible = [m for m in visible if eligible_model(m)]

    ordered: List[str] = []

    for preferred in PREFERRED_MODELS:
        if preferred in eligible and preferred not in ordered:
            ordered.append(preferred)

    for model in eligible:
        if model not in ordered:
            ordered.append(model)

    return ordered[:env_int("AGENTSAM_EVAL_MAX_MODELS", 12)]


def file_snapshot_json() -> str:
    paths = csv_env("AGENTSAM_EVAL_FILES")
    rows = []

    for raw in paths:
        p = Path(raw)
        if not p.is_absolute():
            p = PROJECT_ROOT / raw

        exists = p.exists()
        rows.append({
            "path": str(p),
            "exists": exists,
            "size_bytes": p.stat().st_size if exists and p.is_file() else None,
            "sha256": sha256_text(p.read_text(errors="replace")) if exists and p.is_file() else None,
        })

    return json.dumps(rows, ensure_ascii=False)


def build_tasks() -> List[Task]:
    files = file_snapshot_json()

    tasks = [
        Task(
            task_key="simple_router",
            profile_slug="orchestrator",
            route_key="simple_router",
            instructions="Return JSON only. Be concise.",
            input_text=(
                "Classify this Agent Sam request: 'Add workspace write tools and validation gates.' "
                "Return keys: task_type, recommended_profile, should_write_files, risk."
            ),
            expected_markers=["task_type", "recommended_profile", "should_write_files", "risk"],
        ),
        Task(
            task_key="d1_audit",
            profile_slug="d1-auditor",
            route_key="d1_audit",
            instructions="Return JSON only. Focus on Cloudflare D1 verification.",
            input_text=(
                "Create a D1 audit plan for tables agentsam_subagent_profile, "
                "agentsam_routing_arms, agentsam_model_eval_observations. "
                "Return keys: pragma_checks, row_count_checks, foreign_key_checks, pass_criteria."
            ),
            expected_markers=["pragma_checks", "row_count_checks", "foreign_key_checks", "pass_criteria"],
        ),
        Task(
            task_key="code_review",
            profile_slug="code-reviewer",
            route_key="code_review",
            instructions="Return JSON only. You are a strict code reviewer.",
            input_text=(
                "Review this behavior: workspace_write_file must only write under "
                "resolveIamWorkspaceRoot, require access_mode=read_write and sandbox_mode=workspace-write, "
                "log before/after hash, then run validation. "
                "Return keys: accept, issues, required_tests, security_notes, thompson_reward_hint. "
                f"File snapshots: {files}"
            ),
            expected_markers=["accept", "issues", "required_tests", "thompson_reward_hint"],
        ),
        Task(
            task_key="spawn_contract",
            profile_slug="implementer",
            route_key="spawn_contract",
            instructions="Return JSON only. Design strict API contracts.",
            input_text=(
                "Design agentsam_spawn_profile result contract. Include keys: status, profile_slug, "
                "model_key, summary, artifacts, files_changed, diff_stats, validation, cost, tokens, "
                "latency_ms, child_run_id, parent_run_id."
            ),
            expected_markers=["child_run_id", "latency_ms", "tokens", "validation"],
        ),
        Task(
            task_key="validation_gate",
            profile_slug="implementer",
            route_key="post_write_validation",
            instructions="Return JSON only. Be concrete and testable.",
            input_text=(
                "Design validation gates after workspace_write_file/workspace_apply_patch. Include JS/TS, "
                "SQL migration, Cloudflare Worker, dashboard/browser checks, failure policy, and "
                "excludeModelKeys policy."
            ),
            expected_markers=["commands", "failure", "excludeModelKeys", "pass"],
        ),
    ]

    allowed = set(csv_env("AGENTSAM_EVAL_TASKS"))
    if allowed:
        tasks = [t for t in tasks if t.task_key in allowed]

    return tasks


def output_text_from_response(body: Dict[str, Any]) -> str:
    if isinstance(body.get("output_text"), str):
        return body["output_text"]

    chunks: List[str] = []
    for item in body.get("output", []) or []:
        for content in item.get("content", []) or []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])

    return "\n".join(chunks).strip()


def usage_from_response(body: Dict[str, Any]) -> Tuple[int, int, int]:
    usage = body.get("usage") or {}
    input_tokens = int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or input_tokens + output_tokens)
    return input_tokens, output_tokens, total_tokens


def price_for(model: str) -> Dict[str, float]:
    if model in PRICE_PER_MILLION:
        return PRICE_PER_MILLION[model]

    for key in sorted(PRICE_PER_MILLION, key=len, reverse=True):
        if model.startswith(key):
            return PRICE_PER_MILLION[key]

    return {"input": 0.0, "output": 0.0}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    price = price_for(model)
    return (input_tokens / 1_000_000 * price["input"]) + (output_tokens / 1_000_000 * price["output"])


def failure_class(status: int) -> Optional[str]:
    if status < 400:
        return None
    if status == 401:
        return "auth"
    if status == 403:
        return "permission"
    if status == 404:
        return "model_or_endpoint_not_found"
    if status == 429:
        return "rate_limit"
    if status >= 500:
        return "provider_5xx"
    return "provider_4xx"


def marker_score(output: str, task: Task) -> Tuple[int, int, bool]:
    low = output.lower()
    found = sum(1 for marker in task.expected_markers if marker.lower() in low)
    total = len(task.expected_markers)
    needed = max(1, int(total * 0.70))
    return found, total, found >= needed


def observation_id(model: str, task: str) -> str:
    raw = f"{RUN_ID}:{model}:{task}:{time.time_ns()}"
    return "obs_" + hashlib.sha256(raw.encode()).hexdigest()[:20]


def run_eval(model: str, task: Task) -> Result:
    obs_id = observation_id(model, task.task_key)
    raw_path = ARTIFACT_DIR / "raw" / f"{obs_id}.json"
    out_path = ARTIFACT_DIR / "outputs" / f"{obs_id}.txt"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "model": model,
        "instructions": task.instructions,
        "input": task.input_text,
        "max_output_tokens": env_int("AGENTSAM_EVAL_MAX_OUTPUT_TOKENS", 500),
        "store": False,
        "metadata": {
            "run_id": RUN_ID,
            "workspace_id": os.environ.get("IAM_WORKSPACE_ID", ""),
            "tenant_id": os.environ.get("IAM_TENANT_ID", ""),
            "task_key": task.task_key,
            "profile_slug": task.profile_slug,
        },
    }

    started = time.perf_counter()
    status, body = http_json("POST", "/v1/responses", payload)
    latency_ms = int((time.perf_counter() - started) * 1000)

    raw_path.write_text(json.dumps({"status": status, "body": body}, indent=2), encoding="utf-8")

    output = output_text_from_response(body)
    out_path.write_text(output, encoding="utf-8")

    input_tokens, output_tokens, total_tokens = usage_from_response(body)
    markers_found, markers_total, marker_pass = marker_score(output, task)

    fc = failure_class(status)
    passed = int(status < 400 and marker_pass)

    return Result(
        run_id=RUN_ID,
        observation_id=obs_id,
        created_at=now_iso(),
        provider="openai",
        model_key=model,
        task_key=task.task_key,
        profile_slug=task.profile_slug,
        route_key=task.route_key,
        passed=passed,
        status="passed" if passed else "failed",
        failure_class=fc,
        error_message=json.dumps(body.get("error"))[:1000] if isinstance(body.get("error"), dict) else None,
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=estimate_cost(model, input_tokens, output_tokens),
        response_id=body.get("id"),
        output_chars=len(output),
        output_sha256=sha256_text(output) if output else None,
        expected_markers_found=markers_found,
        expected_markers_total=markers_total,
        artifact_path=str(out_path),
        raw_response_path=str(raw_path),
        file_locations_json=file_snapshot_json(),
    )


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def write_sql(results: List[Result], path: Path) -> None:
    tenant = os.environ.get("IAM_TENANT_ID", "")
    workspace = os.environ.get("IAM_WORKSPACE_ID", "")
    user = os.environ.get("IAM_USER_ID", "")

    lines = [
        """
CREATE TABLE IF NOT EXISTS agentsam_model_eval_observations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  task_key TEXT NOT NULL,
  profile_slug TEXT,
  route_key TEXT,
  passed INTEGER NOT NULL,
  status TEXT NOT NULL,
  failure_class TEXT,
  error_message TEXT,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL NOT NULL,
  response_id TEXT,
  output_chars INTEGER NOT NULL,
  output_sha256 TEXT,
  expected_markers_found INTEGER NOT NULL,
  expected_markers_total INTEGER NOT NULL,
  artifact_path TEXT,
  raw_response_path TEXT,
  file_locations_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentsam_eval_run
ON agentsam_model_eval_observations(run_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_eval_model_task
ON agentsam_model_eval_observations(model_key, task_key, created_at);
""".strip()
    ]

    cols = [
        "id", "run_id", "created_at", "tenant_id", "workspace_id", "user_id",
        "provider", "model_key", "task_key", "profile_slug", "route_key",
        "passed", "status", "failure_class", "error_message", "latency_ms",
        "input_tokens", "output_tokens", "total_tokens", "estimated_cost_usd",
        "response_id", "output_chars", "output_sha256", "expected_markers_found",
        "expected_markers_total", "artifact_path", "raw_response_path", "file_locations_json",
    ]

    for r in results:
        values = [
            r.observation_id, r.run_id, r.created_at, tenant, workspace, user,
            r.provider, r.model_key, r.task_key, r.profile_slug, r.route_key,
            r.passed, r.status, r.failure_class, r.error_message, r.latency_ms,
            r.input_tokens, r.output_tokens, r.total_tokens, r.estimated_cost_usd,
            r.response_id, r.output_chars, r.output_sha256, r.expected_markers_found,
            r.expected_markers_total, r.artifact_path, r.raw_response_path, r.file_locations_json,
        ]
        lines.append(
            f"INSERT OR REPLACE INTO agentsam_model_eval_observations ({', '.join(cols)}) "
            f"VALUES ({', '.join(sql_quote(v) for v in values)});"
        )

    path.write_text("\n\n".join(lines) + "\n", encoding="utf-8")


def write_csv(results: List[Result], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(asdict(results[0]).keys()))
        writer.writeheader()
        for r in results:
            writer.writerow(asdict(r))


def write_jsonl(results: List[Result], path: Path) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(asdict(r), ensure_ascii=False) + "\n")


def write_report(results: List[Result], models: List[str], tasks: List[Task], path: Path) -> None:
    passed = sum(r.passed for r in results)
    total_cost = sum(r.estimated_cost_usd for r in results)

    by_model: Dict[str, List[Result]] = {}
    for r in results:
        by_model.setdefault(r.model_key, []).append(r)

    lines = [
        "# Agent Sam GPT Dynamic Thompson Eval",
        "",
        f"- Run ID: `{RUN_ID}`",
        f"- Created: `{now_iso()}`",
        f"- Rows: `{len(results)}`",
        f"- Passed: `{passed}`",
        f"- Failed: `{len(results) - passed}`",
        f"- Estimated cost: `${total_cost:.6f}`",
        f"- Artifact dir: `{ARTIFACT_DIR}`",
        "",
        "## Models",
        "",
    ]

    for m in models:
        lines.append(f"- `{m}`")

    lines += [
        "",
        "## Tasks",
        "",
    ]

    for t in tasks:
        lines.append(f"- `{t.task_key}` → `{t.profile_slug}` / `{t.route_key}`")

    lines += [
        "",
        "## Model Summary",
        "",
        "| model | runs | pass rate | avg ms | input tok | output tok | est cost |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]

    for model, rows in sorted(by_model.items()):
        runs = len(rows)
        pass_rate = sum(r.passed for r in rows) / runs if runs else 0
        avg_ms = int(sum(r.latency_ms for r in rows) / runs) if runs else 0
        in_tok = sum(r.input_tokens for r in rows)
        out_tok = sum(r.output_tokens for r in rows)
        cost = sum(r.estimated_cost_usd for r in rows)
        lines.append(f"| `{model}` | {runs} | {pass_rate:.1%} | {avg_ms} | {in_tok} | {out_tok} | ${cost:.6f} |")

    lines += [
        "",
        "## Raw Rows",
        "",
        "| model | task | passed | ms | in | out | cost | output |",
        "|---|---|---:|---:|---:|---:|---:|---|",
    ]

    for r in results:
        lines.append(
            f"| `{r.model_key}` | `{r.task_key}` | {r.passed} | {r.latency_ms} | "
            f"{r.input_tokens} | {r.output_tokens} | ${r.estimated_cost_usd:.6f} | `{r.artifact_path}` |"
        )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def maybe_write_d1(sql_path: Path) -> None:
    if not env_bool("AGENTSAM_EVAL_RUN_D1", env_bool("AGENTSAM_SMOKE_WRITE_D1", False)):
        print("[D1] skipped")
        return

    db = os.environ.get("IAM_D1_DB", "inneranimalmedia-business")
    config = os.environ.get("AGENTSAM_WRANGLER_CONFIG", "wrangler.production.toml")

    env_script = PROJECT_ROOT / "scripts" / "with-cloudflare-env.sh"

    if env_script.exists():
        cmd = [str(env_script), "npx", "wrangler", "d1", "execute", db, "--remote", "-c", config, "--file", str(sql_path)]
    else:
        cmd = ["npx", "wrangler", "d1", "execute", db, "--remote", "-c", config, "--file", str(sql_path)]

    print("[D1] " + " ".join(cmd))
    proc = subprocess.run(cmd, cwd=str(PROJECT_ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log_path = ARTIFACT_DIR / "d1_write.log"
    log_path.write_text(proc.stdout, encoding="utf-8")

    print(f"[D1] exit={proc.returncode} log={log_path}")
    if proc.returncode != 0:
        print(proc.stdout)
        raise SystemExit(proc.returncode)


def main() -> int:
    load_env(ENV_PATH)

    if not os.environ.get("OPENAI_API_KEY"):
        print("[ERROR] OPENAI_API_KEY missing", file=sys.stderr)
        return 2

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_DIR / "raw").mkdir(exist_ok=True)
    (ARTIFACT_DIR / "outputs").mkdir(exist_ok=True)

    print(f"[Agent Sam Eval] run_id={RUN_ID}")
    print(f"[Agent Sam Eval] env={ENV_PATH}")
    print(f"[Agent Sam Eval] artifacts={ARTIFACT_DIR}")

    models = discover_models()
    tasks = build_tasks()

    print(f"[models] {len(models)}")
    for m in models:
        print(f"  - {m}")

    print(f"[tasks] {len(tasks)}")
    for t in tasks:
        print(f"  - {t.task_key}")

    max_cost = env_float("AGENTSAM_SMOKE_MAX_COST_USD", 0.05)
    dry_run = env_bool("AGENTSAM_EVAL_DRY_RUN", False)

    results: List[Result] = []
    spent = 0.0

    for model in models:
        for task in tasks:
            if spent >= max_cost:
                print(f"[budget stop] ${spent:.6f} >= ${max_cost:.6f}")
                break

            print(f"[run] model={model} task={task.task_key}")

            if dry_run:
                fake = Result(
                    run_id=RUN_ID,
                    observation_id=observation_id(model, task.task_key),
                    created_at=now_iso(),
                    provider="openai",
                    model_key=model,
                    task_key=task.task_key,
                    profile_slug=task.profile_slug,
                    route_key=task.route_key,
                    passed=1,
                    status="dry_run",
                    failure_class=None,
                    error_message=None,
                    latency_ms=0,
                    input_tokens=0,
                    output_tokens=0,
                    total_tokens=0,
                    estimated_cost_usd=0.0,
                    response_id=None,
                    output_chars=0,
                    output_sha256=None,
                    expected_markers_found=len(task.expected_markers),
                    expected_markers_total=len(task.expected_markers),
                    artifact_path="dry_run",
                    raw_response_path="dry_run",
                    file_locations_json=file_snapshot_json(),
                )
                r = fake
            else:
                r = run_eval(model, task)

            results.append(r)
            spent += r.estimated_cost_usd

            print(
                f"      passed={r.passed} status={r.status} ms={r.latency_ms} "
                f"in={r.input_tokens} out={r.output_tokens} cost=${r.estimated_cost_usd:.6f}"
            )

        if spent >= max_cost:
            break

    if not results:
        print("[ERROR] No results produced", file=sys.stderr)
        return 3

    jsonl_path = ARTIFACT_DIR / "results.jsonl"
    csv_path = ARTIFACT_DIR / "summary.csv"
    report_path = ARTIFACT_DIR / "REPORT.md"
    sql_path = ARTIFACT_DIR / "seed_agentsam_model_eval_observations.sql"
    manifest_path = ARTIFACT_DIR / "manifest.json"

    write_jsonl(results, jsonl_path)
    write_csv(results, csv_path)
    write_report(results, models, tasks, report_path)
    write_sql(results, sql_path)

    manifest_path.write_text(json.dumps({
        "run_id": RUN_ID,
        "created_at": now_iso(),
        "artifact_dir": str(ARTIFACT_DIR),
        "jsonl": str(jsonl_path),
        "csv": str(csv_path),
        "report": str(report_path),
        "sql": str(sql_path),
        "rows": len(results),
        "passed": sum(r.passed for r in results),
        "failed": len(results) - sum(r.passed for r in results),
        "estimated_cost_usd": sum(r.estimated_cost_usd for r in results),
    }, indent=2), encoding="utf-8")

    maybe_write_d1(sql_path)

    print("[DONE]")
    print(f"Report: {report_path}")
    print(f"CSV: {csv_path}")
    print(f"JSONL: {jsonl_path}")
    print(f"Seed SQL: {sql_path}")
    print(f"Rows: {len(results)}")
    print(f"Total estimated cost: ${sum(r.estimated_cost_usd for r in results):.6f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
