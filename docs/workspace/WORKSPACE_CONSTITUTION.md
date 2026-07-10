# Workspace constitution

**Status:** Accepted · **Scope:** Inner Animal Media Foundry · **Route:** `/dashboard/*` · **Code:** `dashboard/`

---

## Definition

The **Workspace** (also **Foundry**) is the private Cursor-like development and operations environment where products are **incubated**, **tested**, **debugged**, **operated**, and **matured**.

It is **not** a customer product.

The implementation folder is `dashboard/`; the route prefix is `/dashboard/*`. Documents use **Workspace** or **Foundry** for product meaning. "Dashboard" is acceptable when referring to the route or folder name explicitly.

---

## Purpose

| Function | Description |
|----------|-------------|
| **Incubator** | Host product UIs before standalone graduation |
| **Operator cockpit** | Sam's environment for running IAM and client work |
| **Integration shell** | Shared auth, nav, Agent Sam side panel, projects |
| **Debug surface** | Analytics, database explorer, terminal, workflows |

---

## Rules

### 1. Developer-first

Workspace UX optimizes **builder productivity**, not final customer UX for incubating products.

### 2. Non-binding layout

Workspace navigation (Code / Create / Collaborate families in `shellNav.ts`) is **organizational**, not product taxonomy. Do not sell "Create" as a SKU — sell Design Studio, CMS, Movie Mode.

### 3. Wrap, do not reshape

The Workspace may wrap a product in shared chrome (sidebar, Agent Sam panel, auth). It must **not** force products to share navigation, workflow, or identity.

### 4. Factory, not output

Products are forged in the Foundry and may graduate. The Foundry is not what customers buy.

### 5. Projects are cross-product containers

`/dashboard/projects/:id` scopes chat, files, and memory across Create lanes and other work — not a product itself.

---

## What the Workspace is not

- Not synonymous with Agent Sam (Agent Sam is the intelligence layer)
- Not synonymous with any single product route
- Not the final deployment topology for graduated products

---

## Required reading

1. [PLATFORM_CONSTITUTION.md](../platform/PLATFORM_CONSTITUTION.md)
2. This document
3. [WORKSPACE_ARCHITECTURE.md](./WORKSPACE_ARCHITECTURE.md)
4. [../products/PRODUCT_REGISTRY.md](../products/PRODUCT_REGISTRY.md)

---

## Related PDRs

- [decisions/PDR-0001-workspace-is-the-incubator.md](./decisions/PDR-0001-workspace-is-the-incubator.md)
- [decisions/PDR-0002-workspace-wraps-but-does-not-reshape-products.md](./decisions/PDR-0002-workspace-wraps-but-does-not-reshape-products.md)
- [decisions/PDR-0003-products-graduate-through-explicit-gates.md](./decisions/PDR-0003-products-graduate-through-explicit-gates.md)
