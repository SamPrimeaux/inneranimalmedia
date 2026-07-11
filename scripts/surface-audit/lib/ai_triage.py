#!/usr/bin/env python3
"""Optional AI triage for flagged surface chunks."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


SYSTEM_PROMPT = """You are the IAM Surface Audit guide for Inner Animal Media.

Platform law:
- Model choice must come from D1 (agentsam_routing_arms / agentsam_model_catalog), not hardcoded strings in hot paths.
- Tool schemas live in agentsam_tools; execution is a single dispatch map.
- Zeroed costUsd/inputTokens on SUCCESS tool log paths is a bug, not acceptable for free tools only on blocked paths.
- Agent Sam should receive route_key context per dashboard surface via dashboardRouteContext.ts.

Given a surface audit record, respond ONLY with JSON:
{
  "verdict": "CONFIRMED_GAP | PARTIAL | HEALTHY | SCRAPE | DEFER",
  "functionality_risks": ["..."],
  "experience_risks": ["..."],
  "recommended_sprint": "P0|P1|P2|P3",
  "next_actions": ["max 3 concrete engineering steps"],
  "confidence": 0.0-1.0
}
"""


def _openai_client():
    from openai import OpenAI

    return OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))


def _anthropic_client():
    import anthropic

    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


def triage_surface(record: dict[str, Any], *, provider: str | None = None, model: str | None = None) -> dict[str, Any]:
    provider = (provider or os.environ.get("AUDIT_AI_PROVIDER", "openai")).lower()
    model = model or os.environ.get(
        "AUDIT_AI_MODEL",
        "gpt-5.4-mini" if provider == "openai" else "claude-sonnet-4-6",
    )
    payload = json.dumps(record, indent=2)[:12000]

    if provider == "anthropic":
        client = _anthropic_client()
        msg = client.messages.create(
            model=model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Audit this dashboard surface:\n\n{payload}"}],
        )
        text = msg.content[0].text if msg.content else "{}"
    else:
        client = _openai_client()
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Audit this dashboard surface:\n\n{payload}"},
            ],
            response_format={"type": "json_object"},
        )
        text = resp.choices[0].message.content or "{}"

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"verdict": "PARSE_ERROR", "raw": text[:2000]}


def triage_batch(records: list[dict], *, limit: int = 12) -> list[dict]:
    """Triage highest-priority surfaces only (cost control)."""
    out: list[dict] = []
    for rec in records[:limit]:
        try:
            ai = triage_surface(rec)
        except Exception as exc:
            ai = {"verdict": "AI_SKIPPED", "error": str(exc)}
        out.append({"surface": rec.get("path"), "ai": ai})
    return out
