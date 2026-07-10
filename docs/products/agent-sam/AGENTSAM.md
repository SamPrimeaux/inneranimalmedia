# Agent Sam — platform compass

**Status:** Canonical for Agent Sam product scope  
**Scope:** Platform-level agent behavior — not product-specific Create/CMS rules

---

## What Agent Sam is

The branded intelligence and execution layer for Inner Animal Media:

- Runtime spine (`/api/agent/chat`)
- Model routing and mode profiles
- Tool catalog execution
- MCP, SDK, terminal, scaffold
- Embedded agents on product routes

## What Agent Sam is not

- The Workspace (`/dashboard/*` shell)
- The entire Inner Animal Media platform
- Only the chat page at `/dashboard/agent`

---

## Default agent entry for Create/CAD

```txt
illustration_create
  schema: iam.illustration.v1
  engine: auto | excalidraw | openscad | freecad | blender | meshy
```

Product-specific Create rules: [../create/AGENTSAM.md](../create/AGENTSAM.md), [../design-studio/AGENTSAM.md](../design-studio/AGENTSAM.md)

---

## Runtime contract sync

Project-scoped instructions: `AGENTSAM.md` → `agentsam_rules_document`  
See [../../platform/project-runtime-contracts.md](../../platform/project-runtime-contracts.md)

---

## Ship and identity

Operational locks: `.cursor/rules/iam-core.mdc` — not duplicated here.

---

## Related

- [../../shared/AGENT_RUNTIME.md](../../shared/AGENT_RUNTIME.md)
- [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md)
