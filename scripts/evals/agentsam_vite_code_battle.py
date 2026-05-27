#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
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
RUN_ID = "vite_battle_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
ARTIFACT_ROOT = PROJECT_ROOT / ".agentsam_evals" / RUN_ID

MODELS = [
    "gpt-5.3-codex",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
]

TAGTEAMS = [
    {
        "team_key": "tagteam_5_4_mini_plus_5_4_nano",
        "members": ["gpt-5.4-mini", "gpt-5.4-nano"],
    },
    {
        "team_key": "tagteam_codex_plus_5_4_mini_plus_5_4_nano",
        "members": ["gpt-5.3-codex", "gpt-5.4-mini", "gpt-5.4-nano"],
    },
]

PRICE_PER_MILLION = {
    "gpt-5.4-nano": {"input": 0.05, "output": 0.40},
    "gpt-5.4-mini": {"input": 0.25, "output": 2.00},
    "gpt-5.4": {"input": 1.25, "output": 10.00},
    "gpt-5.3-codex": {"input": 1.25, "output": 10.00},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
}


APP_BRIEF = """
Build a fully styled 3-page Vite React app for Agent Sam called "Agent Sam Command Center".

Requirements:
- React + TypeScript style code.
- No external UI libraries.
- No Tailwind dependency.
- Use plain CSS in src/App.css.
- Three pages implemented with local state navigation:
  1. Overview
  2. Routing Lab
  3. Eval Report
- Must look polished: hero area, cards, metrics, gradients, sidebar or top nav, responsive layout.
- Must include mock metrics for Thompson routing:
  pass rate, latency, cost, alpha/beta, model candidates.
- Must include gpt-5.3-codex, gpt-5.4-mini, and gpt-5.4-nano somewhere in the UI.
- Must be buildable with npm install && npm run build.
- Keep implementation simple and contained to:
  package.json
  index.html
  src/main.tsx
  src/App.tsx
  src/App.css
  src/vite-env.d.ts
Return ONLY a JSON object with this shape:
{
  "files": [
    {"path": "package.json", "content": "..."},
    {"path": "index.html", "content": "..."},
    {"path": "src/main.tsx", "content": "..."},
    {"path": "src/App.tsx", "content": "..."},
    {"path": "src/App.css", "content": "..."},
    {"path": "src/vite-env.d.ts", "content": "..."}
  ],
  "notes": "short implementation notes"
}
No markdown fences. No prose outside JSON.
""".strip()


@dataclass
class CallMetrics:
    model: str
    role: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    response_id: Optional[str]
    status_code: int
    failure_class: Optional[str]
    raw_path: str


@dataclass
class BattleResult:
    run_id: str
    row_id: str
    created_at: str
    contestant_key: str
    contestant_type: str
    models_json: str
    app_dir: str
    dist_dir: str
    passed: int
    build_passed: int
    validation_score: float
    quality_score: float
    total_score: float
    total_latency_ms: int
    total_input_tokens: int
    total_output_tokens: int
    total_tokens: int
    total_estimated_cost_usd: float
    files_created_json: str
    missing_files_json: str
    build_stdout_path: str
    build_stderr_path: str
    calls_json: str
    notes: str


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
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except Exception:
        return default


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def price_for(model: str) -> Dict[str, float]:
    if model in PRICE_PER_MILLION:
        return PRICE_PER_MILLION[model]
    for key in sorted(PRICE_PER_MILLION, key=len, reverse=True):
        if model.startswith(key):
            return PRICE_PER_MILLION[key]
    return {"input": 0.0, "output": 0.0}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    p = price_for(model)
    return input_tokens / 1_000_000 * p["input"] + output_tokens / 1_000_000 * p["output"]


def http_json(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Tuple[int, Dict[str, Any]]:
    api_key = os.environ["OPENAI_API_KEY"]
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        "https://api.openai.com" + path,
        method=method,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(text) if text else {}
    except urllib.error.HTTPError as ex:
        text = ex.read().decode("utf-8", errors="replace")
        try:
            return ex.code, json.loads(text)
        except Exception:
            return ex.code, {"raw": text}


def output_text(body: Dict[str, Any]) -> str:
    if isinstance(body.get("output_text"), str):
        return body["output_text"]
    chunks: List[str] = []
    for item in body.get("output", []) or []:
        for content in item.get("content", []) or []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks).strip()


def usage(body: Dict[str, Any]) -> Tuple[int, int, int]:
    u = body.get("usage") or {}
    inp = int(u.get("input_tokens") or u.get("prompt_tokens") or 0)
    out = int(u.get("output_tokens") or u.get("completion_tokens") or 0)
    total = int(u.get("total_tokens") or inp + out)
    return inp, out, total


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


def call_model(model: str, role: str, prompt: str, raw_dir: Path) -> Tuple[str, CallMetrics]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"{role}_{model}_{time.time_ns()}.json"

    payload = {
        "model": model,
        "instructions": (
            "You are Agent Sam's code-generation evaluator. "
            "Follow the user's output format exactly. "
            "Return only the requested JSON where requested."
        ),
        "input": prompt,
        "max_output_tokens": env_int("AGENTSAM_VITE_MAX_OUTPUT_TOKENS", 6500),
        "store": False,
        "metadata": {
            "run_id": RUN_ID,
            "role": role,
            "contest": "vite_code_battle",
        },
    }

    started = time.perf_counter()
    status, body = http_json("POST", "/v1/responses", payload)
    latency = int((time.perf_counter() - started) * 1000)

    raw_path.write_text(json.dumps({"status": status, "body": body}, indent=2), encoding="utf-8")

    text = output_text(body)
    inp, out, total = usage(body)

    metrics = CallMetrics(
        model=model,
        role=role,
        latency_ms=latency,
        input_tokens=inp,
        output_tokens=out,
        total_tokens=total,
        estimated_cost_usd=estimate_cost(model, inp, out),
        response_id=body.get("id"),
        status_code=status,
        failure_class=failure_class(status),
        raw_path=str(raw_path),
    )

    return text, metrics


def strip_json_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def parse_files_json(text: str) -> Tuple[List[Dict[str, str]], str]:
    cleaned = strip_json_fences(text)
    try:
        obj = json.loads(cleaned)
        files = obj.get("files", [])
        notes = obj.get("notes", "")
        if not isinstance(files, list):
            return [], "JSON parsed but files was not a list"
        good = []
        for f in files:
            if isinstance(f, dict) and isinstance(f.get("path"), str) and isinstance(f.get("content"), str):
                good.append({"path": f["path"], "content": f["content"]})
        return good, str(notes)
    except Exception as ex:
        return [], f"JSON parse failed: {ex}"


def safe_write_files(app_dir: Path, files: List[Dict[str, str]]) -> List[str]:
    created = []
    allowed = {
        "package.json",
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
        "src/App.css",
        "src/vite-env.d.ts",
    }

    for f in files:
        rel = f["path"].replace("\\", "/").lstrip("/")
        if rel not in allowed:
            continue
        target = app_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f["content"], encoding="utf-8")
        created.append(rel)

    return created


def required_missing(app_dir: Path) -> List[str]:
    required = [
        "package.json",
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
        "src/App.css",
        "src/vite-env.d.ts",
    ]
    return [p for p in required if not (app_dir / p).exists()]


def run_build(app_dir: Path, row_dir: Path) -> Tuple[int, Path, Path]:
    stdout_path = row_dir / "build_stdout.txt"
    stderr_path = row_dir / "build_stderr.txt"

    if not (app_dir / "package.json").exists():
        stdout_path.write_text("", encoding="utf-8")
        stderr_path.write_text("Missing package.json", encoding="utf-8")
        return 1, stdout_path, stderr_path

    install = subprocess.run(
        ["npm", "install"],
        cwd=str(app_dir),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
    )

    build = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(app_dir),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
    )

    stdout_path.write_text(
        "=== npm install stdout ===\n"
        + install.stdout
        + "\n=== npm run build stdout ===\n"
        + build.stdout,
        encoding="utf-8",
    )
    stderr_path.write_text(
        "=== npm install stderr ===\n"
        + install.stderr
        + "\n=== npm run build stderr ===\n"
        + build.stderr,
        encoding="utf-8",
    )

    return build.returncode, stdout_path, stderr_path


def score_app(app_dir: Path, build_passed: bool, created: List[str], missing: List[str]) -> Tuple[float, float, float]:
    validation = 0.0
    if not missing:
        validation += 0.35
    if build_passed:
        validation += 0.45
    if len(created) >= 6:
        validation += 0.20

    app_tsx = (app_dir / "src/App.tsx").read_text(encoding="utf-8", errors="replace") if (app_dir / "src/App.tsx").exists() else ""
    css = (app_dir / "src/App.css").read_text(encoding="utf-8", errors="replace") if (app_dir / "src/App.css").exists() else ""
    combined = (app_tsx + "\n" + css).lower()

    quality_checks = [
        "overview" in combined,
        "routing lab" in combined or "routing" in combined,
        "eval report" in combined or "eval" in combined,
        "gpt-5.3-codex" in combined,
        "gpt-5.4-mini" in combined,
        "gpt-5.4-nano" in combined,
        "alpha" in combined and "beta" in combined,
        "latency" in combined,
        "cost" in combined,
        "gradient" in combined or "linear-gradient" in combined,
        "@media" in combined,
        "button" in combined or "nav" in combined,
    ]

    quality = sum(1 for x in quality_checks if x) / len(quality_checks)
    total = 0.70 * validation + 0.30 * quality
    return validation, quality, total


def row_id(key: str) -> str:
    return "vite_" + hashlib.sha256(f"{RUN_ID}:{key}:{time.time_ns()}".encode()).hexdigest()[:18]


def run_solo(model: str) -> BattleResult:
    contestant_key = f"solo_{model}"
    rid = row_id(contestant_key)
    row_dir = ARTIFACT_ROOT / contestant_key
    app_dir = row_dir / "app"
    raw_dir = row_dir / "raw"
    row_dir.mkdir(parents=True, exist_ok=True)

    text, call = call_model(model, "solo_builder", APP_BRIEF, raw_dir)
    files, notes = parse_files_json(text)
    created = safe_write_files(app_dir, files)
    missing = required_missing(app_dir)

    build_code, stdout_path, stderr_path = run_build(app_dir, row_dir)
    build_passed = build_code == 0 and (app_dir / "dist").exists()

    validation, quality, total = score_app(app_dir, build_passed, created, missing)

    return BattleResult(
        run_id=RUN_ID,
        row_id=rid,
        created_at=now_iso(),
        contestant_key=contestant_key,
        contestant_type="solo",
        models_json=json.dumps([model]),
        app_dir=str(app_dir),
        dist_dir=str(app_dir / "dist"),
        passed=1 if build_passed and total >= 0.70 else 0,
        build_passed=1 if build_passed else 0,
        validation_score=validation,
        quality_score=quality,
        total_score=total,
        total_latency_ms=call.latency_ms,
        total_input_tokens=call.input_tokens,
        total_output_tokens=call.output_tokens,
        total_tokens=call.total_tokens,
        total_estimated_cost_usd=call.estimated_cost_usd,
        files_created_json=json.dumps(created),
        missing_files_json=json.dumps(missing),
        build_stdout_path=str(stdout_path),
        build_stderr_path=str(stderr_path),
        calls_json=json.dumps([asdict(call)]),
        notes=notes,
    )


def run_tagteam(team_key: str, members: List[str]) -> BattleResult:
    rid = row_id(team_key)
    row_dir = ARTIFACT_ROOT / team_key
    app_dir = row_dir / "app"
    raw_dir = row_dir / "raw"
    row_dir.mkdir(parents=True, exist_ok=True)

    calls: List[CallMetrics] = []

    # Phase 1: architect.
    architect = members[0]
    plan_prompt = (
        "Create a concise implementation plan for this app. "
        "Return JSON with keys: app_structure, design_system, page_specs, validation_notes.\n\n"
        + APP_BRIEF
    )
    plan_text, call = call_model(architect, "architect", plan_prompt, raw_dir)
    calls.append(call)

    # Phase 2: builder.
    builder = members[1] if len(members) > 1 else members[0]
    build_prompt = (
        APP_BRIEF
        + "\n\nUse this architecture plan as guidance:\n"
        + plan_text[:12000]
    )
    build_text, call = call_model(builder, "builder", build_prompt, raw_dir)
    calls.append(call)

    files, notes = parse_files_json(build_text)

    # Phase 3: fixer/reviewer. If third exists, ask it to repair JSON/files before writing.
    if len(members) > 2:
        reviewer = members[2]
        review_prompt = (
            "You are the repair/review agent. The builder produced this JSON candidate. "
            "Return the same required JSON shape, fixing missing files, build risks, TypeScript errors, "
            "and styling gaps. No markdown fences.\n\n"
            "Original app brief:\n"
            + APP_BRIEF
            + "\n\nBuilder output:\n"
            + build_text[:24000]
        )
        fixed_text, call = call_model(reviewer, "reviewer_fixer", review_prompt, raw_dir)
        calls.append(call)
        fixed_files, fixed_notes = parse_files_json(fixed_text)
        if fixed_files:
            files = fixed_files
            notes = notes + "\nReviewer/fixer: " + fixed_notes

    created = safe_write_files(app_dir, files)
    missing = required_missing(app_dir)

    build_code, stdout_path, stderr_path = run_build(app_dir, row_dir)
    build_passed = build_code == 0 and (app_dir / "dist").exists()

    validation, quality, total = score_app(app_dir, build_passed, created, missing)

    return BattleResult(
        run_id=RUN_ID,
        row_id=rid,
        created_at=now_iso(),
        contestant_key=team_key,
        contestant_type="tagteam",
        models_json=json.dumps(members),
        app_dir=str(app_dir),
        dist_dir=str(app_dir / "dist"),
        passed=1 if build_passed and total >= 0.70 else 0,
        build_passed=1 if build_passed else 0,
        validation_score=validation,
        quality_score=quality,
        total_score=total,
        total_latency_ms=sum(c.latency_ms for c in calls),
        total_input_tokens=sum(c.input_tokens for c in calls),
        total_output_tokens=sum(c.output_tokens for c in calls),
        total_tokens=sum(c.total_tokens for c in calls),
        total_estimated_cost_usd=sum(c.estimated_cost_usd for c in calls),
        files_created_json=json.dumps(created),
        missing_files_json=json.dumps(missing),
        build_stdout_path=str(stdout_path),
        build_stderr_path=str(stderr_path),
        calls_json=json.dumps([asdict(c) for c in calls]),
        notes=notes,
    )


def write_jsonl(results: List[BattleResult], path: Path) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(asdict(r), ensure_ascii=False) + "\n")


def write_csv(results: List[BattleResult], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        fields = list(asdict(results[0]).keys())
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in results:
            writer.writerow(asdict(r))


def write_report(results: List[BattleResult], path: Path) -> None:
    ranked = sorted(results, key=lambda r: (-r.passed, -r.total_score, r.total_estimated_cost_usd, r.total_latency_ms))

    lines = [
        "# Agent Sam Vite Code Battle",
        "",
        f"- Run ID: `{RUN_ID}`",
        f"- Created: `{now_iso()}`",
        f"- Rows: `{len(results)}`",
        f"- Passed: `{sum(r.passed for r in results)}`",
        f"- Estimated cost: `${sum(r.total_estimated_cost_usd for r in results):.6f}`",
        "",
        "## Ranking",
        "",
        "| rank | contestant | type | passed | build | score | quality | ms | in | out | cost | app |",
        "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]

    for i, r in enumerate(ranked, 1):
        lines.append(
            f"| {i} | `{r.contestant_key}` | `{r.contestant_type}` | {r.passed} | {r.build_passed} | "
            f"{r.total_score:.3f} | {r.quality_score:.3f} | {r.total_latency_ms} | "
            f"{r.total_input_tokens} | {r.total_output_tokens} | ${r.total_estimated_cost_usd:.6f} | `{r.app_dir}` |"
        )

    lines += [
        "",
        "## Notes",
        "",
        "- `validation_score` heavily rewards files present and successful `npm run build`.",
        "- `quality_score` checks for required pages, model names, routing metrics, alpha/beta, styling, and responsive CSS.",
        "- Tagteams are measured as one composite row plus per-call metrics inside `calls_json`.",
    ]

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def write_sql(results: List[BattleResult], path: Path) -> None:
    tenant = os.environ.get("IAM_TENANT_ID", "")
    workspace = os.environ.get("IAM_WORKSPACE_ID", "")
    user = os.environ.get("IAM_USER_ID", "")

    lines = [
        """
CREATE TABLE IF NOT EXISTS agentsam_code_battle_observations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  contestant_key TEXT NOT NULL,
  contestant_type TEXT NOT NULL,
  models_json TEXT NOT NULL,
  app_dir TEXT,
  dist_dir TEXT,
  passed INTEGER NOT NULL,
  build_passed INTEGER NOT NULL,
  validation_score REAL NOT NULL,
  quality_score REAL NOT NULL,
  total_score REAL NOT NULL,
  total_latency_ms INTEGER NOT NULL,
  total_input_tokens INTEGER NOT NULL,
  total_output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  total_estimated_cost_usd REAL NOT NULL,
  files_created_json TEXT,
  missing_files_json TEXT,
  build_stdout_path TEXT,
  build_stderr_path TEXT,
  calls_json TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentsam_code_battle_run
ON agentsam_code_battle_observations(run_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_code_battle_score
ON agentsam_code_battle_observations(contestant_key, passed, total_score);
""".strip()
    ]

    cols = [
        "id", "run_id", "created_at", "tenant_id", "workspace_id", "user_id",
        "contestant_key", "contestant_type", "models_json", "app_dir", "dist_dir",
        "passed", "build_passed", "validation_score", "quality_score", "total_score",
        "total_latency_ms", "total_input_tokens", "total_output_tokens", "total_tokens",
        "total_estimated_cost_usd", "files_created_json", "missing_files_json",
        "build_stdout_path", "build_stderr_path", "calls_json", "notes",
    ]

    for r in results:
        vals = [
            r.row_id, r.run_id, r.created_at, tenant, workspace, user,
            r.contestant_key, r.contestant_type, r.models_json, r.app_dir, r.dist_dir,
            r.passed, r.build_passed, r.validation_score, r.quality_score, r.total_score,
            r.total_latency_ms, r.total_input_tokens, r.total_output_tokens, r.total_tokens,
            r.total_estimated_cost_usd, r.files_created_json, r.missing_files_json,
            r.build_stdout_path, r.build_stderr_path, r.calls_json, r.notes,
        ]
        lines.append(
            f"INSERT OR REPLACE INTO agentsam_code_battle_observations ({', '.join(cols)}) "
            f"VALUES ({', '.join(sql_quote(v) for v in vals)});"
        )

    path.write_text("\n\n".join(lines) + "\n", encoding="utf-8")


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
    log_path = ARTIFACT_ROOT / "d1_write.log"
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

    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)

    print(f"[Vite Battle] run_id={RUN_ID}")
    print(f"[Vite Battle] artifacts={ARTIFACT_ROOT}")

    results: List[BattleResult] = []

    for model in MODELS:
        print(f"[solo] {model}")
        r = run_solo(model)
        results.append(r)
        print(
            f"       passed={r.passed} build={r.build_passed} score={r.total_score:.3f} "
            f"ms={r.total_latency_ms} cost=${r.total_estimated_cost_usd:.6f} app={r.app_dir}"
        )

    for team in TAGTEAMS:
        print(f"[tagteam] {team['team_key']} members={team['members']}")
        r = run_tagteam(team["team_key"], team["members"])
        results.append(r)
        print(
            f"          passed={r.passed} build={r.build_passed} score={r.total_score:.3f} "
            f"ms={r.total_latency_ms} cost=${r.total_estimated_cost_usd:.6f} app={r.app_dir}"
        )

    jsonl_path = ARTIFACT_ROOT / "vite_battle_results.jsonl"
    csv_path = ARTIFACT_ROOT / "vite_battle_summary.csv"
    report_path = ARTIFACT_ROOT / "VITE_BATTLE_REPORT.md"
    sql_path = ARTIFACT_ROOT / "seed_agentsam_code_battle_observations.sql"
    manifest_path = ARTIFACT_ROOT / "manifest.json"

    write_jsonl(results, jsonl_path)
    write_csv(results, csv_path)
    write_report(results, report_path)
    write_sql(results, sql_path)

    manifest_path.write_text(json.dumps({
        "run_id": RUN_ID,
        "created_at": now_iso(),
        "artifact_root": str(ARTIFACT_ROOT),
        "rows": len(results),
        "passed": sum(r.passed for r in results),
        "estimated_cost_usd": sum(r.total_estimated_cost_usd for r in results),
        "report": str(report_path),
        "csv": str(csv_path),
        "jsonl": str(jsonl_path),
        "sql": str(sql_path),
    }, indent=2), encoding="utf-8")

    maybe_write_d1(sql_path)

    print("[DONE]")
    print(f"Report: {report_path}")
    print(f"CSV: {csv_path}")
    print(f"JSONL: {jsonl_path}")
    print(f"Seed SQL: {sql_path}")
    print(f"Total estimated cost: ${sum(r.total_estimated_cost_usd for r in results):.6f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
