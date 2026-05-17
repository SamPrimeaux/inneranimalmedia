#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

PROMPTS_FILE = Path("artifacts/agentsam_cursor_gap_pack_v2/PROMPT_TRACE_ROWS_PREVIEW.json")
INGEST_SCRIPT = Path("scripts/ingest_agentsam_gap_pack_supabase.py")
RECEIPT = Path("artifacts/agentsam_cursor_gap_pack_v2/SUPABASE_PROMPT_TOOL_ID_REPAIR.md")

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "inneranimalmedia.agent_sam.gap_pack_v2")


def stable_uuid(*parts: object) -> str:
    raw = "|".join("" if p is None else str(p) for p in parts)
    return str(uuid.uuid5(NAMESPACE, raw))


def main() -> int:
    data = json.loads(PROMPTS_FILE.read_text(encoding="utf-8"))

    prompt_changed = 0
    for row in data.get("agentsam_prompt_runs", []):
        if not row.get("id"):
            row["id"] = stable_uuid(
                "agentsam_prompt_runs",
                row.get("request_id"),
                row.get("run_group_id"),
                row.get("prompt_profile_key"),
            )
            prompt_changed += 1

    tool_changed = 0
    for row in data.get("agentsam_tool_call_events", []):
        if not row.get("id"):
            row["id"] = stable_uuid(
                "agentsam_tool_call_events",
                row.get("run_group_id"),
                row.get("tool_name"),
                row.get("call_index"),
                row.get("task_id"),
            )
            tool_changed += 1

    PROMPTS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    script = INGEST_SCRIPT.read_text(encoding="utf-8")

    script = re.sub(
        r'    "agentsam_prompt_runs": "[^"]+",\n',
        '    "agentsam_prompt_runs": "id",\n',
        script,
    )

    if '"agentsam_prompt_runs": "id",' not in script:
        script = script.replace(
            '    "documents": "tenant_id,workspace_id,project_id,embed_model,source,content_hash,source_chunk_id",\n',
            '    "documents": "tenant_id,workspace_id,project_id,embed_model,source,content_hash,source_chunk_id",\n'
            '    "agentsam_prompt_runs": "id",\n'
        )

    if '"agentsam_tool_call_events":' not in script:
        script = script.replace(
            '    "agentsam_prompt_runs": "id",\n',
            '    "agentsam_prompt_runs": "id",\n'
            '    "agentsam_tool_call_events": "id",\n'
        )
    else:
        script = re.sub(
            r'    "agentsam_tool_call_events": "[^"]+",\n',
            '    "agentsam_tool_call_events": "id",\n',
            script,
        )

    INGEST_SCRIPT.write_text(script, encoding="utf-8")

    RECEIPT.write_text(
        "# Supabase Prompt/Tool ID Repair\n\n"
        f"Prompt rows assigned stable ids: `{prompt_changed}`\n"
        f"Tool event rows assigned stable ids: `{tool_changed}`\n"
        "\n"
        "Updated conflict targets:\n"
        "- `agentsam_prompt_runs`: `id`\n"
        "- `agentsam_tool_call_events`: `id`\n",
        encoding="utf-8",
    )

    print(f"prompt_ids={prompt_changed}")
    print(f"tool_ids={tool_changed}")
    print(f"receipt={RECEIPT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
