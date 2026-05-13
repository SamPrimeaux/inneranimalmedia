#!/usr/bin/env python3
"""
Routing eval matrix: exercise chat modes against D1 `agentsam_routing_arms`, call production
`/api/agent/chat`, optionally score replies with local Ollama, persist summary rows to D1.

Prerequisites (same family as scripts/e2e_agentsam_eval_runner.py):
  - `npx wrangler` configured (IAM_D1_DB, IAM_WRANGLER_CONFIG, IAM_D1_REMOTE)
  - Auth to chat: `IAM_SESSION` / `~/.iam-session-cookie` and/or `INGEST_SECRET` as `X-Ingest-Secret`
  - Optional: Ollama at OLLAMA_URL (default http://127.0.0.1:11434) with OLLAMA_JUDGE_MODEL

Run from repo root after deploy + migration 337:
  python3 scripts/eval_routing_matrix.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]

DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
REMOTE = os.getenv("IAM_D1_REMOTE", "1") != "0"
BASE_URL = os.getenv("IAM_BASE_URL", "https://inneranimalmedia.com").rstrip("/")
CHAT_URL = f"{BASE_URL}/api/agent/chat"
TENANT_ID = os.getenv("IAM_TENANT_ID", "tenant_sam_primeaux")
WORKSPACE_ID = os.getenv("IAM_WORKSPACE_ID", "ws_inneranimalmedia")
USER_ID = os.getenv("IAM_USER_ID", "sam")
SESSION_ID = os.getenv("IAM_ROUTING_EVAL_SESSION", f"routing_eval_{int(time.time())}")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_JUDGE_MODEL = os.getenv("OLLAMA_JUDGE_MODEL", "qwen2.5-coder:7b")
SUITE_ID = os.getenv("IAM_ROUTING_EVAL_SUITE_ID", "evs_eval_routing_matrix")


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def q(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def extract_json_payload(out: str) -> Any:
    text = (out or "").strip()
    if not text:
        return []
    starts = [i for i in [text.find("["), text.find("{")] if i != -1]
    if starts:
        text = text[min(starts) :]
    return json.loads(text)


def run_d1(sql: str) -> list[dict[str, Any]]:
    cmd = ["npx", "wrangler", "d1", "execute", DB, "--json"]
    if REMOTE:
        cmd.append("--remote")
    cmd += ["-c", str(REPO / WRANGLER_CONFIG), "--command", sql]
    proc = subprocess.run(cmd, text=True, capture_output=True, cwd=str(REPO))
    if proc.returncode != 0:
        print("D1 failed:", " ".join(cmd), file=sys.stderr)
        print(proc.stdout, proc.stderr, sep="\n", file=sys.stderr)
        raise SystemExit(proc.returncode)
    payload = extract_json_payload(proc.stdout)
    if isinstance(payload, list) and payload:
        return payload[0].get("results", []) or []
    if isinstance(payload, dict):
        return payload.get("results", []) or []
    return []


def load_cookie() -> str:
    raw = os.getenv("IAM_SESSION", "").strip()
    if not raw:
        p = Path.home() / ".iam-session-cookie"
        if p.is_file():
            raw = p.read_text(encoding="utf-8").strip()
    if not raw:
        return ""
    return raw if raw.startswith("session=") else f"session={raw}"


def post_chat(prompt: str, mode: str, timeout: int = 120) -> dict[str, Any]:
    cookie = load_cookie()
    ingest = os.getenv("INGEST_SECRET", "").strip()
    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "message": prompt,
        "mode": mode,
        "requestedMode": mode,
        "workspace_id": WORKSPACE_ID,
        "tenant_id": TENANT_ID,
        "user_id": USER_ID,
        "stream": True,
    }
    headers = [
        ("Content-Type", "application/json"),
        ("Accept", "text/event-stream"),
        ("x-iam-workspace-id", WORKSPACE_ID),
        ("Origin", BASE_URL),
        ("Referer", f"{BASE_URL}/dashboard/agent"),
        ("User-Agent", "inneranimalmedia-eval_routing_matrix/1"),
    ]
    if cookie:
        headers.append(("Cookie", cookie))
    if ingest:
        headers.append(("X-Ingest-Secret", ingest))

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(CHAT_URL, data=body, headers=dict(headers), method="POST")
    t0 = time.time()
    text_parts: list[str] = []
    status = 0
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status = getattr(r, "status", 200) or 200
            for raw_line in r:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if not chunk or chunk == "[DONE]":
                    continue
                try:
                    evt = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                if evt.get("type") == "text":
                    text_parts.append(str(evt.get("text") or ""))
                elif evt.get("type") in ("error", "fatal"):
                    text_parts.append(str(evt.get("error") or evt.get("message") or ""))
    except urllib.error.HTTPError as e:
        status = e.code
        text_parts.append(e.read().decode("utf-8", errors="ignore")[:2000])
    except Exception as e:
        return {"ok": False, "status": 0, "latency_ms": int((time.time() - t0) * 1000), "body": "", "error": str(e)}

    latency_ms = int((time.time() - t0) * 1000)
    body = "".join(text_parts).strip()
    ok = 200 <= status < 300 and bool(body)
    return {"ok": ok, "status": status, "latency_ms": latency_ms, "body": body, "error": None if ok else body[:800]}


def ollama_score(prompt: str, response: str) -> tuple[int, str]:
    if not response.strip():
        return 0, "empty_response"
    judge_prompt = f"""Rate this AI response quality from 1-5.
1=useless, 2=poor, 3=acceptable, 4=good, 5=excellent.
Reply with ONLY a single digit 1-5.

User prompt: {prompt[:200]}
AI response: {response[:400]}

Score:"""
    payload = json.dumps(
        {
            "model": OLLAMA_JUDGE_MODEL,
            "prompt": judge_prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 4},
        }
    ).encode()
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            txt = json.loads(r.read().decode())["response"].strip()
        for c in txt:
            if c.isdigit() and "1" <= c <= "5":
                return int(c), OLLAMA_JUDGE_MODEL
    except Exception as e:
        return 0, f"ollama_error:{e}"
    return 0, "ollama_no_digit"


def ensure_eval_suite() -> None:
    sql = f"""INSERT OR IGNORE INTO agentsam_eval_suites
      (id, tenant_id, name, description, provider, mode, task_type, created_by)
      VALUES (
        {q(SUITE_ID)},
        {q(TENANT_ID)},
        'Routing eval matrix',
        'scripts/eval_routing_matrix.py — mode × arm smoke + optional Ollama judge',
        NULL,
        'agent',
        'routing_matrix',
        'eval_routing_matrix.py'
      );"""
    run_d1(sql)


MODE_PROMPTS: dict[str, list[str]] = {
    "ask": [
        "What tables store agent execution data in this platform?",
        "Explain Thompson sampling for model routing in one paragraph.",
        "What is Cloudflare D1 used for in Workers?",
    ],
    "agent": [
        "List my active plans or say there are none; use read-only tools if available.",
        "Summarize what agentsam_routing_arms stores and why it matters.",
        "What does agentsam_usage_events track?",
    ],
    "plan": [
        "Create a short plan to improve dashboard analytics with real telemetry.",
        "Plan a migration to normalize timestamp columns; keep it brief.",
    ],
    "debug": [
        "Debug hypothetically: if usage events stopped writing, what would you check first?",
        "Why might token counts be zero on an agent run? List likely causes.",
    ],
    "multitask": [
        "Orchestrate a read-only audit outline of D1 operational tables and how you would report findings.",
        "Describe an end-to-end sequence to validate routing arms after a deploy without mutating prod data.",
    ],
}

# API `mode` -> (agentsam_routing_arms.task_type, agentsam_routing_arms.mode)
MODE_TO_ARM_QUERY: dict[str, tuple[str, str]] = {
    "ask": ("chat", "ask"),
    "agent": ("chat", "agent"),
    "plan": ("plan", "agent"),
    "debug": ("debug", "agent"),
    "multitask": ("multitask", "agent"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Routing matrix eval (chat × arms).")
    parser.add_argument("--dry-run", action="store_true", help="List arms and prompts only; no HTTP or D1 writes.")
    parser.add_argument("--skip-ollama", action="store_true", help="Do not call local Ollama for scoring.")
    args = parser.parse_args()

    load_env_file(REPO / ".env.agentsam.local")

    now = datetime.now(timezone.utc)
    print(f"Routing eval matrix — {now.isoformat()}\n")
    print(f"CHAT_URL={CHAT_URL} D1={DB} remote={REMOTE}")

    if not args.dry_run:
        if not load_cookie() and not os.getenv("INGEST_SECRET", "").strip():
            print(
                "Warning: no IAM_SESSION / ~/.iam-session-cookie and no INGEST_SECRET; "
                "chat requests may return 401.",
                file=sys.stderr,
            )
        ensure_eval_suite()

    results: list[dict[str, Any]] = []

    for mode, prompts in MODE_PROMPTS.items():
        tt, arm_mode = MODE_TO_ARM_QUERY[mode]
        arms = run_d1(
            f"""SELECT id, model_key, provider, decayed_score, total_executions
                FROM agentsam_routing_arms
                WHERE task_type = {q(tt)} AND mode = {q(arm_mode)}
                  AND is_active = 1 AND is_eligible = 1
                ORDER BY decayed_score DESC LIMIT 3;"""
        )

        if not arms:
            print(f"[{mode}] No eligible arms for task_type={tt} mode={arm_mode} — skipping")
            continue

        print(f"[{mode}] {len(arms)} arms × {len(prompts)} prompts")

        if args.dry_run:
            for a in arms:
                print(f"  would test arm {a.get('id')} model={a.get('model_key')}")
            continue

        for arm in arms:
            mk = str(arm.get("model_key") or "")
            scores: list[int] = []
            latencies: list[int] = []
            oks: list[bool] = []

            for prompt in prompts:
                chat = post_chat(prompt, mode=mode)
                lat = chat["latency_ms"]
                latencies.append(lat)
                oks.append(bool(chat.get("ok")))
                if args.skip_ollama:
                    qv = 0
                    grader = "skipped"
                else:
                    qv, grader = ollama_score(prompt, chat.get("body") or "")
                scores.append(qv)
                flag = "ok" if chat.get("ok") else "fail"
                print(
                    f"  {mk[:28]:<28} | {mode:<10} | {lat:>5}ms | {flag} | q={qv} | "
                    f"{len(chat.get('body') or ''):>4} chars"
                )

                time.sleep(0.4)

            avg_q = round(sum(scores) / len(scores), 2) if scores else 0.0
            avg_lat = round(sum(latencies) / len(latencies)) if latencies else 0
            run_id = f"evr_routing_{int(time.time() * 1000)}_{re.sub(r'[^a-zA-Z0-9_]+', '_', mk)[:24]}"
            notes_obj = {
                "arm_id": arm.get("id"),
                "mode": mode,
                "task_type": tt,
                "prompts": prompts,
                "scores": scores,
                "chat_ok": oks,
                "grader": OLLAMA_JUDGE_MODEL if not args.skip_ollama else "skipped",
            }
            notes = json.dumps(notes_obj, ensure_ascii=False)[:6000]
            out_txt = f"routing_matrix {mode} arm={arm.get('id')} model={mk} avg_q={avg_q}"
            passed = 1 if (avg_q >= 2.5 and all(oks)) else 0

            sql_ins = f"""INSERT INTO agentsam_eval_runs (
              id, suite_id, case_id, tenant_id, model_key, provider,
              latency_ms, score_overall, passed, output_text, grader_notes, grader_model
            ) VALUES (
              {q(run_id)},
              {q(SUITE_ID)},
              NULL,
              {q(TENANT_ID)},
              {q(mk)},
              {q(str(arm.get('provider') or 'unknown'))},
              {avg_lat},
              {avg_q / 5.0},
              {passed},
              {q(out_txt)},
              {q(notes)},
              {q(OLLAMA_JUDGE_MODEL if not args.skip_ollama else 'skipped')}
            );"""
            try:
                run_d1(sql_ins)
            except SystemExit:
                print("  (eval run insert failed — check agentsam_eval_runs schema)", file=sys.stderr)

            run_d1(
                f"""UPDATE agentsam_eval_suites SET
                  run_count = COALESCE(run_count, 0) + 1,
                  last_run_at = datetime('now'),
                  updated_at = datetime('now')
                WHERE id = {q(SUITE_ID)};"""
            )

            time.sleep(1)
            usage = run_d1(
                f"""SELECT AVG(tokens_in) AS avg_in, AVG(tokens_out) AS avg_out, AVG(cost_usd) AS avg_cost
                    FROM agentsam_usage_events
                    WHERE model_key = {q(mk)} AND created_at > (unixepoch() - 180);"""
            )
            row0 = usage[0] if usage else {}
            avg_in = int(round(float(row0.get("avg_in") or 0)))
            avg_out = int(round(float(row0.get("avg_out") or 0)))
            avg_cost = round(float(row0.get("avg_cost") or 0), 6)

            results.append(
                {
                    "mode": mode,
                    "task_type": tt,
                    "arm_id": arm.get("id"),
                    "model_key": mk,
                    "provider": arm.get("provider"),
                    "avg_quality": avg_q,
                    "avg_latency_ms": avg_lat,
                    "avg_tokens_in": avg_in,
                    "avg_tokens_out": avg_out,
                    "avg_cost_usd": avg_cost,
                    "decayed_score": arm.get("decayed_score"),
                }
            )

    out = REPO / "docs" / f"eval_routing_matrix_{now.strftime('%Y%m%dT%H%M%S')}.md"
    if results and not args.dry_run:
        lines = [
            "# Routing eval matrix",
            f"Generated: {now.isoformat()}",
            "",
            "| Mode | Model | Provider | Quality (/5) | Latency | Tokens in | Cost |",
            "|------|-------|----------|--------------|---------|-----------|------|",
        ]
        for r in sorted(results, key=lambda x: (x["mode"], -x["avg_quality"])):
            lines.append(
                f"| {r['mode']} | `{r['model_key']}` | {r['provider']} | {r['avg_quality']} | "
                f"{r['avg_latency_ms']}ms | {r['avg_tokens_in']} | ${r['avg_cost_usd']:.6f} |"
            )
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\nReport: {out.relative_to(REPO)}")

    if args.dry_run:
        print("\nDry run complete.")


if __name__ == "__main__":
    main()
