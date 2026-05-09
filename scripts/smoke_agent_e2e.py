#!/usr/bin/env python3
"""
Run scripts/smoke-agent-e2e.sh with env vars set (Cloudflare via with-cloudflare-env.sh).

Session cookie options (pick one):
  1) Mint a short-lived session (recommended for agents):
     Set AGENT_SESSION_MINT_SECRET in .env.cloudflare (same value as Worker secret
     AGENT_SESSION_MINT_SECRET) and AGENT_SESSION_USER_ID (auth_users.id) or
     AGENT_SESSION_USER_EMAIL. Optionally AGENT_SESSION_TTL_SECONDS (default 900).

  2) Pass an existing cookie:
     COOKIE='session=<uuid>' or bare UUID (script normalizes to session=<uuid>).

Do not commit session secrets. Use .env.cloudflare (gitignored).

Examples:
  COOKIE='d42378b2-309c-46c6-b00f-332c5160079d' python3 scripts/smoke_agent_e2e.py

  AGENT_SESSION_MINT_SECRET='...' AGENT_SESSION_USER_ID='au_...' python3 scripts/smoke_agent_e2e.py

  python3 scripts/smoke_agent_e2e.py --cookie 'session=...' --ttl-seconds 600
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


def mint_session(
    base_url: str,
    secret: str,
    *,
    user_id: str | None,
    user_email: str | None,
    ttl_seconds: int,
) -> str:
    """POST /api/auth/agent-session/mint → returns Cookie header value (session=<id>)."""
    url = f"{base_url.rstrip('/')}/api/auth/agent-session/mint"
    body: dict = {"ttl_seconds": ttl_seconds}
    if user_id:
        body["user_id"] = user_id
    if user_email:
        body["user_email"] = user_email
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
            "User-Agent": "inneranimalmedia-smoke-agent-e2e/1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Mint HTTP {e.code}: {err_body}") from e

    out = json.loads(raw)
    if not out.get("ok"):
        raise RuntimeError(out.get("error") or "mint failed")
    header = out.get("cookie_header") or ""
    if not header:
        sid = out.get("session_id")
        if sid:
            header = f"session={sid}"
    if not header:
        raise RuntimeError("mint response missing cookie_header / session_id")
    return str(header)


def normalize_cookie_header(cookie: str) -> str:
    c = cookie.strip()
    if not c:
        return c
    if "=" not in c:
        return f"session={c}"
    return c


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Run MCP + workflow smoke with optional session mint.")
    parser.add_argument(
        "--cookie",
        default=os.environ.get("COOKIE", ""),
        help="Existing Cookie header value or bare session UUID.",
    )
    parser.add_argument("--base-url", default=os.environ.get("BASE_URL", "https://inneranimalmedia.com"))
    parser.add_argument("--workspace-id", default=os.environ.get("WORKSPACE_ID", "ws_inneranimalmedia"))
    parser.add_argument("--workflow-key", default=os.environ.get("WORKFLOW_KEY", "i-am-builder-monaco"))
    parser.add_argument("--tool-key", default=os.environ.get("TOOL_KEY", "mcp_dispatch"))
    parser.add_argument("--db", default=os.environ.get("DB", "inneranimalmedia-business"))
    parser.add_argument(
        "--ttl-seconds",
        type=int,
        default=int(os.environ.get("AGENT_SESSION_TTL_SECONDS") or "900"),
        help="TTL for minted session (60–86400; default 900).",
    )
    parser.add_argument(
        "--mint-secret",
        default=os.environ.get("AGENT_SESSION_MINT_SECRET", ""),
        help="Same as Worker secret AGENT_SESSION_MINT_SECRET (or set env).",
    )
    parser.add_argument(
        "--user-id",
        default=os.environ.get("AGENT_SESSION_USER_ID", ""),
        help="auth_users.id for mint (or set AGENT_SESSION_USER_ID).",
    )
    parser.add_argument(
        "--user-email",
        default=os.environ.get("AGENT_SESSION_USER_EMAIL", ""),
        help="auth_users email for mint if user id omitted.",
    )
    args = parser.parse_args()

    env = os.environ.copy()
    env["BASE_URL"] = args.base_url.strip()
    env["WORKSPACE_ID"] = args.workspace_id.strip()
    env["WORKFLOW_KEY"] = args.workflow_key.strip()
    env["TOOL_KEY"] = args.tool_key.strip()
    env["DB"] = args.db.strip()

    cookie_in = (args.cookie or os.environ.get("COOKIE") or "").strip()
    mint_secret = (args.mint_secret or "").strip()

    if not cookie_in and mint_secret:
        uid = args.user_id.strip() if args.user_id else ""
        em = args.user_email.strip() if args.user_email else ""
        if not uid and not em:
            print(
                "Mint requested but no user: set --user-id / AGENT_SESSION_USER_ID "
                "or --user-email / AGENT_SESSION_USER_EMAIL (or configure "
                "AGENT_SESSION_DEFAULT_USER_ID on the Worker).",
                file=sys.stderr,
            )
            return 1
        try:
            hdr = mint_session(
                env["BASE_URL"],
                mint_secret,
                user_id=uid or None,
                user_email=em or None,
                ttl_seconds=max(60, min(86400, args.ttl_seconds)),
            )
            env["COOKIE"] = hdr
            print(f"Minted short-lived session (ttl ~{args.ttl_seconds}s).", file=sys.stderr)
        except Exception as e:
            print(f"Mint failed: {e}", file=sys.stderr)
            return 1
    elif cookie_in:
        env["COOKIE"] = normalize_cookie_header(cookie_in)
    else:
        print(
            "Set COOKIE (session value or session=<uuid>) or AGENT_SESSION_MINT_SECRET + user.",
            file=sys.stderr,
        )
        return 1

    wrapper = repo_root / "scripts" / "with-cloudflare-env.sh"
    smoke = repo_root / "scripts" / "smoke-agent-e2e.sh"
    if not wrapper.is_file() or not smoke.is_file():
        print("Expected scripts/with-cloudflare-env.sh and scripts/smoke-agent-e2e.sh", file=sys.stderr)
        return 1

    cmd = ["zsh", str(wrapper), "bash", str(smoke)]
    proc = subprocess.run(cmd, cwd=str(repo_root), env=env)
    return int(proc.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
