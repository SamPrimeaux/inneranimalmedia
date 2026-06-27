"""Agentic CMS prototyping — Workers AI + structured HTML section proposals."""

from __future__ import annotations

import json
from typing import Any

from js import Object  # pyodide FFI
from pyodide.ffi import to_js as _to_js


def to_js(obj: Any):
    return _to_js(obj, dict_converter=Object.fromEntries)


SYSTEM_PROMPT = """You are AgentSam CMS Prototype Assistant for Inner Animal Media.
Given page context and a user goal, propose CMS section updates as JSON only.
Schema:
{
  "summary": "one line",
  "sections": [
    {
      "section_name": "kebab-case",
      "section_type": "hero|services|faq|cta|custom",
      "section_data": { "headline": "...", "body": "...", "bullets": [] }
    }
  ],
  "html_fragments": [
    { "section_name": "...", "html": "<section data-cms-section=\\"...\\">...</section>" }
  ]
}
Rules: use data-cms-section on every fragment; no markdown; valid JSON only."""


async def propose_sections(ai_binding, *, goal: str, page: dict, sections: list[dict]) -> dict[str, Any]:
    """Call Workers AI to propose section edits (rapid prototyping)."""
    user_payload = {
        "goal": goal,
        "page": page,
        "sections": sections,
    }
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user_payload)},
    ]
    # @cf/meta/llama-3.3-70b-instruct-fp8-fast or your routed model
    result = await ai_binding.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {"messages": to_js(messages), "max_tokens": 2048},
    )
    text = ""
    if hasattr(result, "response"):
        text = str(result.response or "")
    elif isinstance(result, dict):
        text = str(result.get("response") or result.get("result") or "")
    else:
        text = str(result)

    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return {"ok": True, "proposal": parsed, "raw": text}
    except json.JSONDecodeError:
        pass
    return {"ok": False, "error": "model_returned_non_json", "raw": text}
