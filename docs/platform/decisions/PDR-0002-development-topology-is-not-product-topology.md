# PDR-0002 — Development topology is not product topology

**Status:** Accepted  
**Date:** 2026-07-09  
**Scope:** Platform

## Context

Products are developed under `/dashboard/*` inside the `dashboard/` Vite SPA. Route and folder placement reflects **incubation convenience**, not final customer topology.

## Decision

- A route under `/dashboard/*` does **not** define final product identity, navigation, or deployment.
- Agents and contributors must consult `PRODUCT_REGISTRY.md` and product constitutions before inferring scope from paths.
- The `dashboard/` directory name remains the implementation folder for the Workspace; documents use **Workspace** or **Foundry** for conceptual references.

## Consequences

- README and constitutions include explicit route → product mapping tables.
- Product manifests record `current_host.route` separately from `standalone_intent`.
- Route migrations are product graduation work — not assumed in incubation docs.

## Supersedes

Nothing.
