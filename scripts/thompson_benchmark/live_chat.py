#!/usr/bin/env python3
"""Production /api/agent/chat — real provider calls, real token metrics in D1."""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]

# routing_arms (task_type, mode) → API chat mode
ARM_TO_API_MODE: Dict[Tuple[str, str], str] = {
    ("chat", "ask"): "ask",
    ("chat", "agent"): "agent",
    ("plan", "agent"): "plan",
    ("plan", "plan"): "plan",
    ("debug", "agent"): "debug",
    ("debug", "debug"): "debug",
    ("multitask", "agent"): "multitask",
    ("multitask", "multitask"): "multitask",
    ("code", "agent"): "agent",
    ("routing", "agent"): "agent",
    ("tool_use", "agent"): "agent",
}


def api_mode_for_arm(task_type: str, arm_mode: str) -> str:
    key = (task_type or "chat", arm_mode or "agent")
    if key in ARM_TO_API_MODE:
        return ARM_TO_API_MODE[key]
    if arm_mode in ("ask", "agent", "plan", "debug", "multitask", "auto"):
        return arm_mode
    return "agent"


def parse_sse_payloads(raw_sse: str) -> Tuple[List[str], bool, bool, Dict[str, Any]]:
    text_parts: List[str] = []
    saw_done = False
    stream_error = False
    done_meta: Dict[str, Any] = {}

    for line in raw_sse.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        chunk = line[5:].strip()
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
            stream_error = True
            text_parts.append(str(evt.get("error") or evt.get("message") or "")[:500])
        elif t == "done":
            saw_done = True
            done_meta = evt
            if evt.get("stream_failed") or evt.get("fatal"):
                stream_error = True
        elif t == "context" and evt.get("agent_run_id"):
            done_meta.setdefault("agent_run_id", evt.get("agent_run_id"))

    return text_parts, saw_done, stream_error, done_meta


def post_chat_live(
    *,
    base_url: str,
    cookie: str,
    workspace_id: str,
    tenant_id: str,
    user_id: str,
    model_key: str,
    task_type: str,
    arm_mode: str,
    prompt: str,
    timeout_sec: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Live chat turn: pinned model, real tokens, Worker writes agent_run + usage + ETO.
    """
    if timeout_sec is None:
        timeout_sec = int(os.environ.get("IAM_CHAT_TIMEOUT_SEC", "180"))
    api_mode = api_mode_for_arm(task_type, arm_mode)
    chat_url = f"{base_url.rstrip('/')}/api/agent/chat"

    payload = {
        "message": prompt,
        "messages": [{"role": "user", "content": prompt}],
        "mode": api_mode,
        "requestedMode": api_mode,
        "model": model_key,
        "task_type": task_type,
        "taskType": task_type,
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "stream": True,
        "apply_eto_after_run": True,
        "quickstart_batch": "thompson_live_matrix",
        "max_tokens": int(os.environ.get("THOMPSON_BENCH_MAX_TOKENS", "64")),
    }

    cmd: List[str] = [
        "curl",
        "-sS",
        "-i",
        "--max-time",
        str(timeout_sec),
        "-X",
        "POST",
        chat_url,
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: text/event-stream",
        "-H",
        f"Cookie: {cookie}",
        "-H",
        f"x-iam-workspace-id: {workspace_id}",
        "-H",
        f"Origin: {base_url.rstrip('/')}",
        "-H",
        f"Referer: {base_url.rstrip('/')}/dashboard/agent",
        "-H",
        "User-Agent: thompson_benchmark/live_chat/1",
        "-d",
        json.dumps(payload),
    ]
    ingest = os.environ.get("INGEST_SECRET", "").strip()
    if ingest:
        cmd.extend(["-H", f"X-Ingest-Secret: {ingest}"])

    t0 = time.time()
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True)
    latency_ms = int((time.time() - t0) * 1000)
    raw = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")

    statuses = re.findall(r"HTTP/\S+\s+(\d+)", raw)
    http_status = int(statuses[-1]) if statuses else 0

    body_start = raw.find("\n\ndata:")
    if body_start == -1:
        body_start = raw.find("\r\n\r\ndata:")
    raw_sse = raw[body_start:].strip() if body_start != -1 else raw

    text_parts, saw_done, stream_error, done_meta = parse_sse_payloads(raw_sse)
    body = "".join(text_parts).strip()

    sse_in = int(done_meta.get("input_tokens") or 0)
    sse_out = int(done_meta.get("output_tokens") or 0)
    sse_cost = float(done_meta.get("cost_usd") or 0)
    agent_run_id = done_meta.get("agent_run_id")

    ok = (
        proc.returncode == 0
        and 200 <= http_status < 300
        and saw_done
        and not stream_error
        and bool(body)
    )
    err = None
    if not ok:
        err = (body or raw[-400:])[:800] if body or raw else f"curl_rc={proc.returncode} http={http_status}"
        if stream_error and body and saw_done:
            err = f"SSE stream_error after response: {err}"

    return {
        "ok": ok,
        "http_status": http_status,
        "latency_ms": latency_ms,
        "body": body,
        "error": err,
        "stream_error": stream_error,
        "saw_done": saw_done,
        "sse_input_tokens": sse_in,
        "sse_output_tokens": sse_out,
        "sse_cost_usd": sse_cost,
        "agent_run_id": agent_run_id,
        "api_mode": api_mode,
        "task_type": task_type,
        "arm_mode": arm_mode,
    }


def post_apply_eto(base_url: str, cookie: str) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/api/agent/routing/apply-eto"
    req = urllib.request.Request(
        url,
        data=b"{}",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Cookie": cookie,
            "User-Agent": "thompson_benchmark/live_chat/1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode(errors="replace")[:500], "code": e.code}
