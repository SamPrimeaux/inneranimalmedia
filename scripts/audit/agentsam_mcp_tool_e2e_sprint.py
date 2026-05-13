#!/usr/bin/env python3
"""
Agent Sam MCP / Tool E2E Audit Sprint

Purpose
-------
Run a safe, read-heavy end-to-end audit against the live Inner Animal Media Worker,
D1, MCP catalog, route/tool resolver data, and optional MCP server endpoints.

Default mode is SAFE:
- no deploys
- no D1 writes except optional smoke endpoints that are called with dry_run=true
- no secret printing
- no raw token printing
- no terminal tool execution
- no production mutation tool calls

D1: `v_agentsam_mcp_tools_branded.capability_key` is populated by migrations 332/333 (COALESCE(tool_key,
tool_name, category:name fallback)). Audits flag empty capability groups as warnings, not hard failures,
when lane + tool_key still identify rows.

Outputs
-------
artifacts/agentsam_mcp_tool_sprint_<timestamp>/
  report.json
  report.md
  raw/*.json
  raw/*.txt

Run
---
cd /Users/samprimeaux/inneranimalmedia
python3 scripts/audit/agentsam_mcp_tool_e2e_sprint.py

Or from anywhere:
python3 /path/to/agentsam_mcp_tool_e2e_sprint.py --repo /Users/samprimeaux/inneranimalmedia

Useful flags
------------
--base-url https://inneranimalmedia.com
--db inneranimalmedia-business
--wrangler-config wrangler.production.toml
--session-cookie-file ~/.iam-session-cookie
--mcp-server-url https://YOUR-MCP-SERVER.example.com
--mcp-token-env IAM_MCP_TOKEN
--include-agent-chat-dry-run
--include-tool-smoke
--max-tools-per-lane 24
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


SAFE_LANES = [
    "think",
    "research",
    "inspect",
    "observe",
    "develop",
    "design",
    "operate",
    "integrate",
    "admin",
]

ROUTE_KEYS_TO_SPOT_CHECK = [
    "simple_ask_greeting",
    "chat",
    "general",
    "agent_cloudflare",
    "agent_code",
    "agent_frontend",
    "agent_database",
    "agent_terminal",
    "agent_debug",
    "agent_tool_orchestration",
    "agent_smoke_test",
    "agent_cost_audit",
    "agent_research",
    "agent_planning",
    "agent_general",
    "mcp_panel",
    "tool_use",
    "workflow_orchestration",
    "workflow_run",
    "deploy",
    "db_query",
    "r2_ops",
    "security_audit",
]

DANGEROUS_TOOL_NAMES = {
    "worker_deploy",
    "d1_write",
    "d1_batch_write",
    "terminal_run",
    "terminal_execute",
    "run_command",
    "bash",
    "python_execute",
    "resend_send_broadcast",
    "resend_create_api_key",
    "secret_write",
    "email_broadcast",
}

SECRET_PATTERNS = [
    re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]{8,}", re.I),
    re.compile(r"session=[A-Za-z0-9._~+/=-]{8,}", re.I),
    re.compile(r"tok_[A-Za-z0-9._~+/=-]{8,}", re.I),
    re.compile(r"sk-[A-Za-z0-9._~+/=-]{8,}", re.I),
    re.compile(r"(authorization|cookie|x-api-key|mcp-token)\s*:\s*[^\n\r]+", re.I),
]


def utc_stamp() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def iso_now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if is_secret_key(k) else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        out = value
        for pat in SECRET_PATTERNS:
            out = pat.sub(lambda m: m.group(0).split(":", 1)[0] + ": [REDACTED]" if ":" in m.group(0) else "[REDACTED]", out)
        return out
    return value


def is_secret_key(key: str) -> bool:
    k = key.lower()
    return any(s in k for s in ["token", "secret", "authorization", "cookie", "password", "api_key", "apikey", "bearer"])


def short_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(redact(data), indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, data: str) -> None:
    ensure_dir(path.parent)
    path.write_text(redact(data), encoding="utf-8")


@dataclass
class Check:
    name: str
    ok: bool
    severity: str = "info"  # info | warn | fail
    summary: str = ""
    duration_ms: int = 0
    data: Any = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "ok": self.ok,
            "severity": self.severity,
            "summary": self.summary,
            "duration_ms": self.duration_ms,
            "data": redact(self.data),
        }


class SprintAudit:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.repo = Path(args.repo).expanduser().resolve()
        self.out_dir = self.repo / "artifacts" / f"agentsam_mcp_tool_sprint_{utc_stamp()}"
        self.raw_dir = self.out_dir / "raw"
        ensure_dir(self.raw_dir)
        self.checks: List[Check] = []
        self.session_cookie = self.load_session_cookie()
        self.mcp_token = os.getenv(args.mcp_token_env, "") if args.mcp_token_env else ""
        self.env = os.environ.copy()
        self.env.setdefault("NO_COLOR", "1")

    def add(self, check: Check) -> None:
        self.checks.append(check)
        mark = "OK" if check.ok else ("WARN" if check.severity == "warn" else "FAIL")
        print(f"[{mark}] {check.name}: {check.summary}")

    def load_session_cookie(self) -> str:
        val = os.getenv("IAM_SESSION", "").strip()
        if not val and self.args.session_cookie_file:
            p = Path(self.args.session_cookie_file).expanduser()
            if p.exists():
                val = p.read_text(encoding="utf-8", errors="ignore").strip()
        if val.startswith("session="):
            val = val.split("=", 1)[1]
        return val

    def run_cmd(self, name: str, cmd: List[str], timeout: int = 60, raw_name: Optional[str] = None) -> Tuple[int, str, str, int]:
        start = time.time()
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(self.repo),
                env=self.env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
            )
            dur = int((time.time() - start) * 1000)
            if raw_name:
                write_text(self.raw_dir / f"{raw_name}.stdout.txt", proc.stdout)
                write_text(self.raw_dir / f"{raw_name}.stderr.txt", proc.stderr)
            return proc.returncode, proc.stdout, proc.stderr, dur
        except subprocess.TimeoutExpired as e:
            dur = int((time.time() - start) * 1000)
            out = e.stdout if isinstance(e.stdout, str) else ""
            err = e.stderr if isinstance(e.stderr, str) else ""
            if raw_name:
                write_text(self.raw_dir / f"{raw_name}.timeout.txt", f"TIMEOUT after {timeout}s\nSTDOUT:\n{out}\nSTDERR:\n{err}\n")
            return 124, out, err + f"\nTIMEOUT after {timeout}s", dur

    def http_json(
        self,
        name: str,
        url: str,
        method: str = "GET",
        body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 30,
        raw_name: Optional[str] = None,
    ) -> Tuple[int, Any, str, int]:
        start = time.time()
        hdrs = {"Accept": "application/json"}
        if self.session_cookie:
            hdrs["Cookie"] = f"session={self.session_cookie}"
        if headers:
            hdrs.update(headers)
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            hdrs["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
        status = 0
        text = ""
        parsed: Any = None
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = int(resp.status)
                text = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            status = int(e.code)
            text = e.read().decode("utf-8", errors="replace")
        except Exception as e:
            status = 0
            text = f"{type(e).__name__}: {e}"
        dur = int((time.time() - start) * 1000)
        try:
            parsed = json.loads(text) if text.strip() else None
        except Exception:
            parsed = {"_non_json": text[:2000]}
        if raw_name:
            write_json(self.raw_dir / f"{raw_name}.json", {"status": status, "url": url, "response": parsed})
        return status, parsed, text, dur

    def d1_json(self, name: str, sql: str, timeout: int = 90, raw_name: Optional[str] = None) -> Tuple[bool, List[Dict[str, Any]], str, int]:
        cmd = [
            "npx",
            "wrangler",
            "d1",
            "execute",
            self.args.db,
            "--remote",
            "-c",
            self.args.wrangler_config,
            "--json",
            "--command",
            sql,
        ]
        code, out, err, dur = self.run_cmd(name, cmd, timeout=timeout, raw_name=raw_name)
        if code != 0:
            return False, [], err or out, dur
        try:
            parsed = json.loads(out)
            rows = parsed[0].get("results", []) if parsed and isinstance(parsed, list) else []
            if raw_name:
                write_json(self.raw_dir / f"{raw_name}.json", parsed)
            return True, rows, "", dur
        except Exception as e:
            return False, [], f"JSON parse error: {e}\n{out[:2000]}", dur

    def preflight(self) -> None:
        start = time.time()
        missing = []
        for exe in ["node", "npm", "npx"]:
            if not shutil.which(exe):
                missing.append(exe)
        ok = not missing and self.repo.exists()
        self.add(Check(
            "preflight.local_tools",
            ok,
            "fail" if not ok else "info",
            f"repo={self.repo}; missing={missing or 'none'}",
            int((time.time() - start) * 1000),
            {"repo": str(self.repo), "missing": missing, "has_session_cookie": bool(self.session_cookie)},
        ))

        code, out, err, dur = self.run_cmd(
            "git.status",
            ["git", "status", "-sb"],
            timeout=20,
            raw_name="git_status",
        )
        self.add(Check(
            "git.status",
            code == 0,
            "warn" if code != 0 else "info",
            (out or err).strip().splitlines()[0] if (out or err).strip() else "no output",
            dur,
            {"stdout": out, "stderr": err},
        ))

    def static_checks(self) -> None:
        files = [
            "src/api/agent.js",
            "src/api/mcp.js",
            "src/core/mcp-tools-branded.js",
            "src/core/agentsam-route-tool-resolver.js",
            "src/core/agentsam-ops-ledger.js",
        ]
        for rel in files:
            p = self.repo / rel
            if not p.exists():
                self.add(Check(f"static.exists.{rel}", False, "warn", "missing", 0, {}))
                continue
            code, out, err, dur = self.run_cmd(f"node.check.{rel}", ["node", "--check", rel], timeout=30, raw_name=f"node_check_{rel.replace('/', '_')}")
            self.add(Check(f"node.check.{rel}", code == 0, "fail" if code != 0 else "info", "syntax ok" if code == 0 else (err or out)[:300], dur))

        patterns = {
            "legacy_broad_mcp_list_refs": r"selectAgentsamMcpToolsList|loadAvailableToolsForCapability|deterministic_empty_legacy_fallback",
            "tool_smoke_old_denylist_refs": r"TOOL_SMOKE_DENYLIST",
            "route_resolver_symbols": r"selectMcpToolsForDeterministicAgentChat|routeToolRequirements|maxModelToolsForAgentTask",
            "preview_artifact_symbols": r"preview_artifact|previewArtifacts|AgentCodeFencePreview",
        }
        for name, pat in patterns.items():
            cmd = [
                "rg", "-n", "--hidden",
                "--glob", "!node_modules",
                "--glob", "!dist",
                "--glob", "!dashboard/dist",
                pat,
                "src", "dashboard",
            ]
            code, out, err, dur = self.run_cmd(f"rg.{name}", cmd, timeout=30, raw_name=f"rg_{name}")
            # rg returns 1 when no matches. That is OK for old denylist, not OK for symbols.
            if name == "tool_smoke_old_denylist_refs":
                ok = code == 1
                sev = "warn" if not ok else "info"
                summary = "no old denylist refs" if ok else "old TOOL_SMOKE_DENYLIST references found"
            elif name in {"route_resolver_symbols", "preview_artifact_symbols"}:
                ok = code == 0 and bool(out.strip())
                sev = "fail" if not ok else "info"
                summary = "symbols found" if ok else "expected symbols missing"
            else:
                ok = True
                sev = "info"
                summary = f"{len(out.splitlines()) if out else 0} matches"
            self.add(Check(f"static.{name}", ok, sev, summary, dur, {"matches": out[:5000], "stderr": err}))

    def d1_schema_checks(self) -> None:
        tables = [
            "agentsam_prompt_routes",
            "agentsam_route_requirements",
            "agentsam_tool_call_log",
            "agentsam_mcp_tool_execution",
            "mcp_workspace_tokens",
            "v_agentsam_mcp_tools_branded",
        ]
        for table in tables:
            ok, rows, err, dur = self.d1_json(
                f"d1.schema.{table}",
                f"""
                SELECT name, type, sql
                FROM sqlite_master
                WHERE name = '{table}';
                """,
                raw_name=f"d1_schema_{table}",
            )
            exists = ok and len(rows) > 0
            self.add(Check(
                f"d1.schema.{table}",
                exists,
                "fail" if table in {"agentsam_prompt_routes", "agentsam_route_requirements", "v_agentsam_mcp_tools_branded"} and not exists else "warn",
                "exists" if exists else (err or "missing"),
                dur,
                {"rows": rows},
            ))

        ok, rows, err, dur = self.d1_json(
            "d1.route_requirements.columns",
            "PRAGMA table_info(agentsam_route_requirements);",
            raw_name="d1_route_requirements_columns",
        )
        names = {r.get("name") for r in rows}
        needed = {
            "mode",
            "allowed_lanes_json",
            "required_capability_keys_json",
            "optional_capability_keys_json",
            "blocked_capability_keys_json",
            "approval_policy_json",
            "max_tools",
        }
        missing = sorted(needed - names)
        self.add(Check(
            "d1.route_requirements.deterministic_columns",
            ok and not missing,
            "fail" if missing else "info",
            f"missing={missing or 'none'}",
            dur,
            {"columns": sorted(names), "missing": missing},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.route_requirements.parent_missing",
            """
            SELECT pr.route_key, pr.display_name, pr.max_tools, pr.priority
            FROM agentsam_prompt_routes pr
            LEFT JOIN agentsam_route_requirements rr
              ON rr.route_key = pr.route_key
            WHERE pr.is_active = 1
              AND rr.route_key IS NULL
            ORDER BY pr.priority ASC, pr.route_key ASC;
            """,
            raw_name="d1_parent_routes_missing_requirements",
        )
        intentional_no_tool = {r["route_key"] for r in rows if r.get("route_key") == "simple_ask_greeting"}
        unexpected = [r for r in rows if r.get("route_key") not in intentional_no_tool]
        self.add(Check(
            "d1.route_requirements.parent_missing",
            ok and not unexpected,
            "warn" if unexpected else "info",
            f"unexpected_missing={len(unexpected)}",
            dur,
            {"missing": rows},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.route_requirements.unconfigured",
            """
            SELECT route_key, task_type, mode, max_tools, allowed_lanes_json,
                   required_capability_keys_json, optional_capability_keys_json,
                   blocked_capability_keys_json
            FROM agentsam_route_requirements
            WHERE is_active = 1
              AND (
                mode IS NULL
                OR task_type IS NULL
                OR max_tools IS NULL
                OR (max_tools > 0 AND (allowed_lanes_json IS NULL OR allowed_lanes_json = '[]'))
              )
            ORDER BY route_key, task_type, mode;
            """,
            raw_name="d1_unconfigured_route_requirements",
        )
        self.add(Check(
            "d1.route_requirements.unconfigured",
            ok and len(rows) == 0,
            "warn" if rows else "info",
            f"unconfigured={len(rows)}",
            dur,
            {"rows": rows},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.prompt_routes.priority_ladder",
            """
            SELECT route_key, display_name, max_tools, priority
            FROM agentsam_prompt_routes
            WHERE is_active = 1
            ORDER BY priority ASC, route_key ASC
            LIMIT 120;
            """,
            raw_name="d1_prompt_routes_priority_ladder",
        )
        duplicate_priorities: Dict[str, int] = {}
        if rows:
            counts: Dict[int, int] = {}
            for r in rows:
                p = r.get("priority")
                counts[p] = counts.get(p, 0) + 1
            duplicate_priorities = {str(k): v for k, v in counts.items() if v > 1}
        self.add(Check(
            "d1.prompt_routes.priority_ladder",
            ok,
            "warn" if duplicate_priorities else "info",
            f"routes={len(rows)} duplicate_priority_buckets={duplicate_priorities or 'none'}",
            dur,
            {"rows": rows, "duplicate_priority_buckets": duplicate_priorities},
        ))

    def d1_branded_tool_checks(self) -> None:
        ok, rows, err, dur = self.d1_json(
            "d1.branded_tools.summary",
            """
            SELECT
              COALESCE(capability_lane, 'null') AS capability_lane,
              COALESCE(handler_brand, 'null') AS handler_brand,
              COUNT(*) AS tools,
              SUM(CASE WHEN COALESCE(requires_approval,0)=1 THEN 1 ELSE 0 END) AS approval_tools,
              SUM(CASE WHEN COALESCE(enabled,1)=1 THEN 1 ELSE 0 END) AS enabled_tools
            FROM v_agentsam_mcp_tools_branded
            GROUP BY COALESCE(capability_lane, 'null'), COALESCE(handler_brand, 'null')
            ORDER BY tools DESC
            LIMIT 100;
            """,
            raw_name="d1_branded_tools_summary",
        )
        nullish = [r for r in rows if r.get("capability_lane") == "null" or r.get("handler_brand") in {"null", "Unknown Runtime"}]
        self.add(Check(
            "d1.branded_tools.summary",
            ok and len(rows) > 0,
            "warn" if nullish else "info",
            f"groups={len(rows)} null_or_unknown_groups={len(nullish)}",
            dur,
            {"rows": rows, "null_or_unknown_groups": nullish},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.branded_tools.unknown_rows",
            """
            SELECT id, tool_name, tool_key, tool_category, handler_type, capability_lane,
                   handler_brand, safety_badge, risk_level, requires_approval, enabled
            FROM v_agentsam_mcp_tools_branded
            WHERE capability_lane = 'general'
               OR handler_brand = 'Unknown Runtime'
               OR capability_lane IS NULL
               OR handler_brand IS NULL
            ORDER BY tool_name
            LIMIT 200;
            """,
            raw_name="d1_branded_tools_unknown_rows",
        )
        self.add(Check(
            "d1.branded_tools.unknown_rows",
            ok,
            "warn" if rows else "info",
            f"unknown_or_general={len(rows)}",
            dur,
            {"rows": rows},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.branded_tools.capability_coverage",
            """
            SELECT
              COALESCE(capability_key, '') AS capability_key,
              COUNT(*) AS tools,
              GROUP_CONCAT(tool_name, ', ') AS sample_tools
            FROM v_agentsam_mcp_tools_branded
            WHERE COALESCE(enabled,1)=1
            GROUP BY COALESCE(capability_key, '')
            ORDER BY tools DESC, capability_key ASC
            LIMIT 120;
            """,
            raw_name="d1_capability_coverage",
        )
        empty_cap = [r for r in rows if not r.get("capability_key")]
        self.add(Check(
            "d1.branded_tools.capability_coverage",
            ok,
            "warn" if empty_cap else "info",
            f"capability_groups={len(rows)} empty_capability_groups={len(empty_cap)}",
            dur,
            {"rows": rows, "empty_capability_groups": empty_cap},
        ))

    def d1_log_checks(self) -> None:
        ok, rows, err, dur = self.d1_json(
            "d1.tool_call_log.columns",
            "PRAGMA table_info(agentsam_tool_call_log);",
            raw_name="d1_tool_call_log_columns",
        )
        names = {r.get("name") for r in rows}
        wanted = {
            "tool_key",
            "capability_key",
            "handler_key",
            "route_key",
            "agentsam_tools_id",
            "agentsam_mcp_tools_id",
            "mcp_server_id",
            "server_key",
            "approval_id",
            "policy_decision_json",
            "duration_ms",
            "status",
            "error_message",
        }
        missing = sorted(wanted - names)
        self.add(Check(
            "d1.tool_call_log.identity_columns",
            ok and not missing,
            "fail" if missing else "info",
            f"missing={missing or 'none'}",
            dur,
            {"columns": sorted(names), "missing": missing},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.tool_call_log.recent_sample",
            """
            SELECT id, created_at, route_key, tool_name, tool_key, capability_key,
                   handler_key, server_key, status, duration_ms,
                   CASE WHEN error_message IS NOT NULL THEN substr(error_message, 1, 160) ELSE NULL END AS error_sample
            FROM agentsam_tool_call_log
            ORDER BY created_at DESC
            LIMIT 50;
            """,
            raw_name="d1_recent_tool_call_log",
        )
        missing_identity = [r for r in rows if not (r.get("tool_key") or r.get("capability_key") or r.get("route_key"))]
        self.add(Check(
            "d1.tool_call_log.recent_sample",
            ok,
            "warn" if missing_identity else "info",
            f"rows={len(rows)} missing_identity={len(missing_identity)}",
            dur,
            {"rows": rows, "missing_identity": missing_identity},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.mcp_execution.recent_sample",
            """
            SELECT id, created_at, tool_name, tool_key, resource_type, success,
                   duration_ms, requires_approval,
                   CASE WHEN error_message IS NOT NULL THEN substr(error_message, 1, 160) ELSE NULL END AS error_sample
            FROM agentsam_mcp_tool_execution
            ORDER BY created_at DESC
            LIMIT 50;
            """,
            raw_name="d1_recent_mcp_tool_execution",
        )
        self.add(Check(
            "d1.mcp_execution.recent_sample",
            ok,
            "info",
            f"rows={len(rows)}",
            dur,
            {"rows": rows},
        ))

    def d1_token_security_checks(self) -> None:
        ok, rows, err, dur = self.d1_json(
            "d1.mcp_workspace_tokens.columns",
            "PRAGMA table_info(mcp_workspace_tokens);",
            raw_name="d1_mcp_workspace_tokens_columns",
        )
        names = {r.get("name") for r in rows}
        wanted = {
            "token_hash",
            "last_used_at",
            "revoked_at",
            "allowed_capability_keys_json",
            "allowed_lanes_json",
            "allowed_risk_levels_json",
            "allowed_domains_json",
            "scopes_json",
        }
        missing = sorted(wanted - names)
        self.add(Check(
            "d1.mcp_workspace_tokens.security_columns",
            ok and not missing,
            "fail" if missing else "info",
            f"missing={missing or 'none'}",
            dur,
            {"columns": sorted(names), "missing": missing},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.mcp_workspace_tokens.hash_indexes",
            """
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'index'
              AND tbl_name = 'mcp_workspace_tokens'
              AND name LIKE '%hash%'
            ORDER BY name;
            """,
            raw_name="d1_mcp_workspace_tokens_hash_indexes",
        )
        has_hash_index = any("token_hash" in str(r.get("sql")) for r in rows)
        self.add(Check(
            "d1.mcp_workspace_tokens.hash_indexes",
            ok and has_hash_index,
            "warn" if not has_hash_index else "info",
            f"hash_indexes={len(rows)}",
            dur,
            {"rows": rows},
        ))

        ok, rows, err, dur = self.d1_json(
            "d1.mcp_workspace_tokens.raw_token_audit",
            """
            SELECT id, label, created_at, expires_at, is_active, revoked_at,
                   length(token_hash) AS token_hash_len,
                   CASE WHEN token_hash LIKE 'tok_%' THEN 1 ELSE 0 END AS looks_raw_tok
            FROM mcp_workspace_tokens
            WHERE token_hash LIKE 'tok_%'
               OR length(token_hash) < 40
            ORDER BY created_at DESC
            LIMIT 50;
            """,
            raw_name="d1_mcp_workspace_tokens_raw_audit",
        )
        self.add(Check(
            "d1.mcp_workspace_tokens.raw_token_audit",
            ok and len(rows) == 0,
            "fail" if rows else "info",
            f"suspicious_rows={len(rows)}",
            dur,
            {"rows": rows},
        ))

    def live_catalog_checks(self) -> None:
        base = self.args.base_url.rstrip("/")
        all_tools: List[Dict[str, Any]] = []
        for lane in SAFE_LANES:
            q = urllib.parse.urlencode({"lane": lane, "limit": str(self.args.max_tools_per_lane), "include_schema": "false"})
            url = f"{base}/api/mcp/tools/catalog?{q}"
            status, parsed, text, dur = self.http_json(
                f"http.catalog.{lane}",
                url,
                timeout=30,
                raw_name=f"http_catalog_{lane}",
            )
            tools = parsed.get("tools", []) if isinstance(parsed, dict) else []
            all_tools.extend([dict(t, _lane_query=lane) for t in tools if isinstance(t, dict)])
            ok = status == 200 and isinstance(parsed, dict) and parsed.get("ok") is True and parsed.get("source") and isinstance(tools, list)
            self.add(Check(
                f"http.catalog.{lane}",
                ok,
                "fail" if status >= 500 or status == 0 else ("warn" if not ok else "info"),
                f"status={status} count={len(tools)} ok={parsed.get('ok') if isinstance(parsed, dict) else None}",
                dur,
                {"status": status, "response": parsed},
            ))

        by_name: Dict[str, Dict[str, Any]] = {}
        for t in all_tools:
            key = t.get("tool_name") or t.get("tool_key") or t.get("id")
            if key and key not in by_name:
                by_name[key] = t
        dangerous_exposed = [
            t for t in by_name.values()
            if str(t.get("tool_name") or t.get("tool_key") or "").lower() in DANGEROUS_TOOL_NAMES
            and not t.get("requires_approval")
        ]
        self.add(Check(
            "http.catalog.aggregate_coverage",
            len(by_name) > 0 and not dangerous_exposed,
            "warn" if dangerous_exposed else "info",
            f"unique_tools={len(by_name)} dangerous_without_approval={len(dangerous_exposed)}",
            0,
            {
                "unique_tools": len(by_name),
                "lanes": SAFE_LANES,
                "dangerous_without_approval": dangerous_exposed,
                "sample": list(by_name.values())[:50],
            },
        ))

    def live_health_checks(self) -> None:
        base = self.args.base_url.rstrip("/")
        for path in ["/api/health", "/api/agent/git/status"]:
            status, parsed, text, dur = self.http_json(
                f"http{path}",
                f"{base}{path}",
                timeout=20,
                raw_name=f"http_{path.strip('/').replace('/', '_')}",
            )
            ok = status in {200, 401, 403, 404}
            sev = "warn" if status in {401, 403, 404} else "info"
            self.add(Check(
                f"http{path}",
                ok,
                sev,
                f"status={status}",
                dur,
                {"status": status, "response": parsed},
            ))

    def tool_smoke_checks(self) -> None:
        if not self.args.include_tool_smoke:
            self.add(Check("http.tool_smoke", True, "info", "skipped; pass --include-tool-smoke to run dry-run smoke requests"))
            return
        base = self.args.base_url.rstrip("/")
        # These payload shapes are intentionally conservative. Endpoint may differ; response data is still useful.
        candidates = [
            {"tool_name": "d1_query", "input": {"sql": "SELECT 1 AS ok"}, "dry_run": True, "profile": "read_only"},
            {"tool_name": "mcp_catalog_read", "input": {"lane": "develop", "limit": 3}, "dry_run": True, "profile": "read_only"},
            {"tool_name": "python_execute", "input": {"code": "print('dry run only')"}, "dry_run": True, "profile": "default_safe"},
            {"tool_name": "worker_deploy", "input": {}, "dry_run": True, "profile": "default_safe"},
        ]
        for i, payload in enumerate(candidates, 1):
            status, parsed, text, dur = self.http_json(
                f"http.tool_smoke.{payload['tool_name']}",
                f"{base}/api/agent/tool-smoke",
                method="POST",
                body=payload,
                timeout=45,
                raw_name=f"http_tool_smoke_{i}_{payload['tool_name']}",
            )
            expected_safe = payload["tool_name"] in {"python_execute", "worker_deploy"}
            ok = status in {200, 202, 401, 403, 404, 422}
            sev = "warn" if status in {401, 403, 404, 422} else "info"
            summary = f"status={status}"
            if isinstance(parsed, dict):
                summary += f" ok={parsed.get('ok')} skipped={parsed.get('skipped')} reason={parsed.get('reason') or parsed.get('error')}"
            self.add(Check(
                f"http.tool_smoke.{payload['tool_name']}",
                ok,
                sev,
                summary,
                dur,
                {"status": status, "payload": payload, "response": parsed, "expected_safe_skip": expected_safe},
            ))

    def agent_chat_dry_run_checks(self) -> None:
        if not self.args.include_agent_chat_dry_run:
            self.add(Check("http.agent_chat_dry_run", True, "info", "skipped; pass --include-agent-chat-dry-run to run"))
            return
        base = self.args.base_url.rstrip("/")
        prompts = [
            {
                "name": "simple_greeting_should_have_no_tools",
                "body": {
                    "message": "hey",
                    "route_key": "simple_ask_greeting",
                    "task_type": "ask",
                    "mode": "default",
                    "dry_run": True,
                },
            },
            {
                "name": "debug_should_have_inspect_observe_develop_tools",
                "body": {
                    "message": "debug why /api/mcp/tools/catalog returns an unexpected shape; dry run only",
                    "route_key": "agent_debug",
                    "task_type": "debug",
                    "mode": "default",
                    "dry_run": True,
                },
            },
            {
                "name": "database_should_require_approval_for_mutation",
                "body": {
                    "message": "inspect D1 route requirements and do not mutate; dry run only",
                    "route_key": "agent_database",
                    "task_type": "database",
                    "mode": "approved_mutation",
                    "dry_run": True,
                },
            },
        ]
        for item in prompts:
            status, parsed, text, dur = self.http_json(
                f"http.agent_chat_dry_run.{item['name']}",
                f"{base}/api/agent/chat",
                method="POST",
                body=item["body"],
                timeout=60,
                raw_name=f"http_agent_chat_dry_run_{item['name']}",
            )
            # SSE may come back as non-JSON; raw text is captured in _non_json.
            ok = status in {200, 202, 401, 403, 404, 422}
            sev = "warn" if status in {401, 403, 404, 422} else "info"
            self.add(Check(
                f"http.agent_chat_dry_run.{item['name']}",
                ok,
                sev,
                f"status={status}",
                dur,
                {"status": status, "response": parsed},
            ))

    def mcp_server_checks(self) -> None:
        if not self.args.mcp_server_url:
            self.add(Check("mcp_server", True, "info", "skipped; pass --mcp-server-url to test bridge server"))
            return
        base = self.args.mcp_server_url.rstrip("/")
        headers = {}
        if self.mcp_token:
            headers["Authorization"] = f"Bearer {self.mcp_token}"
        paths = [
            "/health",
            "/api/health",
            "/tools",
            "/api/tools",
            "/workspace",
            "/api/workspace",
        ]
        for path in paths:
            status, parsed, text, dur = self.http_json(
                f"mcp_server{path}",
                f"{base}{path}",
                headers=headers,
                timeout=25,
                raw_name=f"mcp_server_{path.strip('/').replace('/', '_') or 'root'}",
            )
            ok = status in {200, 204, 401, 403, 404, 405}
            sev = "warn" if status in {401, 403, 404, 405} else "info"
            self.add(Check(
                f"mcp_server{path}",
                ok,
                sev,
                f"status={status}",
                dur,
                {"status": status, "response": parsed},
            ))

    def derive_recommendations(self) -> List[str]:
        recs: List[str] = []
        by_name = {c.name: c for c in self.checks}

        def failed(prefix: str) -> List[Check]:
            return [c for c in self.checks if c.name.startswith(prefix) and not c.ok]

        if failed("d1.route_requirements.deterministic_columns"):
            recs.append("Stop tomorrow's sprint until agentsam_route_requirements has all deterministic tool-routing columns in production D1.")
        if failed("d1.route_requirements.parent_missing"):
            recs.append("Add or map route requirement rows for every active specialized route so priority-selected routes do not fall into generic/default tool guessing.")
        if failed("d1.branded_tools.unknown_rows"):
            recs.append("Clean up general/Unknown Runtime MCP rows or intentionally tag them with capability_lane, handler_brand, capability_key, risk_level, and approval flags.")
        if failed("d1.mcp_workspace_tokens.raw_token_audit"):
            recs.append("Rotate/revoke MCP workspace tokens before enabling bridge traffic; suspicious token_hash rows indicate raw/short token material may exist.")
        if failed("http.catalog."):
            recs.append("Fix /api/mcp/tools/catalog before deeper agent tests; chat routing depends on the branded catalog.")
        if any(c.name.startswith("http.catalog.") and c.ok is False for c in self.checks):
            recs.append("Catalog endpoint is not stable for all lanes; inspect raw/http_catalog_*.json in the artifact folder.")
        if any(c.name == "http.catalog.aggregate_coverage" and c.severity == "warn" for c in self.checks):
            recs.append("Review dangerous_without_approval tools in report.json and enforce approval_policy_json or requires_approval in the branded view.")
        if not recs:
            recs.append("Core routing/catalog/security checks look sprint-ready. Next sprint should focus on live dry-run UX proof: selected route, selected tools, denied tools, approval reason, and ledger IDs rendered inside /dashboard/agent.")
        return recs

    def write_reports(self) -> None:
        checks = [c.as_dict() for c in self.checks]
        counts = {
            "total": len(self.checks),
            "ok": sum(1 for c in self.checks if c.ok),
            "warn": sum(1 for c in self.checks if (not c.ok and c.severity == "warn") or (c.ok and c.severity == "warn")),
            "fail": sum(1 for c in self.checks if not c.ok and c.severity == "fail"),
        }
        recommendations = self.derive_recommendations()
        report = {
            "generated_at": iso_now(),
            "repo": str(self.repo),
            "base_url": self.args.base_url,
            "db": self.args.db,
            "wrangler_config": self.args.wrangler_config,
            "counts": counts,
            "recommendations": recommendations,
            "checks": checks,
        }
        write_json(self.out_dir / "report.json", report)

        lines = []
        lines.append("# Agent Sam MCP / Tool E2E Audit Sprint Report")
        lines.append("")
        lines.append(f"- Generated: `{report['generated_at']}`")
        lines.append(f"- Repo: `{report['repo']}`")
        lines.append(f"- Base URL: `{report['base_url']}`")
        lines.append(f"- D1 DB: `{report['db']}`")
        lines.append(f"- Counts: `{counts}`")
        lines.append("")
        lines.append("## Sprint Recommendations")
        lines.append("")
        for r in recommendations:
            lines.append(f"- {r}")
        lines.append("")
        lines.append("## Checks")
        lines.append("")
        lines.append("| Status | Severity | Check | Duration | Summary |")
        lines.append("|---|---:|---|---:|---|")
        for c in self.checks:
            status = "OK" if c.ok else "FAIL"
            summary = str(c.summary).replace("|", "\\|").replace("\n", " ")[:220]
            lines.append(f"| {status} | {c.severity} | `{c.name}` | {c.duration_ms}ms | {summary} |")
        lines.append("")
        lines.append("## Raw Artifacts")
        lines.append("")
        lines.append(f"Raw command/HTTP/D1 outputs are under `{self.raw_dir}`.")
        lines.append("")
        write_text(self.out_dir / "report.md", "\n".join(lines) + "\n")
        print("")
        print(f"[done] report: {self.out_dir / 'report.md'}")
        print(f"[done] json:   {self.out_dir / 'report.json'}")

    def run(self) -> int:
        self.preflight()
        self.static_checks()
        self.d1_schema_checks()
        self.d1_branded_tool_checks()
        self.d1_log_checks()
        self.d1_token_security_checks()
        self.live_health_checks()
        self.live_catalog_checks()
        self.tool_smoke_checks()
        self.agent_chat_dry_run_checks()
        self.mcp_server_checks()
        self.write_reports()

        hard_fail = any((not c.ok and c.severity == "fail") for c in self.checks)
        return 2 if hard_fail else 0


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Agent Sam MCP/tool E2E sprint audit.")
    parser.add_argument("--repo", default=os.getcwd(), help="Repo root. Default: current directory.")
    parser.add_argument("--base-url", default="https://inneranimalmedia.com", help="Live Worker base URL.")
    parser.add_argument("--db", default="inneranimalmedia-business", help="Cloudflare D1 database name.")
    parser.add_argument("--wrangler-config", default="wrangler.production.toml", help="Wrangler config file.")
    parser.add_argument("--session-cookie-file", default="~/.iam-session-cookie", help="File containing IAM session cookie.")
    parser.add_argument("--max-tools-per-lane", type=int, default=24, help="Catalog tools per lane to fetch.")
    parser.add_argument("--include-tool-smoke", action="store_true", help="Call /api/agent/tool-smoke with dry_run=true payloads.")
    parser.add_argument("--include-agent-chat-dry-run", action="store_true", help="Call /api/agent/chat with dry_run=true probes.")
    parser.add_argument("--mcp-server-url", default="", help="Optional inneranimalmedia-mcp-server base URL.")
    parser.add_argument("--mcp-token-env", default="IAM_MCP_TOKEN", help="Env var holding MCP bearer token for server checks.")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    audit = SprintAudit(args)
    return audit.run()


if __name__ == "__main__":
    raise SystemExit(main())
