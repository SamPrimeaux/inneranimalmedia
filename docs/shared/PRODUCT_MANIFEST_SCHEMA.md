# Product manifest schema

**Status:** Canonical · **Location:** `product-manifests/*.json` (repo root)

Machine-readable product and capability registry for agents, tooling, and future maturity dashboards.

---

## File location

```
product-manifests/
├── workspace.json
├── agent-sam.json
├── create.json
├── design-studio.json
├── draw.json
├── cms.json
├── images.json
├── movie-mode.json
├── database-explorer.json
└── terminal.json
```

Human summary: [../products/PRODUCT_REGISTRY.md](../products/PRODUCT_REGISTRY.md)

---

## Schema (v1)

```json
{
  "schema_version": 1,
  "id": "string",
  "name": "string",
  "classification": "workspace | independent_product | product_family | shared_capability",
  "family": "string | null",
  "stage": "concept | prototype | incubating | internal_alpha | product_alpha | public_beta | production | standalone | deprecated",
  "current_host": {
    "type": "workspace | worker | external_repo",
    "route": "string | null",
    "worker": "string | null"
  },
  "standalone_intent": true,
  "implementation": {
    "frontend": ["paths"],
    "backend": ["paths"],
    "migrations": ["paths or ids"],
    "docs": ["paths"]
  },
  "agent_sam": {
    "context_adapter": "file or null",
    "route_key": "string | null",
    "tool_profiles": ["strings"],
    "project_memory": true
  },
  "shared_capabilities": ["ids"],
  "known_gaps": ["strings"],
  "confidence": "verified | partial | planned | deprecated"
}
```

---

## Field rules

| Field | Rule |
|-------|------|
| `classification` | `workspace` only for Foundry; `product_family` for Create umbrella |
| `stage` | Evidence-based — see [PRODUCT_LIFECYCLE.md](../platform/PRODUCT_LIFECYCLE.md) |
| `confidence` | `verified` only when audit confirms working paths |
| `known_gaps` | Honest blockers — do not inflate maturity |

---

## Maintenance

Update manifest + `PRODUCT_REGISTRY.md` together when:

- stage changes
- routes move
- new APIs or docs become canonical
- blockers resolved or added

---

## Related

- [SHARED_CAPABILITIES.md](./SHARED_CAPABILITIES.md)
- [../platform/AUDIT_MULTI_PRODUCT_2026-07-09.md](../platform/AUDIT_MULTI_PRODUCT_2026-07-09.md)
