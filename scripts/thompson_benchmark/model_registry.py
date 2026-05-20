#!/usr/bin/env python3
"""Load agentsam_ai models and probe routing/pricing/catalog stack."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

try:
    from .d1_client import query
except ImportError:
    from d1_client import query

# Prefer these task_type/mode pairs when multiple arms exist.
ARM_PREFERENCE: Sequence[tuple[str, str]] = (
    ("chat", "agent"),
    ("chat", "ask"),
    ("code", "agent"),
    ("intent_classification", "agent"),
    ("routing", "agent"),
    ("plan", "agent"),
    ("debug", "agent"),
    ("tool_use", "agent"),
    ("cms_theme_generation", "agent"),
    ("agent", "auto"),
    ("chat", "auto"),
    ("chat", "debug"),
    ("chat", "plan"),
)


def load_pricing_index() -> Dict[str, Dict[str, Any]]:
    """All active pricing rows keyed by model_key (latest effective_from wins)."""
    rows = query(
        """
        SELECT
          id,
          provider,
          model_key,
          input_rate_per_mtok,
          output_rate_per_mtok,
          cache_read_rate_per_mtok,
          supports_prompt_cache,
          routing_eligible,
          requires_owner_approval,
          long_ctx_threshold_tokens,
          is_active,
          effective_from
        FROM agentsam_model_pricing
        WHERE is_active = 1
          AND (effective_to IS NULL OR effective_to > datetime('now'))
        ORDER BY model_key, effective_from DESC
        """
    )
    index: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        mk = str(r.get("model_key") or "")
        if mk and mk not in index:
            index[mk] = dict(r)
    return index


def load_catalog_index() -> Dict[str, Dict[str, Any]]:
    rows = query(
        """
        SELECT
          id,
          model_key,
          provider,
          tier,
          avg_latency_p50_ms,
          avg_latency_p95_ms,
          quality_score,
          is_active,
          is_degraded,
          context_window,
          supports_tools,
          supports_streaming
        FROM agentsam_model_catalog
        WHERE is_active = 1
        """
    )
    return {str(r["model_key"]): dict(r) for r in rows if r.get("model_key")}


def load_arms_index(workspace_id: str) -> Dict[str, List[Dict[str, Any]]]:
    rows = query(
        """
        SELECT
          ra.model_key,
          ra.id,
          ra.task_type,
          ra.mode,
          ra.provider,
          ra.is_paused,
          ra.is_eligible,
          ra.budget_exhausted,
          ra.pause_reason,
          ra.total_executions
        FROM agentsam_routing_arms ra
        WHERE ra.workspace_id = ?
          AND ra.is_active = 1
        ORDER BY ra.model_key, ra.task_type, ra.mode
        """,
        [workspace_id],
    )
    index: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        mk = str(r.get("model_key") or "")
        if not mk:
            continue
        index.setdefault(mk, []).append(dict(r))
    return index


def load_active_models(*, picker_only: bool = False) -> List[Dict[str, Any]]:
    """All active agentsam_ai rows with mode=model."""
    where = "mode = 'model' AND status = 'active'"
    if picker_only:
        where += " AND picker_eligible = 1"
    rows = query(
        f"""
        SELECT
          id,
          model_key,
          provider,
          api_platform,
          show_in_picker,
          picker_eligible,
          supports_prompt_cache,
          input_rate_per_mtok,
          output_rate_per_mtok,
          size_class
        FROM agentsam_ai
        WHERE {where}
        ORDER BY provider, model_key
        """
    )
    return [dict(r) for r in rows]


def list_arms_for_model(workspace_id: str, model_key: str) -> List[Dict[str, Any]]:
    return [
        dict(r)
        for r in query(
            """
            SELECT
              ra.id,
              ra.task_type,
              ra.mode,
              ra.provider,
              ra.is_paused,
              ra.is_eligible,
              ra.budget_exhausted,
              ra.pause_reason,
              ra.total_executions
            FROM agentsam_routing_arms ra
            WHERE ra.workspace_id = ?
              AND ra.model_key = ?
              AND ra.is_active = 1
            ORDER BY ra.task_type, ra.mode
            """,
            [workspace_id, model_key],
        )
    ]


def pick_best_arm(
    workspace_id: str,
    model_key: str,
    arms: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    """Choose the best eligible, unpaused arm for benchmarking."""
    arms = arms if arms is not None else list_arms_for_model(workspace_id, model_key)
    if not arms:
        return None

    def score(arm: Dict[str, Any]) -> tuple:
        tt, md = arm.get("task_type", ""), arm.get("mode", "")
        pref = len(ARM_PREFERENCE)
        for i, pair in enumerate(ARM_PREFERENCE):
            if (tt, md) == pair:
                pref = i
                break
        blocked = 0
        if arm.get("is_paused"):
            blocked += 100
        if not arm.get("is_eligible"):
            blocked += 50
        if arm.get("budget_exhausted"):
            blocked += 25
        return (blocked, pref, tt, md)

    ranked = sorted(arms, key=score)
    for arm in ranked:
        if not arm.get("is_paused") and arm.get("is_eligible") and not arm.get("budget_exhausted"):
            return arm
    return ranked[0] if ranked else None


def probe_pricing(model_key: str) -> Optional[Dict[str, Any]]:
    rows = query(
        """
        SELECT
          id,
          provider,
          model_key,
          input_rate_per_mtok,
          output_rate_per_mtok,
          cache_read_rate_per_mtok,
          supports_prompt_cache,
          routing_eligible,
          requires_owner_approval,
          long_ctx_threshold_tokens,
          is_active
        FROM agentsam_model_pricing
        WHERE model_key = ?
          AND is_active = 1
          AND (effective_to IS NULL OR effective_to > datetime('now'))
        ORDER BY effective_from DESC
        LIMIT 1
        """,
        [model_key],
    )
    return dict(rows[0]) if rows else None


def probe_catalog(model_key: str) -> Optional[Dict[str, Any]]:
    rows = query(
        """
        SELECT
          id,
          model_key,
          provider,
          tier,
          avg_latency_p50_ms,
          avg_latency_p95_ms,
          quality_score,
          is_active,
          is_degraded,
          context_window,
          supports_tools,
          supports_streaming
        FROM agentsam_model_catalog
        WHERE model_key = ?
        LIMIT 1
        """,
        [model_key],
    )
    return dict(rows[0]) if rows else None


def probe_model_stack(
    workspace_id: str,
    model: Dict[str, Any],
    *,
    catalog_index: Optional[Dict[str, Dict[str, Any]]] = None,
    pricing_index: Optional[Dict[str, Dict[str, Any]]] = None,
    arms_index: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    """
    Full infrastructure probe for one agentsam_ai model.
    Returns issues[] codes for reporting gaps.
    Pass preloaded indexes from load_*_index() to avoid N+1 D1 round-trips.
    """
    model_key = model["model_key"]
    provider = model.get("provider") or ""
    issues: List[str] = []
    gaps: List[str] = []

    if catalog_index is not None:
        catalog = catalog_index.get(model_key)
    else:
        catalog = probe_catalog(model_key)

    if pricing_index is not None:
        pricing = pricing_index.get(model_key)
    else:
        pricing = probe_pricing(model_key)

    if arms_index is not None:
        arms = arms_index.get(model_key, [])
    else:
        arms = list_arms_for_model(workspace_id, model_key)

    best = pick_best_arm(workspace_id, model_key, arms)

    if not catalog:
        issues.append("MISSING_CATALOG")
        gaps.append("agentsam_model_catalog")
    elif not catalog.get("is_active"):
        issues.append("CATALOG_INACTIVE")
    else:
        if not catalog.get("avg_latency_p50_ms"):
            issues.append("CATALOG_NO_LATENCY_P50")
        if catalog.get("is_degraded"):
            issues.append("CATALOG_DEGRADED")

    if not pricing:
        issues.append("MISSING_PRICING")
        gaps.append("agentsam_model_pricing")
    else:
        if not pricing.get("input_rate_per_mtok") or not pricing.get("output_rate_per_mtok"):
            issues.append("PRICING_RATES_ZERO")
        if pricing.get("routing_eligible") == 0:
            issues.append("PRICING_NOT_ROUTING_ELIGIBLE")
        if pricing.get("requires_owner_approval"):
            issues.append("PRICING_REQUIRES_OWNER_APPROVAL")

    if not arms:
        issues.append("MISSING_ROUTING_ARM")
        gaps.append("agentsam_routing_arms")
    else:
        eligible = [a for a in arms if not a.get("is_paused") and a.get("is_eligible")]
        if not eligible:
            issues.append("NO_ELIGIBLE_ARM")
            if all(a.get("is_paused") for a in arms):
                issues.append("ALL_ARMS_PAUSED")
        if not best:
            issues.append("NO_BENCH_ARM")

    if best:
        if best.get("is_paused"):
            issues.append("BEST_ARM_PAUSED")
        if not best.get("is_eligible"):
            issues.append("BEST_ARM_INELIGIBLE")

    if catalog and pricing:
        cat_prov = (catalog.get("provider") or "").lower()
        pr_prov = (pricing.get("provider") or "").lower()
        ai_prov = provider.lower()
        if cat_prov and ai_prov and cat_prov != ai_prov and cat_prov not in ai_prov and ai_prov not in cat_prov:
            issues.append("PROVIDER_MISMATCH_AI_CATALOG")
        if pr_prov and ai_prov and pr_prov != ai_prov and "google" not in (pr_prov, ai_prov):
            if not (pr_prov.startswith("google") and ai_prov == "google"):
                issues.append("PROVIDER_MISMATCH_AI_PRICING")

    bench_ready = (
        catalog is not None
        and catalog.get("is_active")
        and pricing is not None
        and pricing.get("routing_eligible") != 0
        and not pricing.get("requires_owner_approval")
        and best is not None
        and not best.get("is_paused")
        and best.get("is_eligible")
        and not best.get("budget_exhausted")
    )

    return {
        "agentsam_ai_id": model["id"],
        "model_key": model_key,
        "provider": provider,
        "api_platform": model.get("api_platform"),
        "picker_eligible": model.get("picker_eligible"),
        "catalog": catalog,
        "pricing": pricing,
        "arms_count": len(arms),
        "best_arm": best,
        "issues": issues,
        "gaps": sorted(set(gaps)),
        "bench_ready": bench_ready,
    }
