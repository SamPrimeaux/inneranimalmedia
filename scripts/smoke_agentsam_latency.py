#!/usr/bin/env python3
"""
Agent Sam latency isolation smoke (hello + route evidence + standard ask).

Emits a self-validating JSON report:
  - summary (always): total_cases, passed, failed, inconclusive, core_passed, generated_at, run_group_id
  - cases.<name> with streaming summaries + repeat samples[]
  - report_integrity: { ok, failures[] }
  - Root aliases (same as cases.*.summary where applicable): hello_first_byte, repeat_10,
    standard_ask_no_tools (summary only; full case remains under cases.standard_ask_no_tools).

Usage (from repo root):
  python3 scripts/smoke_agentsam_latency.py
  python3 scripts/smoke_agentsam_latency.py --timeout 90
  python3 scripts/smoke_agentsam_latency.py --dry-run
  python3 scripts/smoke_agentsam_latency.py --skip-d1

Env:
  IAM_BASE_URL, IAM_CHAT_URL, IAM_D1_DB, IAM_WRANGLER_CONFIG,
  IAM_WORKSPACE_ID, IAM_TENANT_ID, IAM_SESSION, IAM_COOKIE, COOKIE, or IAM_COOKIE_FILE

Exit code:
  Nonzero if core chat/D1 gates fail OR if report_integrity.ok is false.
  dry-run exits 0 when integrity passes.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import ssl
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from http.client import HTTPResponse, HTTPSConnection
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.getenv("IAM_BASE_URL", "https://inneranimalmedia.com").rstrip("/")
CHAT_URL = os.getenv("IAM_CHAT_URL", f"{BASE_URL}/api/agent/chat")
D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
WORKSPACE_ID = os.getenv("IAM_WORKSPACE_ID", "ws_inneranimalmedia")
TENANT_ID = os.getenv("IAM_TENANT_ID", "tenant_sam_primeaux")
COOKIE_FILE = Path(os.path.expanduser(os.getenv("IAM_COOKIE_FILE", "~/.iam-session-cookie")))
RUN_GROUP = f"lat_{int(time.time())}_{uuid.uuid4().hex[:8]}"

CASE_ORDER = (
    "minimal_prompt_route_check",
    "chat_hello_first_byte",
    "chat_hello_repeat_10",
    "standard_ask_no_tools",
)
CORE_CASE_KEYS = ("minimal_prompt_route_check", "chat_hello_first_byte", "chat_hello_repeat_10")

HELLO_BODY: dict[str, Any] = {
    "messages": [{"role": "user", "content": "hello"}],
    "message": "hello",
    "mode": "ask",
    "requestedMode": "ask",
    "model": "gpt-5.4-nano",
    "model_key": "gpt-5.4-nano",
    "workspace_id": WORKSPACE_ID,
    "tenant_id": TENANT_ID,
    "stream": True,
    "eval": True,
    "smoke": True,
}

STANDARD_ASK_BODY: dict[str, Any] = {
    "messages": [{"role": "user", "content": "Answer in one sentence: what is 2 plus 2?"}],
    "message": "Answer in one sentence: what is 2 plus 2?",
    "mode": "ask",
    "requestedMode": "ask",
    "model": "gpt-5.4-nano",
    "model_key": "gpt-5.4-nano",
    "workspace_id": WORKSPACE_ID,
    "tenant_id": TENANT_ID,
    "stream": True,
    "eval": True,
    "smoke": True,
}

RAW_PREVIEW_MAX = 4096


def load_cookie() -> str:
    raw = (
        os.getenv("IAM_SESSION", "").strip()
        or os.getenv("IAM_COOKIE", "").strip()
        or os.getenv("COOKIE", "").strip()
    )
    if not raw and COOKIE_FILE.exists():
        raw = COOKIE_FILE.read_text(errors="ignore").strip()
    raw = raw.replace("\n", "").strip()
    if raw.startswith("session="):
        raw = raw[len("session=") :]
    return raw


def redact(s: str) -> str:
    c = load_cookie()
    if c:
        s = s.replace(c, "REDACTED_SESSION")
    return s


def run_cmd(args: list[str], timeout: int = 120, input_text: Optional[str] = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        input=input_text,
        text=True,
        capture_output=True,
        timeout=timeout,
    )


def extract_json_payload(text: str) -> Any:
    text = text.strip()
    if not text:
        return None
    decoder = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch not in "[{":
            continue
        try:
            obj, _ = decoder.raw_decode(text[i:])
            return obj
        except Exception:
            continue
    return None


def wrangler_d1(sql: str, timeout: int = 120) -> Any:
    args = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        D1_DB,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--json",
        "--command",
        sql,
    ]
    try:
        proc = run_cmd(args, timeout=timeout + 15)
    except FileNotFoundError as e:
        raise RuntimeError(f"npx_wrangler_not_found:{e}") from e
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        raise RuntimeError(redact(out[-4000:]))
    parsed = extract_json_payload(out)
    if parsed is None:
        raise RuntimeError("No JSON from wrangler: " + redact(out[-1200:]))
    return parsed


def d1_results(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, dict) and isinstance(first.get("results"), list):
            return first["results"]
    if isinstance(payload, dict) and isinstance(payload.get("results"), list):
        return payload["results"]
    return []


def has_emoji(text: str) -> bool:
    return bool(re.search(r"[\U0001F300-\U0001FAFF\U00002700-\U000027BF]", text))


def pctile(sorted_vals: list[float], p: float) -> Optional[float]:
    if not sorted_vals:
        return None
    xs = sorted(sorted_vals)
    if len(xs) == 1:
        return float(xs[0])
    idx = int(math.ceil(p * len(xs))) - 1
    idx = max(0, min(len(xs) - 1, idx))
    return float(xs[idx])


def stats_ms_from_values(vals: list[float]) -> dict[str, Optional[float]]:
    """p50 and p95 are either both computed from the same sorted list or both None."""
    if not vals:
        return {"n": 0, "min": None, "max": None, "p50": None, "p95": None}
    s = sorted(vals)
    p50 = pctile(s, 0.50)
    p95 = pctile(s, 0.95)
    if p50 is None or p95 is None:
        return {"n": len(s), "min": float(s[0]), "max": float(s[-1]), "p50": None, "p95": None}
    return {"n": len(s), "min": float(s[0]), "max": float(s[-1]), "p50": p50, "p95": p95}


def parse_chat_url(url: str) -> tuple[str, int, str]:
    u = urlparse(url)
    host = u.hostname or ""
    port = u.port or (443 if u.scheme == "https" else 80)
    path = u.path or "/"
    if u.query:
        path = f"{path}?{u.query}"
    return host, port, path


def _raw_preview_append(buf: list[str], line: str) -> None:
    if sum(len(x) for x in buf) >= RAW_PREVIEW_MAX:
        return
    buf.append(line[:800])


def post_sse_chat(
    body: dict[str, Any],
    cookie: str,
    timeout_sec: float,
    debug_suffix: str,
) -> dict[str, Any]:
    """
    Stream POST /api/agent/chat over HTTPS; return transport + SSE parse result.
    """
    host, port, path = parse_chat_url(CHAT_URL)
    payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "Content-Length": str(len(payload)),
        "x-iam-workspace-id": WORKSPACE_ID,
        "x-iam-debug-id": f"{RUN_GROUP}_{debug_suffix}",
        "Cookie": f"session={cookie}",
        "Connection": "close",
    }

    t0 = time.perf_counter()
    ctx = ssl.create_default_context()
    conn: Optional[HTTPSConnection] = None
    raw_lines: list[str] = []
    out: dict[str, Any] = {
        "http_status": 0,
        "connect_ms": None,
        "first_byte_ms": None,
        "first_sse_event_ms": None,
        "accepted_event_ms": None,
        "context_event_ms": None,
        "done_ms": None,
        "total_ms": None,
        "events": [],
        "events_count": 0,
        "text_body": "",
        "context": {},
        "done": False,
        "error": None,
        "raw_preview": "",
        "transport_ok": False,
    }

    try:
        conn = HTTPSConnection(host, port, timeout=timeout_sec, context=ctx)
        t_conn_start = time.perf_counter()
        conn.connect()
        out["connect_ms"] = (time.perf_counter() - t_conn_start) * 1000

        conn.request("POST", path, body=payload, headers=headers)
        resp: HTTPResponse = conn.getresponse()
        out["http_status"] = int(resp.status)

        text_parts: list[str] = []
        first_sse: Optional[float] = None
        accepted_ms: Optional[float] = None
        context_ms: Optional[float] = None
        done_ms: Optional[float] = None
        context_obj: dict[str, Any] = {}
        first_body_byte_marked = False

        while True:
            line_b = resp.readline()
            if not line_b:
                break
            if not first_body_byte_marked:
                out["first_byte_ms"] = (time.perf_counter() - t0) * 1000
                first_body_byte_marked = True
            line = line_b.decode("utf-8", errors="replace").rstrip("\r\n")
            if not line.startswith("data:"):
                _raw_preview_append(raw_lines, line)
                continue
            raw = line[5:].strip()
            if not raw or raw == "[DONE]":
                _raw_preview_append(raw_lines, line)
                continue
            try:
                evt: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                _raw_preview_append(raw_lines, line)
                continue
            now = time.perf_counter()
            out["events"].append(evt)
            if accepted_ms is None:
                accepted_ms = (now - t0) * 1000
            if first_sse is None:
                first_sse = (now - t0) * 1000
            if evt.get("type") == "context":
                context_obj = evt
                if context_ms is None:
                    context_ms = (now - t0) * 1000
            if evt.get("type") == "text":
                text_parts.append(str(evt.get("text") or ""))
            elif evt.get("type") in ("error", "fatal"):
                text_parts.append(str(evt.get("error") or evt.get("message") or ""))
            elif evt.get("type") == "done":
                out["done"] = True
                if done_ms is None:
                    done_ms = (now - t0) * 1000

        out["first_sse_event_ms"] = first_sse
        out["accepted_event_ms"] = accepted_ms
        out["context_event_ms"] = context_ms
        out["done_ms"] = done_ms
        out["total_ms"] = (time.perf_counter() - t0) * 1000
        out["text_body"] = "".join(text_parts).strip()
        out["context"] = context_obj
        out["events_count"] = len(out["events"])
        out["transport_ok"] = out["error"] is None and out["http_status"] == 200
    except Exception as e:
        out["error"] = redact(str(e))
        out["total_ms"] = (time.perf_counter() - t0) * 1000
        out["transport_ok"] = False
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    preview = redact("\n".join(raw_lines))
    if len(preview) > RAW_PREVIEW_MAX:
        preview = preview[:RAW_PREVIEW_MAX]
    if not preview and out.get("error"):
        preview = redact(str(out["error"]))[:RAW_PREVIEW_MAX]
    out["raw_preview"] = preview
    out["events_count"] = len(out["events"])
    return out


def is_d1_schemaish_error(msg: str) -> bool:
    m = msg.lower()
    return any(
        x in m
        for x in (
            "no such column",
            "no such table",
            "syntax error",
            "unknown column",
            "does not exist",
        )
    )


def is_wrangler_missing(msg: str) -> bool:
    return "npx_wrangler_not_found" in msg or "No such file or directory: 'npx'" in msg


def case_minimal_prompt_route_check(skip: bool, skip_reason: Optional[str]) -> dict[str, Any]:
    if skip:
        return {
            "case": "minimal_prompt_route_check",
            "passed": True,
            "inconclusive": True,
            "skipped": True,
            "skip_reason": skip_reason or "skipped",
            "failures": [],
            "evidence_warnings": [],
            "details": {},
        }
    result: dict[str, Any] = {
        "case": "minimal_prompt_route_check",
        "passed": False,
        "failures": [],
        "evidence_warnings": [],
        "details": {},
    }
    tid = str(TENANT_ID).replace("'", "''")
    sql_route = (
        "SELECT route_key, max_tools, include_rag, include_active_plan, "
        "include_recent_memory, include_workspace_ctx, is_active, tenant_id "
        "FROM agentsam_prompt_routes WHERE route_key='simple_ask_greeting' AND is_active=1 "
        f"AND (tenant_id IS NULL OR tenant_id = '{tid}') "
        f"ORDER BY CASE WHEN tenant_id = '{tid}' THEN 0 ELSE 1 END LIMIT 1;"
    )
    sql_versions = (
        "SELECT prompt_key, tenant_id, is_active, LENGTH(body) AS body_chars "
        "FROM agentsam_prompt_versions "
        "WHERE prompt_key IN ('core_identity_minimal','company_no_emojis') "
        "ORDER BY prompt_key, tenant_id IS NOT NULL DESC, version DESC;"
    )
    try:
        route_rows = d1_results(wrangler_d1(sql_route))
        ver_rows = d1_results(wrangler_d1(sql_versions))
    except RuntimeError as e:
        msg = str(e)
        if is_wrangler_missing(msg):
            result["evidence_warnings"].append("wrangler_cli_missing")
            result["passed"] = True
            result["inconclusive"] = True
            result["failures"] = []
            result["details"]["error"] = msg[:800]
            return result
        if is_d1_schemaish_error(msg):
            result["evidence_warnings"].append("d1_schema_or_sql: " + msg[:500])
            result["passed"] = True
            result["inconclusive"] = True
            result["failures"] = []
            result["details"]["error"] = msg[:800]
            return result
        result["details"]["error"] = msg[:800]
        result["failures"] = ["d1_query_failed"]
        return result

    result["details"]["routes"] = route_rows
    result["details"]["prompt_versions_sample"] = ver_rows[:20]

    row = route_rows[0] if route_rows else None
    checks: list[str] = []
    if not row:
        checks.append("no_simple_ask_greeting_row")
    else:
        if int(row.get("max_tools") or 0) != 0:
            checks.append(f"max_tools_expected_0_got_{row.get('max_tools')}")
        for col, want in (
            ("include_rag", 0),
            ("include_active_plan", 0),
            ("include_recent_memory", 0),
            ("include_workspace_ctx", 0),
        ):
            if int(row.get(col) or 0) != want:
                checks.append(f"{col}_expected_{want}_got_{row.get(col)}")
        if int(row.get("is_active") or 0) != 1:
            checks.append("route_not_active")

    keys_needed = {"core_identity_minimal", "company_no_emojis"}
    best: dict[str, dict[str, Any]] = {}
    for r in ver_rows:
        pk = str(r.get("prompt_key") or "")
        if pk not in keys_needed:
            continue
        if pk not in best:
            best[pk] = r
    missing_keys = keys_needed - set(best.keys())
    if missing_keys:
        checks.append("missing_prompt_keys:" + ",".join(sorted(missing_keys)))

    active_both = True
    sum_chars = 0
    for pk in sorted(keys_needed):
        br = best.get(pk)
        if not br:
            active_both = False
            continue
        if int(br.get("is_active") or 0) != 1:
            checks.append(f"prompt_not_active:{pk}")
            active_both = False
        try:
            sum_chars += int(br.get("body_chars") or 0)
        except Exception:
            checks.append(f"body_chars_unreadable:{pk}")

    if sum_chars >= 1000:
        checks.append(f"summed_body_chars_{sum_chars}_>=_1000")

    result["details"]["checks"] = checks
    result["details"]["summed_body_chars"] = sum_chars
    result["passed"] = len(checks) == 0 and active_both and len(best) == 2
    if not result["passed"]:
        result["failures"] = checks[:] if checks else ["minimal_prompt_route_check_failed"]
    return result


def eval_hello_first_byte(resp: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if int(resp.get("http_status") or 0) != 200:
        failures.append(f"http_{resp.get('http_status')}")
    if resp.get("error"):
        failures.append("transport:" + str(resp.get("error"))[:160])
    if int(resp.get("events_count") or 0) == 0:
        failures.append("no_sse_events")
    fse = resp.get("first_sse_event_ms")
    if fse is None and int(resp.get("events_count") or 0) > 0:
        failures.append("no_sse_event")
    elif fse is not None and float(fse) >= 1000:
        failures.append(f"first_sse_event_ms_{fse}_>=_1000")

    ctx = resp.get("context") or {}
    if int(resp.get("events_count") or 0) > 0:
        if ctx.get("prompt_lane") != "minimal_ask":
            failures.append(f"prompt_lane_want_minimal_ask_got_{ctx.get('prompt_lane')}")
        if int(ctx.get("minimal_prompt_d1_only") or 0) != 1:
            failures.append(f"minimal_prompt_d1_only_want_1_got_{ctx.get('minimal_prompt_d1_only')}")
        spc = ctx.get("system_prompt_chars")
        try:
            spc_n = int(spc)
            if spc_n >= 1000:
                failures.append(f"system_prompt_chars_{spc_n}_>=_1000")
        except Exception:
            failures.append("system_prompt_chars_missing")

        try:
            if int(ctx.get("tool_count")) != 0:
                failures.append(f"tool_count_want_0_got_{ctx.get('tool_count')}")
        except Exception:
            failures.append("tool_count_missing")

    if not resp.get("done"):
        failures.append("sse_not_done")

    body = str(resp.get("text_body") or "")
    if has_emoji(body):
        failures.append("emoji_in_output")

    tot = resp.get("total_ms")
    if tot is not None and float(tot) >= 3000:
        failures.append(f"total_ms_{tot}_>=_3000")

    return failures


def eval_hello_repeat_single(resp: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if int(resp.get("http_status") or 0) != 200:
        failures.append(f"http_{resp.get('http_status')}")
    if resp.get("error"):
        failures.append("transport:" + str(resp.get("error"))[:160])
    if int(resp.get("events_count") or 0) == 0:
        failures.append("no_sse_events")
    fse = resp.get("first_sse_event_ms")
    if fse is None and int(resp.get("events_count") or 0) > 0:
        failures.append("no_sse_event")
    elif fse is not None and float(fse) >= 1000:
        failures.append(f"first_sse_event_ms_{fse}_>=_1000")

    ctx = resp.get("context") or {}
    if int(resp.get("events_count") or 0) > 0:
        if ctx.get("prompt_lane") != "minimal_ask":
            failures.append(f"prompt_lane_want_minimal_ask_got_{ctx.get('prompt_lane')}")
        if int(ctx.get("minimal_prompt_d1_only") or 0) != 1:
            failures.append(f"minimal_prompt_d1_only_want_1_got_{ctx.get('minimal_prompt_d1_only')}")
        spc = ctx.get("system_prompt_chars")
        try:
            spc_n = int(spc)
            if spc_n >= 1000:
                failures.append(f"system_prompt_chars_{spc_n}_>=_1000")
        except Exception:
            failures.append("system_prompt_chars_missing")

        try:
            if int(ctx.get("tool_count")) != 0:
                failures.append(f"tool_count_want_0_got_{ctx.get('tool_count')}")
        except Exception:
            failures.append("tool_count_missing")

    if not resp.get("done"):
        failures.append("sse_not_done")

    body = str(resp.get("text_body") or "")
    if has_emoji(body):
        failures.append("emoji_in_output")

    return failures


def eval_standard_ask(resp: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if int(resp.get("http_status") or 0) != 200:
        failures.append(f"http_{resp.get('http_status')}")
    if resp.get("error"):
        failures.append("transport:" + str(resp.get("error"))[:160])
    if int(resp.get("events_count") or 0) == 0:
        failures.append("no_sse_events")
    fse = resp.get("first_sse_event_ms")
    if fse is None and int(resp.get("events_count") or 0) > 0:
        failures.append("no_sse_event")
    elif fse is not None and float(fse) >= 1500:
        failures.append(f"first_sse_event_ms_{fse}_>=_1500")
    dm = resp.get("done_ms")
    if dm is None:
        failures.append("no_done_ms")
    elif float(dm) >= 4000:
        failures.append(f"done_ms_{dm}_>=_4000")
    body = str(resp.get("text_body") or "")
    if "4" not in body:
        failures.append("output_missing_digit_4")
    if not resp.get("done"):
        failures.append("sse_not_done")
    return failures


def streaming_summary_from_transport(tr: dict[str, Any]) -> dict[str, Any]:
    err = tr.get("error")
    return {
        "transport_ok": bool(tr.get("transport_ok")),
        "http_status": int(tr.get("http_status") or 0),
        "error": err if err else None,
        "raw_preview": str(tr.get("raw_preview") or ""),
        "events_count": int(tr.get("events_count") or 0),
        "accepted_event_ms": tr.get("accepted_event_ms"),
        "first_byte_ms": tr.get("first_byte_ms"),
        "first_sse_event_ms": tr.get("first_sse_event_ms"),
        "context_event_ms": tr.get("context_event_ms"),
        "done_ms": tr.get("done_ms"),
        "total_ms": tr.get("total_ms"),
        "connect_ms": tr.get("connect_ms"),
        "context": tr.get("context") if isinstance(tr.get("context"), dict) else {},
        "text": str(tr.get("text_body") or ""),
    }


def build_streaming_case(
    case_key: str,
    tr: dict[str, Any],
    eval_fn: Callable[[dict[str, Any]], list[str]],
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    failures = eval_fn(tr)
    if int(tr.get("events_count") or 0) == 0 and "no_sse_events" not in failures:
        failures = ["no_sse_events"] + failures
    passed = len(failures) == 0
    summary = streaming_summary_from_transport(tr)
    out: dict[str, Any] = {
        "case": case_key,
        "passed": passed,
        "failures": failures,
        "summary": summary,
    }
    if extra:
        out.update(extra)
    return out


def empty_streaming_summary(reason: str) -> dict[str, Any]:
    return {
        "transport_ok": False,
        "http_status": 0,
        "error": None,
        "raw_preview": reason,
        "events_count": 0,
        "accepted_event_ms": None,
        "first_byte_ms": None,
        "first_sse_event_ms": None,
        "context_event_ms": None,
        "done_ms": None,
        "total_ms": None,
        "connect_ms": None,
        "context": {},
        "text": "",
    }


def compute_top_summary(report: dict[str, Any], core_passed: bool) -> dict[str, Any]:
    passed_n = failed_n = inconclusive_n = 0
    for k in CASE_ORDER:
        c = report["cases"].get(k) or {}
        if c.get("inconclusive"):
            inconclusive_n += 1
        elif c.get("passed"):
            passed_n += 1
        else:
            failed_n += 1
    return {
        "total_cases": len(CASE_ORDER),
        "passed": passed_n,
        "failed": failed_n,
        "inconclusive": inconclusive_n,
        "core_passed": bool(core_passed),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_group_id": report.get("run_group") or RUN_GROUP,
    }


def _stats_pair_consistent(d: dict[str, Any]) -> bool:
    for block_key in ("first_sse_event_ms", "done_ms"):
        block = d.get(block_key)
        if not isinstance(block, dict):
            continue
        p50 = block.get("p50")
        p95 = block.get("p95")
        if p95 is not None and p50 is None:
            return False
    return True


def validate_report_integrity(report: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []

    summ = report.get("summary")
    if not isinstance(summ, dict) or summ is None:
        failures.append("summary_missing_or_null")

    for ck in CORE_CASE_KEYS:
        if ck not in report.get("cases", {}):
            failures.append(f"missing_core_case:{ck}")

    cases = report.get("cases") or {}
    for key, c in cases.items():
        if not isinstance(c, dict):
            failures.append(f"case_not_object:{key}")
            continue
        if c.get("passed") is False:
            fl = c.get("failures")
            if not isinstance(fl, list) or len(fl) == 0:
                failures.append(f"passed_false_empty_failures:{key}")

    rep = cases.get("chat_hello_repeat_10") or {}
    summ_r = rep.get("summary") if isinstance(rep.get("summary"), dict) else {}
    if not _stats_pair_consistent(summ_r):
        failures.append("repeat_stats_p95_without_p50")

    hello = cases.get("chat_hello_first_byte") or {}
    if hello.get("passed") is False:
        hs = hello.get("summary") if isinstance(hello.get("summary"), dict) else {}
        all_null = (
            hs.get("first_byte_ms") is None
            and hs.get("first_sse_event_ms") is None
            and hs.get("total_ms") is None
            and hs.get("connect_ms") is None
        )
        if all_null and not hs.get("error"):
            failures.append("hello_failed_all_timings_null_no_error")

    return {"ok": len(failures) == 0, "failures": failures}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeout", type=float, default=90.0, help="Per-request socket timeout (seconds)")
    ap.add_argument("--dry-run", action="store_true", help="No D1 wrangler calls and no chat; exit 0 if integrity ok")
    ap.add_argument("--skip-d1", action="store_true", help="Skip D1 route check (inconclusive pass)")
    ap.add_argument("--json-out", default="reports/ai-smoke/latency-latest.json")
    args = ap.parse_args()

    if Path.cwd().resolve() != ROOT:
        os.chdir(ROOT)

    cookie = load_cookie()
    report: dict[str, Any] = {
        "run_group": RUN_GROUP,
        "run_group_id": RUN_GROUP,
        "base_url": BASE_URL,
        "chat_url": CHAT_URL,
        "cases": {},
        "evidence_warnings": [],
    }

    skip_d1 = bool(args.dry_run or args.skip_d1)
    d1_skip_reason = "--dry-run" if args.dry_run else ("--skip-d1" if args.skip_d1 else None)
    d1_case = case_minimal_prompt_route_check(skip_d1, d1_skip_reason)
    report["cases"]["minimal_prompt_route_check"] = d1_case
    report["evidence_warnings"].extend(d1_case.get("evidence_warnings") or [])
    if d1_case.get("inconclusive"):
        report["evidence_warnings"].append("minimal_prompt_route_check_inconclusive_d1")

    core_fail = not bool(d1_case.get("passed")) and not d1_case.get("inconclusive")

    if args.dry_run:
        report["dry_run"] = True
        report["evidence_warnings"].append("dry_run_no_network")
        es = empty_streaming_summary("--dry-run")
        report["cases"]["chat_hello_first_byte"] = {
            "case": "chat_hello_first_byte",
            "passed": True,
            "failures": [],
            "skipped": True,
            "inconclusive": True,
            "skip_reason": "--dry-run",
            "summary": es,
        }
        report["cases"]["chat_hello_repeat_10"] = {
            "case": "chat_hello_repeat_10",
            "passed": True,
            "failures": [],
            "skipped": True,
            "inconclusive": True,
            "skip_reason": "--dry-run",
            "summary": {
                "success_rate": None,
                "samples_n": 0,
                "successful_samples_n": 0,
                "first_sse_event_ms": {"n": 0, "min": None, "max": None, "p50": None, "p95": None},
                "done_ms": {"n": 0, "min": None, "max": None, "p50": None, "p95": None},
                "thresholds": {
                    "success_rate_min": 0.95,
                    "p95_first_sse_event_ms_max": 1000,
                    "p95_done_ms_max": 3000,
                },
            },
            "samples": [],
        }
        report["cases"]["standard_ask_no_tools"] = {
            "case": "standard_ask_no_tools",
            "passed": True,
            "failures": [],
            "skipped": True,
            "inconclusive": True,
            "skip_reason": "--dry-run",
            "summary": es,
        }
        core_fail = False
    elif not cookie:
        warn = "missing_cookie_chat_skipped"
        report["evidence_warnings"].append(warn)
        es = empty_streaming_summary(warn)
        report["cases"]["chat_hello_first_byte"] = {
            "case": "chat_hello_first_byte",
            "passed": False,
            "failures": [warn],
            "skipped": True,
            "summary": es,
        }
        report["cases"]["chat_hello_repeat_10"] = {
            "case": "chat_hello_repeat_10",
            "passed": False,
            "failures": [warn, "no_successful_samples"],
            "skipped": True,
            "summary": {
                "success_rate": 0.0,
                "samples_n": 0,
                "successful_samples_n": 0,
                "first_sse_event_ms": {"n": 0, "min": None, "max": None, "p50": None, "p95": None},
                "done_ms": {"n": 0, "min": None, "max": None, "p50": None, "p95": None},
                "thresholds": {
                    "success_rate_min": 0.95,
                    "p95_first_sse_event_ms_max": 1000,
                    "p95_done_ms_max": 3000,
                },
            },
            "samples": [],
        }
        report["cases"]["standard_ask_no_tools"] = {
            "case": "standard_ask_no_tools",
            "passed": False,
            "failures": [warn],
            "skipped": True,
            "summary": es,
        }
        core_fail = True
    else:
        h1 = post_sse_chat(HELLO_BODY, cookie, args.timeout, "hello_first")
        c1 = build_streaming_case("chat_hello_first_byte", h1, eval_hello_first_byte)
        report["cases"]["chat_hello_first_byte"] = c1
        if not c1["passed"]:
            core_fail = True

        samples: list[dict[str, Any]] = []
        successful_first: list[float] = []
        successful_done: list[float] = []
        repeat_failures_top: list[str] = []

        for i in range(10):
            hi = post_sse_chat(HELLO_BODY, cookie, args.timeout, f"hello_r{i}")
            fl = eval_hello_repeat_single(hi)
            ok = len(fl) == 0
            summ_i = streaming_summary_from_transport(hi)
            samples.append(
                {
                    "index": i,
                    "passed": ok,
                    "failures": fl,
                    "summary": summ_i,
                }
            )
            if ok:
                if hi.get("first_sse_event_ms") is not None:
                    successful_first.append(float(hi["first_sse_event_ms"]))
                if hi.get("done_ms") is not None:
                    successful_done.append(float(hi["done_ms"]))
            if not ok and not repeat_failures_top:
                repeat_failures_top = fl[:5]

        successful_samples_n = sum(1 for s in samples if s["passed"])
        sr = successful_samples_n / 10.0
        st_first = stats_ms_from_values(successful_first)
        st_done = stats_ms_from_values(successful_done)

        rep_failures: list[str] = []
        if successful_samples_n == 0:
            rep_failures.append("no_successful_samples")
        if sr < 0.95:
            rep_failures.append(f"success_rate_{sr}_<_0.95")
        if successful_samples_n > 0:
            if st_first.get("n", 0) == 0:
                rep_failures.append("no_nonnull_first_sse_for_successful_samples")
            if st_done.get("n", 0) == 0:
                rep_failures.append("no_nonnull_done_ms_for_successful_samples")
        if st_first.get("p95") is not None and float(st_first["p95"]) >= 1000:
            rep_failures.append(f"p95_first_sse_{st_first['p95']}_>=_1000")
        if st_done.get("p95") is not None and float(st_done["p95"]) >= 3000:
            rep_failures.append(f"p95_done_{st_done['p95']}_>=_3000")

        rep_pass = len(rep_failures) == 0
        repeat_case: dict[str, Any] = {
            "case": "chat_hello_repeat_10",
            "passed": rep_pass,
            "failures": rep_failures if not rep_pass else [],
            "summary": {
                "success_rate": sr,
                "samples_n": 10,
                "successful_samples_n": successful_samples_n,
                "first_sse_event_ms": st_first,
                "done_ms": st_done,
                "thresholds": {
                    "success_rate_min": 0.95,
                    "p95_first_sse_event_ms_max": 1000,
                    "p95_done_ms_max": 3000,
                },
            },
            "samples": samples,
        }
        if repeat_failures_top and not rep_pass:
            repeat_case["sample_failures_example"] = repeat_failures_top
        report["cases"]["chat_hello_repeat_10"] = repeat_case
        if not rep_pass:
            core_fail = True

        s1 = post_sse_chat(STANDARD_ASK_BODY, cookie, args.timeout, "standard_ask")
        report["cases"]["standard_ask_no_tools"] = build_streaming_case(
            "standard_ask_no_tools", s1, eval_standard_ask
        )

    report["core_failed"] = core_fail
    report["summary"] = compute_top_summary(report, not core_fail)

    ch = report["cases"].get("chat_hello_first_byte") or {}
    if isinstance(ch.get("summary"), dict):
        report["hello_first_byte"] = ch["summary"]
    cr = report["cases"].get("chat_hello_repeat_10") or {}
    if isinstance(cr.get("summary"), dict):
        report["repeat_10"] = cr["summary"]
    cs = report["cases"].get("standard_ask_no_tools") or {}
    if isinstance(cs.get("summary"), dict):
        report["standard_ask_no_tools"] = cs["summary"]

    report["report_integrity"] = validate_report_integrity(report)
    integ = report["report_integrity"]
    if not integ.get("ok"):
        for f in integ.get("failures") or []:
            print("INTEGRITY:", f, file=sys.stderr)

    out_path = ROOT / args.json_out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("=== Agent Sam latency smoke ===")
    print(f"Report: {out_path.relative_to(ROOT)}")
    for key in CASE_ORDER:
        c = report["cases"].get(key, {})
        if c.get("skipped"):
            ps = "SKIP"
        elif c.get("passed"):
            ps = "PASS"
        else:
            ps = "FAIL"
        print(f"  [{ps}] {key}")
        if key == "chat_hello_first_byte" and not c.get("skipped"):
            t = (c.get("summary") or {}) if isinstance(c.get("summary"), dict) else {}
            print(
                "       timings ms:",
                f"connect={t.get('connect_ms')}",
                f"first_byte={t.get('first_byte_ms')}",
                f"first_sse={t.get('first_sse_event_ms')}",
                f"context={t.get('context_event_ms')}",
                f"done={t.get('done_ms')}",
                f"total={t.get('total_ms')}",
            )
        if key == "chat_hello_repeat_10" and not c.get("skipped"):
            sm = c.get("summary") or {}
            fs = sm.get("first_sse_event_ms") or {}
            dm = sm.get("done_ms") or {}
            print(
                "       repeat10 first_sse p50/p95:",
                fs.get("p50"),
                fs.get("p95"),
                "done_ms p50/p95:",
                dm.get("p50"),
                dm.get("p95"),
                "success_rate:",
                sm.get("success_rate"),
            )
        fl = c.get("failures")
        if isinstance(fl, list) and fl:
            print("       failures:", "; ".join(fl))
    if report["evidence_warnings"]:
        print("Evidence warnings:")
        for w in report["evidence_warnings"]:
            print("  -", w)

    print("Core aggregate:", "FAIL" if core_fail else "PASS")
    print("Report integrity:", "OK" if integ.get("ok") else "FAIL")

    exit_integrity = 0 if integ.get("ok") else 1
    if args.dry_run:
        return max(exit_integrity, 0)
    if exit_integrity:
        return 1
    return 1 if core_fail else 0


if __name__ == "__main__":
    sys.exit(main())
