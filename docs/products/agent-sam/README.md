# Agent Sam

**Classification:** Independent product + shared runtime  
**Stage:** `incubating` (in-app) / `internal_alpha` (MCP infra) / `development` (SDK)  
**Manifest:** [`product-manifests/agent-sam.json`](../../product-manifests/agent-sam.json)

Agent Sam is the **branded intelligence and execution layer** of Inner Animal Media.

> Agent Sam is **not** synonymous with `/dashboard/agent`, the Workspace, or the entire platform.

---

## Surfaces

| Surface | Entry | Doc |
|---------|-------|-----|
| Workspace agent | `/dashboard/agent` | [SURFACES.md](./SURFACES.md) |
| Embedded product agents | Side panel on CMS, Design Studio, etc. | [SURFACES.md](./SURFACES.md) |
| MCP Connect | `mcp.inneranimalmedia.com` | [SDK_AND_MCP.md](./SDK_AND_MCP.md) |
| SDK + CLI | `/api/sdk/*`, `@inneranimalmedia/agentsam-sdk` | [SDK_AND_MCP.md](./SDK_AND_MCP.md) |
| Scaffold engine | `POST /api/sdk/scaffold` | [SDK_AND_MCP.md](./SDK_AND_MCP.md) |

---

## Runtime inheritance

All products inherit: [../../shared/AGENT_RUNTIME.md](../../shared/AGENT_RUNTIME.md)

Product-specific agent behavior: [AGENTSAM.md](./AGENTSAM.md) + per-product `AGENTSAM.md` files.

---

## Principles

[PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md)

---

## Decisions

- [decisions/PDR-0001-agent-sam-is-runtime-and-product.md](./decisions/PDR-0001-agent-sam-is-runtime-and-product.md)
- [decisions/PDR-0002-products-inherit-one-runtime.md](./decisions/PDR-0002-products-inherit-one-runtime.md)
- [decisions/PDR-0003-sdk-is-a-primary-distribution-surface.md](./decisions/PDR-0003-sdk-is-a-primary-distribution-surface.md)

---

## Legacy / operational docs

- Root README — runtime contract, P0 gaps
- `docs/platform/iam-runtime-architecture-2026-06.md`
- `docs/platform/agents-sdk-2026-06-adoption.md` — CF Agents SDK (implementation technology)
- `.cursor/rules/iam-core.mdc` — ship gates (not product identity)
