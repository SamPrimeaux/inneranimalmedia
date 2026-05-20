#!/usr/bin/env python3
"""Identity + routing arm resolution for Thompson benchmark runs."""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

from d1_client import query


def resolve_user(user_ref: str) -> Dict[str, Any]:
    """
    Resolve tenant/workspace/user from auth_users (never hardcode au_* / ws_*).
    user_ref: email, auth_users.id (au_*), or user_key.
    """
    ref = (user_ref or "").strip()
    if not ref:
        raise ValueError("scenario.user is required (email, au_* id, or user_key)")

    if "@" in ref:
        where = "LOWER(TRIM(au.email)) = LOWER(?)"
        param = ref
    elif ref.startswith("au_"):
        where = "au.id = ?"
        param = ref
    else:
        where = "au.user_key = ?"
        param = ref

    rows = query(
        f"""
        SELECT
          au.id              AS user_id,
          au.email,
          au.tenant_id,
          au.person_uuid,
          COALESCE(au.is_superadmin, 0) AS is_superadmin,
          COALESCE(NULLIF(TRIM(au.active_workspace_id), ''),
                   NULLIF(TRIM(au.default_workspace_id), '')) AS workspace_id,
          t.slug             AS tenant_slug
        FROM auth_users au
        LEFT JOIN tenants t ON t.id = au.tenant_id
        WHERE {where}
        LIMIT 1
        """,
        [param],
    )

    if not rows:
        raise ValueError(f"No auth_users row for user ref: {ref!r}")

    row = dict(rows[0])
    if not row.get("workspace_id"):
        raise ValueError(
            f"auth_users {row.get('user_id')} has no active_workspace_id or default_workspace_id"
        )
    if not row.get("tenant_id"):
        raise ValueError(f"auth_users {row.get('user_id')} has no tenant_id")

    return row


def resolve_arm(
    workspace_id: str,
    task_type: str,
    mode: str,
    model_key: str,
) -> Dict[str, Any]:
    """
    Resolve an eligible routing arm with:
      - agentsam_model_pricing  → authoritative per-MTOK rates + routing_eligible
      - agentsam_model_catalog  → latency p50/p95 + tier + capability flags
    Join on model_key only (provider strings differ across tables).
    """
    rows = query(
        """
        SELECT
          ra.id,
          ra.task_type,
          ra.mode,
          ra.model_key,
          ra.provider,
          ra.success_alpha,
          ra.success_beta,
          ra.cost_mean,
          ra.cost_m2,
          ra.cost_n,
          ra.latency_mean,
          ra.latency_m2,
          ra.latency_n,
          ra.decayed_score,
          ra.total_executions,
          ra.is_eligible,
          ra.is_paused,
          ra.is_active,
          ra.pause_reason,
          ra.budget_exhausted,
          ra.max_cost_per_call_usd,
          ra.supports_tools,
          ra.reasoning_effort,
          ra.fallback_model_key,
          ra.priority,
          ra.model_catalog_id,
          ra.avg_quality_score,
          ra.quality_n,
          ra.tools_json,
          ra.workflow_agent,
          ra.intent_slug,

          mp.id                          AS pricing_id,
          mp.input_rate_per_mtok,
          mp.output_rate_per_mtok,
          mp.cache_read_rate_per_mtok,
          mp.cache_write_5m_rate_per_mtok,
          mp.cache_write_1h_rate_per_mtok,
          mp.batch_input_rate_per_mtok,
          mp.batch_output_rate_per_mtok,
          mp.supports_prompt_cache,
          mp.supports_batch,
          mp.routing_eligible,
          mp.requires_owner_approval,
          mp.long_ctx_threshold_tokens,
          mp.long_ctx_input_rate_per_mtok,
          mp.long_ctx_output_rate_per_mtok,
          mp.thinking_mode_policy,

          mc.tier                        AS model_tier,
          mc.routing_lane,
          mc.context_window,
          mc.max_output_tokens,
          mc.avg_latency_p50_ms,
          mc.avg_latency_p95_ms,
          mc.quality_score               AS catalog_quality_score,
          mc.supports_vision,
          mc.supports_reasoning,
          mc.supports_json_mode,
          mc.supports_streaming,
          mc.is_degraded                 AS model_is_degraded,
          mc.total_calls                 AS catalog_total_calls,
          mc.total_failures              AS catalog_total_failures

        FROM agentsam_routing_arms ra

        LEFT JOIN agentsam_model_pricing mp
          ON mp.model_key = ra.model_key
         AND mp.is_active = 1
         AND (mp.effective_to IS NULL OR mp.effective_to > datetime('now'))

        LEFT JOIN agentsam_model_catalog mc
          ON mc.model_key = ra.model_key
         AND mc.is_active = 1

        WHERE ra.workspace_id = ?
          AND ra.task_type    = ?
          AND ra.mode         = ?
          AND ra.model_key    = ?
          AND ra.is_active    = 1
        LIMIT 1
        """,
        [workspace_id, task_type, mode, model_key],
    )

    if not rows:
        raise ValueError(
            f"No arm: workspace={workspace_id} task={task_type} "
            f"mode={mode} model={model_key}. "
            f"Insert a row into agentsam_routing_arms first."
        )

    arm = dict(rows[0])

    if arm.get("is_paused"):
        raise ValueError(
            f"Arm {arm['id']} ({model_key}) is paused "
            f"[reason={arm.get('pause_reason') or 'none'}'] — unpause before benchmarking."
        )
    if not arm.get("is_eligible"):
        raise ValueError(
            f"Arm {arm['id']} ({model_key}) is_eligible=0 — "
            f"budget_exhausted={arm.get('budget_exhausted')}."
        )
    if arm.get("budget_exhausted"):
        raise ValueError(f"Arm {arm['id']} ({model_key}) budget exhausted.")

    if arm.get("routing_eligible") == 0:
        raise ValueError(
            f"Model {model_key} has routing_eligible=0 in agentsam_model_pricing — "
            f"excluded from Thompson pool at the pricing level."
        )
    if arm.get("requires_owner_approval"):
        raise ValueError(
            f"Model {model_key} requires_owner_approval=1 — "
            f"cannot benchmark without explicit approval gate."
        )

    if arm.get("model_is_degraded"):
        print(
            f"  [warn] model {model_key} is_degraded=1 in catalog — "
            f"run will be marked degraded in evidence_json"
        )

    return arm


def get_model_ai(provider: str, model_key: str) -> Optional[Mapping[str, Any]]:
    """Lookup agentsam_ai catalog row for agent_ai_id / ai_model_id linkage."""
    rows = query(
        """
        SELECT id, model_key, provider, api_platform
        FROM agentsam_ai
        WHERE mode = 'model'
          AND status = 'active'
          AND model_key = ?
        LIMIT 1
        """,
        [model_key],
    )
    if rows:
        return rows[0]
    rows = query(
        """
        SELECT id, model_key, provider, api_platform
        FROM agentsam_ai
        WHERE mode = 'model'
          AND status = 'active'
          AND provider = ?
          AND model_key = ?
        LIMIT 1
        """,
        [provider, model_key],
    )
    return rows[0] if rows else None
