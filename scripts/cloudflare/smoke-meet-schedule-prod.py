#!/usr/bin/env python3
"""Prod smoke: /api/meet/schedule + invite D1 rows (session mint)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("IAM_BASE_URL", "https://inneranimalmedia.com").rstrip("/")
SECRET = os.environ.get("AGENT_SESSION_MINT_SECRET", "").strip()
USER_ID = os.environ.get("AGENT_SESSION_USER_ID", "").strip()
USER_EMAIL = os.environ.get("AGENT_SESSION_USER_EMAIL", "").strip()


def post(path: str, body: dict, *, cookie: str | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "User-Agent": "iam-meet-schedule-smoke/1"}
    if cookie:
        headers["Cookie"] = cookie
    else:
        headers["Authorization"] = f"Bearer {SECRET}"
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode(),
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {"error": raw}
        return e.code, data


def main() -> int:
    if not SECRET:
        print("AGENT_SESSION_MINT_SECRET required", file=sys.stderr)
        return 1
    mint_body: dict = {"ttl_seconds": 300}
    if USER_ID:
        mint_body["user_id"] = USER_ID
    elif USER_EMAIL:
        mint_body["user_email"] = USER_EMAIL
    else:
        print("AGENT_SESSION_USER_ID or AGENT_SESSION_USER_EMAIL required", file=sys.stderr)
        return 1

    _, mint = post("/api/auth/agent-session/mint", mint_body)
    cookie = mint.get("cookie_header") or (f"session={mint['session_id']}" if mint.get("session_id") else None)
    if not cookie:
        print("mint failed:", mint, file=sys.stderr)
        return 1
    print("mint: ok")

    when = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
    status, sched = post(
        "/api/meet/schedule",
        {
            "title": "RTK schedule smoke",
            "scheduled_at": when,
            "duration_min": 30,
            "invite_emails": [],
            "description": "automated smoke",
        },
        cookie=cookie,
    )
    if status >= 400 or not sched.get("ok"):
        print("schedule failed:", status, sched, file=sys.stderr)
        return 1
    room_id = sched.get("room_id")
    cal_id = sched.get("calendar_event_id")
    print(f"schedule: room_id={room_id} calendar_event_id={cal_id}")

    status, room = post(
        "/api/meet/v2/token",
        {"roomId": room_id, "role": "host", "displayName": "Schedule Host"},
        cookie=cookie,
    )
    if status >= 400 or not room.get("authToken"):
        print("token failed (lazy RTK on scheduled room):", status, room, file=sys.stderr)
        return 1
    print(f"token: authToken_len={len(room['authToken'])}")

    print("PASS meet schedule prod smoke")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
