"""DAG helpers for Agentsam durable workflows."""

from __future__ import annotations

import re
from collections import deque


def sanitize_step_name(node_key: str, handler_key: str | None = None) -> str:
    base = handler_key or node_key or "node"
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", str(base))[:96]
    nk = re.sub(r"[^a-zA-Z0-9_]", "_", str(node_key or "node"))[:48]
    return f"node_{nk}_{safe}"[:120]


def topological_node_order(nodes: list[dict], edges: list[dict], entry_node_key: str | None = None) -> list[str]:
    node_keys = [str(n.get("node_key") or "") for n in nodes if n.get("node_key")]
    if not node_keys:
        return []

    in_degree = {k: 0 for k in node_keys}
    adjacency: dict[str, list[str]] = {k: [] for k in node_keys}

    for edge in edges or []:
        src = str(edge.get("from_node_key") or "")
        dst = str(edge.get("to_node_key") or "")
        if src in adjacency and dst in in_degree and src != dst:
            adjacency[src].append(dst)
            in_degree[dst] += 1

    queue: deque[str] = deque()
    if entry_node_key and entry_node_key in in_degree:
        queue.append(entry_node_key)
    else:
        for key in node_keys:
            if in_degree[key] == 0:
                queue.append(key)

    order: list[str] = []
    seen: set[str] = set()
    while queue:
        key = queue.popleft()
        if key in seen:
            continue
        seen.add(key)
        order.append(key)
        for nxt in adjacency.get(key, []):
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                queue.append(nxt)

    for key in node_keys:
        if key not in seen:
            order.append(key)

    return order
