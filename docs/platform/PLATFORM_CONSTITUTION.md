# Inner Animal Media — Platform Constitution

**Status:** Accepted · **Scope:** Entire IAM platform · **Audience:** Humans and AI agents

This document is the **first** thing to read before planning, designing, or changing anything in this repository.

Operational runbooks, runtime maps, and deploy commands live elsewhere. This document answers a different question:

> **What is Inner Animal Media, and what must never be confused?**

---

## Mission

Inner Animal Media is a **product platform**.

It is not a dashboard application.

It is not Agent Sam.

It is not Design Studio, CMS, or Movie Mode.

It is the shared foundation on which **multiple independent products** are conceived, incubated, matured, and shipped.

---

## The four layers

Every contributor — human or agent — must hold this hierarchy in mind:

```
Inner Animal Media Platform
├── Shared Infrastructure
│   └── Auth, billing, Workers, D1, R2, Hyperdrive, MCP plumbing, model routing, telemetry, deploy
├── Workspace (Foundry)
│   └── Private environment where products are incubated, operated, and debugged (`/dashboard/*`)
├── Agent Sam
│   └── Branded intelligence and execution layer inherited by Workspace and products
└── Products
    ├── Agent Sam (as external/SDK product surfaces)
    ├── Create family (Draw, Design Studio, Sam Sketch)
    ├── CMS
    ├── Movie Mode
    └── … (see Product Registry)
```

**Infrastructure is shared. Products are independent. Agent Sam is the execution platform they inherit.**

---

## Canonical doctrine

> The Workspace is where products are incubated and operated. Agent Sam is the intelligence and execution platform they inherit. Each product remains an independent surface capable of graduating into production.

> Development topology is not product topology.

> A route under `/dashboard/*` does not automatically represent a dashboard feature. It may be the current incubation route for an independent product.

> Products are independent. Infrastructure is shared.

> The Workspace may wrap a product, but it must not reshape the product.

---

## Legacy three-layer summary (deprecated wording)

The following older framing is subsumed by the four-layer model above:

```
Platform → Workspace → Products + Shared Infrastructure
```

Agent Sam is no longer implied as "just another product route." It is both **runtime infra** and **branded product** (SDK, MCP, embedded agents).

---

## Workspace (Foundry)

The **Workspace** — also called the **Foundry** — exists solely for developers and operators.

It is an incubator:

- Products are **born** here.
- Products **mature** here.
- Products **graduate** from here.

The current host is the Vite SPA under `dashboard/`, served at `/dashboard/*`. That route prefix describes **where development happens**, not **what the products are**.

### Workspace rules

| Rule | Meaning |
|------|---------|
| Developer-first | Workspace UX optimizes builder productivity, not final customer UX |
| Non-binding constraints | Workspace layout must never dictate a product's eventual experience |
| Factory, not product | The Workspace is where products are forged — not the product customers buy |

**Terminology:** Prefer **Workspace** or **Foundry** over **dashboard** in internal docs and agent context. "Dashboard" describes a UI shell, not the platform's purpose.

---

## Products

Every product has its **own identity**, constitution, principles, and roadmap.

Examples (non-exhaustive):

| Product | Role |
|---------|------|
| **Agent Sam** | Shared agent intelligence and execution layer |
| **Design Studio** | 3D preview, CAD jobs, creative build surface |
| **CMS** | Content management and site publishing |
| **Movie Mode** | Media production and rendering workflows |
| **Terminal** | Agent execution surface and remote command lane |
| **Database Explorer** | Schema inspection and data tooling |

Products may eventually ship as **completely independent experiences** — separate domains, apps, or repos.

Do not force shared UX, shared navigation, or shared product metaphors simply because products currently coexist under `/dashboard/*`.

Each product is its **own company inside the company**.

Product-specific truth belongs in `docs/products/<product>/` (constitutions, vision, PDRs) — not in this file.

---

## Infrastructure

Shared platform capabilities serve all products. Products own everything else: UX, workflows, domain models, customer promises, and standalone deployment topology.

**Shared:**

- Authentication and identity resolution
- Billing and entitlements (where applicable)
- Cloudflare Workers, D1, R2, KV, Vectorize
- Hyperdrive / Supabase agent schema
- MCP server (`mcp.inneranimalmedia.com`) — separate repo
- Model catalog and routing (`agentsam_model_catalog`, `agentsam_routing_arms`)
- Tool catalog and workflow registry (`agentsam_tools`, `agentsam_workflows`)
- Permissions and policy (`agentsam_user_policy`, OAuth allowlists)
- Telemetry, retention, deployment pipelines

**Product-owned:**

- Page layout and navigation for the product's users
- Product-specific APIs and handlers beyond shared infra
- Product PDRs, roadmaps, and customer-facing copy
- Extraction readiness and standalone ship criteria

Runtime and binding details: [`iam-runtime-architecture-2026-06.md`](./iam-runtime-architecture-2026-06.md) · [`worker-env-production-2026-06.md`](./worker-env-production-2026-06.md)

---

## Product lifecycle

Products move through explicit maturity stages. Current route location is **not** a maturity indicator.

```
Idea
  ↓
Prototype
  ↓
Workspace Tool        ← visible under /dashboard/* or adjacent routes
  ↓
Internal Alpha
  ↓
Product Alpha
  ↓
Production
  ↓
Standalone Product    ← may leave the Workspace shell entirely
```

The Workspace is the **factory**. Products are the **output**.

**Never confuse the factory with the products.**

---

## Critical interpretation rules

These rules prevent the most common agent and contributor mistakes.

### 1. Development topology is not product topology

A feature at `/dashboard/designstudio` is not "a dashboard page." It is the current incubation surface for the **Design Studio** product.

A feature at `/dashboard/cms` is not required to share Design Studio's workflow, layout, or identity.

### 2. Do not infer product identity from directory or route alone

Inspect product documentation and registry entries before assuming scope, UX constraints, or shared behavior.

### 3. Two repos, one platform

| Repo | Role |
|------|------|
| `inneranimalmedia` (this repo) | Main worker, Workspace host, product incubation |
| `inneranimalmedia-mcp-server` | External MCP OAuth surface |

Never mix deploy commands, identity assumptions, or product scope across repos.

### 4. Memory ≠ documentation

| Kind | Use for | Examples |
|------|---------|----------|
| **Memory** | Ephemeral preferences and session context | "Sam prefers dark mode", "use SSH git" |
| **Documentation** | Durable principles and product truth | "Design Studio is project-first", "CMS owns federated site hub" |

Agents must not use memory to substitute for missing product or platform documentation. If doctrine is missing, write or update the doc — do not guess.

### 5. Git is canonical; R2 and vector indexes are mirrors

Version-controlled Markdown in this repository is the **source of truth** for platform and product doctrine.

R2 and AutoRAG/vector indexes are discovery and distribution layers. Agents may search them for context but must **cite and obey** git-tracked docs when they conflict.

D1 `agentsam_rules_document` holds **runtime-enforced** platform law. Docs and D1 should align; when they diverge during migration, prefer explicit PDRs to resolve the conflict.

---

## Required reading order (every session)

Before proposing architecture, redesigning a surface, or changing product code:

```
0. AGENTS.md (repo root)          ← engineering laws (all tools) · D1 rule_platform_lockdown_engineering_law
        ↓
1. Platform Constitution          ← you are here
        ↓
2. [`docs/workspace/WORKSPACE_CONSTITUTION.md`](../workspace/WORKSPACE_CONSTITUTION.md)
        ↓
3. [`docs/products/PRODUCT_REGISTRY.md`](../products/PRODUCT_REGISTRY.md)
        ↓
4. [`docs/shared/AGENT_RUNTIME.md`](../shared/AGENT_RUNTIME.md) (when touching agent behavior)
        ↓
5. Chosen product README + `PRODUCT_PRINCIPLES.md` + `AGENTSAM.md`
        ↓
5. Applicable PDRs                  docs/platform/decisions/ · docs/products/*/decisions/
        ↓
6. Product roadmap (if any)         docs/products/<product>/ROADMAP.md
        ↓
7. Current task
        ↓
8. Code
```

**Wrong order (do not do this):**

```
Task → Code → Guess → Re-explain in chat
```

Steps 2–6 may be stubs while the knowledge operating system is built. If a doc is missing, state that explicitly and avoid inventing product identity.

---

## Documentation maintenance contract

Documentation changes are part of product changes. A task is not complete when code and canonical documentation disagree.

| When you… | Update… |
|-----------|---------|
| Establish a durable platform principle | Platform PDR in `docs/platform/decisions/` |
| Change product purpose or scope | Product constitution or `VISION.md` |
| Change runtime architecture | `docs/platform/` architecture docs |
| Change deploy or ops behavior | Root `README.md` operational sections |
| Change product maturity or route | `docs/products/PRODUCT_REGISTRY.md` and `iam.products.json` |
| Supersede an earlier decision | Mark old PDR **Superseded** — do not silently rewrite history |

---

## Relationship to Cursor rules and D1

| Layer | Location | Purpose |
|-------|----------|---------|
| **Platform Constitution** | This file | Product vs platform vs workspace identity |
| **Cursor rules** | `.cursor/rules/*.mdc` | Ship gates, identity locks, operational guardrails |
| **D1 rules** | `agentsam_rules_document` | Runtime-enforced agent behavior |
| **Operational docs** | `docs/platform/*`, root `README.md` | How to run, deploy, debug |

Cursor rules tell agents **how to ship safely**. This constitution tells agents **what they are building**.

Both are required. Neither replaces the other.

---

## What comes next (planned structure)

This constitution enables a documentation hierarchy. Sibling and child docs will be added incrementally:

```
docs/
├── platform/
│   ├── PLATFORM_CONSTITUTION.md     ← this file
│   ├── PLATFORM_PRINCIPLES.md
│   ├── PRODUCT_LIFECYCLE.md
│   ├── AUDIT_MULTI_PRODUCT_2026-07-09.md
│   └── decisions/
├── workspace/
│   └── WORKSPACE_CONSTITUTION.md
├── products/
│   ├── PRODUCT_REGISTRY.md
│   └── <product>/
├── shared/
│   ├── AGENT_RUNTIME.md
│   └── SHARED_CAPABILITIES.md
└── …

product-manifests/                   ← machine-readable (repo root)
```

Product constitutions are written **per product**, after this platform layer exists.

---

## Summary

| Concept | One line |
|---------|----------|
| **Platform** | Shared infra + multi-product mission |
| **Workspace / Foundry** | Internal incubator — not the customer product |
| **Product** | Independent identity; may graduate to standalone |
| **Infrastructure** | Shared across products |
| **Reading order** | Platform → Workspace → Product → PDRs → Task → Code |
| **Memory** | Preferences · **Documentation** | Principles |

---

*When platform identity or the product/incubator model changes, update this file and add a platform PDR in the same change set.*
