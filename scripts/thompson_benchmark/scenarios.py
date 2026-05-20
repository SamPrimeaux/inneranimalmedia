#!/usr/bin/env python3
"""Named Thompson benchmark scenarios — identity via auth_users email only."""

from __future__ import annotations

from typing import Any, Dict, List

# Default bench user: resolved from auth_users at runtime (no au_* / ws_* literals).
DEFAULT_USER = "info@inneranimals.com"


def _s(**kwargs: Any) -> Dict[str, Any]:
    base = {"user": DEFAULT_USER}
    base.update(kwargs)
    return base


SCENARIOS: List[Dict[str, Any]] = [
    # Modes must match an active, eligible agentsam_routing_arms row for the user's workspace.
    _s(
        scenario_name="gpt54mini_chat_ask",
        task_type="chat",
        mode="ask",
        model_key="gpt-5.4-mini",
        provider="openai",
        outcome="completed",
    ),
    _s(
        scenario_name="gpt54nano_chat_agent",
        task_type="chat",
        mode="agent",
        model_key="gpt-5.4-nano",
        provider="openai",
        outcome="completed",
    ),
    _s(
        scenario_name="gemini_flash_chat",
        task_type="chat",
        mode="agent",
        model_key="gemini-2.5-flash",
        provider="google",
        outcome="completed",
    ),
    _s(
        scenario_name="gemini_flash_lite_ask",
        task_type="chat",
        mode="ask",
        model_key="gemini-2.5-flash-lite",
        provider="google",
        outcome="completed",
    ),
    _s(
        scenario_name="gemini_flash_lite_cms_theme",
        task_type="cms_theme_generation",
        mode="agent",
        model_key="gemini-2.5-flash-lite",
        provider="google",
        outcome="completed",
    ),
    _s(
        scenario_name="gpt54nano_chat_failed",
        task_type="chat",
        mode="agent",
        model_key="gpt-5.4-nano",
        provider="openai",
        outcome="failed",
        quality_score=0.12,
    ),
    # Anthropic (unpause arms + use code/agent when active):
    _s(
        scenario_name="sonnet_code_cached",
        task_type="code",
        mode="agent",
        model_key="claude-sonnet-4-6",
        provider="anthropic",
        outcome="completed",
        cached_input_ratio=0.40,
    ),
]

SCENARIOS_BY_NAME = {s["scenario_name"]: s for s in SCENARIOS}
