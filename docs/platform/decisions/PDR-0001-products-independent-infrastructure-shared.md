# PDR-0001 — Products independent, infrastructure shared

**Status:** Accepted  
**Date:** 2026-07-09  
**Scope:** Platform

## Context

Multiple product surfaces (Agent Sam, Design Studio, CMS, Movie Mode, Create lanes) share Cloudflare Workers, D1, R2, auth, and Agent Sam runtime. Contributors and AI agents have treated shared `/dashboard/*` hosting as evidence that surfaces are features of one application.

## Decision

- **Infrastructure is shared** across all products.
- **Products are independent** — each owns product identity, UX intent, data boundaries, and graduation path.
- Shared components must not erase product identity.

## Consequences

- Product-specific docs live under `docs/products/<id>/`.
- Registry and manifests declare classification per surface.
- Cross-product UX similarity is optional, never required by platform hosting.

## Supersedes

Nothing. Establishes baseline platform doctrine.
