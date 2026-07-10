# Platform principles

**Status:** Accepted · **Parent:** [PLATFORM_CONSTITUTION.md](./PLATFORM_CONSTITUTION.md)

Operational principles for the Inner Animal Media **platform layer** (shared infrastructure). Product-specific principles live under `docs/products/`.

---

## Principles

### 1. Infrastructure is shared; products are independent

Auth, Workers, D1, R2, Hyperdrive, MCP plumbing, model catalog, and deployment pipelines serve all products. Products own UX, customer promise, and graduation criteria.

### 2. D1 is control-plane truth for runtime registry

Workflow keys, tools, handlers, routing arms, and OAuth catalogs live in `agentsam_*` tables. Missing config → idempotent migrations — not JS fallbacks.

### 3. Two database lanes, no mixing

- **D1:** `env.DB` — control plane, CMS registry, agent catalog
- **Hyperdrive / Supabase:** `agentsam` schema — agent memory, vectors, telemetry mirrors

Never route Postgres queries through the D1 binding.

### 4. Two Workers, one catalog

| Worker | URL | Role |
|--------|-----|------|
| Main | `inneranimalmedia.com` | Workspace host, in-app Agent Sam, product APIs |
| MCP | `mcp.inneranimalmedia.com` | External OAuth clients (separate repo) |

Same `agentsam_tools` catalog; different credential and dispatch surfaces.

### 5. Identity is never hardcoded in hot paths

Resolve `user_id`, `workspace_id`, `tenant_id` from session, token, or D1 auth rows. Superadmin platform credentials vs BYOK per user.

### 6. Git is canonical for doctrine; D1 for runtime law

Version-controlled Markdown in this repo is the source of truth for product and platform **principles**. `agentsam_rules_document` holds **runtime-enforced** agent behavior. Align both; resolve conflicts with PDRs.

### 7. Ship gate

Production ship: `npm run deploy:full` from repo root. Worker-only deploy does not update dashboard R2 bundles or PWA assets.

### 8. Documentation maintenance is part of shipping

Code changes that alter product identity, maturity, or architecture must update registry, manifests, and relevant PDRs in the same change set.

---

## Related

- [PRODUCT_LIFECYCLE.md](./PRODUCT_LIFECYCLE.md)
- [iam-runtime-architecture-2026-06.md](./iam-runtime-architecture-2026-06.md)
- [worker-env-production-2026-06.md](./worker-env-production-2026-06.md)
- [decisions/](./decisions/)
