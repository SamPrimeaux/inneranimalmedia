#!/usr/bin/env python3
"""
eval_model_lineup_v1.py — IAM Model Lineup Evaluator

Pulls active models from agentsam_model_catalog, stress-tests each through
the live chat API in parallel, collects real latency/quality/cost metrics,
and outputs a ranked v1 lineup JSON + terminal report.

Usage:
    python3 scripts/eval_model_lineup_v1.py

Env overrides:
    CHAT_URL             default: https://inneranimalmedia.com/api/agent/chat
    IAM_COOKIE           session cookie (auto-loaded from .iam_cookie if present)
    IAM_CHAT_TIMEOUT_SEC default: 45 (per-request wall clock)
    EVAL_WORKERS         default: 4  (parallel threads)
    EVAL_RUNS            default: 2  (runs per prompt per model; keep low to avoid rate limits)
    EVAL_MODE            default: ask
    D1_DB                default: inneranimalmedia-business
    OUTPUT_DIR           default: scripts/reports
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────

CHAT_URL    = os.getenv("CHAT_URL", "https://inneranimalmedia.com/api/agent/chat")
TIMEOUT_SEC = int(os.getenv("IAM_CHAT_TIMEOUT_SEC", "45"))
WORKERS     = int(os.getenv("EVAL_WORKERS", "4"))
RUNS        = int(os.getenv("EVAL_RUNS", "2"))
MODE        = os.getenv("EVAL_MODE", "ask")
D1_DB       = os.getenv("D1_DB", "inneranimalmedia-business")
OUTPUT_DIR  = Path(os.getenv("OUTPUT_DIR", "scripts/reports"))
COOKIE_FILE = Path(".iam_cookie")

# Test prompts: (slug, prompt, min_expected_chars, keyword_checks)
# Ordered easy → hard so we can bail early on broken models
TEST_PROMPTS: list[tuple[str, str, int, list[str]]] = [
    (
        "ping",
        "Reply with exactly: PONG",
        3,
        ["PONG"],
    ),
    (
        "reasoning",
        "What is 17 × 23? Show your work briefly.",
        20,
        ["391"],
    ),
    (
        "codegen",
        "Write a Python one-liner that returns the first 5 even numbers as a list.",
        15,
        ["[0, 2, 4, 6, 8]", "[0,2,4,6,8]", "range", "list"],
    ),
]

# ── Cookie loader ─────────────────────────────────────────────────────────────

def load_cookie() -> str:
    env_val = os.getenv("IAM_COOKIE", "").strip()
    if env_val:
        return env_val
    if COOKIE_FILE.exists():
        return COOKIE_FILE.read_text().strip()
    print("WARN: No IAM_COOKIE or .iam_cookie found — requests may 401", file=sys.stderr)
    return ""

# ── D1 query via wrangler ─────────────────────────────────────────────────────

def d1_query(sql: str) -> list[dict]:
    try:
        result = subprocess.run(
            [
                "npx", "wrangler", "d1", "execute", D1_DB,
                "--remote", "--json",
                f"--command={sql}",
            ],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            print(f"D1 error: {result.stderr[:300]}", file=sys.stderr)
            return []
        data = json.loads(result.stdout)
        # wrangler --json returns a list; first element has .results
        if isinstance(data, list) and data:
            return data[0].get("results", [])
        return []
    except Exception as e:
        print(f"d1_query failed: {e}", file=sys.stderr)
        return []

def fetch_active_models() -> list[dict]:
    rows = d1_query("""
        SELECT
            model_key, display_name, provider, tier, api_platform,
            openai_model_id, anthropic_model_id, google_model_id,
            context_window, max_output_tokens,
            cost_per_1k_in, cost_per_1k_out,
            supports_tools, supports_vision, supports_streaming,
            supports_json_mode, supports_reasoning, is_active, is_degraded
        FROM agentsam_model_catalog
        WHERE is_active = 1 AND is_degraded = 0
        ORDER BY tier, provider, model_key
    """)
    return rows

# ── SSE chat via curl ─────────────────────────────────────────────────────────

@dataclass
class RunResult:
    model_key:    str
    prompt_slug:  str
    ok:           bool
    ttft_ms:      Optional[float] = None   # time-to-first-token
    total_ms:     Optional[float] = None
    output_chars: int = 0
    saw_done:     bool = False
    quality:      float = 0.0              # 0–1
    error:        Optional[str] = None
    curl_exit:    int = 0

def call_chat(model_key: str, prompt: str, cookie: str) -> tuple[float | None, float | None, str, bool, int]:
    """
    Returns (ttft_ms, total_ms, full_text, saw_done, curl_exit_code).
    TTFT = wall time until first non-empty content chunk arrives.
    Uses curl streaming with --max-time hard cap.
    """
    payload = json.dumps({
        "message": prompt,
        "mode": MODE,
        "model_key": model_key,
        "stream": True,
    })

    cmd = [
        "curl", "-sSN",
        "--max-time", str(TIMEOUT_SEC),
        "-X", "POST", CHAT_URL,
        "-H", "Content-Type: application/json",
        "-H", f"Cookie: {cookie}",
        "--data-raw", payload,
    ]

    t_start = time.perf_counter()
    ttft_ms = None
    chunks: list[str] = []
    saw_done = False

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        for raw_line in proc.stdout:
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            payload_str = line[5:].strip()
            if payload_str == "[DONE]":
                saw_done = True
                break
            try:
                obj = json.loads(payload_str)
            except Exception:
                continue

            obj_type = obj.get("type", "")

            # IAM native SSE format: {type:"done"} closes the stream
            if obj_type == "done":
                saw_done = True
                break

            # IAM native SSE format: {type:"error", message:"..."}
            if obj_type == "error":
                err_msg = obj.get("message") or obj.get("error") or "unknown error"
                proc.kill()
                return ttft_ms, (time.perf_counter() - t_start) * 1000, err_msg, False, 1

            # IAM native SSE format: {type:"text", text:"..."}
            content = obj.get("text") or ""

            # Fallback: OpenAI-shaped delta (if ever proxied directly)
            if not content:
                choices = obj.get("choices") or []
                if choices:
                    content = (choices[0].get("delta") or {}).get("content") or ""

            if content and ttft_ms is None:
                ttft_ms = (time.perf_counter() - t_start) * 1000

            if content:
                chunks.append(content)

        proc.wait(timeout=5)
        exit_code = proc.returncode
    except Exception as e:
        return None, None, str(e), False, -1

    total_ms = (time.perf_counter() - t_start) * 1000
    full_text = "".join(chunks)
    return ttft_ms, total_ms, full_text, saw_done, exit_code

def score_quality(text: str, min_chars: int, keywords: list[str]) -> float:
    """
    Simple 0–1 quality proxy:
      0.4 — length gate (>= min_chars)
      0.6 — keyword presence (partial credit per keyword hit)
    """
    if not text or len(text.strip()) < 3:
        return 0.0
    score = 0.0
    if len(text) >= min_chars:
        score += 0.4
    if keywords:
        hits = sum(1 for kw in keywords if kw.lower() in text.lower())
        score += 0.6 * (hits / len(keywords))
    else:
        score += 0.6
    return round(score, 3)

def eval_model_prompt(
    model_key: str,
    prompt_slug: str,
    prompt: str,
    min_chars: int,
    keywords: list[str],
    cookie: str,
    run_index: int,
) -> RunResult:
    ttft, total, text, done, exit_code = call_chat(model_key, prompt, cookie)

    is_error = (exit_code != 0 and exit_code != 28) or (not done and exit_code == 28)
    # exit 28 = curl timeout
    if exit_code == 28:
        return RunResult(
            model_key=model_key, prompt_slug=prompt_slug,
            ok=False, ttft_ms=ttft, total_ms=total,
            output_chars=len(text or ""), saw_done=False,
            quality=0.0, error="curl_timeout_28",
            curl_exit=exit_code,
        )

    q = score_quality(text or "", min_chars, keywords)
    ok = done and q > 0.0

    return RunResult(
        model_key=model_key, prompt_slug=prompt_slug,
        ok=ok, ttft_ms=ttft, total_ms=total,
        output_chars=len(text or ""), saw_done=done,
        quality=q, error=None if ok else (text[:120] if text else "no response"),
        curl_exit=exit_code,
    )

# ── Metric aggregation ────────────────────────────────────────────────────────

@dataclass
class ModelMetrics:
    model_key:     str
    display_name:  str
    provider:      str
    tier:          str
    # capabilities from catalog
    supports_tools:     bool = False
    supports_vision:    bool = False
    supports_streaming: bool = True
    supports_json_mode: bool = False
    supports_reasoning: bool = False
    cost_per_1k_in:     float = 0.0
    cost_per_1k_out:    float = 0.0
    context_window:     int = 0
    max_output_tokens:  int = 0
    # measured
    success_rate:  float = 0.0
    ttft_p50_ms:   Optional[float] = None
    ttft_p95_ms:   Optional[float] = None
    latency_p50_ms: Optional[float] = None
    latency_p95_ms: Optional[float] = None
    avg_quality:   float = 0.0
    total_runs:    int = 0
    failed_runs:   int = 0
    # derived
    score:         float = 0.0   # composite 0–100
    verdict:       str = ""      # "pass" | "degraded" | "fail"
    fail_reason:   Optional[str] = None

def pct(vals: list[float], p: float) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    idx = math.ceil(p / 100 * len(s)) - 1
    return round(s[max(0, idx)], 1)

def aggregate(model_row: dict, runs: list[RunResult]) -> ModelMetrics:
    m = ModelMetrics(
        model_key=model_row["model_key"],
        display_name=model_row.get("display_name", model_row["model_key"]),
        provider=model_row.get("provider", ""),
        tier=model_row.get("tier", ""),
        supports_tools=bool(model_row.get("supports_tools", 0)),
        supports_vision=bool(model_row.get("supports_vision", 0)),
        supports_streaming=bool(model_row.get("supports_streaming", 1)),
        supports_json_mode=bool(model_row.get("supports_json_mode", 0)),
        supports_reasoning=bool(model_row.get("supports_reasoning", 0)),
        cost_per_1k_in=float(model_row.get("cost_per_1k_in", 0)),
        cost_per_1k_out=float(model_row.get("cost_per_1k_out", 0)),
        context_window=int(model_row.get("context_window", 0)),
        max_output_tokens=int(model_row.get("max_output_tokens", 0)),
        total_runs=len(runs),
        failed_runs=sum(1 for r in runs if not r.ok),
    )

    ok_runs   = [r for r in runs if r.ok]
    ttfts     = [r.ttft_ms  for r in ok_runs if r.ttft_ms  is not None]
    totals    = [r.total_ms for r in ok_runs if r.total_ms is not None]
    qualities = [r.quality  for r in ok_runs]

    m.success_rate   = round(len(ok_runs) / max(len(runs), 1), 3)
    m.ttft_p50_ms    = pct(ttfts, 50)  if ttfts  else None
    m.ttft_p95_ms    = pct(ttfts, 95)  if ttfts  else None
    m.latency_p50_ms = pct(totals, 50) if totals else None
    m.latency_p95_ms = pct(totals, 95) if totals else None
    m.avg_quality    = round(sum(qualities) / max(len(qualities), 1), 3) if qualities else 0.0

    # ── Composite score (0–100) ──
    # 40% success rate, 30% quality, 20% speed (inverse latency), 10% cost efficiency
    speed_score = 0.0
    if m.latency_p50_ms and m.latency_p50_ms > 0:
        # 500ms = 100pts, 10000ms = 0pts, log scale
        speed_score = max(0.0, min(1.0, 1.0 - (math.log10(m.latency_p50_ms) - math.log10(500)) / (math.log10(10000) - math.log10(500))))

    cost_score = 0.0
    total_cost_per_1k = m.cost_per_1k_in + m.cost_per_1k_out
    if total_cost_per_1k == 0:
        cost_score = 1.0
    elif total_cost_per_1k <= 0.001:
        cost_score = 1.0
    elif total_cost_per_1k <= 0.01:
        cost_score = 0.8
    elif total_cost_per_1k <= 0.1:
        cost_score = 0.5
    else:
        cost_score = 0.2

    m.score = round(
        (m.success_rate * 40) +
        (m.avg_quality  * 30) +
        (speed_score    * 20) +
        (cost_score     * 10),
        2
    )

    if m.success_rate >= 0.8 and m.avg_quality >= 0.5:
        m.verdict = "pass"
    elif m.success_rate >= 0.4:
        m.verdict = "degraded"
    else:
        m.verdict = "fail"
        errors = [r.error for r in runs if r.error]
        m.fail_reason = errors[0][:100] if errors else "no successful responses"

    return m

# ── Reporter ──────────────────────────────────────────────────────────────────

TIER_ORDER = {"micro": 0, "flash": 1, "standard": 2, "power": 3, "reasoning": 4}
VERDICT_ICON = {"pass": "✅", "degraded": "⚠️ ", "fail": "❌"}

def print_report(metrics: list[ModelMetrics], elapsed_sec: float) -> None:
    passed   = [m for m in metrics if m.verdict == "pass"]
    degraded = [m for m in metrics if m.verdict == "degraded"]
    failed   = [m for m in metrics if m.verdict == "fail"]

    print(f"\n{'═'*90}")
    print(f"  IAM Model Lineup Eval  —  {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
    print(f"  {len(metrics)} models tested  |  {len(passed)} pass  {len(degraded)} degraded  {len(failed)} fail  |  {elapsed_sec:.1f}s")
    print(f"{'═'*90}\n")

    col = "{:<26} {:<10} {:<8} {:<7} {:<8} {:<8} {:<7} {:<7} {:<6}"
    print(col.format("MODEL", "TIER", "VERDICT", "SUCC%", "TTFT_p50", "LAT_p50", "QUAL", "SCORE", "TOOLS"))
    print("─" * 90)

    for m in sorted(metrics, key=lambda x: (-x.score, TIER_ORDER.get(x.tier, 99))):
        icon = VERDICT_ICON.get(m.verdict, "?")
        ttft = f"{m.ttft_p50_ms:.0f}ms" if m.ttft_p50_ms else "—"
        lat  = f"{m.latency_p50_ms:.0f}ms" if m.latency_p50_ms else "—"
        print(col.format(
            m.model_key[:26],
            m.tier[:10],
            f"{icon}{m.verdict[:7]}",
            f"{m.success_rate*100:.0f}%",
            ttft, lat,
            f"{m.avg_quality:.2f}",
            f"{m.score:.1f}",
            "y" if m.supports_tools else "n",
        ))
        if m.fail_reason:
            print(f"    ↳ {m.fail_reason[:80]}")

    print(f"\n{'─'*90}")
    print(f"  V1 LINEUP  ({len(passed)} models)\n")
    for m in sorted(passed, key=lambda x: TIER_ORDER.get(x.tier, 99)):
        cost_str = f"${m.cost_per_1k_in:.4f}/${m.cost_per_1k_out:.4f} per 1k"
        ctx = f"{m.context_window//1000}k ctx"
        print(f"  {m.tier:<10}  {m.model_key:<28}  {cost_str}  {ctx}")
    print()

def write_outputs(metrics: list[ModelMetrics]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")

    # Full JSON report
    report_path = OUTPUT_DIR / f"model_lineup_eval_{ts}.json"
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "chat_url": CHAT_URL,
        "mode": MODE,
        "runs_per_prompt": RUNS,
        "models": [asdict(m) for m in metrics],
        "v1_lineup": [
            {
                "model_key": m.model_key,
                "tier": m.tier,
                "provider": m.provider,
                "score": m.score,
                "success_rate": m.success_rate,
                "ttft_p50_ms": m.ttft_p50_ms,
                "latency_p50_ms": m.latency_p50_ms,
                "avg_quality": m.avg_quality,
                "cost_per_1k_in": m.cost_per_1k_in,
                "cost_per_1k_out": m.cost_per_1k_out,
                "supports_tools": m.supports_tools,
                "supports_vision": m.supports_vision,
                "supports_reasoning": m.supports_reasoning,
                "context_window": m.context_window,
            }
            for m in sorted(metrics, key=lambda x: (-x.score, TIER_ORDER.get(x.tier, 99)))
            if m.verdict == "pass"
        ],
    }
    report_path.write_text(json.dumps(report, indent=2))

    # D1-ready UPDATE statements for catalog metrics
    sql_path = OUTPUT_DIR / f"model_lineup_catalog_update_{ts}.sql"
    lines = [
        "-- Generated by eval_model_lineup_v1.py",
        f"-- Run at {report['generated_at']}",
        "",
    ]
    for m in metrics:
        degraded = 1 if m.verdict == "fail" else 0
        reason   = m.fail_reason.replace("'", "''") if m.fail_reason else ""
        lines.append(
            f"UPDATE agentsam_model_catalog SET "
            f"avg_latency_p50_ms = {int(m.latency_p50_ms) if m.latency_p50_ms else 'NULL'}, "
            f"avg_latency_p95_ms = {int(m.latency_p95_ms) if m.latency_p95_ms else 'NULL'}, "
            f"quality_score = {m.avg_quality}, "
            f"is_degraded = {degraded}, "
            f"degraded_reason = {repr(reason) if reason else 'NULL'}, "
            f"updated_at = unixepoch() "
            f"WHERE model_key = '{m.model_key}';"
        )
    sql_path.write_text("\n".join(lines))

    print(f"  Report : {report_path}")
    print(f"  SQL    : {sql_path}")
    print(f"  Apply  : npx wrangler d1 execute {D1_DB} --remote --file={sql_path}\n")

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    t_start = time.perf_counter()
    cookie  = load_cookie()

    print(f"\nIAM Model Lineup Eval")
    print(f"  CHAT_URL={CHAT_URL}  mode={MODE}  timeout={TIMEOUT_SEC}s  workers={WORKERS}  runs/prompt={RUNS}")

    # 1. Fetch models
    print("\n  Fetching active models from D1...", end=" ", flush=True)
    model_rows = fetch_active_models()
    if not model_rows:
        print("FAIL — no models returned from D1. Check D1_DB / wrangler auth.")
        sys.exit(1)
    print(f"{len(model_rows)} models")
    for r in model_rows:
        print(f"    {r['model_key']:<30} tier={r.get('tier','?'):<10} provider={r.get('provider','?')}")

    # 2. Build task list
    tasks: list[tuple[str, int, str, str, int, list[str], str]] = []
    for row in model_rows:
        mk = row["model_key"]
        for slug, prompt, min_c, keywords in TEST_PROMPTS:
            for run_i in range(RUNS):
                tasks.append((mk, run_i, slug, prompt, min_c, keywords, cookie))

    total_tasks = len(tasks)
    print(f"\n  Running {total_tasks} calls ({len(model_rows)} models × {len(TEST_PROMPTS)} prompts × {RUNS} runs)  [{WORKERS} parallel]\n")

    # 3. Execute in parallel
    all_runs: dict[str, list[RunResult]] = {r["model_key"]: [] for r in model_rows}
    completed = 0

    def run_task(task):
        mk, run_i, slug, prompt, min_c, keywords, ck = task
        return eval_model_prompt(mk, slug, prompt, min_c, keywords, ck, run_i)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(run_task, t): t for t in tasks}
        for fut in as_completed(futures):
            completed += 1
            r = fut.result()
            all_runs[r.model_key].append(r)
            status = "ok" if r.ok else "FAIL"
            ttft   = f"{r.ttft_ms:.0f}ms" if r.ttft_ms else "—"
            total  = f"{r.total_ms:.0f}ms" if r.total_ms else "—"
            print(
                f"  [{completed:>3}/{total_tasks}]  {r.model_key:<28}  {r.prompt_slug:<10}"
                f"  {status:<5}  ttft={ttft:<8}  total={total:<8}  q={r.quality:.2f}"
                f"  {r.output_chars}ch"
                + (f"  ← {r.error[:60]}" if r.error and not r.ok else "")
            )

    # 4. Aggregate + report
    metrics = [aggregate(row, all_runs[row["model_key"]]) for row in model_rows]
    elapsed = time.perf_counter() - t_start

    print_report(metrics, elapsed)
    write_outputs(metrics)


if __name__ == "__main__":
    main()
