#!/usr/bin/env python3
"""
Orchestrates Playwright live smoke for /dashboard/agent (real session cookie, real UI, real SSE).

Does not replace in-chat Agent Sam self-debug; it validates the same page the workbench uses.

Usage (repo root):
  export IAM_SESSION='...'   # raw cookie value, or session=... form
  python3 scripts/smoke_dashboard_agent_browser_workbench.py

Optional:
  IAM_BASE_URL=https://inneranimalmedia.com
  IAM_WORKBENCH_JSON=reports/ai-smoke/dashboard-agent-browser-workbench-latest.json
  IAM_WORKBENCH_PNG=reports/ai-smoke/dashboard-agent-browser-workbench-failure.png
  SKIP_D1=1   # skip wrangler PRAGMA / tool listing

Writes:
  reports/ai-smoke/dashboard-agent-browser-workbench-latest.json (merged with optional D1 evidence)
  reports/ai-smoke/dashboard-agent-browser-workbench-failure.png (on Playwright failure, if produced)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")


def load_session() -> str:
    raw = (
        os.getenv("IAM_SESSION", "").strip()
        or os.getenv("IAM_COOKIE", "").strip()
        or os.getenv("COOKIE", "").strip()
    )
    p = Path(os.path.expanduser(os.getenv("IAM_COOKIE_FILE", "~/.iam-session-cookie")))
    if not raw and p.exists():
        raw = p.read_text(errors="ignore").strip()
    raw = raw.replace("\n", "").strip()
    if raw.startswith("session="):
        raw = raw[len("session=") :]
    return raw


def run_cmd(args: list[str], timeout: int = 600, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args, text=True, capture_output=True, timeout=timeout, cwd=str(ROOT), env=env or os.environ.copy()
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


def wrangler_json(sql: str) -> dict:
    proc = run_cmd(
        [
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
        ],
        timeout=120,
    )
    if proc.returncode != 0:
        return {"error": (proc.stderr or proc.stdout or "")[-2000:]}
    blob = (proc.stdout or "") + (proc.stderr or "")
    parsed = extract_json_payload(blob)
    if parsed is None:
        return {"parse_error": True, "tail": blob[-3000:]}
    return parsed if isinstance(parsed, dict) else {"data": parsed}


def main() -> int:
    if Path.cwd().resolve() != ROOT:
        os.chdir(ROOT)

    session = load_session()
    if not session:
        print("Missing IAM_SESSION (or IAM_COOKIE_FILE with session).", file=sys.stderr)
        return 2

    env = os.environ.copy()
    env["IAM_SESSION"] = session

    spec = ROOT / "tests/e2e/dashboard-agent-workbench.spec.ts"
    if not spec.exists():
        print("Missing", spec, file=sys.stderr)
        return 2

    proc = run_cmd(
        [
            "npx",
            "playwright",
            "test",
            str(spec.relative_to(ROOT)),
            "--project=chromium-desktop",
        ],
        timeout=420,
        env=env,
    )
    out_path = ROOT / os.getenv(
        "IAM_WORKBENCH_JSON", "reports/ai-smoke/dashboard-agent-browser-workbench-latest.json"
    )
    merged: dict = {}
    if out_path.exists():
        try:
            merged = json.loads(out_path.read_text(encoding="utf-8"))
        except Exception:
            merged = {}

    merged["playwright_exit_code"] = proc.returncode
    merged["playwright_stdout_tail"] = (proc.stdout or "")[-4000:]
    merged["playwright_stderr_tail"] = (proc.stderr or "")[-4000:]

    if os.getenv("SKIP_D1") != "1":
        merged["d1_evidence"] = {
            "browser_tools": wrangler_json(
                "SELECT tool_name, tool_category, handler_type, is_active, requires_approval, risk_level "
                "FROM agentsam_tools WHERE tool_name LIKE '%browser%' OR tool_name LIKE 'cdt_%' "
                "ORDER BY tool_name LIMIT 80;"
            ),
            "pragma_tool_call_log": wrangler_json("PRAGMA table_info(agentsam_tool_call_log);"),
            "pragma_tool_chain": wrangler_json("PRAGMA table_info(agentsam_tool_chain);"),
            "pragma_agent_run": wrangler_json("PRAGMA table_info(agentsam_agent_run);"),
        }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")

    if proc.returncode != 0:
        print("Playwright failed; see", out_path, file=sys.stderr)
        return 1
    print("OK — report:", out_path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
