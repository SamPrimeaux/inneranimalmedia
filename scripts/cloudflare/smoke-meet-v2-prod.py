#!/usr/bin/env python3
"""Prod smoke for /api/meet/v2/* (requires AGENT_SESSION_MINT_SECRET matching Worker)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("IAM_BASE_URL", "https://inneranimalmedia.com").rstrip("/")
SECRET = os.environ.get("AGENT_SESSION_MINT_SECRET", "").strip()
USER_ID = os.environ.get("AGENT_SESSION_USER_ID", "").strip()
USER_EMAIL = os.environ.get("AGENT_SESSION_USER_EMAIL", "").strip()


def post(path: str, body: dict, *, cookie: str | None = None) -> dict:
    headers = {"Content-Type": "application/json", "User-Agent": "iam-meet-v2-smoke/1"}
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
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {path}: {err}") from e


def main() -> int:
    if not SECRET:
        print("AGENT_SESSION_MINT_SECRET required (must match Worker secret)", file=sys.stderr)
        return 1
    mint_body: dict = {"ttl_seconds": 300}
    if USER_ID:
        mint_body["user_id"] = USER_ID
    elif USER_EMAIL:
        mint_body["user_email"] = USER_EMAIL
    else:
        print("Set AGENT_SESSION_USER_ID or AGENT_SESSION_USER_EMAIL", file=sys.stderr)
        return 1

    mint = post("/api/auth/agent-session/mint", mint_body)
    cookie = mint.get("cookie_header") or f"session={mint['session_id']}"
    print("mint: ok")

    start = post("/api/meet/v2/start", {"name": "Prod RTK smoke"}, cookie=cookie)
    print("start:", {k: start.get(k) for k in ("ok", "roomId", "meetingId", "engine")})
    if not start.get("ok") or not start.get("meetingId"):
        return 1

    token = post(
        "/api/meet/v2/token",
        {"roomId": start["roomId"], "role": "host", "displayName": "Smoke Host"},
        cookie=cookie,
    )
    auth_len = len(token.get("authToken") or "")
    print("token: ok authToken_len=", auth_len)
    if not token.get("ok") or auth_len < 100:
        return 1
    print("PASS meet/v2 prod smoke")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
