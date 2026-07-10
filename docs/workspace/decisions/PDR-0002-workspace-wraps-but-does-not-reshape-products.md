# PDR-0002 — Workspace wraps but does not reshape products

**Status:** Accepted · **Date:** 2026-07-09 · **Scope:** Workspace

## Context

Shared shell (sidebar, Agent Sam panel, auth) can pressure products toward a single generic UX.

## Decision

The Workspace may wrap products in shared infrastructure chrome. It must not require products to inherit Workspace navigation, layout metaphors, or identity as their customer-facing design.

## Consequences

- CMS may use Shopify-like editor chrome distinct from Design Studio.
- Movie Mode may use mobile-first nav distinct from Code family.
- Shared React components are utilities, not product identity contracts.
