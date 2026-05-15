"""D1 workflow registry governance helpers for smoke/matrix scripts."""

from __future__ import annotations

AUTOMATED_KEY_MARKERS = ("_test", "_smoke", "_matrix", "_pinstest")


def assert_automated_workflow_key(workflow_key: str, *, automated: bool = True, allow_canonical: bool = False) -> None:
    if not automated or allow_canonical:
        return
    key = (workflow_key or "").strip()
    if not key:
        raise ValueError("workflow_key is required for automated workflow registration")
    if not any(m in key for m in AUTOMATED_KEY_MARKERS):
        raise ValueError(
            f"automated workflow_key must include one of {AUTOMATED_KEY_MARKERS!r} (got: {key!r})"
        )


def workflow_isolation_tier(tenant_id: str | None, workspace_id: str | None) -> str:
    tid = (tenant_id or "").strip()
    wid = (workspace_id or "").strip()
    if not tid and not wid:
        return "platform_global"
    if tid and not wid:
        return "tenant"
    return "workspace"
