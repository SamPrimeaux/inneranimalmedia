# Product lifecycle

**Status:** Accepted · **Parent:** [PLATFORM_CONSTITUTION.md](./PLATFORM_CONSTITUTION.md)

Defines how products move from idea to standalone production. **Incubation route ≠ maturity stage.**

---

## Stages

| Stage | Description | Typical signals |
|-------|-------------|-----------------|
| `concept` | Named intent; little or no code | Docs, mockups only |
| `prototype` | Experimental UI or API | Route exists; incomplete backend |
| `incubating` | Active development inside Workspace | `/dashboard/*` host; product docs |
| `internal_alpha` | End-to-end works for operators | Dogfooded by IAM team |
| `product_alpha` | Selected external testers | Separate onboarding possible |
| `public_beta` | Customer-facing with caveats | Billing or signup may apply |
| `production` | General availability | SLA expectations |
| `standalone` | Independent deploy topology | Own domain/app/repo boundary |
| `deprecated` | No new investment | Migration path documented |

---

## Graduation

**Graduation** is the process by which an incubating product becomes independently deployable and customer-facing.

### Graduation gates (explicit — not automatic)

1. **Product constitution** — `PRODUCT_PRINCIPLES.md`, `VISION.md` (when applicable)
2. **Standalone deploy path** — documented worker/domain/binding boundary
3. **Auth boundary** — product can authenticate without Workspace-only assumptions
4. **Agent contract** — `AGENTSAM.md` + route context stable for product surface
5. **Registry update** — `PRODUCT_REGISTRY.md` + `product-manifests/*.json` stage change
6. **PDR** — workspace decision when leaving Foundry shell

Products may remain in `production` while still hosted under `/dashboard/*` if standalone topology is not yet required.

---

## Workspace vs product maturity

| Concept | Question it answers |
|---------|-------------------|
| **Incubation route** | Where is it developed today? (e.g. `/dashboard/cms`) |
| **Lifecycle stage** | How mature is the product? (e.g. `incubating`) |
| **Standalone intent** | Will it eventually leave the Foundry? (boolean) |

A product can be `incubating` with `standalone_intent: true` for years. Do not conflate route prefix with lifecycle.

---

## Maintenance

When maturity changes:

1. Update `docs/products/PRODUCT_REGISTRY.md`
2. Update `product-manifests/<id>.json` → `stage`
3. Add platform or workspace PDR if the change establishes durable policy

---

## Related

- [../workspace/decisions/PDR-0003-products-graduate-through-explicit-gates.md](../workspace/decisions/PDR-0003-products-graduate-through-explicit-gates.md)
- [../products/PRODUCT_REGISTRY.md](../products/PRODUCT_REGISTRY.md)
