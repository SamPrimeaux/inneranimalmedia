#!/usr/bin/env python3
"""
SYNTHETIC Thompson benchmark — Python INSERTs with catalog-sampled metrics.

NOT real provider tokens. For production-accurate data use live_runner.py
(POST /api/agent/chat → Worker writes D1).
"""

from __future__ import annotations

import json
import math
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

try:
    from .d1_client import query
    from .fixtures import get_model_ai, resolve_arm, resolve_user
except ImportError:
    from d1_client import query
    from fixtures import get_model_ai, resolve_arm, resolve_user


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def unix_now() -> int:
    return int(time.time())


def compute_cost(
    input_tokens: int,
    output_tokens: int,
    arm: Dict[str, Any],
    cached_input_tokens: int = 0,
) -> float:
    """
    Cost from agentsam_model_pricing (per MTOK).
    Supports cache read discount and long-context surcharge.
    """
    rate_in = arm.get("input_rate_per_mtok")
    rate_out = arm.get("output_rate_per_mtok")

    if not rate_in or not rate_out:
        if arm.get("cost_mean") and arm["cost_mean"] > 0:
            return round(float(arm["cost_mean"]) * random.uniform(0.8, 1.2), 8)
        return round((input_tokens + output_tokens) / 1_000_000 * 0.002, 8)

    long_ctx_threshold = arm.get("long_ctx_threshold_tokens")
    if long_ctx_threshold and input_tokens > long_ctx_threshold:
        rate_in = arm.get("long_ctx_input_rate_per_mtok") or rate_in
        rate_out = arm.get("long_ctx_output_rate_per_mtok") or rate_out

    non_cached = max(0, input_tokens - cached_input_tokens)
    cache_rate = arm.get("cache_read_rate_per_mtok") or 0
    supports_cache = arm.get("supports_prompt_cache", 0)

    if supports_cache and cached_input_tokens > 0 and cache_rate > 0:
        cost = (
            (non_cached / 1_000_000) * float(rate_in)
            + (cached_input_tokens / 1_000_000) * float(cache_rate)
            + (output_tokens / 1_000_000) * float(rate_out)
        )
    else:
        cost = (
            (input_tokens / 1_000_000) * float(rate_in)
            + (output_tokens / 1_000_000) * float(rate_out)
        )

    return round(cost, 8)


def sample_latency(arm: Dict[str, Any]) -> int:
    """Sample latency from catalog p50/p95 (log-normal), else arm mean or tier default."""
    p50 = arm.get("avg_latency_p50_ms")
    p95 = arm.get("avg_latency_p95_ms")

    if p50 and p95 and p50 > 0 and p95 > p50:
        mu = math.log(float(p50))
        sigma = (math.log(float(p95)) - math.log(float(p50))) / 1.645
        sample = int(random.lognormvariate(mu, sigma))
        return max(200, min(sample, int(p95 * 3)))

    if arm.get("latency_mean") and arm["latency_mean"] > 0:
        return int(float(arm["latency_mean"]) * random.uniform(0.7, 1.4))

    provider = arm.get("provider", "")
    tier = arm.get("model_tier", "standard")
    defaults = {
        ("openai", "micro"): (800, 2500),
        ("openai", "standard"): (2000, 6000),
        ("openai", "power"): (4000, 12000),
        ("anthropic", "standard"): (2000, 8000),
        ("anthropic", "power"): (5000, 18000),
        ("anthropic", "reasoning"): (8000, 30000),
        ("google", "micro"): (600, 2000),
        ("google", "flash"): (3000, 12000),
        ("google", "standard"): (5000, 20000),
        ("workers_ai", "standard"): (1500, 6000),
        ("workers_ai", "micro"): (500, 2000),
    }
    lo, hi = defaults.get((provider, tier), (1500, 8000))
    return random.randint(lo, hi)


def compute_sla_breach(latency_ms: int, task_type: str) -> int:
    thresholds = {
        "chat": 15000,
        "code_patch": 30000,
        "code": 45000,
        "plan": 20000,
        "debug": 25000,
        "intent_classification": 3000,
        "routing": 2000,
        "summarize": 10000,
        "summary": 10000,
        "rag_query": 8000,
        "tool_use": 20000,
        "terminal_execution": 60000,
    }
    limit = thresholds.get(task_type, 30000)
    return 1 if latency_ms > limit else 0


def compute_reward(
    outcome: str,
    quality_score: float,
    latency_ms: int,
    cost_usd: float,
    arm: Dict[str, Any],
    sla_breach: int,
    timed_out: int,
) -> Tuple[float, str]:
    if timed_out:
        return 0.0, "timed_out: zero reward regardless of quality"

    if outcome == "failed":
        partial = max(0.0, quality_score * 0.3)
        reason = f"failed: partial_reward={partial:.3f} quality={quality_score:.2f}"
        return round(partial, 4), reason

    p50 = arm.get("avg_latency_p50_ms") or arm.get("latency_mean") or 5000
    latency_score = max(
        0.0,
        min(1.0, 1.0 - 0.5 * math.log(max(1, latency_ms / float(p50))) / math.log(3)),
    )

    cost_mean = arm.get("cost_mean") or cost_usd or 0.001
    cost_score = max(
        0.0,
        min(1.0, 1.0 - 0.5 * max(0, (cost_usd / float(cost_mean)) - 1.0)),
    )

    sla_penalty = 0.15 if sla_breach else 0.0

    reward = (
        quality_score * 0.60
        + latency_score * 0.25
        + cost_score * 0.15
        - sla_penalty
    )
    reward = round(max(0.0, min(1.0, reward)), 4)

    reason = (
        f"quality={quality_score:.2f} latency_score={latency_score:.2f} "
        f"cost_score={cost_score:.2f} sla_breach={sla_breach} composite={reward}"
    )
    return reward, reason


def thompson_run(scenario: Dict[str, Any]) -> Dict[str, Any]:
    """
    Write agentsam_agent_run + agentsam_usage_events + agentsam_performance_eto_events.
    Identity from auth_users; cost from model_pricing; latency from model_catalog.
    """
    user = resolve_user(scenario["user"])
    workspace_id = scenario.get("workspace_id") or user["workspace_id"]
    tenant_id = user["tenant_id"]
    user_id = user["user_id"]
    person_uuid = user.get("person_uuid")

    if scenario.get("workspace_id") and scenario["workspace_id"] != user["workspace_id"]:
        if not user.get("is_superadmin"):
            raise PermissionError(
                f"User {user['email']!r} cannot benchmark workspace {workspace_id!r}"
            )

    arm = resolve_arm(
        workspace_id,
        scenario["task_type"],
        scenario["mode"],
        scenario["model_key"],
    )
    model_ai = get_model_ai(scenario["provider"], scenario["model_key"])
    agent_id = scenario.get("agent_id", "ai_sam_v1")
    outcome = scenario["outcome"]

    tier = arm.get("model_tier", "standard")
    tier_token_ranges = {
        "micro": {"in": (300, 1800), "out": (80, 600)},
        "standard": {"in": (800, 4000), "out": (200, 1400)},
        "flash": {"in": (600, 3500), "out": (150, 1200)},
        "power": {"in": (1200, 8000), "out": (400, 3000)},
        "reasoning": {"in": (2000, 12000), "out": (800, 5000)},
    }
    ranges = tier_token_ranges.get(tier, tier_token_ranges["standard"])
    input_tokens = int(scenario.get("input_tokens", random.randint(*ranges["in"])))
    output_tokens = int(scenario.get("output_tokens", random.randint(*ranges["out"])))

    cached_ratio = float(scenario.get("cached_input_ratio", 0.0))
    cached_input_tokens = int(input_tokens * cached_ratio)

    cost_usd = scenario.get("cost_usd")
    if cost_usd is None:
        cost_usd = compute_cost(input_tokens, output_tokens, arm, cached_input_tokens)
    else:
        cost_usd = float(cost_usd)

    latency_ms = int(scenario.get("latency_ms", sample_latency(arm)))

    timeout_ms = int(scenario.get("timeout_ms", 30000))
    timed_out = 1 if outcome == "failed" and latency_ms > timeout_ms else 0
    sla_breach = compute_sla_breach(latency_ms, scenario["task_type"])

    if scenario.get("quality_score") is not None:
        quality_score = float(scenario["quality_score"])
    elif outcome == "completed":
        catalog_q = float(arm.get("catalog_quality_score") or 0.75)
        quality_score = round(min(1.0, max(0.0, random.gauss(catalog_q, 0.08))), 4)
    else:
        quality_score = round(random.uniform(0.0, 0.25), 4)

    reward_score, reward_reason = compute_reward(
        outcome, quality_score, latency_ms, cost_usd, arm, sla_breach, timed_out
    )
    alpha_delta = round(reward_score, 4)
    beta_delta = round(max(0.0, 1.0 - reward_score), 4)

    run_id = f"ar_{uuid.uuid4().hex[:16]}"
    usage_id = f"ue_{uuid.uuid4().hex[:12]}"
    eto_id = f"eto_{uuid.uuid4().hex[:14]}"
    idempotency_key = f"bench_{scenario.get('scenario_name', 'run')}_{uuid.uuid4().hex[:8]}"
    conversation_id = scenario.get("conversation_id") or f"conv_{uuid.uuid4().hex[:12]}"
    work_session_id = f"wsess_{uuid.uuid4().hex[:10]}"
    ts_iso = now_iso()
    ts_unix = unix_now()

    query(
        """
        INSERT INTO agentsam_agent_run (
          id, user_id, workspace_id, conversation_id, status, trigger, model_id,
          idempotency_key, error_message, input_tokens, output_tokens, cost_usd,
          started_at, completed_at, created_at, agent_ai_id, person_uuid, agent_id,
          ai_model_ref, routing_arm_id, chain_root_id, tenant_id, work_session_id,
          timed_out, sla_breach, timeout_ms, command_id, created_at_unix,
          quality_score, task_type
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?
        )
        """,
        [
            run_id,
            user_id,
            workspace_id,
            conversation_id,
            outcome,
            "benchmark",
            scenario["model_key"],
            idempotency_key,
            None
            if outcome == "completed"
            else f"benchmark_failure: outcome=failed quality={quality_score:.2f}",
            input_tokens,
            output_tokens,
            cost_usd,
            ts_iso,
            ts_iso,
            ts_iso,
            model_ai["id"] if model_ai else None,
            person_uuid,
            agent_id,
            scenario["model_key"],
            arm["id"],
            run_id,
            tenant_id,
            work_session_id,
            timed_out,
            sla_breach,
            timeout_ms,
            None,
            ts_unix,
            quality_score,
            scenario["task_type"],
        ],
    )

    query(
        """
        INSERT INTO agentsam_usage_events (
          id, tenant_id, workspace_id, user_id, session_id, agent_name, provider,
          model, tokens_in, tokens_out, cost_usd, status, tool_name, reason,
          ref_table, ref_id, created_at, ai_model_id, routing_arm_id, event_type,
          model_key, duration_ms, total_tokens, created_at_unix, input_tokens,
          output_tokens, plan_id, task_type, mode, arm_id, succeeded, conversation_id
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?,?,?
        )
        """,
        [
            usage_id,
            tenant_id,
            workspace_id,
            user_id,
            conversation_id,
            "agent-sam",
            scenario["provider"],
            scenario["model_key"],
            input_tokens,
            output_tokens,
            cost_usd,
            "ok" if outcome == "completed" else "error",
            None,
            reward_reason[:200],
            "agentsam_agent_run",
            run_id,
            ts_unix,
            model_ai["id"] if model_ai else None,
            arm["id"],
            "benchmark_run",
            scenario["model_key"],
            latency_ms,
            input_tokens + output_tokens,
            ts_unix,
            input_tokens,
            output_tokens,
            None,
            scenario["task_type"],
            scenario["mode"],
            arm["id"],
            1 if outcome == "completed" else 0,
            conversation_id,
        ],
    )

    evidence = {
        "seeder": True,
        "scenario_name": scenario.get("scenario_name", "unnamed"),
        "user_email": user["email"],
        "tenant_slug": user.get("tenant_slug"),
        "workspace_id": workspace_id,
        "model_tier": arm.get("model_tier"),
        "pricing_id": arm.get("pricing_id"),
        "input_rate_per_mtok": arm.get("input_rate_per_mtok"),
        "output_rate_per_mtok": arm.get("output_rate_per_mtok"),
        "cached_input_tokens": cached_input_tokens,
        "catalog_p50_ms": arm.get("avg_latency_p50_ms"),
        "catalog_p95_ms": arm.get("avg_latency_p95_ms"),
        "catalog_q": arm.get("catalog_quality_score"),
        "model_degraded": bool(arm.get("model_is_degraded")),
        "arm_alpha_before": arm.get("success_alpha"),
        "arm_beta_before": arm.get("success_beta"),
        "arm_executions": arm.get("total_executions"),
        "seeded_at": ts_iso,
    }

    query(
        """
        INSERT INTO agentsam_performance_eto_events (
          id, tenant_id, workspace_id, user_id, source_table, source_id,
          agent_run_id, workflow_run_id, execution_id, execution_step_id,
          command_run_id, tool_call_id, mcp_tool_execution_id, eval_run_id,
          usage_event_id, epm_id, routing_arm_id, inferred_routing_arm_id,
          route_key, task_type, mode, model_catalog_id, model_key, provider,
          event_status, success, failure, timed_out, sla_breach, latency_ms,
          input_tokens, output_tokens, cost_usd, quality_score, is_smoke_test,
          is_training_eligible, reward_score, alpha_delta, beta_delta,
          reward_reason, evidence_json, etl_run_id, eto_run_id,
          applied_to_thompson_at, created_at
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?
        )
        """,
        [
            eto_id,
            tenant_id,
            workspace_id,
            user_id,
            "agentsam_agent_run",
            run_id,
            run_id,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            usage_id,
            None,
            arm["id"],
            arm["id"],
            f"{scenario['task_type']}_{scenario['mode']}",
            scenario["task_type"],
            scenario["mode"],
            arm.get("model_catalog_id"),
            scenario["model_key"],
            scenario["provider"],
            outcome,
            1 if outcome == "completed" else 0,
            0 if outcome == "completed" else 1,
            timed_out,
            sla_breach,
            latency_ms,
            input_tokens,
            output_tokens,
            cost_usd,
            quality_score,
            int(scenario.get("is_smoke_test", 0)),
            1,
            reward_score,
            alpha_delta,
            beta_delta,
            reward_reason,
            json.dumps(evidence),
            None,
            None,
            None,
            ts_iso,
        ],
    )

    print(
        f"  [thompson] {user['email']} | {workspace_id} | "
        f"{scenario['task_type']}/{scenario['mode']} | "
        f"{scenario['model_key']} ({arm.get('model_tier', '?')}) | "
        f"{outcome} | q={quality_score:.2f} r={reward_score:.2f} | "
        f"α+{alpha_delta} β+{beta_delta} | ${cost_usd:.6f} | {latency_ms}ms"
        + (" [SLA_BREACH]" if sla_breach else "")
        + (" [TIMED_OUT]" if timed_out else "")
    )

    return {
        "run_id": run_id,
        "usage_id": usage_id,
        "eto_id": eto_id,
        "arm_id": arm["id"],
        "user_id": user_id,
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "model_key": scenario["model_key"],
        "outcome": outcome,
        "quality_score": quality_score,
        "reward_score": reward_score,
        "alpha_delta": alpha_delta,
        "beta_delta": beta_delta,
        "cost_usd": cost_usd,
        "latency_ms": latency_ms,
        "sla_breach": sla_breach,
        "timed_out": timed_out,
    }
