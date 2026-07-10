# PDR-0003 — Products graduate through explicit gates

**Status:** Accepted · **Date:** 2026-07-09 · **Scope:** Workspace

## Context

Products may eventually ship standalone. Graduation has been implicit.

## Decision

Graduation requires explicit documentation: registry stage update, deploy boundary, auth boundary, and workspace PDR when leaving Foundry-only assumptions.

## Consequences

- See [PRODUCT_LIFECYCLE.md](../../platform/PRODUCT_LIFECYCLE.md) graduation gates.
- `standalone_intent: true` in manifests is intent only — not automatic graduation.
