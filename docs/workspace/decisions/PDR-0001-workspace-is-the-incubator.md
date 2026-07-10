# PDR-0001 — Workspace is the incubator

**Status:** Accepted · **Date:** 2026-07-09 · **Scope:** Workspace

## Context

Independent products are hosted under `/dashboard/*` for private access, shared authentication, and rapid iteration. This has caused confusion between the Foundry and the products inside it.

## Decision

The Inner Animal Media Workspace is an internal environment used to build, operate, debug, and mature products. Presence inside the Workspace does not make a surface a "Workspace feature."

## Consequences

- Product constitutions define customer experience; Workspace constitution defines incubator rules.
- `/dashboard/*` routes are **incubation routes** until graduation PDR says otherwise.
