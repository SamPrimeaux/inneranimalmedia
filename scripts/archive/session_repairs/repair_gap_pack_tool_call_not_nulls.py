#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

PROMPTS_FILE = Path("artifacts/agentsam_cursor_gap_pack_v2/PROMPT_TRACE_ROWS_PREVIEW.json")
RECEIPT = Path("artifacts/agentsam_cursor_gap_pack_v2/SUPABASE_TOOL_CALL_NOT_NULL_REPAIR.md")

NUMERIC_DEFAULTS = {
    "call_index": 0,
    "input_tokens": 0,
    "output_tokens": 0,
    "cost_usd": 0,
    "duration_ms": 0,
}

JSON_DEFAULTS = {
    "input_json": {},
    "output_json": {},
    "metadata": {},
}


def main() -> int:
    data = json.loads(PROMPTS_FILE.read_text(encoding="utf-8"))

    changed = 0
    for row in data.get("agentsam_tool_call_events", []):
        for key, default in NUMERIC_DEFAULTS.items():
            if row.get(key) is None:
                row[key] = default
                changed += 1

        for key, default in JSON_DEFAULTS.items():
            if row.get(key) is None:
                row[key] = default
                changed += 1

        if not row.get("tool_name"):
            row["tool_name"] = "unknown"
            changed += 1

        if row.get("success") is None:
            row["success"] = True
            changed += 1

    PROMPTS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    RECEIPT.write_text(
        "# Supabase Tool Call NOT NULL Repair\n\n"
        f"Prompt/tool preview file: `{PROMPTS_FILE}`\n"
        f"Fields repaired: `{changed}`\n\n"
        "Applied defaults for required columns:\n"
        "- `input_tokens`: `0`\n"
        "- `output_tokens`: `0`\n"
        "- `cost_usd`: `0`\n"
        "- `call_index`: `0` when missing\n"
        "- `input_json`, `output_json`, `metadata`: `{}` when missing\n",
        encoding="utf-8",
    )

    print(f"repaired_fields={changed}")
    print(f"receipt={RECEIPT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
