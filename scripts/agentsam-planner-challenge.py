#!/usr/bin/env python3
"""
Agent Sam DB-Driven Planner Challenge

Purpose:
- Audit the repo for the correct DB-driven path before/after Cursor ships planner/task-executor work.
- Inspect D1 table schemas through wrangler.
- Verify GPT-5.4 mini/nano catalog shape.
- Find hardcoded GPT-4.1 fallbacks and direct /chat/completions bypasses.
- Locate existing routing/workflow/SSE/terminal/db-approval paths.
- Optionally compare local Ollama classification behavior against deterministic expectations.
- Optionally call OpenAI Responses for gpt-5.4-nano / gpt-5.4-mini if OPENAI_API_KEY is present.
- Save a repair-oriented report to artifacts/agentsam-planner-challenge-report.json.

Run from repo root:
  python3 scripts/agentsam-planner-challenge.py

Useful env vars:
  IAM_D1_DB=inneranimalmedia-business
  IAM_WRANGLER_CONFIG=wrangler.production.toml
  IAM_D1_REMOTE=1
  OLLAMA_BASE_URL=http://localhost:11434
  OLLAMA_MODEL=qwen2.5-coder:7b
  OPENAI_API_KEY=...
  OPENAI_BASE_URL=https://api.openai.com/v1
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_ROOT = Path.cwd()
SRC_DIR = REPO_ROOT / "src"
SCRIPTS_DIR = REPO_ROOT / "scripts"
ARTIFACTS_DIR = REPO_ROOT / "artifacts"
REPORT_PATH = ARTIFACTS_DIR / "agentsam-planner-challenge-report.json"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in ("0", "false", "False", "no")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

NANO_MODEL_KEY = "gpt-5.4-nano"
MINI_MODEL_KEY = "gpt-5.4-mini"

TABLES_TO_INSPECT = [
    "agentsam_model_catalog",
    "agentsam_prompt_routes",
    "agentsam_route_requirements",
    "agentsam_routing_arms",
    "agentsam_model_routing_memory",
    "agentsam_workflows",
    "agentsam_mcp_workflows",
    "agentsam_mcp_tools",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_workflow_runs",
    "agentsam_tool_chain",
    "agentsam_usage_events",
    "agentsam_analytics",
    "agentsam_command_pattern",
    "agentsam_commands",
    "agentsam_slash_commands",
]

SAMPLE_MESSAGES = [
    {
        "message": "hey what can you do",
        "expected_type": "conversation",
        "should_create_plan": False,
        "requires_approval": False,
    },
    {
        "message": "build me an analytics dashboard connected to our D1 data",
        "expected_type": "work_goal",
        "should_create_plan": True,
        "requires_approval": False,
    },
    {
        "message": "run scaffold-new-worker",
        "expected_type": "workflow_request",
        "should_create_plan": False,
        "requires_approval": False,
    },
    {
        "message": "audit our agentsam_model_catalog routing",
        "expected_type": "work_goal",
        "should_create_plan": True,
        "requires_approval": False,
    },
    {
        "message": "fix the broken dashboard deploy process",
        "expected_type": "work_goal",
        "should_create_plan": True,
        "requires_approval": True,
    },
    {
        "message": "show me the latest workflow failures",
        "expected_type": "db_request",
        "should_create_plan": True,
        "requires_approval": False,
    },
    {
        "message": "write a migration for agentsam_plan_tasks",
        "expected_type": "work_goal",
        "should_create_plan": True,
        "requires_approval": True,
    },
    {
        "message": "thanks",
        "expected_type": "conversation",
        "should_create_plan": False,
        "requires_approval": False,
    },
    {
        "message": "deploy the worker",
        "expected_type": "terminal_request",
        "should_create_plan": True,
        "requires_approval": True,
    },
    {
        "message": "delete all failed R2 uploads",
        "expected_type": "terminal_request",
        "should_create_plan": True,
        "requires_approval": True,
    },
]


# ---------------------------------------------------------------------------
# Basic shell/file helpers
# ---------------------------------------------------------------------------

def run_cmd(cmd: List[str], *, timeout: int = 45) -> Dict[str, Any]:
    start = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }
    except subprocess.TimeoutExpired as e:
        return {
            "ok": False,
            "returncode": None,
            "stdout": e.stdout or "",
            "stderr": e.stderr or f"timeout after {timeout}s",
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }
    except Exception as e:
        return {
            "ok": False,
            "returncode": None,
            "stdout": "",
            "stderr": str(e),
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }


def read_text_safe(path: Path) -> str:
    try:
        return path.read_text(errors="ignore")
    except Exception:
        return ""


def iter_repo_files() -> List[Path]:
    ignored_dirs = {
        ".git",
        "node_modules",
        ".wrangler",
        "dist",
        "build",
        ".next",
        ".turbo",
        "coverage",
        "__pycache__",
    }
    allowed_suffixes = {
        ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
        ".py", ".sql", ".json", ".toml", ".md",
    }

    files: List[Path] = []
    for base in [SRC_DIR, SCRIPTS_DIR, REPO_ROOT / "migrations"]:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            if any(part in ignored_dirs for part in p.parts):
                continue
            if p.suffix in allowed_suffixes:
                files.append(p)
    return files


def grep_repo(pattern: str, *, paths: Optional[List[Path]] = None) -> List[Dict[str, Any]]:
    rx = re.compile(pattern)
    hits: List[Dict[str, Any]] = []
    for path in paths or iter_repo_files():
        text = read_text_safe(path)
        if not text:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                hits.append({
                    "path": str(path.relative_to(REPO_ROOT)),
                    "line": i,
                    "text": line.strip()[:500],
                })
    return hits


def path_exists(rel: str) -> bool:
    return (REPO_ROOT / rel).exists()


# ---------------------------------------------------------------------------
# D1 / Wrangler
# ---------------------------------------------------------------------------

def wrangler_available() -> bool:
    return shutil.which("npx") is not None and path_exists(WRANGLER_CONFIG)


def wrangler_d1_sql(sql: str, *, timeout: int = 60) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    return run_cmd(cmd, timeout=timeout)


def parse_wrangler_json(stdout: str) -> Any:
    stdout = stdout.strip()
    if not stdout:
        return None

    # Wrangler often prints pure JSON with --json, but keep this tolerant.
    try:
        return json.loads(stdout)
    except Exception:
        pass

    first_bracket = min(
        [x for x in [stdout.find("["), stdout.find("{")] if x >= 0],
        default=-1,
    )
    if first_bracket >= 0:
        try:
            return json.loads(stdout[first_bracket:])
        except Exception:
            return None
    return None


def inspect_table_schema(table: str) -> Dict[str, Any]:
    result = wrangler_d1_sql(f"PRAGMA table_info({table});")
    parsed = parse_wrangler_json(result.get("stdout", ""))

    rows = []
    if isinstance(parsed, list) and parsed:
        first = parsed[0]
        if isinstance(first, dict):
            rows = first.get("results") or first.get("result") or []
    elif isinstance(parsed, dict):
        rows = parsed.get("results") or parsed.get("result") or []

    return {
        "table": table,
        "ok": result["ok"] and len(rows) > 0,
        "columns": rows,
        "raw_ok": result["ok"],
        "stderr": result.get("stderr", "")[-1000:],
    }


def inspect_catalog_shape() -> Dict[str, Any]:
    sql = """
SELECT model_key, provider, api_platform, openai_model_id, is_active
FROM agentsam_model_catalog
WHERE model_key IN ('gpt-5.4-mini','gpt-5.4-nano');
""".strip()
    result = wrangler_d1_sql(sql)
    parsed = parse_wrangler_json(result.get("stdout", ""))

    rows = []
    if isinstance(parsed, list) and parsed:
        rows = parsed[0].get("results") or []
    elif isinstance(parsed, dict):
        rows = parsed.get("results") or []

    expected = {
        "gpt-5.4-mini": {
            "provider": "openai",
            "api_platform": "openai_responses",
            "openai_model_id": "gpt-5.4-mini",
            "is_active": 1,
        },
        "gpt-5.4-nano": {
            "provider": "openai",
            "api_platform": "openai_responses",
            "openai_model_id": "gpt-5.4-nano",
            "is_active": 1,
        },
    }

    checks = []
    by_key = {r.get("model_key"): r for r in rows if isinstance(r, dict)}
    for key, exp in expected.items():
        row = by_key.get(key)
        checks.append({
            "model_key": key,
            "found": bool(row),
            "row": row,
            "matches_expected": bool(row) and all(str(row.get(k)) == str(v) for k, v in exp.items()),
        })

    return {
        "ok": result["ok"],
        "rows": rows,
        "checks": checks,
        "stderr": result.get("stderr", "")[-1000:],
    }


# ---------------------------------------------------------------------------
# Static audit
# ---------------------------------------------------------------------------

def classify_grep_hits() -> Dict[str, Any]:
    files = iter_repo_files()

    gpt41_hits = grep_repo(r"gpt-4\.1-nano|gpt-4\.1-mini", paths=files)
    gpt54_hits = grep_repo(r"gpt-5\.4-nano|gpt-5\.4-mini", paths=files)
    chat_completions_hits = grep_repo(r"chat/completions|/v1/chat/completions", paths=files)
    responses_hits = grep_repo(r"/responses|OPENAI_BASE.*/responses|openai_responses", paths=files)

    dispatch_hits = grep_repo(
        r"dispatchComplete|dispatchStream|completeWithOpenAIResponsesNonStream|chatWithToolsOpenAIResponses|completeWithOpenAI\(",
        paths=files,
    )
    workflow_hits = grep_repo(
        r"executeWorkflowGraph|executeWorkflowAndStream|resolveWorkflowForMessage",
        paths=files,
    )
    sse_hits = grep_repo(
        r"consumeAgentChatSseBody|EventSource|text/event-stream|plan_created|task_start|task_complete|workflow_step|workflow_complete",
        paths=files,
    )
    terminal_hits = grep_repo(
        r"TERMINAL_WS_URL|TERMINAL_SECRET|/terminal|terminal_request|PTY|pty|exec",
        paths=files,
    )
    approval_hits = grep_repo(
        r"approval_required|requires_approval|agentsam_approval_queue|approval|safe_to_run|owner_only|destructive",
        paths=files,
    )

    def is_adapter_hit(hit: Dict[str, Any]) -> bool:
        return hit["path"] == "src/integrations/openai.js"

    def runtime_src(hit: Dict[str, Any]) -> bool:
        return hit["path"].startswith("src/")

    dangerous_chat_hits = [
        h for h in chat_completions_hits
        if runtime_src(h) and not is_adapter_hit(h) and "comment" not in h["text"].lower()
    ]
    dangerous_gpt41_hits = [
        h for h in gpt41_hits
        if runtime_src(h)
    ]

    return {
        "counts": {
            "gpt41_hits": len(gpt41_hits),
            "gpt54_hits": len(gpt54_hits),
            "chat_completions_hits": len(chat_completions_hits),
            "dangerous_chat_completions_hits": len(dangerous_chat_hits),
            "dangerous_gpt41_hits": len(dangerous_gpt41_hits),
            "responses_hits": len(responses_hits),
            "dispatch_hits": len(dispatch_hits),
            "workflow_hits": len(workflow_hits),
            "sse_hits": len(sse_hits),
            "terminal_hits": len(terminal_hits),
            "approval_hits": len(approval_hits),
        },
        "dangerous_chat_completions_hits": dangerous_chat_hits,
        "dangerous_gpt41_hits": dangerous_gpt41_hits,
        "chat_completions_hits": chat_completions_hits[:100],
        "gpt41_hits": gpt41_hits[:100],
        "gpt54_hits": gpt54_hits[:100],
        "dispatch_hits": dispatch_hits[:120],
        "workflow_hits": workflow_hits[:120],
        "sse_hits": sse_hits[:120],
        "terminal_hits": terminal_hits[:120],
        "approval_hits": approval_hits[:120],
    }


def inspect_key_files() -> Dict[str, Any]:
    key_paths = [
        "src/core/provider.js",
        "src/integrations/openai.js",
        "src/core/workflow-executor.js",
        "src/api/agent.js",
        "src/core/agentsam-planner.js",
        "src/core/agentsam-task-executor.js",
        "src/core/capability-router.js",
        "src/core/gate.js",
        "src/api/search.js",
        "src/api/workflow/summary.js",
        "src/tools/builtin/ai-ops.js",
        "src/api/command-run-telemetry.js",
        "src/api/terminal.js",
    ]

    out: Dict[str, Any] = {}
    for rel in key_paths:
        p = REPO_ROOT / rel
        text = read_text_safe(p)
        out[rel] = {
            "exists": p.exists(),
            "line_count": len(text.splitlines()) if text else 0,
            "has_dispatchComplete": "dispatchComplete" in text,
            "has_openai_responses": "openai_responses" in text,
            "has_chat_completions": "chat/completions" in text or "/v1/chat/completions" in text,
            "has_gpt41": "gpt-4.1-" in text,
            "has_gpt54": "gpt-5.4-" in text,
            "has_executeWorkflowGraph": "executeWorkflowGraph" in text,
            "has_plan_events": any(x in text for x in ["plan_created", "task_start", "plan_complete"]),
            "has_approval_terms": any(x in text for x in ["approval_required", "requires_approval", "agentsam_approval_queue", "safe_to_run"]),
        }
    return out


# ---------------------------------------------------------------------------
# Deterministic classifier and optional model calls
# ---------------------------------------------------------------------------

CONVERSATIONAL_RE = re.compile(
    r"^(hi|hello|hey|sup|yo|thanks|thank you|ok|okay|sure|got it|nice|cool|great|what can you do|what do you do|who are you|what are you|help)\b",
    re.I,
)
WORK_RE = re.compile(
    r"\b(build|create|generate|write|make|scaffold|fix|refactor|add|update|migrate|setup|configure|connect|implement|design|analyze|audit|debug|repair)\b",
    re.I,
)
WORKFLOW_RE = re.compile(r"\b(run|trigger|start|execute)\s+([a-z0-9][a-z0-9_-]{2,})\b", re.I)
TERMINAL_RE = re.compile(r"\b(deploy|curl|grep|wrangler|npm|git|bash|shell|terminal|delete|remove|rm|exec)\b", re.I)
DB_RE = re.compile(r"\b(d1|sql|database|table|schema|query|migration|select|insert|update|delete)\b", re.I)
DESTRUCTIVE_RE = re.compile(r"\b(delete|remove|drop|truncate|deploy|migration|secret|token|env|production|r2 uploads|failed uploads)\b", re.I)


def deterministic_classify(message: str) -> Dict[str, Any]:
    m = message.strip()
    words = re.findall(r"\S+", m)

    if not m:
        return {
            "message_type": "conversation",
            "confidence": 1.0,
            "should_create_plan": False,
            "requires_approval": False,
            "recommended_runtime": "none",
            "recommended_model_key": None,
            "reason": "empty message",
        }

    if CONVERSATIONAL_RE.search(m) or len(words) < 3:
        return {
            "message_type": "conversation",
            "confidence": 0.9,
            "should_create_plan": False,
            "requires_approval": False,
            "recommended_runtime": "gpt-5.4-nano",
            "recommended_model_key": NANO_MODEL_KEY,
            "reason": "short conversational message",
        }

    wf = WORKFLOW_RE.search(m)
    if wf:
        requires_approval = bool(DESTRUCTIVE_RE.search(m))
        return {
            "message_type": "workflow_request",
            "confidence": 0.78,
            "suggested_workflow_key": wf.group(2),
            "should_create_plan": False,
            "requires_approval": requires_approval,
            "recommended_runtime": "workflow",
            "recommended_model_key": None,
            "reason": "explicit run/execute phrase plus workflow-like key",
        }

    if TERMINAL_RE.search(m) and DESTRUCTIVE_RE.search(m):
        return {
            "message_type": "terminal_request",
            "confidence": 0.82,
            "should_create_plan": True,
            "requires_approval": True,
            "recommended_runtime": "gpt-5.4-mini",
            "recommended_model_key": MINI_MODEL_KEY,
            "reason": "terminal/destructive operation should be planned and approval-gated",
        }

    if DB_RE.search(m):
        return {
            "message_type": "db_request",
            "confidence": 0.74,
            "should_create_plan": True,
            "requires_approval": bool(DESTRUCTIVE_RE.search(m)),
            "recommended_runtime": "gpt-5.4-mini",
            "recommended_model_key": MINI_MODEL_KEY,
            "reason": "DB/schema/query language detected",
        }

    if WORK_RE.search(m):
        return {
            "message_type": "work_goal",
            "confidence": 0.78,
            "should_create_plan": True,
            "requires_approval": bool(DESTRUCTIVE_RE.search(m)),
            "recommended_runtime": "gpt-5.4-mini",
            "recommended_model_key": MINI_MODEL_KEY,
            "reason": "work intent verb detected",
        }

    return {
        "message_type": "unclear",
        "confidence": 0.45,
        "should_create_plan": False,
        "requires_approval": False,
        "recommended_runtime": "gpt-5.4-nano",
        "recommended_model_key": NANO_MODEL_KEY,
        "reason": "no strong deterministic route",
    }


CLASSIFIER_SYSTEM = """You are an Agent Sam route classifier.
Return ONLY valid JSON with:
{
  "message_type": "conversation|work_goal|workflow_request|terminal_request|db_request|tool_request|unclear",
  "confidence": 0.0,
  "suggested_route_key": null,
  "suggested_workflow_key": null,
  "should_create_plan": true,
  "recommended_model_key": "gpt-5.4-nano|gpt-5.4-mini|local_coder|auto",
  "requires_approval": true,
  "reason": "short explanation"
}
Rules:
- greetings/thanks/short chat are conversation and should_create_plan=false
- deployment/delete/secret/migration/destructive terminal/db actions require approval
- explicit "run <workflow-key>" is workflow_request if it looks like a workflow key
- analytics/dashboard/audit/fix/build/write/update are usually work_goal
"""


def http_json(
    url: str,
    payload: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 20,
) -> Tuple[bool, Dict[str, Any], str]:
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                **(headers or {}),
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return True, json.loads(raw), raw
            except Exception:
                return True, {}, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        return False, {"status": e.code, "body": body[:2000]}, body
    except Exception as e:
        return False, {"error": str(e)}, ""


def try_parse_json_text(text: str) -> Dict[str, Any]:
    if not text:
        return {"ok": False, "error": "empty"}
    cleaned = re.sub(r"```(?:json)?|```", "", text).strip()
    try:
        return {"ok": True, "data": json.loads(cleaned)}
    except Exception:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            return {"ok": True, "data": json.loads(cleaned[start:end + 1])}
        except Exception as e:
            return {"ok": False, "error": str(e), "raw": cleaned[:2000]}
    return {"ok": False, "error": "no JSON object found", "raw": cleaned[:2000]}


def ollama_available() -> bool:
    try:
        with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def classify_with_ollama(message: str) -> Dict[str, Any]:
    if not ollama_available():
        return {"skipped": True, "reason": "Ollama unavailable"}

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": CLASSIFIER_SYSTEM},
            {"role": "user", "content": message},
        ],
        "options": {"temperature": 0},
    }
    ok, data, raw = http_json(f"{OLLAMA_BASE_URL}/api/chat", payload, timeout=30)
    if not ok:
        return {"ok": False, "error": data}

    text = data.get("message", {}).get("content", "") if isinstance(data, dict) else raw
    parsed = try_parse_json_text(text)
    return {
        "ok": parsed["ok"],
        "model": OLLAMA_MODEL,
        "raw_text": text[:2000],
        "parsed": parsed.get("data"),
        "error": parsed.get("error"),
    }


def classify_with_openai(message: str, model: str) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        return {"skipped": True, "reason": "OPENAI_API_KEY not set"}

    payload = {
        "model": model,
        "instructions": CLASSIFIER_SYSTEM,
        "input": [{"role": "user", "content": message}],
        "stream": False,
        "reasoning": {"effort": "low"},
        "text": {"verbosity": "low"},
    }
    ok, data, raw = http_json(
        f"{OPENAI_BASE_URL}/responses",
        payload,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        timeout=45,
    )
    if not ok:
        return {"ok": False, "model": model, "error": data}

    text = ""
    if isinstance(data, dict):
        if isinstance(data.get("output_text"), str):
            text = data["output_text"]
        elif isinstance(data.get("output"), list):
            parts = []
            for item in data.get("output") or []:
                for c in item.get("content") or []:
                    if isinstance(c, dict) and isinstance(c.get("text"), str):
                        parts.append(c["text"])
            text = "".join(parts)

    parsed = try_parse_json_text(text)
    return {
        "ok": parsed["ok"],
        "model": model,
        "raw_text": text[:2000],
        "parsed": parsed.get("data"),
        "error": parsed.get("error"),
        "response_id": data.get("id") if isinstance(data, dict) else None,
    }


def run_message_challenge() -> List[Dict[str, Any]]:
    rows = []
    for sample in SAMPLE_MESSAGES:
        msg = sample["message"]
        deterministic = deterministic_classify(msg)

        # Keep OpenAI calls optional and conservative. Nano is enough to compare route classifier.
        # Mini is called only for work-like messages to avoid wasting tokens if env is present.
        ollama_result = classify_with_ollama(msg)
        nano_result = classify_with_openai(msg, NANO_MODEL_KEY)

        mini_result: Dict[str, Any]
        if deterministic["message_type"] in {"work_goal", "db_request", "terminal_request", "workflow_request"}:
            mini_result = classify_with_openai(msg, MINI_MODEL_KEY)
        else:
            mini_result = {"skipped": True, "reason": "not work-like"}

        recommended_runtime = deterministic["recommended_runtime"]
        notes = []
        if sample["expected_type"] != deterministic["message_type"]:
            notes.append(f"deterministic mismatch: expected {sample['expected_type']} got {deterministic['message_type']}")
        if sample["requires_approval"] and not deterministic["requires_approval"]:
            notes.append("expected approval but deterministic did not require it")
        if sample["should_create_plan"] != deterministic["should_create_plan"]:
            notes.append("plan expectation mismatch")

        rows.append({
            "message": msg,
            "expected_type": sample["expected_type"],
            "expected_should_create_plan": sample["should_create_plan"],
            "expected_requires_approval": sample["requires_approval"],
            "deterministic_result": deterministic,
            "ollama_result": ollama_result,
            "nano_result": nano_result,
            "mini_result": mini_result,
            "recommended_runtime": recommended_runtime,
            "should_create_plan": deterministic["should_create_plan"],
            "requires_approval": deterministic["requires_approval"],
            "notes": notes or ["ok"],
        })
    return rows


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------

def build_repair_recommendations(
    schema_report: Dict[str, Any],
    catalog_report: Dict[str, Any],
    static_report: Dict[str, Any],
    key_files: Dict[str, Any],
) -> List[Dict[str, Any]]:
    recs: List[Dict[str, Any]] = []

    if not catalog_report.get("ok"):
        recs.append({
            "priority": "P0",
            "area": "model_catalog",
            "issue": "Could not verify agentsam_model_catalog through wrangler.",
            "recommendation": "Fix D1/wrangler access before shipping model-router changes.",
        })
    else:
        for check in catalog_report.get("checks", []):
            if not check.get("matches_expected"):
                recs.append({
                    "priority": "P0",
                    "area": "model_catalog",
                    "issue": f"{check.get('model_key')} does not match expected openai/openai_responses shape.",
                    "recommendation": "Do not downgrade to GPT-4.1. Restore provider=openai, api_platform=openai_responses, openai_model_id equal to model_key, is_active=1.",
                })

    danger_chat = static_report["counts"]["dangerous_chat_completions_hits"]
    if danger_chat:
        recs.append({
            "priority": "P0",
            "area": "provider_bypass",
            "issue": f"{danger_chat} runtime /chat/completions hits outside src/integrations/openai.js.",
            "recommendation": "Route these through dispatchComplete/dispatchStream or correct Responses adapter if the model comes from agentsam_model_catalog.",
            "hits": static_report["dangerous_chat_completions_hits"][:20],
        })

    danger_gpt41 = static_report["counts"]["dangerous_gpt41_hits"]
    if danger_gpt41:
        recs.append({
            "priority": "P0",
            "area": "legacy_model_defaults",
            "issue": f"{danger_gpt41} runtime GPT-4.1 fallback hits in src.",
            "recommendation": "Replace runtime GPT-4.1 defaults with DB-driven catalog lookup, or fallback to gpt-5.4-nano/mini where safe.",
            "hits": static_report["dangerous_gpt41_hits"][:20],
        })

    plans_schema = schema_report.get("agentsam_plans", {})
    tasks_schema = schema_report.get("agentsam_plan_tasks", {})
    if not plans_schema.get("ok") or not tasks_schema.get("ok"):
        recs.append({
            "priority": "P0",
            "area": "planner_persistence",
            "issue": "agentsam_plans or agentsam_plan_tasks schema was not found/inspectable.",
            "recommendation": "Do not ship planner persistence until actual columns are confirmed. Avoid adding columns.",
        })

    if not key_files.get("src/core/workflow-executor.js", {}).get("has_executeWorkflowGraph"):
        recs.append({
            "priority": "P1",
            "area": "workflow_execution",
            "issue": "executeWorkflowGraph not found in src/core/workflow-executor.js by static scan.",
            "recommendation": "Inspect actual workflow executor export before wiring workflow tasks.",
        })

    if not static_report["counts"]["approval_hits"]:
        recs.append({
            "priority": "P1",
            "area": "approval_safety",
            "issue": "No obvious approval/safety paths found by static scan.",
            "recommendation": "Do not auto-execute terminal/db-write/destructive tasks. Mark as approval_required/blocked/proposed in first pass.",
        })

    if not key_files.get("src/core/agentsam-planner.js", {}).get("exists"):
        recs.append({
            "priority": "P2",
            "area": "planner_module",
            "issue": "Planner module not present yet.",
            "recommendation": "Create a thin DB-aware planner module that uses dispatchComplete and actual agentsam_plans columns.",
        })

    if not key_files.get("src/core/agentsam-task-executor.js", {}).get("exists"):
        recs.append({
            "priority": "P2",
            "area": "task_executor_module",
            "issue": "Task executor module not present yet.",
            "recommendation": "Create executor that persists task state and emits SSE, but blocks terminal/destructive DB work unless existing approval path permits it.",
        })

    if static_report["counts"]["sse_hits"] == 0:
        recs.append({
            "priority": "P2",
            "area": "frontend_sse",
            "issue": "No SSE consumer/event handling found by static scan.",
            "recommendation": "Find actual Agent Sam chat stream consumer before adding plan/task event UI.",
        })

    return recs


def build_db_driven_map(schema_report: Dict[str, Any]) -> Dict[str, Any]:
    def cols(table: str) -> List[str]:
        return [c.get("name") for c in schema_report.get(table, {}).get("columns", []) if isinstance(c, dict)]

    return {
        "model_resolution": {
            "tables": {
                "agentsam_model_catalog": cols("agentsam_model_catalog"),
                "agentsam_prompt_routes": cols("agentsam_prompt_routes"),
                "agentsam_route_requirements": cols("agentsam_route_requirements"),
                "agentsam_routing_arms": cols("agentsam_routing_arms"),
                "agentsam_model_routing_memory": cols("agentsam_model_routing_memory"),
            },
            "guidance": [
                "Use agentsam_model_catalog as source of provider/api_platform/openai_model_id.",
                "Use is_active, not is_enabled.",
                "Use route/routing arms if populated before falling back to hardcoded model keys.",
            ],
        },
        "workflow_resolution": {
            "tables": {
                "agentsam_workflows": cols("agentsam_workflows"),
                "agentsam_mcp_workflows": cols("agentsam_mcp_workflows"),
                "agentsam_mcp_tools": cols("agentsam_mcp_tools"),
            },
            "guidance": [
                "Resolve exact workflow_key before planner creation.",
                "Call executeWorkflowGraph for workflow execution.",
                "Avoid inventing a parallel MCP path if workflow executor already dispatches tools.",
            ],
        },
        "planner_persistence": {
            "tables": {
                "agentsam_plans": cols("agentsam_plans"),
                "agentsam_plan_tasks": cols("agentsam_plan_tasks"),
            },
            "guidance": [
                "Insert only columns that exist in production.",
                "Do not add schema columns just for planner convenience.",
                "Store recommended_model_key / approval metadata in existing JSON/text columns only if present; otherwise keep it in output/description/handler_key conservatively.",
            ],
        },
        "execution_telemetry": {
            "tables": {
                "agentsam_workflow_runs": cols("agentsam_workflow_runs"),
                "agentsam_tool_chain": cols("agentsam_tool_chain"),
                "agentsam_usage_events": cols("agentsam_usage_events"),
                "agentsam_analytics": cols("agentsam_analytics"),
            },
            "guidance": [
                "Use existing telemetry tables instead of one-off logs where possible.",
                "Do not let telemetry FK issues break chat execution.",
            ],
        },
        "commands_and_gates": {
            "tables": {
                "agentsam_command_pattern": cols("agentsam_command_pattern"),
                "agentsam_commands": cols("agentsam_commands"),
                "agentsam_slash_commands": cols("agentsam_slash_commands"),
            },
            "guidance": [
                "Use command/slash/pattern tables as route candidates before LLM classification.",
                "Keep regex only as Layer 1 guard, not the full routing brain.",
            ],
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Agent Sam Planner Challenge")
    print(f"repo: {REPO_ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("")

    if not SRC_DIR.exists():
        print("[WARN] src/ directory not found. Run from repo root.")

    # Schema inspection
    schema_report: Dict[str, Any] = {}
    if wrangler_available():
        print("[1/6] Inspecting D1 schemas...")
        for table in TABLES_TO_INSPECT:
            schema_report[table] = inspect_table_schema(table)
            status = "OK" if schema_report[table]["ok"] else "MISS"
            print(f"  {status} {table}")
    else:
        print("[1/6] Skipping D1 schemas: npx or wrangler config missing.")
        schema_report = {
            table: {"table": table, "ok": False, "columns": [], "stderr": "wrangler unavailable"}
            for table in TABLES_TO_INSPECT
        }

    # Catalog
    print("[2/6] Verifying GPT-5.4 mini/nano catalog shape...")
    catalog_report = inspect_catalog_shape() if wrangler_available() else {
        "ok": False,
        "rows": [],
        "checks": [],
        "stderr": "wrangler unavailable",
    }
    for check in catalog_report.get("checks", []):
        mark = "OK" if check.get("matches_expected") else "BAD"
        print(f"  {mark} {check.get('model_key')}")

    # Static repo audit
    print("[3/6] Auditing repo routing/adapter/static risks...")
    static_report = classify_grep_hits()
    for k, v in static_report["counts"].items():
        print(f"  {k}: {v}")

    # Key files
    print("[4/6] Inspecting key files...")
    key_files = inspect_key_files()
    for rel, info in key_files.items():
        print(f"  {'OK' if info['exists'] else 'MISS'} {rel}")

    # Challenge samples
    print("[5/6] Running message classification challenge...")
    challenge_rows = run_message_challenge()
    for row in challenge_rows:
        det = row["deterministic_result"]
        print(
            f"  {row['message']!r} -> {det['message_type']} "
            f"plan={det['should_create_plan']} approval={det['requires_approval']}"
        )

    # Recommendations/report
    print("[6/6] Building report...")
    db_driven_map = build_db_driven_map(schema_report)
    recommendations = build_repair_recommendations(
        schema_report=schema_report,
        catalog_report=catalog_report,
        static_report=static_report,
        key_files=key_files,
    )

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "repo_root": str(REPO_ROOT),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
            "ollama_base_url": OLLAMA_BASE_URL,
            "ollama_model": OLLAMA_MODEL,
            "openai_base_url": OPENAI_BASE_URL,
            "openai_api_key_present": bool(OPENAI_API_KEY),
        },
        "catalog_report": catalog_report,
        "schema_report": schema_report,
        "db_driven_map": db_driven_map,
        "static_report": static_report,
        "key_files": key_files,
        "message_challenge": challenge_rows,
        "recommendations": recommendations,
        "cursor_repair_brief": {
            "principle": "agent.js should orchestrate; DB configures; model router decides; executor executes; frontend reflects state.",
            "do_not_touch": [
                "wrangler.production.toml",
                "agentsam_model_catalog gpt-5.4-mini/gpt-5.4-nano values",
                "src/integrations/openai.js unless a clear adapter bug exists",
                "src/core/workflow-executor.js exports",
                "existing SSE event shapes",
            ],
            "hard_requirements": [
                "No new DB columns.",
                "Use is_active, not is_enabled.",
                "Do not hardcode GPT-4.1 fallback models in runtime source.",
                "Do not send gpt-5.4-mini/nano to /v1/chat/completions unless catalog says openai_chat_completions.",
                "Do not auto-execute arbitrary terminal commands or destructive DB writes.",
                "Use ./scripts/dev-deploy.sh --worker for deployment.",
            ],
            "first_pass_allowed_auto_execute": [
                "agent tasks",
                "safe existing workflow tasks",
                "summarization/classification tasks",
            ],
            "first_pass_requires_approval": [
                "terminal commands",
                "destructive DB writes",
                "deployments",
                "R2 object deletion",
                "migrations",
                "secret/env/auth/security changes",
            ],
        },
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True))
    print("")
    print(f"[OK] wrote {REPORT_PATH}")

    if recommendations:
        print("")
        print("Top recommendations:")
        for rec in recommendations[:8]:
            print(f"  {rec['priority']} {rec['area']}: {rec['issue']}")
    else:
        print("[OK] no major repair recommendations detected")

    # Exit nonzero only for P0 adapter/model issues. This lets Cursor use it as a guard.
    p0 = [r for r in recommendations if r.get("priority") == "P0"]
    if p0:
        print("")
        print("[FAIL] P0 issues detected. See report before deploying.")
        return 2

    print("")
    print("[PASS] No P0 issues detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
