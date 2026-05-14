#!/usr/bin/env python3
"""
Agent Sam E2E Smoke Test — goes through the real /api/agent/chat SSE endpoint.
Tests tool routing, capability execution, latency, and stream integrity.
Run: python3 scripts/smoke_agentsam_e2e_v2.py
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime

BASE_URL = "https://inneranimalmedia.com/api/agent/chat"
WORKSPACE = "ws_inneranimalmedia"
SESSION = os.environ.get("IAM_SESSION", "d42378b2-309c-46c6-b00f-332c5160079d")
TIMEOUT = 45

# ── Test definitions ────────────────────────────────────────────────────────
# Each test defines:
#   msg          — what to send
#   mode         — ask / agent / plan / debug
#   expect_tools — list of tool names we MUST see called (empty = no tools ok)
#   forbid_tools — tool names that must NOT appear
#   max_ttfb_s   — fail if first token takes longer than this
#   max_total_s  — fail if stream doesn't finish within this
#   assert_text  — substring that must appear in final response (optional)

TESTS = [
    {
        "id": "baseline_pong",
        "msg": "Reply with exactly the word PONG and nothing else.",
        "mode": "ask",
        "expect_tools": [],
        "max_ttfb_s": 4,
        "max_total_s": 12,
        "assert_text": "PONG",
    },
    {
        "id": "terminal_execute",
        "msg": "Run this exact command in the terminal and show me the output: echo smoke_terminal_ok",
        "mode": "agent",
        "expect_tools": ["terminal_execute", "terminal_run"],  # either
        "max_ttfb_s": 6,
        "max_total_s": 20,
        "assert_text": "smoke_terminal_ok",
    },
    {
        "id": "d1_query",
        "msg": "Query D1: SELECT COUNT(*) as n FROM agentsam_mcp_tools WHERE is_active=1",
        "mode": "agent",
        "expect_tools": ["d1_query"],
        "max_ttfb_s": 6,
        "max_total_s": 20,
    },
    {
        "id": "excalidraw_open",
        "msg": "Open Excalidraw and create a simple box diagram.",
        "mode": "agent",
        "expect_tools": ["excalidraw_open", "excalidraw_create"],  # either
        "max_ttfb_s": 6,
        "max_total_s": 25,
    },
    {
        "id": "browser_navigate",
        "msg": "Use the browser to navigate to https://inneranimalmedia.com and take a screenshot.",
        "mode": "agent",
        "expect_tools": [
            "browser_navigate",
            "browser_screenshot",
            "cdt_navigate_page",
            "cdt_take_screenshot",
        ],
        "max_ttfb_s": 6,
        "max_total_s": 30,
    },
    {
        "id": "workflow_trigger",
        "msg": "Trigger the i-am-builder-monaco workflow.",
        "mode": "agent",
        "expect_tools": [],  # workflow dispatch may not show as tool call
        "max_ttfb_s": 6,
        "max_total_s": 30,
        "assert_text": "monaco",
    },
    {
        "id": "routing_ask_mode",
        "msg": "What is 2 + 2?",
        "mode": "ask",
        "expect_tools": [],
        "max_ttfb_s": 3,
        "max_total_s": 10,
        "assert_text": "4",
    },
    {
        "id": "routing_debug_mode",
        "msg": "Check the health of the inneranimalmedia worker.",
        "mode": "debug",
        "expect_tools": [],
        "max_ttfb_s": 5,
        "max_total_s": 20,
    },
    {
        "id": "memory_workspace",
        "msg": "What workspace am I in right now?",
        "mode": "ask",
        "expect_tools": [],
        "max_ttfb_s": 4,
        "max_total_s": 12,
        "assert_text": "inneranimalmedia",
    },
    {
        "id": "kv_cache_warmth",
        "msg": "Reply PONG",  # same as baseline — should be faster on second run
        "mode": "ask",
        "expect_tools": [],
        "max_ttfb_s": 2,  # tighter budget — KV cache should be warm
        "max_total_s": 8,
        "assert_text": "PONG",
        "_note": "Run after baseline_pong — tests KV system prompt cache hit",
    },
]

# ── SSE stream parser ───────────────────────────────────────────────────────


def run_test(test):
    t_start = time.time()
    t_first = None
    text_buf = []
    tools_called = []
    errors = []
    done = False

    cmd = [
        "curl",
        "-sN",
        f"--max-time={TIMEOUT}",
        "-X",
        "POST",
        BASE_URL,
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: text/event-stream",
        "-H",
        f"Cookie: session={SESSION}",
        "--data-raw",
        json.dumps(
            {
                "message": test["msg"],
                "mode": test["mode"],
                "workspace_id": WORKSPACE,
                "stream": True,
            }
        ),
    ]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for raw_line in proc.stdout:
            raw_line = raw_line.rstrip("\n")
            if not raw_line.startswith("data: "):
                continue
            payload = raw_line[6:]
            try:
                ev = json.loads(payload)
            except Exception:
                continue

            ev_type = ev.get("type", "")

            if t_first is None and ev_type in (
                "text",
                "context",
                "capability_selected",
                "agent_capability_selected",
                "thinking",
            ):
                t_first = time.time()

            if ev_type == "text":
                text_buf.append(ev.get("text", ""))

            if ev_type == "tool_call":
                tools_called.append(ev.get("tool_name") or ev.get("name", ""))

            if ev_type == "error":
                errors.append(ev.get("message") or ev.get("error") or str(ev))

            if ev_type == "done":
                done = True
                break

        proc.wait(timeout=3)
    except Exception as e:
        errors.append(f"curl_exception: {e}")

    t_end = time.time()
    ttfb = round(t_first - t_start, 2) if t_first else None
    total = round(t_end - t_start, 2)
    full_text = "".join(text_buf).lower()

    # ── Assertions ─────────────────────────────────────────────────────────
    failures = []

    if not done:
        failures.append("stream_never_finished")

    if ttfb is None:
        failures.append("no_first_token")
    elif ttfb > test.get("max_ttfb_s", 99):
        failures.append(f"ttfb_too_slow:{ttfb}s>{test['max_ttfb_s']}s")

    if total > test.get("max_total_s", 999):
        failures.append(f"total_too_slow:{total}s>{test['max_total_s']}s")

    expected = test.get("expect_tools", [])
    if expected:
        found_any = any(
            any(e.lower() in t.lower() or t.lower() in e.lower() for e in expected)
            for t in tools_called
        )
        if not found_any:
            failures.append(f"missing_tool:expected_one_of={expected},got={tools_called}")

    if errors:
        failures.append(f"stream_errors:{errors}")

    needle = test.get("assert_text", "")
    if needle and needle.lower() not in full_text:
        failures.append(f"text_not_found:'{needle}'")

    return {
        "id": test["id"],
        "pass": len(failures) == 0,
        "ttfb": ttfb,
        "total": total,
        "tools": tools_called,
        "errors": errors,
        "failures": failures,
        "done": done,
        "note": test.get("_note", ""),
    }


# ── Runner ──────────────────────────────────────────────────────────────────


def main():
    print(f"\n{'═' * 70}")
    print(f"  Agent Sam E2E Smoke — {datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}")
    print(f"  {len(TESTS)} tests  •  workspace={WORKSPACE}  •  timeout={TIMEOUT}s")
    print(f"{'═' * 70}\n")

    results = []
    # Run sequentially so KV cache warmth test is meaningful
    for test in TESTS:
        sys.stdout.write(f"  [{test['id']:<30}] running...")
        sys.stdout.flush()
        r = run_test(test)
        results.append(r)
        status = "✓ PASS" if r["pass"] else "✗ FAIL"
        ttfb = f"{r['ttfb']}s" if r["ttfb"] else "—"
        tools = ",".join(r["tools"]) or "none"
        print(f"\r  [{test['id']:<30}] {status}  ttfb={ttfb:<6}  tools={tools}")
        if not r["pass"]:
            for f in r["failures"]:
                print(f"       ↳ {f}")
        if r["note"]:
            print(f"       ℹ  {r['note']}")

    passed = sum(1 for r in results if r["pass"])
    total = len(results)
    print(f"\n{'─' * 70}")
    print(f"  {passed}/{total} passed\n")

    # Write JSON report
    report_path = f"scripts/reports/smoke_e2e_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}.json"
    os.makedirs("scripts/reports", exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"  Report saved → {report_path}\n")

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
