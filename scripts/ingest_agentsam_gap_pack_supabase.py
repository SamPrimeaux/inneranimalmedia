#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

PACK_DIR = Path("artifacts/agentsam_cursor_gap_pack_v2")
ROWS_FILE = PACK_DIR / "SUPABASE_ROWS_PREVIEW.json"
PROMPTS_FILE = PACK_DIR / "PROMPT_TRACE_ROWS_PREVIEW.json"
RECEIPT_FILE = PACK_DIR / "SUPABASE_INGEST_RECEIPT.md"

ENV_FILES = [
    ".env.agentsam.local",
    ".env.local",
    ".env",
    ".env.supabase",
]

INSERT_ORDER = [
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_workflow_runs",
    "agentsam_workflow_steps",
    "agentsam_workflow_events",
    "codebase_snapshots",
    "codebase_files",
    "documents",
    "agent_context_snapshots",
    "agent_decisions",
    "agentsam_prompt_runs",
    "agentsam_tool_call_events",
]

CONFLICT_KEYS = {
    "agentsam_plans": "id",
    "agentsam_plan_tasks": "id",
    "agentsam_workflow_runs": "id",
    "agentsam_workflow_steps": "id",
    "agentsam_workflow_events": "id",
    "codebase_snapshots": "snapshot_id",
    "codebase_files": "snapshot_id,file_path",
    "documents": "tenant_id,workspace_id,project_id,embed_model,source,content_hash,source_chunk_id",
    "agentsam_prompt_runs": "id",
    "agentsam_tool_call_events": "id",
}


def load_dotenv() -> None:
    for env_file in ENV_FILES:
        path = Path(env_file)
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing required file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_supabase_url(url: str) -> str:
    url = url.rstrip("/")
    if url.endswith("/rest/v1"):
        return url
    return url + "/rest/v1"


def get_supabase_config() -> tuple[str, str]:
    load_dotenv()

    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or ""
    ).strip()

    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or ""
    ).strip()

    if not url:
        raise SystemExit("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL")
    if not key:
        raise SystemExit("Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY / SUPABASE_KEY")

    return normalize_supabase_url(url), key


def strip_none_lists(row: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for k, v in row.items():
        if v is None:
            clean[k] = None
        else:
            clean[k] = v
    return clean


def postgrest_upsert(
    base_url: str,
    key: str,
    table: str,
    rows: list[dict[str, Any]],
    conflict_key: str | None,
) -> tuple[bool, int, str]:
    if not rows:
        return True, 0, "skipped empty"

    params = {}
    if conflict_key:
        params["on_conflict"] = conflict_key

    query = urllib.parse.urlencode(params)
    url = f"{base_url}/{table}"
    if query:
        url += "?" + query

    payload = json.dumps([strip_none_lists(r) for r in rows]).encode("utf-8")

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp.read()
        return True, len(rows), "ok"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return False, 0, f"HTTP {e.code}: {body}"
    except Exception as e:
        return False, 0, str(e)


def main() -> int:
    base_url, key = get_supabase_config()

    rows_data = read_json(ROWS_FILE)
    prompt_data = read_json(PROMPTS_FILE)

    merged: dict[str, list[dict[str, Any]]] = {}
    for table, rows in rows_data.items():
        if table == "meta":
            continue
        if isinstance(rows, list):
            merged[table] = rows

    for table, rows in prompt_data.items():
        if isinstance(rows, list):
            merged[table] = rows

    results = []
    failed = False

    for table in INSERT_ORDER:
        rows = merged.get(table, [])
        ok, count, message = postgrest_upsert(
            base_url=base_url,
            key=key,
            table=table,
            rows=rows,
            conflict_key=CONFLICT_KEYS.get(table),
        )
        results.append({
            "table": table,
            "ok": ok,
            "rows": count if ok else len(rows),
            "message": message,
        })
        print(f"[{'ok' if ok else 'fail'}] {table}: rows={len(rows)} {message}")
        if not ok:
            failed = True
            break

    body = []
    body.append("# Supabase Ingest Receipt\n")
    body.append(f"Rows file: `{ROWS_FILE}`")
    body.append(f"Prompt trace file: `{PROMPTS_FILE}`")
    body.append(f"Status: `{'failed' if failed else 'success'}`")
    body.append("\n## Results\n")
    body.append("| Table | OK | Rows | Message |")
    body.append("|---|---:|---:|---|")
    for r in results:
        msg = str(r["message"]).replace("\n", " ").replace("|", "\\|")[:700]
        body.append(f"| `{r['table']}` | `{r['ok']}` | {r['rows']} | {msg} |")

    RECEIPT_FILE.write_text("\n".join(body) + "\n", encoding="utf-8")
    print(f"receipt={RECEIPT_FILE}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
