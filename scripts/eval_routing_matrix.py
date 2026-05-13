#!/usr/bin/env python3
"""
Routing eval matrix: exercise chat modes against D1 `agentsam_routing_arms`, call production
`/api/agent/chat`, optionally score replies with local Ollama, persist summary rows to D1.

Prerequisites (same family as scripts/e2e_agentsam_eval_runner.py):
  - `npx wrangler` configured (IAM_D1_DB, IAM_WRANGLER_CONFIG, IAM_D1_REMOTE)
  - Auth to chat: `IAM_SESSION` / `~/.iam-session-cookie` and/or `INGEST_SECRET` as `X-Ingest-Secret`
  - Optional: Ollama at OLLAMA_URL (default http://127.0.0.1:11434) with OLLAMA_JUDGE_MODEL
  - IAM_CHAT_TIMEOUT_SEC (default 300) wall clock per chat request (--max-time for curl)
  - IAM_CHAT_HTTP_IMPL=curl (default) or urllib — curl matches e2e_agentsam_eval_runner and avoids urllib read quirks

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


def _consume_sse_line_payloads(raw_sse: str) -> tuple[list[str], bool, bool]:
    """Parse data: lines; return (text_parts, saw_done, got_stream_error)."""
    text_parts: list[str] = []
    saw_done = False
    got_stream_error = False
    for line in raw_sse.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        chunk = line[len("data:") :].strip()
        if not chunk or chunk == "[DONE]":
            continue
        try:
            evt = json.loads(chunk)
        except json.JSONDecodeError:
            continue
        if not isinstance(evt, dict):
            continue
        t = evt.get("type")
        if t == "text":
            text_parts.append(str(evt.get("text") or ""))
        elif t == "thinking":
            piece = str(evt.get("text") or "")
            if piece:
                text_parts.append(piece)
        elif t in ("error", "fatal"):
            got_stream_error = True
            text_parts.append(str(evt.get("error") or evt.get("message") or json.dumps(evt)[:500]))
        elif t in ("tool_output", "tool_result"):
            text_parts.append(str(evt.get("output") or evt.get("text") or "")[:4000])
        elif t == "done":
            saw_done = True
            if evt.get("stream_failed") or evt.get("fatal"):
                got_stream_error = True
    return text_parts, saw_done, got_stream_error


def post_chat(prompt: str, mode: str, timeout: int | None = None) -> dict[str, Any]:
    """POST /api/agent/chat (SSE). Default: curl full-buffer (reliable); set IAM_CHAT_HTTP_IMPL=urllib to opt out."""
    if timeout is None:
        timeout = int(os.getenv("IAM_CHAT_TIMEOUT_SEC", "300"))
    impl = os.getenv("IAM_CHAT_HTTP_IMPL", "curl").strip().lower()
    if impl == "urllib":
        return _post_chat_urllib(prompt, mode, timeout)
    return _post_chat_curl(prompt, mode, timeout)


def _post_chat_curl(prompt: str, mode: str, timeout: int) -> dict[str, Any]:
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
    cmd: list[str] = [
        "curl",
        "-i",
        "-sS",
        "--max-time",
        str(timeout),
        "-X",
        "POST",
        CHAT_URL,
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: text/event-stream",
        "-H",
        f"x-iam-workspace-id: {WORKSPACE_ID}",
        "-H",
        f"Origin: {BASE_URL}",
        "-H",
        f"Referer: {BASE_URL}/dashboard/agent",
        "-H",
        "User-Agent: inneranimalmedia-eval_routing_matrix/curl",
        "-d",
        json.dumps(payload),
    ]
    if cookie:
        cmd.extend(["-H", f"Cookie: {cookie}"])
    if ingest:
        cmd.extend(["-H", f"X-Ingest-Secret: {ingest}"])

    t0 = time.time()
    proc = subprocess.run(cmd, text=True, capture_output=True, cwd=str(REPO))
    latency_ms = int((time.time() - t0) * 1000)
    raw_all = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")

    statuses = re.findall(r"HTTP/\S+\s+(\d+)", raw_all)
    status = int(statuses[-1]) if statuses else 0

    body_start = raw_all.find("\n\ndata:")
    if body_start == -1:
        body_start = raw_all.find("\r\n\r\ndata:")
    raw_sse = raw_all[body_start:].strip() if body_start != -1 else raw_all

    text_parts, saw_done, got_stream_error = _consume_sse_line_payloads(raw_sse)
    body = "".join(text_parts).strip()

    curl_err = ""
    if proc.returncode == 28:
        curl_err = "curl_exit_28_timeout"
    elif proc.returncode != 0:
        curl_err = f"curl_exit_{proc.returncode}"

    ok = (
        200 <= status < 300
        and saw_done
        and not got_stream_error
        and bool(body)
        and proc.returncode == 0
    )
    err = None
    if not ok:
        err = body[:800] if body else (
            f"{curl_err or 'no_body'} http={status} saw_done={saw_done} stream_err={got_stream_error}"
        )
    return {
        "ok": ok,
        "status": status,
        "latency_ms": latency_ms,
        "body": body,
        "error": err,
        "saw_done": saw_done,
        "curl_rc": proc.returncode,
    }


def _post_chat_urllib(prompt: str, mode: str, timeout: int) -> dict[str, Any]:
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

    body_json = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(CHAT_URL, data=body_json, headers=dict(headers), method="POST")
    t0 = time.time()
    text_parts: list[str] = []
    status = 0
    saw_done = False
    got_stream_error = False

    def consume_event(evt: dict[str, Any]) -> None:
        nonlocal saw_done, got_stream_error
        t = evt.get("type")
        if t == "text":
            text_parts.append(str(evt.get("text") or ""))
        elif t == "thinking":
            piece = str(evt.get("text") or "")
            if piece:
                text_parts.append(piece)
        elif t in ("error", "fatal"):
            got_stream_error = True
            text_parts.append(str(evt.get("error") or evt.get("message") or json.dumps(evt)[:500]))
        elif t in ("tool_output", "tool_result"):
            text_parts.append(str(evt.get("output") or evt.get("text") or "")[:4000])
        elif t == "done":
            saw_done = True
            if evt.get("stream_failed") or evt.get("fatal"):
                got_stream_error = True

    def drain_buffer(buf: bytes) -> bytes:
        """Split on SSE blank line; return unfinished tail."""
        while True:
            sep, width = -1, 2
            i = buf.find(b"\n\n")
            if i != -1:
                sep, width = i, 2
            else:
                j = buf.find(b"\r\n\r\n")
                if j != -1:
                    sep, width = j, 4
            if sep == -1:
                return buf
            frame = buf[:sep].decode("utf-8", errors="ignore")
            buf = buf[sep + width :]
            data_lines: list[str] = []
            for raw in frame.splitlines():
                line = raw.strip()
                if line.startswith("data:"):
                    data_lines.append(line[5:].lstrip())
            if not data_lines:
                continue
            raw_payload = "\n".join(data_lines).strip()
            if not raw_payload or raw_payload == "[DONE]":
                continue
            try:
                evt = json.loads(raw_payload)
            except json.JSONDecodeError:
                continue
            if isinstance(evt, dict):
                consume_event(evt)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status = getattr(r, "status", 200) or 200
            buf = b""
            while True:
                chunk = r.read(8192)
                if not chunk:
                    break
                buf += chunk
                buf = drain_buffer(buf)
    except urllib.error.HTTPError as e:
        status = e.code
        text_parts.append(e.read().decode("utf-8", errors="ignore")[:2000])
        got_stream_error = True
    except Exception as e:
        return {
            "ok": False,
            "status": 0,
            "latency_ms": int((time.time() - t0) * 1000),
            "body": "",
            "error": str(e),
            "saw_done": saw_done,
        }

    latency_ms = int((time.time() - t0) * 1000)
    body = "".join(text_parts).strip()
    ok = (
        200 <= status < 300
        and saw_done
        and not got_stream_error
        and bool(body)
    )
    err = None if ok else (body[:800] if body else f"incomplete_sse saw_done={saw_done} err={got_stream_error}")
    return {
        "ok": ok,
        "status": status,
        "latency_ms": latency_ms,
        "body": body,
        "error": err,
        "saw_done": saw_done,
        "curl_rc": None,
    }


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
    _to = int(os.getenv("IAM_CHAT_TIMEOUT_SEC", "300"))
    _impl = os.getenv("IAM_CHAT_HTTP_IMPL", "curl").strip().lower()
    print(f"SSE client={_impl}  IAM_CHAT_TIMEOUT_SEC={_to}")

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
                fail_hint = ""
                if not chat.get("ok"):
                    fail_hint = f" | done={chat.get('saw_done')} {(chat.get('error') or '')[:100]!r}"
                print(
                    f"  {mk[:28]:<28} | {mode:<10} | {lat:>5}ms | {flag}{fail_hint} | q={qv} | "
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
