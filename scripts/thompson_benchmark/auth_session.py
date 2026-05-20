#!/usr/bin/env python3
"""Session mint + cookie helpers — identity from auth_users only."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]


def load_local_env() -> None:
    for name in (".env", "cloudflare.env", ".env.agentsam.local", "agentsam.local.env"):
        path = REPO_ROOT / name
        if not path.is_file():
            continue
        for raw in path.read_text(errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def normalize_cookie(cookie: str) -> str:
    c = (cookie or "").strip()
    if not c:
        return c
    return c if "=" in c else f"session={c}"


def load_cookie() -> str:
    raw = os.environ.get("IAM_SESSION", "").strip()
    if not raw:
        p = Path.home() / ".iam-session-cookie"
        if p.is_file():
            raw = p.read_text(encoding="utf-8").strip()
    return normalize_cookie(raw)


def mint_session(
    base_url: str,
    *,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    ttl_seconds: int = 3600,
) -> str:
    secret = os.environ.get("AGENT_SESSION_MINT_SECRET", "").strip()
    if not secret:
        raise RuntimeError(
            "AGENT_SESSION_MINT_SECRET not set (use cloudflare.env / .env.agentsam.local)"
        )
    if not user_id and not user_email:
        raise RuntimeError("mint requires user_id or user_email from auth_users")

    url = f"{base_url.rstrip('/')}/api/auth/agent-session/mint"
    body: dict = {"ttl_seconds": max(60, min(86400, int(ttl_seconds)))}
    if user_id:
        body["user_id"] = user_id
    if user_email:
        body["user_email"] = user_email

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
            "User-Agent": "thompson_benchmark/live/1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            out = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Mint HTTP {e.code}: {e.read().decode(errors='replace')[:500]}") from e

    if not out.get("ok"):
        raise RuntimeError(out.get("error") or "mint failed")
    header = out.get("cookie_header") or ""
    if not header:
        sid = out.get("session_id")
        if sid:
            header = f"session={sid}"
    if not header:
        raise RuntimeError("mint response missing cookie")
    return normalize_cookie(header)


def resolve_cookie(
    base_url: str,
    *,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
) -> str:
    """Prefer IAM_SESSION / ~/.iam-session-cookie; else mint via AGENT_SESSION_MINT_SECRET."""
    cookie = load_cookie()
    if cookie:
        return cookie
    return mint_session(base_url, user_id=user_id, user_email=user_email)
